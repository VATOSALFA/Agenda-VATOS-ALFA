
import { Shield, Store, ConciergeBell, Wrench, Package, BarChart2, Briefcase, HandCoins, Users, Calendar, Banknote, FileText, Settings, LucideIcon, MessageSquare } from 'lucide-react';


export interface Permission {
    key: string;
    label: string;
}

export interface PermissionSubCategory {
    title: string;
    permissions: Permission[];
}

export interface PermissionCategory {
    title: string;
    icon: LucideIcon;
    permissions?: Permission[];
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
        subCategories: [
            { title: 'Ventas Facturadas', permissions: [{ key: 'ver_ventas_facturadas', label: 'Ver Ventas Facturadas' }] },
            { title: 'Reporte de Comisiones', permissions: [{ key: 'ver_reporte_comisiones', label: 'Ver Reporte de Comisiones' }] },
            { title: 'Caja de Ventas', permissions: [{ key: 'ver_caja', label: 'Ver Caja de Ventas' }] },
            { title: 'Propinas', permissions: [{ key: 'ver_propinas', label: 'Ver Propinas' }] },
        ]
    },
    {
        title: 'Productos',
        icon: Package,
        subCategories: [
            { title: 'Inventario', permissions: [{ key: 'ver_inventario', label: 'Ver Inventario' }] },
            { title: 'Venta de productos', permissions: [{ key: 'ver_venta_productos', label: 'Ver Venta de Productos' }] },
        ]
    },
    {
        title: 'Reportes',
        icon: BarChart2,
        subCategories: [
            { title: 'Reporte de reservas', permissions: [{ key: 'ver_reporte_reservas', label: 'Ver Reporte de Reservas' }] },
            { title: 'Reporte de ventas', permissions: [{ key: 'ver_reporte_ventas', label: 'Ver Reporte de Ventas' }] },
            { title: 'Cierres de Caja', permissions: [{ key: 'ver_cierres_caja', label: 'Ver Cierres de Caja' }] },
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

export const allPermissions = allPermissionCategories.flatMap(cat => {
    const mainPermissions = cat.permissions || [];
    const subPermissions = cat.subCategories ? cat.subCategories.flatMap(sub => sub.permissions) : [];
    return [...mainPermissions, ...subPermissions];
});


// This data will now be stored and fetched from Firestore, this is just the initial state.
export interface Role {
  id: string;
  title: string;
  description: string;
  permissions: string[];
}

export const initialRoles: Omit<Role, 'id'>[] = [
  {
    title: 'Administrador general',
    description: 'Acceso completo a todas las funcionalidades, configuraciones y datos de la plataforma.',
    permissions: allPermissions.map(p => p.key),
  },
  {
    title: 'Administrador local',
    description: 'Administra un local específico, gestionando profesionales, servicios y viendo reportes de su sucursal.',
    permissions: [
        'ver_agenda', 'crear_reservas', 'bloquear_horarios', 
        'ver_clientes', 
        'ver_ventas_facturadas', 'ver_reporte_comisiones', 'ver_caja', 'ver_propinas',
        'ver_inventario', 'ver_venta_productos',
        'ver_reporte_reservas', 'ver_reporte_ventas', 'ver_cierres_caja',
        'ver_finanzas',
        'ver_administracion',
        'ver_conversaciones'
    ],
  },
  {
    title: 'Recepcionista',
    description: 'Gestiona la agenda, reservas y clientes. Tiene acceso a la caja y a la creación de ventas.',
    permissions: ['ver_agenda', 'crear_reservas', 'ver_clientes', 'ver_caja'],
  },
  {
    title: 'Staff',
    description: 'Profesional que puede ver su propia agenda y gestionar sus citas.',
    permissions: ['ver_agenda'],
  }
];


// Icons remain mapped in code
export const roleIcons: Record<string, LucideIcon> = {
  'Administrador general': Shield,
  'Administrador local': Store,
  'Recepcionista': ConciergeBell,
  'Staff': Wrench,
};
