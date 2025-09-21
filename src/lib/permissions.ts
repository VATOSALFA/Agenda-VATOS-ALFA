
import { Shield, Store, ConciergeBell, Wrench, Package, BarChart2, Briefcase, HandCoins, Users, Calendar, Banknote, FileText, Settings, LucideIcon, MessageSquare } from 'lucide-react';


export interface Permission {
    key: string;
    label: string;
}

export interface PermissionSubCategory {
    title: string;
    icon: LucideIcon;
    permissions: Permission[];
}

export interface PermissionCategory {
    title: string;
    icon: LucideIcon;
    permissions: Permission[];
    subCategories?: PermissionSubCategory[];
}

export const allPermissionCategories: PermissionCategory[] = [
    { 
        title: 'Agenda',
        icon: Calendar,
        permissions: [
            { key: 'ver_agenda', label: 'Ver Agenda' },
            { key: 'crear_reservas', label: 'Crear/Editar Reservas' },
            { key: 'bloquear_horarios', label: 'Bloquear Horarios' },
        ],
    },
    { 
        title: 'Clientes',
        icon: Users,
        permissions: [
            { key: 'ver_clientes', label: 'Ver Clientes' },
        ],
    },
    {
        title: 'Ventas',
        icon: HandCoins,
        permissions: [ { key: 'ver_ventas', label: 'Ver Módulo de Ventas' } ],
        subCategories: [
            { title: 'Ventas Facturadas', icon: FileText, permissions: [{ key: 'ver_ventas_facturadas', label: 'Ver Ventas Facturadas' }] },
            { title: 'Reporte de Comisiones', icon: BarChart2, permissions: [{ key: 'ver_reporte_comisiones', label: 'Ver Reporte de Comisiones' }] },
            { title: 'Caja de Ventas', icon: Banknote, permissions: [{ key: 'ver_caja', label: 'Ver Caja de Ventas' }] },
            { title: 'Propinas', icon: HandCoins, permissions: [{ key: 'ver_propinas', label: 'Ver Propinas' }] },
        ]
    },
    {
        title: 'Productos',
        icon: Package,
        permissions: [ { key: 'ver_productos', label: 'Ver Módulo de Productos' } ],
        subCategories: [
            { title: 'Inventario', icon: Package, permissions: [{ key: 'ver_inventario', label: 'Ver Inventario' }] },
            { title: 'Venta de productos', icon: BarChart2, permissions: [{ key: 'ver_venta_productos', label: 'Ver Venta de Productos' }] },
        ]
    },
    {
        title: 'Reportes',
        icon: BarChart2,
        permissions: [ { key: 'ver_reportes', label: 'Ver Módulo de Reportes' } ],
        subCategories: [
            { title: 'Reporte de reservas', icon: FileText, permissions: [{ key: 'ver_reporte_reservas', label: 'Ver Reporte de Reservas' }] },
            { title: 'Reporte de ventas', icon: BarChart2, permissions: [{ key: 'ver_reporte_ventas', label: 'Ver Reporte de Ventas' }] },
            { title: 'Cierres de Caja', icon: Banknote, permissions: [{ key: 'ver_cierres_caja', label: 'Ver Cierres de Caja' }] },
        ]
    },
    {
        title: 'Finanzas',
        icon: Briefcase,
        permissions: [
            { key: 'ver_finanzas', label: 'Ver Finanzas' },
        ]
    },
    {
        title: 'Administración',
        icon: Settings,
        permissions: [
             { key: 'ver_administracion', label: 'Ver Administración' },
        ]
    },
     {
        title: 'Conversaciones',
        icon: MessageSquare,
        permissions: [
            { key: 'ver_conversaciones', label: 'Ver Conversaciones de WhatsApp' },
        ]
    },
];


export const allPermissions = allPermissionCategories.flatMap(cat => 
    cat.permissions.concat(cat.subCategories ? cat.subCategories.flatMap(sub => sub.permissions) : [])
);

// This data will now be stored and fetched from Firestore
export interface Role {
  id: string;
  title: string;
  description: string;
  permissions: string[];
}

// Icons remain mapped in code
export const roleIcons: Record<string, LucideIcon> = {
  'Administrador general': Shield,
  'Administrador local': Store,
  'Recepcionista': ConciergeBell,
  'Recepcionista (Sin edición)': ConciergeBell,
  'Staff': Wrench,
  'Staff (Sin edición)': Wrench,
};
