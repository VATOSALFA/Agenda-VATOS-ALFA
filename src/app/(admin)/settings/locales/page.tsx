'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PlusCircle,
  Pencil,
  Circle,
  MoreVertical,
  Trash2,
  MapPin,
  ExternalLink,
  Phone,
  Power,
} from 'lucide-react';
import { NewLocalModal } from '@/components/admin/locales/new-local-modal';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { cn } from '@/lib/utils';
import type { Local } from '@/lib/types';

export default function LocalesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLocal, setEditingLocal] = useState<Local | null>(null);
  const [localToDelete, setLocalToDelete] = useState<Local | null>(null);
  const [queryKey, setQueryKey] = useState(0);
  const { toast } = useToast();
  const { db } = useAuth();

  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales', queryKey);

  const handleDataUpdated = () => {
    setQueryKey(prev => prev + 1);
    closeModal();
  };

  const openNewModal = () => {
    setEditingLocal(null);
    setIsModalOpen(true);
  };

  const openEditModal = (local: Local) => {
    setEditingLocal(local);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingLocal(null);
  };

  const handleToggleStatus = async (local: Local) => {
    if (!db) return;
    const newStatus = local.status === 'active' ? 'inactive' : 'active';
    try {
      const localRef = doc(db, 'locales', local.id);
      await updateDoc(localRef, { status: newStatus });
      toast({
        title: `Local ${newStatus === 'active' ? 'activado' : 'desactivado'}`,
        description: `El local "${local.name}" ahora está ${newStatus === 'active' ? 'activo' : 'inactivo'}.`,
      });
      setQueryKey(prev => prev + 1);
    } catch (error) {
      console.error("Error toggling status: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cambiar el estado del local. Inténtalo de nuevo.",
      });
    }
  };

  const handleDeleteLocal = async () => {
    if (!localToDelete || !db) return;
    try {
      await deleteDoc(doc(db, "locales", localToDelete.id));
      toast({
        title: "Local Eliminado",
        description: `El local "${localToDelete.name}" ha sido eliminado permanentemente.`,
      });
      setQueryKey(prevKey => prevKey + 1);
    } catch (error) {
      console.error("Error deleting local: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar el local. Inténtalo de nuevo.",
      });
    } finally {
      setLocalToDelete(null);
    }
  };

  return (
    <>
      <div className="flex-1 space-y-5 max-w-5xl pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border/60">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Locales y Sucursales</h2>
            <p className="text-xs text-muted-foreground">
              Gestiona las sucursales físicas de tu negocio, horarios y enlace de reseñas en Google Maps.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="alfa"
              size="sm"
              onClick={openNewModal}
              className="h-9 px-4 text-xs font-semibold"
            >
              <PlusCircle className="mr-1.5 h-3.5 w-3.5 text-white" />
              Nuevo Local
            </Button>
          </div>
        </div>

        <Card className="border border-border/70 shadow-xs overflow-hidden">
          <CardHeader className="py-3 px-4 sm:px-5 border-b border-border/50 bg-muted/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                <CardTitle className="text-sm font-semibold tracking-tight text-foreground">
                  Listado de Sucursales
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[11px] font-sans font-medium bg-background border-border/60">
                {locales.length} {locales.length === 1 ? 'sucursal' : 'sucursales'}
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Controla la visibilidad y disponibilidad de cada sucursal en la agenda.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50 bg-card">
              {localesLoading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-4">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-60" />
                    </div>
                    <Skeleton className="h-8 w-24" />
                  </div>
                ))
              ) : locales.map((local) => {
                const isActive = local.status === 'active';
                const mapsUrl = local.googleMapsReviewUrl || (local as any).google_maps_review_url;

                return (
                  <div
                    key={local.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 hover:bg-muted/20 transition-colors gap-3"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-semibold text-xs sm:text-sm text-foreground">
                          {local.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-sans font-medium py-0 px-2 rounded-full",
                            isActive
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                              : "bg-muted/40 text-muted-foreground border-border/60"
                          )}
                        >
                          <Circle className={cn("mr-1.5 h-1.5 w-1.5 fill-current", isActive ? "text-blue-400" : "text-slate-400")} />
                          {isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        {local.address && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[280px] sm:max-w-md">{local.address}</span>
                          </div>
                        )}
                        {local.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span>{local.phone}</span>
                          </div>
                        )}
                      </div>

                      {Boolean(mapsUrl) && (
                        <div>
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 hover:underline font-medium transition-colors"
                          >
                            <ExternalLink className="h-3 w-3 text-slate-400" />
                            <span>Enlace de Reseñas en Google Maps</span>
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(local)}
                        className="h-8 px-2.5 text-xs rounded-lg border-border/80 hover:bg-muted/50 gap-1.5 text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5 text-slate-400" />
                        <span>Editar</span>
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
                          >
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">Acciones</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-44 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card p-1 space-y-0.5"
                        >
                          <DropdownMenuItem
                            onClick={() => handleToggleStatus(local)}
                            className="text-xs font-semibold py-2 px-2.5 rounded-lg cursor-pointer flex items-center gap-2"
                          >
                            <Power className="h-3.5 w-3.5 text-slate-400" />
                            <span>{isActive ? 'Desactivar local' : 'Activar local'}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => setLocalToDelete(local)}
                            className="text-xs font-semibold py-2 px-2.5 rounded-lg cursor-pointer flex items-center gap-2 text-red-400 hover:!text-red-300 focus:text-red-400 focus:bg-red-500/10"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            <span>Eliminar local</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}

              {!localesLoading && locales.length === 0 && (
                <div className="py-12 text-center space-y-2">
                  <MapPin className="h-8 w-8 text-slate-500 mx-auto opacity-50" />
                  <p className="text-xs text-muted-foreground">No hay locales registrados aún.</p>
                  <Button
                    variant="alfa"
                    size="sm"
                    onClick={openNewModal}
                    className="h-8 px-4 text-xs font-semibold mt-2"
                  >
                    Crear Primer Local
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <NewLocalModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onLocalCreated={handleDataUpdated}
        local={editingLocal}
      />

      {localToDelete && (
        <AlertDialog open={!!localToDelete} onOpenChange={(open) => !open && setLocalToDelete(null)}>
          <AlertDialogContent className="border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base font-bold text-foreground">
                ¿Eliminar sucursal?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-muted-foreground">
                Esta acción no se puede deshacer. Se eliminará permanentemente la sucursal
                <span className="font-semibold text-foreground"> "{localToDelete.name}"</span>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-0">
              <AlertDialogCancel
                onClick={() => setLocalToDelete(null)}
                className="h-8 px-3 text-xs rounded-lg"
              >
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteLocal}
                className="h-8 px-3 text-xs rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
              >
                Sí, eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
