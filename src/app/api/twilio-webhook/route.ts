
// src/app/api/twilio-webhook/route.ts
'use server';

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-server'; // Use server-side firebase
import type { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { parseISO, format } from 'date-fns';
import twilio from 'twilio';

// Helper function to validate the Twilio signature
async function validateTwilioWebhook(request: NextRequest) {
  const signature = request.headers.get('x-twilio-signature');
  const host = request.headers.get('host');
  // Reconstruct the original URL from headers, as the request.url might be modified by proxies.
  const webhookUrl = `https://${host}${request.nextUrl.pathname}`;
  
  const formData = await request.formData();
  const params: { [key: string]: string } = {};
  formData.forEach((value, key) => {
    params[key] = value.toString();
  });

  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!signature || !authToken) {
    console.warn('[DIAGNOSTIC] Twilio signature or auth token is missing. Validation skipped.');
    return false;
  }

  try {
      return twilio.validateRequest(authToken, signature, webhookUrl, params);
  } catch (error) {
      console.error('[DIAGNOSTIC] Error validating Twilio request:', error);
      return false;
  }
}


async function handleClientResponse(from: string, messageBody: string): Promise<{ handled: boolean, clientId: string | null }> {
    const db = getDb();
    if (!db) {
        throw new Error("La base de datos no está inicializada para handleClientResponse.");
    }
    const normalizedMessage = messageBody.trim().toLowerCase();
    
    const confirmationKeywords = ['confirmado', 'confirmo', 'confirmar', 'si', 'yes', 'confirm'];
    const rescheduleKeywords = ['reagendar'];
    const cancellationKeywords = ['cancelar la cita', 'cancelar'];

    let action: 'confirm' | 'reschedule' | 'cancel' | null = null;

    if (confirmationKeywords.some(keyword => normalizedMessage.includes(keyword))) {
        action = 'confirm';
    } else if (rescheduleKeywords.some(keyword => normalizedMessage.includes(keyword))) {
        action = 'reschedule';
    } else if (cancellationKeywords.some(keyword => normalizedMessage.includes(keyword))) {
        action = 'cancel';
    }

    if (!action) {
        return { handled: false, clientId: null };
    }
    
    // Standardize phone number to 10 digits for DB lookup
    const clientPhone10Digits = from.replace(/\D/g, '').slice(-10);
    const clientsQuery = db.collection('clientes').where('telefono', '==', clientPhone10Digits).limit(1);
    const clientsSnapshot = await clientsQuery.get();

    if (clientsSnapshot.empty) {
        console.log(`[DIAGNOSTIC] Webhook: Client not found with phone: ${clientPhone10Digits}`);
        return { handled: false, clientId: null };
    }

    const clientDoc = clientsSnapshot.docs[0];
    const clientId = clientDoc.id;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const reservationsQuery = db.collection('reservas')
        .where('cliente_id', '==', clientId)
        .where('fecha', '>=', format(today, 'yyyy-MM-dd'));
    
    const reservationsSnapshot = await reservationsQuery.get();
    
    if (reservationsSnapshot.empty) {
        console.log(`[DIAGNOSTIC] Webhook: No pending reservations found for client: ${clientId}`);
        return { handled: true, clientId: clientId };
    }
    
    const upcomingReservations = reservationsSnapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(r => r.estado !== 'Cancelado');

    if (upcomingReservations.length === 0) {
      console.log(`[DIAGNOSTIC] Webhook: No non-cancelled upcoming reservations found for client: ${clientId}`);
      return { handled: true, clientId: clientId };
    }

    upcomingReservations.sort((a: any, b: any) => {
        const dateA = parseISO(`${a.fecha}T${a.hora_inicio}`);
        const dateB = parseISO(`${b.fecha}T${b.hora_inicio}`);
        return dateA.getTime() - dateB.getTime();
    });
    
    const reservationToUpdate = upcomingReservations[0];
    const reservationDocRef = db.collection('reservas').doc(reservationToUpdate.id);

    const batch = db.batch();
    switch(action) {
        case 'confirm':
            batch.update(reservationDocRef, { estado: 'Confirmado' });
            break;
        case 'cancel':
            batch.update(reservationDocRef, { estado: 'Cancelado' });
            batch.update(clientDoc.ref, { 
                citas_canceladas: FieldValue.increment(1)
            });
            break;
        default:
            break;
    }
    await batch.commit();
    console.log(`[DIAGNOSTIC] Webhook: Action '${action}' processed for client ${clientId} on reservation ${reservationToUpdate.id}`);
    return { handled: true, clientId: clientId };
}


export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    if (!db) {
        console.error('[DIAGNOSTIC] Webhook Error: Database not initialized.');
        return new NextResponse("Internal Server Error: Database not initialized", { status: 500 });
    }
    
    // IMPORTANT: It's crucial to consume the form data ONCE and use it for both validation and processing.
    const formData = await request.formData();
    
    const isValid = await validateTwilioWebhook(request);
    if (!isValid) {
      console.warn('[DIAGNOSTIC] Invalid Twilio Signature. Request rejected.');
      return new NextResponse('Invalid Twilio Signature', { status: 401 });
    }
    console.log('[DIAGNOSTIC] Twilio signature validated successfully.');


    const from = formData.get('From') as string;
    const body = formData.get('Body') as string || '';
    const mediaUrl = formData.get('MediaUrl0') as string | null;
    const mediaType = formData.get('MediaContentType0') as string | null;


    if (!from) {
      return new NextResponse('Missing "From" parameter', { status: 400 });
    }

    const conversationId = from; // Use the full 'whatsapp:+...' string as ID
    
    // Process client response (confirmation, cancellation)
    await handleClientResponse(from, body);

    const messageData: {
        senderId: 'client';
        text?: string;
        mediaUrl?: string;
        mediaType?: 'image' | 'audio' | 'document';
        timestamp: FieldValue;
        read: boolean;
    } = {
      senderId: 'client',
      timestamp: FieldValue.serverTimestamp(),
      read: false,
    };
    
    if (body) {
        messageData.text = body;
    }

    if (mediaUrl) {
        messageData.mediaUrl = mediaUrl;
        if(mediaType?.startsWith('image/')) {
            messageData.mediaType = 'image';
        } else if (mediaType?.startsWith('audio/')) {
            messageData.mediaType = 'audio';
        } else if (mediaType === 'application/pdf') {
            messageData.mediaType = 'document';
        }
    }

    // Save message to conversation history
    const conversationRef = db.collection('conversations').doc(conversationId);
    await conversationRef.collection('messages').add(messageData);
    
    // Update the conversation summary
    const lastMessageText = body || (mediaUrl ? `[${messageData.mediaType || 'Archivo'}]` : '[Mensaje vacío]');
    await conversationRef.set({
      lastMessageText,
      lastMessageTimestamp: FieldValue.serverTimestamp(),
      unreadCount: FieldValue.increment(1),
    }, { merge: true });

    console.log(`[DIAGNOSTIC] Webhook: Message from ${from} saved to conversation.`);

    // Respond to Twilio to avoid an error on their end.
    const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    return new NextResponse(xmlResponse, { 
        status: 200,
        headers: { 'Content-Type': 'text/xml' } 
    });

  } catch (error) {
    console.error('[DIAGNOSTIC] Twilio Webhook Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return new NextResponse(`Internal Server Error: ${errorMessage}`, { status: 500 });
  }
}
