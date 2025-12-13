'use client';

import React from 'react';
import Header from "@/components/layout/header";
import AppInitializer from "./app-initializer";
import { useAuth } from '@/contexts/firebase-auth-context';

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, loading } = useAuth();

  // 1. DEFENSA ZOMBIE: Si no hay usuario, NO renderizar layout ni initializers.
  // Esto previene que NewSaleSheet intente cargar 'terminales'/'clientes' sin permiso.
  if (loading) return null; // O un spinner si prefieres, pero el AuthContext ya maneja loading global
  if (!user) return null;

  return (
    <>
      <Header />
      <AppInitializer />
      <main className="pt-16 min-h-screen">
        {children}
      </main>
    </>
  )
}
