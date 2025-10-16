'use client';

import Header from "@/components/layout/header";
import { useAuth } from "@/contexts/firebase-auth-context";
import { Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
    const { loading } = useAuth();
    const pathname = usePathname();
    const isPublicPage = pathname.startsWith('/book');
    const isAuthPage = pathname === '/';

    if (loading && !isAuthPage && !isPublicPage) {
        return (
            <div className="flex justify-center items-center h-screen bg-muted/40">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
  
  return (
    <>
      <Header />
      <div className="pt-16 h-screen overflow-y-auto">
        {children}
      </div>
    </>
  )
}
