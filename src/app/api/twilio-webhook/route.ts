
import { NextRequest, NextResponse } from 'next/server';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const params = new URLSearchParams(body);
  const from = params.get('From');
  const messageBody = params.get('Body');
  const messageSid = params.get('MessageSid');

  // Log para depuración
  console.log("--- INCOMING TWILIO WEBHOOK ---");
  console.log("From:", from);
  console.log("Body:", messageBody);
  console.log("Message SID:", messageSid);
  console.log("-------------------------------");


  if (!from || !messageBody || !messageSid) {
    console.error("Webhook de Twilio: Faltan datos en la carga útil.");
    return new NextResponse('<Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  try {
    // 1. PRIMERO, guarda el mensaje entrante en Firestore.
    await addDoc(collection(db, 'conversaciones'), {
      from: from,
      body: messageBody,
      messageSid: messageSid,
      timestamp: Timestamp.now(),
      direction: 'inbound',
      read: false, // Marcar como no leído por defecto
    });

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
