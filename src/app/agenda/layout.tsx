'use client';

import Header from "@/components/layout/header";

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <>
      <Header />
      <div className="pt-16 h-[calc(100vh-4rem)]">
        {children}
      </div>
    </>
  )
}
