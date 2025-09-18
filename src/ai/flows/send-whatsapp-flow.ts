
'use server';
/**
 * @fileOverview Flow to send an outbound WhatsApp message via Twilio.
 */

import { z } from 'zod';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Profesional } from '@/lib/types';
import * as fs from 'fs';
import twilio from 'twilio';


const WhatsAppMessageInputSchema = z.object({
  to: z.string().describe("Recipient's phone number, without any special prefixes."),
  text: z.string().optional().describe("The text content of the message. Used if not sending a template."),
  mediaUrl: z.string().optional().describe("URL of media to be sent."),
  contentSid: z.string().optional().describe("The SID of the Content Template to send."),
  contentVariables: z.record(z.string()).optional().describe("Variables for the Content Template."),
});

type WhatsAppMessageInput = z.infer<typeof WhatsAppMessageInputSchema>;

interface WhatsAppMessageOutput {
    success: boolean;
    sid?: string;
    from?: string;
    to?: string;
    body?: string;
    error?: string;
}

function getTwilioCredentials() {
  let accountSid = process.env.TWILIO_ACCOUNT_SID;
  let authToken = process.env.TWILIO_AUTH_TOKEN;
  let fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  
  if (!accountSid && fs.existsSync('/etc/secrets/TWILIO_ACCOUNT_SID')) {
    accountSid = fs.readFileSync('/etc/secrets/TWILIO_ACCOUNT_SID', 'utf8').trim();
  }
  if (!authToken && fs.existsSync('/etc/secrets/TWILIO_AUTH_TOKEN')) {
    authToken = fs.readFileSync('/etc/secrets/TWILIO_AUTH_TOKEN', 'utf8').trim();
  }
  if (!fromNumber && fs.existsSync('/etc/secrets/TWILIO_WHATSAPP_NUMBER')) {
    fromNumber = fs.readFileSync('/etc/secrets/TWILIO_WHATSAPP_NUMBER', 'utf8').trim();
  }
  
  if (!accountSid || !authToken || !fromNumber || accountSid.startsWith('ACxxx')) {
    throw new Error("Faltan las credenciales de Twilio en el servidor (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER).");
  }
  
  return { accountSid, authToken, fromNumber };
}

export async function sendWhatsAppMessage(input: WhatsAppMessageInput): Promise<WhatsAppMessageOutput> {
  try {
    const { accountSid, authToken, fromNumber } = getTwilioCredentials();
    const client = twilio(accountSid, authToken);

    const to = `whatsapp:+521${input.to.replace(/\D/g, '')}`;
    
    // Ensure the 'from' number is correctly formatted
    const cleanFromNumber = fromNumber.replace(/\D/g, '');
    const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
    
    const messageData: any = { to, from };
    
    if (input.contentSid) {
        messageData.contentSid = input.contentSid;
        if(input.contentVariables) {
            messageData.contentVariables = JSON.stringify(input.contentVariables);
        }
    } else if (input.text) {
        messageData.body = input.text;
    }

    if (input.mediaUrl) {
      messageData.mediaUrl = [input.mediaUrl];
    }
    
    if (!input.contentSid && !input.text && !input.mediaUrl) {
        return { success: false, error: 'Se requiere un cuerpo de mensaje, URL de medios o SID de contenido.' };
    }

    const message = await client.messages.create(messageData);
    
    console.log("Mensaje de WhatsApp enviado con éxito:", message.sid);
    
    return { success: true, sid: message.sid, from: message.from, to: message.to, body: message.body ?? undefined };

  } catch(error: any) {
      console.error("Fallo al llamar a la API de Twilio:", error);
      return { success: false, error: error.message };
  }
}

// Wrapper for booking confirmations using a Twilio Template
export async function sendWhatsappConfirmation(input: { 
    clientName: string;
    clientPhone: string;
    serviceName: string;
    reservationDate: string;
    reservationTime: string;
    professionalName?: string; // Made optional to handle 'any' professional
    templateSid: string;
}): Promise<WhatsAppMessageOutput> {
    
    const clientName = input.clientName;
    const serviceName = input.serviceName;
    const parsedDate = parseISO(input.reservationDate);
    const formattedDate = format(parsedDate, "EEEE, dd 'de' MMMM", { locale: es });
    const fullDateTime = `${formattedDate} a las ${input.reservationTime}`;
    // Provide a default if the professional name is not available
    const professionalName = input.professionalName || 'El de tu preferencia';
    const to = input.clientPhone;
    
    return sendWhatsAppMessage({
        to,
        contentSid: input.templateSid,
        contentVariables: {
            '1': clientName,
            '2': serviceName,
            '3': fullDateTime,
            '4': professionalName
        }
    });
}

// Wrapper for sending a test message
export async function sendTestTwilioMessage(): Promise<Partial<WhatsAppMessageOutput>> {
  try {
    // This will throw if credentials are not set, and the error will be caught below.
    getTwilioCredentials();
    const testPhoneNumber = process.env.TEST_PHONE_NUMBER || '4428133314'; // Ensure your test number is in .env
    if (!testPhoneNumber) {
        return { success: false, error: 'No se ha configurado un número de teléfono de prueba en el archivo .env (TEST_PHONE_NUMBER).' };
    }
    const result = await sendWhatsAppMessage({
        to: testPhoneNumber,
        text: 'Este es un mensaje de prueba de Agenda VATOS ALFA.',
    });
    return result;
  } catch (error: any) {
    // Catch the specific credentials error and return a more user-friendly message.
    return { success: false, error: error.message };
  }
}
