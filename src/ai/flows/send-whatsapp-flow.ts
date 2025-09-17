
'use server';
/**
 * @fileOverview Flow to send an outbound WhatsApp message via Twilio for confirmation.
 */

import { z } from 'zod';
import { getSecret } from '@genkit-ai/googleai';
import { collection, doc, runTransaction, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Profesional } from '@/lib/types';

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
export async function sendWhatsappConfirmation(input: { clientName: string, clientPhone: string, serviceName: string, reservationDate: string, reservationTime: string, professionalId: string }): Promise<WhatsAppMessageOutput> {
    
    // Normalize the phone number
    const cleanedPhone = input.clientPhone.replace(/\D/g, '');
    const to = `whatsapp:+52${cleanedPhone}`;

    // Obtener el nombre del profesional. Dato para {{4}}
    let professionalName = 'El de tu preferencia';
    if(input.professionalId && input.professionalId !== 'any') {
      try {
        const profDoc = await getDoc(doc(db, 'profesionales', input.professionalId));
        if(profDoc.exists()){
          professionalName = (profDoc.data() as Profesional).name;
        }
      } catch (e) {
        console.error("Could not fetch professional name, using default.", e)
      }
    }
    
    // Formatear la fecha y hora. Dato para {{3}}
    const parsedDate = parseISO(input.reservationDate);
    const formattedDate = format(parsedDate, "EEEE, dd 'de' MMMM", { locale: es });
    const fullDateTime = `${formattedDate} a las ${input.reservationTime}`;

    // Esta es la plantilla que se enviará a Twilio.
    // {{1}} es el nombre del cliente
    // {{2}} es el nombre del servicio
    // {{3}} es la fecha y hora completas
    // {{4}} es el nombre del profesional
    const bodyText = `Hola {{1}}\n¡Tu cita en Vatos Alfa Barber Shop ha sido confirmada!\n\nServicio: {{2}}\nDía: {{3}}\nCon: {{4}}\n\nSi necesitas cambiar o cancelar tu cita, por favor avísanos con tiempo respondiendo a este mensaje.`;
    
    // Aquí se reemplazan las variables de la plantilla con los datos reales
    const filledBody = bodyText
        .replace('{{1}}', input.clientName) // Dato {{1}}
        .replace('{{2}}', input.serviceName) // Dato {{2}}
        .replace('{{3}}', fullDateTime) // Dato {{3}}
        .replace('{{4}}', professionalName); // Dato {{4}}
    
    return sendWhatsAppMessage({ to, text: filledBody });
}
