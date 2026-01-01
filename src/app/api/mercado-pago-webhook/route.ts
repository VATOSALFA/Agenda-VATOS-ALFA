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
            const reservaRef = db.collection('reservas').doc(external_reference);
            const reservaDoc = await t.get(reservaRef);

            // Logic to calculate Payment Status
            const determinePaymentStatus = (total: number, paid: number) => {
                if (paid >= total * 0.99) return 'Pagado'; // Tolerance for float errors
                return 'deposit_paid'; // or 'parcialmente_pagado'
            };

            // CASE A: Reservation Exists (Update)
            if (reservaDoc.exists) {
                const data = reservaDoc.data();
                const total = Number(data.totalAmount || data.precio || 0);
                const paid = Number(transaction_amount || 0);

                t.update(reservaRef, {
                    pago_estado: determinePaymentStatus(total, paid),
                    deposit_payment_id: String(paymentInfo.id),
                    deposit_paid_at: new Date(),
                    monto_pagado: paid,
                    // If it was pending confirmation, confirm it now
                    estado: data.estado === 'Pendiente' ? 'Confirmado' : data.estado
                });
                console.log(`[Next.js] Reservation ${external_reference} updated.`);
                return;
            }

            // CASE B: Reservation Does NOT Exist (Create)
            // We need metadata to create it
            const bookingJson = paymentInfo.metadata?.booking_json || body?.data?.metadata?.booking_json;

            if (bookingJson) {
                console.log(`[Next.js] Creating new reservation(s) from metadata for Ref ${external_reference}`);
                try {
                    const bookingsData = JSON.parse(bookingJson);
                    const paidAmount = Number(transaction_amount || 0);

                    // If it's an array, we might have multiple bookings.
                    // The first one gets the 'external_reference' ID. 
                    // Subsequent ones get new IDs.
                    const bookingsArray = Array.isArray(bookingsData) ? bookingsData : [bookingsData];

                    if (bookingsArray.length === 0) return;

                    // We distribute the payment amount across bookings? 
                    // Or usually, the payment is for the TOTAL of the cart.
                    // For simplicity, we mark all as 'deposit_paid' if the global amount matches the upfront total.
                    // But strictly, we should link the payment ID to all of them.

                    for (let i = 0; i < bookingsArray.length; i++) {
                        const booking = bookingsArray[i];

                        // ID Strategy
                        let ref = reservaRef; // First item uses the Payment Reference ID
                        if (i > 0) {
                            ref = db.collection('reservas').doc(); // Generate new ID for others
                        }

                        const total = Number(booking.totalAmount || 0);
                        // We assume the payment covers the required upfront for ALL items.
                        // So we mark them all as having the deposit paid.

                        // Sanitize undefineds
                        const newReservation = {
                            ...booking,
                            id: ref.id,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            estado: 'Confirmado', // Confirmed because they paid
                            pago_estado: 'deposit_paid', // Start with deposit paid
                            monto_pagado: (i === 0) ? paidAmount : 0, // Attribute payment to first one or split? Better to attribute to first one for tracking.
                            deposit_payment_id: String(paymentInfo.id),
                            payment_method: 'mercadopago',
                            // Ensure fields required by frontend exist
                            client: booking.client || {},
                            serviceIds: booking.serviceIds || [],
                            professionalId: booking.professionalId,
                            locationId: booking.locationId
                        };

                        t.set(ref, newReservation);
                        console.log(`[Next.js] Created Reservation ${ref.id}`);
                    }
                    return;

                } catch (jsonError) {
                    console.error("[Next.js] Failed to parse booking_json:", jsonError);
                    // Do not fail transaction, just log. Manual Fix required.
                }
            }

            console.warn(`[Next.js] Reference ${external_reference} not found and no valid metadata to create it.`);

            // Fallback for Legacy Sales (Ventas)
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
                console.log(`[Next.js] Venta ${external_reference} updated.`);
            }
        });

        return NextResponse.json({ status: "OK" });

    } catch (error: any) {
        console.error('[Next.js] Webhook Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
