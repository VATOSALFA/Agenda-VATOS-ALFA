import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Separator } from "@/components/ui/separator";

interface AdminLayoutProps {
  children: React.ReactNode;
}

const sidebarNavItems = [
    { title: "Profesionales", href: "/admin/profesionales" },
    { title: "Servicios", href: "/admin/servicios" },
    { title: "Locales", href: "/admin/locales" },
    { title: "Comisiones", href: "/admin/comisiones" },
    { title: "Whatsapp", href: "/admin/whatsapp" },
    { title: "Códigos de autorización", href: "/admin/auth-codes" },
    { title: "Emails", href: "/admin/emails" },
    { title: "Integraciones", href: "/admin/integrations" },
    { title: "Empresa", href: "/admin/empresa" },
    { title: "Usuarios y Permisos", href: "/admin/users" },
    { title: "Mi Perfil", href: "/admin/profile" },
];


export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="space-y-6 p-4 md:p-8 pt-6">
        <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
            <aside className="-mx-4 lg:w-1/5 lg:border-r lg:pr-8">
                <SidebarNav items={sidebarNavItems} />
            </aside>
            <div className="flex-1">{children}</div>
        </div>
    </div>
  );
}
