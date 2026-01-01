
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { reservationId, items, payer } = body;

        // Initialize Mercado Pago
        // Prioritize the var defined in apphosting.yaml, but fallback to direct Secret name
        const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_WEB_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || '';

        console.log(`[MP] Loading token...`);
        console.log(`[MP] MERCADO_PAGO_ACCESS_TOKEN exists: ${!!process.env.MERCADO_PAGO_ACCESS_TOKEN}`);
        console.log(`[MP] MP_WEB_ACCESS_TOKEN exists: ${!!process.env.MP_WEB_ACCESS_TOKEN}`); // Explicit Check
        console.log(`[MP] MP_ACCESS_TOKEN exists: ${!!process.env.MP_ACCESS_TOKEN}`);
        console.log(`[MP] Final Token Length: ${accessToken.length}`);

        if (accessToken.length > 10) {
            // SECURITY: Never log the start of the token. Only confirm presence.
            console.log(`[MP] Token is present and meets length requirements.`);
        } else {
            console.log(`[MP] Token is likely missing or empty!`);
        }

        const client = new MercadoPagoConfig({ accessToken });

        if (!accessToken || accessToken.length < 10) {
            console.error("[MP] Token missing or invalid.");
            return NextResponse.json({ error: "Configuración de pago incompleta (Token faltante)." }, { status: 500 });
        }

        const preference = new Preference(client);

        // Determine base URL (Production vs Local)
        // Prefer env var, fallback to origin, fallback to hardcoded
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.headers.get('origin') || 'https://vatosalfa.com';

        // Sanitize Payer Data (MP requires valid email format)
        let payerEmail = payer.email;
        if (!payerEmail || !payerEmail.includes('@')) {
            payerEmail = 'cliente-sin-email@vatosalfa.com';
        }

        console.log(`[MP] Creating preference for Reservation ${reservationId} with email ${payerEmail}`);

        // Create Preference
        const backUrls = {
            success: `${baseUrl}/reserva/confirmada`,
            failure: `${baseUrl}/reserva/fallida`,
            pending: `${baseUrl}/reserva/pendiente`
        };

        console.log(`[MP] Using Back URLs:`, JSON.stringify(backUrls, null, 2));

        const result = await preference.create({
            body: {
                items: items.map((item: any) => ({
                    ...item,
                    unit_price: Number(item.unit_price) // Ensure it's a number
                })),
                payer: {
                    email: payerEmail,
                    name: payer.name || 'Cliente',
                    surname: payer.lastName || '',
                    phone: {
                        area_code: '52', // Assuming MX for now, can be improved later
                        number: payer.phone?.replace(/\D/g, '') || ''
                    }
                },
                external_reference: reservationId,
                statement_descriptor: "VATOS ALFA",
                expires: true,
                date_of_expiration: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min expiration
                binary_mode: true, // Force instant approval/rejection (no pending/review)
                payment_methods: {
                    installments: 1,
                    excluded_payment_types: [
                        { id: "ticket" }
                    ]
                },
                back_urls: backUrls,
                auto_return: baseUrl.includes('localhost') ? undefined : 'approved',
                metadata: {
                    reservation_id: reservationId
                }
            }
        });

        return NextResponse.json({
            id: result.id,
            init_point: result.init_point
        });

    } catch (error: any) {
        console.error("Error creating preference:", error);
        // Log detailed MP error if available
        if (error.cause) {
            console.error("MP Error Cause:", JSON.stringify(error.cause, null, 2));
        }
        return NextResponse.json({ error: error.message || 'Error desconocido en MP', details: error.cause }, { status: 500 });
    }
}
