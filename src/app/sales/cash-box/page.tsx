
'use client';

import { useState, useMemo, useEffect } from 'react';
import type { DateRange } from 'react-day-picker';
import { format, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
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
  Plus,
  Minus,
  ArrowRightLeft,
  Download,
  ChevronDown,
  Eye,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Sale, Local, Client } from '@/lib/types';
import { where, Timestamp } from 'firebase/firestore';
import { AddIngresoModal } from '@/components/finanzas/add-ingreso-modal';
import { AddEgresoModal } from '@/components/finanzas/add-egreso-modal';


const SummaryCard = ({
  title,
  amount,
  className
}: {
  title: string;
  amount: number;
  className?: string;
}) => (
  <Card className={cn("text-center", className)}>
    <CardContent className="p-3 flex flex-col items-center justify-center">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-2xl font-bold text-primary">
        ${amount.toLocaleString('es-CL')}
      </p>
    </CardContent>
  </Card>
);

export default function CashBoxPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null);
  
  const [activeFilters, setActiveFilters] = useState<{
    dateRange: DateRange | undefined;
    localId: string | null;
  }>({
    dateRange: undefined,
    localId: null
  });

  const [isIngresoModalOpen, setIsIngresoModalOpen] = useState(false);
  const [isEgresoModalOpen, setIsEgresoModalOpen] = useState(false);
  
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes');

  useEffect(() => {
    // Set initial filters once locales are loaded
    if (locales.length > 0 && activeFilters.localId === null) {
      const today = new Date();
      const initialDateRange = { from: startOfDay(today), to: endOfDay(today) };
      const defaultLocalId = locales[0].id;
      
      setDateRange(initialDateRange);
      setSelectedLocalId(defaultLocalId);
      setActiveFilters({ dateRange: initialDateRange, localId: defaultLocalId });
    }
  }, [locales, activeFilters.localId]);


  const salesQueryConstraints = useMemo(() => {
    if (!activeFilters.dateRange?.from || !activeFilters.localId) return undefined;
    
    const constraints = [];
    constraints.push(where('fecha_hora_venta', '>=', Timestamp.fromDate(startOfDay(activeFilters.dateRange.from))));
    if (activeFilters.dateRange.to) {
        constraints.push(where('fecha_hora_venta', '<=', Timestamp.fromDate(endOfDay(activeFilters.dateRange.to))));
    }
    if (activeFilters.localId !== 'todos') {
        constraints.push(where('local_id', '==', activeFilters.localId));
    }
    return constraints;
  }, [activeFilters]);

  const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>(
    'ventas',
    salesQueryConstraints ? `sales-${JSON.stringify(activeFilters)}` : undefined, 
    ...(salesQueryConstraints || [])
  );
  
  const clientMap = useMemo(() => {
      if (clientsLoading) return new Map();
      return new Map(clients.map(c => [c.id, c]));
  }, [clients, clientsLoading]);

  const salesWithClientData = useMemo(() => {
    if (salesLoading || clientsLoading) return [];
    return sales.map(sale => ({
        ...sale,
        cliente: clientMap.get(sale.cliente_id)
    }))
  }, [sales, clientMap, salesLoading, clientsLoading]);
  
  const handleSearch = () => {
    setActiveFilters({ dateRange, localId: selectedLocalId });
  };
  
  const isLoading = localesLoading || salesLoading || clientsLoading;

  const totalVentasFacturadas = useMemo(() => salesWithClientData.reduce((sum, sale) => sum + (sale.total || 0), 0), [salesWithClientData]);
  const efectivoEnCaja = useMemo(() => salesWithClientData.filter(s => s.metodo_pago === 'efectivo').reduce((sum, sale) => sum + sale.total, 0), [salesWithClientData]);


  return (
    <>
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight">Caja de Ventas</h2>
          <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setIsIngresoModalOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Ingresos
              </Button>
              <Button variant="outline" onClick={() => setIsEgresoModalOpen(true)}>
                  <Minus className="mr-2 h-4 w-4" /> Egresos
              </Button>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-stretch">
        <Card>
            <CardContent className="pt-6 flex flex-wrap items-end gap-4 h-full">
                <div className="space-y-2 flex-grow min-w-[200px]">
                <label className="text-sm font-medium">Local</label>
                <Select value={selectedLocalId || ''} onValueChange={setSelectedLocalId} disabled={localesLoading}>
                    <SelectTrigger>
                    <SelectValue placeholder={localesLoading ? "Cargando..." : "Seleccionar local"} />
                    </SelectTrigger>
                    <SelectContent>
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
        
        <Card className="flex-shrink-0 w-full md:w-64">
            <CardContent className="p-4 flex flex-col items-center justify-center h-full text-center">
                <p className="text-sm text-muted-foreground">Efectivo en caja</p>
                <p className="text-3xl font-extrabold text-primary">${efectivoEnCaja.toLocaleString('es-CL')}</p>
            </CardContent>
        </Card>

      </div>
       <div className="flex justify-end">
          <Button variant="ghost" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Descargar reporte
          </Button>
      </div>
      
      {/* Detailed Summary */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="Ventas Facturadas" amount={totalVentasFacturadas} />
        <SummaryCard title="Otros Ingresos" amount={0} />
        <SummaryCard title="Egresos" amount={0} />
        <SummaryCard title="Resultado de Flujo del Periodo" amount={totalVentasFacturadas} />
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
                            <TableCell>{format(sale.fecha_hora_venta.toDate(), 'dd-MM-yyyy HH:mm')}</TableCell>
                            <TableCell>{locales.find(l => l.id === sale.local_id)?.name}</TableCell>
                            <TableCell>{sale.cliente?.nombre} {sale.cliente?.apellido}</TableCell>
                            <TableCell>{sale.items?.map(i => i.nombre).join(', ')}</TableCell>
                            <TableCell className="text-right font-medium">${sale.total.toLocaleString('es-CL')}</TableCell>
                            <TableCell className="text-right font-medium text-primary">${sale.total.toLocaleString('es-CL')}</TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    Acciones <ChevronDown className="ml-2 h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem>
                                    <Eye className="mr-2 h-4 w-4" />
                                    Ver Detalle
                                  </DropdownMenuItem>
                                  <DropdownMenuItem>Anular</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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
                     <div className="text-center text-muted-foreground p-12">
                        <p>No hay egresos registrados para este período.</p>
                    </div>
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
    />
    </>
  );
}
