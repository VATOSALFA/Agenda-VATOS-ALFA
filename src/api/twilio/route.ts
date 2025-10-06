
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/firebase-admin'; // Usar admin-sdk aquí
import { collection, query, where, getDocs, updateDoc, doc, runTransaction, increment, Timestamp, orderBy, limit, setDoc, addDoc } from 'firebase/firestore';
import Twilio from 'twilio';
import { parseISO, format } from 'date-fns';

if (process.env.NODE_ENV === 'development') {
  require('dotenv').config();
}

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
        return { handled: false, clientId: null };
    }
    
    const clientPhone = from.replace(/\D/g, '').slice(-10);

    const clientsQuery = query(collection(db, 'clientes'), where('telefono', '==', clientPhone), limit(1));
    const clientsSnapshot = await getDocs(clientsQuery);

    if (clientsSnapshot.empty) {
        console.log(`Client not found with phone: ${clientPhone}`);
        return { handled: false, clientId: null };
    }

    const clientDoc = clientsSnapshot.docs[0];
    const clientId = clientDoc.id;
    
    const today = format(new Date(), 'yyyy-MM-dd');
    const reservationsQuery = query(
        collection(db, 'reservas'),
        where('cliente_id', '==', clientId),
        where('fecha', '>=', today)
    );
    
    const reservationsSnapshot = await getDocs(reservationsQuery);
    
    if (reservationsSnapshot.empty) {
        console.log(`No pending reservations found for client: ${clientId}`);
        return { handled: true, clientId: clientId };
    }
    
    const upcomingReservations = reservationsSnapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
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
    const reservationDocRef = doc(db, 'reservas', reservationToUpdate.id);

    switch(action) {
        case 'confirm':
            await updateDoc(reservationDocRef, { estado: 'Confirmado' });
            console.log(`Reservation ${reservationToUpdate.id} updated to "Confirmado" for client ${clientId}.`);
            break;
        case 'reschedule':
            await updateDoc(reservationDocRef, { estado: 'Pendiente' });
            console.log(`Reservation ${reservationToUpdate.id} updated to "Pendiente" for client ${clientId}.`);
            break;
        case 'cancel':
            await runTransaction(db, async (transaction) => {
                transaction.update(reservationDocRef, { estado: 'Cancelado' });
                transaction.update(clientDoc.ref, { 
                    citas_canceladas: increment(1)
                });
            });
            console.log(`Reservation ${reservationToUpdate.id} updated to "Cancelado" for client ${clientId}.`);
            break;
    }

    return { handled: true, clientId: clientId };
}

export async function GET(req: NextRequest) {
  return new NextResponse(
    'Webhook de Twilio activo y escuchando. Listo para recibir mensajes POST.',
    { status: 200, headers: { 'Content-Type': 'text/plain' } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const body = Object.fromEntries(formData);
    const signature = req.headers.get('X-Twilio-Signature') || '';
    
    const url = req.url;

    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
        console.error('Twilio Webhook: Auth Token no está configurado.');
        return new NextResponse('Internal Server Error: Auth Token missing', { status: 500 });
    }
    
    const isValid = Twilio.validateRequest(authToken, signature, url, body as { [key: string]: string });

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
    
    const { handled, clientId } = await handleClientResponse(from, messageBody);

    const conversationId = from;
    const conversationRef = doc(db, 'conversations', conversationId);
    const messagesCollectionRef = collection(db, 'conversations', conversationId, 'messages');

    const messageData: { [key: string]: any } = {
      senderId: 'client',
      text: messageBody,
      timestamp: Timestamp.now(),
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

    await addDoc(messagesCollectionRef, messageData);
    
    const lastMessagePreview = messageBody || (messageData.mediaType ? `[${messageData.mediaType.charAt(0).toUpperCase() + messageData.mediaType.slice(1)}]` : '[Mensaje vacío]');
    
    const conversationDocSnap = await getDocs(query(collection(db, 'conversations'), where(doc(db, 'conversations', conversationId).id, '==', conversationId), limit(1)));


    if (conversationDocSnap.empty) {
        await setDoc(conversationRef, {
            lastMessageText: lastMessagePreview,
            lastMessageTimestamp: Timestamp.now(),
            unreadCount: 1,
            clientId: clientId || null,
        });
    } else {
        await updateDoc(conversationRef, {
            lastMessageText: lastMessagePreview,
            lastMessageTimestamp: Timestamp.now(),
            unreadCount: increment(1),
            clientId: clientId || null,
        });
    }
    
    const twiml = new Twilio.twiml.MessagingResponse();
    
    return new NextResponse(twiml.toString(), {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error: any) {
    console.error('Twilio Webhook Error:', error);
    return new NextResponse(`Internal Server Error: ${error.message}`, { status: 500 });
  }
}
