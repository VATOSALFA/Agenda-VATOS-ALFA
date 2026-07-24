'use client';

import { initMercadoPago } from '@mercadopago/sdk-react';
import { ReactNode, useEffect } from 'react';

export const MercadoPagoProvider = ({ children }: { children: ReactNode }) => {
    useEffect(() => {
        const publicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY || process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;
        if (publicKey) {
            try {
                initMercadoPago(publicKey, {
                    locale: 'es-MX'
                });
            } catch (err) {
                console.error("Error al inicializar Mercado Pago:", err);
            }
        }
    }, []);

    return <>{children}</>;
};
