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
import type { Local, Profesional, Schedule, ScheduleDay } from '@/lib/types';


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
    zIndex: isDragging ? 10 : 'auto',
    boxShadow: isDragging ? '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)' : 'none'
  };

  return (
    <li ref={setNodeRef} style={style} className="flex items-center justify-between p-4 bg-card hover:bg-muted/50 list-none">
      <div className="flex items-center gap-4">
        <div {...attributes} {...listeners} className="cursor-grab p-2">
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>
        <Avatar>
          <AvatarImage src={prof.avatarUrl} data-ai-hint={prof.dataAiHint} />
          <AvatarFallback>{prof.name ? prof.name.substring(0, 2) : '??'}</AvatarFallback>
        </Avatar>
        <span className="font-medium">{prof.name}</span>
      </div>
      <div className="flex items-center gap-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <Clock className="mr-2 h-4 w-4" />
              Ver horario
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
            prof.active ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'
        )}>
          <Circle className={cn("mr-2 h-2 w-2 fill-current", prof.active ? 'text-green-600' : 'text-red-600')} />
          {prof.active ? 'Activo' : 'Inactivo'}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Opciones <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onOpenSpecialDay(prof)}>Habilitar jornada especial</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleActive(prof.id, !prof.active)}>
              {prof.active ? 'Desactivar profesional' : 'Activar profesional'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="sm" onClick={() => onEdit(prof)}>
          <Pencil className="mr-2 h-4 w-4" />
          Editar
        </Button>
      </div>
    </li>
  );
}


export default function ProfesionalesPage() {
  const [queryKey, setQueryKey] = useState(0);
  const { data: professionalsData, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', queryKey);
  const [professionals, setProfessionals] = useState<Profesional[]>([]);
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales', queryKey);
  const { db } = useAuth();

  const [editingProfessional, setEditingProfessional] = useState<Profesional | null | 'new'>(null);
  const [specialDayProfessional, setSpecialDayProfessional] = useState<Profesional | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isClientMounted, setIsClientMounted] = useState(false);
  const { toast } = useToast();
  
  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  useEffect(() => {
    if (professionalsData) {
      const sorted = [...professionalsData].sort((a, b) => a.order - b.order);
      setProfessionals(sorted);
    }
  }, [professionalsData]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  const handleDataUpdated = () => {
    setQueryKey(prev => prev + 1); // Refreshes the data
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
      const oldIndex = professionals.findIndex((item) => item.id === active.id);
      const newIndex = professionals.findIndex((item) => item.id === over.id);
      const newOrder = arrayMove(professionals, oldIndex, newIndex);
      setProfessionals(newOrder);

      if (!db) return;
      try {
        const batch = writeBatch(db);
        newOrder.forEach((prof, index) => {
          const profRef = doc(db, 'profesionales', prof.id);
          batch.update(profRef, { order: index });
        });
        await batch.commit();
        toast({
            title: "Orden actualizado",
            description: "El nuevo orden de los profesionales ha sido guardado."
        });
        handleDataUpdated();
      } catch (error) {
        console.error("Error updating order:", error);
        toast({ variant: 'destructive', title: 'Error al guardar el orden'});
        setProfessionals(professionals); // Revert on error
      }
    }
  }

  const professionalsByLocal = useMemo(() => {
    if (professionalsLoading || localesLoading) return [];
  
    const assignedProfessionals = new Set<string>();
  
    const byLocal = locales.map(local => {
      const prosInLocal = professionals.filter(p => {
        if (p.local_id === local.id) {
          assignedProfessionals.add(p.id);
          return true;
        }
        return false;
      }).sort((a,b) => a.order - b.order);
      
      return {
        ...local,
        professionals: prosInLocal
      };
    }).filter(localGroup => localGroup.professionals.length > 0);
  
    const unassignedProfessionals = professionals
      .filter(p => !p.local_id || !assignedProfessionals.has(p.id))
      .sort((a,b) => a.order - b.order);
  
    const result: ({ professionals: Profesional[] } & Partial<Local>)[] = [...byLocal];
  
    if (unassignedProfessionals.length > 0) {
      result.push({
        id: 'unassigned',
        name: 'Profesionales Sin Asignar',
        professionals: unassignedProfessionals
      });
    }
    
    return result;
  }, [professionals, locales, professionalsLoading, localesLoading]);

  const activeProfessional = useMemo(() => professionals.find(p => p.id === activeId), [activeId, professionals]);
  
  if ((professionalsLoading || localesLoading) && !isClientMounted) {
    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-12 w-full" />
            <Card>
                <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
                <CardContent className="space-y-2 p-0">
                    <div className="p-4"><Skeleton className="h-12 w-full" /></div>
                    <div className="p-4"><Skeleton className="h-12 w-full" /></div>
                    <div className="p-4"><Skeleton className="h-12 w-full" /></div>
                </CardContent>
            </Card>
        </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold tracking-tight">Profesionales</h2>
            <Button onClick={() => handleOpenModal('new')}>
                <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Profesional
            </Button>
        </div>

        <div className="space-y-4">
            <div className="py-2">
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

            {professionalsByLocal.map(localGroup => (
              localGroup.professionals.length > 0 && (
                <Card key={localGroup.id}>
                    <CardHeader>
                        <CardTitle>{localGroup.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {isClientMounted ? (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                          modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
                        >
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
                          <DragOverlay>
                              {activeProfessional ? (
                                <ul className="divide-y"><SortableProfesionalItem prof={activeProfessional} onToggleActive={() => {}} onEdit={() => {}} onOpenSpecialDay={() => {}} /></ul>
                              ) : null}
                          </DragOverlay>
                        </DndContext>
                      ) : (
                        <div className="p-4 text-center text-muted-foreground">Cargando...</div>
                      )}
                    </CardContent>
                </Card>
              )
            ))}
        </div>
      </div>

      {editingProfessional && (
        <EditProfesionalModal
          profesional={editingProfessional === 'new' ? null : editingProfessional}
          isOpen={!!editingProfessional}
          onClose={handleCloseModal}
          onDataSaved={handleDataUpdated}
          local={null} // Pass null, the modal will fetch all locales
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
