
import { NextRequest, NextResponse } from 'next/server';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import twilio from 'twilio';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const from = formData.get('From') as string;
  const body = formData.get('Body') as string;
  const messageSid = formData.get('MessageSid') as string;

  try {
    // Guarda el mensaje entrante en Firestore
    await addDoc(collection(db, 'conversaciones'), {
      from: from,
      body: body,
      messageSid: messageSid,
      timestamp: Timestamp.now(),
      direction: 'inbound', // Para identificar que es un mensaje entrante
    });

    // Responde a Twilio para confirmar la recepción
    // Un <Response/> vacío es suficiente para que Twilio sepa que recibimos el mensaje
    // y para evitar que intente enviarlo de nuevo.
    const twiml = new twilio.twiml.MessagingResponse();
    
    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml',
      },
    });

  } catch (error) {
    console.error('Error al procesar el webhook de Twilio:', error);
    // En caso de error, aún intentamos responder a Twilio para evitar reintentos.
    // Devolvemos un estado 500 para indicar que algo salió mal de nuestro lado.
    const twiml = new twilio.twiml.MessagingResponse();
    
    return new NextResponse(twiml.toString(), {
      status: 500,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  }
}
