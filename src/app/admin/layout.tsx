
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
  { href: '/admin/profesionales', label: 'Profesionales', icon: Users, permission: 'ver_profesionales' },
  { href: '/admin/servicios', label: 'Servicios', icon: Scissors, permission: 'ver_servicios' },
  { href: '/admin/whatsapp', label: 'Whatsapp', icon: MessageCircle, permission: 'ver_whatsapp' },
  { href: '/admin/comisiones', label: 'Comisiones', icon: Percent, permission: 'ver_comisiones' },
];

const advancedLinks = [
  { href: '/admin/auth-codes', label: 'Códigos de Autorización', icon: KeyRound, permission: 'ver_codigos_autorizacion' },
]

type Props = {
  children: ReactNode;
};

export default function AdminLayout({ children }: Props) {
  const pathname = usePathname();
  const { user } = useAuth();
  
  const canSee = (permission: string) => {
    if (!user || !user.permissions) return false;
    // Admin always has all permissions
    if (user.role === 'Administrador general') return true;
    return user.permissions.includes(permission);
  }

  // The conversation page has its own layout, but we want the main app header.
  if (pathname === '/admin/conversations') {
    return (
        <div className="h-[calc(100vh-4rem)]">
            {children}
        </div>
    );
  }

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
              {adminLinks.map(({ href, label, icon: Icon, permission }) => (
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
            </CollapsibleContent>
          </Collapsible>
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex w-full justify-between items-center text-lg font-semibold px-3 py-2">
              Avanzado
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 pt-2">
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
              ))}
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
