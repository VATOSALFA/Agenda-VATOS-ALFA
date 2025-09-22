
'use server';
/**
<<<<<<< HEAD
 * @fileOverview Flow to send an outbound WhatsApp message via Twilio.
 */

import { z } from 'zod';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Profesional } from '@/lib/types';
import twilio from 'twilio';


const WhatsAppMessageInputSchema = z.object({
  to: z.string().describe("Recipient's phone number, without any special prefixes."),
  text: z.string().optional().describe("The text content of the message. Used if not sending a template."),
  mediaUrl: z.string().optional().describe("URL of media to be sent."),
  contentSid: z.string().optional().describe("The SID of the Content Template to send."),
  contentVariables: z.record(z.string()).optional().describe("Variables for the Content Template."),
});

type WhatsAppMessageInput = z.infer<typeof WhatsAppMessageInputSchema>;

interface WhatsAppMessageOutput {
    success: boolean;
    sid?: string;
    from?: string;
    to?: string;
    body?: string;
    error?: string;
}

export async function sendWhatsAppMessage(input: WhatsAppMessageInput): Promise<WhatsAppMessageOutput> {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    
    if (!accountSid || !authToken || !fromNumber || accountSid.startsWith('ACxxx')) {
      throw new Error("Faltan las credenciales de Twilio en el servidor (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER).");
    }
  
    const client = twilio(accountSid, authToken);

    const to = `whatsapp:+521${input.to.replace(/\D/g, '')}`;
    
    // Ensure the 'from' number is correctly formatted
    const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
    
    const messageData: any = { to, from };
    
    if (input.contentSid) {
        messageData.contentSid = input.contentSid;
        if(input.contentVariables) {
            messageData.contentVariables = JSON.stringify(input.contentVariables);
        }
    } else if (input.text) {
        messageData.body = input.text;
    }

    if (input.mediaUrl) {
      messageData.mediaUrl = [input.mediaUrl];
    }
    
    if (!input.contentSid && !input.text && !input.mediaUrl) {
        return { success: false, error: 'Se requiere un cuerpo de mensaje, URL de medios o SID de contenido.' };
    }

    const message = await client.messages.create(messageData);
    
    console.log("Mensaje de WhatsApp enviado con éxito:", message.sid);
    
    return { success: true, sid: message.sid, from: message.from, to: message.to, body: message.body ?? undefined };

  } catch(error: any) {
      console.error("Fallo al llamar a la API de Twilio:", error);
      // Provide a more specific error message if it's a Twilio API error.
      const errorMessage = error.message || 'Ocurrió un error desconocido al contactar a Twilio.';
      return { success: false, error: errorMessage };
  }
}

// Wrapper for booking confirmations using a Twilio Template
export async function sendWhatsappConfirmation(input: { 
    clientName: string;
    clientPhone: string;
    serviceName: string;
    reservationDate: string;
    reservationTime: string;
    professionalName?: string; // Made optional to handle 'any' professional
    templateSid: string;
}): Promise<WhatsAppMessageOutput> {
    
    const clientName = input.clientName;
    const serviceName = input.serviceName;
    const parsedDate = parseISO(input.reservationDate);
    const formattedDate = format(parsedDate, "EEEE, dd 'de' MMMM", { locale: es });
    const fullDateTime = `${formattedDate} a las ${input.reservationTime}`;
    // Provide a default if the professional name is not available
    const professionalName = input.professionalName || 'El de tu preferencia';
    const to = input.clientPhone;
    
    return sendWhatsAppMessage({
        to,
        contentSid: input.templateSid,
        contentVariables: {
            '1': clientName,
            '2': serviceName,
            '3': fullDateTime,
            '4': professionalName
        }
    });
}

// Wrapper for sending a test message
export async function sendTestTwilioMessage(): Promise<Partial<WhatsAppMessageOutput>> {
  try {
    const testPhoneNumber = process.env.TEST_PHONE_NUMBER || '4428133314'; // Ensure your test number is in .env
    if (!testPhoneNumber) {
        return { success: false, error: 'No se ha configurado un número de teléfono de prueba en el archivo .env (TEST_PHONE_NUMBER).' };
    }
    const result = await sendWhatsAppMessage({
        to: testPhoneNumber,
        text: 'Este es un mensaje de prueba de Agenda VATOS ALFA.',
    });
    return result;
  } catch (error: any) {
    // Catch the specific credentials error and return a more user-friendly message.
    return { success: false, error: error.message };
  }
=======
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
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; // Debes configurar esta variable de entorno
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID; // Y esta también

  // 2. Construye la URL de la API de Meta.
  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

  // 3. Prepara el cuerpo del mensaje según la especificación de la API.
  const body = {
    messaging_product: "whatsapp",
    to: input.clientPhone, // Asegúrate que el número incluya el código de país.
    type: "text",
    text: {
      preview_url: false,
      body: message,
    },
  };

  // 4. Realiza la llamada a la API.
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const responseData = await response.json();

    if (!response.ok) {
        console.error("Error al enviar mensaje de WhatsApp:", responseData);
        throw new Error(`Error de la API de WhatsApp: ${responseData.error?.message || response.statusText}`);
    }

    console.log("Mensaje de WhatsApp enviado con éxito:", responseData);
    return responseData.messages[0].id; // Retorna el ID del mensaje enviado.

  } catch(error) {
      console.error("Fallo en la llamada a la API de WhatsApp:", error);
      // Aquí puedes manejar el error, quizás intentar de nuevo o notificar a un administrador.
      return `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`;
  }
  // --- FIN DE LA INTEGRACIÓN REAL CON WHATSAPP ---
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
}
