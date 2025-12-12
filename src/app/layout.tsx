import type { ReactNode } from 'react';
import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import { MercadoPagoProvider } from '@/components/sales/mercado-pago-provider';
import { LocalProvider } from '@/contexts/local-context';
import { AuthProvider } from '@/contexts/firebase-auth-context';
import AppLayout from '@/components/layout/app-layout';
import { FirebaseErrorListener } from '@/components/firebase/FirebaseErrorListener';
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
        <AuthProvider>
          <LocalProvider>
            <ThemeProvider>
              <MercadoPagoProvider>
                  {/* AppLayout ahora es manejado por AuthProvider */}
                  {children}
                  <Toaster />
                  <FirebaseErrorListener />
              </MercadoPagoProvider>
            </ThemeProvider>
          </LocalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
