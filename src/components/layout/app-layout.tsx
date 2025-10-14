'use client';

import React from 'react';
import Header from './header';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="pt-16">
        {children}
      </main>
    </>
  );
}
