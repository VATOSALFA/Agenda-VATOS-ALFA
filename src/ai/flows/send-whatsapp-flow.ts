
'use server';
/**
 * @fileOverview Flow to send an outbound WhatsApp message via Twilio for confirmation.
 */

import { z } from 'zod';
import { getSecret } from '@genkit-ai/googleai';
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const WhatsAppConfirmationInputSchema = z.object({
  clientName: z.string().describe("Client's full name."),
  clientPhone: z.string().describe("Client's phone number, without the 'whatsapp:' prefix."),
  serviceName: z.string().describe("Name of the service(s) booked."),
  reservationDate: z.string().describe("Date of the reservation in yyyy-MM-dd format."),
  reservationTime: z.string().describe("Time of the reservation in HH:mm format."),
});

type WhatsAppConfirmationInput = z.infer<typeof WhatsAppConfirmationInputSchema>;

interface WhatsAppConfirmationOutput {
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

export async function sendWhatsappConfirmation(input: WhatsAppConfirmationInput): Promise<WhatsAppConfirmationOutput> {
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

  const to = `whatsapp:${input.clientPhone}`;
  
  const parsedDate = parseISO(input.reservationDate);
  const formattedDate = format(parsedDate, "EEEE, dd 'de' MMMM 'del' yyyy", { locale: es });
  
  const bodyText = `¡Hola, ${input.clientName}! Tu cita para ${input.serviceName} ha sido confirmada para el ${formattedDate} a las ${input.reservationTime}hs. ¡Te esperamos en VATOS ALFA Barber Shop!`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  
  const body = new URLSearchParams();
  body.append('To', to);
  body.append('From', fromNumber);
  body.append('Body', bodyText);
  

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

    console.log("Mensaje de confirmación de Twilio enviado con éxito:", responseData.sid);
    
    return { success: true, sid: responseData.sid, from: fromNumber, to: to, body: bodyText };

  } catch(error) {
      console.error("Fallo al llamar a la API de Twilio:", error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido al contactar a Twilio.';
      return { success: false, error: errorMessage };
  }
}
