'use client';

import Header from "@/components/layout/header";
import { AuthProvider } from "@/contexts/firebase-auth-context";

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <AuthProvider>
      <Header />
      {children}
    </AuthProvider>
  )
}
