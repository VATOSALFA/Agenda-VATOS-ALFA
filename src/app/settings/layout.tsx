'use client';

import Header from "@/components/layout/header";
import { SidebarNav } from "@/components/layout/sidebar-nav";

const settingsNavItems = [
    {
      title: "Mi perfil",
      href: "/settings/profile",
    },
    {
      title: "Empresa",
      href: "/settings/empresa",
    },
    {
      title: "Sitio Web",
      href: "/settings/sitio-web",
    },
     {
      title: "Pagos AgendaPro",
      href: "/settings/pagos",
    },
    {
      title: "Sistema de Caja",
      href: "/settings/sistema-caja",
    },
    {
      title: "Clientes",
      href: "/settings/clients-settings",
    },
    {
      title: "Comportamiento de reservas",
      href: "/settings/agenda",
    },
    {
      title: "Recordatorios",
      href: "/settings/recordatorios",
    },
     {
      title: "Diagnóstico",
      href: "/settings/diagnostico",
    }
];

interface SettingsLayoutProps {
  children: React.ReactNode
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  return (
    <>
      <Header />
      <div className="flex-1 pt-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 space-y-8 py-10">
            <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
                <aside className="-mx-4 lg:w-1/5">
                    <SidebarNav items={settingsNavItems} />
                </aside>
                <div className="flex-1">{children}</div>
            </div>
        </div>
      </div>
    </>
  )
}
