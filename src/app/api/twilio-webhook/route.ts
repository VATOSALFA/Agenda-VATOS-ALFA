'use server';

import { getDb } from '@/lib/firebase-server';
import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'url';

// This function is deployed as a public Cloud Function.
// It allows unauthenticated requests from Twilio.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'default-no-store';

async function saveMessage(from: string, body: string | null, mediaUrl: string | null, mediaType: string | null) {
    const db = getDb();
    if (!db) {
        throw new Error("Database not initialized.");
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
    
    // Use set with merge to create or update the conversation summary
    await conversationRef.set({
      lastMessageText,
      lastMessageTimestamp: FieldValue.serverTimestamp(),
      unreadCount: FieldValue.increment(1),
    }, { merge: true });
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const from = formData.get('From') as string;
        const body = formData.get('Body') as string | null;
        const mediaUrl = formData.get('MediaUrl0') as string | null;
        const mediaType = formData.get('MediaContentType0') as string | null;

        if (!from) {
            return new NextResponse('Missing "From" parameter', { status: 400 });
        }
        
        // Save the message asynchronously. We don't need to wait for it.
        saveMessage(from, body, mediaUrl, mediaType).catch(console.error);

        // Respond to Twilio immediately to acknowledge receipt.
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
