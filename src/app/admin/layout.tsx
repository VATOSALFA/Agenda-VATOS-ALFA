
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
  Settings,
  MessagesSquare
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/contexts/firebase-auth-context';

const adminLinks = [
  { href: '/admin/locales', label: 'Locales', icon: Store },
  { href: '/admin/profesionales', label: 'Profesionales', icon: Users },
  { href: '/admin/servicios', label: 'Servicios', icon: Scissors },
  { href: '/admin/whatsapp', label: 'Whatsapp', icon: MessageCircle },
  { href: '/admin/conversations', label: 'Conversaciones', icon: MessagesSquare },
  { href: '/admin/comisiones', label: 'Comisiones', icon: Percent },
];

const advancedLinks = [
  { href: '/admin/emails', label: 'E-Mails', icon: Mail },
  { href: '/admin/integrations', label: 'Integraciones', icon: Component },
  { href: '/admin/auth-codes', label: 'Códigos de Autorización', icon: KeyRound },
  { href: '/admin/school', label: 'Vatos Alfa School', icon: School },
]

type Props = {
  children: ReactNode;
};

export default function AdminLayout({ children }: Props) {
  const pathname = usePathname();
  const { user } = useAuth();
  
  const canSeeConfiguracion = user?.role === 'Administrador general';

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
              {adminLinks.map(({ href, label, icon: Icon }) => (
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
              Avanzado
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
          {canSeeConfiguracion && (
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
