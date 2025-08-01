import type { Metadata } from 'next';
import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import MainLayout from '@/components/layout/main-layout';
import { LocalProvider } from '@/contexts/local-context';

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
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <LocalProvider>
          <MainLayout>{children}</MainLayout>
        </LocalProvider>
        <Toaster />
      </body>
    </html>
  );
}
