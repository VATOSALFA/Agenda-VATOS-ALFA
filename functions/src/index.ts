import * as functions from 'firebase-functions';
// Importamos los tipos directamente desde 'express' que es lo que usa functions.https
import { Request, Response } from 'express'; 

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