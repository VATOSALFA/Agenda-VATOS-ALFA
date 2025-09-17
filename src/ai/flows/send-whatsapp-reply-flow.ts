
'use server';
/**
 * @fileOverview Flow to send a WhatsApp reply message via Twilio.
 */

import { ai } from '@/ai/genkit';
import { getSecret } from '@genkit-ai/googleai';
import twilio from 'twilio';

interface ReplyInput {
    to: string; // The full 'whatsapp:+...' number
    body: string;
    mediaUrl?: string; // Optional media URL
}

interface ReplyOutput {
    sid: string;
    from: string; // We'll return the 'from' number to be stored in the DB
    error?: string;
}

async function getTwilioCredentials() {
  try {
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
  } catch (error) {
    console.error("Error fetching Twilio credentials from Secret Manager:", error);
    return { error: 'No se pudieron obtener las credenciales de Twilio desde Secret Manager.' };
  }
}

export async function sendWhatsappReply(input: ReplyInput): Promise<Partial<ReplyOutput>> {
  
  const credentials = await getTwilioCredentials();

  if ('error' in credentials) {
      return { error: credentials.error };
  }
  
  const { accountSid, authToken, fromNumber } = credentials;

  if (!accountSid || !authToken || !fromNumber) {
    return { error: 'Una o más credenciales de Twilio no están configuradas en el servidor.' };
  }
  
  if (accountSid.startsWith('ACxxx') || authToken === 'your_auth_token') {
      return { error: 'Estás usando las credenciales de ejemplo. Por favor, actualiza las credenciales de Twilio.'};
  }

  try {
    const client = twilio(accountSid, authToken);
    
    const messageOptions: {
        body: string;
        from: string;
        to: string;
        mediaUrl?: string[];
    } = {
      body: input.body,
      from: fromNumber,
      to: input.to,
    };

    if (input.mediaUrl) {
      messageOptions.mediaUrl = [input.mediaUrl];
    }
    
    if (!messageOptions.body && messageOptions.mediaUrl?.length) {
        messageOptions.body = " ";
    }

    const message = await client.messages.create(messageOptions);

    console.log('Twilio reply sent with SID:', message.sid);
    return { sid: message.sid, from: fromNumber };
    
  } catch (error: any) {
    console.error('Error sending Twilio API request:', error);
    const errorMessage = error.message || 'Error desconocido en la API de Twilio.';
    return { error: `Fallo al enviar la solicitud a Twilio: ${errorMessage}` };
  }
}
