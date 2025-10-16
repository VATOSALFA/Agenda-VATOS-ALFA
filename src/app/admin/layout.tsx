
'use client';

import { SidebarNav } from "@/components/layout/sidebar-nav";

const adminNavItems = [
    {
      title: "Profesionales",
      href: "/admin/profesionales",
    },
    {
      title: "Servicios",
      href: "/admin/servicios",
    },
    {
      title: "Locales",
      href: "/admin/locales",
    },
    {
      title: "Comisiones",
      href: "/admin/comisiones",
    },
     {
      title: "Conversaciones",
      href: "/admin/conversations",
    },
    {
      title: "Integraciones",
      href: "/admin/integrations",
    },
     {
      title: "WhatsApp",
      href: "/admin/whatsapp",
    },
    {
      title: "Códigos de autorización",
      href: "/admin/auth-codes",
    },
     {
      title: "Emails",
      href: "/admin/emails",
    },
    {
        title: "Usuarios y Permisos",
        href: "/admin/users",
    }
];

interface AdminLayoutProps {
  children: React.ReactNode
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 space-y-8 py-10">
        <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
            <aside className="-mx-4 lg:w-1/5">
                <SidebarNav items={adminNavItems} />
            </aside>
            <div className="flex-1">{children}</div>
        </div>
    </div>
  )
}
