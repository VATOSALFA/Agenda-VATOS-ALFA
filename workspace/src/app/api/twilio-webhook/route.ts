import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-server';
import { FieldValue } from 'firebase-admin/firestore';
import { validateRequest } from 'twilio';

// These exports are required for Next.js API Routes.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'default-no-store';

/**
 * Saves an incoming message to the Firestore database.
 */
async function saveMessage(from: string, body: string | null, mediaUrl: string | null, mediaType: string | null) {
    const db = getDb();
    if (!db) {
        throw new Error("Database not initialized for webhook.");
    }
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

    await conversationRef.collection('messages').add(messageData);

    const lastMessageText = body || (mediaUrl ? `[${messageData.mediaType || 'Archivo'}]` : '[Mensaje vacío]');
    
    await conversationRef.set({
      lastMessageText,
      lastMessageTimestamp: FieldValue.serverTimestamp(),
      unreadCount: FieldValue.increment(1),
    }, { merge: true });
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
        saveMessage(from, body, mediaUrl, mediaType).catch(console.error);

        // Respond to Twilio immediately with an empty TwiML response.
        const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
        return new NextResponse(xmlResponse, {
            status: 200,
            headers: { 'Content-Type': 'text/xml' }
        });

    } catch (error) {
        console.error('Error processing Twilio webhook:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        return new NextResponse(`Internal Server Error: ${errorMessage}`, { status: 500 });
    }
}