
'use server';
/**
 * @fileOverview A flow to send a templated WhatsApp message using Twilio.
 *
 * - sendTemplatedWhatsAppMessage - A function that calls the Twilio API.
 * - TemplatedWhatsAppMessageInput - The input schema for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import Twilio from 'twilio';

const TemplatedWhatsAppMessageInput = z.object({
  to: z.string().describe("The recipient's phone number, just the digits."),
  contentSid: z.string().describe("The Content SID of the Twilio template to use."),
  contentVariables: z.record(z.string(), z.string()).optional().describe("An object of key-value pairs for the template variables. e.g. { '1': 'John', '2': 'Your appointment details' }"),
});

export type TemplatedWhatsAppMessageInput = z.infer<typeof TemplatedWhatsAppMessageInput>;

const WhatsAppMessageOutputSchema = z.object({
  success: z.boolean(),
  sid: z.string().optional(),
  error: z.string().optional(),
});

type WhatsAppMessageOutput = z.infer<typeof WhatsAppMessageOutputSchema>;

export const sendTemplatedWhatsAppMessage = ai.defineFlow(
  {
    name: 'sendTemplatedWhatsAppMessageFlow',
    inputSchema: TemplatedWhatsAppMessageInput,
    outputSchema: WhatsAppMessageOutputSchema,
  },
  async (payload) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumberRaw = process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumberRaw) {
      const errorMsg = 'Twilio credentials are not configured in server environment variables.';
      console.error(`[DIAGNOSTIC] ERROR: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
    
    try {
      const client = new Twilio(accountSid, authToken);
      
      const fromNumber = `whatsapp:${fromNumberRaw.startsWith('+') ? fromNumberRaw : `+${fromNumberRaw}`}`;
      const toNumber = `whatsapp:+521${payload.to.replace(/\D/g, '')}`;

      const message = await client.messages.create({
        from: fromNumber,
        to: toNumber,
        contentSid: payload.contentSid,
        contentVariables: payload.contentVariables ? JSON.stringify(payload.contentVariables) : undefined,
      });

      console.log('[DIAGNOSTIC] Twilio message sent successfully. SID:', message.sid);

      return {
        success: true,
        sid: message.sid,
      };
    } catch (error: unknown) {
      const errorDetails = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
      console.error('[DIAGNOSTIC] --- TWILIO API ERROR ---', errorDetails);
      return {
        success: false,
        error: errorDetails.message,
      };
    }
  }
);

export const sendTemplatedWhatsAppMessageFlow = sendTemplatedWhatsAppMessage;
