
import { MercadoPagoConfig, Preference } from 'mercadopago';

const accessToken = process.env.MP_ACCESS_TOKEN;

if (!accessToken) {
    console.warn('MercadoPago Access Token is not configured.');
}

// Initialize the client object with the access token
const client = new MercadoPagoConfig({ accessToken: accessToken || '', options: { timeout: 5000 } });

export const createPreference = async ({
    items,
    external_reference,
    payer,
}: {
    items: {
        id: string;
        title: string;
        quantity: number;
        unit_price: number;
        currency_id?: string;
    }[];
    external_reference?: string;
    payer?: {
        email: string;
        name?: string;
        surname?: string;
    };
}) => {
    if (!accessToken) {
        throw new Error('MercadoPago Access Token is not configured.');
    }

    const preference = new Preference(client);

    try {
        const result = await preference.create({
            body: {
                items: items.map(item => ({
                    ...item,
                    currency_id: item.currency_id || 'MXN',
                })),
                external_reference,
                payer,
                back_urls: {
                    success: `${process.env.NEXT_PUBLIC_APP_URL || 'https://vatosalfa--agenda-1ae08.us-central1.hosted.app'}/api/mercadopago/success`,
                    failure: `${process.env.NEXT_PUBLIC_APP_URL || 'https://vatosalfa--agenda-1ae08.us-central1.hosted.app'}/api/mercadopago/failure`,
                    pending: `${process.env.NEXT_PUBLIC_APP_URL || 'https://vatosalfa--agenda-1ae08.us-central1.hosted.app'}/api/mercadopago/pending`,
                },
                auto_return: 'approved',
            },
        });
        return result;
    } catch (error) {
        console.error('Error creating MercadoPago preference:', error);
        throw error;
    }
};
