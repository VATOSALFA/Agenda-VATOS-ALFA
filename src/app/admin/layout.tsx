
import { SidebarNav } from "@/components/layout/sidebar-nav";

interface AdminLayoutProps {
  children: React.ReactNode;
}

const sidebarNavItems = [
    { title: "Profesionales", href: "/admin/profesionales" },
    { title: "Servicios", href: "/admin/servicios" },
    { title: "Comisiones", href: "/admin/comisiones" },
];


export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="flex flex-col md:flex-row h-full">
        <aside className="w-full md:w-1/5 md:border-r p-4 md:p-6">
            <SidebarNav items={sidebarNavItems} />
        </aside>
        <main className="flex-1 p-4 md:p-8 pt-6 overflow-y-auto">
            {children}
        </main>
    </div>
  );
}
