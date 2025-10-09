import * as functions from 'firebase-functions';
import { Request, Response } from 'express';
import twilio from 'twilio';

// Definimos explícitamente que la función retorna 'void' para satisfacer a TypeScript
export const mercadoPagoWebhookTest = functions.https.onRequest(
    (request: Request, response: Response): void => {
        
        try {
            // 1. Manejo de error si no es POST
            if (request.method !== 'POST') {
                functions.logger.warn('Método no permitido. Solo POST.', { method: request.method });
                response.status(405).send('Método no permitido. Solo POST.');
                return; 
            }

            // 2. Lógica principal (Webhook)
            functions.logger.info('Notificación de Mercado Pago recibida (TEST):', { body: request.body });

            // 3. Respuesta final 200 OK (requerido por Mercado Pago)
            response.status(200).send('OK');
            return; 

        } catch (error) {
            functions.logger.error('Error procesando el Webhook de Mercado Pago', error);
            response.status(500).send('Error interno del servidor');
            return; 
        }
    }
);

export const twilioWebhook = functions.https.onRequest((request, response) => {
    const twilioSignature = request.headers['x-twilio-signature'];
    const authToken = process.env.TWILIO_AUTH_TOKEN || '';
    
    // NOTE: The URL must be the one Twilio is configured to hit.
    // In a real deployed environment, you'd construct this dynamically
    // or have it in an environment variable. For Functions, it's more complex.
    // This is a simplified example. We will assume the host and path.
    const fullUrl = `https://${request.headers.host}${request.originalUrl}`;

    // Twilio sends the body as form-urlencoded, not JSON
    const params = request.body;

    const requestIsValid = twilio.validateRequest(
        authToken,
        twilioSignature as string,
        fullUrl,
        params
    );

    if (!requestIsValid) {
        functions.logger.warn('Invalid Twilio signature received.');
        response.status(403).send('Invalid Twilio Signature');
        return;
    }

    // Process the message from Twilio
    const from = params.From;
    const to = params.To;
    const body = params.Body;
    const mediaUrl = params.MediaUrl0; // Example for first media item

    functions.logger.info(`Mensaje de Twilio recibido de ${from} a ${to}:`, { body, mediaUrl });
    
    // Create a TwiML response to acknowledge receipt. 
    // You can add <Message> tags here to send an auto-reply.
    const twiml = new twilio.twiml.MessagingResponse();
    
    response.writeHead(200, { 'Content-Type': 'text/xml' });
    response.end(twiml.toString());
});
