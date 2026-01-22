
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

export const revalidate = 60; // Revalidate every 60 seconds

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export async function generateMetadata(): Promise<Metadata> {
  const defaultTitle = 'VATOS ALFA - Barber Shop';
  const defaultDesc = 'Agenda tu cita con los mejores profesionales.';
  const defaultIcon = '/logo-vatos-alfa.png';

  // Using static metadata for stability and performance
  return {
    title: defaultTitle,
    description: defaultDesc,
    icons: {
      icon: defaultIcon,
      apple: defaultIcon,
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
