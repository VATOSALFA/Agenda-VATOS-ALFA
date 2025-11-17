

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

/**
 * Downloads media from Twilio and uploads it to Firebase Storage.
 * @param {string} mediaUrl The private Twilio media URL.
 * @param {string} from The sender's phone number.
 * @param {string} mediaType The MIME type of the media.
 * @returns {Promise<string>} The public URL of the uploaded file in Firebase Storage.
 */
async function transferMediaToStorage(mediaUrl, from, mediaType) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error(
      "Twilio credentials are not configured as environment variables."
    );
  }

  // 1. Download from Twilio using Basic Authentication
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

  // 2. Upload to Firebase Storage
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error(
      "Firebase Storage bucket not configured. Check NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET env var."
    );
  }
  const bucket = admin.storage().bucket(bucketName);

  const extension = mediaType.split("/")[1] || "jpeg"; // E.g., 'image/jpeg' -> 'jpeg'
  const fileName = `whatsapp_media/${from.replace(
    /\D/g,
    ""
  )}-${uuidv4()}.${extension}`;
  const file = bucket.file(fileName);

  await file.save(imageBuffer, {
    metadata: {
      contentType: mediaType,
      cacheControl: "public, max-age=31536000", // Cache for 1 year
    },
  });
  
  // 3. Make the file public and return its public URL
  await file.makePublic();
  
  return `https://storage.googleapis.com/${bucketName}/${fileName}`;
}


/**
 * Handles automated replies for appointment confirmation/cancellation.
 * @param {admin.firestore.Firestore} db The Firestore database instance.
 * @param {string} from The sender's phone number (e.g., 'whatsapp:+1...').
 * @param {string} body The text of the incoming message.
 * @returns {Promise<boolean>} True if the reply was handled as a command, false otherwise.
 */
async function handleAutomatedReply(db, from, body) {
  const normalizedBody = body.toLowerCase().trim();
  const isConfirmation = normalizedBody.includes("confirmado");
  const isCancellation = normalizedBody.includes("cancelar");

  if (!isConfirmation && !isCancellation) {
    return false; // Not a command we handle automatically
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
  today.setHours(0, 0, 0, 0); // Start of today
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
  
  // Don't process already finalized states
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

  return true; // Command was handled
}


/**
 * Saves a general incoming message to the Firestore database.
 */
async function saveMessage(from, body, mediaUrl, mediaType) {
  const db = admin.firestore();

  // First, try to handle it as an automated reply.
  if (body) {
    const wasHandled = await handleAutomatedReply(db, from, body);
    if (wasHandled) {
      // If it was a confirmation/cancellation, we don't need to save it as a chat message.
      return; 
    }
  }

  const conversationId = from; // e.g., 'whatsapp:+14155238886'
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

  // Use a transaction to ensure atomicity
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

/**
 * Cloud Function to handle incoming Twilio webhook requests.
 */
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
          external_reference: referenceId,
          title: "Venta en VATOS ALFA",
          description: `Venta en VATOS ALFA Barber Shop`,
          notification_url: `https://us-central1-agenda-1ae08.cloudfunctions.net/mercadoPagoWebhook`,
          total_amount: amount,
          items: items,
        };

        const response = await fetch(`https://api.mercadopago.com/point/integration-api/devices/${terminalId}/payment-intents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
              amount: amount,
              additional_info: {
                  external_reference: referenceId,
                  print_on_terminal: false,
                  ...orderData
              }
          })
        });

        const pointResult = await response.json();

         if (!response.ok) {
          console.error("Error response from Mercado Pago Point:", pointResult);
          throw new HttpsError('internal', pointResult.message || 'Error al enviar la intención de pago a la terminal.');
        }


        return { success: true, data: pointResult };
    } catch(error) {
        console.error("Error creating payment order:", error);
         if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', error.message || "No se pudo crear la intención de pago en la terminal.");
    }
});


exports.mercadoPagoWebhook = onRequest({cors: true}, async (request, response) => {
    console.log("========== MERCADO PAGO WEBHOOK (ORDER) RECEIVED ==========");
    
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    if (!secret) {
        console.error("MERCADO_PAGO_WEBHOOK_SECRET is not configured.");
        // DO NOT send 500, as MP will keep retrying.
        response.status(200).send("OK_NO_SECRET");
        return;
    }

    try {
        const { body, headers, query } = request;
        
        console.log("Webhook Body:", JSON.stringify(body));
        console.log("Webhook Query:", JSON.stringify(query));
        console.log("Webhook Headers:", JSON.stringify(headers));

        const xSignature = headers['x-signature'];
        const xRequestId = headers['x-request-id'];

        // For "order" type, the data.id is in the body, not the query params.
        const dataId = body?.data?.id;

        if (!xSignature || !xRequestId || !dataId) {
            console.warn("Webhook received without x-signature, x-request-id, or data.id in body.");
            response.status(200).send("OK_MISSING_HEADERS_OR_ID");
            return;
        }

        const parts = xSignature.split(',');
        const tsPart = parts.find(p => p.startsWith('ts='));
        const v1Part = parts.find(p => p.startsWith('v1='));

        if (!tsPart || !v1Part) {
            console.warn("Invalid signature format");
            response.status(200).send("OK_INVALID_SIGNATURE_FORMAT");
            return;
        }
        
        const ts = tsPart.split('=')[1];
        const v1 = v1Part.split('=')[1];
        
        // As per MP docs, for validation, data.id must be lowercase.
        const manifest = `id:${String(dataId).toLowerCase()};request-id:${xRequestId};ts:${ts};`;
        console.log("Generated Manifest for HMAC:", manifest);
        
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(manifest);
        const sha = hmac.digest('hex');
        
        console.log("Calculated Signature (sha):", sha);
        console.log("Received Signature (v1):", v1);

        if (sha !== v1) {
            console.warn("Webhook signature validation FAILED.");
            response.status(200).send("OK_SIGNATURE_VALIDATION_FAILED");
            return;
        }
        
        console.log("Webhook signature validation successful.");
        
        // Process the notification
        if (body.action === 'order.processed') {
            const externalReference = body.data?.external_reference;
            const orderStatus = body.data?.status;

            if (orderStatus === 'processed' && externalReference) {
                console.log(`Processing approved order for external reference: ${externalReference}`);
                const ventaRef = admin.firestore().collection('ventas').doc(externalReference);
                const ventaDoc = await ventaRef.get();
                if (ventaDoc.exists) {
                    await ventaRef.update({
                        pago_estado: 'Pagado',
                        mercado_pago_status: 'processed',
                        mercado_pago_order_id: dataId,
                    });
                    console.log(`Updated sale ${externalReference} to 'Pagado'.`);
                } else {
                     console.warn(`Sale with reference ${externalReference} not found.`);
                }
            } else {
                console.log(`Order ${dataId} not in 'processed' state or missing external reference.`);
            }
        } else {
             console.log(`Received action '${body.action}', which is not 'order.processed'. No action taken.`);
        }

    } catch (error) {
        console.error("FATAL Error processing Mercado Pago webhook:", error);
        // Respond with 200 even on error to prevent MP from retrying indefinitely
        response.status(200).send("OK_WITH_ERROR");
        return;
    }
    
    console.log("===================================================");
    response.status(200).send("OK");
});
    

    

```