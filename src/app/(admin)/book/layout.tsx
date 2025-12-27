import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

export default function BookLayout({ children }: Props) {
  return (
    <div className="bg-muted/40 min-h-screen">
      <header className="bg-background shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
                <h1 className="text-xl font-bold text-primary">VATOS ALFA Barber Shop</h1>
            </div>
        </div>
      </header>
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
