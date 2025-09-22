<<<<<<< HEAD
import type { Metadata } from 'next';
import './globals.css';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import MainLayout from '@/components/layout/main-layout';
import { LocalProvider } from '@/contexts/local-context';
import { AuthProvider } from '@/contexts/firebase-auth-context';

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
        <AuthProvider>
          <LocalProvider>
            <MainLayout>{children}</MainLayout>
          </LocalProvider>
        </AuthProvider>
=======
// src/app/layout.tsx  (server component)

import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";

import { Toaster } from "@/components/ui/toaster";
import MainLayout from "@/components/layout/main-layout";

import { LocalProvider } from "@/contexts/local-context";
import { AuthProvider } from "@/contexts/firebase-auth-context";

// 👇 este es el wrapper que espera a que Auth esté listo
import AuthRoot from "@/components/providers/auth-root";

export const metadata: Metadata = {
  title: "Alfa Manager",
  description: "Barbershop management dashboard for VATOS ALFA.",
};

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        {/* Primero inicializamos Firebase Auth en un provider */}
        <AuthProvider>
          {/* Tu contexto local */}
          <LocalProvider>
            {/* Bloquea el render de la app hasta que Auth esté listo */}
            <AuthRoot>
              <MainLayout>{children}</MainLayout>
            </AuthRoot>
          </LocalProvider>
        </AuthProvider>

        {/* Toaster global */}
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
        <Toaster />
      </body>
    </html>
  );
}
