
'use server';
/**
 * @fileOverview Flow to send a test WhatsApp message via Twilio.
 */

import { ai } from '@/ai/genkit';
import { getSecret } from '@genkit-ai/googleai';
import twilio from 'twilio';

async function getTwilioCredentials() {
  if (process.env.NODE_ENV === 'production') {
    const [accountSid, authToken, twilioSandboxPhoneNumber] = await Promise.all([
      getSecret('TWILIO_ACCOUNT_SID'),
      getSecret('TWILIO_AUTH_TOKEN'),
      getSecret('TWILIO_SANDBOX_PHONE_NUMBER')
    ]);
    return { accountSid, authToken, twilioSandboxPhoneNumber };
  } else {
    return {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      twilioSandboxPhoneNumber: process.env.TWILIO_SANDBOX_PHONE_NUMBER
    };
  }
}

export async function sendTestTwilioMessage(): Promise<{ sid: string } | { error: string }> {
  
  const { accountSid, authToken, twilioSandboxPhoneNumber } = await getTwilioCredentials();

  if (!accountSid || !authToken || !twilioSandboxPhoneNumber) {
    console.error('Twilio environment variables are not set.');
    return { error: 'Las credenciales de Twilio no están configuradas en el servidor.' };
  }
  
  if (accountSid === 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' || authToken === 'your_auth_token') {
      return { error: 'Estás usando las credenciales de ejemplo. Por favor, actualiza las credenciales de Twilio.'}
  }

  // Normalize the sandbox phone number to ensure it has the correct format for Mexico
  let normalizedPhone = twilioSandboxPhoneNumber.replace(/\D/g, '');
  if (normalizedPhone.length === 10) {
      // It's just the 10-digit number
      normalizedPhone = `+521${normalizedPhone}`;
  } else if (normalizedPhone.length === 12 && normalizedPhone.startsWith('52') && !normalizedPhone.startsWith('521')) {
      // It's a 10-digit number with country code but missing the '1'
      normalizedPhone = `+521${normalizedPhone.substring(2)}`;
  } else if (!normalizedPhone.startsWith('+')) {
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
