import { MercadoPagoConfig, Preference } from 'mercadopago';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { items, payer } = body;

        // Use provided reservationId or generate a REAL UNIQUE Firestore ID
        // This ID will be the key to create the document in the Webhook
        let reservationId = body.reservationId;
        if (!reservationId) {
            const db = getDb();
            const newRef = db.collection('reservas').doc();
            reservationId = newRef.id;
        }

        // Initialize Mercado Pago
        const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_WEB_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || '';

        if (!accessToken || accessToken.length < 10) {
            console.error("[MP] Token missing or invalid.");
            return NextResponse.json({ error: "Configuración de pago incompleta (Token faltante)." }, { status: 500 });
        }

        const client = new MercadoPagoConfig({ accessToken });
        const preference = new Preference(client);

        // Determine base URL with explicit fallback
        // Priority: Environment Variable -> Production Fallback
        let baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://vatosalfa.com';

        // Normalize URL: Remove trailing slash
        if (baseUrl.endsWith('/')) {
            baseUrl = baseUrl.slice(0, -1);
        }

        // --- CRITICAL FIX FOR LOCALHOST TESTING ---
        // Mercado Pago "auto_return" STRICTLY requires a specific format (often HTTPS) 
        // and sometimes rejects 'http://localhost' with "invalid back_url".
        // To unblock testing, if we are on localhost, we will set the BACK URL 
        // to the PRODUCTION domain (https://vatosalfa.com).

        const isLocal = baseUrl.includes('localhost');
        const returnUrl = isLocal ? 'https://vatosalfa.com' : baseUrl;

        // Protocol Check for BaseURL (only if NOT local and NOT already having protocol)
        if (!isLocal && !baseUrl.startsWith('http')) {
            baseUrl = `https://${baseUrl}`;
        }

        console.log(`[MP] Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`[MP] Base URL: ${baseUrl}`);
        console.log(`[MP] Return URL for Redirects: ${returnUrl}`);

        // Construct Back URLs
        const backUrls = {
            success: `${returnUrl}/`,
            failure: `${returnUrl}/reserva/fallida`,
            pending: `${returnUrl}/`
        };

        const bodyData = {
            items: items.map((item: any) => ({
                ...item,
                unit_price: Number(item.unit_price),
                category_id: 'services',
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
            date_of_expiration: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            payment_methods: {
                installments: 1,
                excluded_payment_types: [{ id: "ticket" }]
            },
            back_urls: backUrls,
            auto_return: 'approved',
            metadata: {
                reservation_id: reservationId,
                booking_json: body.bookingData ? JSON.stringify(body.bookingData) : undefined
            },
            notification_url: "https://us-central1-agenda-1ae08.cloudfunctions.net/mercadoPagoWebhook"
        };

        const result = await preference.create({ body: bodyData });

        return NextResponse.json({
            id: result.id,
            init_point: result.init_point,
            sandbox_init_point: result.sandbox_init_point // Explicitly return sandbox point
        });

    } catch (error: any) {
        console.error("Error creating preference:", error);
        // Log detailed cause if available from MP SDK
        if (error.cause) console.error("MP Error Cause:", JSON.stringify(error.cause, null, 2));

        return NextResponse.json({ error: error.message || 'Error desconocido en MP', details: error.cause }, { status: 500 });
    }
}
