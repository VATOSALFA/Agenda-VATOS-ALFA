import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-server';
import { FieldValue } from 'firebase-admin/firestore';

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

async function resolveOrCreateBookingClient(db: any, rawClient: any): Promise<{
    clientId: string;
    clientName: string;
    clientPhone: string;
    clientEmail: string;
}> {
    const name = String(rawClient?.name || rawClient?.nombre || '').trim();
    const lastName = String(rawClient?.lastName || rawClient?.apellido || '').trim();
    const fullName = [name, lastName].filter(Boolean).join(' ').trim() || 'Cliente Web';
    const cleanPhone = String(rawClient?.phone || rawClient?.telefono || '').replace(/\D/g, '').slice(-10);
    const email = String(rawClient?.email || rawClient?.correo || '').trim();

    if (rawClient?.id && typeof rawClient.id === 'string' && rawClient.id !== 'unknown' && rawClient.id !== 'guest') {
        return {
            clientId: rawClient.id,
            clientName: fullName,
            clientPhone: cleanPhone,
            clientEmail: email,
        };
    }

    try {
        const clientsRef = db.collection('clientes');
        let existingDoc: any = null;

        if (email && email.includes('@')) {
            let snap = await clientsRef.where('correo', '==', email).limit(1).get();
            if (!snap.empty) {
                existingDoc = snap.docs[0];
            } else {
                snap = await clientsRef.where('email', '==', email).limit(1).get();
                if (!snap.empty) existingDoc = snap.docs[0];
            }
        }

        if (!existingDoc && cleanPhone.length === 10) {
            const snap = await clientsRef.where('telefono', '==', cleanPhone).limit(1).get();
            if (!snap.empty) existingDoc = snap.docs[0];
        }

        if (existingDoc) {
            const cData = existingDoc.data() || {};
            const dbName = [cData.nombre, cData.apellido].filter(Boolean).join(' ').trim() || fullName;
            return {
                clientId: existingDoc.id,
                clientName: dbName,
                clientPhone: cData.telefono || cleanPhone,
                clientEmail: cData.correo || cData.email || email,
            };
        }

        if (cleanPhone || email || name) {
            const newClientRef = await clientsRef.add({
                nombre: name || 'Cliente',
                apellido: lastName || '',
                telefono: cleanPhone,
                correo: email,
                fecha_nacimiento: rawClient?.birthday || null,
                notas: rawClient?.notes || '',
                creado_en: FieldValue.serverTimestamp(),
                origen: 'web_publica',
            });
            return {
                clientId: newClientRef.id,
                clientName: fullName,
                clientPhone: cleanPhone,
                clientEmail: email,
            };
        }
    } catch (err) {
        console.warn('[MP Webhook] Error resolving client in clientes collection:', err);
    }

    return {
        clientId: 'unknown',
        clientName: fullName,
        clientPhone: cleanPhone,
        clientEmail: email,
    };
}

async function processApprovedPayment(
    db: any,
    paymentInfo: any,
    external_reference: string,
    body?: any
) {
    const { status, transaction_amount } = paymentInfo;
    const paid = Number(transaction_amount || 0);
    const paidAtDate = paymentInfo.date_approved ? new Date(paymentInfo.date_approved) : new Date();

    // Pre-parse booking_json and resolve client + professional names outside the transaction
    const bookingJson = paymentInfo.metadata?.booking_json || body?.data?.metadata?.booking_json;
    let parsedBookingsArray: any[] = [];
    let resolvedClient = {
        clientId: 'unknown',
        clientName: 'Cliente Web',
        clientPhone: '',
        clientEmail: '',
    };
    const resolvedBarberNames: Record<string, string> = {};

    if (bookingJson) {
        try {
            const bookingsData = JSON.parse(bookingJson);
            parsedBookingsArray = Array.isArray(bookingsData) ? bookingsData : [bookingsData];
        } catch (jsonError) {
            console.error('[Next.js] Failed to parse booking_json:', jsonError);
        }
    }

    // Fallback: Check mp_checkout_drafts in Firestore if metadata.booking_json was missing or stripped by MP Wallet/SPEI
    if (parsedBookingsArray.length === 0 && external_reference) {
        try {
            const draftDoc = await db.collection('mp_checkout_drafts').doc(external_reference).get();
            if (draftDoc.exists) {
                const draftData = draftDoc.data() || {};
                if (Array.isArray(draftData.bookingData) && draftData.bookingData.length > 0) {
                    parsedBookingsArray = draftData.bookingData;
                }
            }
        } catch (draftReadErr) {
            console.warn('[MP Webhook] Could not read mp_checkout_drafts fallback:', draftReadErr);
        }
    }

    if (parsedBookingsArray.length > 0) {
        try {
            if (parsedBookingsArray[0]?.client) {
                resolvedClient = await resolveOrCreateBookingClient(db, parsedBookingsArray[0].client);
            }
            const proIds = Array.from(
                new Set(
                    parsedBookingsArray
                        .map((b: any) => b?.barbero_id || b?.professionalId)
                        .filter(Boolean)
                )
            ) as string[];
            for (const pId of proIds) {
                try {
                    const pDoc = await db.collection('profesionales').doc(pId).get();
                    if (pDoc.exists) {
                        const pData = pDoc.data() || {};
                        resolvedBarberNames[pId] = pData.publicName || pData.name || '';
                    }
                } catch (_) {}
            }
        } catch (resolveErr) {
            console.error('[Next.js] Error resolving client/barber from booking data:', resolveErr);
        }
    }

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

        const bookingRefsAndDocs: { booking: any; targetId: string; resRef: any; resDoc: any }[] = [];

        if (parsedBookingsArray.length > 0) {
            for (let i = 0; i < parsedBookingsArray.length; i++) {
                const booking = parsedBookingsArray[i];
                let targetId = booking.id;
                if (!targetId) {
                    targetId = (i === 0) ? external_reference : db.collection('reservas').doc().id;
                }
                const resRef = db.collection('reservas').doc(targetId);
                const resDoc = (targetId === external_reference) ? reservaDoc : await t.get(resRef);
                bookingRefsAndDocs.push({ booking, targetId, resRef, resDoc });
            }
        }

        // ============================================================
        // 2. PERFORM WRITES (No t.get() allowed below this point)
        // ============================================================

        const determinePaymentStatus = (total: number, paidAmt: number) => {
            if (total > 0 && paidAmt >= total * 0.99) return 'Pagado';
            return 'deposit_paid';
        };

        // Helper to normalize a booking payload into the complete Agenda schema
        const buildAgendaReservationFields = (booking: any, targetId: string, bTotal: number, bPaid: number, bSaldo: number) => {
            const proId = booking.barbero_id || booking.professionalId || '';
            const fechaStr = booking.fecha || booking.date || '';
            const horaInicioStr = booking.hora_inicio || booking.time || '';
            const horaFinStr = booking.hora_fin || booking.endTime || '';
            const duracionMin = Number(booking.duracion || booking.duration || 30);
            const locId = booking.local_id || booking.locationId || 'default';
            const servicioTitle =
                booking.servicio ||
                (Array.isArray(booking.serviceNames) && booking.serviceNames.length > 0
                    ? booking.serviceNames.join(', ')
                    : (Array.isArray(booking.items) && booking.items.length > 0
                        ? booking.items.map((it: any) => it.nombre || it.servicio).filter(Boolean).join(', ')
                        : 'Servicio'));
            const cId = booking.cliente_id || resolvedClient.clientId || 'unknown';
            const cName =
                booking.cliente_nombre ||
                resolvedClient.clientName ||
                [booking.client?.name, booking.client?.lastName].filter(Boolean).join(' ').trim() ||
                'Cliente Web';
            const cPhone = booking.cliente_telefono || resolvedClient.clientPhone || booking.client?.phone || '';

            const normalizedItems = Array.isArray(booking.items) && booking.items.length > 0
                ? booking.items.map((it: any) => ({
                    ...it,
                    nombre: it.nombre || it.servicio || 'Servicio',
                    servicio: it.servicio || it.nombre || 'Servicio',
                    barbero_id: it.barbero_id || proId,
                }))
                : (booking.serviceNames || []).map((sName: string, idx: number) => ({
                    id: booking.serviceIds?.[idx] || `srv_${idx}`,
                    nombre: sName,
                    servicio: sName,
                    precio: Number(booking.servicePrices?.[idx] || bTotal || 0),
                    duracion: duracionMin,
                    barbero_id: proId,
                    professional_lock: booking.professional_lock !== undefined ? Boolean(booking.professional_lock) : true,
                    tipo: 'servicio',
                }));

            return {
                id: targetId,
                cliente_id: cId,
                cliente_nombre: cName,
                cliente_telefono: cPhone,
                client: {
                    ...(booking.client || {}),
                    id: cId,
                    name: booking.client?.name || cName,
                    phone: cPhone,
                    email: booking.client?.email || resolvedClient.clientEmail || '',
                },
                barbero_id: proId,
                profesionalId: proId,
                professionalId: proId,
                barbero_nombre: resolvedBarberNames[proId] || booking.barbero_nombre || '',
                professional_lock: booking.professional_lock !== undefined ? Boolean(booking.professional_lock) : true,
                fecha: fechaStr,
                date: fechaStr,
                hora_inicio: horaInicioStr,
                time: horaInicioStr,
                hora_fin: horaFinStr,
                endTime: horaFinStr,
                duracion: duracionMin,
                duration: duracionMin,
                servicio: servicioTitle,
                serviceIds: booking.serviceIds || [],
                serviceNames: booking.serviceNames || [servicioTitle],
                items: normalizedItems,
                local_id: locId,
                locationId: locId,
                total: bTotal,
                precio: bTotal,
                totalAmount: bTotal,
                anticipo_esperado: bPaid,
                monto_pagado: bPaid,
                monto_anticipo: bPaid,
                monto_pagado_real: bPaid,
                anticipo_pagado: bPaid,
                anticipoPagado: bPaid,
                saldo_pendiente: bSaldo,
                requiere_pago_anticipado: bPaid > 0,
                estado: 'Confirmado',
                pago_estado: determinePaymentStatus(bTotal, bPaid),
                origen: booking.origen || booking.canal_reserva || 'web_publica',
                canal_reserva: booking.canal_reserva || 'web_publica',
                metodo_pago_anticipo: 'mercadopago',
                payment_method: 'Pagos en linea',
                deposit_payment_id: String(paymentInfo.id),
                mercado_pago_id: String(paymentInfo.id),
                deposit_paid_at: paidAtDate,
            };
        };

        // CASE A: Reservation Exists Directly Under external_reference
        if (reservaDoc.exists) {
            const data = reservaDoc.data() || {};
            const itemsSum = Array.isArray(data.items)
                ? data.items.reduce((acc: number, it: any) => acc + (Number(it.precio || it.price || 0) * (Number(it.cantidad) || 1)), 0)
                : 0;
            const total = Number(data.totalAmount || data.precio || data.total || itemsSum || 0);
            const realTotal = total > 0 ? total : paid;
            const newPaymentStatus = determinePaymentStatus(realTotal, paid);
            const saldoPendiente = newPaymentStatus === 'Pagado' ? 0 : Math.max(0, realTotal - paid);

            // Ensure Spanish Agenda fields exist even if document was previously created with English keys
            const backfillFields = buildAgendaReservationFields(data, external_reference, realTotal, paid, saldoPendiente);

            t.update(reservaRef, {
                ...backfillFields,
                pago_estado: newPaymentStatus,
                estado: (data.estado === 'Asiste' || data.estado === 'Completado') ? data.estado : 'Confirmado',
                updatedAt: paidAtDate,
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
                    items: backfillFields.items,
                    cliente_id: backfillFields.cliente_id,
                    cliente_nombre: backfillFields.cliente_nombre,
                    client: {
                        id: backfillFields.cliente_id,
                        nombre: backfillFields.cliente_nombre,
                        telefono: backfillFields.cliente_telefono,
                    },
                    local_id: backfillFields.local_id,
                    professional_id: backfillFields.barbero_id || null,
                    estado: 'completed',
                    status: 'completed',
                    pago_estado: newPaymentStatus === 'Pagado' ? 'Pagado' : 'deposit_paid',
                    tipo: 'anticipo',
                    tipo_venta: 'anticipo',
                    origen: backfillFields.origen,
                    mercado_pago_id: String(paymentInfo.id),
                    mercado_pago_status: 'approved',
                    detalle_pago_combinado: {
                        efectivo: 0,
                        tarjeta: 0,
                        transferencia: 0,
                        pagos_en_linea: paid,
                    },
                });
            } else {
                const sData = saleDoc.data() || {};
                if (sData.pago_estado !== 'Pagado') {
                    t.update(saleRef, {
                        reservationId: external_reference,
                        cliente_id: backfillFields.cliente_id,
                        cliente_nombre: backfillFields.cliente_nombre,
                        professional_id: backfillFields.barbero_id || null,
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
                        detalle_pago_combinado: {
                            efectivo: 0,
                            tarjeta: 0,
                            transferencia: 0,
                            pagos_en_linea: paid,
                        },
                    });
                }
            }

            console.log(`[Next.js] Reservation ${external_reference} updated with advance payment ($${paid} MXN, status: ${newPaymentStatus}).`);
            return;
        }

        // CASE B: Reservation Created from Metadata (Online Web Booking with Advance Payment)
        if (bookingRefsAndDocs.length > 0) {
            console.log(`[Next.js] Creating/updating reservation(s) from metadata for Ref ${external_reference}`);
            const paidAmount = paid;

            for (let i = 0; i < bookingRefsAndDocs.length; i++) {
                const { booking, targetId, resRef, resDoc } = bookingRefsAndDocs[i];
                const itemsSum = Array.isArray(booking.items)
                    ? booking.items.reduce((acc: number, it: any) => acc + (Number(it.precio || it.price || 0) * (Number(it.cantidad) || 1)), 0)
                    : 0;
                const bTotal = Number(booking.totalAmount || booking.total || booking.precio || itemsSum || paidAmount || 0);
                const bPaid = (i === 0) ? paidAmount : 0;
                const bSaldo = Math.max(0, bTotal - bPaid);

                const agendaFields = buildAgendaReservationFields(booking, targetId, bTotal, bPaid, bSaldo);

                if (resDoc.exists) {
                    const existingData = resDoc.data() || {};
                    t.update(resRef, {
                        ...agendaFields,
                        estado: (existingData.estado === 'Asiste' || existingData.estado === 'Completado') ? existingData.estado : 'Confirmado',
                        updatedAt: paidAtDate,
                    });
                } else {
                    t.set(resRef, {
                        ...booking,
                        ...agendaFields,
                        creado_en: paidAtDate,
                        createdAt: paidAtDate,
                        updatedAt: paidAtDate,
                    });
                }
            }

            const primaryBooking = bookingRefsAndDocs[0]?.booking || {};
            const primaryResId = bookingRefsAndDocs[0]?.targetId || external_reference;
            const primaryProId = primaryBooking.barbero_id || primaryBooking.professionalId || null;
            const primaryLocalId = primaryBooking.local_id || primaryBooking.locationId || 'default';

            const allItems = parsedBookingsArray.flatMap((b: any) => {
                if (Array.isArray(b.items) && b.items.length > 0) {
                    return b.items.map((it: any) => ({
                        nombre: it.nombre || it.servicio || 'Servicio',
                        precio: Number(it.precio || it.price || 0),
                        cantidad: Number(it.cantidad || 1),
                        subtotal: Number(it.precio || it.price || 0) * Number(it.cantidad || 1),
                        tipo: it.tipo || 'servicio',
                        barbero_id: it.barbero_id || b.professionalId || b.barbero_id || null,
                    }));
                }
                return (b.serviceNames || []).map((name: string, idx: number) => {
                    const price = Number(b.servicePrices?.[idx] || 0);
                    return {
                        nombre: name,
                        precio: price,
                        cantidad: 1,
                        subtotal: price,
                        tipo: 'servicio',
                        barbero_id: b.professionalId || b.barbero_id || null,
                    };
                });
            });

            const itemsTotal = allItems.reduce((sum: number, item: any) => sum + (Number(item.subtotal || item.precio) || 0), 0);
            const realTotal = itemsTotal > 0 ? itemsTotal : Number(primaryBooking.totalAmount || primaryBooking.total || paidAmount || 0);
            const saldoPendiente = Math.max(0, realTotal - paidAmount);
            const pagoEstado = determinePaymentStatus(realTotal, paidAmount);

            if (!saleDoc.exists) {
                t.set(saleRef, {
                    id: external_reference,
                    reservationId: primaryResId,
                    fecha_hora_venta: paidAtDate,
                    fecha_pago: paidAtDate,
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
                    cliente_id: resolvedClient.clientId,
                    cliente_nombre: resolvedClient.clientName,
                    client: {
                        id: resolvedClient.clientId,
                        nombre: resolvedClient.clientName,
                        telefono: resolvedClient.clientPhone,
                        correo: resolvedClient.clientEmail,
                    },
                    local_id: primaryLocalId,
                    professional_id: primaryProId,
                    estado: 'completed',
                    status: 'completed',
                    pago_estado: pagoEstado,
                    tipo: 'anticipo',
                    tipo_venta: 'anticipo',
                    origen: 'web_publica',
                    mercado_pago_id: String(paymentInfo.id),
                    mercado_pago_status: 'approved',
                    detalle_pago_combinado: {
                        efectivo: 0,
                        tarjeta: 0,
                        transferencia: 0,
                        pagos_en_linea: paidAmount,
                    },
                });
            } else {
                t.update(saleRef, {
                    reservationId: primaryResId,
                    cliente_id: resolvedClient.clientId,
                    cliente_nombre: resolvedClient.clientName,
                    professional_id: primaryProId,
                    pago_estado: pagoEstado,
                    mercado_pago_status: 'approved',
                    mercado_pago_id: String(paymentInfo.id),
                    monto_pagado_real: paidAmount,
                    monto_anticipo: paidAmount,
                    anticipoPagado: paidAmount,
                    anticipo_pagado: paidAmount,
                    monto_pagado: paidAmount,
                    saldo_pendiente: saldoPendiente,
                    fecha_pago: paidAtDate,
                    detalle_pago_combinado: {
                        efectivo: 0,
                        tarjeta: 0,
                        transferencia: 0,
                        pagos_en_linea: paidAmount,
                    },
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
                fecha_pago: paidAtDate,
            });

            if (linkedReservaRef && linkedReservaDoc && linkedReservaDoc.exists) {
                const existingResData = linkedReservaDoc.data() || {};
                t.update(linkedReservaRef, {
                    pago_estado: isFullPay ? 'Pagado' : 'deposit_paid',
                    estado: (existingResData.estado === 'Asiste' || existingResData.estado === 'Completado') ? existingResData.estado : 'Confirmado',
                    saldo_pendiente: saldoPendiente,
                    anticipo_pagado: montoPagado,
                    anticipoPagado: montoPagado,
                    monto_anticipo: montoPagado,
                    monto_pagado: montoPagado,
                    monto_pagado_real: montoPagado,
                    metodo_pago_anticipo: 'mercadopago',
                    deposit_payment_id: external_reference || String(paymentInfo.id),
                    mercado_pago_id: String(paymentInfo.id),
                    deposit_paid_at: paidAtDate,
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

        // 1. Fast check: Is the reservation already created & confirmed in Firestore?
        try {
            const existingRes = await db.collection('reservas').doc(reservationId).get();
            if (existingRes.exists) {
                const rData = existingRes.data() || {};
                const isPaid =
                    rData.pago_estado === 'deposit_paid' ||
                    rData.pago_estado === 'Pagado' ||
                    Number(rData.anticipo_pagado || rData.monto_pagado || 0) > 0;
                if (isPaid && rData.fecha) {
                    return NextResponse.json({
                        verified: true,
                        reservationId: existingRes.id,
                        paymentId: rData.mercado_pago_id || rData.deposit_payment_id,
                        amount: rData.anticipo_pagado || rData.monto_pagado,
                        status: 'approved',
                    });
                }
            }
        } catch (_) {}

        // 2. Active check against Mercado Pago API
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
                    reservationId,
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
                        // Fetch the full payment object so metadata.booking_json is preserved!
                        const fullPayRes = await fetch(`https://api.mercadopago.com/v1/payments/${approvedPayment.id}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        }).catch(() => null);
                        if (fullPayRes && fullPayRes.ok) {
                            paymentInfo = await fullPayRes.json();
                            if (!paymentInfo.external_reference && orderInfo.external_reference) {
                                paymentInfo.external_reference = orderInfo.external_reference;
                            }
                        } else {
                            paymentInfo = {
                                id: approvedPayment.id,
                                external_reference: orderInfo.external_reference,
                                status: 'approved',
                                transaction_amount: approvedPayment.transaction_amount
                            };
                        }
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
