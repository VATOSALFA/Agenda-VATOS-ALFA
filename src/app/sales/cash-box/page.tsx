

'use client';

import { useState, useMemo, useEffect } from 'react';
import type { DateRange } from 'react-day-picker';
import { format, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Calendar } from '@/components/ui/calendar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Calendar as CalendarIcon,
  Search,
  Download,
  ChevronDown,
  Eye,
  Loader2,
  Plus,
  Minus,
  Equal,
  Pencil,
  Trash2,
  Send,
  Printer,
  AlertTriangle,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Sale, Local, Client, Egreso, Profesional } from '@/lib/types';
import { where, Timestamp, QueryConstraint, doc, deleteDoc, getDocs, collection, query } from 'firebase/firestore';
import { AddIngresoModal } from '@/components/finanzas/add-ingreso-modal';
import { AddEgresoModal } from '@/components/finanzas/add-egreso-modal';
import { SaleDetailModal } from '@/components/sales/sale-detail-modal';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/firebase-auth-context';
import { CashBoxClosingModal } from '@/components/sales/cash-box-closing-modal';


const SummaryCard = ({
  title,
  amount,
  className
}: {
  title: string;
  amount: number;
  className?: string;
}) => (
  <Card className={cn("flex flex-col justify-center", className)}>
    <CardContent className="p-4 text-center">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-2xl font-bold text-primary">
        ${amount.toLocaleString('es-CL')}
      </p>
    </CardContent>
  </Card>
);

const IconSeparator = ({ icon: Icon }: { icon: React.ElementType }) => (
    <div className="flex items-center justify-center">
        <Icon className="h-6 w-6 text-muted-foreground" />
    </div>
);


export default function CashBoxPage() {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedLocalId, setSelectedLocalId] = useState<string>('todos');
  const [activeFilters, setActiveFilters] = useState<{
    dateRange: DateRange | undefined;
    localId: string;
  }>({
    dateRange: undefined,
    localId: 'todos'
  });
  
  const [isIngresoModalOpen, setIsIngresoModalOpen] = useState(false);
  const [isEgresoModalOpen, setIsEgresoModalOpen] = useState(false);
  const [isClientMounted, setIsClientMounted] = useState(false);
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [queryKey, setQueryKey] = useState(0);

  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [editingEgreso, setEditingEgreso] = useState<Egreso | null>(null);
  const [egresoToDelete, setEgresoToDelete] = useState<Egreso | null>(null);
  const [egresoDeleteConfirmationText, setEgresoDeleteConfirmationText] = useState('');
  const { toast } = useToast();

   useEffect(() => {
    setIsClientMounted(true);
    const today = new Date();
    const initialDateRange = { from: startOfDay(today), to: endOfDay(today) };
    setDateRange(initialDateRange);
    const initialLocalId = user?.local_id || 'todos';
    setSelectedLocalId(initialLocalId);
    setActiveFilters({ dateRange: initialDateRange, localId: initialLocalId });
  }, [user]);

  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes');
  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
  
  const salesQueryConstraints = useMemo(() => {
    const constraints: QueryConstraint[] = [];
    if (activeFilters.dateRange?.from) {
        constraints.push(where('fecha_hora_venta', '>=', Timestamp.fromDate(startOfDay(activeFilters.dateRange.from))));
    }
    if (activeFilters.dateRange?.to) {
        constraints.push(where('fecha_hora_venta', '<=', Timestamp.fromDate(endOfDay(activeFilters.dateRange.to))));
    }
    if (activeFilters.localId !== 'todos') {
        constraints.push(where('local_id', '==', activeFilters.localId));
    }
    return constraints;
}, [activeFilters]);

  const egresosQueryConstraints = useMemo(() => {
    if (!activeFilters.dateRange?.from) return [];
    const constraints: QueryConstraint[] = [];
    constraints.push(where('fecha', '>=', Timestamp.fromDate(startOfDay(activeFilters.dateRange.from))));
    if (activeFilters.dateRange.to) {
        constraints.push(where('fecha', '<=', Timestamp.fromDate(endOfDay(activeFilters.dateRange.to))));
    }
    return constraints;
  }, [activeFilters.dateRange]);
  
  const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>(
    'ventas',
    `sales-${queryKey}`,
    ...salesQueryConstraints
  );

  const { data: allEgresos, loading: egresosLoading } = useFirestoreQuery<Egreso>(
    'egresos',
    `egresos-${queryKey}`,
    ...egresosQueryConstraints
  );
  
  const egresos = useMemo(() => {
    if (activeFilters.localId === 'todos') {
        return allEgresos;
    }
    return allEgresos.filter(e => e.local_id === activeFilters.localId);
  }, [allEgresos, activeFilters.localId]);

  const clientMap = useMemo(() => {
      if (clientsLoading) return new Map();
      return new Map(clients.map(c => [c.id, c]));
  }, [clients, clientsLoading]);
  
  const professionalMap = useMemo(() => {
      if (professionalsLoading) return new Map();
      return new Map(professionals.map(p => [p.id, p.name]));
  }, [professionals, professionalsLoading]);

  const salesWithClientData = useMemo(() => {
    if (salesLoading || clientsLoading) return [];
    return sales.map(sale => ({
        ...sale,
        client: clientMap.get(sale.cliente_id)
    }))
  }, [sales, clientMap, salesLoading, clientsLoading]);

  const egresosWithData = useMemo(() => {
    if (egresosLoading || professionalsLoading) return [];
    return egresos.map(egreso => ({
        ...egreso,
        aQuienNombre: professionalMap.get(egreso.aQuien) || egreso.aQuien
    }))
  }, [egresos, professionalMap, egresosLoading, professionalsLoading]);
  
  const handleSearch = () => {
    setActiveFilters({ dateRange, localId: selectedLocalId });
    setQueryKey(prev => prev + 1);
  };

  const handleViewDetails = (sale: Sale) => {
    setSelectedSale(sale);
    setIsDetailModalOpen(true);
  };

   const handleDeleteSale = async () => {
    if (!saleToDelete || deleteConfirmationText !== 'ELIMINAR') return;
    try {
        await deleteDoc(doc(db, 'ventas', saleToDelete.id));
        toast({
            title: "Venta Eliminada",
            description: "La venta ha sido eliminada permanentemente.",
        });
        setQueryKey(prevKey => prevKey + 1);
    } catch (error) {
        console.error("Error deleting sale: ", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "No se pudo eliminar la venta.",
        });
    } finally {
        setSaleToDelete(null);
        setDeleteConfirmationText('');
    }
  };

  const handleOpenEditEgreso = (egreso: Egreso) => {
    setEditingEgreso(egreso);
    setIsEgresoModalOpen(true);
  };

  const handleDeleteEgreso = async () => {
    if (!egresoToDelete || egresoDeleteConfirmationText !== 'ELIMINAR') return;
    try {
        await deleteDoc(doc(db, 'egresos', egresoToDelete.id));
        toast({
            title: "Egreso Eliminado",
            description: "El egreso ha sido eliminado permanentemente.",
        });
        setQueryKey(prevKey => prevKey + 1);
    } catch (error) {
        console.error("Error deleting egreso: ", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "No se pudo eliminar el egreso.",
        });
    } finally {
        setEgresoToDelete(null);
        setEgresoDeleteConfirmationText('');
    }
  };
  
  const handleDownload = () => {
    const salesData = salesWithClientData.map(sale => ({
        ID: sale.id,
        'Fecha De Pago': sale.fecha_hora_venta ? format(sale.fecha_hora_venta.toDate(), 'dd-MM-yyyy HH:mm') : 'N/A',
        Local: localMap.get(sale.local_id ?? '') || sale.local_id,
        Cliente: `${sale.client?.nombre || ''} ${sale.client?.apellido || ''}`,
        Detalle: sale.items?.map(i => i.nombre).join(', '),
        'Monto Facturado': sale.total,
    }));

    const egresosData = egresosWithData.map(egreso => ({
        Fecha: format(egreso.fecha.toDate(), 'dd-MM-yyyy'),
        Local: localMap.get(egreso.local_id ?? ''),
        Concepto: egreso.concepto,
        'A quién se entrega': egreso.aQuienNombre,
        Comentarios: egreso.comentarios,
        Monto: egreso.monto,
    }));

    const workbook = XLSX.utils.book_new();
    
    if (salesData.length > 0) {
        const salesWorksheet = XLSX.utils.json_to_sheet(salesData);
        XLSX.utils.book_append_sheet(workbook, salesWorksheet, 'Ventas');
    }
    
    if (egresosData.length > 0) {
        const egresosWorksheet = XLSX.utils.json_to_sheet(egresosData);
        XLSX.utils.book_append_sheet(workbook, egresosWorksheet, 'Egresos');
    }
    
    XLSX.writeFile(workbook, `Reporte_Caja_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

    toast({
        title: 'Reporte generado',
        description: 'La descarga de tu reporte ha comenzado.'
    })
  }

  const isLoading = localesLoading || salesLoading || clientsLoading || egresosLoading;

  const ingresosEfectivo = useMemo(() => salesWithClientData.filter(s => s.metodo_pago === 'efectivo').reduce((sum, sale) => sum + sale.total, 0), [salesWithClientData]);
  const totalVentasFacturadas = useMemo(() => salesWithClientData.reduce((sum, sale) => sum + (sale.total || 0), 0), [salesWithClientData]);
  const totalEgresos = useMemo(() => egresos.reduce((sum, egreso) => sum + egreso.monto, 0), [egresos]);
  const efectivoEnCaja = ingresosEfectivo - totalEgresos;
  
  const localMap = useMemo(() => new Map(locales.map(l => [l.id, l.name])), [locales]);
  const isLocalAdmin = user?.role !== 'Administrador general';


  return (
    <>
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight">Caja de Ventas</h2>
           <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={() => setIsClosingModalOpen(true)}><LogOut className="mr-2 h-4 w-4"/>Realizar corte de caja</Button>
            <Button variant="outline" onClick={() => setIsIngresoModalOpen(true)}>Otros Ingresos</Button>
            <Button variant="outline" onClick={() => { setEditingEgreso(null); setIsEgresoModalOpen(true); }}>Agregar Egreso</Button>
          </div>
      </div>

       <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-stretch">
        <Card className="h-full">
            <CardContent className="pt-6 flex flex-wrap items-end gap-4 h-full">
                <div className="space-y-2 flex-grow min-w-[200px]">
                <label className="text-sm font-medium">Local</label>
                <Select value={selectedLocalId} onValueChange={setSelectedLocalId} disabled={isLocalAdmin || localesLoading}>
                    <SelectTrigger>
                    <SelectValue placeholder={localesLoading ? "Cargando..." : "Seleccionar local"} />
                    </SelectTrigger>
                    <SelectContent>
                    {!isLocalAdmin && <SelectItem value="todos">Todos los locales</SelectItem>}
                    {locales.map(local => (
                        <SelectItem key={local.id} value={local.id}>
                        {local.name}
                        </SelectItem>
                    ))}
                    </SelectContent>
                </Select>
                </div>
                <div className="space-y-2 flex-grow min-w-[200px]">
                <label className="text-sm font-medium">Desde / Hasta</label>
                <Popover>
                    <PopoverTrigger asChild>
                    <Button
                        id="date"
                        variant={"outline"}
                        className={cn(
                            "w-full justify-start text-left font-normal",
                            !dateRange && "text-muted-foreground"
                        )}
                        >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? (
                            dateRange.to ? (
                            <>{format(dateRange.from, "LLL dd, y", { locale: es })} - {format(dateRange.to, "LLL dd, y", { locale: es })}</>
                            ) : (
                            format(dateRange.from, "LLL dd, y", { locale: es })
                            )
                        ) : (
                            <span>Seleccionar rango</span>
                        )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                    <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={dateRange?.from}
                        selected={dateRange}
                        onSelect={setDateRange}
                        numberOfMonths={2}
                        locale={es}
                    />
                    </PopoverContent>
                </Popover>
                </div>
                <Button className="w-full sm:w-auto" onClick={handleSearch} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="mr-2 h-4 w-4" />}
                Buscar
                </Button>
            </CardContent>
        </Card>
        
        <Card className="flex-shrink-0 w-full md:w-auto h-full">
            <CardContent className="p-4 flex flex-col items-center justify-center h-full text-center">
                <p className="text-sm text-muted-foreground">Efectivo en caja</p>
                <p className="text-3xl font-extrabold text-primary">${efectivoEnCaja.toLocaleString('es-CL')}</p>
            </CardContent>
        </Card>
      </div>
      
      <div className="flex justify-between items-center">
          <Button variant="ghost" size="sm" onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Descargar reporte
          </Button>
      </div>
      
      {/* Detailed Summary */}
       <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] gap-4 items-center">
            <SummaryCard title="Ventas Facturadas" amount={totalVentasFacturadas} />
            <IconSeparator icon={Plus} />
            <SummaryCard title="Otros Ingresos" amount={0} />
            <IconSeparator icon={Minus} />
            <SummaryCard title="Egresos" amount={totalEgresos} />
            <IconSeparator icon={Equal} />
            <SummaryCard title="Resultado de Flujo del Periodo" amount={totalVentasFacturadas - totalEgresos} />
        </div>

      {/* Main Table */}
      <Card>
        <CardContent className="pt-6">
            <Tabs defaultValue="ventas-facturadas">
                <TabsList>
                    <TabsTrigger value="ventas-facturadas">Flujo de Ventas Facturadas</TabsTrigger>
                    <TabsTrigger value="otros-ingresos">Otros Ingresos</TabsTrigger>
                    <TabsTrigger value="egresos">Egresos</TabsTrigger>
                </TabsList>
                <TabsContent value="ventas-facturadas" className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Fecha De Pago</TableHead>
                        <TableHead>Local</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Detalle</TableHead>
                        <TableHead className="text-right">Monto Facturado</TableHead>
                        <TableHead className="text-right">Flujo Del Periodo</TableHead>
                        <TableHead className="text-right">Opciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                          Array.from({length: 3}).map((_, i) => (
                              <TableRow key={i}>
                                  <TableCell colSpan={8}><div className="h-8 w-full bg-muted animate-pulse rounded-md" /></TableCell>
                              </TableRow>
                          ))
                      ) : salesWithClientData.length === 0 ? (
                          <TableRow>
                              <TableCell colSpan={8} className="text-center h-24">No hay ventas para el período seleccionado.</TableCell>
                          </TableRow>
                      ) : (
                        salesWithClientData.map((sale) => (
                          <TableRow key={sale.id}>
                            <TableCell className="font-mono text-xs">{sale.id.slice(0, 8)}...</TableCell>
                            <TableCell>{sale.fecha_hora_venta ? format(sale.fecha_hora_venta.toDate(), 'dd-MM-yyyy HH:mm') : 'N/A'}</TableCell>
                            <TableCell>{localMap.get(sale.local_id ?? '') || sale.local_id}</TableCell>
                            <TableCell>{sale.client?.nombre} {sale.client?.apellido}</TableCell>
                            <TableCell>{sale.items?.map(i => i.nombre).join(', ')}</TableCell>
                            <TableCell className="text-right font-medium">${sale.total.toLocaleString('es-CL')}</TableCell>
                            <TableCell className="text-right font-medium text-primary">${sale.total.toLocaleString('es-CL')}</TableCell>
                            <TableCell className="text-right">
                               <div className="flex items-center justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => handleViewDetails(sale)}>
                                    <Eye className="mr-2 h-4 w-4" /> Ver
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        Acciones <ChevronDown className="ml-2 h-4 w-4" />
                                    </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onSelect={() => toast({ title: "Funcionalidad no implementada" })}>
                                        <Send className="mr-2 h-4 w-4 text-blue-500" />
                                        <span className="text-blue-500">Enviar Comprobante</span>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onSelect={() => window.print()}>
                                        <Printer className="mr-2 h-4 w-4 text-yellow-500" />
                                        <span className="text-yellow-500">Imprimir</span>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onSelect={() => setSaleToDelete(sale)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                        <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                               </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>
                <TabsContent value="otros-ingresos" className="mt-4">
                    <div className="text-center text-muted-foreground p-12">
                        <p>No hay otros ingresos registrados para este período.</p>
                    </div>
                </TabsContent>
                <TabsContent value="egresos" className="mt-4">
                    {isLoading ? (
                         <div className="flex justify-center items-center h-24"><Loader2 className="h-6 w-6 animate-spin" /></div>
                    ) : egresosWithData.length === 0 ? (
                        <div className="text-center text-muted-foreground p-12">
                            <p>No hay egresos registrados para este período.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Local</TableHead>
                                    <TableHead>Concepto</TableHead>
                                    <TableHead>A quién se entrega</TableHead>
                                    <TableHead>Comentarios</TableHead>
                                    <TableHead className="text-right">Monto</TableHead>
                                    <TableHead className="text-right">Opciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {egresosWithData.map((egreso) => (
                                    <TableRow key={egreso.id}>
                                        <TableCell>{format(egreso.fecha.toDate(), 'dd-MM-yyyy')}</TableCell>
                                        <TableCell>{localMap.get(egreso.local_id ?? '')}</TableCell>
                                        <TableCell>{egreso.concepto}</TableCell>
                                        <TableCell>{egreso.aQuienNombre}</TableCell>
                                        <TableCell>{egreso.comentarios}</TableCell>
                                        <TableCell className="text-right font-medium">${egreso.monto.toLocaleString('es-CL')}</TableCell>
                                        <TableCell className="text-right">
                                           <div className="flex items-center justify-end gap-2">
                                                <Button variant="outline" size="sm" onClick={() => handleOpenEditEgreso(egreso)}>
                                                    <Pencil className="mr-2 h-4 w-4" /> Editar
                                                </Button>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                    <Button variant="outline" size="sm">
                                                        Acciones <ChevronDown className="ml-2 h-4 w-4" />
                                                    </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                      <DropdownMenuItem onSelect={() => setEgresoToDelete(egreso)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                                        <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                                      </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </TabsContent>
            </Tabs>
        </CardContent>
      </Card>
    </div>
    
    <AddIngresoModal 
        isOpen={isIngresoModalOpen}
        onOpenChange={setIsIngresoModalOpen}
        onFormSubmit={() => {
            setIsIngresoModalOpen(false)
            handleSearch()
        }}
    />
    <AddEgresoModal
        isOpen={isEgresoModalOpen}
        onOpenChange={setIsEgresoModalOpen}
        onFormSubmit={() => {
            setIsEgresoModalOpen(false)
            handleSearch()
        }}
        egreso={editingEgreso}
    />
    <CashBoxClosingModal
        isOpen={isClosingModalOpen}
        onOpenChange={setIsClosingModalOpen}
        onFormSubmit={() => {
            setIsClosingModalOpen(false);
            handleSearch();
        }}
        initialCash={efectivoEnCaja}
    />
    {selectedSale && (
        <SaleDetailModal
            isOpen={isDetailModalOpen}
            onOpenChange={setIsDetailModalOpen}
            sale={selectedSale}
        />
    )}
     {saleToDelete && (
         <AlertDialog open={!!saleToDelete} onOpenChange={(open) => {
             if(!open) {
                setSaleToDelete(null);
                setDeleteConfirmationText('');
            }
         }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center"><AlertTriangle className="h-6 w-6 mr-2 text-destructive"/>¿Estás absolutamente seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta acción no se puede deshacer. Esto eliminará permanentemente la venta seleccionada.
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
                    <AlertDialogCancel onClick={() => { setSaleToDelete(null); setDeleteConfirmationText(''); }}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction 
                        onClick={handleDeleteSale} 
                        disabled={deleteConfirmationText !== 'ELIMINAR'}
                        className="bg-destructive hover:bg-destructive/90"
                    >
                        Sí, eliminar venta
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}

      {egresoToDelete && (
        <AlertDialog open={!!egresoToDelete} onOpenChange={(open) => {
            if (!open) {
                setEgresoToDelete(null);
                setEgresoDeleteConfirmationText('');
            }
        }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center"><AlertTriangle className="h-6 w-6 mr-2 text-destructive"/>¿Estás seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                       Esta acción no se puede deshacer. Se eliminará permanentemente el egreso seleccionado.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2 py-2">
                    <Label htmlFor="egreso-delete-confirm">Para confirmar, escribe <strong>ELIMINAR</strong></Label>
                    <Input 
                        id="egreso-delete-confirm"
                        value={egresoDeleteConfirmationText}
                        onChange={(e) => setEgresoDeleteConfirmationText(e.target.value)}
                        placeholder="ELIMINAR"
                    />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => { setEgresoToDelete(null); setEgresoDeleteConfirmationText(''); }}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction 
                        onClick={handleDeleteEgreso} 
                        disabled={egresoDeleteConfirmationText !== 'ELIMINAR'}
                        className="bg-destructive hover:bg-destructive/90"
                    >
                        Sí, eliminar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
