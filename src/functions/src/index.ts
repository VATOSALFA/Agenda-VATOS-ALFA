
import * as functions from 'firebase-functions/v1';
import twilio from 'twilio';
import * as admin from 'firebase-admin';
import { format, parseISO } from 'date-fns';
import axios from 'axios';
import * as crypto from 'crypto';

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

// =================================================================================
// HELPERS
// =================================================================================

async function getMercadoPagoConfig() {
    const settingsDoc = await db.collection('configuracion').doc('pagos').get();
    if (!settingsDoc.exists) {
        throw new functions.https.HttpsError('failed-precondition', 'La configuración de Mercado Pago no ha sido establecida.');
    }
    const settings = settingsDoc.data();
    const accessToken = settings?.mercadoPagoAccessToken;
    const userId = settings?.mercadoPagoUserId;
    if (!accessToken || !userId) {
        throw new functions.https.HttpsError('failed-precondition', 'El Access Token o el User ID de Mercado Pago no están configurados.');
    }
    return { accessToken, userId };
}

const MP_API_BASE = 'https://api.mercadopago.com';

function validateMercadoPagoSignature(req: functions.https.Request): boolean {
    const signatureHeader = req.headers['x-signature'] as string;
    const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

    if (!signatureHeader || !webhookSecret) {
        functions.logger.warn('MP Webhook: Missing signature header or secret.');
        return false;
    }

    const parts = signatureHeader.split(',').reduce((acc, part) => {
        const [key, value] = part.split('=');
        acc[key.trim()] = value.trim();
        return acc;
    }, {} as Record<string, string>);

    const timestamp = parts['ts'];
    const signature = parts['v1'];
    
    if (!timestamp || !signature) return false;

    const manifest = `id:${req.body.data.id};request-id:${req.headers['x-request-id']};ts:${timestamp};`;
    
    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(manifest);
    const expectedSignature = hmac.digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

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
            break;
        case 'cancel':
            await db.runTransaction(async (transaction) => {
                transaction.update(reservationDocRef, { estado: 'Cancelado' });
                transaction.update(clientDoc.ref, { 
                    citas_canceladas: admin.firestore.FieldValue.increment(1)
                });
            });
            break;
        default:
            // For reschedule or other actions, just log for now
            break;
    }
    return { handled: true, clientId: clientId };
}

// =================================================================================
// CLOUD FUNCTIONS
// =================================================================================

// 1. Twilio Webhook
export const twilioWebhook = functions.runWith({ secrets: ["TWILIO_AUTH_TOKEN", "TWILIO_ACCOUNT_SID"] }).https.onRequest(
    async (request: functions.https.Request, response: functions.Response) => {
        const twiml = new twilio.twiml.MessagingResponse();
        try {
            const twilioSignature = request.headers['x-twilio-signature'] as string;
            const authToken = process.env.TWILIO_AUTH_TOKEN;
            const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;

            if (!authToken || !TWILIO_ACCOUNT_SID) {
                functions.logger.error("Twilio credentials not configured.");
                response.status(500).send('Configuration error.');
                return;
            }
            
            const fullUrl = `https://${request.headers.host}${request.originalUrl}`;
            
            if (!twilio.validateRequest(authToken, twilioSignature, fullUrl, request.body)) {
                functions.logger.warn('Twilio Webhook: Invalid signature received.');
                response.status(403).send('Invalid Twilio Signature');
                return;
            }

            const from = request.body.From as string;
            const messageBody = (request.body.Body as string) || '';
            const conversationId = from.replace('whatsapp:', ''); 

            await handleClientResponse(from, messageBody);
            
            const messageData: { [key: string]: any } = {
                senderId: 'client',
                text: messageBody,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                read: false,
            };

            await db.collection('conversations').doc(conversationId).collection('messages').add(messageData);
            
            await db.collection('conversations').doc(conversationId).set({
                lastMessageText: messageBody,
                lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                unreadCount: admin.firestore.FieldValue.increment(1),
            }, { merge: true });

            response.writeHead(200, { 'Content-Type': 'text/xml' });
            response.end(twiml.toString());
            
        } catch (error) {
            functions.logger.error('Twilio Webhook Error:', error);
            response.status(500).send('Internal Server Error');
        }
    }
);

// 2. Mercado Pago Webhook
export const mercadoPagoWebhook = functions.runWith({ secrets: ["MERCADO_PAGO_WEBHOOK_SECRET"] }).https.onRequest(
    async (request: functions.https.Request, response: functions.Response) => {
        if (!validateMercadoPagoSignature(request)) {
            functions.logger.warn('MP Webhook: Invalid signature.');
            response.status(403).send('Invalid signature');
            return;
        }

        try {
            if (request.body.type === 'payment') {
                const paymentId = request.body.data.id;
                const { accessToken } = await getMercadoPagoConfig();
                
                const paymentResponse = await axios.get(`${MP_API_BASE}/v1/payments/${paymentId}`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });

                const paymentData = paymentResponse.data;
                const externalReference = paymentData.external_reference;

                if (paymentData.status === 'approved' && externalReference) {
                    const ventaRef = db.collection('ventas').doc(externalReference);
                    await ventaRef.update({
                        pago_estado: 'Pagado',
                        metodo_pago: paymentData.payment_method_id,
                        mercado_pago_id: paymentId,
                    });
                    functions.logger.info(`Venta ${externalReference} actualizada a "Pagado".`);
                }
            }
            response.status(200).send('OK');
        } catch (error) {
            functions.logger.error('MP Webhook Error:', error);
            response.status(500).send('Internal Server Error');
        }
    }
);

// 3. Create Mercado Pago Point Payment
export const createPointPayment = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Solo usuarios autenticados pueden realizar esta acción.');
    }

    const { amount, referenceId, terminalId } = data;
    if (!amount || !referenceId || !terminalId) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltan parámetros requeridos.');
    }

    try {
        const { accessToken } = await getMercadoPagoConfig();
        const idempotencyKey = `order-${referenceId}-${Date.now()}`;

        const apiResponse = await axios.post(`${MP_API_BASE}/v1/orders`, {
            type: "point",
            external_reference: referenceId,
            description: `Venta en Agenda VATOS ALFA: ${referenceId}`,
            transactions: [{ amount: parseFloat(amount.toFixed(2)) }],
            config: { point: { terminal_id: terminalId, print_on_terminal: "no_ticket" } }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'X-Idempotency-Key': idempotencyKey,
            }
        });

        return { success: true, orderId: apiResponse.data.id };
    } catch (error: any) {
        functions.logger.error(`Error creando orden en MP para ${referenceId}:`, error.response?.data || error.message);
        throw new functions.https.HttpsError('internal', error.response?.data?.message || 'Error al crear la orden de pago.');
    }
});

// 4. Get Mercado Pago Terminals
export const getPointTerminals = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Acción no permitida.');
    }
    try {
        const { accessToken } = await getMercadoPagoConfig();
        const apiResponse = await axios.get(`${MP_API_BASE}/terminals/v1/list`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const terminalList = apiResponse.data?.data?.terminals || [];
        const devices = terminalList.map((d: any) => ({
            id: d.id,
            name: `${d.operating_mode === 'PDV' ? 'PDV - ' : ''}${d.id.slice(-6)}`,
            operating_mode: d.operating_mode
        }));
        return { success: true, devices };
    } catch (error: any) {
        functions.logger.error('Error al obtener terminales de MP:', error.response?.data || error.message);
        throw new functions.https.HttpsError('internal', 'Fallo al obtener la lista de terminales.');
    }
});

// 5. Set Terminal to PDV Mode
export const setTerminalPDVMode = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Acción no permitida.');
    }
    const { terminalId } = data;
    if (!terminalId) {
        throw new functions.https.HttpsError('invalid-argument', 'El ID de la terminal es requerido.');
    }
    try {
        const { accessToken } = await getMercadoPagoConfig();
        await axios.patch(`${MP_API_BASE}/terminals/v1/setup`, {
            terminals: [{ id: terminalId, operating_mode: "PDV" }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            }
        });
        return { success: true };
    } catch (error: any) {
        functions.logger.error(`Error al activar modo PDV para ${terminalId}:`, error.response?.data || error.message);
        throw new functions.https.HttpsError('internal', 'Fallo al activar el modo PDV.');
    }
});
