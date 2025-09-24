
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const from = formData.get('From') as string;
    const messageBody = formData.get('Body') as string;
    const numMedia = parseInt(formData.get('NumMedia') as string || '0', 10);

    if (!from) {
      console.error('Twilio Webhook: No "From" number provided in the request.');
      return new NextResponse("No 'From' number provided", { status: 400 });
    }

    const conversationId = from;
    const conversationRef = db.collection('conversations').doc(conversationId);

    const messageData: any = {
      senderId: 'client',
      text: messageBody,
      timestamp: FieldValue.serverTimestamp(),
      read: false,
    };

    if (numMedia > 0) {
      const mediaUrl = formData.get('MediaUrl0') as string;
      const mediaContentType = formData.get('MediaContentType0') as string;
      
      messageData.mediaUrl = mediaUrl;
      if (mediaContentType?.startsWith('image/')) {
        messageData.mediaType = 'image';
      } else if (mediaContentType?.startsWith('audio/')) {
        messageData.mediaType = 'audio';
      } else if (mediaContentType === 'application/pdf') {
        messageData.mediaType = 'document';
      }
    }

    // Add the message to the subcollection
    await conversationRef.collection('messages').add(messageData);
    
    // Update or create the conversation document
    const conversationSnap = await conversationRef.get();
    if (conversationSnap.exists) {
        await conversationRef.update({
            lastMessageText: messageBody || '[Media]',
            lastMessageTimestamp: FieldValue.serverTimestamp(),
            unreadCount: FieldValue.increment(1),
        });
    } else {
         const fromNumber = from.replace('whatsapp:', '');
         await conversationRef.set({
            clientName: fromNumber,
            lastMessageText: messageBody || '[Media]',
            lastMessageTimestamp: FieldValue.serverTimestamp(),
            unreadCount: 1,
         });
    }

    // Twilio espera una respuesta vacía en formato XML para confirmar la recepción
    return new NextResponse('<Response/>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error: any) {
    console.error('Twilio Webhook Error:', error);
    return new NextResponse(`Internal Server Error: ${error.message}`, { status: 500 });
  }
}
