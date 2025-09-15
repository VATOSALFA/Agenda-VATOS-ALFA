
'use server';
/**
 * @fileOverview A flow to send WhatsApp notifications for appointments.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const WhatsappConfirmationInputSchema = z.object({
  clientName: z.string(),
  clientPhone: z.string(),
  serviceName: z.string(),
  reservationDate: z.string(), // YYYY-MM-DD
  reservationTime: z.string(), // HH:mm
});

type WhatsappConfirmationInput = z.infer<typeof WhatsappConfirmationInputSchema>;

async function getTemplate(name: string): Promise<string> {
    // In a real app, you would fetch this from Firestore based on the name.
    // For now, we'll use a hardcoded template for simplicity.
    const templates: Record<string, string> = {
        'Mensaje de confirmación': '¡Hola, {Nombre cliente}! Tu cita para {Servicio} ha sido confirmada para el {Fecha y hora reserva}. ¡Te esperamos!',
    };
    return templates[name] || ' plantilla no encontrada ';
}


export async function sendWhatsappConfirmation(input: WhatsappConfirmationInput): Promise<string> {
  
  const templateBody = await getTemplate('Mensaje de confirmación');

  const reservationDateTime = parseISO(`${input.reservationDate}T${input.reservationTime}:00`);
  const formattedDateTime = format(reservationDateTime, "EEEE, dd 'de' MMMM 'a las' HH:mm 'hrs.'", { locale: es });

  let message = templateBody.replace('{Nombre cliente}', input.clientName);
  message = message.replace('{Servicio}', input.serviceName);
  message = message.replace('{Fecha y hora reserva}', formattedDateTime);
  
  // --- INICIO DE LA INTEGRACIÓN REAL CON WHATSAPP ---
  // Reemplaza la simulación con la llamada real a la API de WhatsApp Business.
  
  // 1. Obtén tus credenciales desde un lugar seguro (variables de entorno es lo ideal).
  //    NUNCA las escribas directamente en el código.
  const WHATSAPP_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const FROM_NUMBER = 'whatsapp:+14155238886'; // Twilio Sandbox Number
  
  if (!ACCOUNT_SID || !WHATSAPP_TOKEN) {
      console.error("Twilio credentials are not set.");
      return "Error: Faltan credenciales de Twilio en el servidor.";
  }

  // 2. Construye la URL de la API de Twilio.
  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`;
  
  // 3. Prepara el cuerpo del mensaje según la especificación de la API de Twilio.
  const body = new URLSearchParams();
  body.append('To', `whatsapp:${input.clientPhone}`);
  body.append('From', FROM_NUMBER);
  body.append('Body', message);


  // 4. Realiza la llamada a la API.
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${ACCOUNT_SID}:${WHATSAPP_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    const responseData = await response.json();

    if (!response.ok) {
        console.error("Error al enviar mensaje de Twilio:", responseData);
        throw new Error(`Error de la API de Twilio: ${responseData.message || response.statusText}`);
    }

    console.log("Mensaje de Twilio enviado con éxito:", responseData);
    return responseData.sid; // Retorna el SID del mensaje enviado.

  } catch(error) {
      console.error("Fallo en la llamada a la API de Twilio:", error);
      // Aquí puedes manejar el error, quizás intentar de nuevo o notificar a un administrador.
      return `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`;
  }
  // --- FIN DE LA INTEGRACIÓN REAL CON WHATSAPP ---
}

