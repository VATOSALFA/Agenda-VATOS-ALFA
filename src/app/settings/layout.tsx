
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import {
  Building2,
  Globe,
  Calendar,
  DollarSign,
  Calculator,
  Bell,
  Mail,
  Component,
  KeyRound,
  ChevronDown,
  UserCircle,
  Users
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
<<<<<<< HEAD
import { useAuth } from '@/contexts/firebase-auth-context';

const settingsLinks = [
  { href: '/settings/empresa', label: 'Empresa', icon: Building2, permission: 'ver_configuracion_empresa' },
  { href: '/settings/sitio-web', label: 'Sitio Web', icon: Globe, permission: 'ver_configuracion_sitio_web' },
  { href: '/settings/agenda', label: 'Agenda', icon: Calendar, permission: 'ver_configuracion_agenda' },
  { href: '/settings/pagos', label: 'Agenda VATOS ALFA', icon: DollarSign, permission: 'ver_configuracion_pagos' },
  { href: '/settings/sistema-caja', label: 'Sistemas de Caja', icon: Calculator, permission: 'ver_configuracion_caja' },
  { href: '/settings/recordatorios', label: 'Recordatorios', icon: Bell, permission: 'ver_configuracion_recordatorios' },
];

const advancedLinks = [
  { href: '/settings/emails', label: 'E-Mails', icon: Mail, permission: 'ver_configuracion_emails' },
  { href: '/settings/integrations', label: 'Integraciones', icon: Component, permission: 'ver_configuracion_integraciones' },
  { href: '/settings/clients-settings', label: 'Clientes', icon: Users, permission: 'ver_configuracion_clientes' },
  { href: '/settings/auth-codes', label: 'Códigos de Autorización', icon: KeyRound, permission: 'ver_codigos_autorizacion' },
];

const accountLinks = [
  { href: '/settings/profile', label: 'Mi perfil', icon: UserCircle, permission: 'ver_perfil' },
=======

const settingsLinks = [
  { href: '/settings/empresa', label: 'Empresa', icon: Building2 },
  { href: '/settings/sitio-web', label: 'Sitio Web', icon: Globe },
  { href: '/settings/agenda', label: 'Agenda', icon: Calendar },
  { href: '/settings/pagos', label: 'Agenda VATOS ALFA', icon: DollarSign },
  { href: '/settings/sistema-caja', label: 'Sistemas de Caja', icon: Calculator },
  { href: '/settings/recordatorios', label: 'Recordatorios', icon: Bell },
];

const advancedLinks = [
  { href: '/settings/emails', label: 'E-Mails', icon: Mail },
  { href: '/settings/integrations', label: 'Integraciones', icon: Component },
  { href: '/settings/clients-settings', label: 'Clientes', icon: Users },
  { href: '/settings/auth-codes', label: 'Códigos de Autorización', icon: KeyRound },
];

const accountLinks = [
  { href: '/settings/profile', label: 'Mi perfil', icon: UserCircle },
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
]

type Props = {
  children: ReactNode;
};

export default function SettingsLayout({ children }: Props) {
  const pathname = usePathname();
<<<<<<< HEAD
  const { user } = useAuth();
  
  const canSee = (permission: string) => {
    if (!user || !user.permissions) return false;
    if (user.role === 'Administrador general') return true;
    return user.permissions.includes(permission);
  }

=======
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
  const isUsersPage = pathname === '/settings/users';

  if (isUsersPage) {
    return (
        <div className="bg-muted/40">
            {children}
        </div>
    );
  }

<<<<<<< HEAD
=======

>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
  return (
    <div className="flex h-[calc(100vh-4rem)] bg-muted/40">
      <aside className="w-72 flex-shrink-0 border-r bg-background p-4">
        <nav className="flex flex-col space-y-4">
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex w-full justify-between items-center text-lg font-semibold px-3 py-2">
              Información básica
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 pt-2">
<<<<<<< HEAD
              {settingsLinks.map(({ href, label, icon: Icon, permission }) => (
                canSee(permission) && (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                      pathname === href && 'bg-muted text-primary'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                )
=======
              {settingsLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                    pathname === href && 'bg-muted text-primary'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
              ))}
            </CollapsibleContent>
          </Collapsible>
          
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex w-full justify-between items-center text-lg font-semibold px-3 py-2">
              Opciones avanzadas
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 pt-2">
<<<<<<< HEAD
              {advancedLinks.map(({ href, label, icon: Icon, permission }) => (
                canSee(permission) && (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                      pathname === href && 'bg-muted text-primary'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                )
=======
              {advancedLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                    pathname === href && 'bg-muted text-primary'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
              ))}
            </CollapsibleContent>
          </Collapsible>
          
           <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex w-full justify-between items-center text-lg font-semibold px-3 py-2">
              Cuenta
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 pt-2">
<<<<<<< HEAD
              {accountLinks.map(({ href, label, icon: Icon, permission }) => (
                canSee(permission) && (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                      pathname === href && 'bg-muted text-primary'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                )
              ))}
              {canSee('ver_usuarios_permisos') && (
=======
              {accountLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                    pathname === href && 'bg-muted text-primary'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
                 <Link
                  href={'/settings/users'}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                    pathname === '/settings/users' && 'bg-muted text-primary'
                  )}
                >
                  <Users className="h-4 w-4" />
                  Usuarios y permisos
                </Link>
<<<<<<< HEAD
              )}
=======
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
            </CollapsibleContent>
          </Collapsible>
        </nav>
      </aside>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
