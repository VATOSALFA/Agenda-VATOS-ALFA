/**
 * Importamos las funciones de la Versión 2 (Gen 2)
 */
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
// IMPORTANTE: Importamos defineSecret para conectar con tus secretos de la imagen
const { defineSecret } = require("firebase-functions/params");

const admin = require("firebase-admin");
const crypto = require("crypto");
const { Buffer } = require("buffer");
const { v4: uuidv4 } = require("uuid");
const fetch = require("node-fetch");
const { MercadoPagoConfig, Point } = require("mercadopago");

// --- DEFINICIÓN DE SECRETOS (Conectando con Google Cloud Secret Manager) ---
// Estos nombres deben coincidir EXACTO con tu captura de pantalla
const mpAccessToken = defineSecret("MERCADO_PAGO_ACCESS_TOKEN");
const mpWebhookSecret = defineSecret("MERCADO_PAGO_WEBHOOK_SECRET");

// Configuración global
setGlobalOptions({ region: "us-central1" });

console.log('Functions starting up (Gen 2 - Secrets Fixed). Version: ' + new Date().toISOString());

// Initialize Firebase Admin SDK only once
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// --- NUEVA CONFIGURACIÓN DE MERCADO PAGO ---
// Ya no es async porque leer el secreto es instantáneo con .value()
const getMercadoPagoConfig = () => {
  // Leemos el secreto directamente. Si no existe, devuelve undefined.
  const accessToken = mpAccessToken.value();

  if (!accessToken) {
    // Si ves este error en los logs, es que falta dar permiso al secreto en el deploy
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

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials are not configured as environment variables.");
  }

  const twilioAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${twilioAuth}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to download media from Twilio: ${response.status} ${response.statusText}`);
  }

  const imageBuffer = await response.buffer();
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error("Firebase Storage bucket not configured.");
  }
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

exports.getPointTerminals = onCall(
  { 
    cors: true, 
    secrets: [mpAccessToken] // <--- AQUÍ DAMOS PERMISO PARA USAR EL SECRETO
  }, 
  async (request) => {
    // Restauramos la seguridad porque al arreglar el secreto, esto ya funcionará bien
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'La función debe ser llamada por un usuario autenticado.');
    }

    try {
        // Obtenemos la config directamente del secreto (ya no usa await)
        const { client } = getMercadoPagoConfig();
        const point = new Point(client); 
        
        const devices = await point.getDevices({}); 

        return { success: true, devices: devices.devices || [] };
    } catch(error) {
        console.error("Error fetching Mercado Pago terminals: ", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', error.message || "No se pudo comunicar con Mercado Pago para obtener las terminales.");
    }
});


exports.setTerminalPDVMode = onCall(
  { 
    cors: true,
    secrets: [mpAccessToken] // <--- PERMISO SECRETO
  }, 
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'La función debe ser llamada por un usuario autenticado.');
    }
    const { terminalId } = request.data;
    if (!terminalId) {
      throw new HttpsError('invalid-argument', 'The function must be called with a "terminalId" argument.');
    }

    try {
      const { client } = getMercadoPagoConfig();
      const point = new Point(client);
      const result = await point.changeDeviceOperatingMode({
        device_id: terminalId,
        operating_mode: "PDV"
      });
      return { success: true, data: result };
    } catch (error) {
      console.error(`Error setting PDV mode for ${terminalId}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', error.message || `No se pudo activar el modo PDV para la terminal ${terminalId}.`);
    }
});


exports.createPointPayment = onCall(
  { 
    cors: true,
    secrets: [mpAccessToken] // <--- PERMISO SECRETO
  }, 
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'La función debe ser llamada por un usuario autenticado.');
    }
    const { amount, terminalId, referenceId, payer, items } = request.data;

    if (!amount || !terminalId || !referenceId) {
        throw new HttpsError('invalid-argument', 'Missing required arguments.');
    }

    try {
        const { accessToken } = getMercadoPagoConfig();

        const orderData = {
          type: "point",
          external_reference: referenceId,
          expiration_time: "PT15M",
          payer: payer,
          items: items,
          transactions: {
              payments: [
                  { amount: amount.toFixed(2).toString() }
              ]
          },
          config: {
              point: {
                  terminal_id: terminalId,
                  print_on_terminal: "no_ticket"
              },
              payment_method: {
                  default_type: "credit_card"
              }
          },
          description: `Venta en VATOS ALFA`,
        };

        const response = await fetch('https://api.mercadopago.com/v1/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'X-Idempotency-Key': uuidv4()
          },
          body: JSON.stringify(orderData),
        });

        const result = await response.json();

        if (!response.ok) {
          console.error("Error response from Mercado Pago:", result);
          throw new HttpsError('internal', result.message || 'Error al crear la orden de pago en Mercado Pago.');
        }

        return { success: true, data: result };
    } catch(error) {
        console.error("Error creating payment order:", error);
         if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message || "No se pudo crear la intención de pago en la terminal.");
    }
});

// WEBHOOK CORREGIDO PARA USAR defineSecret
exports.mercadoPagoWebhook = onRequest(
  {
    cors: true, 
    invoker: "public",
    secrets: [mpWebhookSecret] // <--- PERMISO SECRETO WEBHOOK
  }, 
  async (request, response) => {
    console.log("========== [v4] MERCADO PAGO WEBHOOK RECEIVED ==========");
    
    // 1. Get the Secret using .value()
    const secret = mpWebhookSecret.value();

    if (!secret) {
        console.error("FATAL: MERCADO_PAGO_WEBHOOK_SECRET is not configured in Secret Manager.");
        response.status(500).send("Webhook secret not configured.");
        return;
    }
    console.log("[v4] Secret found. Proceeding with validation.");

    try {
        // ... (El resto de tu lógica de validación sigue igual, solo cambia el log a v4)
        const xSignature = request.headers['x-signature'];
        const xRequestId = request.headers['x-request-id']; 
        const dataIdFromQuery = request.query['data.id'];

        if (!xSignature) {
            console.warn("[v4] Webhook received without 'x-signature' header.");
            response.status(400).send("Missing 'x-signature' header.");
            return;
        }
        
        if (!dataIdFromQuery) {
            console.warn("[v4] Webhook received without 'data.id'.");
            response.status(400).send("Missing 'data.id'.");
            return;
        }

        const parts = xSignature.split(',');
        const tsPart = parts.find(p => p.startsWith('ts='));
        const v1Part = parts.find(p => p.startsWith('v1='));

        if (!tsPart || !v1Part) {
            console.warn("[v4] Invalid 'x-signature' format.");
            response.status(400).send("Invalid signature format.");
            return;
        }
        
        const ts = tsPart.split('=')[1];
        const v1 = v1Part.split('=')[1];
        
        const manifest = `id:${dataIdFromQuery};request-id:${xRequestId};ts:${ts};`;
        
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(manifest);
        const sha = hmac.digest('hex');

        if (sha !== v1) {
            console.warn("[v4] SIGNATURE VALIDATION FAILED. Expected:", sha, "Got:", v1);
            response.status(403).send("Invalid signature.");
            return;
        }
        
        console.log("[v4] Signature validation SUCCESSFUL.");
        
        const { body } = request;
        let notificationData = body.data;
        if (typeof notificationData === 'string') {
            try { notificationData = JSON.parse(notificationData); } catch (e) {}
        }
        
        if (body.type === 'order' && body.action === 'order.processed') {
             const externalReference = notificationData?.external_reference;
             if (externalReference) {
                const ventaRef = admin.firestore().collection('ventas').doc(externalReference);
                const ventaDoc = await ventaRef.get();
                if (ventaDoc.exists) {
                    await ventaRef.update({
                        pago_estado: 'Pagado',
                        mercado_pago_status: 'processed',
                        mercado_pago_id: notificationData?.id,
                    });
                    console.log(`[v4] Updated sale ${externalReference} to 'Pagado'.`);
                }
            }
        }
    } catch (error) {
        console.error("[v4] FATAL Error processing webhook:", error);
        response.status(200).send("OK_WITH_ERROR");
        return;
    }
    
    response.status(200).send("OK");
});