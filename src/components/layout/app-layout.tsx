'use client';

import Header from "@/components/layout/header";
import AppInitializer from "./app-initializer";

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  // Este layout ahora envuelve el contenido de las páginas autenticadas
  return (
    <>
      <Header />
      <AppInitializer />
      <main className="pt-16 h-screen overflow-y-auto">
        {children}
      </main>
    </>
  )
}
