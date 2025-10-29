
const { https } = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const { getStorage } = require("firebase-admin/storage");
const { v4: uuidv4 } = require('uuid');

// Initialize Firebase Admin SDK only once
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * Downloads media from Twilio and uploads it to Firebase Storage.
 * @param {string} mediaUrl The private Twilio media URL.
 * @param {string} from The sender's WhatsApp number.
 * @param {string} mediaType The content type of the media.
 * @returns {Promise<string>} The public URL of the uploaded file in Firebase Storage.
 */
async function transferMediaToStorage(mediaUrl, from, mediaType) {
  const bucket = getStorage().bucket();

  // 1. Download from Twilio with Authentication
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
      console.error("Twilio credentials are not set in the function's environment.");
      throw new Error("Twilio credentials missing.");
  }

  const twilioResponse = await fetch(mediaUrl, {
    headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
    }
  });

  if (!twilioResponse.ok) {
    throw new Error(`Failed to download media from Twilio: ${twilioResponse.statusText}`);
  }

  const mediaBuffer = await twilioResponse.buffer();

  // 2. Upload to Firebase Storage
  const extension = mediaType.split('/')[1] || 'bin';
  const fileName = `whatsapp_media/${from.replace(/\D/g, '')}/${uuidv4()}.${extension}`;
  const file = bucket.file(fileName);

  await file.save(mediaBuffer, {
    metadata: {
      contentType: mediaType,
    },
  });

  // 3. Get public URL (make it public)
  await file.makePublic();

  return file.publicUrl();
}


/**
 * Saves an incoming message to the Firestore database.
 */
async function saveMessage(from, body, mediaUrl, mediaType) {
  try {
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
        console.error(`[MEDIA_ERROR] Failed to transfer media for ${from}:`, mediaError);
        // Fallback: add a note about the error
        messageData.text = (body || '') + `\n\n[Error al procesar archivo adjunto]`;
      }
    }

    await db.runTransaction(async (transaction) => {
      const convDoc = await transaction.get(conversationRef);
      const lastMessageText = body || (finalMediaUrl ? `[${messageData.mediaType || 'Archivo'}]` : '[Mensaje sin texto]');

      if (convDoc.exists) {
        transaction.update(conversationRef, {
          lastMessageText,
          lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
          unreadCount: admin.firestore.FieldValue.increment(1),
        });
      } else {
        let clientName = from;
        try {
            const phoneOnly = from.replace('whatsapp:+', '');
            const clientsRef = db.collection('clientes');
            // Check for phone with country code and without
            const q1 = clientsRef.where('telefono', '==', phoneOnly).limit(1);
            const q2 = clientsRef.where('telefono', '==', phoneOnly.slice(3)).limit(1); // Assuming +521 prefix
            
            let querySnapshot = await q1.get();
            if (querySnapshot.empty) {
                querySnapshot = await q2.get();
            }

            if (!querySnapshot.empty) {
                const clientData = querySnapshot.docs[0].data();
                clientName = `${clientData.nombre} ${clientData.apellido}`;
            }
        } catch(clientError) {
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

    console.log(`Message from ${from} saved successfully.`);

  } catch (error) {
    console.error(`[CRITICAL] Failed to save message from ${from}:`, error);
  }
}

/**
 * Cloud Function to handle incoming Twilio webhook requests.
 */
exports.twilioWebhook = https.onRequest({secrets: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "NEXT_PUBLIC_TWILIO_PHONE_NUMBER"]}, async (request, response) => {
  try {
    const { From, Body, MediaUrl0, MediaContentType0 } = request.body;

    if (!From) {
      console.error("Webhook received without 'From' parameter.");
      response.status(200).send('<Response/>');
      return;
    }

    await saveMessage(From, Body, MediaUrl0, MediaContentType0);
    
    response.set('Content-Type', 'text/xml');
    response.status(200).send('<Response/>');

  } catch (error) {
    console.error('[FATAL] Unhandled error in twilioWebhook function:', error);
    response.set('Content-Type', 'text/xml');
    response.status(200).send('<Response/>');
  }
});
