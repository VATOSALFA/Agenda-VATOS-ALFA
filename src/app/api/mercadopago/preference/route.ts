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

        // Determine base URL
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.headers.get('origin') || 'https://vatosalfa.com';

        // Sanitize Payer Data
        let payerEmail = payer.email;
        if (!payerEmail || !payerEmail.includes('@')) {
            payerEmail = 'cliente-sin-email@vatosalfa.com';
        }

        console.log(`[MP] Creating preference for Reservation ${reservationId} with email ${payerEmail}`);

        // Create Preference
        // User requested redirect to HOME after success.
        const backUrls = {
            success: `${baseUrl}/`,
            failure: `${baseUrl}/reserva/fallida`,
            pending: `${baseUrl}/`
        };

        const result = await preference.create({
            body: {
                items: items.map((item: any) => ({
                    ...item,
                    unit_price: Number(item.unit_price),
                    category_id: 'services', // "services" category improves approval rates for non-physical goods
                    description: item.description || item.title || 'Servicio de Barbería' // Detailed description
                })),
                payer: {
                    ...(payer.email && payer.email.includes('@') ? { email: payer.email } : {}),
                    ...(payer.name ? { name: payer.name } : {}),
                    ...(payer.lastName ? { surname: payer.lastName } : {}),
                    ...(payer.phone && payer.phone.replace(/\D/g, '').length > 0 ? {
                        phone: {
                            area_code: '52',
                            number: payer.phone.replace(/\D/g, '')
                        }
                    } : {})
                },
                external_reference: reservationId, // This ID is guaranteed to be a valid Firestore ID now
                statement_descriptor: "VATOS ALFA",
                expires: true,
                date_of_expiration: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
                // binary_mode: true, // REMOVED: Causing false positives in anti-fraud
                payment_methods: {
                    installments: 1,
                    excluded_payment_types: [
                        { id: "ticket" }
                    ]
                },
                back_urls: backUrls,
                auto_return: 'approved', // Redirect automatically
                metadata: {
                    reservation_id: reservationId,
                    booking_json: body.bookingData ? JSON.stringify(body.bookingData) : undefined
                }
            }
        });

        return NextResponse.json({
            id: result.id,
            init_point: result.init_point
        });

    } catch (error: any) {
        console.error("Error creating preference:", error);
        return NextResponse.json({ error: error.message || 'Error desconocido en MP', details: error.cause }, { status: 500 });
    }
}
