
'use server';
/**
 * @fileOverview A flow to send a Google Maps review request to a client.
 *
 * - sendGoogleReviewRequest - A function that handles the review request process.
 * - GoogleReviewRequestInput - The input schema for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import type { Client } from '@/lib/types';

const GoogleReviewRequestInputSchema = z.object({
  clientId: z.string().describe("The ID of the client to send the review request to."),
  clientName: z.string().describe("The name of the client."),
  clientPhone: z.string().describe("The phone number of the client."),
  localName: z.string().describe("The name of the local/branch the client visited."),
});
export type GoogleReviewRequestInput = z.infer<typeof GoogleReviewRequestInputSchema>;

const GoogleReviewRequestOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
type GoogleReviewRequestOutput = z.infer<typeof GoogleReviewRequestOutputSchema>;

export async function sendGoogleReviewRequest(
  input: GoogleReviewRequestInput
): Promise<GoogleReviewRequestOutput> {
  return sendGoogleReviewRequestFlow(input);
}

const sendGoogleReviewRequestFlow = ai.defineFlow(
  {
    name: 'sendGoogleReviewRequestFlow',
    inputSchema: GoogleReviewRequestInputSchema,
    outputSchema: GoogleReviewRequestOutputSchema,
  },
  async (input) => {
    try {
      const clientRef = doc(db, 'clientes', input.clientId);
      const clientSnap = await getDoc(clientRef);

      if (!clientSnap.exists()) {
        return { success: false, message: 'Client not found.' };
      }

      const clientData = clientSnap.data() as Client;

      if (clientData.reviewRequestSent) {
        return { success: false, message: 'Review request already sent to this client.' };
      }

      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            to: input.clientPhone,
            contentSid: 'HXe0e696ca1a1178edc8284bab55555e1c',
            contentVariables: {
              '1': input.clientName,
              '2': input.localName,
            },
        }),
      });

      const result = await response.json();

      if (result.success) {
        await updateDoc(clientRef, { reviewRequestSent: true });
        return { success: true, message: `Review request sent to ${input.clientName}.` };
      } else {
        throw new Error(result.error || 'Failed to send WhatsApp message.');
      }
    } catch (error: unknown) {
      console.error('Error in sendGoogleReviewRequestFlow:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      return { success: false, message: errorMessage };
    }
  }
);
