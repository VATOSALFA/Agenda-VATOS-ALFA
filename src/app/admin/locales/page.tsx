
'use client';

import { useState } from 'react';
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
  Filter,
  PlusCircle,
  Pencil,
  ChevronDown,
  Info,
  Circle,
} from 'lucide-react';
import { NewLocalModal } from '@/components/admin/locales/new-local-modal';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

interface Local {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  status: 'active' | 'inactive';
}

export default function LocalesPage() {
  const [isNewLocalModalOpen, setIsNewLocalModalOpen] = useState(false);
  const [queryKey, setQueryKey] = useState(0);

  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales', queryKey);

  const handleLocalCreated = () => {
    setQueryKey(prev => prev + 1); // Refreshes the data
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
          <Button onClick={() => setIsNewLocalModalOpen(true)}>
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
                       <Badge className="bg-green-100 text-green-800 border-green-200">
                         <Circle className="mr-2 h-2 w-2 fill-current text-green-600" />
                         Activo
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
                        <DropdownMenuItem>Desactivar</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive hover:!text-destructive">Eliminar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button variant="outline" size="sm">
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
        isOpen={isNewLocalModalOpen}
        onClose={() => setIsNewLocalModalOpen(false)}
        onLocalCreated={handleLocalCreated}
      />
    </>
  );
}
