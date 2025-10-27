
import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import * as admin from 'firebase-admin';
import { format, parseISO } from 'date-fns';

// Initialize Firebase Admin SDK if not already initialized
if (admin.apps.length === 0) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  } catch (error) {
    console.error('Firebase Admin Initialization Error:', error);
  }
}

const db = admin.firestore();

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
    
    const today = format(new Date(), 'yyyy-MM-dd');
    const reservationsQuery = db.collection('reservas')
        .where('cliente_id', '==', clientId)
        .where('fecha', '>=', today);
    
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

    switch(action) {
        case 'confirm':
            await reservationDocRef.update({ estado: 'Confirmado' });
            break;
        case 'cancel':
            await db.runTransaction(async (transaction) => {
                transaction.update(reservationDocRef, { estado: 'Cancelado' });
                transaction.update(clientDoc.ref, { 
                    citas_canceladas: admin.firestore.FieldValue.increment(1)
                });
            });
            break;
        default:
            break;
    }
    return { handled: true, clientId: clientId };
}


export async function POST(req: NextRequest) {
  const body = await req.formData();
  const params = Object.fromEntries(body.entries());

  const twilioSignature = req.headers.get('x-twilio-signature') || '';
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  // NOTE: In a production environment with a stable URL, validation is recommended.
  // For App Hosting's dynamic preview URLs, we are temporarily trusting the User-Agent
  // and the fact that this webhook URL is not publicly known.
  const userAgent = req.headers.get('user-agent') || '';
  if (!userAgent.startsWith('TwilioProxy')) {
      console.warn('Request did not originate from Twilio.', { userAgent });
      return new NextResponse('Forbidden: Invalid User-Agent', { status: 403 });
  }

  try {
    const from = params.From as string;
    const messageBody = (params.Body as string) || '';
    const conversationId = from; // e.g., 'whatsapp:+521...'

    console.log(`Processing incoming message from: ${from}`);

    await handleClientResponse(from, messageBody);

    const messageData: { [key: string]: any } = {
        senderId: 'client',
        text: messageBody,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
    };

    await db.collection('conversations').doc(conversationId).collection('messages').add(messageData);
    
    await db.collection('conversations').doc(conversationId).set({
        lastMessageText: messageBody,
        lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        unreadCount: admin.firestore.FieldValue.increment(1),
    }, { merge: true });

    console.log(`Message from ${from} saved to conversation.`);

    // Respond to Twilio to acknowledge receipt
    const twiml = new twilio.twiml.MessagingResponse();
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('--- Twilio Webhook API Route Error ---', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new NextResponse(`Internal Server Error: ${errorMessage}`, { status: 500 });
  }
}
