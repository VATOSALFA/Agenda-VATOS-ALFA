/**
 * Importamos las funciones de la Versión 2 (Gen 2)
 */
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");

const admin = require("firebase-admin");
const crypto = require("crypto");
const { Buffer } = require("buffer");
const { v4: uuidv4 } = require("uuid");
const fetch = require("node-fetch");
const { MercadoPagoConfig, Point } = require("mercadopago");

// --- DEFINICIÓN DE SECRETOS ---
const mpAccessToken = defineSecret("MERCADO_PAGO_ACCESS_TOKEN");
const mpWebhookSecret = defineSecret("MERCADO_PAGO_WEBHOOK_SECRET");

// Configuración global
setGlobalOptions({ region: "us-central1" });

console.log('Functions starting up (Gen 2 - Final V8 Hybrid). Version: ' + new Date().toISOString());

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// --- CONFIGURACIÓN MERCADO PAGO ---
const getMercadoPagoConfig = () => {
  const accessToken = mpAccessToken.value();
  if (!accessToken) {
    throw new HttpsError('internal', 'El Access Token de Mercado Pago no se pudo leer desde Secret Manager.');
  }
  return { client: new MercadoPagoConfig({ accessToken }), accessToken };
};

/**
 * =================================================================
 * TWILIO FUNCTIONS
 * =================================================================
 */

async function transferMediaToStorage(mediaUrl, from, mediaType) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) throw new Error("Twilio credentials missing.");

  const twilioAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${twilioAuth}` },
  });

  if (!response.ok) throw new Error(`Twilio download failed: ${response.status}`);

  const imageBuffer = await response.buffer();
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) throw new Error("Bucket not configured.");
  
  const bucket = admin.storage().bucket(bucketName);
  const extension = mediaType.split("/")[1] || "jpeg";
  const fileName = `whatsapp_media/${from.replace(/\D/g,"")}-${uuidv4()}.${extension}`;
  const file = bucket.file(fileName);

  await file.save(imageBuffer, {
    metadata: { contentType: mediaType, cacheControl: "public, max-age=31536000" },
  });
  
  await file.makePublic();
  return `https://storage.googleapis.com/${bucketName}/${fileName}`;
}

async function handleAutomatedReply(db, from, body) {
  const normalizedBody = body.toLowerCase().trim();
  const isConfirmation = normalizedBody.includes("confirmado");
  const isCancellation = normalizedBody.includes("cancelar");

  if (!isConfirmation && !isCancellation) return false;
  
  const phoneOnly = from.replace(/\D/g, "").slice(-10);
  const clientsRef = db.collection("clientes");
  const clientQuery = await clientsRef.where("telefono", "==", phoneOnly).limit(1).get();

  if (clientQuery.empty) {
    console.log(`No client found for phone number: ${phoneOnly}`);
    return false;
  }
  const clientId = clientQuery.docs[0].id;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  const reservationsRef = db.collection("reservas");
  const reservationQuery = await reservationsRef
      .where("cliente_id", "==", clientId)
      .where("fecha", ">=", todayStr)
      .orderBy("fecha")
      .orderBy("hora_inicio")
      .limit(1)
      .get();
  
  if (reservationQuery.empty) return false;

  const reservationDoc = reservationQuery.docs[0];
  const reservation = reservationDoc.data();
  
  if (["Asiste", "Cancelado", "No asiste"].includes(reservation.estado)) return false;

  if (isConfirmation) {
      await reservationDoc.ref.update({ estado: "Confirmado" });
      console.log(`Reservation ${reservationDoc.id} confirmed for client ${clientId}.`);
  } else if (isCancellation) {
      await db.runTransaction(async (transaction) => {
          const clientRef = db.collection("clientes").doc(clientId);
          transaction.update(reservationDoc.ref, { estado: "Cancelado" });
          transaction.update(clientRef, { citas_canceladas: admin.firestore.FieldValue.increment(1) });
      });
      console.log(`Reservation ${reservationDoc.id} cancelled for client ${clientId}.`);
  }
  return true;
}

async function saveMessage(from, body, mediaUrl, mediaType) {
  const db = admin.firestore();

  if (body) {
    const wasHandled = await handleAutomatedReply(db, from, body);
    if (wasHandled) return; 
  }

  const conversationId = from;
  const conversationRef = db.collection("conversations").doc(conversationId);

  const messageData = {
    senderId: "client",
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
  };

  if (body) messageData.text = body;

  let finalMediaUrl = null;
  if (mediaUrl && mediaType) {
    try {
      finalMediaUrl = await transferMediaToStorage(mediaUrl, from, mediaType);
      messageData.mediaUrl = finalMediaUrl;
      if (mediaType.startsWith("image/")) messageData.mediaType = "image";
      else if (mediaType.startsWith("audio/")) messageData.mediaType = "audio";
      else if (mediaType === "application/pdf") messageData.mediaType = "document";
    } catch (mediaError) {
      console.error(`[MEDIA_ERROR] Failed to process media:`, mediaError.message);
      messageData.text = (body || "") + `\n\n[Error al procesar archivo adjunto]`;
    }
  }

  await db.runTransaction(async (transaction) => {
    const convDoc = await transaction.get(conversationRef);
    const lastMessageText = body || `[${messageData.mediaType || "Archivo"}]`;

    if (convDoc.exists) {
      transaction.update(conversationRef, {
        lastMessageText,
        lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        unreadCount: admin.firestore.FieldValue.increment(1),
      });
    } else {
      let clientName = from;
      try {
        const phoneOnly = from.replace(/\D/g, "").slice(-10);
        const clientsRef = db.collection("clientes");
        const querySnapshot = await clientsRef.where("telefono", "==", phoneOnly).limit(1).get();
        if (!querySnapshot.empty) {
          const clientData = querySnapshot.docs[0].data();
          clientName = `${clientData.nombre} ${clientData.apellido}`;
        }
      } catch (e) { console.warn("Could not fetch client name:", e); }

      transaction.set(conversationRef, {
        clientName: clientName,
        lastMessageText,
        lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        unreadCount: 1,
      });
    }
    const newMessageRef = conversationRef.collection("messages").doc();
    transaction.set(newMessageRef, messageData);
  });
}

exports.twilioWebhook = onRequest({cors: true}, async (request, response) => {
    try {
      const {From, Body, MediaUrl0, MediaContentType0} = request.body;
      if (!From) {
        response.status(200).send("<Response/>");
        return;
      }
      await saveMessage(From, Body, MediaUrl0, MediaContentType0);
      response.set("Content-Type", "text/xml");
      response.status(200).send("<Response/>");
    } catch (error) {
      console.error("[FATAL] Unhandled error in twilioWebhook function:", error);
      response.set("Content-Type", "text/xml");
      response.status(200).send("<Response/>");
    }
  }
);


/**
 * =================================================================
 * MERCADO PAGO FUNCTIONS
 * =================================================================
 */

// 1. OBTENER TERMINALES
exports.getPointTerminals = onCall(
  { 
    cors: true, 
    secrets: [mpAccessToken],
    invoker: 'public' // Asegura que Google no cierre el acceso
  }, 
  async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuario no autenticado.');
    }
    try {
        const { client } = getMercadoPagoConfig();
        const point = new Point(client); 
        const devices = await point.getDevices({}); 
        return { success: true, devices: devices.devices || [] };
    } catch(error) {
        console.error("Error fetching terminals: ", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || "No se pudo comunicar con Mercado Pago.");
    }
});

// 2. CAMBIAR MODO PDV
exports.setTerminalPDVMode = onCall(
  { 
    cors: true, 
    secrets: [mpAccessToken],
    invoker: 'public' // Asegura el acceso
  }, 
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Usuario no autenticado.');
    
    const { terminalId } = request.data;
    if (!terminalId) throw new HttpsError('invalid-argument', 'Falta terminalId.');

    try {
      const { client } = getMercadoPagoConfig();
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

// 3. CREAR PAGO (API de Payment Intents sin 'description' para evitar errores)
exports.createPointPayment = onCall(
  { 
    cors: true, 
    secrets: [mpAccessToken],
    invoker: 'public' // Asegura el acceso
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
        const { accessToken } = getMercadoPagoConfig();

        // API Específica de Point
        const url = `https://api.mercadopago.com/point/integration-api/devices/${terminalId}/payment-intents`;

        const paymentIntent = {
            amount: Math.round(amount * 100), // Monto en centavos
            
            // Notification URL para ganar puntos de calidad
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

    } catch(error) {
        console.error("Error creating payment:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || "No se pudo crear el pago.");
    }
});

// 4. WEBHOOK (V9 - FINAL CON SOPORTE PARA SIMULACIÓN)
exports.mercadoPagoWebhook = onRequest(
  {
    cors: true,
    invoker: 'public',
    secrets: [mpWebhookSecret, mpAccessToken],
  },
  async (request, response) => {
    console.log("========== [v9] MERCADO PAGO WEBHOOK RECEIVED ==========");

    const secret = mpWebhookSecret.value();
    if (!secret) {
      console.error("FATAL: Secret missing.");
      response.status(500).send("Secret missing.");
      return;
    }

    try {
      // 1. OBTENCIÓN DE DATOS (Más robusta para detectar variantes)
      const topic = request.query.type || request.query.topic || request.body.type;
      
      // Buscamos el ID en todos los lugares posibles
      const dataId = request.query['data.id'] || request.query.id || request.body.data?.id || request.body.id;

      console.log(`[v9] Topic: ${topic}, ID: ${dataId}`);

      // --- PASE VIP PARA SIMULACIÓN ---
      // Si es el ID de prueba de Mercado Pago, respondemos OK y terminamos.
      if (dataId === "123456") {
          console.log("[v9] Test simulation detected (123456). Returning OK.");
          response.status(200).send("OK");
          return;
      }
      // -------------------------------

      if (!dataId) {
          // Si no hay ID, respondemos 200 para que MP no reintente eternamente, pero logueamos error
          console.warn("[v9] No ID found in request.");
          response.status(200).send("OK");
          return;
      }

      // 2. VALIDACIÓN DE FIRMA (Híbrida)
      let signatureValid = false;
      const xSignature = request.headers['x-signature'];
      const xRequestId = request.headers['x-request-id'];

      if (xSignature && xRequestId) {
          const parts = xSignature.split(',');
          const ts = parts.find(p => p.startsWith('ts='))?.split('=')[1];
          const v1 = parts.find(p => p.startsWith('v1='))?.split('=')[1];

          if (ts && v1) {
              const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
              const hmac = crypto.createHmac('sha256', secret);
              hmac.update(manifest);
              const sha = hmac.digest('hex');
              if (sha === v1) signatureValid = true;
          }
      }

      if (!signatureValid) {
          console.warn(`[v9] ⚠️ Signature validation failed/missing for ID: ${dataId}. Checking API directly.`);
      }

      // 3. CONSULTA A LA API (Fuente de la verdad)
      const { accessToken } = getMercadoPagoConfig();
      
      // Consultamos el pago o la orden
      let paymentInfo = null;
      let externalReference = null;
      let status = null;
      let amount = 0;
      let paymentIdReal = dataId;

      // Intentamos consultar como Pago
      const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (paymentResponse.ok) {
          paymentInfo = await paymentResponse.json();
          externalReference = paymentInfo.external_reference;
          status = paymentInfo.status;
          amount = paymentInfo.transaction_amount;
      } else {
          // Si falló como pago, intentamos como Orden (Merchant Order) - Común en Point
          const orderResponse = await fetch(`https://api.mercadopago.com/merchant_orders/${dataId}`, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          
          if (orderResponse.ok) {
              const orderInfo = await orderResponse.json();
              externalReference = orderInfo.external_reference;
              status = orderInfo.status; // 'closed' suele significar pagado en ordenes
              // Buscamos el pago aprobado dentro de la orden
              const approvedPayment = orderInfo.payments?.find(p => p.status === 'approved');
              if (approvedPayment) {
                  amount = approvedPayment.transaction_amount;
                  status = 'approved'; // Forzamos status aprobado si encontramos el pago
                  paymentIdReal = approvedPayment.id;
              }
          }
      }

      console.log(`[v9] API Check Result: Status=${status}, Ref=${externalReference}`);

      // 4. ACTUALIZACIÓN DE FIRESTORE
      if (status === 'approved' && externalReference) {
          const ventaRef = admin.firestore().collection('ventas').doc(externalReference);
          
          await admin.firestore().runTransaction(async (t) => {
              const ventaDoc = await t.get(ventaRef);
              if (!ventaDoc.exists) return;

              const ventaData = ventaDoc.data();
              
              // Idempotencia
              if (ventaData.pago_estado === 'Pagado') return;

              // Propina
              const montoOriginal = Number(ventaData.total || 0);
              const montoPagado = Number(amount || 0);
              let propina = 0;
              
              if (montoPagado > montoOriginal) {
                  propina = parseFloat((montoPagado - montoOriginal).toFixed(2));
              }

              t.update(ventaRef, {
                  pago_estado: 'Pagado',
                  mercado_pago_status: 'approved',
                  mercado_pago_id: String(paymentIdReal),
                  monto_pagado_real: montoPagado,
                  propina: propina,
                  fecha_pago: new Date()
              });

              // Actualizar Reserva
              if (ventaData.reservationId) {
                  const reservaRef = admin.firestore().collection('reservas').doc(ventaData.reservationId);
                  const reservaDoc = await t.get(reservaRef);
                  if (reservaDoc.exists) {
                      t.update(reservaRef, { pago_estado: 'Pagado' });
                  }
              }
          });
          console.log(`[v9] SUCCESS: Venta ${externalReference} processed.`);
      } else {
          // Si no es aprobado o es irrelevante, respondemos OK para que MP deje de insistir
          console.log("[v9] Payment not approved or unknown reference. Ignoring.");
      }

    } catch (error) {
      console.error('[v9] Error processing webhook:', error);
      // Respondemos 200 OK incluso en error lógico para evitar bucles de reintentos infinitos de MP
      response.status(200).send('OK_WITH_ERROR'); 
      return;
    }

    response.status(200).send('OK');
  }
);