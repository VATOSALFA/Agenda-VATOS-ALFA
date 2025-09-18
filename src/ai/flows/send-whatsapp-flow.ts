
'use server';
/**
 * @fileOverview Flow to send an outbound WhatsApp message via Twilio.
 */

import { z } from 'zod';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Profesional } from '@/lib/types';
import * as fs from 'fs';


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
  
  // This is a robust fallback for Firebase App Hosting environment
  // It reads secrets directly if they aren't populated in process.env
  if (!accountSid && fs.existsSync('/etc/secrets/TWILIO_ACCOUNT_SID')) {
    accountSid = fs.readFileSync('/etc/secrets/TWILIO_ACCOUNT_SID', 'utf8').trim();
  }
  if (!authToken && fs.existsSync('/etc/secrets/TWILIO_AUTH_TOKEN')) {
    authToken = fs.readFileSync('/etc/secrets/TWILIO_AUTH_TOKEN', 'utf8').trim();
  }
  if (!fromNumber && fs.existsSync('/etc/secrets/TWILIO_WHATSAPP_NUMBER')) {
    fromNumber = fs.readFileSync('/etc/secrets/TWILIO_WHATSAPP_NUMBER', 'utf8').trim();
  }
  
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Faltan las credenciales de Twilio en el servidor (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER).");
  }
  
  if (accountSid.startsWith('ACxxx')) {
     throw new Error("Las credenciales de Twilio no están configuradas. Por favor, configúralas en tu archivo .env o en los secretos de App Hosting.");
  }
  
  return { accountSid, authToken, fromNumber };
}

export async function sendWhatsAppMessage(input: WhatsAppMessageInput): Promise<WhatsAppMessageOutput> {
  try {
    const { accountSid, authToken, fromNumber } = getTwilioCredentials();
    
    // Normalize phone numbers to be compatible with Twilio
    const cleanedToPhone = input.to.replace(/\D/g, '');
    const to = `whatsapp:+521${cleanedToPhone}`; // Assuming MX country code with '1' for mobile
    const from = `whatsapp:${fromNumber.replace(/\D/g, '')}`;

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    
    const body = new URLSearchParams();
    body.append('To', to);
    body.append('From', from);
    
    if (input.contentSid) {
      body.append('ContentSid', input.contentSid);
      if (input.contentVariables) {
          body.append('ContentVariables', JSON.stringify(input.contentVariables));
      }
    } else if (input.text) {
      body.append('Body', input.text);
    }
    
    if (input.mediaUrl) {
      body.append('MediaUrl', input.mediaUrl);
    }

    if (!input.contentSid && !input.text && !input.mediaUrl) {
        return { success: false, error: 'Se requiere un cuerpo de mensaje, URL de medios o SID de contenido.' };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    const responseData = await response.json();

    if (!response.ok) {
        console.error("Error from Twilio API:", responseData);
        const twilioError = responseData.message || 'Error desconocido de Twilio.';
        const moreInfo = responseData.more_info || '';
        throw new Error(`Error de la API de Twilio: ${twilioError} ${moreInfo}`);
    }

    console.log("Mensaje de WhatsApp enviado con éxito:", responseData.sid);
    
    return { success: true, sid: responseData.sid, from: fromNumber, to: to, body: responseData.body };

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
