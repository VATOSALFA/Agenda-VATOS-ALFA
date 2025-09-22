
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import {
  Users,
  Scissors,
  MessageCircle,
  Percent,
  ChevronDown,
  Mail,
  Component,
  KeyRound,
  Store,
  School,
<<<<<<< HEAD
  Settings,
  MessagesSquare
=======
  Settings
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/contexts/firebase-auth-context';

const adminLinks = [
<<<<<<< HEAD
  { href: '/admin/locales', label: 'Locales', icon: Store, permission: 'ver_locales' },
  { href: '/admin/profesionales', label: 'Profesionales', icon: Users, permission: 'ver_profesionales' },
  { href: '/admin/servicios', label: 'Servicios', icon: Scissors, permission: 'ver_servicios' },
  { href: '/admin/whatsapp', label: 'Whatsapp', icon: MessageCircle, permission: 'ver_whatsapp' },
  { href: '/admin/comisiones', label: 'Comisiones', icon: Percent, permission: 'ver_comisiones' },
];

const advancedLinks = [
  { href: '/admin/emails', label: 'E-Mails', icon: Mail, permission: 'ver_emails' },
  { href: '/admin/integrations', label: 'Integraciones', icon: Component, permission: 'ver_integraciones' },
  { href: '/admin/auth-codes', label: 'Códigos de Autorización', icon: KeyRound, permission: 'ver_codigos_autorizacion' },
  { href: '/admin/school', label: 'Vatos Alfa School', icon: School, permission: 'ver_school' },
=======
  { href: '/admin/locales', label: 'Locales', icon: Store },
  { href: '/admin/profesionales', label: 'Profesionales', icon: Users },
  { href: '/admin/servicios', label: 'Servicios', icon: Scissors },
  { href: '/admin/whatsapp', label: 'Whatsapp', icon: MessageCircle },
  { href: '/admin/comisiones', label: 'Comisiones', icon: Percent },
];

const advancedLinks = [
  { href: '/admin/emails', label: 'E-Mails', icon: Mail },
  { href: '/admin/integrations', label: 'Integraciones', icon: Component },
  { href: '/admin/auth-codes', label: 'Códigos de Autorización', icon: KeyRound },
  { href: '/admin/school', label: 'Vatos Alfa School', icon: School },
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
]

type Props = {
  children: ReactNode;
};

export default function AdminLayout({ children }: Props) {
  const pathname = usePathname();
  const { user } = useAuth();
  
<<<<<<< HEAD
  const canSee = (permission: string) => {
    if (!user || !user.permissions) return false;
    // Admin always has all permissions
    if (user.role === 'Administrador general') return true;
    return user.permissions.includes(permission);
  }

  // If the current page is the conversations page, render it without the admin sidebar and scrolling parent.
  if (pathname === '/admin/conversations') {
    return (
        <>
            {children}
        </>
    );
  }
=======
  const canSeeConfiguracion = user?.role === 'Administrador general';
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-muted/40">
      <aside className="w-72 flex-shrink-0 border-r bg-background p-4">
        <nav className="flex flex-col space-y-1">
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex w-full justify-between items-center text-lg font-semibold px-3 py-2">
              Informacion
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 pt-2">
<<<<<<< HEAD
              {adminLinks.map(({ href, label, icon: Icon, permission }) => (
                canSee(permission) && (
=======
              {adminLinks.map(({ href, label, icon: Icon }) => (
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
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
<<<<<<< HEAD
                )
=======
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
              ))}
            </CollapsibleContent>
          </Collapsible>
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex w-full justify-between items-center text-lg font-semibold px-3 py-2">
              Avanzado
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 pt-2">
<<<<<<< HEAD
              {advancedLinks.map(({ href, label, icon: Icon, permission }) => (
                canSee(permission) && (
=======
              {advancedLinks.map(({ href, label, icon: Icon }) => (
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
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
<<<<<<< HEAD
                )
              ))}
            </CollapsibleContent>
          </Collapsible>
          {canSee('ver_configuracion_usuarios') && (
=======
              ))}
            </CollapsibleContent>
          </Collapsible>
          {canSeeConfiguracion && (
>>>>>>> 3abc79918a551207d4bec74e7af2be2f37c3bc65
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex w-full justify-between items-center text-lg font-semibold px-3 py-2">
                Configuracion
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 pt-2">
                  <Link
                    href={'/settings/users'}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary',
                      pathname === '/settings/users' && 'bg-muted text-primary'
                    )}
                  >
                    <Settings className="h-4 w-4" />
                    Usuarios y permisos
                  </Link>
              </CollapsibleContent>
            </Collapsible>
          )}
        </nav>
      </aside>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
