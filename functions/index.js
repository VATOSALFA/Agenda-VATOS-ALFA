
const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");
const {Buffer} = require("buffer");
const {v4: uuidv4} = require("uuid");
const fetch = require("node-fetch");
const { MercadoPagoConfig, Point } = require("mercadopago");

console.log('Functions starting up. Version: ' + new Date().toISOString());

// Initialize Firebase Admin SDK only once
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// --- MERCADO PAGO CONFIG (CORREGIDO PARA USAR FIRESTORE) ---
const getMercadoPagoConfig = async () => {
  const db = admin.firestore();
  const settingsDoc = await db.collection('configuracion').doc('pagos').get();
  
  if (!settingsDoc.exists) {
      throw new HttpsError('internal', 'La configuración de Mercado Pago no ha sido establecida en Firestore.');
  }
  
  const settings = settingsDoc.data();
  const accessToken = settings?.mercadoPagoAccessToken;
  
  if (!accessToken) {
      throw new HttpsError('internal', 'El Access Token de Mercado Pago no está configurado en Firestore.');
  }
  
  // Retorna el objeto de configuración del SDK y el token
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
    throw new Error(
      "Twilio credentials are not configured as environment variables."
    );
  }

  const twilioAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: `Basic ${twilioAuth}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download media from Twilio: ${response.status} ${response.statusText}`
    );
  }

  const imageBuffer = await response.buffer();

  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error(
      "Firebase Storage bucket not configured. Check NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET env var."
    );
  }
  const bucket = admin.storage().bucket(bucketName);

  const extension = mediaType.split("/")[1] || "jpeg";
  const fileName = `whatsapp_media/${from.replace(
    /\D/g,
    ""
  )}-${uuidv4()}.${extension}`;
  const file = bucket.file(fileName);

  await file.save(imageBuffer, {
    metadata: {
      contentType: mediaType,
      cacheControl: "public, max-age=31536000",
    },
  });
  
  await file.makePublic();
  
  return `https://storage.googleapis.com/${bucketName}/${fileName}`;
}

async function handleAutomatedReply(db, from, body) {
  const normalizedBody = body.toLowerCase().trim();
  const isConfirmation = normalizedBody.includes("confirmado");
  const isCancellation = normalizedBody.includes("cancelar");

  if (!isConfirmation && !isCancellation) {
    return false;
  }
  
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
  
  if (reservationQuery.empty) {
    console.log(`No upcoming reservations found for client ID: ${clientId}`);
    return false;
  }

  const reservationDoc = reservationQuery.docs[0];
  const reservation = reservationDoc.data();
  
  if (["Asiste", "Cancelado", "No asiste"].includes(reservation.estado)) {
      return false;
  }

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
    if (wasHandled) {
      return; 
    }
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

      if (mediaType.startsWith("image/")) {
        messageData.mediaType = "image";
      } else if (mediaType.startsWith("audio/")) {
        messageData.mediaType = "audio";
      } else if (mediaType === "application/pdf") {
        messageData.mediaType = "document";
      }
    } catch (mediaError) {
      console.error(
        `[MEDIA_ERROR] Failed to process media for ${from}:`,
        mediaError.message
      );
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
        const querySnapshot = await clientsRef
          .where("telefono", "==", phoneOnly)
          .limit(1)
          .get();

        if (!querySnapshot.empty) {
          const clientData = querySnapshot.docs[0].data();
          clientName = `${clientData.nombre} ${clientData.apellido}`;
        }
      } catch (clientError) {
        console.warn("Could not fetch client name:", clientError);
      }

      transaction.set(conversationRef, {
        clientName: clientName,
        lastMessageText,
        lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        unreadCount: 1,
      });
    }

    const messagesCollectionRef = conversationRef.collection("messages");
    const newMessageRef = messagesCollectionRef.doc();
    transaction.set(newMessageRef, messageData);
  });
}

exports.twilioWebhook = onRequest({cors: true}, async (request, response) => {
    try {
      const {From, Body, MediaUrl0, MediaContentType0} = request.body;

      if (!From) {
        console.error("Webhook received without 'From' parameter.");
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

exports.getPointTerminals = onCall({cors: true}, async ({ auth }) => {
  if (!auth) {
      throw new HttpsError('unauthenticated', 'La función debe ser llamada por un usuario autenticado.');
  }

  try {
      const { client } = await getMercadoPagoConfig();
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


exports.setTerminalPDVMode = onCall({cors: true}, async ({ auth, data }) => {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'La función debe ser llamada por un usuario autenticado.');
  }
  const { terminalId } = data;
  if (!terminalId) {
    throw new HttpsError('invalid-argument', 'The function must be called with a "terminalId" argument.');
  }

  try {
    const { client } = await getMercadoPagoConfig();
    const point = new Point(client);
    const result = await point.changeDeviceOperatingMode({
      device_id: terminalId,
      operating_mode: "PDV"
    });
    return { success: true, data: result };
  } catch (error) {
    console.error(`Error setting PDV mode for ${terminalId}:`, error);
    if (error instanceof HttpsError) {
        throw error;
    }
    throw new HttpsError('internal', error.message || `No se pudo activar el modo PDV para la terminal ${terminalId}.`);
  }
});


exports.createPointPayment = onCall({cors: true}, async ({ auth, data }) => {
    if (!auth) {
      throw new HttpsError('unauthenticated', 'La función debe ser llamada por un usuario autenticado.');
    }
    const { amount, terminalId, referenceId, payer, items } = data;

    if (!amount || !terminalId || !referenceId) {
        throw new HttpsError('invalid-argument', 'Missing required arguments: amount, terminalId, or referenceId.');
    }

    try {
        const { accessToken } = await getMercadoPagoConfig();

        const orderData = {
          type: "point",
          external_reference: referenceId,
          expiration_time: "PT15M", // 15 minutos para pagar
          payer: payer,
          items: items,
          transactions: {
              payments: [
                  {
                      amount: amount.toFixed(2).toString()
                  }
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
         if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', error.message || "No se pudo crear la intención de pago en la terminal.");
    }
});

exports.mercadoPagoWebhook = onRequest({cors: true}, async (request, response) => {
    console.log("========== MERCADO PAGO WEBHOOK RECEIVED ==========");
    
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    if (!secret) {
        console.error("MERCADO_PAGO_WEBHOOK_SECRET is not configured.");
        response.status(500).send("Webhook secret not configured.");
        return;
    }

    try {
        const xSignature = request.headers['x-signature'];
        const xRequestId = request.headers['x-request-id'];
        
        let dataId = request.query['data.id'];
        
        // CORRECCIÓN: Si `data` es un string, parsearlo.
        let notificationData = request.body.data;
        if (typeof notificationData === 'string') {
            try {
                notificationData = JSON.parse(notificationData);
            } catch (e) {
                console.error("Error parsing request.body.data, it's not valid JSON:", e.message);
                // Si no es un JSON válido, no podemos continuar.
                response.status(400).send("Invalid format for 'data' field in body.");
                return;
            }
        }
        
        // Si data.id no vino en la query, lo tomamos del body.
        if (!dataId && notificationData?.id) {
            dataId = notificationData.id;
        }
        
        console.log(`[Webhook] data.id found: ${dataId}`);
        console.log(`[Webhook] x-signature found: ${xSignature}`);
        console.log(`[Webhook] x-request-id found: ${xRequestId}`);

        if (!xSignature || !dataId) {
             console.warn("[Webhook] Webhook received without x-signature or data.id.");
             response.status(400).send("Missing required headers or data.id.");
             return;
        }

        const parts = xSignature.split(',');
        const tsPart = parts.find(p => p.startsWith('ts='));
        const v1Part = parts.find(p => p.startsWith('v1='));

        if (!tsPart || !v1Part) {
            console.warn("[Webhook] Invalid signature format");
            response.status(400).send("Invalid signature format.");
            return;
        }
        
        const ts = tsPart.split('=')[1];
        const v1 = v1Part.split('=')[1];
        
        // Construir el manifest según la documentación, manejando el `x-request-id` opcional.
        let manifest = `id:${String(dataId).toLowerCase()};`;
        if (xRequestId) {
           manifest += `request-id:${xRequestId};`;
        }
        manifest += `ts:${ts};`;
        
        console.log(`[Webhook] Generated manifest: ${manifest}`);
        
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(manifest);
        const sha = hmac.digest('hex');

        // Signature validation
        if (sha !== v1) {
            console.warn("[Webhook] Signature validation failed. Expected:", sha, "Got:", v1);
            response.status(403).send("Invalid signature.");
            return;
        }
        
        console.log("[Webhook] Signature validation successful.");
        
        const { body } = request;

        // Procesar la notificación de la orden
        if (body.type === 'order' && body.action === 'order.processed') {
             // CORRECCIÓN: La external_reference está DENTRO del objeto `data`.
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
                    console.log(`[Webhook] Updated sale ${externalReference} to 'Pagado' via order webhook.`);
                } else {
                     console.log(`[Webhook] Sale with external_reference ${externalReference} not found.`);
                }
            } else {
                 console.log("[Webhook] Webhook received for processed order without external_reference in data object.");
            }
        } else if (body.type === 'payment') {
            console.log("[Webhook] 'payment' type webhook received. Ignoring as we process 'order'.");
        }
    } catch (error) {
        console.error("[Webhook] Error processing Mercado Pago webhook:", error);
        // Responde 200 incluso con error para evitar que MP reintente.
        response.status(200).send("OK_WITH_ERROR");
        return;
    }
    
    console.log("===================================================");
    response.status(200).send("OK");
});

    