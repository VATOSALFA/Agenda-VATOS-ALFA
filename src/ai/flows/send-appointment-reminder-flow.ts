
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
import type { Reservation, Client, Local, Profesional } from '@/lib/types';
import { addHours, subDays, startOfHour, setHours, format, parse } from 'date-fns';
import { es } from 'date-fns/locale';


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
  // This flow can be triggered without specific input for scheduled jobs,
  // or with a clientId for on-demand testing.
  clientId: z.string().optional().describe("The ID of a specific client to send a reminder to, for testing purposes."),
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

// Helper function to send a single reminder
async function sendReminder(reservation: Reservation) {
    if (!reservation.cliente_id) return false;
    
    const clientRef = doc(db, 'clientes', reservation.cliente_id);
    const clientSnap = await getDoc(clientRef);
    
    // Fallback to 'main' or handle error if local_id is missing
    const localRef = doc(db, 'locales', reservation.local_id || 'main');
    const localSnap = await getDoc(localRef);

    // Assuming the first item's barbero_id represents the main professional for the notification.
    const professionalId = reservation.items?.[0]?.barbero_id;
    if (!professionalId) return false;

    const professionalRef = doc(db, 'profesionales', professionalId);
    const professionalSnap = await getDoc(professionalRef);

    if (clientSnap.exists() && localSnap.exists() && professionalSnap.exists()) {
        const client = clientSnap.data() as Client;
        const local = localSnap.data() as Local;
        const professional = professionalSnap.data() as Profesional;

        if (client.telefono) {
            const fullDateStr = `${format(parse(reservation.fecha, 'yyyy-MM-dd', new Date()), "dd 'de' MMMM", { locale: es })} a las ${reservation.hora_inicio}`;
            
            await sendTemplatedWhatsAppMessage({
                to: client.telefono,
                contentSid: 'HX259d67c1e5304a9db9b08a09d7db9e1c',
                contentVariables: {
                    '1': client.nombre,
                    '2': local.name,
                    '3': fullDateStr,
                    '4': reservation.servicio,
                    '5': professional.name,
                },
            });
            return true;
        }
    }
    return false;
}


const sendAppointmentRemindersFlow = ai.defineFlow(
  {
    name: 'sendAppointmentRemindersFlow',
    inputSchema: AppointmentReminderInputSchema,
    outputSchema: AppointmentReminderOutputSchema,
  },
  async ({ clientId }) => {
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
      let targetTimeStart: Date;
      let targetTimeEnd: Date;
      
      if (reminderConfig.timing?.type === 'same_day' && reminderConfig.timing.hours_before) {
        const reminderTime = addHours(now, reminderConfig.timing.hours_before);
        targetTimeStart = startOfHour(reminderTime);
        targetTimeEnd = new Date(targetTimeStart.getTime() + 59 * 60 * 1000); 
      } else { // 'day_before' or default
        targetTimeStart = addDays(now, 1);
        targetTimeEnd = addDays(now, 1);
        targetTimeStart.setHours(0, 0, 0, 0);
        targetTimeEnd.setHours(23, 59, 59, 999);
      }

      const q = query(
        collection(db, 'reservas'),
        where('fecha', '==', format(targetTimeStart, 'yyyy-MM-dd')),
        where('estado', '!=', 'Confirmado'),
        where('estado', '!=', 'Cancelado')
      );

      const reservationsSnap = await getDocs(q);
      const reservationsToSend = reservationsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Reservation));
      
      let sentCount = 0;

      for (const res of reservationsToSend) {
        const [hour, minute] = res.hora_inicio.split(':').map(Number);
        const appointmentTime = setHours(new Date(res.fecha), hour, minute);
        
        if (appointmentTime >= targetTimeStart && appointmentTime <= targetTimeEnd) {
           const sent = await sendReminder(res);
           if (sent) sentCount++;
        }
      }

      return { success: true, remindersSent: sentCount, message: `Sent ${sentCount} reminders.` };

    } catch (error: any) {
      console.error('Error in sendAppointmentRemindersFlow:', error);
      return { success: false, remindersSent: 0, message: error.message || 'An unknown error occurred.' };
    }
  }
);
