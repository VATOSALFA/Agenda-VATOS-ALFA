
import * as functions from 'firebase-functions';
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
    
    if (!timestamp || !signature || !req.body.data?.id) return false;

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
    
    // The 'from' number from Twilio includes 'whatsapp:+...'
    // We need to find the client using this full number or a variation of it.
    const fromPhone = from.replace('whatsapp:', '');

    // Standardize phone number to 10 digits for DB lookup
    const clientPhone10Digits = fromPhone.slice(-10);
    const clientsQuery = db.collection('clientes').where('telefono', '==', clientPhone10Digits).limit(1);
    const clientsSnapshot = await clientsQuery.get();

    if (clientsSnapshot.empty) {
        functions.logger.log(`Client not found with phone: ${clientPhone10Digits}`);
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
            break;
    }
    return { handled: true, clientId: clientId };
}

// =================================================================================
// CLOUD FUNCTIONS
// =================================================================================

export const sendWhatsAppMessage = functions.runWith({ secrets: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "NEXT_PUBLIC_TWILIO_PHONE_NUMBER"] }).https.onCall(async (data, context) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumberRaw = process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumberRaw) {
        functions.logger.error("Twilio credentials are not configured in environment variables.");
        throw new functions.https.HttpsError('failed-precondition', 'Twilio credentials are not configured.');
    }

    const { to, contentSid, contentVariables } = data;
    if (!to || !contentSid) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters: to, contentSid.');
    }

    const client = twilio(accountSid, authToken);
    
    const fromNumber = `whatsapp:${fromNumberRaw.startsWith('+') ? fromNumberRaw : `+${fromNumberRaw}`}`;
    const toNumber = `whatsapp:+521${to.replace(/\D/g, '')}`;

    try {
        const message = await client.messages.create({
            from: fromNumber,
            to: toNumber,
            contentSid: contentSid,
            contentVariables: contentVariables ? JSON.stringify(contentVariables) : undefined,
        });
        functions.logger.info(`Message sent to ${to}. SID: ${message.sid}`);
        return { success: true, sid: message.sid };
    } catch (error: any) {
        functions.logger.error(`Failed to send message to ${to}. Error: ${error.message}`);
        const twilioError = error.response?.data?.message || error.message;
        throw new functions.https.HttpsError('internal', `Twilio API Error: ${twilioError}`);
    }
});


export const twilioWebhook = functions.https.onRequest(
    async (request: functions.https.Request, response: functions.Response) => {
        const twiml = new twilio.twiml.MessagingResponse();
        functions.logger.info("--- Twilio Webhook Triggered ---", { body: request.body, headers: request.headers });
        
        try {
            // Basic security check: verify the request comes from Twilio
            const userAgent = request.headers['user-agent'] as string;
            if (!userAgent || !userAgent.startsWith('TwilioProxy')) {
                functions.logger.warn('Request did not originate from Twilio.', { userAgent });
                response.status(403).send('Forbidden: Invalid User-Agent');
                return;
            }
            
            functions.logger.info("Twilio User-Agent validated successfully.");

            const from = request.body.From as string; // e.g., 'whatsapp:+521442...'
            const messageBody = (request.body.Body as string) || '';
            const conversationId = from; // Use the full 'whatsapp:+...' string as the ID

            functions.logger.info(`Processing message from ${from}`);

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

            functions.logger.info("Message saved to conversation.");

            response.writeHead(200, { 'Content-Type': 'text/xml' });
            response.end(twiml.toString());
            
        } catch (error) {
            functions.logger.error('--- Twilio Webhook Error ---', { error: error instanceof Error ? error.message : String(error) });
            response.status(500).send('Internal Server Error');
        }
    }
);

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
