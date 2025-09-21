
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
]

type Props = {
  children: ReactNode;
};

export default function SettingsLayout({ children }: Props) {
  const pathname = usePathname();
  const isUsersPage = pathname === '/settings/users';

  if (isUsersPage) {
    return (
        <div className="bg-muted/40">
            {children}
        </div>
    );
  }


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
              ))}
            </CollapsibleContent>
          </Collapsible>
          
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex w-full justify-between items-center text-lg font-semibold px-3 py-2">
              Opciones avanzadas
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 pt-2">
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
              ))}
            </CollapsibleContent>
          </Collapsible>
          
           <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex w-full justify-between items-center text-lg font-semibold px-3 py-2">
              Cuenta
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 pt-2">
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
