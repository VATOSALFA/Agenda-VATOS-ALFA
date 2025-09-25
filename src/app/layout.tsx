
import type { Metadata } from 'next';
import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import MainLayout from '@/components/layout/main-layout';
import { LocalProvider } from '@/contexts/local-context';
import { AuthProvider } from '@/contexts/firebase-auth-context';
import { auth, db, storage } from '@/lib/firebase';

export const dynamic = 'force-dynamic';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Alfa Manager',
  description: 'Barbershop management dashboard for VATOS ALFA.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        <AuthProvider authInstance={auth} dbInstance={db} storageInstance={storage}>
          <LocalProvider>
            <MainLayout>
              {children}
            </MainLayout>
          </LocalProvider>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
