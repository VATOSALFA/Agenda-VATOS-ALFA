
import * as functions from 'firebase-functions';
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

// =================================================================================
// CLOUD FUNCTIONS
// =================================================================================

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
