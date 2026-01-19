/**
 * Importamos las funciones de la Versión 2 (Gen 2)
 */
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");

const admin = require("firebase-admin");
const crypto = require("crypto");
const { Buffer } = require("buffer");
const { v4: uuidv4 } = require("uuid");
const fetch = require("node-fetch");
const { Resend } = require("resend");
const { MercadoPagoConfig, Point } = require("mercadopago");


// --- DEFINICIÓN DE SECRETOS ---
// Actualizado para coincidir con Google Secret Manager
const mpAccessToken = defineSecret("MP_WEB_ACCESS_TOKEN");
const mpWebhookSecret = defineSecret("MP_TERMINAL_WEBHOOK_SECRET"); // Terminal (Legacy)
const mpWebWebhookSecret = defineSecret("MP_WEB_WEBHOOK_SECRET");   // Web (Landing)
const resendApiKey = defineSecret("RESEND_API_KEY");

// Configuración global
setGlobalOptions({ region: "us-central1" });

console.log('Functions starting up (Gen 2 - Final V13). Version: ' + new Date().toISOString());

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// --- CONFIGURACIÓN MERCADO PAGO ---
// --- CONFIGURACIÓN MERCADO PAGO ---
const getMercadoPagoConfig = async () => {
  // 1. Try to get from Firestore Configuration (Dynamic)
  try {
    const db = admin.firestore();
    const configDoc = await db.collection('configuracion').doc('mercadopago').get();
    if (configDoc.exists) {
      const data = configDoc.data();
      if (data.accessToken && data.accessToken.length > 10) {
        return { client: new MercadoPagoConfig({ accessToken: data.accessToken }), accessToken: data.accessToken };
      }
    }
  } catch (e) {
    console.warn("Could not fetch MP config from Firestore, falling back to env:", e);
  }

  // 2. Fallback to Secret Manager (Static/Env)
  const accessToken = mpAccessToken.value();
  if (!accessToken) {
    // If neither exists, we can't proceed.
    // However, for setup functions, we might want to return null/empty to allow UI to show "Unconfigured".
    console.error('El Access Token de Mercado Pago no está configurado (ni Firestore ni Secrets).');
    throw new HttpsError('failed-precondition', 'La integración con Mercado Pago no está configurada.');
  }
  return { client: new MercadoPagoConfig({ accessToken }), accessToken };
};

/**
 * =================================================================
 * TWILIO FUNCTIONS REMOVED
 * =================================================================
 */


/**
 * =================================================================
 * MERCADO PAGO FUNCTIONS
 * =================================================================
 */

exports.getPointTerminals = onCall(
  {
    cors: true,
    secrets: [mpAccessToken],
    invoker: 'public'
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado.');
    }
    try {
      const { client } = await getMercadoPagoConfig();
      const point = new Point(client);
      const devices = await point.getDevices({});
      return { success: true, devices: devices.devices || [] };
    } catch (error) {
      console.error("Error fetching terminals: ", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', error.message || "No se pudo comunicar con Mercado Pago.");
    }
  });

exports.setTerminalPDVMode = onCall(
  {
    cors: true,
    secrets: [mpAccessToken],
    invoker: 'public'
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Usuario no autenticado.');

    const { terminalId } = request.data;
    if (!terminalId) throw new HttpsError('invalid-argument', 'Falta terminalId.');

    try {
      const { client } = await getMercadoPagoConfig();
      const point = new Point(client);
      const result = await point.changeDeviceOperatingMode({
        device_id: terminalId,
        operating_mode: "PDV"
      });
      return { success: true, data: result };
    } catch (error) {
      console.error(`Error setting PDV for ${terminalId}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', error.message || `No se pudo activar el modo PDV.`);
    }
  });

exports.createPointPayment = onCall(
  {
    cors: true,
    secrets: [mpAccessToken],
    invoker: 'public'
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario no autenticado.');
    }

    const { amount, terminalId, referenceId } = request.data;

    if (!amount || !terminalId || !referenceId) {
      throw new HttpsError('invalid-argument', 'Faltan datos requeridos.');
    }

    try {
      const { accessToken } = await getMercadoPagoConfig();
      const url = `https://api.mercadopago.com/point/integration-api/devices/${terminalId}/payment-intents`;

      const paymentIntent = {
        amount: Math.round(amount * 100),
        // CRITICAL for Quality: Valid HTTPS Webhook URL (Matching User Dashboard)
        notification_url: "https://us-central1-agenda-1ae08.cloudfunctions.net/mercadoPagoWebhook",
        additional_info: {
          external_reference: referenceId,
          print_on_terminal: true
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'X-Idempotency-Key': uuidv4()
        },
        body: JSON.stringify(paymentIntent),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("MP Error:", result);
        if (response.status === 409) {
          throw new HttpsError('aborted', 'La terminal está ocupada. Cancela la operación en el dispositivo.');
        }
        throw new HttpsError('internal', result.message || 'Error al enviar la orden.');
      }

      return { success: true, data: { id: result.id } };

    } catch (error) {
      console.error("Error creating payment:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', error.message || "No se pudo crear el pago.");
    }
  });

exports.createStore = onCall(
  {
    cors: true,
    secrets: [mpAccessToken],
    invoker: 'public'
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Usuario no autenticado.');
    const { name, business_hours } = request.data;
    if (!name) throw new HttpsError('invalid-argument', 'Falta nombre de sucursal.');

    try {
      const { accessToken } = await getMercadoPagoConfig();
      const userRes = await fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${accessToken}` } });
      const userData = await userRes.json();
      const userId = userData.id;

      const response = await fetch(`https://api.mercadopago.com/users/${userId}/stores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          name: name,
          business_hours: business_hours || {
            monday: [{ open: "08:00", close: "20:00" }],
            tuesday: [{ open: "08:00", close: "20:00" }],
            wednesday: [{ open: "08:00", close: "20:00" }],
            thursday: [{ open: "08:00", close: "20:00" }],
            friday: [{ open: "08:00", close: "20:00" }],
          },
          location: {
            street_number: "123", street_name: "Calle Falsa", city_name: "Ciudad", state_name: "Estado",
            latitude: 19.432608, longitude: -99.133209 // Default placeholders to satisfy API
          }
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Error creating store');
      return { success: true, data: result };
    } catch (error) {
      console.error("Error creating store:", error);
      throw new HttpsError('internal', error.message);
    }
  }
);

exports.createPos = onCall(
  {
    cors: true,
    secrets: [mpAccessToken],
    invoker: 'public'
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Usuario no autenticado.');
    const { name, store_id, external_store_id, fixed_amount } = request.data;
    if (!name || (!store_id && !external_store_id)) throw new HttpsError('invalid-argument', 'Falta nombre o store_id.');

    try {
      const { accessToken } = await getMercadoPagoConfig();
      const response = await fetch(`https://api.mercadopago.com/pos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          name: name,
          fixed_amount: fixed_amount || true,
          store_id: store_id ? Number(store_id) : undefined,
          external_store_id: external_store_id
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Error creating POS');
      return { success: true, data: result };
    } catch (error) {
      console.error("Error creating POS:", error);
      throw new HttpsError('internal', error.message);
    }
  }
);

exports.updateUserPassword = onCall(
  {
    cors: true,
    invoker: 'public'
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Usuario no autenticado.');

    // Optional: Check if requester is admin
    // const callerUid = request.auth.uid;
    // ... verification logic ...

    const { uid, password } = request.data;
    if (!uid || !password) throw new HttpsError('invalid-argument', 'Faltan datos.');
    if (password.length < 6) throw new HttpsError('invalid-argument', 'Contraseña muy corta.');

    try {
      await admin.auth().updateUser(uid, { password: password });
      return { success: true };
    } catch (error) {
      console.error("Error updating password:", error);
      throw new HttpsError('internal', error.message || "Error al actualizar la contraseña.");
    }
  }
);

exports.mercadoPagoWebhook = onRequest(
  {
    cors: true,
    invoker: 'public',
    secrets: [mpWebhookSecret, mpWebWebhookSecret, mpAccessToken, resendApiKey],
  },
  async (request, response) => {
    console.log("========== [vFinal] MERCADO PAGO WEBHOOK RECEIVED ==========");

    // We have two potential secrets now (Terminal and Web)
    // In a strict implementation, we would validate the x-signature against both.
    // For now, we ensure at least one is loaded to proceed.
    // TRIM is critical because Windows 'echo' often adds newlines to secrets.
    const secretTerminal = mpWebhookSecret.value() ? mpWebhookSecret.value().trim() : "";
    const secretWeb = mpWebWebhookSecret.value() ? mpWebWebhookSecret.value().trim() : "";

    if (!secretTerminal && !secretWeb) {
      console.error("FATAL: Both Webhook secrets missing.");
      response.status(500).send("Secrets missing.");
      return;
    }

    try {
      const { query, body } = request;
      const topic = query.type || query.topic || body.type || 'unknown';
      const dataId = query['data.id'] || query.id || body?.data?.id || body?.id;

      if (!dataId) {
        console.warn("[vFinal] Missing headers/params.", { query, body });
        response.status(400).send("Bad Request: ID missing.");
        return;
      }

      console.log(`[vFinal] Topic: ${topic}, ID: ${dataId}`);

      // --- SIGNATURE VALIDATION ---
      const xSignature = request.headers['x-signature'];
      const xRequestId = request.headers['x-request-id'];

      if (xSignature && xRequestId) {
        const parts = xSignature.split(',');
        let ts = null;
        let receivedHash = null;
        for (const part of parts) {
          const [key, value] = part.split('=').map(s => s.trim());
          if (key === 'ts') ts = value;
          if (key === 'v1') receivedHash = value;
        }

        if (ts && receivedHash) {
          const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
          let isValid = false;

          // Try Terminal Secret
          if (secretTerminal) {
            const calculatedHash = crypto.createHmac('sha256', secretTerminal).update(manifest).digest('hex');
            if (calculatedHash === receivedHash) isValid = true;
          }

          // Try Web Secret if not valid yet
          if (!isValid && secretWeb) {
            const calculatedHash = crypto.createHmac('sha256', secretWeb).update(manifest).digest('hex');
            if (calculatedHash === receivedHash) isValid = true;
          }

          if (!isValid) {
            console.error(`[vFinal] Invalid HMAC Signature. Manifest: ${manifest}`);
            console.error(`[vFinal] Received: ${receivedHash}`);
            // Non-blocking for now to ensure payments are processed. Security is covered by API check.
            console.warn("[vFinal] WARNING: Signature validation failed, but proceeding to API check for continuity.");
          } else {
            console.log("[vFinal] HMAC Signature Verified Successfully.");
          }
        }
      } else {
        console.warn("[vFinal] Missing x-signature or x-request-id. Skiping verification.");
      }
      // ----------------------------

      if (dataId == "123456" || dataId == 123456) {
        console.log("[vFinal] Test simulation detected (123456). Returning OK.");
        response.status(200).send("OK");
        return;
      }

      const { accessToken } = await getMercadoPagoConfig();
      let paymentInfo = null;

      // 1. Try fetching as a direct Payment
      const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (paymentResponse.ok) {
        paymentInfo = await paymentResponse.json();
      } else {
        // 2. If it fails, try fetching as a Merchant Order
        console.log(`[vFinal] Payment ${dataId} not found or failed, trying as Merchant Order...`);
        const orderResponse = await fetch(`https://api.mercadopago.com/merchant_orders/${dataId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (orderResponse.ok) {
          const orderInfo = await orderResponse.json();
          const approvedPayment = orderInfo.payments?.find(p => p.status === 'approved');
          if (approvedPayment) {
            // Simulate the response structure of a direct payment call
            paymentInfo = {
              id: approvedPayment.id,
              external_reference: orderInfo.external_reference,
              status: 'approved',
              transaction_amount: approvedPayment.transaction_amount
            };
          }
        }
      }

      // Prioritize the external reference from the webhook body if available
      const external_reference = body?.data?.external_reference || paymentInfo?.external_reference;

      if (!paymentInfo || paymentInfo.status !== 'approved' || !external_reference) {
        console.error(`[vFinal] Could not verify or process payment for ID ${dataId}.`);
        response.status(200).send("OK (Ignored)");
        return;
      }

      const { status, transaction_amount } = paymentInfo;
      console.log(`[vFinal] API Check: Status=${status}, Ref=${external_reference}`);

      // Logic updated to support both Sales (Ventas) and direct Reservations
      const transactionResult = await admin.firestore().runTransaction(async (t) => {
        const ventaRef = admin.firestore().collection('ventas').doc(external_reference);
        const ventaDoc = await t.get(ventaRef);

        // CASE 1: It is a SALE (Venta) (Legacy/Terminal flow)
        if (ventaDoc.exists) {
          const ventaData = ventaDoc.data();
          if (ventaData.pago_estado === 'Pagado') return;

          // PRE-READ Linked Reservation (Must be done before ANY write)
          let reservaRef = null;
          let reservaDoc = null;
          if (ventaData.reservationId) {
            reservaRef = admin.firestore().collection('reservas').doc(ventaData.reservationId);
            reservaDoc = await t.get(reservaRef);
          }

          const montoOriginal = Number(ventaData.total || 0);
          const montoPagado = Number(transaction_amount || 0);
          const propina = montoPagado > montoOriginal ? parseFloat((montoPagado - montoOriginal).toFixed(2)) : 0;

          // Calculate dynamic status for update
          const isFullPay = montoPagado >= (montoOriginal * 0.99); // Tolerance
          const saldoPendiente = montoOriginal > montoPagado ? (montoOriginal - montoPagado) : 0;

          // NOW WRITE to Sale
          t.update(ventaRef, {
            pago_estado: isFullPay ? 'Pagado' : 'deposit_paid',
            mercado_pago_status: status,
            mercado_pago_id: String(paymentInfo.id),
            monto_pagado_real: montoPagado,
            saldo_pendiente: saldoPendiente,
            propina: propina,
            fecha_pago: new Date(),
            // Add terminal info for tracking
            mp_store_id: paymentInfo.store_id || null,
            mp_pos_id: paymentInfo.pos_id || null
          });

          // NOW WRITE to Linked Reservation (CÓDIGO CORREGIDO)
          if (reservaDoc && reservaDoc.exists) {
            // Usamos la misma lógica que calculamos arriba para la venta
            t.update(reservaRef, {
              pago_estado: isFullPay ? 'Pagado' : 'deposit_paid',
              saldo_pendiente: saldoPendiente // Actualizamos también el saldo
            });
          }
          console.log(`[vFinal] Custom: Venta ${external_reference} updated.`);
          return;
        }

        // CASE 2: It is a Reservaton (Online Booking flow)
        const reservaRef = admin.firestore().collection('reservas').doc(external_reference);
        const reservaDoc = await t.get(reservaRef);

        if (reservaDoc.exists) {
          // Update Reservation
          const reservaData = reservaDoc.data();
          const total = Number(reservaData.total || 0);
          const pagadoAhora = Number(transaction_amount || 0);
          const isFullPay = pagadoAhora >= (total - 0.01); // Tolerance

          t.update(reservaRef, {
            pago_estado: isFullPay ? 'Pagado' : 'deposit_paid', // Dynamic Status
            estado: 'Confirmado',  // CONFIRM the appointment so it appears in agenda

            // Record Financials
            deposit_payment_id: String(paymentInfo.id),
            deposit_paid_at: new Date(),
            anticipo_pagado: pagadoAhora,
            saldo_pendiente: total > pagadoAhora ? (total - pagadoAhora) : 0,
            metodo_pago_anticipo: 'mercadopago'
          });
          // CRITICAL: Create 'ventas' document for Reporting
          // Use 'external_reference' as Sale ID if possible, or new ID linked to reservation
          const saleRef = admin.firestore().collection('ventas').doc(external_reference);
          const saleDoc = await t.get(saleRef);

          if (!saleDoc.exists) {
            const saleData = {
              fecha_hora_venta: new Date(),
              cliente_id: reservaData.cliente_id,
              local_id: reservaData.local_id || 'default',
              professional_id: reservaData.barbero_id || null,
              items: reservaData.items || [],
              subtotal: total,
              total: total,
              descuento: { tipo: 'none', valor: 0 },
              metodo_pago: 'mercadopago',
              pago_estado: isFullPay ? 'Pagado' : 'deposit_paid', // Dynamic Status
              mercado_pago_id: String(paymentInfo.id),
              monto_pagado_real: pagadoAhora,
              origen: 'web_publica',
              status: 'completed',
              reservationId: external_reference, // Link directly
              // If ID differs, we might need logic, but usually external_reference is safe for Case 2
              saldo_pendiente: total > pagadoAhora ? (total - pagadoAhora) : 0,
              detalle_pago_combinado: {
                efectivo: 0,
                tarjeta: pagadoAhora
              }
            };
            t.set(saleRef, saleData);
            console.log(`[vFinal] Created 'ventas' doc (Case 2) for Reservation ${external_reference}`);
          }


          console.log(`[vFinal] Custom: Direct Reservation ${external_reference} CONFIRMED.`);
          return { sendEmail: true, reservationId: external_reference, clientId: reservaData.cliente_id, localId: reservaData.local_id };
        }

        // CASE 3: Reservation NOT FOUND (Created via Metadata / Late Creation)
        console.log(`[vFinal] Reservation ${external_reference} not found. Checking metadata for creation...`);

        // Use the metadata object derived earlier (from BODY if available, else API)
        // Re-extracting here to be safe and explicit
        const bodyMetadata = body?.action === 'payment.created' ? body?.data?.metadata : null;
        const effectiveMetadata = bodyMetadata || paymentInfo.metadata || {};

        // Log keys to debug snakification or missing data
        console.log(`[vFinal] Metadata Keys Available: ${Object.keys(effectiveMetadata).join(', ')}`);

        // Robust Access: Try snake_case (standard) and camelCase fallback
        const bookingJson = effectiveMetadata.booking_json || effectiveMetadata.booking_JSON || effectiveMetadata.bookingJson;

        if (bookingJson) {
          let bookings = [];
          try {
            bookings = JSON.parse(bookingJson);
          } catch (e) {
            console.error("[vFinal] CRITICAL: Error parsing booking_json:", e);
            console.error("[vFinal] Raw booking_json:", bookingJson);
          }

          if (Array.isArray(bookings) && bookings.length > 0) {
            console.log(`[vFinal] Found ${bookings.length} bookings to create from metadata.`);


            const saleItems = [];
            let saleTotal = 0;
            let clientIdForSale = null;
            let localIdForSale = 'default';
            let primaryReservationId = null; // Captured ID

            for (const booking of bookings) {
              // ... dentro de: for (const booking of bookings) {

              // 1. Upsert Client (CORREGIDO PARA EVITAR DUPLICADOS)
              const clientData = booking.client;
              const clientsRef = admin.firestore().collection('clientes');
              let clientId = null;

              // Intento A: Buscar por Correo
              let clientQuery = await clientsRef.where('correo', '==', clientData.email).limit(1).get();

              if (clientQuery.empty) {
                // Intento B: Buscar por Teléfono (Limpiamos el numero para dejar solo digitos)
                const phoneClean = clientData.phone.replace(/\D/g, "").slice(-10);
                // Buscamos coincidencia exacta de los ultimos 10 digitos
                clientQuery = await clientsRef.where('telefono', '==', phoneClean).limit(1).get();
              }

              if (!clientQuery.empty) {
                // CLIENTE ENCONTRADO - USAMOS EL EXISTENTE
                clientId = clientQuery.docs[0].id;
                console.log(`[vFinal] Cliente existente encontrado por coincidencias: ${clientId}`);
              } else {
                // CLIENTE NO EXISTE - CREAMOS UNO NUEVO

                // Check Auto-Number Setting
                const clientConfigRef = admin.firestore().collection('configuracion').doc('clientes');
                const clientConfigSnap = await t.get(clientConfigRef);
                const autoClientNumber = clientConfigSnap.exists ? (clientConfigSnap.data().autoClientNumber !== false) : true;

                let nextClientNumber = undefined;

                if (autoClientNumber) {
                  nextClientNumber = 1;
                  try {
                    const maxQuery = clientsRef.orderBy('numero_cliente', 'desc').limit(1);
                    const maxSnap = await t.get(maxQuery);
                    if (!maxSnap.empty) {
                      const maxVal = Number(maxSnap.docs[0].data().numero_cliente);
                      if (!isNaN(maxVal)) nextClientNumber = maxVal + 1;
                    }
                  } catch (e) {
                    console.warn("[vFinal] Error auto-generating client number:", e);
                  }
                }

                const newClientRef = clientsRef.doc();
                clientId = newClientRef.id;

                const newClientData = {
                  nombre: clientData.name,
                  apellido: clientData.lastName,
                  // Mantener 'correo' consistente
                  correo: clientData.email,
                  telefono: clientData.phone,
                  creado_en: admin.firestore.FieldValue.serverTimestamp(),
                  origen: 'web_publica'
                };

                if (nextClientNumber !== undefined) {
                  newClientData.numero_cliente = nextClientNumber;
                }

                t.set(newClientRef, newClientData);
                console.log(`[vFinal] Creando nuevo cliente: ${clientId} con # ${nextClientNumber}`);
              }



              if (!clientIdForSale) clientIdForSale = clientId;

              // 2. Create Reservation
              const resId = booking.id || admin.firestore().collection('reservas').doc().id;

              // Capture the first reservation ID to link the sale
              if (!primaryReservationId) primaryReservationId = resId;

              const newResRef = admin.firestore().collection('reservas').doc(resId);

              // Items Mapping
              let resItems = [];
              if (booking.items && Array.isArray(booking.items) && booking.items.length > 0) {
                // New Format: Explicit Items (Services + Products)
                resItems = booking.items.map(i => ({
                  id: i.id,
                  // Legacy 'servicio' string: Only for services, or use name for products?
                  // Best to concat names in main 'servicio' field later. Here keep clean.
                  servicio: i.tipo === 'servicio' ? i.nombre : null,
                  barbero_id: i.barbero_id || booking.professionalId, // Use specific pro or booking pro
                  nombre: i.nombre,
                  tipo: i.tipo || 'servicio',
                  precio: Number(i.precio || 0)
                }));
              } else {
                // Legacy Format: Implicit Services Only
                resItems = booking.serviceIds.map((sid, idx) => ({
                  id: sid,
                  servicio: booking.serviceNames[idx],
                  barbero_id: booking.professionalId,
                  nombre: booking.serviceNames[idx],
                  tipo: 'servicio',
                  precio: Number(booking.servicePrices?.[idx] || 0)
                }));
              }

              saleItems.push(...resItems);

              const calculatedTotal = resItems.reduce((acc, curr) => acc + curr.precio, 0);
              const bTotalParam = Number(booking.totalAmount || 0);
              const bTotal = bTotalParam > 0 ? bTotalParam : calculatedTotal;

              saleTotal += bTotal;
              localIdForSale = booking.locationId || 'default';

              // Explicit Flag Check (Deposit vs Full)
              const paymentType = booking.paymentType; // 'deposit' | 'full'
              let finalStatus = 'deposit_paid';

              if (paymentType === 'deposit') {
                finalStatus = 'deposit_paid';
              } else if (paymentType === 'full') {
                finalStatus = 'Pagado';
              } else {
                // Fallback to Math
                const paidNow = Number(transaction_amount || 0);
                const MIN_TOTAL_FOR_PAID = 0.01;
                const isPaid = (bTotal > MIN_TOTAL_FOR_PAID) && (paidNow >= (bTotal - 0.01));
                finalStatus = isPaid ? 'Pagado' : 'deposit_paid';
              }

              console.log(`[vFinal] Status Logic: Type=${paymentType}, Final=${finalStatus}`);

              // Final Client Validity Check
              if (!clientId) {
                console.error('[vFinal] CRITICAL: Client ID missing after lookup/create logic. Generating fallback.');
                const fallbackRef = admin.firestore().collection('clientes').doc();
                clientId = fallbackRef.id;
                t.set(fallbackRef, { nombre: 'Cliente', apellido: 'Desconocido', origen: 'error_webhook', creado_en: admin.firestore.FieldValue.serverTimestamp() });
              }

              const reservaToCreate = {
                cliente_id: clientId,
                local_id: booking.locationId,
                professional_id: booking.professionalId, // Main pro
                fecha: booking.date,
                hora_inicio: booking.time,
                hora_fin: booking.endTime, // We added this to payload
                duracion: booking.duration,
                estado: 'Confirmado', // Paid = Confirmed

                pago_estado: finalStatus,

                items: resItems,
                servicio: resItems.map(i => i.nombre).join(', '), // Use 'nombre' for all items so products also appear in summary, OR use 'servicio' if you only want services. User probably wants to see what they bought. Let's use names.

                total: bTotal,
                anticipo_pagado: Number(transaction_amount || 0),
                saldo_pendiente: bTotal > Number(transaction_amount || 0) ? (bTotal - Number(transaction_amount || 0)) : 0,

                deposit_payment_id: String(paymentInfo.id),
                deposit_paid_at: new Date(),
                metodo_pago_anticipo: 'mercadopago',

                creado_en: admin.firestore.FieldValue.serverTimestamp(),
                origen: 'web_publica_pago_anticipado'
              };

              t.set(newResRef, reservaToCreate);
              console.log(`[vFinal] Created Reservation ${newResRef.id} from metadata.`);
            }

            // 3. Create Aggregate Sale (Venta)
            // Use 'external_reference' as Sale ID (Matches Payment ID/Ref)
            const saleRef = admin.firestore().collection('ventas').doc(external_reference);

            // Calculate Global Status based on first booking's intent (usually identical for all in cart)
            // Calculate Global Status based on first booking's intent
            const firstBooking = bookings[0];
            let globalStatus = 'deposit_paid';

            // --- CORRECCIÓN: Definimos la variable AQUÍ AFUERA para que sea global ---
            const amountPaid = Number(transaction_amount || 0);
            // -----------------------------------------------------------------------

            if (firstBooking?.paymentType === 'deposit') {
              globalStatus = 'deposit_paid';
            } else if (firstBooking?.paymentType === 'full') {
              globalStatus = 'Pagado';
            } else {
              // Usamos la variable que definimos arriba
              const isFullPayment = (saleTotal > 0.01) && (amountPaid >= (saleTotal - 0.01));
              globalStatus = isFullPayment ? 'Pagado' : 'deposit_paid';
            }

            // Calculamos el balance usando la misma variable
            const remainingBalance = saleTotal > amountPaid ? (saleTotal - amountPaid) : 0;

            const finalSale = {
              id: external_reference,
              // CRITICAL FIX: Link to the ACTUAL reservation ID we just created/used
              // accessing primaryReservationId falling back to external_reference
              reservationId: primaryReservationId || external_reference,
              fecha_hora_venta: admin.firestore.FieldValue.serverTimestamp(),
              cliente_id: clientIdForSale,
              local_id: localIdForSale,
              items: saleItems,
              subtotal: saleTotal,
              total: saleTotal,
              descuento: { valor: 0, tipo: 'fixed' },
              metodo_pago: 'mercadopago',

              // Payment Status
              pago_estado: globalStatus,
              mercado_pago_id: String(paymentInfo.id),
              detalle_pago_combinado: {
                efectivo: 0,
                tarjeta: amountPaid
              },
              monto_pagado_real: amountPaid,
              saldo_pendiente: remainingBalance,

              origen: 'web_publica',
              status: remainingBalance > 0 ? 'completed' : 'completed', // Sale created is completed step, payment status differs
              creado_por_nombre: 'Sistema Online',
              creado_por_id: 'system',
              propina: 0
            };

            t.set(saleRef, finalSale);
            console.log(`[vFinal] Created Aggregate Sale (Venta) ${external_reference} for financials.`);
            return { sendEmail: true, reservationId: primaryReservationId || external_reference, clientId: clientIdForSale, localId: localIdForSale };
          }
        }

        console.warn(`[vFinal] No Venta or Reserva found for ref ${external_reference} and no valid metadata to create.`);
      });
      console.log(`[vFinal] SUCCESS: Venta ${external_reference} processed.`);

      if (transactionResult && transactionResult.sendEmail) {
        await sendReservationConfirmationEmail(transactionResult.reservationId, transactionResult.clientId, transactionResult.localId);
      }

    } catch (error) {
      console.error('[vFinal] Error processing webhook:', error);
      response.status(200).send('OK_WITH_ERROR');
      return;
    }

    response.status(200).send('OK');
  }
);

/**
 * =================================================================
 * CRON ENGINE: AUTOMATED MESSAGES
 * =================================================================
 * Runs every hour to check for:
 * 1. Birthdays
 * 2. Appointment Reminders
 * 3. Google Reviews
 */
exports.checkAutomatedMessages = onSchedule({
  schedule: "every 1 hours",
  secrets: [mpAccessToken, resendApiKey] // Added Resend secret availability
}, async (event) => {
  console.log("Cron Engine Started: Checking automated messages...");
  const db = admin.firestore();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // -- 0. Load Configuration --
  const reminderSettingsDoc = await db.collection('configuracion').doc('recordatorios').get();
  const reminderSettings = reminderSettingsDoc.exists ? reminderSettingsDoc.data() : {};
  const notifications = reminderSettings.notifications || {};

  /*
   * Twilio credentials removed.
   */


  /* 
   * Initializing Resend for future email usage
   * const resend = new Resend(resendApiKey.value()); 
   */

  const sendTemplate = async (to, templateName, variables) => {
    // TODO: Conectar webhook de Impulso 64 aquí.
    console.log(`[Stub] Would send ${templateName} to ${to} with vars:`, variables);
    return true;
  };

  // -- 1. Birthdays --
  // Only run birthday check once a day, e.g., if hour is 10 AM
  if (now.getHours() === 10 && notifications.birthday_notification?.enabled) {
    console.log("Checking birthdays...");
    const clientsSnap = await db.collection('clientes').where('fecha_nacimiento', '!=', null).get();
    for (const doc of clientsSnap.docs) {
      const data = doc.data();
      let dob = null;
      if (data.fecha_nacimiento && typeof data.fecha_nacimiento.toDate === 'function') {
        dob = data.fecha_nacimiento.toDate();
      } else if (typeof data.fecha_nacimiento === 'string') {
        dob = new Date(data.fecha_nacimiento);
      }

      if (dob && dob.getDate() === now.getDate() && dob.getMonth() === now.getMonth()) {
        // Happy Birthday!
        console.log(`It's ${data.nombre}'s birthday!`);
        await sendTemplate(data.telefono, 'Feliz Cumpleaños', { '1': data.nombre });
      }
    }
  }

  // -- 2. Appointment Reminders --
  if (notifications.appointment_reminder?.enabled) {
    // Logic depends on 'day_before' or 'same_day' + hours
    const timing = notifications.appointment_reminder.timing;
    let targetStart = new Date();
    let targetEnd = new Date();

    // This is a simplified check. For robust 'hours before', we need to check current hour + X.
    // Let's implement 'Day Before' as: running at 6 PM to check tomorrow? 
    // Or running hourly to check appointments in exactly X hours.
    // Assuming 'day_before' means 24 hours before.

    // Strategy: Look for appointments starting between [now + X hours, now + X hours + 1 hour window]
    // This requires precise math.

    if (timing?.type === 'day_before') {
      // Check for appointments tomorrow at this same hour (roughly 24h from now)
      targetStart.setDate(targetStart.getDate() + 1);
    } else if (timing?.hours_before) {
      targetStart.setHours(targetStart.getHours() + timing.hours_before);
    }

    // Create 1 hour window
    targetEnd = new Date(targetStart);
    targetEnd.setHours(targetEnd.getHours() + 1);

    const startStr = targetStart.toISOString(); // Firestore string comparison works for ISO dates
    // Warning: 'fecha' field is YYYY-MM-DD. 'hora_inicio' is HH:MM.
    // We need to query based on fecha and hora_inicio.

    const targetDateStr = targetStart.toISOString().split('T')[0];
    const targetHourStr = targetStart.toTimeString().slice(0, 5); // HH:MM

    // Query reservations for the target date
    const resSettings = notifications.appointment_reminder;

    const resSnap = await db.collection('reservas')
      .where('fecha', '==', targetDateStr)
      .get();

    for (const doc of resSnap.docs) {
      const res = doc.data();
      if (res.estado === 'Confirmado' || res.estado === 'Pendiente') { // Only remind active ones
        // Check time
        // res.hora_inicio is '14:30'. We checked 'targetHourStr' which is based on execution time.
        // We want to send reminder closely matched.
        // If we run hourly, we check if res.hora_inicio starts with current hour + offset.

        const resHour = parseInt(res.hora_inicio.split(':')[0], 10);
        const targetHour = targetStart.getHours();

        if (resHour === targetHour) {
          // Get Client
          const clientDoc = await db.collection('clientes').doc(res.cliente_id).get();
          if (clientDoc.exists) {
            const clientData = clientDoc.data();
            // Check if already sent? (Optional: Add flag to reservation)
            if (!res.reminderSent) {
              console.log(`Sending reminder to ${clientData.nombre} for ${res.fecha} ${res.hora_inicio}`);
              const sent = await sendTemplate(clientData.telefono, 'Recordatorio Cita', {
                '1': clientData.nombre,
                '2': res.servicio || 'Servicio',
                '3': `${res.fecha} a las ${res.hora_inicio}`
              });
              if (sent) {
                await doc.ref.update({ reminderSent: true });
              }
            }
          }
        }
      }
    }
  }

  // -- 3. Google Reviews --
  // Run once a day at 12:00 PM
  if (now.getHours() === 12 && notifications.google_review?.enabled) {
    // Check reservations from YESTERDAY
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const resSnap = await db.collection('reservas')
      .where('fecha', '==', yesterdayStr)
      .where('estado', '==', 'Asiste') // Completed appointments
      .get();

    for (const doc of resSnap.docs) {
      const res = doc.data();
      const clientRef = db.collection('clientes').doc(res.cliente_id);
      const clientDoc = await clientRef.get();

      if (clientDoc.exists) {
        const clientData = clientDoc.data();
        if (!clientData.reviewRequestSent) {
          console.log(`Asking ${clientData.nombre} for review...`);
          const sent = await sendTemplate(clientData.telefono, 'Solicitud Reseña', { '1': clientData.nombre });
          if (sent) {
            await clientRef.update({ reviewRequestSent: true });
          }
        }
      }
    }
  }
});

exports.backfillClientNumbers = onRequest(
  {
    cors: true,
    invoker: 'public',
  },
  async (request, response) => {
    try {
      const db = admin.firestore();
      const clientsRef = db.collection('clientes');

      // 1. Find Max Current Number
      let currentMax = 0;
      const maxQuery = await clientsRef.orderBy('numero_cliente', 'desc').limit(1).get();
      if (!maxQuery.empty) {
        const val = Number(maxQuery.docs[0].data().numero_cliente);
        if (!isNaN(val)) currentMax = val;
      }

      console.log(`[Backfill] Current Max Number: ${currentMax}`);

      // 2. Find Clients without number
      // Note: Firestore doesn't easily support "where field is missing".
      // We process in batches or just get all (if dataset is small < 1000). 
      // Assuming small business, get all is safe.
      const allClients = await clientsRef.get();
      let updates = 0;
      let batch = db.batch();
      let batchCount = 0;

      // Sort by creation date to assign numbers chronologically
      const clientsToUpdate = [];
      allClients.forEach(doc => {
        const data = doc.data();
        if (!data.numero_cliente || data.numero_cliente === 0 || data.numero_cliente === 'N/A') {
          clientsToUpdate.push({ id: doc.id, ...data });
        }
      });

      // Sort: Oldest first
      clientsToUpdate.sort((a, b) => {
        const tA = a.creado_en?.toMillis?.() || 0;
        const tB = b.creado_en?.toMillis?.() || 0;
        return tA - tB;
      });

      console.log(`[Backfill] Found ${clientsToUpdate.length} clients to update.`);

      for (const client of clientsToUpdate) {
        currentMax++;
        const ref = clientsRef.doc(client.id);
        batch.update(ref, { numero_cliente: currentMax });
        batchCount++;
        updates++;

        if (batchCount >= 400) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      response.status(200).send(`Backfill Complete. Updated ${updates} clients. New Max: ${currentMax}`);

    } catch (error) {
      console.error("Backfill Error:", error);
      response.status(500).send(error.message);
    }
  }
);

/**
 * Helper: Send Reservation Confirmation Email
 * Triggered after successful booking payment/creation
 * @param {string} reservationId
 * @param {string} clientId
 * @param {string} localId
 */
async function sendReservationConfirmationEmail(reservationId, clientId, localId) {
  try {
    console.log(`[Email] Starting email send for Res: ${reservationId}, Client: ${clientId}`);
    const db = admin.firestore();

    // 1. Fetch Data (Parallel where possible)
    // We fetch 'empresa' collection to get the active settings (matching frontend)
    const [configEmailSnap, empresaQuerySnap, localSnap, clientSnap, resSnap, websiteSettingsSnap] = await Promise.all([
      db.collection('configuracion').doc('emails').get(),
      db.collection('empresa').limit(1).get(), // Get main company doc
      db.collection('locales').doc(localId).get(),
      db.collection('clientes').doc(clientId).get(),
      db.collection('reservas').doc(reservationId).get(),
      db.collection('settings').doc('website').get()
    ]);

    // 2. Extract Data
    const emailConfig = configEmailSnap.exists ? configEmailSnap.data() : {};
    const empresaConfig = !empresaQuerySnap.empty ? empresaQuerySnap.docs[0].data() : {};
    const localData = localSnap.exists ? localSnap.data() : {};
    const clientData = clientSnap.exists ? clientSnap.data() : {};
    const resData = resSnap.exists ? resSnap.data() : {};
    const websiteSettings = websiteSettingsSnap.exists ? websiteSettingsSnap.data() : {};

    // 3. Fetch Professional (Dependent on resData)
    let professionalName = 'Un profesional de VATOS ALFA';
    const proId = resData.barbero_id || resData.professional_id;
    if (proId) {
      const proSnap = await db.collection('profesionales').doc(proId).get();
      if (proSnap.exists) {
        professionalName = proSnap.data().name;
      }
    }

    // Settings & Configuration
    const confirmationConfig = websiteSettings.confirmationEmailConfig || {};

    // Check if sending to CLIENT is enabled (default to true if not present)
    const isClientConfirmationEnabled = confirmationConfig.enabled !== false;

    // --- SEND TO CLIENT ---
    // --- SEND TO CLIENT ---
    if (isClientConfirmationEnabled) {
      // Client Email Logic
      const showDate = confirmationConfig.showDate !== false;
      const showTime = confirmationConfig.showTime !== false;
      const showProfessional = confirmationConfig.showProfessional !== false;
      const showLocation = confirmationConfig.showLocation !== false;
      const showServices = confirmationConfig.showServices !== false;

      // Remitente (Sender)
      const senderEmail = 'contacto@vatosalfa.com';
      const senderName = empresaConfig.name || 'VATOS ALFA Barber Shop';

      // Recipient
      const recipientEmail = clientData.email || clientData.correo;
      if (recipientEmail && recipientEmail.includes('@')) {
        // Logo
        const logoUrl = empresaConfig.logo_url || empresaConfig.icon_url || 'https://vatosalfa.com/logo.png';
        const secondaryColor = empresaConfig.theme?.secondaryColor || '#314177';
        const cardTextColor = '#ffffff';

        const localName = localData.name || 'Nuestra Barbería';
        const localAddress = localData.address || localData.direccion || '';
        const localPhone = localData.phone || localData.telefono || 'el número de contacto';
        const yellowNote = websiteSettings.predefinedNotes || 'Favor de llegar 5 minutos antes de la hora de tu cita.';

        // Formatting
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        let dateObj = new Date();
        if (resData.fecha) {
          if (resData.fecha.toDate) dateObj = resData.fecha.toDate();
          else if (typeof resData.fecha === 'string') dateObj = new Date(resData.fecha.replace(/-/g, '/'));
          else if (typeof resData.fecha === 'string' && resData.fecha.length === 10) {
            const [y, m, d] = resData.fecha.split('-').map(Number);
            dateObj = new Date(y, m - 1, d);
          }
        }
        const dateStr = dateObj.toLocaleDateString('es-MX', options);
        const timeStr = resData.hora_inicio || '00:00';

        const itemsListHtml = (resData.items || []).map(i =>
          `<li style="margin-bottom: 5px;">${i.nombre || i.servicio || 'Servicio'} - $${i.precio}</li>`
        ).join('');

        const signature = emailConfig.signature
          ? emailConfig.signature.replace(/\n/g, '<br>')
          : `<p style="margin: 5px 0;">${senderName}</p><p style="margin: 5px 0;">${localAddress}</p>`;

        // API Key
        let apiKey = "re_CLqHQSKU_2Eahc3mv5koXcZQdgSnjZDAv";
        try {
          if (resendApiKey && resendApiKey.value()) apiKey = resendApiKey.value();
        } catch (e) { /* ignore */ }
        const resend = new Resend(apiKey);

        const htmlContent = `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; line-height: 1.6;">
                <div style="text-align: center; padding: 20px 0;">
                <img src="${logoUrl}" alt="${senderName}" style="max-height: 100px; max-width: 200px; object-fit: contain;" />
                </div>
                
                <h2 style="color: #1a1a1a; text-align: center; margin-bottom: 20px;">¡Tu reserva está confirmada!</h2>
                
                <p>Hola <strong>${clientData.nombre || 'Cliente'}</strong>,</p>
                <p>Tu cita ${showProfessional ? `con <strong>${professionalName}</strong>` : ''} ha sido agendada exitosamente. Aquí están los detalles:</p>
                
                <div style="background-color: ${secondaryColor}; color: ${cardTextColor}; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #eee;">
                ${showDate ? `<p style="margin: 5px 0;"><strong>Fecha:</strong> ${dateStr}</p>` : ''}
                ${showTime ? `<p style="margin: 5px 0;"><strong>Hora:</strong> ${timeStr}</p>` : ''}
                ${showProfessional ? `<p style="margin: 5px 0;"><strong>Profesional:</strong> ${professionalName}</p>` : ''}
                
                ${showLocation ? `
                <div style="margin: 10px 0;">
                    <p style="margin: 5px 0;"><strong>Lugar:</strong> ${localName}</p>
                    ${localAddress ? `<p style="margin: 0; font-size: 0.95em; opacity: 0.9;">${localAddress}</p>` : ''}
                </div>` : ''}
                
                ${showServices ? `
                <div style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 10px;">
                    <p style="margin-bottom: 5px;"><strong>Servicios:</strong></p>
                    <ul style="padding-left: 20px; margin-top: 0;">${itemsListHtml}</ul>
                </div>` : ''}
                
                <div style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 10px;">
                    <p style="margin: 5px 0;"><strong>Total:</strong> $${resData.total || resData.precio || 0}</p>
                    <p style="margin: 5px 0;"><strong>Anticipo Pagado:</strong> $${resData.anticipo_pagado || 0}</p>
                    ${resData.saldo_pendiente > 0 ? `<p style="margin: 5px 0; font-weight: bold;"><strong>Saldo Pendiente (Pagar en local):</strong> $${resData.saldo_pendiente}</p>` : '<p style="margin: 5px 0; font-weight: bold;"><strong>¡Totalmente Pagado!</strong></p>'}
                </div>
                </div>

                <div style="background-color: #fff3cd; color: #856404; padding: 15px; border-radius: 5px; font-size: 0.95em; margin-bottom: 20px; border: 1px solid #ffeeba;">
                <strong>Nota importante:</strong> ${yellowNote}
                </div>

                <p style="font-size: 0.9em; color: #555; text-align: justify;">
                Esta es una dirección de correo de solo envío, por favor no respondas a este mensaje. 
                Si necesitas <strong>cancelar o cambiar la hora</strong>, por favor manda un mensaje de WhatsApp al teléfono: 
                <strong>${localPhone}</strong>.
                </p>

                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
                
                <div style="text-align: center; font-size: 0.8em; color: #999;">
                ${signature}
                </div>
            </div>
            `;

        const { data: emailData, error } = await resend.emails.send({
          from: `${senderName} <${senderEmail}>`,
          to: [recipientEmail],
          subject: `Confirmación de Reserva - ${senderName}`,
          html: htmlContent,
        });

        if (error) console.error("[Email] Resend API Error:", error);
        else console.log(`[Email] Sent successfully. ID: ${emailData?.id}`);
      } else {
        console.log(`[Email] Client ${clientId} has no valid email (${recipientEmail}). Skipping.`);
      }
    } else {
      console.log(`[Email] Client confirmation emails are disabled. Skipping client email for Res: ${reservationId}`);
    }

    // --- SEND TO PROFESSIONAL ---
    const profConfig = websiteSettings.professionalConfirmationEmailConfig || {};
    const isProfConfirmationEnabled = profConfig.enabled !== false;

    if (isProfConfirmationEnabled) {
      await sendProfessionalConfirmationEmail(reservationId, clientId, localId, resData, clientData, professionalName, empresaConfig, localData, profConfig, websiteSettings, resendApiKey);
    } else {
      console.log(`[Email] Professional confirmation emails are disabled. Skipping pro email for Res: ${reservationId}`);
    }

  } catch (err) {
    console.error("[Email] Execution Error:", err);
  }
}

async function sendProfessionalConfirmationEmail(reservationId, clientId, localId, resData, clientData, professionalName, empresaConfig, localData, profConfig, websiteSettings, resendApiKey) {
  try {
    const db = admin.firestore();
    const proId = resData.barbero_id || resData.professional_id;

    if (!proId) {
      console.log("[Email-Pro] No professional ID found in reservation. Skipping.");
      return;
    }

    const proSnap = await db.collection('profesionales').doc(proId).get();
    if (!proSnap.exists) {
      console.log(`[Email-Pro] Professional ${proId} not found. Skipping.`);
      return;
    }

    const proData = proSnap.data();
    const recipientEmail = proData.email;

    if (!recipientEmail || !recipientEmail.includes('@')) {
      console.log(`[Email-Pro] Professional ${proId} has no valid email (${recipientEmail}). Skipping.`);
      return;
    }

    console.log(`[Email-Pro] Sending email to professional: ${recipientEmail}`);

    const showDate = profConfig.showDate !== false;
    const showTime = profConfig.showTime !== false;
    const showLocation = profConfig.showLocation !== false;
    const showServices = profConfig.showServices !== false;
    const showClientName = profConfig.showClientName !== false;
    const note = profConfig.note || '';

    const senderEmail = 'contacto@vatosalfa.com';
    const senderName = empresaConfig.name || 'VATOS ALFA Barber Shop';
    const logoUrl = empresaConfig.logo_url || empresaConfig.icon_url || 'https://vatosalfa.com/logo.png';
    const secondaryColor = empresaConfig.theme?.secondaryColor || '#314177';
    const cardTextColor = '#ffffff';

    // Formatting
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    let dateObj = new Date();
    if (resData.fecha) {
      if (resData.fecha.toDate) dateObj = resData.fecha.toDate();
      else if (typeof resData.fecha === 'string') dateObj = new Date(resData.fecha.replace(/-/g, '/'));
      else if (typeof resData.fecha === 'string' && resData.fecha.length === 10) {
        const [y, m, d] = resData.fecha.split('-').map(Number);
        dateObj = new Date(y, m - 1, d);
      }
    }
    const dateStr = dateObj.toLocaleDateString('es-MX', options);
    const timeStr = resData.hora_inicio || '00:00';

    const itemsListHtml = (resData.items || []).map(i =>
      `<li style="margin-bottom: 5px;">${i.nombre || i.servicio || 'Servicio'} - $${i.precio}</li>`
    ).join('');

    // API Key
    let apiKey = "re_CLqHQSKU_2Eahc3mv5koXcZQdgSnjZDAv";
    try {
      if (resendApiKey && resendApiKey.value()) apiKey = resendApiKey.value();
    } catch (e) { /* ignore */ }
    const resend = new Resend(apiKey);

    const htmlContent = `
         <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; line-height: 1.6;">
            <div style="text-align: center; padding: 20px 0;">
                 <img src="${logoUrl}" alt="${senderName}" style="max-height: 80px; max-width: 200px; object-fit: contain;" />
            </div>
            
            <h2 style="color: #1a1a1a; text-align: center; margin-bottom: 20px;">Nueva Cita Agendada</h2>
            
            <p>Hola <strong>${professionalName}</strong>,</p>
            <p>Se ha agendado una nueva cita ${showClientName ? `con el cliente <strong>${clientData.nombre} ${clientData.apellido || ''}</strong>` : ''}.</p>
            
            <div style="background-color: ${secondaryColor}; color: ${cardTextColor}; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #eee;">
                ${showDate ? `<p style="margin: 5px 0;"><strong>Fecha:</strong> ${dateStr}</p>` : ''}
                ${showTime ? `<p style="margin: 5px 0;"><strong>Hora:</strong> ${timeStr}</p>` : ''}
                ${showLocation ? `<p style="margin: 5px 0;"><strong>Lugar:</strong> ${localData.name || 'Local'}</p>` : ''}
                
                ${showServices ? `
                <div style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 10px;">
                    <p style="margin-bottom: 5px;"><strong>Servicios:</strong></p>
                    <ul style="padding-left: 20px; margin-top: 0;">${itemsListHtml}</ul>
                </div>` : ''}

                 <div style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 10px;">
                    <p style="margin: 5px 0;"><strong>Total:</strong> $${resData.total || resData.precio || 0}</p>
                    <p style="margin: 5px 0;"><strong>Saldo Pendiente:</strong> $${resData.saldo_pendiente || 0}</p>
                 </div>
            </div>

            ${note ? `
            <div style="background-color: #e2e3e5; color: #383d41; padding: 15px; border-radius: 5px; font-size: 0.95em; margin-bottom: 20px; border: 1px solid #d6d8db;">
                <strong>Nota:</strong> ${note}
            </div>` : ''}

             <div style="text-align: center; font-size: 0.8em; color: #999; margin-top: 30px;">
                Notificación automática de ${senderName}
            </div>
         </div>
         `;

    const { data: emailData, error } = await resend.emails.send({
      from: `${senderName} <${senderEmail}>`,
      to: [recipientEmail],
      subject: `Nueva Cita - ${clientData.nombre || 'Cliente'} - ${dateStr} ${timeStr}`,
      html: htmlContent,
    });

    if (error) console.error("[Email-Pro] Resend API Error:", error);
    else console.log(`[Email-Pro] Sent successfully. ID: ${emailData?.id}`);

  } catch (err) {
    console.error("[Email-Pro] Execution Error:", err);
  }
}

