
'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Settings,
  Globe,
  Calendar,
  Wallet,
  Bell,
  Mail,
  Users,
  Lock,
} from 'lucide-react';
import Link from 'next/link';

interface SettingsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const settingsLinks = [
  { href: '/admin/empresa', icon: Settings, title: 'Empresa', description: 'Datos y personalización de tu negocio.' },
  { href: '/admin/integrations', icon: Globe, title: 'Sitio Web', description: 'Configura tu sitio de agendamiento.' },
  { href: '/settings/agenda', icon: Calendar, title: 'Agenda', description: 'Comportamiento de reservas y agenda.' },
  { href: '/settings/sistema-caja', icon: Wallet, title: 'Sistema de caja', description: 'Opciones de pago y facturación.' },
  { href: '/settings/recordatorios', icon: Bell, title: 'Recordatorios', description: 'Notificaciones automáticas para clientes.' },
  { href: '/settings/pagos', icon: Wallet, title: 'Pagos de Agenda VATOS ALFA', description: 'Gestiona pagos en línea y comisiones.' },
  { href: '/admin/emails', icon: Mail, title: 'Emails', description: 'Configura remitentes, firmas y plantillas.' },
  { href: '/settings/clients-settings', icon: Users, title: 'Clientes', description: 'Ajustes de la base de datos de clientes.' },
  { href: '/admin/auth-codes', icon: Lock, title: 'Códigos de autorización', description: 'Gestiona códigos de seguridad.' },
];

export function SettingsModal({ isOpen, onOpenChange }: SettingsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Settings className="h-6 w-6" />
            Configuración General
          </DialogTitle>
          <DialogDescription>
            Accede a todas las configuraciones y personalizaciones de tu sistema desde aquí.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto">
          {settingsLinks.map((link) => (
            <Link href={link.href} key={link.href} passHref>
              <div 
                className="p-4 border rounded-lg hover:bg-muted/50 hover:border-primary transition-all cursor-pointer h-full flex flex-col"
                onClick={() => onOpenChange(false)}
              >
                <div className="flex items-center gap-3 mb-2">
                    <link.icon className="h-5 w-5 text-primary" />
                    <h4 className="font-semibold">{link.title}</h4>
                </div>
                <p className="text-sm text-muted-foreground flex-grow">{link.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
