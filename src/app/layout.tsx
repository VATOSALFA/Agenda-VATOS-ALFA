
'use client';

import type { ReactNode } from 'react';
import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import MainLayout from '@/components/layout/main-layout';
import { LocalProvider } from '@/contexts/local-context';
import { AuthProvider, useAuth } from '@/contexts/firebase-auth-context';
import { auth, db, storage } from '@/lib/firebase';
import { usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

function AppContent({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  const isAuthPage = pathname === '/login';
  const isPublicBookingPage = pathname.startsWith('/book');

  if (loading && !isAuthPage && !isPublicBookingPage) {
    return (
      <div className="flex justify-center items-center h-screen bg-muted/40">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // This prevents a flash of the main layout on protected pages before redirection
  if (!user && !isAuthPage && !isPublicBookingPage) {
    return (
        <div className="flex justify-center items-center h-screen bg-muted/40">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
  }

  return <MainLayout>{children}</MainLayout>;
}

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
            <AppContent>{children}</AppContent>
          </LocalProvider>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
