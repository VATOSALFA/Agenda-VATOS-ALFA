
const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {Buffer} = require("buffer");
const {v4: uuidv4} = require("uuid");
const fetch = require("node-fetch");

// Initialize Firebase Admin SDK only once
if (admin.apps.length === 0) {
  admin.initializeApp();
}

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
 * Saves an incoming message to the Firestore database.
 */
async function saveMessage(from, body, mediaUrl, mediaType) {
  const db = admin.firestore();
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
exports.twilioWebhook = onRequest(
  {secrets: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"]},
  async (request, response) => {
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
