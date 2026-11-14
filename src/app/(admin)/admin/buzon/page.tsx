'use client';

import { BuzonClientesManager } from '@/components/admin/buzon-clientes-manager';
import { useAuth } from '@/contexts/firebase-auth-context';
import { ShieldAlert } from 'lucide-react';

export default function AdminBuzonPage() {
  const { user, loading } = useAuth();

  const canSeeBuzon = user?.role === 'Administrador general' || user?.permissions?.includes('ver_buzon');

  if (!loading && user && !canSeeBuzon) {
    return (
      <div className="container mx-auto py-12 px-4 text-center space-y-3">
        <ShieldAlert className="h-12 w-12 text-slate-400 mx-auto" />
        <h2 className="text-base font-bold text-foreground">Acceso Restringido</h2>
        <p className="text-xs text-muted-foreground">No tienes permisos para visualizar o gestionar el Buzón de Clientes.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 sm:px-6 space-y-4">
      <div className="pb-2.5 border-b border-border/60">
        <h2 className="text-xl font-bold tracking-tight text-foreground uppercase">BUZÓN</h2>
      </div>
      <BuzonClientesManager />
    </div>
  );
}
