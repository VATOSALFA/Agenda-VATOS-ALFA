
'use client';

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

export default function ProductsLayout({ children }: Props) {
  return (
    <div className="flex-1 overflow-y-auto">
      {children}
    </div>
  );
}
