
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

const initialProfessionals = [
  {
    id: 'prof_1',
    name: 'Beatriz Elizarraga Casas',
    email: 'jezbeth94@gmail.com',
    avatar: 'https://placehold.co/100x100',
    dataAiHint: 'woman portrait',
    active: true,
    acceptsOnline: true,
    biography: 'Barbera experta en cortes clásicos y modernos, con más de 10 años de experiencia.',
    services: ['serv_01', 'serv_02', 'serv_03'],
    schedule: {
      lunes: { enabled: true, start: '09:00', end: '18:00' },
      martes: { enabled: true, start: '09:00', end: '18:00' },
      miercoles: { enabled: true, start: '09:00', end: '18:00' },
      jueves: { enabled: true, start: '09:00', end: '18:00' },
      viernes: { enabled: true, start: '09:00', end: '20:00' },
      sabado: { enabled: true, start: '10:00', end: '20:00' },
      domingo: { enabled: false, start: '', end: '' },
    }
  },
  {
    id: 'prof_2',
    name: 'Erick',
    email: 'erick@example.com',
    avatar: 'https://placehold.co/100x100',
    dataAiHint: 'man portrait',
    active: true,
    acceptsOnline: true,
    biography: 'Especialista en fades y diseños de barba.',
    services: ['serv_02', 'serv_04'],
    schedule: {
      lunes: { enabled: false, start: '', end: '' },
      martes: { enabled: true, start: '10:00', end: '19:00' },
      miercoles: { enabled: true, start: '10:00', end: '19:00' },
      jueves: { enabled: true, start: '10:00', end: '19:00' },
      viernes: { enabled: true, start: '10:00', end: '21:00' },
      sabado: { enabled: true, start: '09:00', end: '21:00' },
      domingo: { enabled: false, start: '', end: '' },
    }
  },
  {
    id: 'prof_3',
    name: 'Karina Ruiz Rosales',
    email: 'karina@example.com',
    avatar: 'https://placehold.co/100x100',
    dataAiHint: 'woman glasses',
    active: true,
    acceptsOnline: false,
    biography: 'Experta en coloración y tratamientos capilares.',
    services: ['serv_06', 'serv_07', 'serv_08'],
     schedule: {
      lunes: { enabled: true, start: '09:00', end: '17:00' },
      martes: { enabled: true, start: '09:00', end: '17:00' },
      miercoles: { enabled: false, start: '', end: '' },
      jueves: { enabled: true, start: '09:00', end: '17:00' },
      viernes: { enabled: true, start: '09:00', end: '17:00' },
      sabado: { enabled: false, start: '', end: '' },
      domingo: { enabled: false, start: '', end: '' },
    }
  },
  {
    id: 'prof_4',
    name: 'Lupita',
    email: 'lupita@example.com',
    avatar: 'https://placehold.co/100x100',
    dataAiHint: 'woman happy',
    active: true,
    acceptsOnline: true,
    biography: 'Pasión por el estilismo y las últimas tendencias.',
    services: ['serv_01', 'serv_05', 'serv_09'],
     schedule: {
      lunes: { enabled: true, start: '12:00', end: '20:00' },
      martes: { enabled: true, start: '12:00', end: '20:00' },
      miercoles: { enabled: true, start: '12:00', end: '20:00' },
      jueves: { enabled: true, start: '12:00', end: '20:00' },
      viernes: { enabled: true, start: '12:00', end: '20:00' },
      sabado: { enabled: true, start: '10:00', end: '18:00' },
      domingo: { enabled: false, start: '', end: '' },
    }
  },
  {
    id: 'prof_5',
    name: 'Gloria Ivon',
    email: 'gloria@example.com',
    avatar: 'https://placehold.co/100x100',
    dataAiHint: 'woman smiling',
    active: false,
    acceptsOnline: true,
    biography: 'Especialista en cuidado facial y masajes relajantes.',
    services: ['serv_10', 'serv_11'],
     schedule: {
      lunes: { enabled: false, start: '', end: '' },
      martes: { enabled: false, start: '', end: '' },
      miercoles: { enabled: true, start: '10:00', end: '19:00' },
      jueves: { enabled: true, start: '10:00', end: '19:00' },
      viernes: { enabled: true, start: '10:00', end: '19:00' },
      sabado: { enabled: true, start: '10:00', end: '19:00' },
      domingo: { enabled: true, start: '11:00', end: '16:00' },
    }
  },
];

export type Profesional = (typeof initialProfessionals)[0];
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
          <AvatarImage src={prof.avatar} data-ai-hint={prof.dataAiHint} />
          <AvatarFallback>{prof.name.substring(0, 2)}</AvatarFallback>
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
                    {prof.schedule[day as keyof typeof prof.schedule].enabled
                      ? <>
                          <span className="font-mono text-right">{prof.schedule[day as keyof typeof prof.schedule].start}</span>
                          <span className="font-mono text-right">{prof.schedule[day as keyof typeof prof.schedule].end}</span>
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


export default function ProfessionalsPage() {
  const [professionals, setProfessionals] = useState<Profesional[]>(initialProfessionals);
  const [editingProfessional, setEditingProfessional] = useState<Profesional | null | 'new'>(null);
  const [specialDayProfessional, setSpecialDayProfessional] = useState<Profesional | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isClientMounted, setIsClientMounted] = useState(false);
  const { toast } = useToast();
  
  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
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


  const handleToggleActive = (id: string, active: boolean) => {
    setProfessionals(professionals.map(p => p.id === id ? {...p, active} : p));
    toast({
        title: active ? "Profesional activado" : "Profesional desactivado"
    });
  }
  
  function handleDragStart(event: any) {
    setActiveId(event.active.id);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      setProfessionals((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        
        const newOrder = arrayMove(items, oldIndex, newIndex);
        
        // Here you would typically save the new order to the database.
        // For now, we'll just show a toast.
        toast({
            title: "Orden actualizado",
            description: "El nuevo orden de los profesionales ha sido guardado localmente."
        })
        
        return newOrder;
      });
    }
  }

  const activeProfessional = useMemo(() => professionals.find(p => p.id === activeId), [activeId, professionals]);

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
                                <SelectItem value="local1">VATOS ALFA Barber Shop</SelectItem>
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

            <Card>
                <CardHeader>
                    <CardTitle>VATOS ALFA Barber Shop</CardTitle>
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
                      <SortableContext items={professionals} strategy={verticalListSortingStrategy}>
                        <ul className="divide-y">
                          {professionals.map((prof) => (
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
        </div>
      </div>

      {editingProfessional && (
        <EditProfesionalModal
          profesional={editingProfessional === 'new' ? null : editingProfessional}
          isOpen={!!editingProfessional}
          onClose={handleCloseModal}
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
