
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
import { collection, query, where, getDocs, setDoc, updateDoc, doc, addDoc, serverTimestamp, limit, getDoc } from 'firebase/firestore';


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
        return (content.types as Record<string, { body: string }> )['twilio/text']?.body || (content.types as Record<string, { body: string }>)['twilio/whatsapp-template']?.body || 'Plantilla no encontrada.';
    } catch (error) {
        console.error("Error fetching template body from Twilio:", error);
        return 'Plantilla no encontrada.';
    }
}

async function logMessageToConversation(to: string, messageBody: string) {
    const cleanPhoneNumber = to.replace(/\D/g, '').slice(-10);
    const conversationId = `whatsapp:+521${cleanPhoneNumber}`;
    const conversationRef = doc(db, 'conversations', conversationId);
    const messagesCollectionRef = collection(db, 'conversations', conversationId, 'messages');

    const messageData = {
        senderId: 'vatosalfa',
        text: messageBody,
        timestamp: serverTimestamp(),
        read: true,
    };
    
    await addDoc(messagesCollectionRef, messageData);
    
    const conversationSnap = await getDoc(conversationRef);
    
    const conversationData = {
        lastMessageText: `Tú: ${messageBody}`,
        lastMessageTimestamp: serverTimestamp(),
    };
    
    if (!conversationSnap.exists()) {
        const clientsRef = collection(db, 'clientes');
        const clientQuery = query(clientsRef, where('telefono', '==', cleanPhoneNumber), limit(1));
        const clientSnapshot = await getDocs(clientQuery);
        
        let clientName = null;
        if (!clientSnapshot.empty) {
            const clientData = clientSnapshot.docs[0].data();
            clientName = `${clientData.nombre} ${clientData.apellido}`;
        }
        
        await setDoc(conversationRef, {
            ...conversationData,
            clientName: clientName || `+521${cleanPhoneNumber}`,
            unreadCount: 0
        });
    } else {
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
    console.log('[DIAGNOSTIC] Iniciando flujo sendTemplatedWhatsAppMessageFlow.');
    
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumberRaw = process.env.TWILIO_PHONE_NUMBER;
    
    console.log(`[DIAGNOSTIC] TWILIO_ACCOUNT_SID encontrado: ${!!accountSid}`);
    console.log(`[DIAGNOSTIC] TWILIO_AUTH_TOKEN encontrado: ${!!authToken}`);
    console.log(`[DIAGNOSTIC] TWILIO_PHONE_NUMBER encontrado: ${!!fromNumberRaw}`);

    if (!accountSid || !authToken || !fromNumberRaw) {
      const errorMsg = 'Las credenciales de Twilio no están configuradas en las variables de entorno del servidor.';
      console.error(`[DIAGNOSTIC] ERROR: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }

    try {
      console.log('[DIAGNOSTIC] Creando cliente de Twilio...');
      const client = new Twilio(accountSid, authToken);
      
      const cleanFromNumber = `+${fromNumberRaw.replace(/\D/g, '')}`;
      const cleanToNumber = `+521${input.to.replace(/\D/g, '').slice(-10)}`;

      const messageData = {
        from: `whatsapp:${cleanFromNumber}`,
        to: `whatsapp:${cleanToNumber}`,
        contentSid: input.contentSid,
        contentVariables: JSON.stringify(input.contentVariables),
      };

      console.log('[DIAGNOSTIC] Enviando mensaje a Twilio con los siguientes datos:', messageData);
      const message = await client.messages.create(messageData);
      console.log('[DIAGNOSTIC] Mensaje enviado con éxito. SID:', message.sid);


      const templateBody = await getTemplateBody(client, input.contentSid);
      let renderedBody = templateBody;
      for (const [key, value] of Object.entries(input.contentVariables)) {
          renderedBody = renderedBody.replace(`{{${key}}}`, value);
      }
      
      await logMessageToConversation(input.to, renderedBody);
      console.log('[DIAGNOSTIC] Mensaje guardado en la conversación.');


      return {
        success: true,
        sid: message.sid,
      };
    } catch (error: unknown) {
      console.error('[DIAGNOSTIC] --- ERROR DE API DE TWILIO ---');
      console.error(JSON.stringify(error, null, 2));
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido al enviar mensaje de Twilio.';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
);
export const sendTemplatedWhatsAppMessageFlow = sendTemplatedWhatsAppMessage;
