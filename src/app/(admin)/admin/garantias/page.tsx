'use client';

import { GarantiasManager } from '@/components/admin/garantias-manager';
import { useAuth } from '@/contexts/firebase-auth-context';
import { ShieldAlert } from 'lucide-react';

export default function AdminGarantiasPage() {
  const { user, loading } = useAuth();

  const canSeeGarantias = user?.role === 'Administrador general' || user?.permissions?.includes('ver_garantias');

  if (!loading && user && !canSeeGarantias) {
    return (
      <div className="container mx-auto py-12 px-4 text-center space-y-3">
        <ShieldAlert className="h-12 w-12 text-slate-400 mx-auto" />
        <h2 className="text-base font-bold text-foreground">Acceso Restringido</h2>
        <p className="text-xs text-muted-foreground">No tienes permisos para visualizar o gestionar la sección de Garantías.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 sm:px-6">
      <GarantiasManager />
    </div>
  );
}
