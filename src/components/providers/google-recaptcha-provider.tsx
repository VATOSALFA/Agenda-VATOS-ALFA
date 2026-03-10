'use client';

import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';
import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export function RecaptchaProvider({ children }: { children: ReactNode }) {
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
    const pathname = usePathname();

    const isReservationPage = pathname?.startsWith('/reservar');

    if (!siteKey || !isReservationPage) {
        if (!siteKey) console.warn("Recaptcha Site Key missing");
        return <>{children}</>;
    }

    return (
        <GoogleReCaptchaProvider reCaptchaKey={siteKey} language="es">
            {children}
        </GoogleReCaptchaProvider>
    );
}
