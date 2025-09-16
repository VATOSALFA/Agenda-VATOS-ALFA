
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

export async function sendWhatsappReply(input: ReplyInput): Promise<Partial<ReplyOutput>> {
  
  const { accountSid, authToken, fromNumber } = await getTwilioCredentials();

  if (!accountSid || !authToken || !fromNumber) {
    console.error('Twilio environment variables are not fully set for replies.');
    return { error: 'Las credenciales de Twilio no están configuradas en el servidor.' };
  }
  
  // Prevent using placeholder credentials
  if (accountSid.startsWith('ACxxx') || authToken === 'your_auth_token') {
      return { error: 'Estás usando las credenciales de ejemplo. Por favor, actualiza las credenciales de Twilio en la configuración de tu backend de Firebase.'}
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
      from: fromNumber, // Your Twilio WhatsApp number
      to: input.to,     // The client's WhatsApp number
    };

    if (input.mediaUrl) {
      // The mediaUrl needs to be an array of strings
      messageOptions.mediaUrl = [input.mediaUrl];
    }
    
    // The message body is required, even if sending media.
    if (!messageOptions.body && messageOptions.mediaUrl?.length) {
        messageOptions.body = " "; // Send a space if body is empty but media is present
    }

    const message = await client.messages.create(messageOptions);

    console.log('Twilio reply sent with SID:', message.sid);
    return { sid: message.sid, from: fromNumber };
  } catch (error) {
    console.error('Error sending Twilio reply:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return { error: `Fallo al enviar respuesta de Twilio: ${errorMessage}` };
  }
}
