
'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  Filter,
  PlusCircle,
  Pencil,
  Clock,
  Circle,
  ChevronDown,
  GripVertical,
  Info,
  Trash2,
} from 'lucide-react';
import { NewLocalModal } from '@/components/admin/locales/new-local-modal';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '@/firebase';
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
    setQueryKey(prev => prev + 1); // Refreshes the data
    closeModal();
  };
  
  const openNewModal = () => {
    setEditingLocal(null);
    setIsModalOpen(true);
  }

  const openEditModal = (local: Local) => {
    setEditingLocal(local);
    setIsModalOpen(true);
  }
  
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingLocal(null);
  }

  const handleToggleStatus = async (local: Local) => {
    if (!db) return;
    const newStatus = local.status === 'active' ? 'inactive' : 'active';
    try {
        const localRef = doc(db, 'locales', local.id);
        await updateDoc(localRef, { status: newStatus });
        toast({
            title: `Local ${newStatus === 'active' ? 'activado' : 'desactivado'}`,
            description: `El local "${local.name}" ha sido ${newStatus === 'active' ? 'activado' : 'desactivado'}.`,
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
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>¡Administra tus locales!</AlertTitle>
          <AlertDescription>
            En esta sección puedes administrar y crear nuevos locales o sucursales para tu negocio.
          </AlertDescription>
        </Alert>
        
        <div className="flex items-center justify-between pt-4">
          <Button variant="outline">
            <Filter className="mr-2 h-4 w-4" /> Filtrar por
          </Button>
          <Button onClick={openNewModal}>
            <PlusCircle className="mr-2 h-4 w-4" /> Nuevo local
          </Button>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Listado de Locales</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {localesLoading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-4">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-4 w-60" />
                    </div>
                    <Skeleton className="h-9 w-44" />
                  </div>
                ))
              ) : locales.map((local) => (
                <div key={local.id} className="flex items-center justify-between p-4 hover:bg-muted/50">
                  <div>
                    <div className="font-bold flex items-center gap-2">
                       <Badge className={cn(
                           local.status === 'active'
                           ? 'bg-green-100 text-green-800 border-green-200'
                           : 'bg-orange-100 text-orange-800 border-orange-200'
                       )}>
                         <Circle className={cn("mr-2 h-2 w-2 fill-current", local.status === 'active' ? 'text-green-600' : 'text-orange-600')} />
                         {local.status === 'active' ? 'Activo' : 'Inactivo'}
                       </Badge>
                       {local.name}
                    </div>
                    <p className="text-sm text-muted-foreground">{local.address}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          Opciones <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleToggleStatus(local)}>
                            {local.status === 'active' ? 'Desactivar' : 'Activar'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setLocalToDelete(local)} className="text-destructive hover:!text-destructive focus:text-destructive focus:bg-destructive/10">
                            <Trash2 className="mr-2 h-4 w-4"/>
                            Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button variant="outline" size="sm" onClick={() => openEditModal(local)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                  </div>
                </div>
              ))}
              {!localesLoading && locales.length === 0 && (
                <p className="py-10 text-center text-muted-foreground">No hay locales creados. ¡Agrega uno!</p>
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
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta acción no se puede deshacer. Esto eliminará permanentemente el local
                        <span className="font-bold"> {localToDelete.name}</span>.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setLocalToDelete(null)}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteLocal} className="bg-destructive hover:bg-destructive/90">
                        Sí, eliminar local
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
