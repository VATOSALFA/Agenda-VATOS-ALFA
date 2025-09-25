
'use server';
/**
 * @fileOverview A flow to send a WhatsApp message using Twilio.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import Twilio from 'twilio';

const WhatsAppMessageSchema = z.object({
  to: z.string().describe("The recipient's phone number, just the digits."),
  text: z.string().optional().describe("The text content of the message."),
  mediaUrl: z.string().url().optional().describe("A URL to media to attach to the message."),
});

type WhatsAppMessageInput = z.infer<typeof WhatsAppMessageSchema>;

const WhatsAppMessageOutputSchema = z.object({
  success: z.boolean(),
  sid: z.string().optional(),
  error: z.string().optional(),
});

type WhatsAppMessageOutput = z.infer<typeof WhatsAppMessageOutputSchema>;

export async function sendWhatsAppMessage(
  input: WhatsAppMessageInput
): Promise<WhatsAppMessageOutput> {
  return sendWhatsAppMessageFlow(input);
}

const sendWhatsAppMessageFlow = ai.defineFlow(
  {
    name: 'sendWhatsAppMessageFlow',
    inputSchema: WhatsAppMessageSchema,
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
    
    if (!input.text && !input.mediaUrl) {
        return {
            success: false,
            error: 'Message must include either text or a media URL.'
        }
    }

    try {
      const client = new Twilio.Twilio(accountSid, authToken);
      
      const messageData: any = {
        from: fromNumber,
        to: `whatsapp:+521${input.to}`,
        body: input.text || '',
      };
      
      if (input.mediaUrl) {
          messageData.mediaUrl = [input.mediaUrl];
      }

      const message = await client.messages.create(messageData);

      return {
        success: true,
        sid: message.sid,
      };
    } catch (error: any) {
      console.error('Twilio API Error:', error);
      return {
        success: false,
        error: error.message || 'An unknown error occurred with Twilio.',
      };
    }
  }
);
