
import { Shield, Store, ConciergeBell, Wrench, Package, BarChart2, Briefcase, HandCoins, Users, Calendar, Banknote, FileText, Settings, LucideIcon } from 'lucide-react';


export interface Permission {
    key: string;
    label: string;
}

export interface PermissionCategory {
    title: string;
    icon: LucideIcon;
    permissions: Permission[];
    subCategories?: PermissionCategory[];
}

export const allPermissionCategories: PermissionCategory[] = [
    { 
        title: 'Agenda',
        icon: Calendar,
        permissions: [
            { key: 'ver_agenda', label: 'Ver Agenda' },
            { key: 'crear_reservas', label: 'Crear/Editar Reservas' },
            { key: 'bloquear_horarios', label: 'Bloquear Horarios' },
        ]
    },
    { 
        title: 'Clientes',
        icon: Users,
        permissions: [
            { key: 'ver_clientes', label: 'Ver Clientes' },
        ]
    },
    {
        title: 'Ventas',
        icon: HandCoins,
        permissions: [],
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
        permissions: [],
        subCategories: [
            { title: 'Inventario', icon: Package, permissions: [{ key: 'ver_inventario', label: 'Ver Inventario' }] },
            { title: 'Venta de productos', icon: BarChart2, permissions: [{ key: 'ver_venta_productos', label: 'Ver Venta de Productos' }] },
        ]
    },
    {
        title: 'Reportes',
        icon: BarChart2,
        permissions: [],
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

const permissionAccess = (keys: string[]): Permission[] => {
    return allPermissions.filter(p => keys.includes(p.key));
};

export const rolePermissionsMap: Record<string, string[]> = {
    'Administrador general': allPermissions.map(p => p.key),
    'Administrador local': [
        'ver_agenda', 'crear_reservas', 'bloquear_horarios', 
        'ver_clientes', 
        'ver_ventas_facturadas', 'ver_reporte_comisiones', 'ver_caja', 'ver_propinas',
        'ver_inventario', 'ver_venta_productos',
        'ver_reporte_reservas', 'ver_reporte_ventas', 'ver_cierres_caja',
        'ver_finanzas',
        'ver_administracion',
        'ver_conversaciones',
        // Implicit additional permissions below
        'registrar_ventas', 'ver_configuracion', 'ver_locales', 'ver_profesionales', 'ver_servicios', 
        'ver_whatsapp', 'ver_comisiones', 'ver_emails', 'ver_integraciones', 'ver_codigos_autorizacion', 
        'ver_school', 'ver_configuracion_usuarios', 'ver_configuracion_empresa', 'ver_configuracion_sitio_web', 
        'ver_configuracion_agenda', 'ver_configuracion_pagos', 'ver_configuracion_caja', 
        'ver_configuracion_recordatorios', 'ver_configuracion_clientes', 'ver_perfil'
    ],
    'Recepcionista': [
        'ver_agenda', 'crear_reservas', 'bloquear_horarios',
        'ver_clientes',
        'ver_ventas_facturadas', 'ver_caja', 'ver_propinas',
        'ver_inventario',
        'ver_conversaciones',
        'registrar_ventas', 'ver_perfil'
    ],
    'Recepcionista (Sin edición)': [
        'ver_agenda',
        'ver_clientes',
        'ver_caja',
        'ver_conversaciones',
        'ver_perfil'
    ],
    'Staff': [
        'ver_agenda', 'crear_reservas', 'bloquear_horarios', 'ver_perfil'
    ],
    'Staff (Sin edición)': [
        'ver_agenda', 'ver_perfil'
    ],
};

export interface RoleUIData {
    icon: React.ElementType;
    title: string;
    description: string;
    permissions: string[];
}

export const rolesData: RoleUIData[] = [
  {
    icon: Shield,
    title: 'Administrador general',
    description: 'El dueño del negocio. Tiene acceso a toda la información de todos los locales.',
    permissions: rolePermissionsMap['Administrador general']
  },
  {
    icon: Store,
    title: 'Administrador local',
    description: 'El encargado de un local. Tiene acceso a toda la información de su local asignado.',
    permissions: rolePermissionsMap['Administrador local']
  },
  {
    icon: ConciergeBell,
    title: 'Recepcionista',
    description: 'Ayuda en la gestión del local. Puede editar la agenda, caja y clientes.',
    permissions: rolePermissionsMap['Recepcionista']
  },
   {
    icon: ConciergeBell,
    title: 'Recepcionista (Sin edición)',
    description: 'Solo puede ver la agenda, caja y clientes, pero no puede editar nada.',
    permissions: rolePermissionsMap['Recepcionista (Sin edición)']
  },
  {
    icon: Wrench,
    title: 'Staff',
    description: 'El profesional que realiza los servicios. Puede ver su agenda y editarla.',
    permissions: rolePermissionsMap['Staff']
  },
  {
    icon: Wrench,
    title: 'Staff (Sin edición)',
    description: 'Solo puede ver su agenda, pero no puede editar nada.',
    permissions: rolePermissionsMap['Staff (Sin edición)']
  },
];
