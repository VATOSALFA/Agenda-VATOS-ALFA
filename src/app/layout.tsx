import type { ReactNode } from 'react';
import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import { MercadoPagoProvider } from '@/components/sales/mercado-pago-provider';
import { LocalProvider } from '@/contexts/local-context';
import { AuthProvider } from '@/contexts/firebase-auth-context';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { getServerCompanyBootstrap, getServerSeasonalConfig } from '@/lib/public-landing-data';
import { Metadata, Viewport } from 'next';

import { GoogleAdsScript } from '@/components/providers/google-ads-script';
import { WebMcpAgentTools } from '@/components/shared/webmcp-agent-tools';
import { NetworkStatusIndicator } from '@/components/shared/network-status-indicator';
import { PwaUpdateBanner } from '@/components/shared/pwa-update-banner';
import { SeasonalEffectsWebOverlay } from '@/components/shared/seasonal-effects-web-overlay';
import { AuthGuard } from '@/components/layout/auth-guard';

export const revalidate = 60; // Revalidate every 60 seconds

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  const bootstrap = await getServerCompanyBootstrap();
  const defaultIcon = '/icon-512x512.png?v=2';

  return {
    metadataBase: new URL('https://vatosalfa.com'),
    title: bootstrap.name,
    description: bootstrap.description,
    manifest: '/manifest.json?v=3',
    icons: {
      icon: [
        { url: '/icon-192x192.png?v=2', sizes: '192x192', type: 'image/png' },
        { url: defaultIcon, sizes: '512x512', type: 'image/png' },
        ...(bootstrap.icon_url ? [{ url: bootstrap.icon_url }] : []),
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [companyBootstrap, seasonalConfig] = await Promise.all([
    getServerCompanyBootstrap(),
    getServerSeasonalConfig(),
  ]);

  return (
    <html lang="es" className={inter.variable}>
      <head>
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" crossOrigin="anonymous" />
        <link rel="ai-catalog" href="/.well-known/ai-catalog.json" />
        <link rel="ard" href="/.well-known/ard.json" />
        <link rel="llms-txt" href="/llms.txt" type="text/markdown" />
      </head>
      <body>
        <GoogleAdsScript />
        <WebMcpAgentTools />
        <LocalProvider>
          <AuthProvider>
            <AuthGuard>
              <ThemeProvider initialTheme={companyBootstrap.theme}>
                <MercadoPagoProvider>
                  <NetworkStatusIndicator />
                  <PwaUpdateBanner />
                  <SeasonalEffectsWebOverlay initialConfig={seasonalConfig} />
                  {children}
                  <Toaster />
                </MercadoPagoProvider>
              </ThemeProvider>
            </AuthGuard>
          </AuthProvider>
        </LocalProvider>
      </body>
    </html>
  );
}
