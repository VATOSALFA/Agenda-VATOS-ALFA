
'use client';

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

const professionals = [
  {
    name: 'Beatriz Elizarraga Casas',
    avatar: 'https://placehold.co/100x100',
    dataAiHint: 'woman portrait',
    active: true,
  },
  {
    name: 'Erick',
    avatar: 'https://placehold.co/100x100',
    dataAiHint: 'man portrait',
    active: true,
  },
    {
    name: 'Karina Ruiz Rosales',
    avatar: 'https://placehold.co/100x100',
    dataAiHint: 'woman glasses',
    active: true,
  },
    {
    name: 'Lupita',
    avatar: 'https://placehold.co/100x100',
    dataAiHint: 'woman happy',
    active: true,
  },
    {
    name: 'Gloria Ivon',
    avatar: 'https://placehold.co/100x100',
    dataAiHint: 'woman smiling',
    active: true,
  },
];

export default function ProfessionalsPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
       <Tabs defaultValue="profesionales">
        <div className="flex items-center justify-between">
            <TabsList>
                <TabsTrigger value="profesionales">Profesionales</TabsTrigger>
                <TabsTrigger value="grupos">Grupos Personalizados</TabsTrigger>
            </TabsList>
            <Button>
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
                    {professionals.map((prof, index) => (
                    <li key={index} className="flex items-center justify-between p-4 hover:bg-muted/50">
                        <div className="flex items-center gap-4">
                             <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                            <Avatar>
                                <AvatarImage src={prof.avatar} data-ai-hint={prof.dataAiHint} />
                                <AvatarFallback>{prof.name.substring(0,2)}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{prof.name}</span>
                        </div>
                        <div className="flex items-center gap-4">
                        <Button variant="ghost" size="sm" className="text-muted-foreground">
                            <Clock className="mr-2 h-4 w-4" />
                            Ver horario
                        </Button>
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
                            <DropdownMenuItem>Ver detalle</DropdownMenuItem>
                            <DropdownMenuItem>Desactivar</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="outline" size="sm">
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
  );
}
