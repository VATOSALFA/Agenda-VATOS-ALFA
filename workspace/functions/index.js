
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK only once
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * Saves an incoming message to the Firestore database.
 * This function is designed to be robust and not throw errors that would crash the main function.
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
    if (mediaUrl) {
      messageData.mediaUrl = mediaUrl;
      if (mediaType?.startsWith("image/")) {
        messageData.mediaType = "image";
      } else if (mediaType?.startsWith("audio/")) {
        messageData.mediaType = "audio";
      } else if (mediaType === "application/pdf") {
        messageData.mediaType = "document";
      }
    }

    // Use a transaction to ensure atomicity
    await db.runTransaction(async (transaction) => {
      const convDoc = await transaction.get(conversationRef);
      const lastMessageText = body || `[${messageData.mediaType || 'Archivo'}]`;

      if (convDoc.exists) {
        transaction.update(conversationRef, {
          lastMessageText,
          lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
          unreadCount: admin.firestore.FieldValue.increment(1),
        });
      } else {
        // Attempt to find client name from phone number
        let clientName = from; // Default to phone number
        try {
            const phoneOnly = from.replace('whatsapp:+', '');
            const clientsRef = db.collection('clientes');
            const querySnapshot = await clientsRef.where('telefono', '==', phoneOnly).limit(1).get();
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
    // We log the error but don't re-throw, to avoid a 500 error to Twilio.
  }
}

/**
 * Cloud Function to handle incoming Twilio webhook requests.
 */
exports.twilioWebhook = onRequest(async (request, response) => {
  try {
    // The body is parsed by Cloud Functions for `application/x-www-form-urlencoded`
    const { From, Body, MediaUrl0, MediaContentType0 } = request.body;

    if (!From) {
      console.error("Webhook received without 'From' parameter.");
      // Still send a 200 to Twilio to prevent retries for a bad request
      response.status(200).send('<Response/>');
      return;
    }

    // Asynchronously save the message, but don't block the response to Twilio.
    // We don't await this, allowing the response to be sent immediately.
    saveMessage(From, Body, MediaUrl0, MediaContentType0);
    
    // Respond to Twilio immediately with an empty TwiML response to acknowledge receipt.
    response.set('Content-Type', 'text/xml');
    response.status(200).send('<Response/>');

  } catch (error) {
    console.error('[FATAL] Unhandled error in twilioWebhook function:', error);
    // If something unexpected goes wrong, send a generic success to Twilio
    // to prevent it from retrying, while logging the real error.
    response.set('Content-Type', 'text/xml');
    response.status(200).send('<Response/>');
  }
});
