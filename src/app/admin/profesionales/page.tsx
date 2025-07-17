
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import {
  Lightbulb,
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

const professionals = [
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
    active: true,
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

export type Profesional = (typeof professionals)[0];
const daysOfWeek = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

export default function ProfessionalsPage() {
  const [editingProfessional, setEditingProfessional] = useState<Profesional | null | 'new'>(null);

  const handleOpenModal = (profesional: Profesional | 'new') => {
    setEditingProfessional(profesional);
  };

  const handleCloseModal = () => {
    setEditingProfessional(null);
  };
  
  return (
    <TooltipProvider>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
       <Tabs defaultValue="profesionales">
        <div className="flex items-center justify-between">
            <TabsList>
                <TabsTrigger value="profesionales">Profesionales</TabsTrigger>
                <TabsTrigger value="grupos">Grupos Personalizados</TabsTrigger>
            </TabsList>
            <Button onClick={() => handleOpenModal('new')}>
                <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Profesional
            </Button>
        </div>

        <TabsContent value="profesionales" className="space-y-4">
            <Alert>
                <Lightbulb className="h-4 w-4" />
                <AlertTitle>¡Edita a tu primer profesional!</AlertTitle>
                <AlertDescription>
                Agrega más personas a tu equipo de trabajo. Puedes editar sus horarios, qué servicios realizan y más.
                </AlertDescription>
            </Alert>

            <div className="py-2">
                <Button variant="outline">
                <Filter className="mr-2 h-4 w-4" /> Filtrar por
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>VATOS ALFA Barber Shop</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                <ul className="divide-y">
                    {professionals.map((prof) => (
                    <li key={prof.id} className="flex items-center justify-between p-4 hover:bg-muted/50">
                        <div className="flex items-center gap-4">
                             <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                            <Avatar>
                                <AvatarImage src={prof.avatar} data-ai-hint={prof.dataAiHint} />
                                <AvatarFallback>{prof.name.substring(0,2)}</AvatarFallback>
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
                                    <h4 className="font-bold mb-2">Horario de {prof.name}</h4>
                                    <ul className="space-y-1">
                                        {daysOfWeek.map(day => (
                                            <li key={day} className="flex justify-between gap-4">
                                                <span className="capitalize">{day}:</span>
                                                <span className="font-mono">
                                                    {prof.schedule[day as keyof typeof prof.schedule].enabled 
                                                        ? `${prof.schedule[day as keyof typeof prof.schedule].start} - ${prof.schedule[day as keyof typeof prof.schedule].end}`
                                                        : 'Cerrado'}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </TooltipContent>
                        </Tooltip>

                        <Badge variant={prof.active ? 'default' : 'secondary'} className="bg-green-100 text-green-800 border-green-200">
                            <Circle className="mr-2 h-2 w-2 fill-current text-green-600"/>
                            Activo
                        </Badge>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                                Opciones <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            <DropdownMenuItem>Habilitar jornada especial</DropdownMenuItem>
                            <DropdownMenuItem>Desactivar profesional</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="outline" size="sm" onClick={() => handleOpenModal(prof)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                        </Button>
                        </div>
                    </li>
                    ))}
                </ul>
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="grupos">
            <Card>
                <CardContent className="p-6">
                    <p className="text-muted-foreground text-center">La gestión de grupos personalizados estará disponible aquí.</p>
                </CardContent>
            </Card>
        </TabsContent>
       </Tabs>
      </div>

      {editingProfessional && (
        <EditProfesionalModal
          profesional={editingProfessional === 'new' ? null : editingProfessional}
          isOpen={!!editingProfessional}
          onClose={handleCloseModal}
        />
      )}
    </TooltipProvider>
  );
}
