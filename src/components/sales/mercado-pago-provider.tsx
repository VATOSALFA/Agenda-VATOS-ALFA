
'use client';

import { initMercadoPago } from '@mercadopago/sdk-react';
import { ReactNode } from 'react';

const publicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;

if (publicKey) {
  initMercadoPago(publicKey, {
    locale: 'es-MX'
  });
} else {
  console.warn("La clave pública de Mercado Pago no está configurada. Los pagos con tarjeta no funcionarán.");
}


export const MercadoPagoProvider = ({ children }: { children: ReactNode }) => {
    return <>{children}</>;
};
