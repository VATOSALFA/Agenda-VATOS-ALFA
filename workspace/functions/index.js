
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// Initialize Firebase Admin SDK
if (getApps().length === 0) {
  initializeApp();
}

/**
 * Saves an incoming message to the Firestore database.
 * @param {string} from The sender's WhatsApp number.
 * @param {string | null} body The text of the message.
 * @param {string | null} mediaUrl The URL of any attached media.
 * @param {string | null} mediaType The MIME type of the media.
 */
async function saveMessage(from, body, mediaUrl, mediaType) {
  const db = getFirestore();
  const conversationId = from; // e.g., 'whatsapp:+14155238886'
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

    const lastMessageText = body || `[${messageData.mediaType || "Archivo"}]`;

    if (convDoc.exists) {
      transaction.update(conversationRef, {
        lastMessageText,
        lastMessageTimestamp: FieldValue.serverTimestamp(),
        unreadCount: FieldValue.increment(1),
      });
    } else {
      transaction.set(conversationRef, {
        lastMessageText,
        lastMessageTimestamp: FieldValue.serverTimestamp(),
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
exports.twiliowebhook = onRequest(
  {
    // This makes the function publicly accessible
    invoker: "public",
    // This ensures the function is in the same region as your Firestore
    region: "us-central1", 
  },
  async (req, res) => {
    // We only accept POST requests
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    try {
      const from = req.body.From;
      const body = req.body.Body || null;
      const mediaUrl = req.body.MediaUrl0 || null;
      const mediaType = req.body.MediaContentType0 || null;

      if (!from) {
        console.error("Webhook received without 'From' parameter.");
        res.status(400).send("Missing 'From' parameter");
        return;
      }

      // Asynchronously save the message. We don't wait for it to finish.
      saveMessage(from, body, mediaUrl, mediaType).catch(console.error);

      // Respond to Twilio immediately to acknowledge receipt.
      res.setHeader("Content-Type", "text/xml");
      res.status(200).send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>");
    } catch (error) {
      console.error("Error processing Twilio webhook:", error);
      res.status(500).send("Internal Server Error");
    }
  }
);
