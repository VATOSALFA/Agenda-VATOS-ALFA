
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Lightbulb,
  Filter,
  PlusCircle,
  Pencil,
  Clock,
  Circle,
  ChevronDown
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EditLocalModal } from '@/components/admin/locales/edit-local-modal';
import { NewLocalModal } from '@/components/admin/locales/new-local-modal';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Skeleton } from '@/components/ui/skeleton';

export interface Local {
  id: string;
  name: string;
  address: string;
  timezone: string;
  phone: string;
  email: string;
  whatsappPermission: boolean;
  active: boolean;
  schedule: {
    [key: string]: { enabled: boolean; start: string; end: string };
  };
}

export default function LocalesPage() {
  const [editingLocal, setEditingLocal] = useState<Local | null>(null);
  const [isNewLocalModalOpen, setIsNewLocalModalOpen] = useState(false);
  const [queryKey, setQueryKey] = useState(0); // Key to force re-fetch

  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales', queryKey);

  const handleDataUpdated = () => {
    setQueryKey(prevKey => prevKey + 1);
  };

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Locales</h2>
          <Button onClick={() => setIsNewLocalModalOpen(true)}>
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
                    Aplica filtros para encontrar locales específicos.
                  </p>
                </div>
                <div className="grid gap-2">
                  <div className="grid grid-cols-3 items-center gap-4">
                    <Label htmlFor="status">Estado</Label>
                    <Select>
                      <SelectTrigger id="status" className="col-span-2 h-8">
                        <SelectValue placeholder="Seleccionar estado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="activo">Activo</SelectItem>
                        <SelectItem value="inactivo">Inactivo</SelectItem>
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
          <CardContent className="p-0">
            {localesLoading ? (
               <ul className="divide-y">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="flex items-center justify-between p-4">
                    <div className="font-medium">
                      <Skeleton className="h-5 w-48 mb-2" />
                      <Skeleton className="h-4 w-64" />
                    </div>
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-8 w-24" />
                      <Skeleton className="h-6 w-20" />
                      <Skeleton className="h-9 w-28" />
                      <Skeleton className="h-9 w-24" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="divide-y">
                {locales.map((local) => (
                  <li key={local.id} className="flex items-center justify-between p-4">
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
                      <Button variant="outline" size="sm" onClick={() => setEditingLocal(local)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            
          </CardContent>
        </Card>
      </div>

      <NewLocalModal 
        isOpen={isNewLocalModalOpen} 
        onOpenChange={setIsNewLocalModalOpen}
        onLocalCreated={handleDataUpdated}
      />

      {editingLocal && (
        <EditLocalModal
          local={editingLocal}
          isOpen={!!editingLocal}
          onOpenChange={(isOpen) => !isOpen && setEditingLocal(null)}
          onLocalUpdated={handleDataUpdated}
        />
      )}
    </>
  );
}
