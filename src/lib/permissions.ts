
import { Shield, Store, ConciergeBell, Wrench } from 'lucide-react';

export interface Permission {
    access: boolean;
    label: string;
    permissionKey: string;
}

export interface RoleData {
    icon: React.ElementType;
    title: string;
    description: string;
    permissions: Permission[];
}

export const allPermissions = [
    // General
    { key: 'ver_agenda', label: 'Ver Agenda' },
    { key: 'ver_clientes', label: 'Ver Clientes' },
    { key: 'ver_ventas', label: 'Ver Ventas' },
    { key: 'ver_productos', label: 'Ver Productos' },
    { key: 'ver_reportes', label: 'Ver Reportes' },
    { key: 'ver_finanzas', label: 'Ver Finanzas' },
    { key: 'ver_administracion', label: 'Ver Administración' },
    { key: 'ver_configuracion', label: 'Ver Configuración' },

    // Actions
    { key: 'crear_reservas', label: 'Crear/Editar Reservas' },
    { key: 'bloquear_horarios', label: 'Bloquear Horarios' },
    { key: 'registrar_ventas', label: 'Registrar Ventas' },
    { key: 'ver_conversaciones', label: 'Ver Conversaciones de WhatsApp' },

    // Admin
    { key: 'ver_locales', label: 'Ver y Editar Locales' },
    { key: 'ver_profesionales', label: 'Ver y Editar Profesionales' },
    { key: 'ver_servicios', label: 'Ver y Editar Servicios' },
    { key: 'ver_whatsapp', label: 'Ver y Editar Config. WhatsApp' },
    { key: 'ver_comisiones', label: 'Ver y Editar Comisiones' },
    { key: 'ver_emails', label: 'Ver y Editar Emails' },
    { key: 'ver_integraciones', label: 'Ver Integraciones' },
    { key: 'ver_codigos_autorizacion', label: 'Ver y Editar Códigos de Autorización' },
    { key: 'ver_school', label: 'Ver Vatos Alfa School' },
    { key: 'ver_configuracion_usuarios', label: 'Ver y Editar Usuarios y Permisos' },

    // Settings
    { key: 'ver_configuracion_empresa', label: 'Ver y Editar Config. Empresa' },
    { key: 'ver_configuracion_sitio_web', label: 'Ver y Editar Config. Sitio Web' },
    { key: 'ver_configuracion_agenda', label: 'Ver y Editar Config. Agenda' },
    { key: 'ver_configuracion_pagos', label: 'Ver y Editar Config. Pagos' },
    { key: 'ver_configuracion_caja', label: 'Ver y Editar Config. Caja' },
    { key: 'ver_configuracion_recordatorios', label: 'Ver y Editar Config. Recordatorios' },
    { key: 'ver_configuracion_clientes', label: 'Ver y Editar Config. Clientes' },
    { key: 'ver_perfil', label: 'Ver y Editar Mi Perfil' },

    // Sales Sub-menu
    { key: 'ver_ventas_facturadas', label: 'Ver Ventas Facturadas' },
    { key: 'ver_reporte_comisiones', label: 'Ver Reporte de Comisiones' },
    { key: 'ver_caja', label: 'Ver Caja de Ventas' },
    { key: 'ver_propinas', label: 'Ver Propinas' },
    
    // Products Sub-menu
    { key: 'ver_inventario', label: 'Ver Inventario' },
    { key: 'ver_venta_productos', label: 'Ver Venta de Productos' },
    
    // Reports Sub-menu
    { key: 'ver_reporte_reservas', label: 'Ver Reporte de Reservas' },
    { key: 'ver_reporte_ventas', label: 'Ver Reporte de Ventas' },
    { key: 'ver_cierres_caja', label: 'Ver Cierres de Caja' },
];

const permissionAccess = (keys: string[]): Permission[] => {
    return allPermissions.map(p => ({
        access: keys.includes(p.key),
        label: p.label,
        permissionKey: p.key
    }));
};

const adminGeneralPermissions = allPermissions.map(p => p.key);

const adminLocalPermissions = permissionAccess([
    'ver_agenda', 'ver_clientes', 'ver_ventas', 'ver_productos', 'ver_reportes', 'ver_finanzas', 
    'ver_administracion', 'ver_configuracion', 'crear_reservas', 'bloquear_horarios', 
    'registrar_ventas', 'ver_conversaciones', 'ver_locales', 'ver_profesionales', 'ver_servicios', 
    'ver_whatsapp', 'ver_comisiones', 'ver_emails', 'ver_integraciones', 'ver_codigos_autorizacion', 
    'ver_school', 'ver_configuracion_empresa', 'ver_configuracion_sitio_web', 'ver_configuracion_agenda', 
    'ver_configuracion_pagos', 'ver_configuracion_caja', 'ver_configuracion_recordatorios', 
    'ver_configuracion_clientes', 'ver_perfil', 'ver_ventas_facturadas', 'ver_reporte_comisiones', 'ver_caja',
    'ver_propinas', 'ver_inventario', 'ver_venta_productos', 'ver_reporte_reservas', 'ver_reporte_ventas',
    'ver_cierres_caja'
]);

const recepcionistaPermissions = permissionAccess([
    'ver_agenda', 'ver_clientes', 'ver_ventas', 'ver_productos', 'crear_reservas', 'bloquear_horarios', 
    'registrar_ventas', 'ver_caja', 'ver_conversaciones', 'ver_perfil', 'ver_ventas_facturadas', 
    'ver_reporte_comisiones', 'ver_propinas', 'ver_inventario', 'ver_venta_productos'
]);

const recepcionistaSinEdicionPermissions = permissionAccess([
    'ver_agenda', 'ver_clientes', 'ver_ventas', 'ver_caja', 'ver_conversaciones', 'ver_perfil'
]);

const staffPermissions = permissionAccess([
    'ver_agenda', 'crear_reservas', 'bloquear_horarios', 'ver_perfil'
]);

const staffSinEdicionPermissions = permissionAccess([
    'ver_agenda', 'ver_perfil'
]);

export const rolesData: RoleData[] = [
  {
    icon: Shield,
    title: 'Administrador general',
    description: 'El dueño del negocio. Tiene acceso a toda la información de todos los locales.',
    permissions: permissionAccess(adminGeneralPermissions)
  },
  {
    icon: Store,
    title: 'Administrador local',
    description: 'El encargado de un local. Tiene acceso a toda la información de su local asignado.',
    permissions: adminLocalPermissions
  },
  {
    icon: ConciergeBell,
    title: 'Recepcionista',
    description: 'Ayuda en la gestión del local. Puede editar la agenda, caja y clientes.',
    permissions: recepcionistaPermissions
  },
   {
    icon: ConciergeBell,
    title: 'Recepcionista (Sin edición)',
    description: 'Solo puede ver la agenda, caja y clientes, pero no puede editar nada.',
    permissions: recepcionistaSinEdicionPermissions
  },
  {
    icon: Wrench,
    title: 'Staff',
    description: 'El profesional que realiza los servicios. Puede ver su agenda y editarla.',
    permissions: staffPermissions
  },
  {
    icon: Wrench,
    title: 'Staff (Sin edición)',
    description: 'Solo puede ver su agenda, pero no puede editar nada.',
    permissions: staffSinEdicionPermissions
  },
];


export const rolePermissionsMap: Record<string, string[]> = {
    'Administrador general': adminGeneralPermissions,
    'Administrador local': adminLocalPermissions.filter(p => p.access).map(p => p.permissionKey),
    'Recepcionista': recepcionistaPermissions.filter(p => p.access).map(p => p.permissionKey),
    'Recepcionista (Sin edición)': recepcionistaSinEdicionPermissions.filter(p => p.access).map(p => p.permissionKey),
    'Staff': staffPermissions.filter(p => p.access).map(p => p.permissionKey),
    'Staff (Sin edición)': staffSinEdicionPermissions.filter(p => p.access).map(p => p.permissionKey),
};
