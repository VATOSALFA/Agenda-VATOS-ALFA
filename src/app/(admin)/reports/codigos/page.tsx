'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { KeyRound, ShieldAlert, Search, Trash2, CheckCircle2, Clock, XCircle, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Skeleton } from '@/components/ui/skeleton';
import type { AuthCode } from '@/lib/types';
import { doc, deleteDoc } from 'firebase/firestore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function ReportsCodigosPage() {
  const { toast } = useToast();
  const { db, user, loading: authLoading } = useAuth();
  const [queryKey, setQueryKey] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'used' | 'available' | 'expired'>('todos');
  const [codeToDelete, setCodeToDelete] = useState<AuthCode | null>(null);

  const { data: authCodes = [], loading } = useFirestoreQuery<AuthCode>('codigos_autorizacion', queryKey);

  const getStatus = (code: AuthCode): { label: string; status: 'available' | 'used' | 'expired' } => {
    if (code.used) {
      return { label: 'Utilizado', status: 'used' };
    }
    if (code.expires_at) {
      const expMs = Date.parse(code.expires_at);
      if (!isNaN(expMs) && Date.now() > expMs) {
        return { label: 'Expirado', status: 'expired' };
      }
    }
    if (!code.active) {
      return { label: 'Inactivo', status: 'expired' };
    }
    return { label: 'Disponible', status: 'available' };
  };

  const oneTimeCodes = useMemo(() => {
    return (authCodes || [])
      .filter((c) => c.is_one_time === true)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }, [authCodes]);

  const metrics = useMemo(() => {
    let total = oneTimeCodes.length;
    let used = 0;
    let available = 0;
    let expired = 0;

    oneTimeCodes.forEach((c) => {
      const st = getStatus(c).status;
      if (st === 'used') used++;
      else if (st === 'available') available++;
      else if (st === 'expired') expired++;
    });

    return { total, used, available, expired };
  }, [oneTimeCodes]);

  const filteredCodes = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return oneTimeCodes.filter((item) => {
      const st = getStatus(item).status;
      if (statusFilter !== 'todos' && st !== statusFilter) return false;

      if (!q) return true;
      const matchCode = String(item.code || '').toLowerCase().includes(q);
      const matchPurpose = String(item.purpose || item.name || '').toLowerCase().includes(q);
      const matchCreator = String(item.created_by || '').toLowerCase().includes(q);
      const matchUsedBy = String(item.used_by || '').toLowerCase().includes(q);
      const matchDetails = String(item.used_details || '').toLowerCase().includes(q);
      return matchCode || matchPurpose || matchCreator || matchUsedBy || matchDetails;
    });
  }, [oneTimeCodes, statusFilter, searchTerm]);

  const canViewReports =
    user?.role === 'Administrador general' ||
    user?.permissions?.includes('ver_reporte_codigos');

  const handleDeleteRecord = async () => {
    if (!codeToDelete || !db) return;
    try {
      await deleteDoc(doc(db, 'codigos_autorizacion', codeToDelete.id));
      toast({
        title: 'Registro eliminado',
        description: `Se eliminó el registro del código [${codeToDelete.code}].`,
      });
      setQueryKey((prev) => prev + 1);
    } catch (err) {
      console.error('Error deleting code record:', err);
      toast({ variant: 'destructive', title: 'Error al eliminar registro' });
    } finally {
      setCodeToDelete(null);
    }
  };

  if (!authLoading && user && !canViewReports) {
    return (
      <div className="container mx-auto py-12 px-4 text-center space-y-3">
        <ShieldAlert className="h-12 w-12 text-slate-400 mx-auto" />
        <h2 className="text-base font-bold text-foreground">Acceso Restringido</h2>
        <p className="text-xs text-muted-foreground">
          No tienes permisos para consultar la auditoría e historial de códigos.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 sm:px-6 space-y-5 max-w-6xl">
      {/* Encabezado */}
      <div className="pb-2.5 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground uppercase">
            AUDITORÍA DE CÓDIGOS DE AUTORIZACIÓN
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Historial detallado y trazabilidad de códigos de autorización y exención de anticipo generados en el sistema.
          </p>
        </div>
        <Badge variant="outline" className="w-fit text-xs font-sans font-semibold border-blue-500/30 bg-blue-500/10 text-blue-400">
          Bitácora Segura
        </Badge>
      </div>

      {/* Tarjetas de Métricas Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border border-border/60 bg-card p-3 shadow-xs">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Total Generados</span>
          <span className="text-xl font-bold text-foreground mt-1 block">{metrics.total}</span>
        </Card>
        <Card className="border border-border/60 bg-card p-3 shadow-xs">
          <span className="text-[10px] font-bold text-[#C5A880] uppercase tracking-wider block">Utilizados</span>
          <span className="text-xl font-bold text-[#C5A880] mt-1 block">{metrics.used}</span>
        </Card>
        <Card className="border border-border/60 bg-card p-3 shadow-xs">
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">Disponibles</span>
          <span className="text-xl font-bold text-blue-400 mt-1 block">{metrics.available}</span>
        </Card>
        <Card className="border border-border/60 bg-card p-3 shadow-xs">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Expirados / Inactivos</span>
          <span className="text-xl font-bold text-muted-foreground mt-1 block">{metrics.expired}</span>
        </Card>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por PIN, motivo o persona..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs rounded-xl"
          />
        </div>

        {/* Chips de filtro */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'used', label: 'Utilizados' },
            { id: 'available', label: 'Disponibles' },
            { id: 'expired', label: 'Expirados' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id as any)}
              className={cn(
                "h-8 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap",
                statusFilter === f.id
                  ? "bg-[#202A49] text-white shadow-xs"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground border border-border/50"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de Historial (Estándar de Tablas Compactas Pegaditas - Regla 6) */}
      <Card className="border border-border/70 shadow-xs overflow-hidden">
        <CardHeader className="py-2.5 px-4 border-b border-border/50 bg-muted/10">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-400 shrink-0" />
            <CardTitle className="text-xs font-semibold tracking-tight text-foreground">
              Historial de Códigos Registrados ({filteredCodes.length})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                <TableHead className="py-1 px-3.5 text-xs font-semibold text-foreground w-28">PIN</TableHead>
                <TableHead className="py-1 px-3 text-xs font-semibold text-foreground">Motivo / Nota</TableHead>
                <TableHead className="py-1 px-3 text-xs font-semibold text-foreground hidden sm:table-cell">Generado por</TableHead>
                <TableHead className="py-1 px-3 text-xs font-semibold text-foreground text-center w-28">Estado</TableHead>
                <TableHead className="py-1 px-3 text-xs font-semibold text-foreground">Bitácora de Uso en Sistema</TableHead>
                {user?.role === 'Administrador general' && (
                  <TableHead className="py-1 px-3.5 text-xs font-semibold text-foreground text-right w-14"></TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i} className="h-9">
                    <TableCell colSpan={6} className="py-2 px-3.5"><Skeleton className="h-4 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : filteredCodes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-20 text-xs text-muted-foreground">
                    No se encontraron registros con los filtros seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCodes.map((item) => {
                  const st = getStatus(item);
                  return (
                    <TableRow key={item.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                      <TableCell className="py-1.5 px-3.5 text-xs">
                        <span className={cn(
                          "font-mono font-bold tracking-wider px-2 py-0.5 rounded border text-xs",
                          st.status === 'available'
                            ? "text-[#C5A880] border-[#C5A880]/40 bg-[#C5A880]/10"
                            : "text-muted-foreground border-border/50 bg-muted/20"
                        )}>
                          {item.code}
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-xs font-medium text-foreground">
                        {item.purpose || item.name}
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-xs text-muted-foreground hidden sm:table-cell">
                        {item.created_by || 'Administración'}
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-center">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-sans font-medium py-0 px-2 rounded-full",
                            st.status === 'available' && "border-blue-500/40 text-blue-400 bg-blue-500/10",
                            st.status === 'used' && "border-[#C5A880]/40 text-[#C5A880] bg-[#C5A880]/10",
                            st.status === 'expired' && "border-border/60 text-muted-foreground bg-muted/20"
                          )}
                        >
                          {st.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-xs text-muted-foreground">
                        {item.used ? (
                          <div className="leading-tight">
                            <span className="font-semibold text-foreground">{item.used_in_module || 'Operación autorizada'}</span>
                            {item.used_by && <span className="ml-1">por {item.used_by}</span>}
                            {item.used_details && (
                              <span className="block text-[11px] text-muted-foreground truncate max-w-sm" title={item.used_details}>
                                {item.used_details}
                              </span>
                            )}
                          </div>
                        ) : st.status === 'available' && item.expires_at ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-blue-400 font-medium">
                            <Clock className="h-3 w-3" />
                            Expira {new Date(item.expires_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Sin utilizar (Expirado)</span>
                        )}
                      </TableCell>
                      {user?.role === 'Administrador general' && (
                        <TableCell className="py-1.5 px-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setCodeToDelete(item)}
                            className="text-slate-400 hover:text-red-400 transition-colors p-1"
                            title="Eliminar registro de auditoría"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal de confirmación para eliminar */}
      {codeToDelete && (
        <AlertDialog open={!!codeToDelete} onOpenChange={() => setCodeToDelete(null)}>
          <AlertDialogContent className="border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar registro de código?</AlertDialogTitle>
              <AlertDialogDescription>
                Se borrará permanentemente el registro del código PIN [{codeToDelete.code}]. Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl border-border/60">Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteRecord} className="rounded-xl bg-destructive hover:bg-destructive/90 text-white">
                Sí, eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
