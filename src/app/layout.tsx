
import type { ReactNode } from 'react';
import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/contexts/firebase-auth-context';
import { LocalProvider } from '@/contexts/local-context';
import Header from '@/components/layout/header';
import AppInitializer from '@/components/layout/app-initializer';


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
                <AppInitializer>
                    {children}
                </AppInitializer>
            </LocalProvider>
          </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
