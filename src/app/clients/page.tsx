
'use client';

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoreHorizontal, PlusCircle, Search, Upload, Filter, Trash2, Calendar as CalendarIcon, User, VenetianMask, Combine, Download, ChevronDown } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";


export default function ClientsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCombineModalOpen, setIsCombineModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const { toast } = useToast();

  const [queryKey, setQueryKey] = useState(0);

  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes', queryKey);

  const handleViewDetails = (client: Client) => {
    setSelectedClient(client);
    setIsDetailModalOpen(true);
  };
  
  const handleDeleteClient = async () => {
    if (!clientToDelete) return;
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

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    if (date.seconds) {
      return format(new Date(date.seconds * 1000), 'PPP', { locale: es });
    }
    if (typeof date === 'string') {
        try {
            const parsedDate = new Date(date);
            if (!isNaN(parsedDate.getTime())) {
                 return format(parsedDate, 'PPP', { locale: es });
            }
        } catch (e) {
            return date;
        }
    }
    return 'Fecha inválida';
  };

  const FiltersSidebar = () => (
    <Card className="bg-card/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" /> Filtros</CardTitle>
        <CardDescription>Refina tu búsqueda de clientes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex w-full justify-between items-center text-lg font-semibold">
            Filtros Principales
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Sucursal</Label>
              <Select><SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger><SelectContent></SelectContent></Select>
            </div>
            <div className="space-y-2">
              <Label>¿Ha reservado?</Label>
              <Select><SelectTrigger><SelectValue placeholder="Cualquiera" /></SelectTrigger><SelectContent></SelectContent></Select>
            </div>
          </CollapsibleContent>
        </Collapsible>
        <Collapsible>
          <CollapsibleTrigger className="flex w-full justify-between items-center text-lg font-semibold">
            Filtros por Fecha
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
             <div className="space-y-2">
                <Label>Cumpleaños</Label>
                 <Popover>
                    <PopoverTrigger asChild>
                    <Button variant={"outline"} className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        <span>Seleccionar rango</span>
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="range" numberOfMonths={2} /></PopoverContent>
                </Popover>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Base de Clientes</h2>
          <div className="flex items-center space-x-2">
            <Button variant="outline"><Upload className="mr-2 h-4 w-4" /> Cargar (CSV)</Button>
            <Button onClick={() => setIsClientModalOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" /> Crear nuevo cliente
            </Button>
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <FiltersSidebar />
          </div>

          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>Lista de Clientes</CardTitle>
                <div className="relative flex-1 pt-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Buscar por nombre, teléfono, correo..." 
                      className="pl-10"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre y Apellido</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Correo</TableHead>
                      <TableHead>Fecha de Registro</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientsLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : filteredClients.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell className="font-medium">{client.nombre} {client.apellido}</TableCell>
                        <TableCell>{client.telefono}</TableCell>
                        <TableCell>{client.correo}</TableCell>
                        <TableCell>{formatDate(client.creado_en)}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Abrir menú</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => handleViewDetails(client)}>
                                <User className="mr-2 h-4 w-4" /> Ver Ficha
                              </DropdownMenuItem>
                              {client.telefono && (
                                <DropdownMenuItem asChild>
                                  <a href={`https://wa.me/${client.telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                                    <VenetianMask className="mr-2 h-4 w-4" /> Enviar WhatsApp
                                  </a>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setClientToDelete(client)} className="text-destructive hover:!bg-destructive/10">
                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
          </div>
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
         <AlertDialog open={!!clientToDelete} onOpenChange={(open) => !open && setClientToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta acción no se puede deshacer. Esto eliminará permanentemente al cliente
                        <span className="font-bold"> {clientToDelete.nombre} {clientToDelete.apellido}</span>.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setClientToDelete(null)}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteClient} className="bg-destructive hover:bg-destructive/90">
                        Sí, eliminar cliente
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
