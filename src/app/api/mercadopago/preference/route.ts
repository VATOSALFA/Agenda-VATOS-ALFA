import { MercadoPagoConfig, Preference } from 'mercadopago';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-server';
import { checkRateLimit, getRequestIp } from '@/lib/server-auth';

let cachedMpToken: { token: string; expiresAt: number } | null = null;

export async function POST(req: NextRequest) {
    try {
        const ip = await getRequestIp();
        const rl = checkRateLimit(`mp_pref:${ip}`, 15, 60_000);
        if (!rl.allowed) {
            return NextResponse.json(
                { error: `Demasiadas solicitudes de pago. Intenta en ${rl.retryAfterSec}s.` },
                { status: 429 }
            );
        }

        const body = await req.json();
        const { items = [], payer = {} } = body || {};

        const db = getDb();
        let reservationId = body?.reservationId ? String(body.reservationId).trim() : '';
        if (reservationId && !/^[a-zA-Z0-9_-]{4,64}$/.test(reservationId)) {
            return NextResponse.json({ error: 'Identificador de reserva inválido.' }, { status: 400 });
        }

        const bookingList = Array.isArray(body?.bookingData)
            ? body.bookingData.map((b: any) => ({ ...b }))
            : (body?.bookingData ? [{ ...body.bookingData }] : []);

        if (!reservationId) {
            const newRef = db.collection('reservas').doc();
            reservationId = newRef.id;
        }

        // Verificar si ya existe reserva en Firestore (evita sobrescribir borradores ya pagados o confirmados)
        const existingResDoc = await db.collection('reservas').doc(reservationId).get();
        const existingResData = existingResDoc.exists ? existingResDoc.data() || {} : null;
        if (existingResData && (existingResData.pago_estado === 'Pagado' || existingResData.estado === 'Cancelado')) {
            return NextResponse.json(
                { error: 'Esta reserva ya se encuentra pagada o cancelada.' },
                { status: 400 }
            );
        }

        // Initialize Mercado Pago (prioritize in-memory cache -> dynamic Firestore config -> env)
        let accessToken = cachedMpToken && Date.now() < cachedMpToken.expiresAt ? cachedMpToken.token : '';
        if (!accessToken) {
            try {
                const configDoc = await db.collection('configuracion').doc('mercadopago').get();
                if (configDoc.exists) {
                    const fsToken = configDoc.data()?.accessToken;
                    if (fsToken && typeof fsToken === 'string' && fsToken.trim().length > 10) {
                        accessToken = fsToken.trim();
                    }
                }
            } catch (e) {
                console.warn("[MP] Could not read configuracion/mercadopago from Firestore, falling back to env:", e);
            }

            if (!accessToken) {
                accessToken = process.env.MP_WEB_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || '';
            }
            if (accessToken && accessToken.length >= 10) {
                cachedMpToken = { token: accessToken, expiresAt: Date.now() + 5 * 60 * 1000 };
            }
        }

        if (!accessToken || accessToken.length < 10) {
            console.error("[MP] Token missing or invalid.");
            return NextResponse.json({ error: "Configuración de pago incompleta (Token faltante)." }, { status: 500 });
        }

        const client = new MercadoPagoConfig({ accessToken });
        const preference = new Preference(client);

        let baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://vatosalfa.com';
        if (baseUrl.endsWith('/')) {
            baseUrl = baseUrl.slice(0, -1);
        }

        const isLocal = !baseUrl || baseUrl.includes('localhost') || !baseUrl.startsWith('https://');
        const returnUrl = isLocal ? 'https://vatosalfa.com' : baseUrl;

        const backUrls = {
            success: `${returnUrl}/reserva/confirmada`,
            failure: `${returnUrl}/reserva/fallida`,
            pending: `${returnUrl}/reserva/pendiente`
        };

        // SECURITY: Validar montos en servidor consultando catálogo real de servicios/productos o reserva existente
        let serverCalculatedMinAmount = 0;
        let serverCalculatedFullAmount = 0;

        if (bookingList.length > 0) {
            const serviceIds = new Set<string>();
            const productIds = new Set<string>();

            for (const b of bookingList) {
                const bItems = Array.isArray(b?.items) ? b.items : [];
                for (const it of bItems) {
                    const sid = String(it?.servicio_id || it?.serviceId || it?.id || '').trim();
                    if (!sid) continue;
                    if (it?.tipo === 'producto') productIds.add(sid);
                    else serviceIds.add(sid);
                }
                if (Array.isArray(b?.serviceIds)) {
                    for (const sid of b.serviceIds) {
                        const clean = String(sid || '').trim();
                        if (clean) serviceIds.add(clean);
                    }
                }
                if (b?.servicio_id) serviceIds.add(String(b.servicio_id).trim());
                if (Array.isArray(b?.productItems)) {
                    for (const p of b.productItems) {
                        const pid = String(p?.id || '').trim();
                        if (pid) productIds.add(pid);
                    }
                }
            }

            const servicePriceMap = new Map<string, number>();
            if (serviceIds.size > 0) {
                await Promise.all(
                    Array.from(serviceIds).map(async (sid) => {
                        const sDoc = await db.collection('servicios').doc(sid).get();
                        if (sDoc.exists) {
                            const p = Number(sDoc.data()?.price ?? sDoc.data()?.precio ?? 0);
                            if (p > 0) servicePriceMap.set(sid, p);
                        }
                    })
                );
            }

            const productPriceMap = new Map<string, number>();
            if (productIds.size > 0) {
                await Promise.all(
                    Array.from(productIds).map(async (pid) => {
                        const pDoc = await db.collection('productos').doc(pid).get();
                        if (pDoc.exists) {
                            const p = Number(pDoc.data()?.price ?? pDoc.data()?.precio ?? 0);
                            if (p > 0) productPriceMap.set(pid, p);
                        }
                    })
                );
            }

            for (const b of bookingList) {
                let bookingTotal = 0;
                const bItems = Array.isArray(b?.items) ? b.items : [];
                if (bItems.length > 0) {
                    for (const it of bItems) {
                        const sid = String(it?.servicio_id || it?.serviceId || it?.id || '').trim();
                        const qty = Math.max(1, Math.min(20, Number(it?.cantidad) || 1));
                        const realPrice =
                            it?.tipo === 'producto' ? productPriceMap.get(sid) : servicePriceMap.get(sid);
                        if (realPrice) bookingTotal += realPrice * qty;
                    }
                } else if (Array.isArray(b?.serviceIds) && b.serviceIds.length > 0) {
                    for (const sid of b.serviceIds) {
                        const realPrice = servicePriceMap.get(String(sid).trim());
                        if (realPrice) bookingTotal += realPrice;
                    }
                } else if (b?.servicio_id && servicePriceMap.has(String(b.servicio_id).trim())) {
                    bookingTotal += servicePriceMap.get(String(b.servicio_id).trim()) || 0;
                }

                if (Array.isArray(b?.productItems)) {
                    for (const p of b.productItems) {
                        const pid = String(p?.id || '').trim();
                        const qty = Math.max(1, Math.min(20, Number(p?.cantidad ?? p?.quantity ?? 1)));
                        const realPrice = productPriceMap.get(pid);
                        if (realPrice) bookingTotal += realPrice * qty;
                    }
                }

                if (bookingTotal > 0) {
                    b.total = bookingTotal;
                    b.totalAmount = bookingTotal;
                    serverCalculatedFullAmount += bookingTotal;
                }
            }

            let depositPct = 50;
            try {
                const reglasDoc = await db.collection('configuracion').doc('reglas_reservas').get();
                const srvDoc = !reglasDoc.exists ? await db.collection('configuracion').doc('servicios').get() : null;
                const resCfgDoc = !reglasDoc.exists && !srvDoc?.exists ? await db.collection('configuracion').doc('reservas').get() : null;
                const cfgData = (reglasDoc.exists ? reglasDoc.data() : srvDoc?.exists ? srvDoc.data() : resCfgDoc?.data()) || {};
                const cfgPct = Number(
                    cfgData.anticipo_porcentaje_defecto ?? cfgData.anticipoPorcentaje ?? cfgData.depositPercentage ?? 50
                );
                if (cfgPct > 0 && cfgPct <= 100) depositPct = cfgPct;
            } catch {}

            if (serverCalculatedFullAmount > 0) {
                const isFullPaymentRequested = bookingList.some((b: any) => Boolean(b?.isFullPayment));
                serverCalculatedMinAmount = isFullPaymentRequested
                    ? serverCalculatedFullAmount
                    : Math.min(
                        serverCalculatedFullAmount,
                        Math.max(50, Math.round((serverCalculatedFullAmount * depositPct) / 100))
                    );
            }
        }

        // Fallback a reserva existente en Firestore si no se enviaron servicios nuevos
        if (serverCalculatedMinAmount <= 0 && existingResData) {
            const resTotal = Number(existingResData.totalAmount || existingResData.total || existingResData.precio || 0);
            const expectedDep = Number(existingResData.anticipo_esperado || 0);
            const pendingBal = Number(existingResData.saldo_pendiente || 0);
            const candidateAmount = expectedDep > 0 ? expectedDep : (pendingBal > 0 ? pendingBal : resTotal);
            if (candidateAmount > 0) {
                serverCalculatedFullAmount = resTotal > 0 ? resTotal : candidateAmount;
                serverCalculatedMinAmount = Math.min(serverCalculatedFullAmount, candidateAmount);
            }
        }

        const requestedTotal = Array.isArray(items)
            ? items.reduce((sum: number, item: any) => sum + (Number(item?.unit_price) || 0) * (Number(item?.quantity) || 1), 0)
            : 0;

        if (!Array.isArray(items) || items.length === 0 || requestedTotal <= 0) {
            return NextResponse.json({ error: 'Monto o artículos inválidos para generar pago.' }, { status: 400 });
        }

        if (serverCalculatedMinAmount <= 0) {
            return NextResponse.json(
                { error: 'No se encontraron servicios o reserva válida en catálogo para procesar el pago.' },
                { status: 400 }
            );
        }

        if (requestedTotal + 1 < serverCalculatedMinAmount) {
            console.error(`[MP] Price manipulation blocked: requested=${requestedTotal}, serverMin=${serverCalculatedMinAmount}`);
            return NextResponse.json(
                { error: `El monto enviado ($${requestedTotal}) es menor al mínimo requerido ($${serverCalculatedMinAmount}).` },
                { status: 400 }
            );
        }

        if (bookingList.length > 0 && !existingResData) {
            bookingList[0].id = reservationId;
            try {
                await db.collection('mp_checkout_drafts').doc(reservationId).set({
                    reservationId,
                    bookingData: bookingList,
                    payer,
                    serverCalculatedFullAmount,
                    serverCalculatedMinAmount,
                    createdAt: new Date(),
                });
            } catch (draftErr) {
                console.warn('[MP] Could not save mp_checkout_drafts:', draftErr);
            }
        }

        const bodyData = {
            items: items.map((item: any) => ({
                ...item,
                unit_price: Number(item.unit_price),
                category_id: item.category_id || 'services',
                description: item.description || item.title || 'Servicio de Barbería'
            })),
            payer: {
                ...(payer.email && payer.email.includes('@') ? { email: payer.email } : {}),
                ...(payer.name && payer.name.length > 2 && !['cita', 'cliente', 'usuario'].includes(payer.name.toLowerCase()) ? { name: payer.name } : {}),
                ...(payer.lastName && payer.lastName.length > 2 ? { surname: payer.lastName } : {}),
                ...(payer.phone && payer.phone.replace(/\D/g, '').length === 10 ? {
                    phone: {
                        area_code: '52',
                        number: payer.phone.replace(/\D/g, '')
                    }
                } : {})
            },
            external_reference: reservationId,
            statement_descriptor: "VATOS ALFA",
            expires: true,
            expiration_date_from: new Date().toISOString(),
            expiration_date_to: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            payment_methods: {
                installments: 1,
                excluded_payment_types: [{ id: "ticket" }]
            },
            back_urls: backUrls,
            auto_return: 'approved',
            metadata: {
                reservation_id: reservationId,
                booking_json: bookingList.length > 0 ? JSON.stringify(bookingList) : undefined
            },
            notification_url: "https://vatosalfa.com/api/mercado-pago-webhook"
        };

        const result = await preference.create({ body: bodyData });

        return NextResponse.json({
            id: result.id,
            reservationId,
            init_point: result.init_point,
            sandbox_init_point: result.sandbox_init_point
        });

    } catch (error: any) {
        console.error("Error creating preference:", error);
        if (error.cause) console.error("MP Error Cause:", JSON.stringify(error.cause, null, 2));

        return NextResponse.json({ error: 'Error al generar la preferencia de pago en Mercado Pago.' }, { status: 500 });
    }
}
