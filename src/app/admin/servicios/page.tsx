
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Filter, Circle, Search, Pencil, Trash2 } from 'lucide-react';
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
import type { Service, ServiceCategory } from '@/lib/types';


const SortableServiceItem = ({ service, categoryName, onToggleActive, onEdit, onDelete }: { service: Service, categoryName: string, onToggleActive: (service: Service) => void, onEdit: (service: Service) => void, onDelete: (service: Service) => void }) => {
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
      <TableCell className="w-12 text-center">
        <div {...attributes} {...listeners} className="cursor-grab p-2">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 4.625C5.5 4.30924 5.75924 4.05 6.075 4.05H8.925C9.24076 4.05 9.5 4.30924 9.5 4.625V4.625C9.5 4.94076 9.24076 5.2 8.925 5.2H6.075C5.75924 5.2 5.5 4.94076 5.5 4.625V4.625ZM5.5 7.5C5.5 7.18424 5.75924 6.925 6.075 6.925H8.925C9.24076 6.925 9.5 7.18424 9.5 7.5V7.5C9.5 7.81576 9.24076 8.075 8.925 8.075H6.075C5.75924 8.075 5.5 7.81576 5.5 7.5V7.5ZM5.5 10.375C5.5 10.0592 5.75924 9.8 6.075 9.8H8.925C9.24076 9.8 9.5 10.0592 9.5 10.375V10.375C9.5 10.6908 9.24076 10.95 8.925 10.95H6.075C5.75924 10.95 5.5 10.6908 5.5 10.375V10.375Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
        </div>
      </TableCell>
      <TableCell className="font-medium">{service.name}</TableCell>
      <TableCell>{categoryName}</TableCell>
      <TableCell>{service.duration} min</TableCell>
      <TableCell>${service.price.toLocaleString('es-MX')}</TableCell>
      <TableCell>
        <Badge variant={service.active ? 'default' : 'secondary'} className={service.active ? 'bg-green-100 text-green-800' : ''}>
          <Circle className={`mr-2 h-2 w-2 fill-current ${service.active ? 'text-green-500' : 'text-gray-400'}`}/>
          {service.active ? 'Activo' : 'Inactivo'}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="icon" onClick={() => onToggleActive(service)}><Pencil className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => onEdit(service)}><Pencil className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => onDelete(service)}><Trash2 className="h-4 w-4" /></Button>
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
    setServices(allServices);
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
    const sortedServices = [...services].sort((a,b) => (a.order || 99) - (b.order || 99));
    if(!searchTerm) return sortedServices;
    return sortedServices.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [services, searchTerm]);

  const servicesByCategory = useMemo(() => {
    const grouped: Record<string, Service[]> = {};
    filteredServices.forEach(service => {
        const categoryName = categoryMap[service.category] || 'Sin categoría';
        if (!grouped[categoryName]) {
            grouped[categoryName] = [];
        }
        grouped[categoryName].push(service);
    });
    return Object.entries(grouped).sort(([catA], [catB]) => catA.localeCompare(catB));
  }, [filteredServices, categoryMap]);
  
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
    } catch(error) {
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
    } catch(error) {
        toast({
            variant: 'destructive',
            title: 'Error al actualizar estado',
        });
    }
  }

  function handleDragStart(event: DragEndEvent) {
    setActiveId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    
    if (over && active.id !== over.id) {
        const oldIndex = services.findIndex(item => item.id === active.id);
        const newIndex = services.findIndex(item => item.id === over.id);
        const newOrder = arrayMove(services, oldIndex, newIndex);
        setServices(newOrder); // Optimistic update
        
        if (!db) return;
        try {
            const batch = writeBatch(db);
            newOrder.forEach((service, index) => {
                const serviceRef = doc(db, "servicios", service.id);
                batch.update(serviceRef, { order: index });
            });
            await batch.commit();
            toast({ title: 'Orden de servicios actualizado' });
        } catch (error) {
            console.error("Error updating service order:", error);
            toast({ variant: 'destructive', title: 'Error al guardar el orden' });
            setServices(services); // Revert on failure
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
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Listado de servicios</CardTitle>
            <div className="flex gap-2">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar servicio..." className="pl-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}>
            <SortableContext items={filteredServices} strategy={verticalListSortingStrategy}>
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
                    Array.from({length: 5}).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={7}><Skeleton className="h-10 w-full" /></TableCell>
                      </TableRow>
                    ))
                  ) : servicesByCategory.flatMap(([categoryName, services]) =>
                      services.map(service => (
                          <SortableServiceItem 
                              key={service.id} 
                              service={service} 
                              categoryName={categoryName}
                              onToggleActive={handleToggleActive}
                              onEdit={handleEditService}
                              onDelete={setServiceToDelete}
                          />
                      ))
                  )}
                </TableBody>
              </Table>
            </SortableContext>
            <DragOverlay>
                {activeService ? (
                    <Table>
                        <TableBody>
                            <SortableServiceItem
                                service={activeService}
                                categoryName={categoryMap[activeService.category] || 'Sin categoría'}
                                onToggleActive={() => {}}
                                onEdit={() => {}}
                                onDelete={() => {}}
                            />
                        </TableBody>
                    </Table>
                ) : null}
            </DragOverlay>
          </DndContext>
        </CardContent>
      </Card>
      
      <EditServicioModal isOpen={isServiceModalOpen} onClose={() => setIsServiceModalOpen(false)} service={editingService} onDataSaved={handleDataUpdated} />
      <CategoryModal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} onDataSaved={handleDataUpdated} existingCategories={allCategories}/>
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
