// src/app/api/twilio-webhook/route.ts
'use server';

import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-server'; // Use server-side firebase
import type { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { parseISO } from 'date-fns';

async function handleClientResponse(from: string, messageBody: string): Promise<{ handled: boolean, clientId: string | null }> {
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
    const formData = await request.formData();
    const from = formData.get('From') as string;
    const body = formData.get('Body') as string || '';

    if (!from) {
      return new NextResponse('Missing "From" parameter', { status: 400 });
    }
    
    // Don't validate signature in a webhook, as it's complex with Next.js serverless functions.
    // Rely on unguessable webhook URL for security.

    const conversationId = from.replace('whatsapp:', '');
    
    // Process client response (confirmation, cancellation)
    await handleClientResponse(from, body);

    // Save message to conversation history
    const conversationRef = db.collection('conversations').doc(conversationId);
    await conversationRef.collection('messages').add({
      senderId: 'client',
      text: body,
      timestamp: FieldValue.serverTimestamp(),
      read: false,
    });
    
    // Update the conversation summary
    await conversationRef.set({
      lastMessageText: body,
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