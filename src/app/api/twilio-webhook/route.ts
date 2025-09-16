
import { NextRequest, NextResponse } from 'next/server';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Message } from '@/lib/types';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const params = new URLSearchParams(body);
  
  const from = params.get('From');
  const messageBody = params.get('Body');
  const messageSid = params.get('MessageSid');
  const numMedia = parseInt(params.get('NumMedia') || '0', 10);

  // Log para depuración
  console.log("--- INCOMING TWILIO WEBHOOK ---");
  console.log("From:", from);
  console.log("Body:", messageBody);
  console.log("Message SID:", messageSid);
  console.log("NumMedia:", numMedia);
  
  if (!from || !messageSid) {
    console.error("Webhook de Twilio: Faltan datos esenciales (From o MessageSid).");
    return new NextResponse('<Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  const messageData: Partial<Message> = {
    from: from,
    messageSid: messageSid,
    timestamp: Timestamp.now(),
    direction: 'inbound',
    read: false,
  };
  
  if (numMedia > 0) {
      const mediaUrl = params.get('MediaUrl0');
      const mediaContentType = params.get('MediaContentType0');
      console.log("MediaUrl0:", mediaUrl);
      console.log("MediaContentType0:", mediaContentType);

      messageData.mediaUrl = mediaUrl!;
      messageData.mediaContentType = mediaContentType!;
      // Si hay una imagen pero no hay texto, usamos un cuerpo de texto predeterminado.
      messageData.body = messageBody || `Archivo adjunto: ${mediaContentType}`;
  } else {
      // Si no hay multimedia, el cuerpo del mensaje es obligatorio.
      if (!messageBody) {
        console.error("Webhook de Twilio: El mensaje no tiene cuerpo ni multimedia.");
        return new NextResponse('<Response></Response>', { status: 200, headers: { 'Content-Type': 'text/xml' } });
      }
      messageData.body = messageBody;
  }
  
  console.log("-------------------------------");


  try {
    // 1. PRIMERO, guarda el mensaje entrante en Firestore.
    await addDoc(collection(db, 'conversaciones'), messageData);

    // 2. LUEGO, envía una respuesta de confirmación simple a Twilio.
    return new NextResponse('<Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('Error al procesar el webhook de Twilio:', error);
    // En caso de error en la base de datos, aún intentamos responder a Twilio.
    return new NextResponse('<Response></Response>', {
      status: 500, // Informamos a Twilio de un error del servidor.
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
