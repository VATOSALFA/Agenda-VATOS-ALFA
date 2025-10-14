
'use client';

import type { ReactNode } from 'react';
import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/firebase-auth-context';
import { LocalProvider } from '@/contexts/local-context';
import { MercadoPagoProvider } from '@/components/sales/mercado-pago-provider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
          <AuthProvider>
            <LocalProvider>
              <MercadoPagoProvider>
                {children}
              </MercadoPagoProvider>
            </LocalProvider>
          </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
