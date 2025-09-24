
'use client';

import { initMercadoPago } from '@mercadopago/sdk-react';
import { ReactNode } from 'react';

// This is a test public key. Replace with your actual public key in production.
initMercadoPago('TEST-c4a72008-6134-4536-9c04-7b7076465432', {
  locale: 'es-MX'
});

export const MercadoPagoProvider = ({ children }: { children: ReactNode }) => {
    return <>{children}</>;
};
