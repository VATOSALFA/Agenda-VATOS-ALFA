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
  PartyPopper,
  Image as ImageIcon,
  MessageSquareWarning,
  BarChart3,
  SlidersHorizontal,
  Bell,
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
  { title: "Garantías", href: "/settings/garantias", icon: ShieldCheck },
  {
    title: "Asistente Janeth",
    href: "/settings/sofia",
    icon: Bot,
    children: [
      { title: "Janeth Clientes", href: "/settings/sofia?tab=clientes", icon: Users },
      { title: "Janeth Administradora", href: "/settings/sofia?tab=administradora", icon: SlidersHorizontal },
      { title: "Janeth CEO", href: "/settings/sofia?tab=ceo", icon: Sparkles },
    ],
  },
  { title: "Pagos", href: "/settings/pagos", icon: CreditCard },
  { title: "Emails", href: "/settings/emails", icon: Mail },
  { title: "Clientes", href: "/settings/clients-settings", icon: Users },
  { title: "Usuarios", href: "/settings/users", icon: ShieldCheck },
  { title: "Códigos Maestros", href: "/settings/auth-codes", icon: KeyRound },
  { title: "Promociones", href: "/settings/promotions", icon: Tag },
  {
    title: "App Móvil",
    href: "/settings/mobile-app",
    icon: Smartphone,
    children: [
      { title: "Pase Alfa", href: "/settings/mobile-app?tab=pase_alfa", icon: Sparkles },
      { title: "Uso & Tiendas", href: "/settings/mobile-app?tab=metricas", icon: BarChart3 },
    ],
  },
  { title: "Galería", href: "/settings/galeria", icon: ImageIcon },
  { title: "Temporadas", href: "/settings/temporadas", icon: PartyPopper },
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


