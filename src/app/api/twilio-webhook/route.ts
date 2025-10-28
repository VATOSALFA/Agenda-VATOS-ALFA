
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-server';
import { FieldValue } from 'firebase-admin/firestore';

// These exports are required for Next.js API Routes.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'default-no-store';

/**
 * Saves an incoming message to the Firestore database.
 */
async function saveMessage(from: string, body: string | null, mediaUrl: string | null, mediaType: string | null) {
  try {
    const db = getDb();
    const conversationId = from; // e.g., 'whatsapp:+14155238886'
    const conversationRef = db.collection('conversations').doc(conversationId);
    
    const messageData: any = {
        senderId: 'client',
        timestamp: FieldValue.serverTimestamp(),
        read: false
    };

    if (body) messageData.text = body;
    if (mediaUrl) {
        messageData.mediaUrl = mediaUrl;
        if (mediaType?.startsWith('image/')) {
            messageData.mediaType = 'image';
        } else if (mediaType?.startsWith('audio/')) {
            messageData.mediaType = 'audio';
        } else if (mediaType === 'application/pdf') {
            messageData.mediaType = 'document';
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
            let clientName = from; // Default to phone number
            try {
                const phoneOnly = from.replace('whatsapp:+', '');
                const clientsRef = db.collection('clientes');
                // Check for different formats of phone numbers
                const querySnapshot = await clientsRef.where('telefono', 'in', [phoneOnly, phoneOnly.slice(2)]).limit(1).get();
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
    // Log but don't re-throw to ensure Twilio gets a 200 OK
  }
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
            // Still send a 200 to Twilio to prevent retries for a bad request
            return new NextResponse('<Response/>', { status: 200, headers: { 'Content-Type': 'text/xml' } });
        }
        
        // Asynchronously save the message, but don't block the response to Twilio.
        saveMessage(from, body, mediaUrl, mediaType).catch(console.error);

        // Respond to Twilio immediately with an empty TwiML response.
        const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
        return new NextResponse(xmlResponse, {
            status: 200,
            headers: { 'Content-Type': 'text/xml' }
        });

    } catch (error) {
        console.error('[FATAL] Unhandled error in twilioWebhook route:', error);
        // If something unexpected goes wrong, send a generic success to Twilio
        // to prevent it from retrying, while logging the real error.
        return new NextResponse('<Response/>', {
            status: 200,
            headers: { 'Content-Type': 'text/xml' }
        });
    }
}
