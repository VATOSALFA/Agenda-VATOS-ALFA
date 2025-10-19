
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
import { db } from '@/lib/firebase-client';
import { collection, query, where, getDocs, setDoc, updateDoc, doc, addDoc, serverTimestamp, limit } from 'firebase/firestore';


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

// This function retrieves the template body from Twilio.
// In a real app, you might want to cache this.
async function getTemplateBody(client: Twilio.Twilio, contentSid: string): Promise<string> {
    try {
        const content = await client.content.v1.contents(contentSid).fetch();
        // The body can be in `content.types.twilio/text.body` or similar structures.
        // This is a simplified access pattern.
        return (content.types as Record<string, { body: string }> )['twilio/text']?.body || (content.types as Record<string, { body: string }>)['twilio/whatsapp-template']?.body || 'Plantilla no encontrada.';
    } catch (error) {
        console.error("Error fetching template body from Twilio:", error);
        return 'Plantilla no encontrada.';
    }
}

async function logMessageToConversation(to: string, messageBody: string) {
    // The 'to' variable is just the 10-digit number.
    const conversationId = `whatsapp:+52${to}`; // Construct the full ID
    const conversationRef = doc(db, 'conversations', conversationId);
    const messagesCollectionRef = collection(db, 'conversations', conversationId, 'messages');

    const messageData = {
        senderId: 'vatosalfa',
        text: messageBody,
        timestamp: serverTimestamp(),
        read: true,
    };
    
    await addDoc(messagesCollectionRef, messageData);
    
    // Check if the conversation document exists
    const conversationSnap = await getDoc(conversationRef);
    
    const conversationData = {
        lastMessageText: `Tú: ${messageBody}`,
        lastMessageTimestamp: serverTimestamp(),
    };
    
    if (!conversationSnap.exists()) {
        // Conversation doesn't exist, create it with client info
        const clientsRef = collection(db, 'clientes');
        // Search for the client using the 10-digit phone number
        const clientQuery = query(clientsRef, where('telefono', '==', to), limit(1));
        const clientSnapshot = await getDocs(clientQuery);
        
        let clientName = null;
        if (!clientSnapshot.empty) {
            const clientData = clientSnapshot.docs[0].data();
            clientName = `${clientData.nombre} ${clientData.apellido}`;
        }
        
        await setDoc(conversationRef, {
            ...conversationData,
            clientName: clientName || `+52${to}`, // Use phone as fallback name
            unreadCount: 0 // Messages sent by us are "read" by default
        });
    } else {
        // Conversation exists, just update it
        await updateDoc(conversationRef, conversationData);
    }
}


export const sendTemplatedWhatsAppMessage = ai.defineFlow(
  {
    name: 'sendTemplatedWhatsAppMessageFlow',
    inputSchema: TemplatedWhatsAppMessageInput,
    outputSchema: WhatsAppMessageOutputSchema,
  },
  async (input) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      console.error('Twilio credentials not configured.');
      return {
        success: false,
        error: 'Twilio credentials are not configured in environment variables.',
      };
    }

    try {
      const client = new Twilio.Twilio(accountSid, authToken);
      
      const messageData = {
        from: `whatsapp:${fromNumber}`,
        to: `whatsapp:+52${input.to}`,
        contentSid: input.contentSid,
        contentVariables: JSON.stringify(input.contentVariables),
      };
      
      const message = await client.messages.create(messageData);

      // Log the sent message to Firestore
      const templateBody = await getTemplateBody(client, input.contentSid);
      let renderedBody = templateBody;
      for (const [key, value] of Object.entries(input.contentVariables)) {
          renderedBody = renderedBody.replace(`{{${key}}}`, value);
      }
      
      await logMessageToConversation(input.to, renderedBody);

      return {
        success: true,
        sid: message.sid,
      };
    } catch (error: unknown) {
      console.error('Twilio API Error (Template):', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred with Twilio templated message.';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
);
export const sendTemplatedWhatsAppMessageFlow = sendTemplatedWhatsAppMessage;
