
'use server';
/**
 * @fileOverview A flow to send a templated WhatsApp message using Twilio via a Cloud Function.
 *
 * - sendTemplatedWhatsAppMessage - A function that calls a secure backend function to send a message.
 * - TemplatedWhatsAppMessageInput - The input schema for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { functions, httpsCallable } from '@/lib/firebase-client';
import { sendWhatsAppMessage } from './send-whatsapp-message-flow';


const TemplatedWhatsAppMessageInput = z.object({
  to: z.string().describe("The recipient's phone number, just the digits."),
  contentSid: z.string().describe("The Content SID of the Twilio template to use."),
  contentVariables: z.record(z.string(), z.string()).describe("An object of key-value pairs for the template variables. e.g. { '1': 'John', '2': 'Your appointment details' }"),
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
  async ({ to, contentSid, contentVariables }) => {
    try {
      const result = await sendWhatsAppMessage({
        to,
        text: `Your Template SID is: ${contentSid} and variables are ${JSON.stringify(contentVariables)}`
      });
      return result;
    } catch (error: unknown) {
      console.error('[DIAGNOSTIC] --- ERROR IN TEMPLATED FLOW ---');
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      console.error(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
);
export const sendTemplatedWhatsAppMessageFlow = sendTemplatedWhatsAppMessage;
