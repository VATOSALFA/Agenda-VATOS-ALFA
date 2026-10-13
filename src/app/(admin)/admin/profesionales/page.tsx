
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
  GripVertical,
  ChevronLeft,
  ChevronRight
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
      className={cn(
        "flex flex-col sm:flex-row items-start sm:items-center justify-between p-2.5 sm:p-3.5 bg-card hover:bg-muted/30 list-none gap-3 transition-colors border-b border-border/40 last:border-b-0",
        isDragging ? "shadow-xl ring-2 ring-blue-500 rounded-xl bg-accent z-20" : ""
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div 
          {...attributes}
          {...listeners}
          className="p-1 -ml-1 cursor-grab active:cursor-grabbing touch-none text-slate-400 hover:text-foreground shrink-0"
          title="Arrastrar para ordenar"
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <Avatar className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 border border-border/60">
          <AvatarImage src={prof.avatarUrl} alt={prof.name} />
          <AvatarFallback className="text-xs">{prof.name ? prof.name.substring(0, 2).toUpperCase() : '??'}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-xs sm:text-sm text-foreground truncate">{prof.name}</span>
          {prof.publicName && prof.publicName !== prof.name && (
            <span className="text-[11px] text-muted-foreground truncate">Web: {prof.publicName}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end flex-wrap">
        <Popover>
          <PopoverTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 w-7 p-0 text-slate-400 hover:text-foreground hover:bg-muted/30 shrink-0"
              title="Ver horario"
              aria-label="Ver horario"
            >
              <Clock className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-3 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white text-xs" align="end">
            <div className="text-xs">
              <div className="grid grid-cols-3 gap-x-3 gap-y-1 font-bold mb-2 pb-1.5 border-b border-border/40 text-blue-300">
                <span>Día</span>
                <span className="text-right">Apertura</span>
                <span className="text-right">Cierre</span>
              </div>
              <ul className="space-y-1.5">
                {daysOfWeek.map(day => (
                  <li key={day} className="grid grid-cols-3 gap-x-3 gap-y-0.5">
                    <span className="capitalize text-slate-400">{day.substring(0, 3)}</span>
                    {prof.schedule && prof.schedule[day as keyof Schedule]?.enabled
                      ? <>
                        <span className="font-mono text-right text-slate-200">{prof.schedule[day as keyof Schedule].start}</span>
                        <span className="font-mono text-right text-slate-200">{prof.schedule[day as keyof Schedule].end}</span>
                      </>
                      : <span className="col-span-2 text-right text-slate-500">Descanso</span>
                    }
                  </li>
                ))}
              </ul>
            </div>
          </PopoverContent>
        </Popover>

        <Badge 
          variant="outline" 
          className={cn(
            "text-[10px] h-6 py-0 px-2 shrink-0 font-medium",
            prof.active 
              ? 'border-blue-500/40 text-blue-400 bg-blue-500/10' 
              : 'border-border/60 text-muted-foreground bg-muted/20'
          )}
        >
          {prof.active ? 'Activo' : 'Inactivo'}
        </Badge>

        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => onEdit(prof)} 
          className="h-7 w-7 p-0 border-border/60 text-slate-400 hover:text-foreground hover:bg-muted/20 shrink-0"
          title="Editar profesional"
          aria-label="Editar profesional"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-7 w-7 p-0 border-border/60 text-slate-400 hover:text-foreground hover:bg-muted/20 shrink-0"
              title="Opciones"
              aria-label="Opciones"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
            <DropdownMenuItem onSelect={() => onOpenSpecialDay(prof)}>Habilitar jornada especial</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleActive(prof.id, !prof.active)}>
              {prof.active ? 'Desactivar profesional' : 'Activar profesional'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
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
        // Use nullish coalescing (??) because order can be 0, and 0 || 99 results in 99, pushing position 0 to the bottom
        if (prev.length === 0) {
          return [...validData].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
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
          return [...validData].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
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

      const updatedOrder = newOrder.map((prof, index) => ({
        ...prof,
        order: index,
      }));

      // Optimistically update local state
      setLocalProfessionals(updatedOrder);

      // Update Firestore
      if (!db) return;
      try {
        const batch = writeBatch(db);
        // Persist the new order for all items (simplest way to ensure consistency)
        updatedOrder.forEach((prof, index) => {
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

  const totalPages = Math.ceil(localProfessionals.length / itemsPerPage) || 1;
  const paginatedProfessionals = useMemo(() => {
    return localProfessionals.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [localProfessionals, currentPage, itemsPerPage]);

  const professionalsByLocal = useMemo(() => {
    if (localesLoading) return [];

    const assignedProfessionals = new Set<string>();

    const byLocal = locales.map(local => {
      const prosInLocal = paginatedProfessionals.filter(p => {
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

    const unassigned = paginatedProfessionals.filter(p => !p.local_id || !assignedProfessionals.has(p.id));

    const result: ({ professionals: Profesional[] } & Partial<Local>)[] = [...byLocal];

    if (unassigned.length > 0) {
      result.push({
        id: 'unassigned',
        name: 'Profesionales Sin Asignar',
        professionals: unassigned
      });
    }

    return result;
  }, [paginatedProfessionals, locales, localesLoading]);

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
      <div className="flex-1 space-y-4 p-3 sm:p-6 pt-4 sm:pt-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Profesionales</h2>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Gestiona el equipo de trabajo, turnos y servicios asignados
            </p>
          </div>
          <Button 
            variant="alfa" 
            size="sm" 
            onClick={() => handleOpenModal('new')}
            className="h-9 px-4 text-xs gap-1.5 shrink-0"
          >
            <PlusCircle className="h-4 w-4" /> Nuevo Profesional
          </Button>
        </div>

        <div className="space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs border-border/60 text-foreground hover:bg-muted/20 gap-1.5">
                  <Filter className="h-3.5 w-3.5 text-slate-400" /> Filtrar por
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                <div className="grid gap-3">
                  <div className="space-y-1">
                    <h4 className="font-semibold text-xs text-foreground">Filtros de Profesionales</h4>
                    <p className="text-[11px] text-muted-foreground">
                      Aplica filtros por estado o sucursal.
                    </p>
                  </div>
                  <div className="grid gap-2.5">
                    <div className="space-y-1">
                      <Label htmlFor="status" className="text-xs">Estado</Label>
                      <Select>
                        <SelectTrigger id="status" className="h-8 text-xs">
                          <SelectValue placeholder="Seleccionar estado" />
                        </SelectTrigger>
                        <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                          <SelectItem value="activo">Activo</SelectItem>
                          <SelectItem value="inactivo">Inactivo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="local" className="text-xs">Sucursales</Label>
                      <Select>
                        <SelectTrigger id="local" className="h-8 text-xs">
                          <SelectValue placeholder="Todos los locales" />
                        </SelectTrigger>
                        <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                          {locales.map(local => (
                            <SelectItem key={local.id} value={local.id}>{local.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
                    <Button variant="ghost" size="sm" className="h-7 text-xs">Restablecer</Button>
                    <Button variant="alfa" size="sm" className="h-7 text-xs px-3">Buscar</Button>
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
                <div key={localGroup.id} className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden shadow-sm">
                  <div className="py-2.5 px-3.5 bg-muted/20 border-b border-border/40 flex items-center justify-between">
                    <h3 className="text-xs sm:text-sm font-bold text-foreground">{localGroup.name}</h3>
                    <span className="text-[11px] text-muted-foreground">{localGroup.professionals.length} profesional{localGroup.professionals.length !== 1 ? 'es' : ''}</span>
                  </div>
                  <div className="p-0">
                    <SortableContext items={localGroup.professionals} strategy={verticalListSortingStrategy}>
                      <ul className="divide-y divide-border/40">
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
                  </div>
                </div>
              )
            ))}
            <DragOverlay>
              {activeProfessional ? (
                <ul className="divide-y bg-background border rounded-xl shadow-xl">
                  <SortableProfesionalItem prof={activeProfessional} onToggleActive={() => { }} onEdit={() => { }} onOpenSpecialDay={() => { }} />
                </ul>
              ) : null}
            </DragOverlay>
          </DndContext>

          {localProfessionals.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-border/40 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-foreground">Por página:</span>
                <Select
                  value={`${itemsPerPage}`}
                  onValueChange={(value) => {
                    setItemsPerPage(Number(value));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-7 w-[60px] text-xs bg-background border-border/60">
                    <SelectValue placeholder={itemsPerPage} />
                  </SelectTrigger>
                  <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[11px] text-muted-foreground ml-1">
                  Pág. {currentPage} de {totalPages} ({localProfessionals.length} totales)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs border-border/60 text-foreground hover:bg-muted/20"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Ant.
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs border-border/60 text-foreground hover:bg-muted/20"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Sig. <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                </Button>
              </div>
            </div>
          )}
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

