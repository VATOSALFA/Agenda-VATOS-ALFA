'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export const MercadoPagoProvider = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname() || '';
  const initializedRef = useRef(false);

  const isPaymentRoute =
    pathname.startsWith('/reservar') ||
    pathname.startsWith('/reserva') ||
    pathname.startsWith('/sales');

  useEffect(() => {
    if (!isPaymentRoute || initializedRef.current) return;

    const publicKey =
      process.env.NEXT_PUBLIC_MP_WEB_PUBLIC_KEY ||
      process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY ||
      process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;
    if (!publicKey) return;

    initializedRef.current = true;
    import('@mercadopago/sdk-react')
      .then(({ initMercadoPago }) => {
        initMercadoPago(publicKey, {
          locale: 'es-MX',
        });
      })
      .catch((err) => {
        initializedRef.current = false;
        console.error('Error al inicializar Mercado Pago:', err);
      });
  }, [isPaymentRoute]);

  return <>{children}</>;
};
