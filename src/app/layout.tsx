
'use client';

import type { ReactNode } from 'react';
import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import MainLayout from '@/components/layout/main-layout';
import { AuthProvider } from '@/contexts/firebase-auth-context';
import { LocalProvider } from '@/contexts/local-context';
import { FirebaseProvider } from '@/contexts/firebase-context';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        <FirebaseProvider>
          <AuthProvider>
            <LocalProvider>
              <MainLayout>{children}</MainLayout>
            </LocalProvider>
          </AuthProvider>
        </FirebaseProvider>
        <Toaster />
      </body>
    </html>
  );
}
