
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
  // Use a stable URL, as the request URL can vary with query params etc.
  const webhookUrl = `${process.env.HOST || ''}/api/twilio-webhook`;
  const formData = await request.formData();
  const params: { [key: string]: string } = {};
  formData.forEach((value, key) => {
    params[key] = value.toString();
  });

  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!signature || !authToken) {
    return false;
  }

  return twilio.validateRequest(authToken, signature, webhookUrl, params);
}


async function handleClientResponse(from: string, messageBody: string): Promise<{ handled: boolean, clientId: string | null }> {
    const db = getDb();
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
        console.log(`Client not found with phone: ${clientPhone10Digits}`);
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
        console.log(`No pending reservations found for client: ${clientId}`);
        return { handled: true, clientId: clientId };
    }
    
    const upcomingReservations = reservationsSnapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(r => r.estado !== 'Cancelado');

    if (upcomingReservations.length === 0) {
      console.log(`No non-cancelled upcoming reservations found for client: ${clientId}`);
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
    return { handled: true, clientId: clientId };
}


export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const formData = await request.formData();
    const from = formData.get('From') as string;
    const body = formData.get('Body') as string || '';
    const mediaUrl = formData.get('MediaUrl0') as string | null;
    const mediaType = formData.get('MediaContentType0') as string | null;


    if (!from) {
      return new NextResponse('Missing "From" parameter', { status: 400 });
    }
    
    // In a production environment, you should validate the Twilio signature.
    // const isValid = await validateTwilioWebhook(request);
    // if (!isValid) {
    //   return new NextResponse('Invalid Twilio Signature', { status: 401 });
    // }

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

    // Respond to Twilio to avoid an error on their end.
    const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    return new NextResponse(xmlResponse, { 
        status: 200,
        headers: { 'Content-Type': 'text/xml' } 
    });

  } catch (error) {
    console.error('Twilio Webhook Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return new NextResponse(`Internal Server Error: ${errorMessage}`, { status: 500 });
  }
}
