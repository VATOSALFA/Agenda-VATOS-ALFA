
'use client';

import { useState, useMemo } from 'react';
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
  DropdownMenuSeparator
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
  Info,
  X,
  Trash2
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { EditServicioModal } from '@/components/admin/servicios/edit-servicio-modal';
import { AnimatePresence, motion } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';

interface Service {
  id: string;
  name: string;
  duration: string;
  price: number;
  active: boolean;
}

interface ServiceCategory {
  category: string;
  services: Service[];
}

const initialServicesByCategory: ServiceCategory[] = [
  {
    category: 'Barba',
    services: [
      {
        id: 'serv_01',
        name: 'Arreglo de barba, Afeitado clásico con toalla caliente',
        duration: '40 min',
        price: 165,
        active: true,
      },
      {
        id: 'serv_02',
        name: 'Arreglo de barba expres',
        duration: '30 min',
        price: 100,
        active: true,
      },
      {
        id: 'serv_03',
        name: 'Servicio de Barba Desactivado',
        duration: '20 min',
        price: 80,
        active: false,
      },
    ],
  },
  {
    category: 'Capilar',
    services: [
        { id: 'serv_04', name: 'Coloración Capilar', duration: '60 min', price: 900, active: true },
        { id: 'serv_05', name: 'Corte y lavado de cabello', duration: '40 min', price: 140, active: true },
        { id: 'serv_06', name: 'Corte clásico y moderno', duration: '40 min', price: 140, active: true },
        { id: 'serv_07', name: 'Grecas', duration: '20 min', price: 70, active: true },
        { id: 'serv_08', name: 'Lavado de cabello', duration: '10 min', price: 30, active: true },
    ]
  },
  {
      category: 'Facial',
      services: [
          { id: 'serv_09', name: 'Arreglo de ceja', duration: '15 min', price: 30, active: true },
          { id: 'serv_10', name: 'Facial completo con Masajeador relajante, spa y aceites', duration: '40 min', price: 190, active: true },
      ]
  }
];

export default function ServicesPage() {
  const [servicesByCategory, setServicesByCategory] = useState<ServiceCategory[]>(initialServicesByCategory);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [categoryFilter, setCategoryFilter] = useState('todos');
  
  const [serviceToDelete, setServiceToDelete] = useState<{ categoryId: string; serviceId: string } | null>(null);

  const handleApplyFilters = () => {
     toast({
        title: "Filtros aplicados",
        description: "La lista de servicios ha sido actualizada.",
    });
  }

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('todos');
    setCategoryFilter('todos');
     toast({
        title: "Filtros restablecidos",
    });
  }

  const filteredServicesByCategory = useMemo(() => {
    return servicesByCategory.map(categoryGroup => {
      const filtered = categoryGroup.services.filter(service => {
        const nameMatch = service.name.toLowerCase().includes(searchTerm.toLowerCase());
        const statusMatch = statusFilter === 'todos' || (statusFilter === 'activo' && service.active) || (statusFilter === 'inactivo' && !service.active);
        return nameMatch && statusMatch;
      });
      return { ...categoryGroup, services: filtered };
    }).filter(categoryGroup => categoryGroup.services.length > 0 && (categoryFilter === 'todos' || categoryGroup.category === categoryFilter));
  }, [searchTerm, statusFilter, categoryFilter, servicesByCategory]);


  const handleSaveCategory = () => {
    if (newCategoryName.trim() === '') {
        toast({ variant: 'destructive', title: 'Error', description: 'El nombre de la categoría no puede estar vacío.' });
        return;
    }
    // Here you would normally save to the database
    setServicesByCategory(prev => [...prev, { category: newCategoryName, services: [] }]);
    toast({
        title: "Categoría guardada",
        description: "La nueva categoría ha sido creada con éxito."
    })
    setNewCategoryName('');
    setIsAddingCategory(false);
  }

  const handleToggleActive = (categoryId: string, serviceId: string) => {
    setServicesByCategory(prev =>
      prev.map(cat => {
        if (cat.category === categoryId) {
          return {
            ...cat,
            services: cat.services.map(serv => {
              if (serv.id === serviceId) {
                toast({ title: `Servicio ${!serv.active ? 'activado' : 'desactivado'}` });
                return { ...serv, active: !serv.active };
              }
              return serv;
            }),
          };
        }
        return cat;
      })
    );
  };

  const handleDuplicateService = (categoryId: string, serviceToDuplicate: Service) => {
    const newService = {
      ...serviceToDuplicate,
      id: `serv_${Date.now()}`,
      name: `${serviceToDuplicate.name} (Copia)`,
    };
    setServicesByCategory(prev =>
      prev.map(cat => {
        if (cat.category === categoryId) {
          return { ...cat, services: [...cat.services, newService] };
        }
        return cat;
      })
    );
    toast({ title: "Servicio duplicado con éxito" });
  };

  const handleDeleteService = () => {
    if (!serviceToDelete) return;
    const { categoryId, serviceId } = serviceToDelete;

    setServicesByCategory(prev =>
      prev.map(cat => {
        if (cat.category === categoryId) {
          return {
            ...cat,
            services: cat.services.filter(s => s.id !== serviceId),
          };
        }
        return cat;
      })
    );
    toast({ title: "Servicio eliminado con éxito" });
    setServiceToDelete(null);
  };

  const openEditModal = (service: Service | null) => {
    setEditingService(service);
    setIsModalOpen(true);
  }

  return (
    <>
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Servicios</h2>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={() => setIsAddingCategory(true)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Nueva categoría
          </Button>
          <Button onClick={() => openEditModal(null)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Nuevo
          </Button>
        </div>
      </div>
      
      <AnimatePresence>
        {isAddingCategory && (
            <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="overflow-hidden"
            >
                <Card className="mb-4">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                            <Input 
                              placeholder="Nombre de la nueva categoría" 
                              className="flex-grow"
                              value={newCategoryName}
                              onChange={(e) => setNewCategoryName(e.target.value)}
                            />
                            <Button onClick={handleSaveCategory}>Guardar</Button>
                            <Button variant="ghost" onClick={() => setIsAddingCategory(false)}>Cancelar</Button>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        )}
      </AnimatePresence>


      <div className="flex items-center space-x-4 pb-4">
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
                  Aplica filtros para encontrar servicios.
                </p>
              </div>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status-filter">Estado</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger id="status-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="inactivo">Inactivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="category-filter">Categoría</Label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger id="category-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas</SelectItem>
                      {initialServicesByCategory.map(cat => (
                        <SelectItem key={cat.category} value={cat.category}>{cat.category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={handleResetFilters}>Restablecer</Button>
                <Button onClick={handleApplyFilters}>Buscar</Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nombre..." 
            className="pl-10" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {filteredServicesByCategory.map((categoryGroup) => (
              <div key={categoryGroup.category}>
                <div className="p-4">
                  <h3 className="text-lg font-semibold flex items-center">{categoryGroup.category} <Info className="ml-2 h-4 w-4 text-muted-foreground" /></h3>
                </div>
                {categoryGroup.services.length > 0 ? (
                  <ul className="divide-y divide-border">
                    {categoryGroup.services.map((service) => (
                      <li key={service.id} className="flex items-center justify-between p-4 hover:bg-muted/50">
                        <div className="flex items-center gap-4">
                          <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                          <span className="font-medium">{service.name}</span>
                        </div>
                        <div className="flex items-center gap-6">
                          <span className="text-sm text-muted-foreground">{service.duration}</span>
                          <span className="text-sm font-semibold">${service.price}</span>
                          <Badge className={cn(
                            service.active 
                            ? 'bg-green-100 text-green-800 border-green-200' 
                            : 'bg-red-100 text-red-800 border-red-200'
                          )}>
                            <Circle className={cn(
                              "mr-2 h-2 w-2 fill-current",
                              service.active ? 'text-green-600' : 'text-red-600'
                            )} />
                            {service.active ? 'Activo' : 'Inactivo'}
                          </Badge>
                          <div className="flex items-center gap-2">
                              <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm">
                                      Opciones <ChevronDown className="ml-2 h-4 w-4" />
                                  </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleToggleActive(categoryGroup.category, service.id)}>
                                      {service.active ? 'Desactivar' : 'Activar'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleDuplicateService(categoryGroup.category, service)}>
                                      Duplicar
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      className="text-destructive hover:!text-destructive focus:!bg-destructive/10 focus:!text-destructive"
                                      onClick={() => setServiceToDelete({ categoryId: categoryGroup.category, serviceId: service.id })}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4"/>
                                      Eliminar
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                              </DropdownMenu>
                              <Button variant="outline" size="sm" onClick={() => openEditModal(service)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Editar
                              </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 pb-4 text-sm text-muted-foreground">No hay servicios en esta categoría.</p>
                )}
              </div>
            ))}
             {filteredServicesByCategory.length === 0 && (
                <p className="py-10 text-center text-muted-foreground">No se encontraron servicios con los filtros aplicados.</p>
              )}
          </div>
        </CardContent>
      </Card>
    </div>
    <EditServicioModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

    <AlertDialog open={!!serviceToDelete} onOpenChange={() => setServiceToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. Se eliminará permanentemente el servicio.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteService}
            className="bg-destructive hover:bg-destructive/90"
          >
            Sí, eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
