
'use server';
/**
 * @fileOverview A flow to send birthday wishes to clients.
 *
 * This is intended to be run by a scheduled job.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { collection, query, where, getDocs, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { sendTemplatedWhatsAppMessage } from './send-templated-whatsapp-flow';
import type { Client } from '@/lib/types';
import { format } from 'date-fns';

interface BirthdaySettings {
    notifications: {
        birthday_notification?: {
            enabled: boolean;
        };
    };
}

const SendBirthdayWishesInputSchema = z.object({
  // This flow can be triggered without specific input for scheduled jobs.
  run: z.boolean().optional().default(true),
});
export type SendBirthdayWishesInput = z.infer<typeof SendBirthdayWishesInputSchema>;

const SendBirthdayWishesOutputSchema = z.object({
  success: z.boolean(),
  wishesSent: z.number(),
  message: z.string(),
});
export type SendBirthdayWishesOutput = z.infer<typeof SendBirthdayWishesOutputSchema>;

export async function sendBirthdayWishes(
  input: SendBirthdayWishesInput
): Promise<SendBirthdayWishesOutput> {
  return sendBirthdayWishesFlow(input);
}

const sendBirthdayWishesFlow = ai.defineFlow(
  {
    name: 'sendBirthdayWishesFlow',
    inputSchema: SendBirthdayWishesInputSchema,
    outputSchema: SendBirthdayWishesOutputSchema,
  },
  async () => {
    try {
      const settingsRef = doc(db, 'configuracion', 'recordatorios');
      const settingsSnap = await getDoc(settingsRef);
      
      if (!settingsSnap.exists()) {
        return { success: false, wishesSent: 0, message: 'Birthday notification settings not found.' };
      }
      
      const settings = settingsSnap.data() as BirthdaySettings;
      const birthdayConfig = settings.notifications?.birthday_notification;

      if (!birthdayConfig || !birthdayConfig.enabled) {
        return { success: true, wishesSent: 0, message: 'Birthday notifications are disabled.' };
      }

      const today = new Date();
      // Format as MM-DD to match the stored format "YYYY-MM-DD"
      const todayMonthDay = format(today, 'MM-dd');

      const q = query(
        collection(db, 'clientes'),
        where('fecha_nacimiento', '>=', `0000-${todayMonthDay}`),
        where('fecha_nacimiento', '<=', `9999-${todayMonthDay}`)
      );
      
      const clientsSnap = await getDocs(q);

      const clientsWithBirthday = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      
      let sentCount = 0;

      for (const client of clientsWithBirthday) {
        if (client.telefono && client.nombre) {
          await sendTemplatedWhatsAppMessage({
            to: client.telefono,
            contentSid: 'HX61a03ed45a32f9ddf4a46ee5a10fe15b', // Birthday template
            contentVariables: {
              '1': client.nombre,
            },
          });
          sentCount++;
        }
      }

      return { success: true, wishesSent: sentCount, message: `Sent ${sentCount} birthday wishes.` };

    } catch (error: any) {
      console.error('Error in sendBirthdayWishesFlow:', error);
      return { success: false, wishesSent: 0, message: error.message || 'An unknown error occurred.' };
    }
  }
);
