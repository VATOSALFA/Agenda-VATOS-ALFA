
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Filter, Circle, Search, Pencil, Trash2, GripVertical, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EditServicioModal } from '@/components/admin/servicios/edit-servicio-modal';
import { CategoryModal } from '@/components/admin/servicios/category-modal';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/firebase';
import { Input } from '@/components/ui/input';
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor, KeyboardSensor, DragOverlay, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Service, ServiceCategory } from '@/lib/types';


const SortableServiceItem = ({
  service,
  categoryName,
  onToggleActive,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast
}: {
  service: Service,
  categoryName: string,
  onToggleActive: (service: Service) => void,
  onEdit: (service: Service) => void,
  onDelete: (service: Service) => void,
  onMoveUp: (service: Service) => void,
  onMoveDown: (service: Service) => void,
  isFirst: boolean,
  isLast: boolean
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: service.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    boxShadow: isDragging ? '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)' : 'none'
  };

  return (
    <TableRow ref={setNodeRef} style={style} className={isDragging ? 'bg-muted shadow-lg' : ''}>
      <TableCell className="w-24 text-center">
        <div className="flex items-center justify-center gap-1">
          <div {...attributes} {...listeners} className="cursor-grab p-1 text-muted-foreground hover:bg-accent rounded-md">
            <GripVertical className="h-4 w-4" />
          </div>
          <div className="flex flex-col gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={(e) => { e.stopPropagation(); onMoveUp(service); }}
              disabled={isFirst}
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={(e) => { e.stopPropagation(); onMoveDown(service); }}
              disabled={isLast}
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </TableCell>
      <TableCell className="font-medium">{service.name}</TableCell>
      <TableCell>{categoryName}</TableCell>
      <TableCell>{service.duration} min</TableCell>
      <TableCell>${service.price.toLocaleString('es-MX')}</TableCell>
      <TableCell>
        <Badge variant={service.active ? 'default' : 'secondary'} className={service.active ? 'bg-primary/10 text-primary border-primary/30' : 'bg-accent/20 text-accent-foreground border-accent/50'}>
          <Circle className={`mr-2 h-2 w-2 fill-current ${service.active ? 'text-primary' : 'text-accent-foreground'}`} />
          {service.active ? 'Activo' : 'Inactivo'}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Abrir menú</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(service)}>
              <Pencil className="mr-2 h-4 w-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onToggleActive(service)}>
              <Circle className={`mr-2 h-4 w-4 ${!service.active ? 'text-primary' : 'text-gray-400'}`} />
              {service.active ? 'Desactivar' : 'Activar'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDelete(service)} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};


export default function ServiciosPage() {
  const [queryKey, setQueryKey] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: allServices, loading: servicesLoading } = useFirestoreQuery<Service>('servicios', queryKey);
  const { data: allCategories, loading: categoriesLoading } = useFirestoreQuery<ServiceCategory>('categorias_servicios', queryKey);

  const [services, setServices] = useState(allServices);

  useEffect(() => {
    // Sort items by order initially to ensure stability
    // Fix: Use nullish coalescing (??) because order can be 0, and 0 || 99 results in 99, causing the first item to jump to end.
    const sorted = [...allServices].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    setServices(sorted);
  }, [allServices]);

  const { toast } = useToast();

  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);

  const categoryMap = useMemo(() => {
    return allCategories.reduce((map, category) => {
      map[category.id] = category.name;
      return map;
    }, {} as Record<string, string>);
  }, [allCategories]);

  const filteredServices = useMemo(() => {
    const sortedServices = [...services].sort((a, b) => (a.order || 99) - (b.order || 99));
    if (!searchTerm) return sortedServices;
    return sortedServices.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [services, searchTerm]);

  const packageCategoryIds = useMemo(() => {
    return allCategories
      .filter(c => c.name.toLowerCase().includes('paquete') || c.name.toLowerCase().includes('package'))
      .map(c => c.id);
  }, [allCategories]);

  // Unfiltered lists for robust reordering
  const allRegularServices = useMemo(() => services.filter(s => !packageCategoryIds.includes(s.category)), [services, packageCategoryIds]);
  const allPackageServices = useMemo(() => services.filter(s => packageCategoryIds.includes(s.category)), [services, packageCategoryIds]);

  // Filtered lists for display
  const regularServices = useMemo(() => {
    if (!searchTerm) return allRegularServices;
    return allRegularServices.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [allRegularServices, searchTerm]);

  const packageServices = useMemo(() => {
    if (!searchTerm) return allPackageServices;
    return allPackageServices.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [allPackageServices, searchTerm]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDataUpdated = (newCategory?: ServiceCategory) => {
    setQueryKey(prev => prev + 1);
  };

  const handleOpenNewService = () => {
    setEditingService(null);
    setIsServiceModalOpen(true);
  }

  const handleEditService = (service: Service) => {
    setEditingService(service);
    setIsServiceModalOpen(true);
  };

  const handleDeleteService = async () => {
    if (!serviceToDelete || !db) return;
    try {
      await deleteDoc(doc(db, 'servicios', serviceToDelete.id));
      toast({ title: "Servicio eliminado con éxito" });
      handleDataUpdated();
    } catch (error) {
      toast({ variant: 'destructive', title: "Error al eliminar" });
    } finally {
      setServiceToDelete(null);
    }
  }

  const handleToggleActive = async (service: Service) => {
    if (!db) return;
    try {
      const serviceRef = doc(db, 'servicios', service.id);
      await updateDoc(serviceRef, { active: !service.active });
      toast({
        title: `Servicio ${!service.active ? 'activado' : 'desactivado'}`,
      });
      handleDataUpdated();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error al actualizar estado',
      });
    }
  }

  function handleDragStart(event: DragEndEvent) {
    setActiveId(event.active.id as string);
  }

  const updateServiceOrder = async (newOrder: Service[]) => {
    // Optimization: Only update items that actually changed position/order
    const itemsToUpdate: { ref: any; newOrder: number }[] = [];

    // Prepare the optimistic state with updated order values
    const optimisticOrder = newOrder.map((service, index) => {
      // If the service's current order doesn't match its new index, it needs an update
      if (service.order !== index) {
        itemsToUpdate.push({
          ref: doc(db!, "servicios", service.id),
          newOrder: index
        });
        return { ...service, order: index };
      }
      return service;
    });

    setServices(optimisticOrder);

    if (!db || itemsToUpdate.length === 0) return;

    try {
      const batch = writeBatch(db);
      itemsToUpdate.forEach((item) => {
        batch.update(item.ref, { order: item.newOrder });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error updating service order:", error);
      toast({ variant: 'destructive', title: 'Error al guardar el orden' });
    }
  };

  const reorderGlobalList = async (subset: Service[], oldIndex: number, newIndex: number) => {
    const isPackageList = subset.some(s => packageCategoryIds.includes(s.category));

    // Perform the move on the specific list we are editing
    let updatedRegular = [...allRegularServices];
    let updatedPackages = [...allPackageServices];

    if (isPackageList) {
      updatedPackages = arrayMove(updatedPackages, oldIndex, newIndex);
    } else {
      updatedRegular = arrayMove(updatedRegular, oldIndex, newIndex);
    }

    // Reconstruct the master list by concatenating Regular then Packages
    // This enforces a physical separation in the order values:
    // Regular: 0 to N
    // Packages: N+1 to M
    const newGlobalList = [...updatedRegular, ...updatedPackages];

    await updateServiceOrder(newGlobalList);
  };

  const handleMoveUp = async (service: Service) => {
    if (searchTerm) return; // Disable reorder when searching

    const isPackage = packageCategoryIds.includes(service.category);
    const subset = isPackage ? allPackageServices : allRegularServices;

    const index = subset.findIndex(s => s.id === service.id);
    if (index <= 0) return;

    await reorderGlobalList(subset, index, index - 1);
  };

  const handleMoveDown = async (service: Service) => {
    if (searchTerm) return; // Disable reorder when searching

    const isPackage = packageCategoryIds.includes(service.category);
    const subset = isPackage ? allPackageServices : allRegularServices;

    const index = subset.findIndex(s => s.id === service.id);
    if (index === -1 || index >= subset.length - 1) return;

    await reorderGlobalList(subset, index, index + 1);
  };

  async function handleDragEnd(event: DragEndEvent) {
    if (searchTerm) return; // Should be prevented by UI, but safety check

    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const activeService = services.find(s => s.id === active.id);
      if (!activeService) return;

      const isPackage = packageCategoryIds.includes(activeService.category);

      // Use the unfiltered lists for index calculations
      const subset = isPackage ? allPackageServices : allRegularServices;
      const otherSubset = isPackage ? allRegularServices : allPackageServices;

      // Ensure we are not dragging across lists (sanity check)
      const isOverInSubset = subset.some(s => s.id === over.id);
      if (!isOverInSubset) return;

      const oldIndex = subset.findIndex(item => item.id === active.id);
      const newIndex = subset.findIndex(item => item.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        await reorderGlobalList(subset, oldIndex, newIndex);
      }
    }
  }

  const activeService = useMemo(() => services.find(s => s.id === activeId), [activeId, services]);
  const isLoading = servicesLoading || categoriesLoading;

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Servicios</h2>
          <p className="text-muted-foreground">
            Administra los servicios que ofreces en tu negocio.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsCategoryModalOpen(true)}>Administrar Categorías</Button>
          <Button onClick={handleOpenNewService}><Plus className="mr-2 h-4 w-4" />Nuevo Servicio</Button>
        </div>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}>
        <div className="space-y-8">
          {/* Services Section */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Listado de Servicios</CardTitle>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar servicio..." className="pl-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
                </div>
              </div>
              <CardDescription>Estos servicios aparecerán en la sección principal.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <SortableContext items={regularServices.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Duración</TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Opciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={7}><Skeleton className="h-10 w-full" /></TableCell>
                        </TableRow>
                      ))
                    ) : regularServices.length > 0 ? (
                      regularServices.map((service, index) => (
                        <SortableServiceItem
                          key={service.id}
                          service={service}
                          categoryName={categoryMap[service.category] || 'Sin categoría'}
                          onToggleActive={handleToggleActive}
                          onEdit={handleEditService}
                          onDelete={setServiceToDelete}
                          onMoveUp={handleMoveUp}
                          onMoveDown={handleMoveDown}
                          isFirst={index === 0}
                          isLast={index === regularServices.length - 1}
                        />
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center">No hay servicios regulares.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </SortableContext>
            </CardContent>
          </Card>

          {/* Packages Section */}
          {packageServices.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Listado de Paquetes</CardTitle>
                <CardDescription>Estos elementos aparecerán en la sección "Paquetes".</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <SortableContext items={packageServices.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Duración</TableHead>
                        <TableHead>Precio</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Opciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {packageServices.map((service, index) => (
                        <SortableServiceItem
                          key={service.id}
                          service={service}
                          categoryName={categoryMap[service.category] || 'Sin categoría'}
                          onToggleActive={handleToggleActive}
                          onEdit={handleEditService}
                          onDelete={setServiceToDelete}
                          onMoveUp={handleMoveUp}
                          onMoveDown={handleMoveDown}
                          isFirst={index === 0}
                          isLast={index === packageServices.length - 1}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </SortableContext>
              </CardContent>
            </Card>
          )}
        </div>
        <DragOverlay>
          {activeService && !searchTerm ? (
            <Table>
              <TableBody>
                <SortableServiceItem
                  service={activeService}
                  categoryName={categoryMap[activeService.category] || 'Sin categoría'}
                  onToggleActive={() => { }}
                  onEdit={() => { }}
                  onDelete={() => { }}
                  onMoveUp={() => { }}
                  onMoveDown={() => { }}
                  isFirst={false}
                  isLast={false}
                />
              </TableBody>
            </Table>
          ) : null}
        </DragOverlay>
      </DndContext>

      <EditServicioModal isOpen={isServiceModalOpen} onClose={() => setIsServiceModalOpen(false)} service={editingService} onDataSaved={handleDataUpdated} />
      <CategoryModal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} onDataSaved={handleDataUpdated} existingCategories={allCategories} />
      {serviceToDelete && (
        <AlertDialog open={!!serviceToDelete} onOpenChange={() => setServiceToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. Se eliminará permanentemente el servicio "{serviceToDelete.name}".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteService} className="bg-destructive hover:bg-destructive/90">
                Sí, eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
