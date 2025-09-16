
'use server';
/**
 * @fileOverview A flow to send WhatsApp notifications for appointments using Twilio templates.
 */

import { z } from 'zod';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { getSecret } from '@genkit-ai/googleai';

const WhatsappConfirmationInputSchema = z.object({
  clientName: z.string(),
  clientPhone: z.string(),
  serviceName: z.string(),
  reservationDate: z.string(), // YYYY-MM-DD
  reservationTime: z.string(), // HH:mm
});

type WhatsappConfirmationInput = z.infer<typeof WhatsappConfirmationInputSchema>;

interface WhatsappConfirmationOutput {
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

export async function sendWhatsappConfirmation(input: WhatsappConfirmationInput): Promise<WhatsappConfirmationOutput> {
  
  const { accountSid, authToken, fromNumber } = await getTwilioCredentials();
  
  if (!accountSid || !authToken || !fromNumber) {
      console.error("Twilio credentials are not set.");
      return { error: "Faltan credenciales de Twilio en el servidor." };
  }
  
  if (accountSid.startsWith('ACxxx')) {
     return { error: "Credenciales de Twilio no configuradas." };
  }

  const reservationDateTime = parseISO(`${input.reservationDate}T${input.reservationTime}:00`);
  const formattedDateTime = format(reservationDateTime, "EEEE, dd 'de' MMMM 'a las' HH:mm 'hrs.'", { locale: es });
  
  let clientPhone = input.clientPhone.replace(/\D/g, '');
  if (clientPhone.length === 10) { 
      clientPhone = `+521${clientPhone}`;
  } else if (clientPhone.length === 12 && clientPhone.startsWith('521')) {
      clientPhone = `+${clientPhone}`;
  }
  const toPhoneNumber = `whatsapp:${clientPhone}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  
  const body = new URLSearchParams();
  body.append('To', toPhoneNumber);
  body.append('From', fromNumber);
  
  body.append('ContentSid', 'HX18fff4936a83e0ec91cd5bf3099efaa9');

  const contentVariables = JSON.stringify({
      '1': input.clientName,
      '2': input.serviceName,
      '3': formattedDateTime,
  });
  body.append('ContentVariables', contentVariables);

  const messageBody = `¡Hola, ${input.clientName}! Tu cita para ${input.serviceName} ha sido confirmada para el ${formattedDateTime}. ¡Te esperamos!`;


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
        console.error("Error al enviar mensaje de Twilio:", responseData);
        throw new Error(`Error de la API de Twilio: ${responseData.message || response.statusText}`);
    }

    console.log("Mensaje de Twilio enviado con éxito:", responseData);
    return { 
        sid: responseData.sid,
        from: fromNumber,
        to: toPhoneNumber,
        body: messageBody,
    };

  } catch(error) {
      console.error("Fallo en la llamada a la API de Twilio:", error);
      return { error: error instanceof Error ? error.message : 'Error desconocido' };
  }
}
