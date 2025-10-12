
import * as functions from 'firebase-functions';
import { Request, Response } from 'express';
import twilio from 'twilio';
import * as admin from 'firebase-admin';
import { parseISO, format } from 'date-fns';
import axios from 'axios'; 
import { getStorage } from 'firebase-admin/storage';


// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
const storage = getStorage();

// =================================================================================
// HELPERS
// =================================================================================
async function getMercadoPagoAccessToken(): Promise<{ token: string, userId: string }> {
    const settingsDoc = await db.collection('configuracion').doc('pagos').get();
    if (!settingsDoc.exists) {
        throw new functions.https.HttpsError('internal', 'La configuración de Mercado Pago no ha sido establecida.');
    }
    const settings = settingsDoc.data();
    const token = settings?.mercadoPagoAccessToken;
    const userId = settings?.mercadoPagoUserId;
    if (!token || !userId) {
        throw new functions.https.HttpsError('internal', 'El Access Token o el User ID de Mercado Pago no están configurados.');
    }
    return { token, userId };
}

const MP_API_BASE = 'https://api.mercadopago.com';


// =================================================================================
// 1. MERCADO PAGO WEBHOOK (Recibe el resultado del pago)
// =================================================================================

export const mercadoPagoWebhookTest = functions.https.onRequest(
    async (request: Request, response: Response): Promise<void> => {
        try {
            functions.logger.info('MP Webhook: Notificación recibida.', { body: request.body });

            if (request.body.type === 'payment') {
                const paymentId = request.body.data.id;
                
                const { token } = await getMercadoPagoAccessToken();
                if (!token) {
                    functions.logger.error('MP Webhook: Access Token de MP no configurado.');
                    response.status(500).send('Configuración interna incompleta.');
                    return;
                }

                // 1. Obtener los detalles del pago desde la API de Mercado Pago
                const paymentResponse = await axios.get(
                    `${MP_API_BASE}/v1/payments/${paymentId}`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );

                const paymentData = paymentResponse.data;
                const externalReference = paymentData.external_reference; // Este es nuestro ID de la venta

                if (paymentData.status === 'approved' && externalReference) {
                    // 2. Buscar la venta en Firestore y actualizarla
                    const ventaRef = db.collection('ventas').doc(externalReference);
                    const ventaDoc = await ventaRef.get();

                    if (ventaDoc.exists) {
                        await ventaRef.update({
                            pago_estado: 'Pagado',
                            metodo_pago: paymentData.payment_method_id,
                            mercado_pago_id: paymentId,
                        });
                        functions.logger.info(`Venta ${externalReference} actualizada a "Pagado".`);
                    } else {
                        functions.logger.warn(`MP Webhook: No se encontró la venta con referencia ${externalReference}.`);
                    }
                }
            }

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
    
    const clientPhone = from.replace(/\D/g, '').slice(-10);

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
            const authToken = process.env.TWILIO_AUTH_TOKEN;
            const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;

            if (!authToken || !TWILIO_ACCOUNT_SID) {
                functions.logger.error("Twilio credentials are not configured in environment variables.");
                response.status(500).send('Configuration error.');
                return;
            }
            
            const protocol = request.headers['x-forwarded-proto'] || 'https';
            const host = request.headers.host;
            const fullUrl = `${protocol}://${host}${request.originalUrl}`;

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
                    try {
                        const mediaResponse = await axios.get(mediaUrl, {
                            responseType: 'arraybuffer',
                            auth: {
                                username: TWILIO_ACCOUNT_SID,
                                password: authToken
                            }
                        });
                        
                        const fileBuffer = Buffer.from(mediaResponse.data, 'binary');
                        const fileName = `conversations/${conversationId}/${Date.now()}_media`;
                        const file = storage.bucket().file(fileName);

                        await file.save(fileBuffer, {
                            metadata: { contentType: mediaContentType },
                            public: true,
                        });
                        
                        messageData.mediaUrl = file.publicUrl();

                        if (mediaContentType?.startsWith('image/')) {
                            messageData.mediaType = 'image';
                        } else if (mediaContentType?.startsWith('audio/')) {
                            messageData.mediaType = 'audio';
                        } else if (mediaContentType === 'application/pdf') {
                            messageData.mediaType = 'document';
                        }

                    } catch (mediaError) {
                        functions.logger.error("Error handling Twilio media:", mediaError);
                        // Don't block message saving if media fails
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
// 3. FUNCIÓN DE COBRO DE MERCADO PAGO POINT (CORREGIDO)
// =================================================================================

export const createPointPayment = functions.https.onCall(async (request) => {
    // 1. Verificación de autenticación
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Solo usuarios autenticados pueden iniciar cobros.');
    }
    
    // 2. Verificación del Access Token de Mercado Pago
    const { token: MP_ACCESS_TOKEN } = await getMercadoPagoAccessToken();

    // 3. Validación de datos de entrada
    const { amount, referenceId, terminalId } = request.data as { amount: number, referenceId: string, terminalId: string };
    if (!amount || typeof amount !== 'number' || amount <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'El campo "amount" es requerido y debe ser un número positivo.');
    }
    if (!referenceId || typeof referenceId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'El campo "referenceId" (ID de la venta) es requerido.');
    }
    if (!terminalId || typeof terminalId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'El campo "terminalId" (ID del dispositivo) es requerido.');
    }

    try {
        // 4. Construcción del payload para la API de Mercado Pago
        const orderPayload = {
            type: "point",
            external_reference: referenceId,
            description: `Venta en Agenda VATOS ALFA: ${referenceId}`,
            transactions: [{
                amount: amount,
            }],
            config: {
                point: {
                    terminal_id: terminalId,
                    print_on_terminal: "no_ticket"
                }
            }
        };

        const idempotencyKey = `order-${referenceId}-${Date.now()}`;

        // 5. Llamada a la API de Mercado Pago para crear la orden
        const apiResponse = await axios.post(
            `${MP_API_BASE}/v1/orders`,
            orderPayload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
                    'X-Idempotency-Key': idempotencyKey,
                }
            }
        );

        functions.logger.info(`Orden de MP creada para ${referenceId}.`, { status: apiResponse.status, data: apiResponse.data });

        // 6. Devolver una respuesta exitosa
        return { 
            success: true, 
            order_id: apiResponse.data.id,
            payment_id: apiResponse.data.transactions?.payments?.[0]?.id,
            message: 'Orden enviada a la terminal correctamente.' 
        };

    } catch (error: any) {
        functions.logger.error(`Error al crear Orden de MP para ${referenceId}.`, {
            errorMessage: error.message,
            errorResponse: error.response?.data
        });
        
        // 7. Manejo de errores de la API
        const errorMessage = error.response?.data?.message || 'Fallo al comunicar con la API de Mercado Pago.';
        throw new functions.https.HttpsError('internal', errorMessage);
    }
});

// =================================================================================
// 4. OBTENER TERMINALES DE MERCADO PAGO (VERSIÓN FINAL Y ROBUSTA)
// =================================================================================
export const getPointTerminals = functions.https.onCall(async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Solo usuarios autenticados pueden ver las terminales.');
    }

    const { token: MP_ACCESS_TOKEN, userId } = await getMercadoPagoAccessToken();

    try {
        const apiResponse = await axios.get(`${MP_API_BASE}/terminals/v1/list`, {
            headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` }
        });

        const terminalList = apiResponse.data?.data?.terminals || apiResponse.data?.terminals || apiResponse.data?.results || [];
        
        const devices = Array.isArray(terminalList) ? terminalList.map((device: any) => ({
            id: device.id,
            name: `${device.operating_mode === 'PDV' ? 'PDV - ' : ''}${device.id.slice(-6)}`,
            operating_mode: device.operating_mode
        })) : [];
        
        return { success: true, devices: devices };

    } catch (error: any) {
        const errorMessage = error.response?.data?.message || 'Fallo al obtener la lista de terminales.';
        functions.logger.error(`Error al obtener terminales de MP: ${errorMessage}`, {
            errorResponse: error.response?.data
        });
        throw new functions.https.HttpsError('internal', errorMessage);
    }
});


// =================================================================================
// 5. ACTIVAR MODO PDV EN TERMINAL
// =================================================================================
export const setTerminalPDVMode = functions.https.onCall(async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Solo usuarios autenticados pueden modificar terminales.');
    }

    const { token: MP_ACCESS_TOKEN } = await getMercadoPagoAccessToken();
    
    const { terminalId } = request.data as { terminalId: string };
    if (!terminalId || typeof terminalId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'El campo "terminalId" es requerido.');
    }

    try {
        // El PATCH a /terminals/v1/setup espera un formato específico
        const payload = {
            terminals: [{
                id: terminalId,
                operating_mode: "PDV"
            }]
        };

        const apiResponse = await axios.patch(
            `${MP_API_BASE}/terminals/v1/setup`,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
                }
            }
        );

        functions.logger.info(`Modo PDV activado para terminal ${terminalId}.`, { status: apiResponse.status, data: apiResponse.data });

        return { success: true, data: apiResponse.data };

    } catch (error: any) {
        functions.logger.error(`Error al activar modo PDV para ${terminalId}.`, {
            errorMessage: error.message,
            errorResponse: error.response?.data
        });
        const errorMessage = error.response?.data?.message || 'Fallo al activar el modo PDV.';
        throw new functions.https.HttpsError('internal', errorMessage);
    }
});
