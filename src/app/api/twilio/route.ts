
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import Twilio from 'twilio';
import { format } from 'date-fns';


async function handleClientResponse(from: string, messageBody: string) {
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
        return { handled: false };
    }

    // Clean the phone number from Twilio format (whatsapp:+521...) to match Firestore format (just digits)
    const clientPhone = from.replace(/\D/g, '').slice(-10);

    // 1. Find the client by phone number
    const clientsQuery = db.collection('clientes').where('telefono', '==', clientPhone).limit(1);
    const clientsSnapshot = await clientsQuery.get();

    if (clientsSnapshot.empty) {
        console.log(`Client not found with phone: ${clientPhone}`);
        return { handled: false };
    }

    const clientDoc = clientsSnapshot.docs[0];
    const clientId = clientDoc.id;

    // 2. Find the client's upcoming reservation
    const today = format(new Date(), 'yyyy-MM-dd');
    
    const reservationsQuery = db.collection('reservas')
        .where('cliente_id', '==', clientId)
        .where('fecha', '>=', today)
        .where('estado', '!=', 'Cancelado')
        .orderBy('fecha', 'asc')
        .limit(1);
    
    const reservationsSnapshot = await reservationsQuery.get();
    
    if (reservationsSnapshot.empty) {
        console.log(`No pending reservations found for client: ${clientId}`);
        return { handled: true, clientId: clientId }; // Handled because we understood the keyword, but no reservation to act on.
    }
    
    const reservationDoc = reservationsSnapshot.docs[0];

    // 3. Update reservation based on action
    switch(action) {
        case 'confirm':
            await reservationDoc.ref.update({ estado: 'Confirmado' });
            console.log(`Reservation ${reservationDoc.id} updated to "Confirmado" for client ${clientId}.`);
            break;
        case 'reschedule':
            await reservationDoc.ref.update({ estado: 'Pendiente' });
            console.log(`Reservation ${reservationDoc.id} updated to "Pendiente" for client ${clientId}.`);
            break;
        case 'cancel':
             // Using a transaction to ensure atomicity
            await db.runTransaction(async (transaction) => {
                transaction.update(reservationDoc.ref, { estado: 'Cancelado' });
                transaction.update(clientDoc.ref, { 
                    citas_canceladas: FieldValue.increment(1)
                });
            });
            console.log(`Reservation ${reservationDoc.id} updated to "Cancelado" for client ${clientId}.`);
            break;
    }

    return { handled: true, clientId: clientId };
}


/**
 * Handles GET requests to the Twilio webhook URL.
 * This is used for simple verification from a browser.
 */
export async function GET(req: NextRequest) {
  return new NextResponse(
    'Webhook de Twilio activo y escuchando. Listo para recibir mensajes POST.',
    { status: 200, headers: { 'Content-Type': 'text/plain' } }
  );
}


/**
 * Handles POST requests from Twilio when a message is received.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const body = Object.fromEntries(formData);
    const signature = req.headers.get('X-Twilio-Signature') || '';
    const url = req.url;

    const authToken = process.env.NEXT_PUBLIC_TWILIO_AUTH_TOKEN;
    if (!authToken) {
        console.error('Twilio Webhook: Auth Token no está configurado.');
        return new NextResponse('Internal Server Error: Auth Token missing', { status: 500 });
    }
    
    // Validate request signature
    const isValid = Twilio.validateRequest(authToken, signature, url, body);

    if (!isValid) {
      console.warn('Twilio Webhook: Invalid request signature received.');
      return new NextResponse('Invalid signature', { status: 403 });
    }

    const from = body.From as string;
    const messageBody = (body.Body as string) || '';
    const numMedia = parseInt((body.NumMedia as string) || '0', 10);

    if (!from) {
      console.error('Twilio Webhook: No "From" number provided in the request.');
      return new NextResponse("Missing 'From' parameter", { status: 400 });
    }

    // Attempt to handle automated responses and get clientId
    const { clientId } = await handleClientResponse(from, messageBody);

    const conversationId = from;
    const conversationRef = db.collection('conversations').doc(conversationId);

    const messageData: { [key: string]: any } = {
      senderId: 'client',
      text: messageBody,
      timestamp: FieldValue.serverTimestamp(),
      read: false,
    };

    if (numMedia > 0) {
      const mediaUrl = body.MediaUrl0 as string;
      const mediaContentType = body.MediaContentType0 as string;
      
      if(mediaUrl) {
          messageData.mediaUrl = mediaUrl;
          if (mediaContentType?.startsWith('image/')) {
            messageData.mediaType = 'image';
          } else if (mediaContentType?.startsWith('audio/')) {
            messageData.mediaType = 'audio';
          } else if (mediaContentType === 'application/pdf') {
            messageData.mediaType = 'document';
          }
      }
    }

    // Add the message to the subcollection
    await conversationRef.collection('messages').add(messageData);
    
    // Unified logic to create or update the conversation document
    const lastMessagePreview = messageBody || (messageData.mediaType ? `[${messageData.mediaType.charAt(0).toUpperCase() + messageData.mediaType.slice(1)}]` : '[Mensaje vacío]');
    
    const conversationData: { [key: string]: any } = {
        lastMessageText: lastMessagePreview,
        lastMessageTimestamp: FieldValue.serverTimestamp(),
        unreadCount: FieldValue.increment(1),
        clientName: from.replace('whatsapp:', '') // Default name, can be updated
    };

    if (clientId) {
      conversationData.clientId = clientId;
    }
    
    await conversationRef.set(conversationData, { merge: true });


    // Twilio expects an empty TwiML response to prevent it from sending a reply.
    const twiml = new Twilio.twiml.MessagingResponse();
    
    return new NextResponse(twiml.toString(), {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error: any) {
    console.error('Twilio Webhook Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
