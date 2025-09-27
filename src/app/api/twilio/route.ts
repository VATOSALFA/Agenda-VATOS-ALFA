
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import Twilio from 'twilio';

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
    
    await conversationRef.set({
        lastMessageText: lastMessagePreview,
        lastMessageTimestamp: FieldValue.serverTimestamp(),
        unreadCount: FieldValue.increment(1),
        clientName: from.replace('whatsapp:', '') // Set a default name, can be updated later
    }, { merge: true });


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
