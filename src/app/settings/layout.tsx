
import { SidebarNav } from "@/components/layout/sidebar-nav";

interface SettingsLayoutProps {
  children: React.ReactNode;
}

const sidebarNavItems = [
    { title: "Empresa", href: "/settings/empresa" },
    { title: "Locales", href: "/admin/locales" },
    { title: "Sitio Web", href: "/settings/sitio-web" },
    { title: "Agenda", href: "/settings/agenda" },
    { title: "Sistema de caja", href: "/settings/sistema-caja" },
    { title: "Recordatorios", href: "/settings/recordatorios" },
    { title: "WhatsApp", href: "/settings/whatsapp" },
    { title: "Pagos", href: "/settings/pagos" },
    { title: "Emails", href: "/settings/emails" },
    { title: "Clientes", href: "/settings/clients-settings" },
    { title: "Usuarios", href: "/settings/users" },
    { title: "Códigos de autorización", href: "/settings/auth-codes" },
    { title: "Diagnóstico", href: "/settings/diagnostico" },
];


export default function SettingsLayout({ children }: SettingsLayoutProps) {
  return (
    <div className="flex flex-col md:flex-row h-full">
        <aside className="w-full md:w-1/5 md:border-r p-4 md:p-6">
            <h2 className="mb-4 text-lg font-semibold tracking-tight">
                CONFIGURACIÓN
            </h2>
            <SidebarNav items={sidebarNavItems} />
        </aside>
        <main className="flex-1 p-4 md:p-8 pt-6 overflow-y-auto">
            {children}
        </main>
    </div>
  );
}
