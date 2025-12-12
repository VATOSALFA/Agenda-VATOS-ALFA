'use client';

import Header from "@/components/layout/header";
import { useAuth } from "@/contexts/firebase-auth-context";
import { Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";
import AppInitializer from "./app-initializer";

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
    const { user, loading } = useAuth();
    const pathname = usePathname();
    
    // Pages that should not have the main app header
    const isPublicPage = pathname.startsWith('/book');
    const isAuthPage = pathname === '/';

    if (loading && !isAuthPage && !isPublicPage) {
        return (
            <div className="flex justify-center items-center h-screen bg-muted/40">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    // Unauthenticated or public view
    if (!user || isAuthPage || isPublicPage) {
        return <>{children}</>;
    }
  
  // This is the main layout for the authenticated app
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
