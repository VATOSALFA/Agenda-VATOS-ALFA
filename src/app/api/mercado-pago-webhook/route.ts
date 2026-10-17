import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-server';

async function getCandidateTokens(db: any): Promise<string[]> {
    const tokens = new Set<string>();
    try {
        const configDoc = await db.collection('configuracion').doc('mercadopago').get();
        if (configDoc.exists) {
            const fsToken = configDoc.data()?.accessToken;
            if (fsToken && typeof fsToken === 'string' && fsToken.trim().length > 10) {
                tokens.add(fsToken.trim());
            }
        }
    } catch (e) {
        console.warn('[MP Webhook] Could not read configuracion/mercadopago:', e);
    }

    const envCandidates = [
        process.env.MP_WEB_ACCESS_TOKEN,
        process.env.MERCADO_PAGO_ACCESS_TOKEN,
        process.env.MP_ACCESS_TOKEN,
    ];
    for (const tok of envCandidates) {
        if (tok && tok.trim().length > 10) {
            tokens.add(tok.trim());
        }
    }

    return Array.from(tokens);
}

async function processApprovedPayment(
    db: any,
    paymentInfo: any,
    external_reference: string,
    body?: any
) {
    const { status, transaction_amount } = paymentInfo;
    const paid = Number(transaction_amount || 0);

    await db.runTransaction(async (t: any) => {
        // ============================================================
        // 1. PRE-READ ALL DOCUMENTS FIRST (Firestore Transaction Rule)
        // ============================================================
        const reservaRef = db.collection('reservas').doc(external_reference);
        const saleRef = db.collection('ventas').doc(external_reference);

        const [reservaDoc, saleDoc] = await Promise.all([
            t.get(reservaRef),
            t.get(saleRef),
        ]);

        let linkedReservaRef: any = null;
        let linkedReservaDoc: any = null;
        if (!reservaDoc.exists && saleDoc.exists) {
            const sData = saleDoc.data();
            if (sData?.reservationId) {
                linkedReservaRef = db.collection('reservas').doc(sData.reservationId);
                linkedReservaDoc = await t.get(linkedReservaRef);
            }
        }

        const bookingJson = paymentInfo.metadata?.booking_json || body?.data?.metadata?.booking_json;
        let bookingsArray: any[] = [];
        const bookingRefsAndDocs: { booking: any; targetId: string; resRef: any; resDoc: any }[] = [];

        if (!reservaDoc.exists && bookingJson) {
            try {
                const bookingsData = JSON.parse(bookingJson);
                bookingsArray = Array.isArray(bookingsData) ? bookingsData : [bookingsData];
                for (let i = 0; i < bookingsArray.length; i++) {
                    const booking = bookingsArray[i];
                    let targetId = booking.id;
                    if (!targetId) {
                        targetId = (i === 0) ? external_reference : db.collection('reservas').doc().id;
                    }
                    const resRef = db.collection('reservas').doc(targetId);
                    const resDoc = (targetId === external_reference) ? reservaDoc : await t.get(resRef);
                    bookingRefsAndDocs.push({ booking, targetId, resRef, resDoc });
                }
            } catch (jsonError) {
                console.error('[Next.js] Failed to parse booking_json:', jsonError);
            }
        }

        // ============================================================
        // 2. PERFORM WRITES (No t.get() allowed below this point)
        // ============================================================

        const determinePaymentStatus = (total: number, paidAmt: number) => {
            if (total > 0 && paidAmt >= total * 0.99) return 'Pagado';
            return 'deposit_paid';
        };

        // CASE A: Reservation Exists (Direct Advance Payment / Online Booking)
        if (reservaDoc.exists) {
            const data = reservaDoc.data() || {};
            const itemsSum = Array.isArray(data.items)
                ? data.items.reduce((acc: number, it: any) => acc + (Number(it.precio || it.price || 0) * (Number(it.cantidad) || 1)), 0)
                : 0;
            const total = Number(data.totalAmount || data.precio || data.total || itemsSum || 0);
            const realTotal = total > 0 ? total : paid;
            const newPaymentStatus = determinePaymentStatus(realTotal, paid);
            const saldoPendiente = newPaymentStatus === 'Pagado' ? 0 : Math.max(0, realTotal - paid);
            const paidAtDate = paymentInfo.date_approved ? new Date(paymentInfo.date_approved) : new Date();

            t.update(reservaRef, {
                pago_estado: newPaymentStatus,
                estado: newPaymentStatus === 'Pagado' ? 'Asiste' : 'Confirmado',
                total: realTotal,
                precio: realTotal,
                deposit_payment_id: String(paymentInfo.id),
                deposit_paid_at: paidAtDate,
                anticipo_esperado: data.anticipo_esperado || paid,
                monto_pagado: paid,
                monto_pagado_real: paid,
                monto_anticipo: paid,
                anticipo_pagado: paid,
                anticipoPagado: paid,
                saldo_pendiente: saldoPendiente,
                metodo_pago_anticipo: 'mercadopago',
            });

            if (!saleDoc.exists) {
                t.set(saleRef, {
                    id: external_reference,
                    reservationId: external_reference,
                    fecha_hora_venta: paidAtDate,
                    fecha_pago: paidAtDate,
                    total: realTotal,
                    subtotal: realTotal,
                    descuento: { valor: 0, tipo: 'fixed', monto: 0 },
                    metodo_pago: 'mercadopago',
                    monto_pagado_real: paid,
                    monto_anticipo: paid,
                    anticipoPagado: paid,
                    anticipo_pagado: paid,
                    monto_pagado: paid,
                    saldo_pendiente: saldoPendiente,
                    items: data.items || [{ nombre: data.servicio || 'Servicio', precio: realTotal, cantidad: 1, subtotal: realTotal, tipo: 'servicio', barbero_id: data.barbero_id || null }],
                    cliente_id: data.cliente_id || 'unknown',
                    cliente_nombre: data.cliente_nombre || '',
                    client: {
                        id: data.cliente_id,
                        nombre: data.cliente_nombre,
                        telefono: data.cliente_telefono,
                    },
                    local_id: data.local_id || 'default',
                    professional_id: data.barbero_id || null,
                    estado: 'completed',
                    status: 'completed',
                    pago_estado: newPaymentStatus === 'Pagado' ? 'Pagado' : 'deposit_paid',
                    tipo: 'anticipo',
                    tipo_venta: 'anticipo',
                    origen: data.origen || data.canal_reserva || 'agenda',
                    mercado_pago_id: String(paymentInfo.id),
                    mercado_pago_status: 'approved',
                    detalle_pago_combinado: {
                        efectivo: 0,
                        tarjeta: paid,
                        transferencia: 0,
                        pagos_en_linea: 0,
                    },
                });
            } else {
                const sData = saleDoc.data() || {};
                if (sData.pago_estado !== 'Pagado') {
                    t.update(saleRef, {
                        pago_estado: newPaymentStatus === 'Pagado' ? 'Pagado' : 'deposit_paid',
                        mercado_pago_status: 'approved',
                        mercado_pago_id: String(paymentInfo.id),
                        monto_pagado_real: paid,
                        monto_anticipo: paid,
                        anticipoPagado: paid,
                        anticipo_pagado: paid,
                        monto_pagado: paid,
                        saldo_pendiente: saldoPendiente,
                        fecha_pago: paidAtDate,
                    });
                }
            }

            console.log(`[Next.js] Reservation ${external_reference} updated with advance payment ($${paid} MXN, status: ${newPaymentStatus}).`);
            return;
        }

        // CASE B: Reservation Created from Metadata
        if (bookingRefsAndDocs.length > 0) {
            console.log(`[Next.js] Creating new reservation(s) from metadata for Ref ${external_reference}`);
            const paidAmount = paid;

            for (let i = 0; i < bookingRefsAndDocs.length; i++) {
                const { booking, targetId, resRef, resDoc } = bookingRefsAndDocs[i];
                const bTotal = Number(booking.total || booking.precio || 0);
                const bPaid = (i === 0) ? paidAmount : 0;
                const bSaldo = Math.max(0, bTotal - bPaid);

                if (resDoc.exists) {
                    t.update(resRef, {
                        pago_estado: 'deposit_paid',
                        estado: 'Confirmado',
                        deposit_payment_id: String(paymentInfo.id),
                        deposit_paid_at: new Date(),
                        monto_pagado: bPaid,
                        monto_anticipo: bPaid,
                        monto_pagado_real: bPaid,
                        anticipo_pagado: bPaid,
                        anticipoPagado: bPaid,
                        saldo_pendiente: bSaldo,
                        metodo_pago_anticipo: 'mercadopago',
                    });
                } else {
                    const newReservation = {
                        ...booking,
                        id: targetId,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        estado: 'Confirmado',
                        pago_estado: 'deposit_paid',
                        monto_pagado: bPaid,
                        monto_anticipo: bPaid,
                        monto_pagado_real: bPaid,
                        anticipo_pagado: bPaid,
                        anticipoPagado: bPaid,
                        saldo_pendiente: bSaldo,
                        metodo_pago_anticipo: 'mercadopago',
                        deposit_payment_id: String(paymentInfo.id),
                        deposit_paid_at: new Date(),
                        payment_method: 'Pagos en linea',
                        client: booking.client || {},
                        serviceIds: booking.serviceIds || [],
                        professionalId: booking.professionalId,
                        professional_lock: booking.professional_lock !== undefined ? Boolean(booking.professional_lock) : true,
                        locationId: booking.locationId,
                        canal_reserva: booking.canal_reserva || 'web_publica',
                    };
                    t.set(resRef, newReservation);
                }
            }

            if (!saleDoc.exists) {
                const allItems = bookingsArray.flatMap((b: any) =>
                    (b.serviceNames || []).map((name: string, idx: number) => {
                        const price = b.servicePrices?.[idx] || 0;
                        return {
                            nombre: name,
                            precio: price,
                            cantidad: 1,
                            subtotal: price,
                            tipo: 'servicio',
                            barbero_id: b.professionalId,
                        };
                    })
                );

                const realTotal = allItems.reduce((sum: number, item: any) => sum + (item.precio || 0), 0);
                const saldoPendiente = Math.max(0, realTotal - paidAmount);
                const pagoEstado = (realTotal > 0 && paidAmount >= realTotal * 0.99) ? 'Pagado' : 'deposit_paid';

                t.set(saleRef, {
                    id: external_reference,
                    fecha_hora_venta: new Date(),
                    total: realTotal,
                    subtotal: realTotal,
                    descuento: { valor: 0, tipo: 'fixed', monto: 0 },
                    metodo_pago: 'mercadopago',
                    monto_pagado_real: paidAmount,
                    monto_anticipo: paidAmount,
                    anticipoPagado: paidAmount,
                    anticipo_pagado: paidAmount,
                    monto_pagado: paidAmount,
                    saldo_pendiente: saldoPendiente,
                    items: allItems,
                    cliente_id: bookingsArray[0]?.client?.id || 'unknown',
                    client: bookingsArray[0]?.client || {},
                    local_id: bookingsArray[0]?.locationId || 'default',
                    estado: 'completed',
                    status: 'completed',
                    pago_estado: pagoEstado,
                    tipo: 'anticipo',
                    tipo_venta: 'anticipo',
                    origen: 'web_publica',
                    mercado_pago_id: String(paymentInfo.id),
                    mercado_pago_status: 'approved',
                    reservationId: external_reference,
                });
            }
            return;
        }

        // CASE C: Direct Sale (Venta) Update
        if (saleDoc.exists) {
            const ventaData = saleDoc.data() || {};
            if (ventaData.pago_estado === 'Pagado') return;

            const montoOriginal = Number(ventaData.total || 0);
            const montoPagado = paid;
            const propina = montoPagado > montoOriginal ? parseFloat((montoPagado - montoOriginal).toFixed(2)) : 0;

            const isFullPay = montoOriginal > 0 && montoPagado >= (montoOriginal * 0.99);
            const saldoPendiente = montoOriginal > montoPagado ? (montoOriginal - montoPagado) : 0;

            t.update(saleRef, {
                pago_estado: isFullPay ? 'Pagado' : 'deposit_paid',
                mercado_pago_status: status,
                mercado_pago_id: String(paymentInfo.id),
                monto_pagado_real: montoPagado,
                monto_anticipo: isFullPay ? (ventaData.monto_anticipo || 0) : montoPagado,
                anticipoPagado: isFullPay ? (ventaData.anticipoPagado || 0) : montoPagado,
                anticipo_pagado: isFullPay ? (ventaData.anticipo_pagado || 0) : montoPagado,
                monto_pagado: montoPagado,
                saldo_pendiente: saldoPendiente,
                propina: propina,
                fecha_pago: new Date(),
            });

            if (linkedReservaRef && linkedReservaDoc && linkedReservaDoc.exists) {
                t.update(linkedReservaRef, {
                    pago_estado: isFullPay ? 'Pagado' : 'deposit_paid',
                    estado: isFullPay ? 'Asiste' : 'Confirmado',
                    saldo_pendiente: saldoPendiente,
                    anticipo_pagado: montoPagado,
                    anticipoPagado: montoPagado,
                    monto_anticipo: montoPagado,
                    monto_pagado: montoPagado,
                    monto_pagado_real: montoPagado,
                    metodo_pago_anticipo: 'mercadopago',
                    deposit_payment_id: String(paymentInfo.id),
                    deposit_paid_at: new Date(),
                });
            }
            console.log(`[Next.js] Venta ${external_reference} updated.`);
        }
    });

    // Si la reserva provino del chatbot, notificar automáticamente en el chat del cliente
    try {
        const resDoc = await db.collection('reservas').doc(external_reference).get();
        if (resDoc.exists) {
            const resData = resDoc.data()!;
            if ((resData.canal_reserva === 'chatbot' || resData.origen === 'chatbot') && resData.cliente_telefono) {
                const cleanPhone = resData.cliente_telefono.replace(/\D/g, '').slice(-10);
                const convsSnap = await db.collection('conversaciones').get();
                const targetConv = convsSnap.docs.find((d: any) => {
                    const p = (d.data().cliente_telefono || d.data().telefono || '').replace(/\D/g, '');
                    return p.includes(cleanPhone) || d.id.includes(cleanPhone);
                });

                if (targetConv) {
                    const timeStr = resData.hora_inicio ? ` a las ${resData.hora_inicio}` : '';
                    const msgRef = targetConv.ref.collection('mensajes').doc();
                    const notifText = `💳 ¡Anticipo de $${paid} MXN recibido con éxito vía Mercado Pago! Tu cita para el ${resData.fecha}${timeStr} ha quedado 100% confirmada. ¡Te esperamos en VATOS ALFA!`;
                    await msgRef.set({
                        id: msgRef.id,
                        conversation_id: targetConv.id,
                        de: 'sistema',
                        texto: notifText,
                        timestamp: new Date(),
                        tipo: 'sistema',
                    });
                    await targetConv.ref.update({
                        ultimo_mensaje: notifText,
                        fecha_ultimo_mensaje: new Date(),
                    });
                }
            }
        }
    } catch (chatNotifErr) {
        console.error('[Next.js] Error sending chat notification for advance payment:', chatNotifErr);
    }
}

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const reservationId = url.searchParams.get('reservationId');
        if (!reservationId) {
            return NextResponse.json({ error: 'Missing reservationId' }, { status: 400 });
        }

        const db = getDb();
        const candidateTokens = await getCandidateTokens(db);
        if (candidateTokens.length === 0) {
            return NextResponse.json({ verified: false, reason: 'no_tokens' });
        }

        for (const token of candidateTokens) {
            const searchRes = await fetch(
                `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(reservationId)}&sort=date_created&criteria=desc`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!searchRes.ok) continue;

            const searchData = await searchRes.json();
            const approvedPayment = searchData.results?.find((p: any) => p.status === 'approved');
            if (approvedPayment) {
                await processApprovedPayment(db, approvedPayment, reservationId);
                return NextResponse.json({
                    verified: true,
                    paymentId: approvedPayment.id,
                    amount: approvedPayment.transaction_amount,
                    status: 'approved',
                });
            }
        }

        return NextResponse.json({ verified: false });
    } catch (error: any) {
        console.error('[Next.js] GET Verify Payment Error:', error);
        return NextResponse.json({ verified: false, error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    console.log("========== [Next.js] MERCADO PAGO WEBHOOK RECEIVED ==========");

    try {
        const url = new URL(req.url);
        const queryId = url.searchParams.get('id') || url.searchParams.get('data.id');
        const queryTopic = url.searchParams.get('topic') || url.searchParams.get('type');

        const body = await req.json().catch(() => ({}));
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

        const db = getDb();
        const candidateTokens = await getCandidateTokens(db);
        let paymentInfo: any = null;

        for (const token of candidateTokens) {
            // 1. Try fetching as a direct Payment
            const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (paymentRes.ok) {
                paymentInfo = await paymentRes.json();
                break;
            } else {
                // 2. Try fetching as a Merchant Order
                const orderRes = await fetch(`https://api.mercadopago.com/merchant_orders/${dataId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
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
                        break;
                    }
                }
            }
        }

        const external_reference = body?.data?.external_reference || paymentInfo?.external_reference;

        if (!paymentInfo || paymentInfo.status !== 'approved' || !external_reference) {
            console.error(`[Next.js] Could not verify/process payment ${dataId}`);
            return NextResponse.json({ status: "OK (Ignored)" });
        }

        console.log(`[Next.js] API Check: Status=${paymentInfo.status}, Ref=${external_reference}, Amount=${paymentInfo.transaction_amount}`);

        await processApprovedPayment(db, paymentInfo, external_reference, body);

        return NextResponse.json({ status: "OK" });

    } catch (error: any) {
        console.error('[Next.js] Webhook Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

