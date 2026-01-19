"use client";

import { SidebarNav } from "@/components/layout/sidebar-nav";
import { useAuth } from "@/contexts/firebase-auth-context";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { CustomLoader } from "@/components/ui/custom-loader";

interface SettingsLayoutProps {
  children: React.ReactNode;
}

const sidebarNavItems = [
  { title: "Empresa", href: "/settings/empresa" },
  { title: "Locales", href: "/settings/locales" },
  { title: "Sitio Web", href: "/settings/sitio-web" },
  { title: "Agenda", href: "/settings/agenda" },
  { title: "Pagos", href: "/settings/pagos" },

  { title: "Emails", href: "/settings/emails" },
  { title: "Clientes", href: "/settings/clients-settings" },
  { title: "Usuarios", href: "/settings/users" },
  { title: "Códigos de autorización", href: "/settings/auth-codes" },
];


export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isGeneralAdmin = user?.role === 'Administrador general';

  useEffect(() => {
    if (!loading && user && !isGeneralAdmin) {
      if (pathname !== '/settings/profile') {
        router.replace('/settings/profile');
      }
    }
  }, [user, loading, isGeneralAdmin, pathname, router]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <CustomLoader size={60} />
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-full">
      {isGeneralAdmin && (
        <aside className="w-full md:w-1/5 md:border-r p-4 md:p-6">
          <h2 className="mb-4 text-lg font-semibold tracking-tight">
            CONFIGURACIÓN
          </h2>
          <SidebarNav items={sidebarNavItems} />
        </aside>
      )}
      <main className="flex-1 p-4 md:p-8 pt-6 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

