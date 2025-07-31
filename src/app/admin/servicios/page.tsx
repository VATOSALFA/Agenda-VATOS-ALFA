

'use client';

import { useState, useMemo, useEffect } from 'react';
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
  Trash2,
  Check
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
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { db } from '@/lib/firebase';
import { collection, doc, addDoc, updateDoc, deleteDoc, writeBatch, Timestamp } from 'firebase/firestore';
import { CategoryModal } from '@/components/admin/servicios/category-modal';
import { Skeleton } from '@/components/ui/skeleton';


export interface Service {
  id: string;
  name: string;
  duration: number;
  price: number;
  category: string;
  active: boolean;
  order: number;
  defaultCommission?: { value: number, type: '%' | '$' };
}

export interface ServiceCategory {
  id: string;
  name: string;
  order: number;
}

interface GroupedService extends ServiceCategory {
    services: Service[];
}


export default function ServicesPage() {
  const [queryKey, setQueryKey] = useState(0);
  const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios', queryKey);
  const { data: categories, loading: categoriesLoading } = useFirestoreQuery<ServiceCategory>('categorias_servicios', queryKey);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [categoryFilter, setCategoryFilter] = useState('todos');
  
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);
  
  const handleDataUpdated = () => {
    setQueryKey(prev => prev + 1);
  };

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

  const servicesByCategory = useMemo(() => {
    if (categoriesLoading || servicesLoading) return [];
    
    const sortedCategories = [...categories].sort((a,b) => a.order - b.order);
    const sortedServices = [...services].sort((a,b) => a.order - b.order);

    return sortedCategories.map(category => ({
      ...category,
      services: sortedServices.filter(service => service.category === category.id)
    }));
  }, [categories, services, categoriesLoading, servicesLoading]);


  const filteredServicesByCategory = useMemo(() => {
    return servicesByCategory.map(categoryGroup => {
      const filtered = categoryGroup.services.filter(service => {
        const nameMatch = service.name.toLowerCase().includes(searchTerm.toLowerCase());
        const statusMatch = statusFilter === 'todos' || (statusFilter === 'activo' && service.active) || (statusFilter === 'inactivo' && !service.active);
        return nameMatch && statusMatch;
      });
      return { ...categoryGroup, services: filtered };
    }).filter(categoryGroup => categoryGroup.services.length > 0 && (categoryFilter === 'todos' || categoryGroup.id === categoryFilter));
  }, [searchTerm, statusFilter, categoryFilter, servicesByCategory]);


  const handleSaveCategory = async () => {
    if (newCategoryName.trim() === '') {
        toast({ variant: 'destructive', title: 'Error', description: 'El nombre de la categoría no puede estar vacío.' });
        return;
    }
    try {
        await addDoc(collection(db, 'categorias_servicios'), {
            name: newCategoryName.trim(),
            order: categories.length, // Add to the end
            created_at: Timestamp.now(),
        });
        toast({
            title: "Categoría guardada",
            description: `La nueva categoría "${newCategoryName.trim()}" ha sido creada con éxito.`
        });
        handleDataUpdated();
        setNewCategoryName('');
        setIsAddingCategory(false);
    } catch (error) {
        console.error("Error creating category:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo crear la categoría.' });
    }
  }

  const handleToggleActive = async (service: Service) => {
    const newStatus = !service.active;
    try {
        const serviceRef = doc(db, 'servicios', service.id);
        await updateDoc(serviceRef, { active: newStatus });
        toast({ title: `Servicio ${newStatus ? 'activado' : 'desactivado'}` });
        handleDataUpdated();
    } catch (error) {
        console.error("Error toggling active status:", error);
        toast({ variant: 'destructive', title: 'Error al actualizar.' });
    }
  };

  const handleDuplicateService = async (serviceToDuplicate: Service) => {
    try {
        await addDoc(collection(db, 'servicios'), {
            ...serviceToDuplicate,
            name: `${serviceToDuplicate.name} (Copia)`,
            order: services.length,
            created_at: Timestamp.now(),
        });
        toast({ title: "Servicio duplicado con éxito" });
        handleDataUpdated();
    } catch (error) {
        console.error("Error duplicating service:", error);
        toast({ variant: 'destructive', title: 'Error al duplicar.' });
    }
  };

  const handleDeleteService = async () => {
    if (!serviceToDelete) return;
    try {
        await deleteDoc(doc(db, 'servicios', serviceToDelete.id));
        toast({ title: "Servicio eliminado con éxito" });
        setServiceToDelete(null);
        handleDataUpdated();
    } catch (error) {
        console.error("Error deleting service:", error);
        toast({ variant: 'destructive', title: 'Error al eliminar.' });
    }
  };

  const openEditModal = (service: Service | null) => {
    setEditingService(service);
    setIsModalOpen(true);
  }
  
  const closeModal = () => {
      setEditingService(null);
      setIsModalOpen(false);
  }

  return (
    <>
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Servicios</h2>
        <div className="flex items-center space-x-2">
           {isAddingCategory ? (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-2"
            >
              <Input 
                placeholder="Nombre de la categoría" 
                className="w-48 h-9"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveCategory()}
              />
              <Button size="sm" onClick={handleSaveCategory}>Guardar</Button>
              <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setIsAddingCategory(false)}><X className="h-4 w-4" /></Button>
            </motion.div>
          ) : (
            <Button variant="outline" onClick={() => setIsAddingCategory(true)}>
              <PlusCircle className="mr-2 h-4 w-4" /> Nueva categoría
            </Button>
          )}

          <Button onClick={() => openEditModal(null)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Nuevo
          </Button>
        </div>
      </div>

      <div className="flex items-center space-x-4 pt-4 pb-4">
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
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
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
            {(servicesLoading || categoriesLoading) ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 space-y-4">
                  <Skeleton className="h-6 w-1/4" />
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                </div>
              ))
            ) : filteredServicesByCategory.map((categoryGroup) => (
              <div key={categoryGroup.id}>
                <div className="p-4">
                  <h3 className="text-lg font-semibold flex items-center">{categoryGroup.name} <Info className="ml-2 h-4 w-4 text-muted-foreground" /></h3>
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
                          <span className="text-sm text-muted-foreground">{service.duration} min</span>
                          <span className="text-sm font-semibold">${service.price.toLocaleString('es-CL')}</span>
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
                                    <DropdownMenuItem onClick={() => handleToggleActive(service)}>
                                      {service.active ? 'Desactivar' : 'Activar'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleDuplicateService(service)}>
                                      Duplicar
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      className="text-destructive hover:!text-destructive focus:!bg-destructive/10 focus:!text-destructive"
                                      onClick={() => setServiceToDelete(service)}
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
                  <p className="px-4 pb-4 text-sm text-muted-foreground">No hay servicios en esta categoría que coincidan con los filtros.</p>
                )}
              </div>
            ))}
             {(!servicesLoading && !categoriesLoading && filteredServicesByCategory.length === 0) && (
                <p className="py-10 text-center text-muted-foreground">No se encontraron servicios con los filtros aplicados.</p>
              )}
          </div>
        </CardContent>
      </Card>
    </div>
    
    <EditServicioModal 
      isOpen={isModalOpen} 
      onClose={closeModal}
      service={editingService}
      onDataSaved={handleDataUpdated}
    />

    <AlertDialog open={!!serviceToDelete} onOpenChange={() => setServiceToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. Se eliminará permanentemente el servicio "{serviceToDelete?.name}".
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
