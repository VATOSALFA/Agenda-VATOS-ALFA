
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin'; // Usamos la configuración de admin
import { collection, doc, addDoc, setDoc, Timestamp, getDoc } from 'firebase/firestore';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const from = formData.get('From') as string;
    const messageBody = formData.get('Body') as string;
    const numMedia = parseInt(formData.get('NumMedia') as string || '0', 10);
    
    if (!from) {
      console.error('Twilio Webhook: No "From" number provided in the request.');
      return NextResponse.json({ message: "No 'From' number provided" }, { status: 400 });
    }

    const conversationId = from;
    const conversationRef = doc(db, 'conversations', conversationId);
    
    const messageData: any = {
      senderId: 'client',
      text: messageBody,
      timestamp: Timestamp.now(),
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
    await addDoc(collection(conversationRef, 'messages'), messageData);
    
    // Update or create the conversation document
    const conversationSnap = await getDoc(conversationRef);
    if (conversationSnap.exists()) {
        const currentUnreadCount = conversationSnap.data().unreadCount || 0;
        await setDoc(conversationRef, {
            lastMessageText: messageBody || '[Media]',
            lastMessageTimestamp: Timestamp.now(),
            unreadCount: currentUnreadCount + 1,
        }, { merge: true });
    } else {
         const fromNumber = from.replace('whatsapp:', '');
         await setDoc(conversationRef, {
            clientName: fromNumber,
            lastMessageText: messageBody || '[Media]',
            lastMessageTimestamp: Timestamp.now(),
            unreadCount: 1,
         });
    }

    // Twilio espera una respuesta vacía en formato XML para confirmar la recepción
    return new Response('<Response/>', { 
        status: 200,
        headers: { 'Content-Type': 'text/xml' } 
    });

  } catch (error) {
    console.error('Twilio Webhook Error:', error);
    if (error instanceof Error) {
        return NextResponse.json({ message: 'Internal Server Error', error: error.message }, { status: 500 });
    }
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
