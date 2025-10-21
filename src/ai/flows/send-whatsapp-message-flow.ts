
'use server';
/**
 * @fileOverview A flow to send a WhatsApp message using Twilio.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import Twilio from 'twilio';
import { MessageListInstanceCreateOptions } from 'twilio/lib/rest/api/v2010/account/message';

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
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumberRaw = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumberRaw) {
      const errorMsg = 'Twilio credentials are not configured in environment variables.';
      console.error(errorMsg);
      return { success: false, error: errorMsg };
    }
    
    if (!input.text && !input.mediaUrl) {
        return {
            success: false,
            error: 'Message must include either text or a media URL.'
        }
    }

    try {
      const client = new Twilio(accountSid, authToken);
      const fromNumber = fromNumberRaw.startsWith('+521') ? `+52${fromNumberRaw.slice(4)}` : fromNumberRaw;

      const messageData: MessageListInstanceCreateOptions = {
        from: `whatsapp:${fromNumber}`,
        to: `whatsapp:+52${input.to}`,
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
    } catch (error: unknown) {
      console.error('Twilio API Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred with Twilio.';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
);
