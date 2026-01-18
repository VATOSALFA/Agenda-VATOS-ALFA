
import type { ReactNode } from 'react';
import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import { MercadoPagoProvider } from '@/components/sales/mercado-pago-provider';
import { LocalProvider } from '@/contexts/local-context';
import { AuthProvider } from '@/contexts/firebase-auth-context';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { getDb } from '@/lib/firebase-server';
import { Metadata } from 'next';
import { RecaptchaProvider } from '@/components/providers/google-recaptcha-provider';

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
    const docRef = await db.collection('empresa').doc('main').get();

    if (docRef.exists) {
      const data = docRef.data();
      if (data) {
        if (data.name) title = data.name;
        if (data.description) description = data.description;
        if (data.icon_url) icon = data.icon_url;
      }
    }
  } catch (error) {
    // Log error but don't crash, fallback to defaults
    console.warn('Metadata fetch failed (using default):', error);
  }

  return {
    title: title,
    description: description,
    icons: {
      icon: icon,
      apple: icon,
    }
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        <LocalProvider>
          <ThemeProvider>
            <AuthProvider>
              <MercadoPagoProvider>
                <RecaptchaProvider>
                  {children}
                  <Toaster />
                </RecaptchaProvider>
              </MercadoPagoProvider>
            </AuthProvider>
          </ThemeProvider>
        </LocalProvider>
      </body>
    </html>
  );
}
