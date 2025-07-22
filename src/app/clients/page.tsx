
'use client';

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoreHorizontal, PlusCircle, Search, Upload, Filter, Trash2, Calendar as CalendarIcon, User, VenetianMask, Combine, Download, ChevronDown, Plus, AlertTriangle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Client } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NewClientForm } from "@/components/clients/new-client-form";
import { ClientDetailModal } from "@/components/clients/client-detail-modal";
import { NewReservationForm } from "@/components/reservations/new-reservation-form";
import { CombineClientsModal } from "@/components/clients/combine-clients-modal";
import { format } from "date-fns";
import { es } from 'date-fns/locale';
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
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

const FiltersSidebar = () => (
    <div className="space-y-4">
        <h3 className="text-xl font-bold">Filtros avanzados</h3>
        <div className="space-y-3">
             <div className="space-y-1">
              <Label>Local/sede</Label>
              <Select><SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger><SelectContent></SelectContent></Select>
            </div>
            <div className="space-y-1">
              <Label>Profesional/prestador</Label>
              <Select><SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger><SelectContent></SelectContent></Select>
            </div>
             <div className="space-y-1">
              <Label>Servicios</Label>
              <Select><SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger><SelectContent></SelectContent></Select>
            </div>
            <div className="flex items-center justify-between">
                <Label>Estado de la reserva</Label>
                <Button variant="ghost" size="sm"><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-center justify-between">
                <Label>Género</Label>
                <Button variant="ghost" size="sm"><Plus className="h-4 w-4" /></Button>
            </div>
             <div className="space-y-1">
                <Label>Cumpleaños</Label>
                 <Popover>
                    <PopoverTrigger asChild>
                    <Button variant={"outline"} className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        <span>Desde / hasta</span>
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="range" numberOfMonths={1} /></PopoverContent>
                </Popover>
            </div>
             <div className="space-y-1">
                <Label>Cliente creado en el periodo</Label>
                 <Popover>
                    <PopoverTrigger asChild>
                    <Button variant={"outline"} className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        <span>Desde / hasta</span>
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="range" numberOfMonths={1} /></PopoverContent>
                </Popover>
            </div>
             <div className="flex items-center justify-between">
                <Label>¿Ha reservado?</Label>
                <Button variant="ghost" size="sm"><Plus className="h-4 w-4" /></Button>
            </div>
             <div className="flex items-center justify-between">
                <Label>Personalizados</Label>
                <Button variant="ghost" size="sm"><Plus className="h-4 w-4" /></Button>
            </div>
        </div>
        <div className="space-y-2 pt-4 border-t">
            <Button className="w-full">Buscar</Button>
            <Button variant="ghost" className="w-full">Restablecer</Button>
        </div>
    </div>
  );


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

  const [queryKey, setQueryKey] = useState(0);

  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes', queryKey);

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


  const filteredClients = useMemo(() => {
    return clients.filter(client =>
      (client.nombre?.toLowerCase() + ' ' + client.apellido?.toLowerCase()).includes(searchTerm.toLowerCase()) ||
      (client.telefono && client.telefono.includes(searchTerm)) ||
      (client.correo && client.correo.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [clients, searchTerm]);

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
            <FiltersSidebar />
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
                    {clientsLoading ? (
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
                 { !clientsLoading && filteredClients.length === 0 && (
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
          onNewReservation={() => setIsReservationModalOpen(true)}
        />
      )}

      {isReservationModalOpen && (
        <Dialog open={isReservationModalOpen} onOpenChange={setIsReservationModalOpen}>
            <DialogContent className="sm:max-w-xl">
                <NewReservationForm
                    onFormSubmit={() => {
                        setIsReservationModalOpen(false);
                        setIsDetailModalOpen(false);
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
