

'use client';

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, Search, Upload, Combine, Download, ChevronDown, AlertTriangle, Edit, ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, User, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Client, Local, Reservation, Sale } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { NewClientForm } from "@/components/clients/new-client-form";
import { ClientDetailModal } from "@/components/clients/client-detail-modal";
import { NewReservationForm } from "@/components/reservations/new-reservation-form";
import { CombineClientsModal } from "@/components/clients/combine-clients-modal";
import { format, startOfDay, endOfDay, parseISO, getMonth } from "date-fns";
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
import { deleteDoc, doc, where, Timestamp, collection, query, getDocs } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { UploadClientsModal } from "@/components/clients/upload-clients-modal";
import * as XLSX from 'xlsx';
import { useAuth } from "@/contexts/firebase-auth-context";

export const dynamic = 'force-dynamic';

const months = Array.from({ length: 12 }, (_, i) => ({
    value: i.toString(),
    label: format(new Date(2000, i, 1), 'LLLL', { locale: es })
}));


const FiltersSidebar = ({
    onApply,
    onReset,
    dateRange, setDateRange,
    localFilter, setLocalFilter,
    birthdayMonthFilter, setBirthdayMonthFilter,
    locales,
    isLoading,
    isLocalAdmin,
  }: { onApply: () => void, onReset: () => void, dateRange: DateRange | undefined, setDateRange: (range: DateRange | undefined) => void, localFilter: string, setLocalFilter: (val: string) => void, birthdayMonthFilter: string, setBirthdayMonthFilter: (val: string) => void, locales: Local[], isLoading: boolean, isLocalAdmin: boolean }) => {

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
                            <span className="flex-grow">
                                {dateRange?.from ? (
                                    dateRange.to ? (
                                        <>{format(dateRange.from, "LLL dd, y", {locale: es})} - {format(dateRange.to, "LLL dd, y", {locale: es})}</>
                                    ) : (
                                        format(dateRange.from, "LLL dd, y", {locale: es})
                                    )
                                ) : (
                                    <span>Desde / hasta</span>
                                )}
                            </span>
                            {dateRange && (
                                <X className="ml-2 h-4 w-4 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setDateRange(undefined); }} />
                            )}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} />
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="space-y-1">
                    <Label>Mes de cumpleaños</Label>
                    <Select value={birthdayMonthFilter} onValueChange={setBirthdayMonthFilter} disabled={isLoading}>
                      <SelectTrigger><SelectValue placeholder="Seleccione un mes" /></SelectTrigger>
                      <SelectContent>
                          <SelectItem value="todos">Todos los meses</SelectItem>
                          {months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                </div>
                 <div className="space-y-1">
                  <Label>Local/sede</Label>
                  <Select value={localFilter} onValueChange={setLocalFilter} disabled={isLoading || isLocalAdmin}>
                    <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                    <SelectContent>
                        {!isLocalAdmin && <SelectItem value="todos">Todos los locales</SelectItem>}
                        {locales.map((l: Local) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
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

export default function AdminClientsPage() {
  const { user, db } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCombineModalOpen, setIsCombineModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [authCode, setAuthCode] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const { toast } = useToast();

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [localFilter, setLocalFilter] = useState('todos');
  const [birthdayMonthFilter, setBirthdayMonthFilter] = useState('todos');
  
  const [activeFilters, setActiveFilters] = useState({
      dateRange: dateRange,
      local: 'todos',
      birthdayMonth: 'todos'
  });

  const [queryKey, setQueryKey] = useState(0);

  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes', queryKey);
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales', queryKey);
  
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
  
  const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', `sales-${queryKey}`, ...historyQueryConstraints);
  
  const { data: allReservations, loading: allReservationsLoading } = useFirestoreQuery<Reservation>('reservas');
  const { data: allSales, loading: allSalesLoading } = useFirestoreQuery<Sale>('ventas');

  const isLoading = clientsLoading || localesLoading || salesLoading;

  useEffect(() => {
    if (user?.local_id) {
        setLocalFilter(user.local_id);
        setActiveFilters(prev => ({...prev, local: user.local_id!}));
    }
  }, [user]);

  const handleApplyFilters = () => {
    setActiveFilters({
      dateRange,
      local: localFilter,
      birthdayMonth: birthdayMonthFilter,
    });
    setCurrentPage(1);
    setQueryKey(prev => prev + 1);
    toast({ title: "Filtros aplicados" });
  };
  
  const handleResetFilters = () => {
    setDateRange(undefined);
    setLocalFilter(user?.local_id || 'todos');
    setBirthdayMonthFilter('todos');
    setActiveFilters({
        dateRange: undefined,
        local: user?.local_id || 'todos',
        birthdayMonth: 'todos',
    });
    setCurrentPage(1);
    setQueryKey(prev => prev + 1);
    toast({ title: "Filtros restablecidos" });
  };

  const filteredClients = useMemo(() => {
    let filtered = [...clients];

    const hasAdvancedFilters = 
        activeFilters.local !== 'todos' || 
        activeFilters.dateRange !== undefined ||
        activeFilters.birthdayMonth !== 'todos';

    if (hasAdvancedFilters) {
        if(activeFilters.dateRange) {
            const clientIdsFromSales = new Set<string>();

            const filteredSales = sales.filter(s => {
                return activeFilters.local === 'todos' || s.local_id === activeFilters.local;
            });
            filteredSales.forEach(s => clientIdsFromSales.add(s.cliente_id));
            
            filtered = filtered.filter(client => clientIdsFromSales.has(client.id));
        }

        if (activeFilters.birthdayMonth !== 'todos') {
            const monthToFilter = parseInt(activeFilters.birthdayMonth, 10);
            filtered = filtered.filter(client => {
                if (!client.fecha_nacimiento) return false;
                const birthDate = typeof client.fecha_nacimiento === 'string' 
                    ? parseISO(client.fecha_nacimiento)
                    : new Date((client.fecha_nacimiento as Timestamp).seconds * 1000);
                return getMonth(birthDate) === monthToFilter;
            });
        }
    }


    if (searchTerm) {
        const searchTerms = searchTerm.toLowerCase().split(' ').filter(Boolean);
        filtered = filtered.filter(client => {
            const clientDataString = [
                client.nombre,
                client.apellido,
                client.telefono,
                client.correo
            ].join(' ').toLowerCase();

            return searchTerms.every(term => clientDataString.includes(term));
        });
    }
    
    return filtered;
  }, [clients, sales, searchTerm, activeFilters]);

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );


  const handleViewDetails = (client: Client) => {
    setSelectedClient(client);
    setIsDetailModalOpen(true);
  };

  const handleOpenEditModal = (client: Client) => {
    setEditingClient(client);
    setIsClientModalOpen(true);
  };
  
  const handleOpenNewModal = () => {
    setEditingClient(null);
    setIsClientModalOpen(true);
  }

  const handleDeleteClient = async () => {
    if (!clientToDelete || deleteConfirmationText !== 'ELIMINAR' || !db) return;
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
  
  const formatDate = (date: any, formatString: string = 'PP') => {
    if (!date) return 'N/A';
    let dateObj: Date;
    if (date.seconds) {
      dateObj = new Date(date.seconds * 1000);
    } else if (typeof date === 'string') {
      dateObj = parseISO(date);
    } else {
        return 'Fecha inválida';
    }
    
    if (isNaN(dateObj.getTime())) return 'Fecha inválida';
    
    return format(dateObj, formatString, { locale: es });
  };
  
  const triggerDownload = () => {
    if (filteredClients.length === 0) {
      toast({
        title: "No hay datos para exportar",
        description: "No hay clientes en la lista actual.",
        variant: "destructive"
      });
      return;
    }
    
    if (allReservationsLoading || allSalesLoading) {
      toast({
        title: "Cargando datos...",
        description: "El historial completo se está cargando, por favor inténtalo de nuevo en unos momentos.",
      });
      return;
    }
  
    const dataForExcel = filteredClients.map(client => {
      const clientReservations = allReservations.filter(r => r.cliente_id === client.id);
      const clientSales = allSales.filter(s => s.cliente_id === client.id);

      const totalAppointments = clientReservations.length;
      const attendedAppointments = clientReservations.filter(r => r.estado === 'Asiste' || r.estado === 'Pagado').length;
      const unattendedAppointments = clientReservations.filter(r => r.estado === 'No asiste').length;
      const cancelledAppointments = clientReservations.filter(r => r.estado === 'Cancelado').length;
      const totalSpent = clientSales.reduce((acc, sale) => acc + (sale.total || 0), 0);
      
      return {
        'Nombre': client.nombre || '',
        'Apellido': client.apellido || '',
        'Correo': client.correo || '',
        'Teléfono': client.telefono || '',
        'Fecha de Nacimiento': client.fecha_nacimiento ? formatDate(client.fecha_nacimiento, 'dd/MM/yy') : 'N/A',
        'Cliente desde': client.creado_en ? formatDate(client.creado_en, 'dd/MM/yy') : 'N/A',
        'Número de cliente': client.numero_cliente || '',
        'Citas totales': client.citas_totales ?? totalAppointments,
        'Citas asistidas': client.citas_asistidas ?? attendedAppointments,
        'Citas no asistidas': client.citas_no_asistidas ?? unattendedAppointments,
        'Citas canceladas': client.citas_canceladas ?? cancelledAppointments,
        'Gasto total': client.gasto_total ?? totalSpent,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");

    XLSX.writeFile(workbook, `clientes_VATOS_ALFA_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

    toast({
      title: "Descarga iniciada",
      description: "Tu archivo de Excel se está descargando.",
    });
  };

  const handleDownloadRequest = async () => {
    if (!authCode || !db) {
        toast({ variant: 'destructive', title: 'Código requerido' });
        return;
    }
    const authCodeQuery = query(
        collection(db, 'codigos_autorizacion'),
        where('code', '==', authCode),
        where('active', '==', true),
        where('download', '==', true)
    );
    const querySnapshot = await getDocs(authCodeQuery);
    if (querySnapshot.empty) {
        toast({ variant: 'destructive', title: 'Código inválido o sin permiso' });
    } else {
        toast({ title: 'Código correcto', description: 'Iniciando descarga...' });
        triggerDownload();
        setIsDownloadModalOpen(false);
        setAuthCode('');
    }
  };

  const isLocalAdmin = user?.role !== 'Administrador general';

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Base de Clientes</h2>
           <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={() => setIsUploadModalOpen(true)}>
                <Upload className="mr-2 h-4 w-4" /> Cargar clientes
            </Button>
            <Button onClick={handleOpenNewModal}>
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
                birthdayMonthFilter={birthdayMonthFilter} setBirthdayMonthFilter={setBirthdayMonthFilter}
                locales={locales}
                isLoading={isLoading}
                isLocalAdmin={isLocalAdmin}
            />
          </aside>

          <main className="lg:col-span-3 space-y-4">
             <div className="flex items-center justify-between gap-4">
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
                      <DropdownMenuItem onSelect={() => setIsDownloadModalOpen(true)}>
                        <Download className="mr-2 h-4 w-4" />
                        <span>Descargar este listado</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Apellido</TableHead>
                      <TableHead>Correo</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Cliente desde</TableHead>
                      <TableHead className="text-right">Opciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: itemsPerPage }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                           <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : paginatedClients.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell className="font-medium">{client.nombre}</TableCell>
                        <TableCell>{client.apellido}</TableCell>
                        <TableCell>{client.correo}</TableCell>
                        <TableCell>{client.telefono}</TableCell>
                        <TableCell>{formatDate(client.creado_en)}</TableCell>
                        <TableCell className="text-right">
                           <div className="flex items-center justify-end gap-2">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewDetails(client)}>
                                    <User className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEditModal(client)}>
                                    <Edit className="h-4 w-4" />
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
                 { !isLoading && paginatedClients.length === 0 && (
                    <p className="text-center py-10 text-muted-foreground">
                        {searchTerm ? "No se encontraron clientes." : "No hay clientes registrados."}
                    </p>
                )}
              </CardContent>
            </Card>
            <div className="flex items-center justify-end space-x-6 pt-2 pb-4">
                <div className="flex items-center space-x-2">
                    <p className="text-sm font-medium">Resultados por página</p>
                    <Select
                        value={`${itemsPerPage}`}
                        onValueChange={(value) => {
                            setItemsPerPage(Number(value))
                            setCurrentPage(1)
                        }}
                    >
                        <SelectTrigger className="h-8 w-[70px]">
                            <SelectValue placeholder={itemsPerPage} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="20">20</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="text-sm font-medium">
                Página {currentPage} de {totalPages}
                </div>
                <div className="flex items-center space-x-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                    >
                        <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                    >
                        Siguiente <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                </div>
            </div>
          </main>
        </div>
      </div>

      <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
        <DialogContent className="sm:max-w-2xl">
           <DialogHeader>
              <DialogTitle>{editingClient ? "Editar Cliente" : "Crear Nuevo Cliente"}</DialogTitle>
              <DialogDescription>
                {editingClient
                  ? "Actualiza la información del cliente."
                  : "Completa la información para registrar un nuevo cliente en el sistema."}
              </DialogDescription>
            </DialogHeader>
            <NewClientForm
              client={editingClient}
              onFormSubmit={() => {
                setIsClientModalOpen(false);
                handleDataUpdated();
              }}
            />
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
      
      <UploadClientsModal
        isOpen={isUploadModalOpen}
        onOpenChange={setIsUploadModalOpen}
        onUploadComplete={handleDataUpdated}
      />

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
      
      <AlertDialog open={isDownloadModalOpen} onOpenChange={setIsDownloadModalOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-6 w-6 text-yellow-500" />
                    Requiere Autorización
                </AlertDialogTitle>
                <AlertDialogDescription>
                    Para descargar este archivo, es necesario un código de autorización con permisos de descarga.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
                <Label htmlFor="auth-code">Código de Autorización</Label>
                <Input id="auth-code" type="password" placeholder="Ingrese el código" value={authCode} onChange={e => setAuthCode(e.target.value)} />
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setAuthCode('')}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDownloadRequest}>Aceptar</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

    

    