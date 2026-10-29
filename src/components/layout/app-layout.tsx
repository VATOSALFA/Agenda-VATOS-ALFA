'use client';

import React from 'react';
import Header from "@/components/layout/header";
import AppInitializer from "./app-initializer";
import { JanetFloatingAssistant } from "@/components/ai/janet-floating-assistant";
import { useAuth } from '@/contexts/firebase-auth-context';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  // 1. DEFENSA ZOMBIE: Si no hay usuario, NO renderizar layout ni initializers.
  // Esto previene que NewSaleSheet intente cargar 'terminales'/'clientes' sin permiso.
  if (loading) return null; // O un spinner si prefieres, pero el AuthContext ya maneja loading global
  if (!user) return null;

  const isFullscreenPage = pathname === '/agenda/display';

  if (isFullscreenPage) {
    return <main className="min-h-screen">{children}</main>;
  }

  const isAgenda = pathname?.startsWith('/agenda');
  const mainBottomPadding = isAgenda ? 'pb-20 md:pb-0' : 'pb-24 md:pb-16';

  return (
    <>
      <Header />
      <AppInitializer />
      <main className={cn("pt-16 min-h-screen", mainBottomPadding)}>
        {children}
      </main>
      <JanetFloatingAssistant />
    </>
  )
}
