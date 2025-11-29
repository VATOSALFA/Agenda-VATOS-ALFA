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

console.log('Functions starting up (Gen 2 - Final V7). Version: ' + new Date().toISOString());

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
    invoker: 'public'
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
    invoker: 'public'
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

// 3. CREAR PAGO
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
    
    const { amount, terminalId, referenceId, payer } = request.data;

    if (!amount || !terminalId || !referenceId) {
        throw new HttpsError('invalid-argument', 'Faltan datos requeridos.');
    }

    try {
        const { accessToken } = getMercadoPagoConfig();
        const url = `https://api.mercadopago.com/point/integration-api/devices/${terminalId}/payment-intents`;

        const paymentIntent = {
            amount: Math.round(amount * 100),
            notification_url: "https://us-central1-agenda-1ae08.cloudfunctions.net/mercadoPagoWebhook",
            additional_info: {
                external_reference: referenceId,
                print_on_terminal: true, 
            },
            payer: payer ? { email: payer.email } : undefined,
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

// 4. WEBHOOK (CORRECCIÓN FINAL V4)
exports.mercadoPagoWebhook = onRequest(
  {
    cors: true,
    invoker: 'public',
    secrets: [mpWebhookSecret],
  },
  async (request, response) => {
    console.log("========== [vFINAL-4] MERCADO PAGO WEBHOOK RECEIVED ==========");
    console.log('Request Query:', JSON.stringify(request.query));
    console.log('Request Body:', JSON.stringify(request.body));
    console.log('Request Headers:', JSON.stringify(request.headers));

    try {
      const topic = request.query.type || request.body.type;
      const paymentId = request.query['data.id'] || request.body.data?.id;

      if (topic === 'payment' && paymentId) {
        // --- Standard Payment Webhook with Signature ---
        console.log(`[vFINAL-4] Handling 'payment' topic for ID: ${paymentId}`);

        const secret = mpWebhookSecret.value();
        if (!secret) {
          throw new Error("Webhook secret is not configured.");
        }
        
        const xSignature = request.headers['x-signature'];
        const xRequestId = request.headers['x-request-id'];

        if (!xSignature || !xRequestId) {
          console.warn("[vFINAL-4] 'payment' topic missing x-signature or x-request-id headers.");
          response.status(400).send("Bad Request: Missing signature headers.");
          return;
        }

        const parts = xSignature.split(',');
        const tsPart = parts.find(p => p.startsWith('ts='));
        const v1Part = parts.find(p => p.startsWith('v1='));

        if (!tsPart || !v1Part) {
          response.status(400).send("Invalid signature format.");
          return;
        }
        
        const ts = tsPart.split('=')[1];
        const v1 = v1Part.split('=')[1];
        
        const manifest = `id:${paymentId};request-id:${xRequestId};ts:${ts};`;
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(manifest);
        const sha = hmac.digest('hex');

        if (sha !== v1) {
          console.warn("[vFINAL-4] Invalid signature for 'payment' topic.");
          response.status(403).send("Invalid signature.");
          return;
        }

        console.log("[vFINAL-4] Signature OK for 'payment' topic.");
        await processPayment(paymentId);

      } else if (request.body.action === 'order.processed') {
          // --- Point Payment Webhook (order) ---
          const orderId = request.body.data?.id;
          console.log(`[vFINAL-4] Handling 'order.processed' action for Order ID: ${orderId}`);
          
          if (!orderId) {
              console.error("[vFINAL-4] No data.id found in 'order.processed' notification body.");
              response.status(400).send("Bad Request: Missing order ID.");
              return;
          }

          // For Point orders, we need to fetch the order to get the payment details
          const { accessToken } = getMercadoPagoConfig();
          const orderInfoResponse = await fetch(`https://api.mercadopago.com/merchant_orders/${orderId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          const orderInfo = await orderInfoResponse.json();
          
          const paymentIdFromOrder = orderInfo.payments?.[0]?.id;

          if (paymentIdFromOrder && orderInfo.status === 'closed' && orderInfo.order_status === 'paid') {
              console.log(`[vFINAL-4] Order ${orderId} is paid. Processing Payment ID: ${paymentIdFromOrder}`);
              await processPayment(paymentIdFromOrder, orderInfo.external_reference);
          } else {
              console.log(`[vFINAL-4] Order ${orderId} not in a processable state.`);
          }
          
      } else {
        console.log(`[vFINAL-4] Unhandled topic/type: '${topic}' or action: '${request.body.action}'`);
      }

      response.status(200).send('OK');

    } catch (error) {
      console.error('[vFINAL-4] Error processing webhook:', error);
      response.status(500).send('Internal Server Error');
    }
  }
);


async function processPayment(paymentId, externalRefFromOrder = null) {
  const { accessToken } = getMercadoPagoConfig();
  const paymentInfoResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const paymentInfo = await paymentInfoResponse.json();

  const externalReference = paymentInfo?.external_reference || externalRefFromOrder;

  if (externalReference && paymentInfo.status === 'approved') {
      const ventaRef = admin.firestore().collection('ventas').doc(externalReference);
      
      const ventaDoc = await ventaRef.get();
      
      if (!ventaDoc.exists) {
          console.error(`[vFINAL-4] Sale document with external_reference ${externalReference} not found.`);
          return;
      }

      const ventaData = ventaDoc.data();
      const montoPagado = Number(paymentInfo?.transaction_details?.total_paid_amount || paymentInfo?.transaction_amount || 0);
      const montoOriginal = Number(ventaData.total || 0);
      
      let propina = 0;
      if (montoPagado > montoOriginal) {
          propina = parseFloat((montoPagado - montoOriginal).toFixed(2));
      }

      await ventaRef.update({
          pago_estado: 'Pagado',
          mercado_pago_status: 'approved',
          mercado_pago_id: paymentInfo.id,
          monto_pagado_real: montoPagado,
          propina: propina,
      });
      
      console.log(`[vFINAL-4] Venta ${externalReference} UPDATED to PAGADO. Total: ${montoPagado}, Propina: ${propina}`);
  } else {
      console.log(`[vFINAL-4] Payment ${paymentId} not approved or no external_reference found.`);
  }
}
