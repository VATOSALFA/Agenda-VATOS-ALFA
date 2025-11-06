
const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {Buffer} = require("buffer");
const {v4: uuidv4} = require("uuid");
const fetch = require("node-fetch");
const { MercadoPagoConfig, Point } = require("mercadopago");

console.log('Functions starting up. Version: ' + new Date().toISOString());

// Initialize Firebase Admin SDK only once
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// --- MERCADO PAGO CONFIG ---
const getMercadoPagoClient = () => {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) {
        console.error("MERCADO_PAGO_ACCESS_TOKEN is not set in the server environment.");
        throw new HttpsError('internal', 'El access token de Mercado Pago no está configurado en el servidor. Revisa los secretos de la aplicación.');
    }
    return new MercadoPagoConfig({ accessToken });
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
exports.twilioWebhook = onRequest(async (request, response) => {
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

exports.getPointTerminals = onCall(async (request) => {
  try {
    const client = getMercadoPagoClient();
    const point = new Point(client);
    const devices = await point.getDevices();
    return { success: true, devices: devices.devices };
  } catch(error) {
    console.error("Error fetching Mercado Pago terminals: ", error);
    if (error instanceof HttpsError) {
        throw error;
    }
    throw new HttpsError('internal', error.message || "No se pudo comunicar con Mercado Pago para obtener las terminales.");
  }
});


exports.setTerminalPDVMode = onCall(async (request) => {
  const { terminalId } = request.data;
  if (!terminalId) {
    throw new HttpsError('invalid-argument', 'The function must be called with a "terminalId" argument.');
  }

  try {
    const client = getMercadoPagoClient();
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


exports.createPointPayment = onCall(async (request) => {
    const { amount, terminalId, referenceId } = request.data;

    if (!amount || !terminalId || !referenceId) {
        throw new HttpsError('invalid-argument', 'Missing required arguments: amount, terminalId, or referenceId.');
    }

    try {
        const client = getMercadoPagoClient();
        const point = new Point(client);

        const result = await point.createPaymentIntent({
            device_id: terminalId,
            body: {
                amount: amount,
                payment: {
                    type: "credit_card",
                    installments: 1
                },
                additional_info: {
                    external_reference: referenceId,
                    print_on_terminal: true,
                }
            }
        });

        return { success: true, data: result };
    } catch(error) {
        console.error("Error creating payment intent:", error);
         if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', error.message || "No se pudo crear la intención de pago en la terminal.");
    }
});


exports.mercadoPagoWebhookTest = onRequest(async (request, response) => {
  console.log("========== MERCADO PAGO WEBHOOK RECEIVED ==========");
  console.log("Headers:", JSON.stringify(request.headers, null, 2));
  console.log("Body:", JSON.stringify(request.body, null, 2));
  console.log("===================================================");
  
  // You would typically verify the signature here using the webhook secret
  // const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  // ... verification logic ...
  
  // For now, we just log and respond.
  // In a real app, you would process the payment status from the body
  // and update your database (e.g., mark an order as 'paid').
  
  response.status(200).send("OK");
});
