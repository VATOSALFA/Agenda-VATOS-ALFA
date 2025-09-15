
import { NextRequest, NextResponse } from 'next/server';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import twilio from 'twilio';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const params = new URLSearchParams(body);
  const from = params.get('From');
  const messageBody = params.get('Body');
  const messageSid = params.get('MessageSid');

  if (!from || !messageBody || !messageSid) {
    console.error("Webhook de Twilio: Faltan datos en la carga útil.");
    // Aún así, responde a Twilio para evitar reintentos.
    return new NextResponse('Missing data', { status: 400 });
  }

  try {
    // 1. PRIMERO, guarda el mensaje entrante en Firestore.
    await addDoc(collection(db, 'conversaciones'), {
      from: from,
      body: messageBody,
      messageSid: messageSid,
      timestamp: Timestamp.now(),
      direction: 'inbound', 
    });

    // 2. LUEGO, crea una respuesta vacía para confirmar a Twilio.
    const twiml = new twilio.twiml.MessagingResponse();
    
    // 3. FINALMENTE, envía la respuesta de confirmación.
    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml',
      },
    });

  } catch (error) {
    console.error('Error al procesar el webhook de Twilio:', error);
    // En caso de error en la base de datos, aún intentamos responder a Twilio.
    const twiml = new twilio.twiml.MessagingResponse();
    
    return new NextResponse(twiml.toString(), {
      status: 500,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  }
}
