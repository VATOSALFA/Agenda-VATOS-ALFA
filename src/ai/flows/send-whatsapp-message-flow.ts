
'use server';
/**
 * @fileOverview A flow to send a WhatsApp message using Twilio.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import twilio from 'twilio';
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
    console.log('[DIAGNOSTIC] sendWhatsAppMessageFlow triggered on the server.');
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumberRaw = process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER;

    console.log(`[DIAGNOSTIC] Secrets: SID found: ${!!accountSid}, Token found: ${!!authToken}, Number found: ${!!fromNumberRaw}`);


    if (!accountSid || !authToken || !fromNumberRaw) {
      const errorMsg = 'Twilio credentials are not configured in environment variables.';
      console.error(`[DIAGNOSTIC] ERROR: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
    
    if (!input.text && !input.mediaUrl) {
        const errorMsg = 'Message must include either text or a media URL.';
        console.error(`[DIAGNOSTIC] ERROR: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }

    try {
      console.log(`[DIAGNOSTIC] Initializing Twilio client...`);
      const client = twilio(accountSid, authToken);
      
      // Ensure correct formatting for numbers
      const fromNumber = `whatsapp:${fromNumberRaw.startsWith('+') ? fromNumberRaw : `+${fromNumberRaw}`}`;
      const toNumber = `whatsapp:+521${input.to.replace(/\D/g, '')}`;


      const messageData: MessageListInstanceCreateOptions = {
        from: fromNumber,
        to: toNumber,
        body: input.text || '',
      };
      
      if (input.mediaUrl) {
          messageData.mediaUrl = [input.mediaUrl];
      }

      console.log('[DIAGNOSTIC] Sending message with data:', { from: messageData.from, to: messageData.to, body: messageData.body ? `${messageData.body.substring(0, 20)}...` : 'No body', hasMedia: !!messageData.mediaUrl });
      const message = await client.messages.create(messageData);
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
