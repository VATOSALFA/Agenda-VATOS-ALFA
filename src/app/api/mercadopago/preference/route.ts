
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { reservationId, items, payer } = body;

        // Initialize Mercado Pago
        const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || '' });
        const preference = new Preference(client);

        // Determine base URL (Production vs Local)
        // Prefer env var, fallback to origin, fallback to hardcoded
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.headers.get('origin') || 'https://vatosalfa.com';

        // Create Preference
        const result = await preference.create({
            body: {
                items: items,
                payer: {
                    email: payer.email,
                    name: payer.name || 'Cliente'
                },
                external_reference: reservationId,
                payment_methods: {
                    installments: 1,
                    excluded_payment_types: [
                        { id: "ticket" } // Exclude cash payments if instant confirmation is needed? Or keep them? Usually for booking, instant is better.
                    ]
                },
                back_urls: {
                    success: `${baseUrl}/reserva/confirmada`,
                    failure: `${baseUrl}/reserva/fallida`,
                    pending: `${baseUrl}/reserva/pendiente`
                },
                auto_return: 'approved',
                // notification_url: `${baseUrl}/api/mercadopago/webhook`, // Can be added later
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
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
