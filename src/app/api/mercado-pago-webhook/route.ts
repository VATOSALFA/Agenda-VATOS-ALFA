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

                    // Normalize to array
                    const bookingsArray = Array.isArray(bookingsData) ? bookingsData : [bookingsData];

                    if (bookingsArray.length === 0) return;

                    // 1. Process Reservations (Idempotent)
                    for (let i = 0; i < bookingsArray.length; i++) {
                        const booking = bookingsArray[i];

                        // Use the ID generated by Frontend (booking.id) or fallback to logic
                        // If booking.id is missing (legacy), use Ref for first, random for others.
                        let targetId = booking.id;
                        if (!targetId) {
                            targetId = (i === 0) ? external_reference : db.collection('reservas').doc().id;
                        }

                        const resRef = db.collection('reservas').doc(targetId);
                        const resDoc = await t.get(resRef);

                        // If it already exists, assume it was created by a previous retry or concurrent webhook
                        // Just ensure it is marked as paid.
                        if (resDoc.exists) {
                            t.update(resRef, {
                                pago_estado: 'deposit_paid', // or 'Pagado'
                                estado: 'Confirmado',
                                deposit_payment_id: String(paymentInfo.id),
                                monto_pagado: (i === 0) ? paidAmount : 0, // Attribute to first? Or split?
                            });
                        } else {
                            // Create New
                            const newReservation = {
                                ...booking,
                                id: targetId,
                                createdAt: new Date(),
                                updatedAt: new Date(),
                                estado: 'Confirmado',
                                pago_estado: 'deposit_paid',
                                monto_pagado: (i === 0) ? paidAmount : 0,
                                deposit_payment_id: String(paymentInfo.id),
                                payment_method: 'Pagos en linea', // As requested
                                // Ensure fields required by frontend exist
                                client: booking.client || {},
                                serviceIds: booking.serviceIds || [],
                                professionalId: booking.professionalId,
                                locationId: booking.locationId,
                                canal_reserva: booking.canal_reserva || 'web_publica'
                            };
                            t.set(resRef, newReservation);
                        }
                    }

                    // 2. Create Sale Record (Venta) for "Ventas Facturadas"
                    const saleRef = db.collection('ventas').doc(external_reference);
                    const saleDoc = await t.get(saleRef);

                    if (!saleDoc.exists) {
                        // Aggregate items from all bookings
                        const allItems = bookingsArray.flatMap((b: any) =>
                            b.serviceNames.map((name: string, idx: number) => {
                                const price = b.servicePrices?.[idx] || 0;
                                return {
                                    nombre: name,
                                    precio: price,
                                    cantidad: 1,
                                    subtotal: price,
                                    tipo: 'servicio',
                                    barbero_id: b.professionalId
                                };
                            })
                        );

                        // Create the Venta
                        // Create the Venta
                        const realTotal = allItems.reduce((sum: number, item: any) => sum + (item.precio || 0), 0);
                        const saldoPendiente = realTotal - paidAmount;
                        const pagoEstado = (paidAmount >= realTotal * 0.99) ? 'Pagado' : 'Pago Parcial';

                        t.set(saleRef, {
                            id: external_reference,
                            fecha_hora_venta: new Date(),
                            total: realTotal,
                            subtotal: realTotal,
                            descuento: {
                                valor: 0,
                                tipo: 'fixed',
                                monto: 0
                            },
                            metodo_pago: 'mercadopago', // Use standard enum
                            monto_pagado_real: paidAmount,
                            saldo_pendiente: saldoPendiente > 0 ? saldoPendiente : 0,
                            items: allItems,
                            cliente_id: bookingsArray[0]?.client?.id || 'unknown',
                            client: bookingsArray[0]?.client || {},
                            local_id: bookingsArray[0]?.locationId || 'default',
                            estado: 'completed', // Sale status
                            pago_estado: pagoEstado,
                            tipo: 'anticipo',
                            origen: 'web_publica',
                            anticipoPagado: paidAmount, // Explicit field for UI
                            mercado_pago_id: String(paymentInfo.id),
                            mercado_pago_status: 'approved',
                            reservationId: external_reference
                        });
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

                const isFullPay = montoPagado >= (montoOriginal * 0.99);
                const saldoPendiente = montoOriginal > montoPagado ? (montoOriginal - montoPagado) : 0;

                t.update(ventaRef, {
                    pago_estado: isFullPay ? 'Pagado' : 'deposit_paid',
                    mercado_pago_status: status,
                    mercado_pago_id: String(paymentInfo.id),
                    monto_pagado_real: montoPagado,
                    saldo_pendiente: saldoPendiente,
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
