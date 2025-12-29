import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-server';
import { MercadoPagoConfig } from 'mercadopago';

// Reusing the same access token logic as the Preference route
const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || '';

export async function POST(req: NextRequest) {
    console.log("========== [Next.js] MERCADO PAGO WEBHOOK RECEIVED ==========");

    try {
        const url = new URL(req.url);
        const queryId = url.searchParams.get('id') || url.searchParams.get('data.id');
        const queryTopic = url.searchParams.get('topic') || url.searchParams.get('type');

        const body = await req.json().catch(() => ({})); // Handle empty body safely
        const dataId = queryId || body?.data?.id || body?.id;
        const topic = queryTopic || body?.type || 'unknown';

        if (!dataId) {
            console.warn("[Next.js] Missing ID in webhook.");
            return NextResponse.json({ error: "Bad Request: ID missing" }, { status: 400 });
        }

        console.log(`[Next.js] Topic: ${topic}, ID: ${dataId}`);

        if (String(dataId) === "123456") {
            console.log("[Next.js] Test simulation detected. Returning OK.");
            return NextResponse.json({ status: "OK" });
        }

        let paymentInfo: any = null;

        // 1. Try fetching as a direct Payment
        const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (paymentRes.ok) {
            paymentInfo = await paymentRes.json();
        } else {
            // 2. If it fails, try fetching as a Merchant Order
            console.log(`[Next.js] Payment ${dataId} not found, trying as Merchant Order...`);
            const orderRes = await fetch(`https://api.mercadopago.com/merchant_orders/${dataId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (orderRes.ok) {
                const orderInfo = await orderRes.json();
                const approvedPayment = orderInfo.payments?.find((p: any) => p.status === 'approved');
                if (approvedPayment) {
                    paymentInfo = {
                        id: approvedPayment.id,
                        external_reference: orderInfo.external_reference,
                        status: 'approved',
                        transaction_amount: approvedPayment.transaction_amount
                    };
                }
            }
        }

        const external_reference = body?.data?.external_reference || paymentInfo?.external_reference;

        if (!paymentInfo || paymentInfo.status !== 'approved' || !external_reference) {
            console.error(`[Next.js] Could not verify/process payment ${dataId}`);
            return NextResponse.json({ status: "OK (Ignored)" });
        }

        const { status, transaction_amount } = paymentInfo;
        console.log(`[Next.js] API Check: Status=${status}, Ref=${external_reference}`);

        // Update Firestore
        const db = getDb();

        await db.runTransaction(async (t: any) => {
            // Check Reservation
            const reservaRef = db.collection('reservas').doc(external_reference);
            const reservaDoc = await t.get(reservaRef);

            if (reservaDoc.exists) {
                t.update(reservaRef, {
                    pago_estado: 'Pagado',
                    estado_pago: 'Pagado',
                    deposit_payment_id: String(paymentInfo.id),
                    deposit_paid_at: new Date(),
                });
                console.log(`[Next.js] Reservation ${external_reference} updated.`);
                return;
            }

            // Check Venta (Legacy/Terminal)
            const ventaRef = db.collection('ventas').doc(external_reference);
            const ventaDoc = await t.get(ventaRef);

            if (ventaDoc.exists) {
                if (ventaDoc.data()?.pago_estado === 'Pagado') return;

                const ventaData = ventaDoc.data();
                const montoOriginal = Number(ventaData?.total || 0);
                const montoPagado = Number(transaction_amount || 0);
                const propina = montoPagado > montoOriginal ? parseFloat((montoPagado - montoOriginal).toFixed(2)) : 0;

                t.update(ventaRef, {
                    pago_estado: 'Pagado',
                    mercado_pago_status: status,
                    mercado_pago_id: String(paymentInfo.id),
                    monto_pagado_real: montoPagado,
                    propina: propina,
                    fecha_pago: new Date()
                });

                // Also update linked reservation if exists
                if (ventaData?.reservationId) {
                    const linkedResRef = db.collection('reservas').doc(ventaData.reservationId);
                    const linkedResDoc = await t.get(linkedResRef);
                    if (linkedResDoc.exists) t.update(linkedResRef, { pago_estado: 'Pagado' });
                }
                console.log(`[Next.js] Venta ${external_reference} updated.`);
            } else {
                console.warn(`[Next.js] No Venta or Reserva found for ref ${external_reference}`);
            }
        });

        return NextResponse.json({ status: "OK" });

    } catch (error: any) {
        console.error('[Next.js] Webhook Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
