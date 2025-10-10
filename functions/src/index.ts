import * as functions from 'firebase-functions';
import { Request, Response } from 'express';
import twilio from 'twilio';
import * as admin from 'firebase-admin';
import { parseISO, format } from 'date-fns';
import axios from 'axios'; 

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();

// =================================================================================
// GLOBALES Y CONSTANTES (Variables de Entorno)
// =================================================================================
const MP_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || 'tu_access_token_de_prueba';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '10b85b4dbfb1d484869ff605549d4870';
const MP_POINT_API_BASE = 'https://api.mercadopago.com/point/integrations';

// =================================================================================
// 1. MERCADO PAGO WEBHOOK (Recibe el resultado del pago)
// =================================================================================

export const mercadoPagoWebhookTest = functions.https.onRequest(
    (request: Request, response: Response): void => {
        
        try {
            if (request.method !== 'POST') {
                functions.logger.warn('MP Webhook: Método no permitido. Solo POST.', { method: request.method });
                response.status(405).send('Método no permitido. Solo POST.');
                return; 
            }

            functions.logger.info('MP Webhook: Notificación recibida.', { body: request.body });
            
            // Lógica de validación, consulta a API y actualización de Firestore iría aquí.

            response.status(200).send('OK');
            return; 

        } catch (error) {
            functions.logger.error('MP Webhook: Error procesando el Webhook.', error);
            response.status(500).send('Error interno del servidor');
            return; 
        }
    }
);


// =================================================================================
// Función de lógica de Citas (sin cambios)
// =================================================================================

async function handleClientResponse(from: string, messageBody: string): Promise<{ handled: boolean, clientId: string | null }> {
    const normalizedMessage = messageBody.trim().toLowerCase();
    
    const confirmationKeywords = ['confirmado', 'confirmo', 'confirmar', 'si', 'yes', 'confirm'];
    const rescheduleKeywords = ['reagendar'];
    const cancellationKeywords = ['cancelar la cita', 'cancelar'];

    let action: 'confirm' | 'reschedule' | 'cancel' | null = null;

    if (confirmationKeywords.some(keyword => normalizedMessage.includes(keyword))) {
        action = 'confirm';
    } else if (rescheduleKeywords.some(keyword => normalizedMessage.includes(keyword))) {
        action = 'reschedule';
    } else if (cancellationKeywords.some(keyword => normalizedMessage.includes(keyword))) {
        action = 'cancel';
    }

    if (!action) {
        return { handled: false, clientId: null };
    }
    
    let clientPhone = from.replace(/\D/g, '');
    if (clientPhone.startsWith('521')) {
      clientPhone = clientPhone.substring(3);
    } else if (clientPhone.startsWith('52')) {
      clientPhone = clientPhone.substring(2);
    }

    const clientsQuery = db.collection('clientes').where('telefono', '==', clientPhone).limit(1);
    const clientsSnapshot = await clientsQuery.get();

    if (clientsSnapshot.empty) {
        functions.logger.log(`Client not found with phone: ${clientPhone}`);
        return { handled: false, clientId: null };
    }

    const clientDoc = clientsSnapshot.docs[0];
    const clientId = clientDoc.id;
    
    const today = format(new Date(), 'yyyy-MM-dd');
    const reservationsQuery = db.collection('reservas')
        .where('cliente_id', '==', clientId)
        .where('fecha', '>=', today);
    
    const reservationsSnapshot = await reservationsQuery.get();
    
    if (reservationsSnapshot.empty) {
        functions.logger.log(`No pending reservations found for client: ${clientId}`);
        return { handled: true, clientId: clientId };
    }
    
    const upcomingReservations = reservationsSnapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(r => r.estado !== 'Cancelado');

    if (upcomingReservations.length === 0) {
      functions.logger.log(`No non-cancelled upcoming reservations found for client: ${clientId}`);
      return { handled: true, clientId: clientId };
    }

    upcomingReservations.sort((a: any, b: any) => {
        const dateA = parseISO(`${a.fecha}T${a.hora_inicio}`);
        const dateB = parseISO(`${b.fecha}T${b.hora_inicio}`);
        return dateA.getTime() - dateB.getTime();
    });
    
    const reservationToUpdate = upcomingReservations[0];
    const reservationDocRef = db.collection('reservas').doc(reservationToUpdate.id);

    switch(action) {
        case 'confirm':
            await reservationDocRef.update({ estado: 'Confirmado' });
            functions.logger.log(`Reservation ${reservationToUpdate.id} updated to "Confirmado" for client ${clientId}.`);
            break;
        case 'reschedule':
            await reservationDocRef.update({ estado: 'Pendiente' });
            functions.logger.log(`Reservation ${reservationToUpdate.id} updated to "Pendiente" for client ${clientId}.`);
            break;
        case 'cancel':
            await db.runTransaction(async (transaction) => {
                transaction.update(reservationDocRef, { estado: 'Cancelado' });
                transaction.update(clientDoc.ref, { 
                    citas_canceladas: admin.firestore.FieldValue.increment(1)
                });
            });
            functions.logger.log(`Reservation ${reservationToUpdate.id} updated to "Cancelado" for client ${clientId}.`);
            break;
    }

    return { handled: true, clientId: clientId };
}

// =================================================================================
// 2. TWILIO WEBHOOK (Resuelve Error 500 y 404)
// =================================================================================

export const twilioWebhook = functions.https.onRequest(
    async (request: Request, response: Response) => {
        const twiml = new twilio.twiml.MessagingResponse(); 
        
        try {
            const twilioSignature = request.headers['x-twilio-signature'] as string;
            const authToken = TWILIO_AUTH_TOKEN; 
            
            const fullUrl = `https://us-central1-agenda-1ae08.cloudfunctions.net/twilioWebhook`; 

            const params = request.body;
            
            if (!Object.keys(params).length) {
                functions.logger.warn('Twilio Webhook: Cuerpo de solicitud vacío. Ignorando.');
                response.status(400).send('Cuerpo vacío.');
                return;
            }

            // Validación de Seguridad
            const requestIsValid = twilio.validateRequest(
                authToken,
                twilioSignature,
                fullUrl,
                params
            );

            if (!requestIsValid) {
                functions.logger.warn('Twilio Webhook: Invalid signature received.', { signature: twilioSignature, url: fullUrl });
                response.status(403).send('Invalid Twilio Signature');
                return;
            }

            // --- LÓGICA PRINCIPAL Y DE GUARDADO ---
            const from = params.From as string;
            const messageBody = (params.Body as string) || '';
            const numMedia = parseInt((params.NumMedia as string) || '0', 10);
            
            functions.logger.info(`Mensaje de Twilio recibido de ${from}:`, { body: messageBody });

            const { clientId } = await handleClientResponse(from, messageBody); 
            
            const conversationId = from.replace('whatsapp:', ''); 
            const conversationRef = db.collection('conversations').doc(conversationId);
            const messagesCollectionRef = conversationRef.collection('messages'); 
            
            const messageData: { [key: string]: any } = {
                senderId: 'client',
                text: messageBody,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                read: false,
            };

            if (numMedia > 0) { 
                const mediaUrl = params.MediaUrl0 as string;
                const mediaContentType = params.MediaContentType0 as string;
                
                if(mediaUrl) {
                    messageData.mediaUrl = mediaUrl;
                    if (mediaContentType?.startsWith('image/')) {
                        messageData.mediaType = 'image';
                    } else if (mediaContentType?.startsWith('audio/')) {
                        messageData.mediaType = 'audio';
                    } else if (mediaContentType === 'application/pdf') {
                        messageData.mediaType = 'document';
                    }
                }
            }

            await messagesCollectionRef.add(messageData); 
            
            const lastMessagePreview = messageBody || (messageData.mediaType ? `[${messageData.mediaType.charAt(0).toUpperCase() + messageData.mediaType.slice(1)}]` : '[Mensaje vacío]');
            
            const conversationDoc = await conversationRef.get();

            if (!conversationDoc.exists) {
                let clientName = from;
                if (clientId) {
                    const clientRecord = await db.collection('clientes').doc(clientId).get();
                    if (clientRecord.exists) {
                        const clientData = clientRecord.data();
                        clientName = `${clientData?.nombre} ${clientData?.apellido}`;
                    }
                }
                
                await conversationRef.set({
                    lastMessageText: lastMessagePreview,
                    lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                    unreadCount: admin.firestore.FieldValue.increment(1),
                    clientName: clientName,
                });
            } else {
                await conversationRef.update({
                    lastMessageText: lastMessagePreview,
                    lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                    unreadCount: admin.firestore.FieldValue.increment(1),
                });
            }

            response.writeHead(200, { 'Content-Type': 'text/xml' });
            response.end(twiml.toString());
            
        } catch (error) {
            functions.logger.error('Twilio Webhook: Error fatal en la ejecución.', error);
            response.status(500).send('<Response><Message>Error interno en la agenda.</Message></Response>');
        }
    }
);


// =================================================================================
// 3. FUNCIÓN DE COBRO DE MERCADO PAGO POINT (CORRECCIÓN FINAL)
// =================================================================================

interface PaymentData {
    amount: number;
    referenceId: string;
    terminalReference: string;
}

// Se elimina el tipo 'CallableContext' y se usa 'any' para forzar la compatibilidad
// y resolver el error TS2694.
export const createPointPayment = functions.https.onCall(async (data: any, context: any) => {
    
    // Verificación de autenticación
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Solo usuarios autenticados pueden iniciar cobros.');
    }
    
    // Desestructuración con aserción de tipo para resolver TS2352
    const { amount, referenceId, terminalReference } = data as PaymentData;

    if (!amount || !referenceId || !terminalReference) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltan campos requeridos: monto, ID de referencia, o referencia de terminal.');
    }

    try {
        const paymentIntentPayload = {
            amount: amount,
            description: `Venta Agenda: ${referenceId}`,
            reference_id: referenceId,
            payment_method: {
                type: "card"
            },
            additional_info: {
                tip_amount_allowed: true 
            }
        };

        const apiResponse = await axios.post(
            `${MP_POINT_API_BASE}/${terminalReference}/payment-intents`,
            paymentIntentPayload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${MP_ACCESS_TOKEN}`
                }
            }
        );

        functions.logger.info(`MP Payment Intent Creado para ${referenceId}.`, { status: apiResponse.status, data: apiResponse.data });

        return { success: true, payment_intent_id: apiResponse.data.id, message: 'Orden enviada a terminal.' };

    } catch (error) {
        functions.logger.error(`Error al crear Payment Intent para ${referenceId}.`, error);
        throw new functions.https.HttpsError('internal', 'Fallo al comunicar con la API de Mercado Pago.');
    }
});
