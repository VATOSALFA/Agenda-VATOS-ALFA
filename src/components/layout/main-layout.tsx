
'use client';

import type { ReactNode } from 'react';
import Header from './header';
import { usePathname } from 'next/navigation';

type Props = {
  children: ReactNode;
};

export default function MainLayout({ children }: Props) {
  const pathname = usePathname();

  // Don't render header on login page
  if (pathname === '/login') {
    return <main>{children}</main>;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow pt-16">{children}</main>
    </div>
  );
}
