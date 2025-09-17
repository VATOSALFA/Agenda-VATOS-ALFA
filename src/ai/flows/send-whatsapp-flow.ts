
'use server';
/**
 * @fileOverview Flow to send an outbound WhatsApp message via Twilio.
 */

import { z } from 'zod';
import { getSecret } from '@genkit-ai/googleai';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Profesional } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';


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

async function getTwilioCredentials() {
  if (process.env.NODE_ENV === 'production') {
    const [accountSid, authToken, fromNumber] = await Promise.all([
      getSecret('TWILIO_ACCOUNT_SID'),
      getSecret('TWILIO_AUTH_TOKEN'),
      getSecret('TWILIO_WHATSAPP_NUMBER')
    ]);
    return { accountSid, authToken, fromNumber };
  } else {
    return {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      fromNumber: process.env.TWILIO_WHATSAPP_NUMBER
    };
  }
}

export async function sendWhatsAppMessage(input: WhatsAppMessageInput): Promise<WhatsAppMessageOutput> {
  const { accountSid, authToken, fromNumber } = await getTwilioCredentials();

  if (!accountSid || !authToken || !fromNumber) {
    const errorMsg = "Faltan las credenciales de Twilio en el servidor.";
    console.error(errorMsg);
    return { success: false, error: errorMsg };
  }
  
  if (accountSid.startsWith('ACxxx')) {
     const errorMsg = "Las credenciales de Twilio no están configuradas. Por favor, configúralas.";
     console.error(errorMsg);
     return { success: false, error: errorMsg };
  }

  // Normaliza el número de teléfono para que sea compatible con Twilio
  const cleanedPhone = input.to.replace(/\D/g, '');
  const to = `whatsapp:+52${cleanedPhone}`;

  
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  
  const body = new URLSearchParams();
  body.append('To', to);
  body.append('From', fromNumber);
  
  if (input.contentSid) {
    body.append('ContentSid', input.contentSid);
    if (input.contentVariables) {
        body.append('ContentVariables', JSON.stringify(input.contentVariables));
    }
  } else if (input.text) {
    body.append('Body', input.text);
  } else if (!input.mediaUrl) {
    return { success: false, error: 'A Message Body, Media URL or Content SID is required.' };
  }


  if (input.mediaUrl) {
    body.append('MediaUrl', input.mediaUrl);
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    const responseData = await response.json();

    if (!response.ok) {
        console.error("Error from Twilio API:", responseData);
        throw new Error(`Error de la API de Twilio: ${responseData.message || response.statusText}`);
    }

    console.log("Mensaje de WhatsApp enviado con éxito:", responseData.sid);
    
    return { success: true, sid: responseData.sid, from: fromNumber, to: to, body: responseData.body };

  } catch(error) {
      console.error("Fallo al llamar a la API de Twilio:", error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido al contactar a Twilio.';
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
    professionalName: string;
    templateSid: string;
}): Promise<WhatsAppMessageOutput> {
    
    // {{1}}: Nombre del cliente
    const clientName = input.clientName;
    
    // {{2}}: Nombre del servicio
    const serviceName = input.serviceName;

    // {{3}}: Fecha y hora.
    const parsedDate = parseISO(input.reservationDate);
    const formattedDate = format(parsedDate, "EEEE, dd 'de' MMMM", { locale: es });
    const fullDateTime = `${formattedDate} a las ${input.reservationTime}`;
    
    // {{4}}: Nombre del profesional.
    const professionalName = input.professionalName;

    // El número se pasa directamente, la función genérica se encarga de limpiarlo y añadir prefijo.
    const to = input.clientPhone;
    
    // Se llama a la función genérica para enviar la plantilla con sus variables.
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
  // Hardcoded test phone number. Replace with a real number for testing.
  const testPhoneNumber = process.env.TEST_PHONE_NUMBER || '4428133314';
  if (!testPhoneNumber) {
    return { success: false, error: 'No test phone number configured.' };
  }
  const result = await sendWhatsAppMessage({
    to: testPhoneNumber,
    text: 'Este es un mensaje de prueba de Agenda VATOS ALFA.',
  });
  return result;
}
