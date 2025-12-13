
import type { ReactNode } from 'react';
import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import { MercadoPagoProvider } from '@/components/sales/mercado-pago-provider';
import { LocalProvider } from '@/contexts/local-context';
import { AuthProvider } from '@/contexts/firebase-auth-context';
import { ThemeProvider } from '@/components/layout/theme-provider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

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
                {children}
                <Toaster />
              </MercadoPagoProvider>
            </AuthProvider>
          </ThemeProvider>
        </LocalProvider>
      </body>
    </html>
  );
}
