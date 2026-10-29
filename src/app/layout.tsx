import type { ReactNode } from 'react';
import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import { MercadoPagoProvider } from '@/components/sales/mercado-pago-provider';
import { LocalProvider } from '@/contexts/local-context';
import { AuthProvider } from '@/contexts/firebase-auth-context';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { getDb } from '@/lib/firebase-server';
import { Metadata, Viewport } from 'next';

import { RecaptchaProvider } from '@/components/providers/google-recaptcha-provider';
import { GoogleAdsScript } from '@/components/providers/google-ads-script';
import { NetworkStatusIndicator } from '@/components/shared/network-status-indicator';
import { PwaUpdateBanner } from '@/components/shared/pwa-update-banner';
import { SeasonalEffectsWebOverlay } from '@/components/shared/seasonal-effects-web-overlay';
import { AuthGuard } from '@/components/layout/auth-guard';

export const revalidate = 60; // Revalidate every 60 seconds

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export async function generateMetadata(): Promise<Metadata> {
  const defaultTitle = 'VATOS ALFA Barber Shop';
  const defaultDesc = 'Agenda tu cita con los mejores profesionales.';
  const defaultIcon = '/icon-512x512.png?v=2';

  let title = defaultTitle;
  let description = defaultDesc;
  let customIconUrl: string | null = null;

  try {
    const db = getDb();
    const snapshot = await db.collection('empresa').limit(1).get();

    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      if (data) {
        if (data.name) title = data.name;
        if (data.description) description = data.description;
        if (data.icon_url) customIconUrl = data.icon_url;
      }
    }
  } catch (error) {
    console.warn('Metadata fetch failed (using default):', error);
  }

  return {
    metadataBase: new URL('https://vatosalfa.com'),
    title: title,
    description: description,
    manifest: '/manifest.json?v=2',
    icons: {
      icon: [
        { url: '/icon-192x192.png?v=2', sizes: '192x192', type: 'image/png' },
        { url: defaultIcon, sizes: '512x512', type: 'image/png' },
        ...(customIconUrl ? [{ url: customIconUrl }] : []),
      ],
      shortcut: '/icon-192x192.png?v=2',
      apple: [
        { url: '/apple-touch-icon.png?v=2', sizes: '180x180', type: 'image/png' },
      ],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: 'VATOS ALFA',
    },
    other: {
      'mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-capable': 'yes',
    },
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? {
      verification: {
        google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
      }
    } : {})
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#10172b',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        <GoogleAdsScript />
        <LocalProvider>
          <AuthProvider>
            <AuthGuard>
              <ThemeProvider>
                <MercadoPagoProvider>
                  <RecaptchaProvider>
                    <NetworkStatusIndicator />
                    <PwaUpdateBanner />
                    <SeasonalEffectsWebOverlay />
                    {children}
                    <Toaster />
                  </RecaptchaProvider>
                </MercadoPagoProvider>
              </ThemeProvider>
            </AuthGuard>
          </AuthProvider>
        </LocalProvider>
      </body>
    </html>
  );
}
