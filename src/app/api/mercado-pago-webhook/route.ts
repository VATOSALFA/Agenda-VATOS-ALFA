
import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import crypto from 'crypto';

// Initialize Firebase Admin SDK
// In a Firebase/Google Cloud environment, initializeApp() with no arguments
// will automatically find the service account credentials.
if (admin.apps.length === 0) {
    try {
        admin.initializeApp();
        console.log("Firebase Admin SDK for Webhook initialized automatically.");
    } catch (e: any) {
        console.error("Failed to initialize Firebase Admin SDK for Webhook:", e.message);
    }
}

const getMercadoPagoConfig = async () => {
  const db = admin.firestore();
  const settingsDoc = await db.collection('configuracion').doc('pagos').get();
  
  if (!settingsDoc.exists) {
      throw new Error('La configuración de Mercado Pago no ha sido establecida en Firestore.');
  }
  
  const settings = settingsDoc.data();
  const accessToken = settings?.mercadoPagoAccessToken;
  
  if (!accessToken) {
      throw new Error('El Access Token de Mercado Pago no está configurado en Firestore.');
  }
  
  return { accessToken };
};


export async function POST(request: NextRequest) {
    console.log("========== MERCADO PAGO WEBHOOK (API Route) RECEIVED ==========");
    
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    if (!secret) {
        console.error("MERCADO_PAGO_WEBHOOK_SECRET is not configured.");
        return NextResponse.json({ error: "Webhook secret not configured." }, { status: 500 });
    }

    try {
        const body = await request.json();
        console.log("Body:", JSON.stringify(body, null, 2));

        const xSignature = request.headers.get('x-signature');
        const xRequestId = request.headers.get('x-request-id');
        const dataId = request.nextUrl.searchParams.get('data.id');

        if (!xSignature || !xRequestId || !dataId) {
            console.warn("Webhook received without required headers or query params.");
            return NextResponse.json({ error: "Missing required headers or query params." }, { status: 400 });
        }

        const parts = xSignature.split(',');
        const tsPart = parts.find(p => p.startsWith('ts='));
        const v1Part = parts.find(p => p.startsWith('v1='));

        if (!tsPart || !v1Part) {
            throw new Error("Invalid signature format");
        }
        
        const ts = tsPart.split('=')[1];
        const v1 = v1Part.split('=')[1];
        
        const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
        
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(manifest);
        const sha = hmac.digest('hex');

        if (sha !== v1) {
            console.warn("Webhook signature validation failed. Expected:", sha, "Got:", v1);
            return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
        }
        console.log("Webhook signature validation successful.");
        
        if (body.action === 'payment.updated' && body.data?.id) {
            const { accessToken } = await getMercadoPagoConfig();
            const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${body.data.id}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const paymentData = await paymentResponse.json();
            
            if (paymentData.status === 'approved' && paymentData.external_reference) {
                const ventaRef = admin.firestore().collection('ventas').doc(paymentData.external_reference);
                const ventaDoc = await ventaRef.get();
                if (ventaDoc.exists) {
                    await ventaRef.update({
                        pago_estado: 'Pagado',
                        mercado_pago_status: 'approved',
                        mercado_pago_id: paymentData.id,
                        mercado_pago_order_id: paymentData.order.id
                    });
                    console.log(`Updated sale ${paymentData.external_reference} to 'Pagado'.`);
                }
            }
        }
    } catch (error: any) {
        console.error("Error processing Mercado Pago webhook:", error.message);
        // Respond with 200 even on error to prevent MP from retrying indefinitely
        return NextResponse.json({ status: "OK_WITH_ERROR" }, { status: 200 });
    }
    
    console.log("===================================================");
    return NextResponse.json({ status: "OK" }, { status: 200 });
}
