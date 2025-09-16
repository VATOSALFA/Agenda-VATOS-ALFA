
'use server';
/**
 * @fileOverview Flow to send a test WhatsApp message via Twilio.
 */

import { ai } from '@/ai/genkit';
import twilio from 'twilio';

export async function sendTestTwilioMessage(): Promise<{ sid: string } | { error: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  let twilioSandboxPhoneNumber = process.env.TWILIO_SANDBOX_PHONE_NUMBER;

  if (!accountSid || !authToken || !twilioSandboxPhoneNumber) {
    console.error('Twilio environment variables are not set.');
    return { error: 'Las credenciales de Twilio no están configuradas en el servidor.' };
  }
  
  if (accountSid === 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' || authToken === 'your_auth_token') {
      return { error: 'Estás usando las credenciales de ejemplo. Por favor, actualiza las credenciales de Twilio en la configuración de tu backend de Firebase.'}
  }

  // Normalize the sandbox phone number to ensure it has the correct format for Mexico
  let normalizedPhone = twilioSandboxPhoneNumber.replace(/\D/g, '');
  if (normalizedPhone.startsWith('52') && normalizedPhone.length === 12 && !normalizedPhone.startsWith('521')) {
      // It's a 10-digit number with country code but missing the '1'
      normalizedPhone = `521${normalizedPhone.substring(2)}`;
  } else if (normalizedPhone.length === 10) {
      // It's just the 10-digit number
      normalizedPhone = `521${normalizedPhone}`;
  }
  // Ensure it has the '+' prefix
  if (!normalizedPhone.startsWith('+')) {
      normalizedPhone = `+${normalizedPhone}`;
  }


  try {
    const client = twilio(accountSid, authToken);
    const message = await client.messages.create({
      body: '¡Hola Mundo desde mi plataforma!',
      from: 'whatsapp:+14155238886', // Twilio's Sandbox number
      to: `whatsapp:${normalizedPhone}`,
    });

    console.log('Twilio message sent with SID:', message.sid);
    return { sid: message.sid };
  } catch (error) {
    console.error('Error sending Twilio message:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return { error: `Fallo al enviar mensaje de Twilio: ${errorMessage}` };
  }
}
