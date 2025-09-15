
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


export async function sendWhatsappConfirmation(input: WhatsappConfirmationInput): Promise<string> {
  
  // --- Twilio API Integration using Approved Templates ---
  
  const WHATSAPP_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const FROM_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'; // Your Twilio number or Sandbox
  
  if (!ACCOUNT_SID || !WHATSAPP_TOKEN) {
      console.error("Twilio credentials are not set.");
      return "Error: Faltan credenciales de Twilio en el servidor.";
  }

  const reservationDateTime = parseISO(`${input.reservationDate}T${input.reservationTime}:00`);
  const formattedDateTime = format(reservationDateTime, "EEEE, dd 'de' MMMM 'a las' HH:mm 'hrs.'", { locale: es });

  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`;
  
  const body = new URLSearchParams();
  body.append('To', `whatsapp:${input.clientPhone}`);
  body.append('From', FROM_NUMBER);
  
  // Use the approved template SID for appointment confirmation
  body.append('ContentSid', 'HX80c44a78ec1b3ba62786665088632a10');

  // Provide the variables for the template
  // Twilio uses {{1}}, {{2}}, etc. as placeholders.
  // We need to map our data to these placeholders.
  // Assuming: {{1}} -> clientName, {{2}} -> serviceName, {{3}} -> formattedDateTime
  body.append('ContentVariables', JSON.stringify({
      '1': input.clientName,
      '2': input.serviceName,
      '3': formattedDateTime,
  }));


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
    return responseData.sid; // Returns the Message SID.

  } catch(error) {
      console.error("Fallo en la llamada a la API de Twilio:", error);
      return `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`;
  }
}
