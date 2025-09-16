'use server';
/**
 * @fileOverview Flow to send a test WhatsApp message via Twilio.
 */

import { ai } from '@/ai/genkit';
import twilio from 'twilio';
import 'dotenv/config';


export async function sendTestTwilioMessage(): Promise<{ sid: string } | { error: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioSandboxPhoneNumber = process.env.TWILIO_SANDBOX_PHONE_NUMBER;

  if (!accountSid || !authToken || !twilioSandboxPhoneNumber) {
    console.error('Twilio environment variables are not set.');
    return { error: 'Las credenciales de Twilio no están configuradas en el servidor.' };
  }
  
  if (accountSid === 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' || authToken === 'your_auth_token') {
      return { error: 'Estás usando las credenciales de ejemplo. Por favor, actualiza el archivo .env con tus claves de Twilio.'}
  }

  try {
    const client = twilio(accountSid, authToken);
    const message = await client.messages.create({
      body: '¡Hola Mundo desde mi plataforma!',
      from: 'whatsapp:+14155238886', // Twilio's Sandbox number
      to: `whatsapp:${twilioSandboxPhoneNumber}`,
    });

    console.log('Twilio message sent with SID:', message.sid);
    return { sid: message.sid };
  } catch (error) {
    console.error('Error sending Twilio message:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return { error: `Fallo al enviar mensaje de Twilio: ${errorMessage}` };
  }
}
