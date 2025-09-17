
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

    // Save the sent message to Firestore
    try {
        const conversationId = to;
        if (!conversationId) {
             throw new Error("Cannot save message to DB without a conversationId (recipient 'to' number).");
        }
        const conversationRef = doc(db, 'conversations', conversationId);
        const newMessageRef = doc(collection(conversationRef, 'messages'));
        const batch = runTransaction(db, async (transaction) => {
            transaction.set(newMessageRef, {
                senderId: 'vatosalfa',
                text: bodyText,
                mediaUrl: input.mediaUrl,
                timestamp: serverTimestamp(),
                messageSid: responseData.sid
            });
            transaction.set(conversationRef, {
                lastMessageText: bodyText || '[Archivo multimedia]',
                lastMessageTimestamp: serverTimestamp(),
            }, { merge: true });
        });
        await batch;
        console.log('Outbound message saved to Firestore');
    } catch(dbError) {
        console.error("Error saving outbound message to Firestore:", dbError);
        // Do not block the flow if DB write fails, but log it.
    }
    
    return { success: true, sid: responseData.sid, from: fromNumber, to: to, body: bodyText };

  } catch(error) {
      console.error("Fallo al llamar a la API de Twilio:", error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido al contactar a Twilio.';
      return { success: false, error: errorMessage };
  }
}

// Wrapper for booking confirmations
export async function sendWhatsappConfirmation(input: { clientName: string, clientPhone: string, serviceName: string, reservationDate: string, reservationTime: string, professionalId: string }): Promise<WhatsAppMessageOutput> {
    const to = `whatsapp:${input.clientPhone}`;

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
    
    const parsedDate = parseISO(input.reservationDate);
    const formattedDate = format(parsedDate, "EEEE, dd 'de' MMMM", { locale: es });
    const fullDateTime = `${formattedDate} a las ${input.reservationTime}`;

    // Using numbered placeholders as requested for Twilio templates
    const bodyText = `Hola {{1}}
¡Tu cita en Vatos Alfa Barber Shop ha sido confirmada!

Servicio: {{2}}
Día: {{3}}
Con: {{4}}

Si necesitas cambiar o cancelar tu cita, por favor avísanos con tiempo respondiendo a este mensaje.`;
    
    const filledBody = bodyText
        .replace('{{1}}', input.clientName)
        .replace('{{2}}', input.serviceName)
        .replace('{{3}}', fullDateTime)
        .replace('{{4}}', professionalName);
    
    return sendWhatsAppMessage({ to, text: filledBody });
}
