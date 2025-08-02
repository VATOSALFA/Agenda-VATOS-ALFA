
'use client';

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoreHorizontal, PlusCircle, Search, Upload, Filter, Trash2, Calendar as CalendarIcon, User, VenetianMask, Combine, Download, ChevronDown, Plus, AlertTriangle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Client, Local, Profesional, Service, Reservation, Product, Sale } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { NewClientForm } from "@/components/clients/new-client-form";
import { ClientDetailModal } from "@/components/clients/client-detail-modal";
import { NewReservationForm } from "@/components/reservations/new-reservation-form";
import { CombineClientsModal } from "@/components/clients/combine-clients-modal";
import { format, startOfDay, endOfDay } from "date-fns";
import { es } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { deleteDoc, doc, where, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

const FiltersSidebar = ({
    onApply,
    onReset,
    dateRange, setDateRange,
    localFilter, setLocalFilter,
    professionalFilter, setProfessionalFilter,
    serviceFilter, setServiceFilter,
    productFilter, setProductFilter,
    locales, professionals, services, products,
    isLoading
  }: any) => {

    return (
        <div className="space-y-4">
            <h3 className="text-xl font-bold">Filtros avanzados</h3>
            <div className="space-y-3">
                 <div className="space-y-1">
                    <Label>Periodo de consumo</Label>
                     <Popover>
                        <PopoverTrigger asChild>
                        <Button variant={"outline"} className="w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange?.from ? (
                                dateRange.to ? (
                                    <>{format(dateRange.from, "LLL dd, y", {locale: es})} - {format(dateRange.to, "LLL dd, y", {locale: es})}</>
                                ) : (
                                    format(dateRange.from, "LLL dd, y", {locale: es})
                                )
                            ) : (
                                <span>Desde / hasta</span>
                            )}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} />
                        </PopoverContent>
                    </Popover>
                </div>
                 <div className="space-y-1">
                  <Label>Local/sede</Label>
                  <Select value={localFilter} onValueChange={setLocalFilter} disabled={isLoading}>
                    <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todos">Todos los locales</SelectItem>
                        {locales.map((l: Local) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Profesional/prestador</Label>
                  <Select value={professionalFilter} onValueChange={setProfessionalFilter} disabled={isLoading}>
                    <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                     <SelectContent>
                        <SelectItem value="todos">Todos los profesionales</SelectItem>
                        {professionals.map((p: Profesional) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                 <div className="space-y-1">
                  <Label>Servicios</Label>
                  <Select value={serviceFilter} onValueChange={setServiceFilter} disabled={isLoading}>
                    <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                     <SelectContent>
                        <SelectItem value="todos">Todos los servicios</SelectItem>
                        {services.map((s: Service) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Productos</Label>
                  <Select value={productFilter} onValueChange={setProductFilter} disabled={isLoading}>
                    <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                     <SelectContent>
                        <SelectItem value="todos">Todos los productos</SelectItem>
                        {products.map((p: Product) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
            </div>
            <div className="space-y-2 pt-4 border-t">
                <Button className="w-full" onClick={onApply}>Buscar</Button>
                <Button variant="ghost" className="w-full" onClick={onReset}>Restablecer</Button>
            </div>
        </div>
    );
}

export default function ClientsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCombineModalOpen, setIsCombineModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const { toast } = useToast();

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [localFilter, setLocalFilter] = useState('todos');
  const [professionalFilter, setProfessionalFilter] = useState('todos');
  const [serviceFilter, setServiceFilter] = useState('todos');
  const [productFilter, setProductFilter] = useState('todos');
  
  const [activeFilters, setActiveFilters] = useState({
      dateRange: dateRange,
      local: 'todos',
      professional: 'todos',
      service: 'todos',
      product: 'todos'
  });

  const [queryKey, setQueryKey] = useState(0);

  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes', queryKey);
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales', queryKey);
  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', queryKey);
  const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios', queryKey);
  const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos', queryKey);
  
  const historyQueryConstraints = useMemo(() => {
    const constraints = [];
    if (activeFilters.dateRange?.from) {
        constraints.push(where('fecha_hora_venta', '>=', Timestamp.fromDate(startOfDay(activeFilters.dateRange.from))));
    }
    if (activeFilters.dateRange?.to) {
        constraints.push(where('fecha_hora_venta', '<=', Timestamp.fromDate(endOfDay(activeFilters.dateRange.to))));
    }
    return constraints;
  }, [activeFilters.dateRange]);
  
  const reservationsQueryConstraints = useMemo(() => {
    const constraints = [];
    if (activeFilters.dateRange?.from) {
        constraints.push(where('fecha', '>=', format(startOfDay(activeFilters.dateRange.from), 'yyyy-MM-dd')));
    }
    if (activeFilters.dateRange?.to) {
        constraints.push(where('fecha', '<=', format(endOfDay(activeFilters.dateRange.to), 'yyyy-MM-dd')));
    }
    return constraints;
  }, [activeFilters.dateRange]);
  
  const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', `sales-${queryKey}`, ...historyQueryConstraints);
  const { data: reservations, loading: reservationsLoading } = useFirestoreQuery<Reservation>('reservas', `reservations-${queryKey}`, ...reservationsQueryConstraints);

  const isLoading = clientsLoading || localesLoading || professionalsLoading || servicesLoading || reservationsLoading || productsLoading || salesLoading;

  const handleApplyFilters = () => {
    setActiveFilters({
      dateRange,
      local: localFilter,
      professional: professionalFilter,
      service: serviceFilter,
      product: productFilter,
    });
    setQueryKey(prev => prev + 1);
    toast({ title: "Filtros aplicados" });
  };
  
  const handleResetFilters = () => {
    setDateRange(undefined);
    setLocalFilter('todos');
    setProfessionalFilter('todos');
    setServiceFilter('todos');
    setProductFilter('todos');
    setActiveFilters({
        dateRange: undefined,
        local: 'todos',
        professional: 'todos',
        service: 'todos',
        product: 'todos'
    });
    setQueryKey(prev => prev + 1);
    toast({ title: "Filtros restablecidos" });
  };

  const filteredClients = useMemo(() => {
    let filtered = [...clients];

    const hasAdvancedFilters = 
        activeFilters.local !== 'todos' || 
        activeFilters.professional !== 'todos' || 
        activeFilters.service !== 'todos' || 
        activeFilters.product !== 'todos';

    if (hasAdvancedFilters) {
        let clientIdsFromHistory = new Set<string>();

        // Filter based on reservations (for service/professional)
        if (activeFilters.professional !== 'todos' || activeFilters.service !== 'todos') {
            const filteredReservations = reservations.filter(r => {
                const profMatch = activeFilters.professional === 'todos' || r.items?.some(i => i.barbero_id === activeFilters.professional);
                const serviceMatch = activeFilters.service === 'todos' || r.items?.some(i => i.id === activeFilters.service);
                return profMatch && serviceMatch;
            });
            filteredReservations.forEach(r => clientIdsFromHistory.add(r.cliente_id));
        }

        // Filter based on sales (for product/local)
        if (activeFilters.product !== 'todos' || activeFilters.local !== 'todos') {
            const filteredSales = sales.filter(s => {
                const localMatch = activeFilters.local === 'todos' || s.local_id === activeFilters.local;
                const productMatch = activeFilters.product === 'todos' || s.items?.some(i => i.id === activeFilters.product);
                return localMatch && productMatch;
            });
            filteredSales.forEach(s => clientIdsFromHistory.add(s.cliente_id));
        }
        
        filtered = filtered.filter(client => clientIdsFromHistory.has(client.id));
    }


    // Search term filter (applied on top of advanced filters)
    if (searchTerm) {
        filtered = filtered.filter(client =>
          (client.nombre?.toLowerCase() + ' ' + client.apellido?.toLowerCase()).includes(searchTerm.toLowerCase()) ||
          (client.telefono && client.telefono.includes(searchTerm)) ||
          (client.correo && client.correo.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }
    
    return filtered;
  }, [clients, reservations, sales, searchTerm, activeFilters]);

  const handleViewDetails = (client: Client) => {
    setSelectedClient(client);
    setIsDetailModalOpen(true);
  };
  
  const handleDeleteClient = async () => {
    if (!clientToDelete || deleteConfirmationText !== 'ELIMINAR') return;
    try {
      await deleteDoc(doc(db, "clientes", clientToDelete.id));
      toast({
        title: "Cliente Eliminado",
        description: `${clientToDelete.nombre} ${clientToDelete.apellido} ha sido eliminado permanentemente.`,
      });
      setQueryKey(prevKey => prevKey + 1);
    } catch (error) {
      console.error("Error deleting client: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar el cliente. Inténtalo de nuevo.",
      });
    } finally {
        setClientToDelete(null);
        setDeleteConfirmationText('');
    }
  };

  const handleDataUpdated = () => {
    setQueryKey(prevKey => prevKey + 1);
  };

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Base de Clientes</h2>
           <div className="flex items-center space-x-2">
            <Button variant="outline"><Upload className="mr-2 h-4 w-4" /> Cargar clientes</Button>
            <Button onClick={() => setIsClientModalOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" /> Nuevo cliente
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="lg:col-span-1">
            <FiltersSidebar 
                onApply={handleApplyFilters}
                onReset={handleResetFilters}
                dateRange={dateRange} setDateRange={setDateRange}
                localFilter={localFilter} setLocalFilter={setLocalFilter}
                professionalFilter={professionalFilter} setProfessionalFilter={setProfessionalFilter}
                serviceFilter={serviceFilter} setServiceFilter={setServiceFilter}
                productFilter={productFilter} setProductFilter={setProductFilter}
                locales={locales} professionals={professionals} services={services} products={products}
                isLoading={isLoading}
            />
          </aside>

          <main className="lg:col-span-3">
             <div className="flex items-center justify-between mb-4 gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Busca por nombre, apellido, identificación oficial, email y teléfono" 
                      className="pl-10 h-10"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button variant="outline">Crear una audiencia con este listado</Button>
                 <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">
                        Acciones <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setIsCombineModalOpen(true)}>
                        <Combine className="mr-2 h-4 w-4" />
                        <span>Combinar clientes</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toast({ title: "Próximamente...", description: "Funcionalidad para descargar listado de clientes."})}>
                        <Download className="mr-2 h-4 w-4" />
                        <span>Descargar este listado</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
            </div>
            <Card>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Apellido</TableHead>
                      <TableHead>Correo</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Identificación oficial</TableHead>
                      <TableHead className="text-right">Opciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 10 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                           <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : filteredClients.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell className="font-medium">{client.nombre}</TableCell>
                        <TableCell>{client.apellido}</TableCell>
                        <TableCell>{client.correo}</TableCell>
                        <TableCell>{client.telefono}</TableCell>
                        <TableCell>N/A</TableCell>
                        <TableCell className="text-right">
                           <div className="flex items-center justify-end gap-2">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewDetails(client)}>
                                    <User className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setClientToDelete(client)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                 { !isLoading && filteredClients.length === 0 && (
                    <p className="text-center py-10 text-muted-foreground">
                        {searchTerm ? "No se encontraron clientes." : "No hay clientes registrados."}
                    </p>
                )}
              </CardContent>
            </Card>
          </main>
        </div>
      </div>

      <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
        <DialogContent className="sm:max-w-lg">
           <DialogHeader>
              <DialogTitle>Crear Nuevo Cliente</DialogTitle>
              <DialogDescription>
                Completa la información para registrar un nuevo cliente en el sistema.
              </DialogDescription>
            </DialogHeader>
            <NewClientForm onFormSubmit={() => {
                setIsClientModalOpen(false);
                handleDataUpdated();
            }} />
        </DialogContent>
      </Dialog>
      
      {selectedClient && (
        <ClientDetailModal 
          client={selectedClient} 
          isOpen={isDetailModalOpen} 
          onOpenChange={setIsDetailModalOpen}
          onNewReservation={() => {
            setIsDetailModalOpen(false);
            setIsReservationModalOpen(true);
          }}
        />
      )}

      {isReservationModalOpen && (
        <Dialog open={isReservationModalOpen} onOpenChange={setIsReservationModalOpen}>
            <DialogContent className="sm:max-w-xl p-0">
                 <DialogHeader className="p-6 pb-0">
                    <DialogTitle>Nueva Reserva</DialogTitle>
                    <DialogDescription>
                        Crea una nueva reserva para {selectedClient?.nombre} {selectedClient?.apellido}.
                    </DialogDescription>
                </DialogHeader>
                <NewReservationForm
                    onFormSubmit={() => {
                        setIsReservationModalOpen(false);
                        handleDataUpdated();
                    }}
                    initialData={{ cliente_id: selectedClient?.id }}
                />
            </DialogContent>
        </Dialog>
      )}

      {isCombineModalOpen && (
          <CombineClientsModal
              isOpen={isCombineModalOpen}
              onOpenChange={setIsCombineModalOpen}
              onClientsCombined={handleDataUpdated}
          />
      )}

      {clientToDelete && (
         <AlertDialog open={!!clientToDelete} onOpenChange={(open) => {
            if(!open) {
                setClientToDelete(null);
                setDeleteConfirmationText('');
            }
         }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center"><AlertTriangle className="h-6 w-6 mr-2 text-destructive"/>¿Estás seguro de eliminar el cliente seleccionado?</AlertDialogTitle>
                    <AlertDialogDescription>
                       Esta acción no se puede revertir. Se eliminará permanentemente al cliente <span className="font-bold">{clientToDelete.nombre} {clientToDelete.apellido}</span> y todo su historial.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2 py-2">
                    <Label htmlFor="delete-confirm">Para confirmar, escribe <strong>ELIMINAR</strong></Label>
                    <Input 
                        id="delete-confirm"
                        value={deleteConfirmationText}
                        onChange={(e) => setDeleteConfirmationText(e.target.value)}
                        placeholder="ELIMINAR"
                    />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => { setClientToDelete(null); setDeleteConfirmationText(''); }}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction 
                        onClick={handleDeleteClient} 
                        disabled={deleteConfirmationText !== 'ELIMINAR'}
                        className="bg-destructive hover:bg-destructive/90"
                    >
                        Eliminar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
