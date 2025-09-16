
'use server';
/**
 * @fileOverview A flow to send WhatsApp notifications for appointments using Twilio templates.
 */

import { z } from 'zod';
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

interface WhatsappConfirmationOutput {
    sid?: string;
    from?: string;
    to?: string;
    body?: string;
    error?: string;
}

export async function sendWhatsappConfirmation(input: WhatsappConfirmationInput): Promise<WhatsappConfirmationOutput> {
  
  // --- Twilio API Integration using Approved Templates ---
  
  const WHATSAPP_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const FROM_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'; // Your Twilio number or Sandbox
  
  if (!ACCOUNT_SID || !WHATSAPP_TOKEN) {
      console.error("Twilio credentials are not set.");
      return { error: "Faltan credenciales de Twilio en el servidor." };
  }

  const reservationDateTime = parseISO(`${input.reservationDate}T${input.reservationTime}:00`);
  const formattedDateTime = format(reservationDateTime, "EEEE, dd 'de' MMMM 'a las' HH:mm 'hrs.'", { locale: es });
  
  // Normalize client phone number
  let clientPhone = input.clientPhone.replace(/\D/g, '');
  if (clientPhone.length === 10) { // Assume it's a Mexican number without country code
      clientPhone = `+521${clientPhone}`;
  } else if (clientPhone.length === 12 && clientPhone.startsWith('521')) { // Already has 521
      clientPhone = `+${clientPhone}`;
  }
  const toPhoneNumber = `whatsapp:${clientPhone}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`;
  
  const body = new URLSearchParams();
  body.append('To', toPhoneNumber);
  body.append('From', FROM_NUMBER);
  
  // Use the approved template SID for appointment confirmation
  body.append('ContentSid', 'HX18fff4936a83e0ec91cd5bf3099efaa9');

  // Provide the variables for the template
  const contentVariables = JSON.stringify({
      '1': input.clientName,
      '2': input.serviceName,
      '3': formattedDateTime,
  });
  body.append('ContentVariables', contentVariables);

  // We need to construct the message body ourselves to save it.
  // This is a template string that matches the Twilio template.
  const messageBody = `¡Hola, ${input.clientName}! Tu cita para ${input.serviceName} ha sido confirmada para el ${formattedDateTime}. ¡Te esperamos!`;


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
    return { 
        sid: responseData.sid,
        from: FROM_NUMBER,
        to: toPhoneNumber,
        body: messageBody,
    };

  } catch(error) {
      console.error("Fallo en la llamada a la API de Twilio:", error);
      return { error: error instanceof Error ? error.message : 'Error desconocido' };
  }
}
