
'use client';

import { initMercadoPago } from '@mercadopago/sdk-react';
import { ReactNode } from 'react';

// TODO: Move Public Key to environment variables
const MERCADO_PAGO_PUBLIC_KEY = 'TEST-e801f416-2ed2-4930-9feb-e6cc0e75982e';

initMercadoPago(MERCADO_PAGO_PUBLIC_KEY, {
    locale: 'es-MX'
});

export const MercadoPagoProvider = ({ children }: { children: ReactNode }) => {
    return <>{children}</>;
};
