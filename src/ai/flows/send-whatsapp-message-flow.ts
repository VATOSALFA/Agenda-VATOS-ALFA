
'use server';
/**
 * @fileOverview A flow to send a WhatsApp message (STUBBED - Twilio Disabled).
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

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
    console.log('[STUB] sendWhatsAppMessageFlow triggered. Twilio integration has been removed.');
    console.log('[STUB] Message data:', input);

    return {
      success: false,
      error: "Messaging module is disabled.",
    };
  }
);
