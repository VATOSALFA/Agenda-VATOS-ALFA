
'use server';
/**
 * @fileOverview Flow to send an outbound WhatsApp message via Twilio.
 */

import { z } from 'zod';
import { getSecret } from '@genkit-ai/googleai';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const WhatsAppMessageInputSchema = z.object({
  to: z.string().describe("Recipient's phone number, with the 'whatsapp:' prefix."),
  text: z.string().optional().describe("The text content of the message."),
  mediaUrl: z.string().optional().describe("URL of media to be sent."),
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

  const to = input.to;
  
  const bodyText = input.text || '';

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  
  const body = new URLSearchParams();
  body.append('To', to);
  body.append('From', fromNumber);
  
  if (bodyText) {
    body.append('Body', bodyText);
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
    
    return { success: true, sid: responseData.sid, from: fromNumber, to: to, body: bodyText };

  } catch(error) {
      console.error("Fallo al llamar a la API de Twilio:", error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido al contactar a Twilio.';
      return { success: false, error: errorMessage };
  }
}

// Wrapper for booking confirmations
export async function sendWhatsappConfirmation(input: { clientName: string, clientPhone: string, serviceName: string, reservationDate: string, reservationTime: string, professionalName: string }): Promise<WhatsAppMessageOutput> {
    
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

    // Se normaliza el número de teléfono para que sea compatible con Twilio
    const cleanedPhone = input.clientPhone.replace(/\D/g, '');
    const to = `whatsapp:+52${cleanedPhone}`;

    // Esta es la plantilla que se enviará a Twilio.
    const bodyText = `Hola {{1}}\n¡Tu cita en Vatos Alfa Barber Shop ha sido confirmada!\n\nServicio: {{2}}\nDía: {{3}}\nCon: {{4}}\n\nSi necesitas cambiar o cancelar tu cita, por favor avísanos con tiempo respondiendo a este mensaje.`;
    
    // Aquí se reemplazan las variables de la plantilla con los datos reales
    const filledBody = bodyText
        .replace('{{1}}', clientName)
        .replace('{{2}}', serviceName)
        .replace('{{3}}', fullDateTime)
        .replace('{{4}}', professionalName);
    
    // Se llama a la función genérica para enviar el mensaje ya construido.
    return sendWhatsAppMessage({ to, text: filledBody });
}
