
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
  try {
    const db = getDb();
    const docRef = await db.collection('empresa').doc('main').get();
    const data = docRef.data();

    if (data?.icon_url) {
      return {
        title: data.name || 'VATOS ALFA',
        description: data.description || 'Agenda tu cita con los mejores profesionales.',
        icons: {
          icon: data.icon_url,
          apple: data.icon_url,
        }
      };
    }
  } catch (error) {
    console.error('Error fetching metadata:', error);
  }

  return {
    title: 'VATOS ALFA - Barber Shop',
    description: 'Agenda tu cita con los mejores profesionales.',
    icons: {
      icon: '/logo-vatos-alfa.png',
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
