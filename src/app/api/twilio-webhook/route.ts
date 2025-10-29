
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-server';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { Buffer } from 'buffer';

// These exports are required for Next.js API Routes.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'default-no-store';

/**
 * Downloads media from Twilio and uploads it to Firebase Storage.
 * @param {string} mediaUrl The private Twilio media URL.
 * @returns {Promise<string>} The public URL of the uploaded file in Firebase Storage.
 */
async function transferMediaToStorage(mediaUrl: string, from: string, mediaType: string): Promise<string> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials are not configured for media transfer.');
  }

  // 1. Download from Twilio
  const twilioAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: `Basic ${twilioAuth}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download media from Twilio: ${response.statusText}`);
  }

  const imageBuffer = await response.arrayBuffer();
  
  // 2. Upload to Firebase Storage
  const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  if (!bucket) {
      throw new Error("Firebase Storage bucket not configured.");
  }

  const extension = mediaType.split('/')[1] || 'jpeg';
  const fileName = `whatsapp_media/${from.replace(/\D/g, '')}-${Date.now()}.${extension}`;
  const file = bucket.file(fileName);

  await file.save(Buffer.from(imageBuffer), {
    metadata: {
      contentType: mediaType,
      cacheControl: 'public, max-age=31536000',
    },
  });

  // 3. Get Public URL
  return file.publicUrl();
}


/**
 * Saves an incoming message to the Firestore database.
 */
async function saveMessage(from: string, body: string | null, mediaUrl: string | null, mediaType: string | null) {
  const db = getDb();
  if (!db) {
    console.error("Database not initialized for webhook.");
    throw new Error("Database not initialized for webhook.");
  }
  const conversationId = from; // e.g., 'whatsapp:+14155238886'
  const conversationRef = db.collection('conversations').doc(conversationId);

  const messageData: any = {
    senderId: 'client',
    timestamp: FieldValue.serverTimestamp(),
    read: false,
  };

  if (body) {
    messageData.text = body;
  }
  
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

    } catch (mediaError: any) {
      console.error(`[MEDIA_ERROR] Failed to process media for ${from}:`, mediaError.message);
      messageData.text = (body || '') + `\n\n[Error al procesar archivo adjunto]`;
    }
  }

  // Use a transaction to ensure atomicity
  await db.runTransaction(async (transaction) => {
    const convDoc = await transaction.get(conversationRef);

    const lastMessageText = body || (finalMediaUrl ? `[${messageData.mediaType || 'Archivo'}]` : '[Mensaje sin texto]');

    if (convDoc.exists) {
      transaction.update(conversationRef, {
        lastMessageText,
        lastMessageTimestamp: FieldValue.serverTimestamp(),
        unreadCount: FieldValue.increment(1),
      });
    } else {
        let clientName = from;
        try {
            const phoneOnly = from.replace(/\D/g, '').slice(-10); // Get last 10 digits
            const clientsRef = db.collection('clientes');
            const querySnapshot = await clientsRef.where('telefono', '==', phoneOnly).limit(1).get();

            if (!querySnapshot.empty) {
                const clientData = querySnapshot.docs[0].data();
                clientName = `${clientData.nombre} ${clientData.apellido}`;
            }
        } catch(clientError: any) {
            console.warn("Could not fetch client name:", clientError.message);
        }

        transaction.set(conversationRef, {
            clientName: clientName,
            lastMessageText,
            lastMessageTimestamp: FieldValue.serverTimestamp(),
            unreadCount: 1,
        });
    }

    const messagesCollectionRef = conversationRef.collection("messages");
    const newMessageRef = messagesCollectionRef.doc(); // Auto-generate ID
    transaction.set(newMessageRef, messageData);
  });
}

/**
 * API Route to handle incoming Twilio webhook requests.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const from = formData.get('From') as string;
    const body = formData.get('Body') as string | null;
    const mediaUrl = formData.get('MediaUrl0') as string | null;
    const mediaType = formData.get('MediaContentType0') as string | null;
    
    if (!from) {
      console.error("Webhook received without 'From' parameter.");
      return new NextResponse('Missing "From" parameter', { status: 400 });
    }
    
    // Asynchronously save the message, but don't block the response to Twilio.
    saveMessage(from, body, mediaUrl, mediaType).catch(error => {
      console.error('Failed to save message asynchronously:', error);
    });

    const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    return new NextResponse(xmlResponse, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' }
    });

  } catch (error) {
    console.error('Error processing Twilio webhook:', error);
    // Return a generic success to Twilio to prevent retries, but log the real error.
    const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
     return new NextResponse(xmlResponse, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' }
    });
  }
}
