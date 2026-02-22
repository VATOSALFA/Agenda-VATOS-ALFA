
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
import { NetworkStatusIndicator } from '@/components/shared/network-status-indicator';

export const revalidate = 60; // Revalidate every 60 seconds

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export async function generateMetadata(): Promise<Metadata> {
  const defaultTitle = 'VATOS ALFA - Barber Shop';
  const defaultDesc = 'Agenda tu cita con los mejores profesionales.';
  const defaultIcon = '/logo-vatos-alfa.png';

  let title = defaultTitle;
  let description = defaultDesc;
  let icon = defaultIcon;

  try {
    const db = getDb();
    const snapshot = await db.collection('empresa').limit(1).get();

    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      if (data) {
        if (data.name) title = data.name;
        if (data.description) description = data.description;
        if (data.icon_url) icon = data.icon_url;
      }
    }
  } catch (error) {
    console.warn('Metadata fetch failed (using default):', error);
  }

  return {
    title: title,
    description: description,
    manifest: '/manifest.json',
    icons: {
      icon: icon,
      apple: icon,
    }
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#000000',
};

import { AuthGuard } from '@/components/layout/auth-guard';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        <LocalProvider>
          <AuthProvider>
            <AuthGuard>
              <ThemeProvider>
                <MercadoPagoProvider>
                  <RecaptchaProvider>
                    <NetworkStatusIndicator />
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
