
'use server';
/**
 * @fileOverview A flow to send appointment reminders to clients.
 *
 * This is intended to be run by a scheduled job.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { collection, query, where, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { sendTemplatedWhatsAppMessage } from './send-templated-whatsapp-flow';
import type { Reservation, Client } from '@/lib/types';
import { addHours, subDays, startOfHour } from 'date-fns';


interface ReminderSettings {
    notifications: {
        appointment_reminder?: {
            enabled: boolean;
            timing?: {
                type: 'day_before' | 'same_day';
                hours_before?: number;
            };
        };
    };
}

const AppointmentReminderInputSchema = z.object({
  // This flow can be triggered without specific input, it will check all upcoming appointments.
});
export type AppointmentReminderInput = z.infer<typeof AppointmentReminderInputSchema>;

const AppointmentReminderOutputSchema = z.object({
  success: z.boolean(),
  remindersSent: z.number(),
  message: z.string(),
});
export type AppointmentReminderOutput = z.infer<typeof AppointmentReminderOutputSchema>;

export async function sendAppointmentReminders(
  input: AppointmentReminderInput
): Promise<AppointmentReminderOutput> {
  return sendAppointmentRemindersFlow(input);
}

const sendAppointmentRemindersFlow = ai.defineFlow(
  {
    name: 'sendAppointmentRemindersFlow',
    inputSchema: AppointmentReminderInputSchema,
    outputSchema: AppointmentReminderOutputSchema,
  },
  async () => {
    try {
      const settingsRef = doc(db, 'configuracion', 'recordatorios');
      const settingsSnap = await getDoc(settingsRef);
      
      if (!settingsSnap.exists()) {
        return { success: false, remindersSent: 0, message: 'Reminder settings not found.' };
      }
      
      const settings = settingsSnap.data() as ReminderSettings;
      const reminderConfig = settings.notifications?.appointment_reminder;

      if (!reminderConfig || !reminderConfig.enabled) {
        return { success: true, remindersSent: 0, message: 'Appointment reminders are disabled.' };
      }

      const now = new Date();
      let targetDate: Date;
      let targetTimeStart: Date | null = null;
      let targetTimeEnd: Date | null = null;

      if (reminderConfig.timing?.type === 'same_day' && reminderConfig.timing.hours_before) {
        targetDate = now;
        const reminderHour = addHours(now, reminderConfig.timing.hours_before);
        targetTimeStart = startOfHour(reminderHour);
        targetTimeEnd = new Date(targetTimeStart.getTime() + 59 * 60 * 1000); // Check for the whole hour
      } else { // 'day_before'
        targetDate = subDays(now, -1); // Check for tomorrow's appointments
      }

      const q = query(
        collection(db, 'reservas'),
        where('fecha', '==', targetDate.toISOString().split('T')[0]),
        where('estado', '!=', 'Confirmado'),
        where('estado', '!=', 'Cancelado')
      );

      const reservationsSnap = await getDocs(q);
      const reservationsToSend = reservationsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Reservation));
      
      let sentCount = 0;

      for (const res of reservationsToSend) {
        if (targetTimeStart && targetTimeEnd) {
            const [hour, minute] = res.hora_inicio.split(':').map(Number);
            const appointmentTime = setHours(new Date(res.fecha), hour, minute);
            if(appointmentTime < targetTimeStart || appointmentTime > targetTimeEnd) {
                continue; // Skip if it's not in the current hour window for same-day reminders
            }
        }
        
        const clientRef = doc(db, 'clientes', res.cliente_id);
        const clientSnap = await getDoc(clientRef);
        if (clientSnap.exists()) {
          const client = clientSnap.data() as Client;
          if (client.telefono) {
            await sendTemplatedWhatsAppMessage({
              to: client.telefono,
              contentSid: 'YOUR_REMINDER_TEMPLATE_SID_HERE', // IMPORTANT: Replace with the actual SID
              contentVariables: {
                '1': client.nombre,
                '2': res.servicio,
                '3': res.fecha,
                '4': res.hora_inicio
              },
            });
            sentCount++;
          }
        }
      }

      return { success: true, remindersSent: sentCount, message: `Sent ${sentCount} reminders.` };

    } catch (error: any) {
      console.error('Error in sendAppointmentRemindersFlow:', error);
      return { success: false, remindersSent: 0, message: error.message || 'An unknown error occurred.' };
    }
  }
);
