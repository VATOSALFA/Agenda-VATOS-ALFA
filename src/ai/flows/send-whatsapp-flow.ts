
'use server';
/**
 * @fileOverview A flow to send WhatsApp notifications for appointments.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const WhatsappConfirmationInputSchema = z.object({
  clientName: z.string(),
  clientPhone: z.string(),
  serviceName: z.string(),
  reservationDate: z.string(), // YYYY-MM-DD
  reservationTime: z.string(), // HH:mm
});

type WhatsappConfirmationInput = z.infer<typeof WhatsappConfirmationInputSchema>;

async function getTemplate(name: string): Promise<string> {
    // In a real app, you would fetch this from Firestore based on the name.
    // For now, we'll use a hardcoded template for simplicity.
    const templates: Record<string, string> = {
        'Mensaje de confirmación': '¡Hola, {Nombre cliente}! Tu cita para {Servicio} ha sido confirmada para el {Fecha y hora reserva}. ¡Te esperamos!',
    };
    return templates[name] || ' plantilla no encontrada ';
}


export async function sendWhatsappConfirmation(input: WhatsappConfirmationInput): Promise<string> {
  
  const templateBody = await getTemplate('Mensaje de confirmación');

  const reservationDateTime = parseISO(`${input.reservationDate}T${input.reservationTime}:00`);
  const formattedDateTime = format(reservationDateTime, "EEEE, dd 'de' MMMM 'a las' HH:mm 'hrs.'", { locale: es });

  let message = templateBody.replace('{Nombre cliente}', input.clientName);
  message = message.replace('{Servicio}', input.serviceName);
  message = message.replace('{Fecha y hora reserva}', formattedDateTime);
  
  // --- SIMULATION ---
  // In a real application, you would integrate with a WhatsApp API provider here.
  console.log("--- SIMULATING WHATSAPP MESSAGE ---");
  console.log(`To: ${input.clientPhone}`);
  console.log(`Message: ${message}`);
  console.log("--- END OF SIMULATION ---");

  // The return value could be a message ID from the provider, or simply the message content.
  return message;
}
