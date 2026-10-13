"use client";

import { SidebarNav } from "@/components/layout/sidebar-nav";
import { useAuth } from "@/contexts/firebase-auth-context";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { CustomLoader } from "@/components/ui/custom-loader";

import {
  Building2,
  Sparkles,
  MapPin,
  Globe,
  CalendarClock,
  Bot,
  CreditCard,
  Mail,
  Users,
  ShieldCheck,
  KeyRound,
  Tag,
  Smartphone,
} from "lucide-react";

interface SettingsLayoutProps {
  children: React.ReactNode;
}

const sidebarNavItems = [
  { title: "Empresa", href: "/settings/empresa", icon: Building2 },
  { title: "Funcionalidades Avanzadas", href: "/settings/features", icon: Sparkles },
  { title: "Locales", href: "/settings/locales", icon: MapPin },
  { title: "Sitio Web", href: "/settings/sitio-web", icon: Globe },
  { title: "Reglas de Reservas", href: "/settings/booking-rules", icon: CalendarClock },
  { title: "Asistente Janet", href: "/settings/sofia", icon: Bot },
  { title: "Pagos", href: "/settings/pagos", icon: CreditCard },
  { title: "Emails", href: "/settings/emails", icon: Mail },
  { title: "Clientes", href: "/settings/clients-settings", icon: Users },
  { title: "Usuarios", href: "/settings/users", icon: ShieldCheck },
  { title: "Códigos de autorización", href: "/settings/auth-codes", icon: KeyRound },
  { title: "Promociones", href: "/settings/promotions", icon: Tag },
  { title: "App Móvil", href: "/settings/mobile-app", icon: Smartphone },
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


