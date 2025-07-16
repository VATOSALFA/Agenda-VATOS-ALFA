
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Archive, ShoppingCart, History } from 'lucide-react';
import type { ReactNode } from 'react';

const productNavLinks = [
  { href: '/products', label: 'Inventario', icon: Archive },
  { href: '/products/sales', label: 'Venta de productos', icon: ShoppingCart },
  { href: '/products/stock-movement', label: 'Movimiento de stock', icon: History },
];

type Props = {
  children: ReactNode;
};

export default function ProductsLayout({ children }: Props) {
  const pathname = usePathname();

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <aside className="w-64 flex-shrink-0 bg-card border-r">
        <div className="p-4">
          <h2 className="text-xl font-bold tracking-tight mb-4">Productos</h2>
          <nav className="flex flex-col space-y-1">
            {productNavLinks.map(({ href, label, icon: Icon }) => (
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
          </nav>
        </div>
      </aside>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
