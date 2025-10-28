
const { onRequest } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { initializeApp, getApps } = require("firebase-admin/app");

// Initialize Firebase Admin SDK only once
if (getApps().length === 0) {
  initializeApp();
}

/**
 * Saves an incoming message to the Firestore database.
 * This function is designed to be robust and not throw errors that would crash the main function.
 */
async function saveMessage(from, body, mediaUrl, mediaType) {
  try {
    const db = getFirestore();
    const conversationId = from;
    const conversationRef = db.collection("conversations").doc(conversationId);

    const messageData = {
      senderId: "client",
      timestamp: FieldValue.serverTimestamp(),
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
          lastMessageTimestamp: FieldValue.serverTimestamp(),
          unreadCount: FieldValue.increment(1),
        });
      } else {
        transaction.set(conversationRef, {
          clientName: from,
          lastMessageText,
          lastMessageTimestamp: FieldValue.serverTimestamp(),
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
