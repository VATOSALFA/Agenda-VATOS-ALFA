
'use client';

import Header from "@/components/layout/header";
import { useAuth } from "@/contexts/firebase-auth-context";
import { Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";
import AppInitializer from "./app-initializer";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Local } from "@/lib/types";
import Image from "next/image";
import Link from "next/link";


interface EmpresaSettings {
    receipt_logo_url?: string;
}


const FloatingLogo = () => {
    const { data: empresaData, loading: empresaLoading } = useFirestoreQuery<EmpresaSettings>('empresa');
    const logoUrl = empresaData?.[0]?.receipt_logo_url;

    if (empresaLoading || !logoUrl) {
        return null;
    }

    return (
        <Link href="/settings/empresa" passHref>
            <div className="fixed bottom-4 left-4 z-50 transition-transform hover:scale-110">
                <Image src={logoUrl} alt="Logo de la empresa" width={50} height={50} className="rounded-full shadow-lg border-2 border-white" />
            </div>
        </Link>
    )
}


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

    if (!user || isAuthPage || isPublicPage) {
        return <>{children}</>;
    }
  
  // This is the main layout for the authenticated app
  return (
    <>
      <Header />
      <AppInitializer />
      <FloatingLogo />
      <div className="pt-16 h-screen overflow-y-auto">
        {children}
      </div>
    </>
  )
}
