
'use client';

import {
  Card,
  CardContent,
  CardDescription,
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
  Lightbulb,
  Filter,
  PlusCircle,
  MoreHorizontal,
  Pencil,
  Clock,
  Circle,
  ChevronDown
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const locales = [
  {
    name: 'VATOS ALFA Barber Shop',
    address: 'Av Cerro Sombrerete 1...',
    active: true,
  },
];

export default function LocalesPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Locales</h2>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" /> Nuevo local
        </Button>
      </div>

      <Alert>
        <Lightbulb className="h-4 w-4" />
        <AlertTitle>¡Configura el horario y la dirección del local!</AlertTitle>
        <AlertDescription>
          Con esta información, podrás y tus clientes podrán agendar sus citas en
          el sitio web.
        </AlertDescription>
      </Alert>

      <div className="py-2">
        <Button variant="outline">
          <Filter className="mr-2 h-4 w-4" /> Filtrar por
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {locales.map((local, index) => (
              <li key={index} className="flex items-center justify-between p-4">
                <div className="font-medium">
                  {local.name}
                  <span className="text-muted-foreground ml-2">
                    {local.address}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <Button variant="ghost" size="sm" className="text-muted-foreground">
                    <Clock className="mr-2 h-4 w-4" />
                    Ver horario
                  </Button>
                  <Badge variant={local.active ? 'default' : 'secondary'} className="bg-green-100 text-green-800 border-green-200">
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
    </div>
  );
}
