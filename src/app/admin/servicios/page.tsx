
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
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Filter,
  Search,
  PlusCircle,
  Pencil,
  Circle,
  ChevronDown,
  GripVertical,
  Info
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { EditServicioModal } from '@/components/admin/servicios/edit-servicio-modal';

const servicesByCategory = [
  {
    category: 'Barba',
    services: [
      {
        name: 'Arreglo de barba, Afeitado clásico con toalla caliente',
        duration: '40 min',
        price: 165,
        active: true,
      },
      {
        name: 'Arreglo de barba expres',
        duration: '30 min',
        price: 100,
        active: true,
      },
    ],
  },
  {
    category: 'Capilar',
    services: [
        { name: 'Coloración Capilar', duration: '60 min', price: 900, active: true },
        { name: 'Corte y lavado de cabello', duration: '40 min', price: 140, active: true },
        { name: 'Corte clásico y moderno', duration: '40 min', price: 140, active: true },
        { name: 'Grecas', duration: '20 min', price: 70, active: true },
        { name: 'Lavado de cabello', duration: '10 min', price: 30, active: true },
    ]
  },
  {
      category: 'Facial',
      services: [
          { name: 'Arreglo de ceja', duration: '15 min', price: 30, active: true },
          { name: 'Facial completo con Masajeador relajante, spa y aceites', duration: '40 min', price: 190, active: true },
      ]
  }
];

export default function ServicesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Servicios</h2>
        <div className="flex items-center space-x-2">
          <Button variant="outline">
            <PlusCircle className="mr-2 h-4 w-4" /> Nueva categoría
          </Button>
          <Button onClick={() => setIsModalOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Nuevo
          </Button>
        </div>
      </div>
      
      <div className="flex items-center space-x-4 pb-4">
        <Button variant="outline">
          <Filter className="mr-2 h-4 w-4" /> Filtrar por
        </Button>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre..." className="pl-10" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {servicesByCategory.map((categoryGroup) => (
              <div key={categoryGroup.category}>
                <div className="p-4">
                  <h3 className="text-lg font-semibold flex items-center">{categoryGroup.category} <Info className="ml-2 h-4 w-4 text-muted-foreground" /></h3>
                </div>
                <ul className="divide-y divide-border">
                  {categoryGroup.services.map((service, index) => (
                    <li key={index} className="flex items-center justify-between p-4 hover:bg-muted/50">
                      <div className="flex items-center gap-4">
                        <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                        <span className="font-medium">{service.name}</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="text-sm text-muted-foreground">{service.duration}</span>
                        <span className="text-sm font-semibold">${service.price}</span>
                        <Badge variant={service.active ? 'default' : 'secondary'} className="bg-green-100 text-green-800 border-green-200">
                          <Circle className="mr-2 h-2 w-2 fill-current text-green-600" />
                          Activo
                        </Badge>
                        <div className="flex items-center gap-2">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                    Opciones <ChevronDown className="ml-2 h-4 w-4" />
                                </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                <DropdownMenuItem>Desactivar</DropdownMenuItem>
                                <DropdownMenuItem>Duplicar</DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive hover:!text-destructive">Eliminar</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <Button variant="outline" size="sm">
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar
                            </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
    <EditServicioModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
