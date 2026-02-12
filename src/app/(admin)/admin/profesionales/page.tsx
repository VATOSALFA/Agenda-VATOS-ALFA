
'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers';

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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  Filter,
  PlusCircle,
  Pencil,
  Clock,
  Circle,
  ChevronDown,
  GripVertical
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EditProfesionalModal } from '@/components/admin/profesionales/edit-profesional-modal';
import { SpecialDayModal } from '@/components/admin/profesionales/special-day-modal';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Skeleton } from '@/components/ui/skeleton';
import type { Local, Profesional, Schedule } from '@/lib/types';


const daysOfWeek = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

function SortableProfesionalItem({ prof, onToggleActive, onEdit, onOpenSpecialDay }: { prof: Profesional, onToggleActive: (id: string, active: boolean) => void, onEdit: (prof: Profesional) => void, onOpenSpecialDay: (prof: Profesional) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: prof.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : 'auto',
    position: 'relative' as const,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "flex flex-col sm:flex-row items-center justify-between p-4 bg-card hover:bg-muted/50 list-none cursor-grab active:cursor-grabbing touch-none gap-4",
        isDragging && "shadow-xl ring-2 ring-primary ring-opacity-50 rounded-md bg-accent"
      )}
    >
      <div className="flex items-center gap-4 w-full sm:w-auto">
        <div className="p-2">
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>
        <Avatar>
          <AvatarImage src={prof.avatarUrl} alt={prof.name} />
          <AvatarFallback>{prof.name ? prof.name.substring(0, 2).toUpperCase() : '??'}</AvatarFallback>
        </Avatar>
        <span className="font-medium">{prof.name}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto justify-end">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground shrink-0" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <Clock className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Ver horario</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="p-2 text-sm">
              <div className="grid grid-cols-3 gap-x-4 gap-y-1 font-bold mb-2">
                <span>Día</span>
                <span className="text-right">Apertura</span>
                <span className="text-right">Cierre</span>
              </div>
              <ul className="space-y-1">
                {daysOfWeek.map(day => (
                  <li key={day} className="grid grid-cols-3 gap-x-4 gap-y-1">
                    <span className="capitalize">{day.substring(0, 3)}</span>
                    {prof.schedule && prof.schedule[day as keyof Schedule]?.enabled
                      ? <>
                        <span className="font-mono text-right">{prof.schedule[day as keyof Schedule].start}</span>
                        <span className="font-mono text-right">{prof.schedule[day as keyof Schedule].end}</span>
                      </>
                      : <span className="col-span-2 text-right text-muted-foreground">Cerrado</span>
                    }
                  </li>
                ))}
              </ul>
            </div>
          </TooltipContent>
        </Tooltip>

        <Badge variant={prof.active ? 'default' : 'destructive'} className={cn(
          prof.active ? 'bg-primary/10 text-primary border-primary/30' : 'bg-accent/20 text-accent-foreground border-accent/50',
          "shrink-0"
        )}>
          <Circle className={cn("mr-2 h-2 w-2 fill-current", prof.active ? 'text-primary' : 'text-accent-foreground')} />
          {prof.active ? 'Activo' : 'Inactivo'}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" onPointerDown={(e) => e.stopPropagation()} className="shrink-0">
              <span className="hidden sm:inline">Opciones</span> <ChevronDown className="ml-0 sm:ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onOpenSpecialDay(prof)}>Habilitar jornada especial</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleActive(prof.id, !prof.active)}>
              {prof.active ? 'Desactivar profesional' : 'Activar profesional'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="sm" onClick={() => onEdit(prof)} onPointerDown={(e) => e.stopPropagation()} className="shrink-0">
          <Pencil className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Editar</span>
        </Button>
      </div>
    </li>
  );
}


export default function ProfesionalesPage() {
  const [queryKey, setQueryKey] = useState(0);
  const { data: professionalsData, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', queryKey);
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales', queryKey);
  const { db } = useAuth();

  // Local state for optimistic updates
  const [localProfessionals, setLocalProfessionals] = useState<Profesional[]>([]);

  const [editingProfessional, setEditingProfessional] = useState<Profesional | null | 'new'>(null);
  const [specialDayProfessional, setSpecialDayProfessional] = useState<Profesional | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isClientMounted, setIsClientMounted] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  // Sync local state with Firestore data, but preserve local order to prevent jumping
  useEffect(() => {
    if (professionalsData) {
      const validData = professionalsData.filter(p => !p.deleted);

      setLocalProfessionals(prev => {
        // If it's the first load (empty prev), just sort by order and return
        if (prev.length === 0) {
          return [...validData].sort((a, b) => (a.order || 99) - (b.order || 99));
        }

        // Check if the list composition has changed (added or removed items)
        const prevIds = new Set(prev.map(p => p.id));
        const newIds = new Set(validData.map(p => p.id));

        const isSameSet = prevIds.size === newIds.size && [...prevIds].every(id => newIds.has(id));

        if (isSameSet) {
          // If the items are the same, we update their data (properties) but KEEP the current local order.
          // This prevents the "jump" caused by server-side reordering delay or race conditions.
          return prev.map(p => {
            const updatedData = validData.find(v => v.id === p.id);
            return updatedData ? { ...updatedData } : p;
          });
        } else {
          // If items were added or removed, we must resort and reset using server data
          return [...validData].sort((a, b) => (a.order || 99) - (b.order || 99));
        }
      });
    }
  }, [professionalsData]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDataUpdated = () => {
    setQueryKey(prev => prev + 1);
    handleCloseModal();
  };

  const handleOpenModal = (profesional: Profesional | 'new') => {
    setEditingProfessional(profesional);
  };

  const handleCloseModal = () => {
    setEditingProfessional(null);
  };

  const handleOpenSpecialDayModal = (profesional: Profesional) => {
    setSpecialDayProfessional(profesional);
  };

  const handleCloseSpecialDayModal = () => {
    setSpecialDayProfessional(null);
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    if (!db) return;
    try {
      const profRef = doc(db, 'profesionales', id);
      await updateDoc(profRef, { active });
      toast({
        title: active ? "Profesional activado" : "Profesional desactivado"
      });
      handleDataUpdated();
    } catch (error) {
      console.error("Error toggling active status: ", error);
      toast({ variant: "destructive", title: "Error al actualizar" });
    }
  }

  function handleDragStart(event: DragEndEvent) {
    setActiveId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      // Find indices in the global localProfessionals list
      const oldIndex = localProfessionals.findIndex((item) => item.id === active.id);
      const newIndex = localProfessionals.findIndex((item) => item.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      // Swap Logic: The user requested that items just swap places, and others stay put.
      const newOrder = [...localProfessionals];
      const temp = newOrder[oldIndex];
      newOrder[oldIndex] = newOrder[newIndex];
      newOrder[newIndex] = temp;

      // Optimistically update local state
      setLocalProfessionals(newOrder);

      // Update Firestore
      if (!db) return;
      try {
        const batch = writeBatch(db);
        // Persist the new order for all items (simplest way to ensure consistency)
        newOrder.forEach((prof, index) => {
          const profRef = doc(db, 'profesionales', prof.id);
          batch.update(profRef, { order: index });
        });
        await batch.commit();
        toast({
          title: "Orden actualizado",
          description: "Se han intercambiado las posiciones exitosamente."
        });
      } catch (error) {
        console.error("Error updating order:", error);
        toast({ variant: 'destructive', title: 'Error al actualizar orden' });
        // Revert on error
        setLocalProfessionals(localProfessionals);
      }
    }
  }

  const professionalsByLocal = useMemo(() => {
    if (localesLoading) return [];

    const assignedProfessionals = new Set<string>();

    const byLocal = locales.map(local => {
      const prosInLocal = localProfessionals.filter(p => {
        if (p.local_id === local.id) {
          assignedProfessionals.add(p.id);
          return true;
        }
        return false;
      });

      return {
        ...local,
        professionals: prosInLocal
      };
    }).filter(localGroup => localGroup.professionals.length > 0);

    const unassigned = localProfessionals.filter(p => !p.local_id || !assignedProfessionals.has(p.id));

    const result: ({ professionals: Profesional[] } & Partial<Local>)[] = [...byLocal];

    if (unassigned.length > 0) {
      result.push({
        id: 'unassigned',
        name: 'Profesionales Sin Asignar',
        professionals: unassigned
      });
    }

    return result;
  }, [localProfessionals, locales, localesLoading]);

  const activeProfessional = useMemo(() => localProfessionals.find(p => p.id === activeId), [activeId, localProfessionals]);

  if ((professionalsLoading || localesLoading) && !isClientMounted) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full" />
        <Card>
          <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
          <CardContent className="space-y-2 p-0">
            <div className="p-4"><Skeleton className="h-12 w-full" /></div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-3xl font-bold tracking-tight">Profesionales</h2>
          <Button onClick={() => handleOpenModal('new')}>
            <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Profesional
          </Button>
        </div>

        <div className="space-y-4">
          <div className="py-2">
            {/* Filter Popover content remains same, just ensuring parent spacing */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">
                  <Filter className="mr-2 h-4 w-4" /> Filtrar por
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium leading-none">Filtros</h4>
                    <p className="text-sm text-muted-foreground">
                      Aplica filtros para encontrar profesionales.
                    </p>
                  </div>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="status">Estado</Label>
                      <Select>
                        <SelectTrigger id="status">
                          <SelectValue placeholder="Seleccionar estado" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="activo">Activo</SelectItem>
                          <SelectItem value="inactivo">Inactivo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="local">Locales</Label>
                      <Select>
                        <SelectTrigger id="local">
                          <SelectValue placeholder="Todos" />
                        </SelectTrigger>
                        <SelectContent>
                          {locales.map(local => (
                            <SelectItem key={local.id} value={local.id}>{local.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost">Restablecer</Button>
                    <Button>Buscar</Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
          >
            {professionalsByLocal.map(localGroup => (
              localGroup.professionals.length > 0 && (
                <Card key={localGroup.id}>
                  <CardHeader>
                    <CardTitle>{localGroup.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <SortableContext items={localGroup.professionals} strategy={verticalListSortingStrategy}>
                      <ul className="divide-y">
                        {localGroup.professionals.map((prof) => (
                          <SortableProfesionalItem
                            key={prof.id}
                            prof={prof}
                            onToggleActive={handleToggleActive}
                            onEdit={() => handleOpenModal(prof)}
                            onOpenSpecialDay={() => handleOpenSpecialDayModal(prof)}
                          />
                        ))}
                      </ul>
                    </SortableContext>
                  </CardContent>
                </Card>
              )
            ))}
            <DragOverlay>
              {activeProfessional ? (
                <ul className="divide-y bg-background border rounded-md shadow-xl"><SortableProfesionalItem prof={activeProfessional} onToggleActive={() => { }} onEdit={() => { }} onOpenSpecialDay={() => { }} /></ul>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      {editingProfessional && (
        <EditProfesionalModal
          profesional={editingProfessional === 'new' ? null : editingProfessional}
          isOpen={!!editingProfessional}
          onClose={handleCloseModal}
          onDataSaved={handleDataUpdated}
          local={null}
        />
      )}

      {specialDayProfessional && (
        <SpecialDayModal
          profesional={specialDayProfessional}
          isOpen={!!specialDayProfessional}
          onClose={handleCloseSpecialDayModal}
        />
      )}
    </TooltipProvider>
  );
}

