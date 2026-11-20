'use client';

import { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const DynamicGoogleReCaptchaProvider = dynamic(
  () => import('react-google-recaptcha-v3').then((m) => m.GoogleReCaptchaProvider),
  { ssr: false }
);

export function RecaptchaProvider({ children }: { children: ReactNode }) {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  const pathname = usePathname() || '';

  const isReservationPage = pathname.startsWith('/reservar');

  if (!isReservationPage || !siteKey) {
    return <>{children}</>;
  }

  return (
    <DynamicGoogleReCaptchaProvider reCaptchaKey={siteKey} language="es">
      {children}
    </DynamicGoogleReCaptchaProvider>
  );
}
