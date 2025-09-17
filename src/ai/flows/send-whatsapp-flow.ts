
'use server';
/**
 * @fileOverview Flow to send an outbound WhatsApp message via Twilio.
 */

import { z } from 'zod';
import { getSecret } from '@genkit-ai/googleai';
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const WhatsAppInputSchema = z.object({
  to: z.string().describe("Recipient's phone number in E.164 format with whatsapp: prefix."),
  text: z.string().optional().describe("The text content of the message."),
  mediaUrl: z.string().optional().describe("The URL of the media to send."),
});

type WhatsAppInput = z.infer<typeof WhatsAppInputSchema>;

interface WhatsAppOutput {
    success: boolean;
    sid?: string;
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
    // For local development, ensure these are set in your .env file
    return {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      fromNumber: process.env.TWILIO_WHATSAPP_NUMBER
    };
  }
}

export async function sendWhatsAppMessage(input: WhatsAppInput): Promise<WhatsAppOutput> {
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

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  
  const body = new URLSearchParams();
  body.append('To', input.to);
  body.append('From', fromNumber);
  
  if (input.text) {
      body.append('Body', input.text);
  }
  if (input.mediaUrl) {
      body.append('MediaUrl', input.mediaUrl);
  }
  
  if (!input.text && !input.mediaUrl) {
    return { success: false, error: "El mensaje debe tener texto o un archivo adjunto."};
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

    console.log("Mensaje de Twilio enviado con éxito:", responseData.sid);
    
    // Save outbound message to Firestore
    const conversationRef = doc(db, 'conversations', input.to);
    
    await runTransaction(db, async (transaction) => {
        const messageData: any = {
            senderId: 'vatosalfa',
            text: input.text,
            timestamp: serverTimestamp(),
            messageSid: responseData.sid,
            read: true, // Outbound messages are always "read"
        };

        if (input.mediaUrl) {
            messageData.mediaUrl = input.mediaUrl;
            // You might need to determine mediaType based on the URL or another input param
            if(input.mediaUrl.includes('.pdf')) messageData.mediaType = 'document';
            else if(input.mediaUrl.includes('audio')) messageData.mediaType = 'audio';
            else messageData.mediaType = 'image';
        }

        const newMessageRef = doc(collection(conversationRef, 'messages'));
        transaction.set(newMessageRef, messageData);
        
        transaction.update(conversationRef, {
            lastMessageText: input.text || `[${messageData.mediaType}]`,
            lastMessageTimestamp: serverTimestamp(),
        });
    });

    return { success: true, sid: responseData.sid };

  } catch(error) {
      console.error("Fallo al llamar a la API de Twilio:", error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido al contactar a Twilio.';
      return { success: false, error: errorMessage };
  }
}
