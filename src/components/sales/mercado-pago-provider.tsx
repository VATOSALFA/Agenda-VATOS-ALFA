
'use client';

import { initMercadoPago } from '@mercadopago/sdk-react';
import { ReactNode } from 'react';

const MERCADO_PAGO_PUBLIC_KEY = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;

// Initialize Mercado Pago
if (MERCADO_PAGO_PUBLIC_KEY) {
  initMercadoPago(MERCADO_PAGO_PUBLIC_KEY, {
    locale: 'es-MX'
  });
} else {
    console.error("Mercado Pago Public Key is not configured in environment variables.");
}


export const MercadoPagoProvider = ({ children }: { children: ReactNode }) => {
    return <>{children}</>;
};
