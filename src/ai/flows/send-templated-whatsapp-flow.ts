
'use server';
/**
 * @fileOverview A flow to send a templated WhatsApp message using Twilio.
 *
 * - sendTemplatedWhatsAppMessage - A function that sends a message using a specific Content SID and variables.
 * - TemplatedWhatsAppMessageInput - The input schema for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import Twilio from 'twilio';

const TemplatedWhatsAppMessageInput = z.object({
  to: z.string().describe("The recipient's phone number in E.164 format, just the digits."),
  contentSid: z.string().describe("The Content SID of the Twilio template to use."),
  contentVariables: z.record(z.string(), z.string()).describe("An object of key-value pairs for the template variables. e.g. { '1': 'John', '2': 'Your appointment details' }"),
});

export type TemplatedWhatsAppMessageInput = z.infer<typeof TemplatedWhatsAppMessageInput>;

const WhatsAppMessageOutputSchema = z.object({
  success: z.boolean(),
  sid: z.string().optional(),
  error: z.string().optional(),
  body: z.string().optional(), // Added to return the message body
});

type WhatsAppMessageOutput = z.infer<typeof WhatsAppMessageOutputSchema>;

export async function sendTemplatedWhatsAppMessage(
  input: TemplatedWhatsAppMessageInput
): Promise<WhatsAppMessageOutput> {
  return sendTemplatedWhatsAppMessageFlow(input);
}

const sendTemplatedWhatsAppMessageFlow = ai.defineFlow(
  {
    name: 'sendTemplatedWhatsAppMessageFlow',
    inputSchema: TemplatedWhatsAppMessageInput,
    outputSchema: WhatsAppMessageOutputSchema,
  },
  async (input) => {
    const accountSid = process.env.NEXT_PUBLIC_TWILIO_ACCOUNT_SID;
    const authToken = process.env.NEXT_PUBLIC_TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return {
        success: false,
        error: 'Twilio credentials are not configured in environment variables.',
      };
    }

    try {
      const client = new Twilio.Twilio(accountSid, authToken);
      
      const messageData: any = {
        from: `whatsapp:${fromNumber}`,
        to: `whatsapp:+521${input.to}`,
        contentSid: input.contentSid,
        contentVariables: JSON.stringify(input.contentVariables),
      };
      
      const message = await client.messages.create(messageData);

      // Fetch the message to get its body, as create doesn't return it for templates
      const sentMessage = await client.messages(message.sid).fetch();

      return {
        success: true,
        sid: message.sid,
        body: sentMessage.body,
      };
    } catch (error: any) {
      console.error('Twilio API Error (Template):', error);
      return {
        success: false,
        error: error.message || 'An unknown error occurred with Twilio templated message.',
      };
    }
  }
);
