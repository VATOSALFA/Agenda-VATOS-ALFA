
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
  action,
  onClick
}: {
  title: string;
  amount: number;
  action?: 'plus' | 'minus';
  onClick?: () => void;
}) => (
  <Card className="text-center bg-card/70">
    <CardContent className="p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-xl font-bold text-primary">
        ${amount.toLocaleString('es-CL')}
      </p>
      {action && (
        <Button size="icon" variant="outline" className="mt-2 h-6 w-6 rounded-full" onClick={onClick}>
          {action === 'plus' ? (
            <Plus className="h-4 w-4" />
          ) : (
            <Minus className="h-4 w-4" />
          )}
        </Button>
      )}
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
  const [queryKey, setQueryKey] = useState(0);

  // Set default date filter on mount
  useEffect(() => {
    const today = new Date();
    const initialDateRange = { from: startOfDay(today), to: endOfDay(today) };
    setDateRange(initialDateRange);
    setActiveFilters(prev => ({ ...prev, dateRange: initialDateRange }));
  }, []);

  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes');

  // Set default local filter once locales are loaded
  useEffect(() => {
    if (locales.length > 0 && !activeFilters.localId) {
        const defaultLocalId = locales[0].id;
        setSelectedLocalId(defaultLocalId);
        setActiveFilters(prev => ({...prev, localId: defaultLocalId}));
    }
  }, [locales, activeFilters.localId]);


  const salesQueryConstraints = useMemo(() => {
    if (!activeFilters.dateRange?.from) return undefined;
    
    const constraints = [];
    constraints.push(where('fecha_hora_venta', '>=', Timestamp.fromDate(startOfDay(activeFilters.dateRange.from))));
    if (activeFilters.dateRange.to) {
        constraints.push(where('fecha_hora_venta', '<=', Timestamp.fromDate(endOfDay(activeFilters.dateRange.to))));
    }
    return constraints;
  }, [activeFilters.dateRange]);

  const { data: salesFromHook, loading: salesLoading } = useFirestoreQuery<Sale>(
    'ventas',
    `sales-${JSON.stringify(activeFilters)}`, // Key depends on filters now
    ...(salesQueryConstraints || [])
  );

  const sales = useMemo(() => {
      if (!activeFilters.localId || activeFilters.localId === 'todos') {
          return salesFromHook;
      }
      return salesFromHook.filter(sale => sale.local_id === activeFilters.localId);
  }, [salesFromHook, activeFilters.localId]);
  
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
    setQueryKey(prev => prev + 1);
  };
  
  const isLoading = localesLoading || salesLoading || clientsLoading;

  const totalVentasFacturadas = useMemo(() => sales.reduce((sum, sale) => sum + sale.total, 0), [sales]);
  const efectivoEnCaja = useMemo(() => sales.filter(s => s.metodo_pago === 'efectivo').reduce((sum, sale) => sum + sale.total, 0), [sales]);

  return (
    <>
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <h2 className="text-3xl font-bold tracking-tight">Caja de Ventas</h2>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
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

      {/* Main Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card text-card-foreground shadow-sm p-6">
        <h3 className="text-xl font-bold">{locales.find(l => l.id === selectedLocalId)?.name || 'Cargando...'}</h3>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-medium text-muted-foreground">Efectivo en caja</p>
            <p className="text-4xl font-extrabold text-primary">${efectivoEnCaja.toLocaleString('es-CL')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsIngresoModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Ingresos
            </Button>
            <Button variant="outline" onClick={() => setIsEgresoModalOpen(true)}>
              <Minus className="mr-2 h-4 w-4" /> Egresos
            </Button>
            <Button variant="outline">
              <ArrowRightLeft className="mr-2 h-4 w-4" /> Traspaso
            </Button>
          </div>
        </div>
      </div>
      
      {/* Detailed Summary */}
      <div className='bg-card p-4 rounded-lg border'>
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard title="Ventas Facturadas" amount={totalVentasFacturadas} action="plus" onClick={() => setIsIngresoModalOpen(true)} />
            <SummaryCard title="Otros Ingresos" amount={0} action="plus" onClick={() => setIsIngresoModalOpen(true)} />
            <SummaryCard title="Egresos" amount={0} action="minus" onClick={() => setIsEgresoModalOpen(true)}/>
            <SummaryCard title="Resultado de Flujo del Periodo" amount={totalVentasFacturadas} />
          </div>
          <div className="flex justify-end mt-4">
             <Button variant="ghost" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Descargar reporte
            </Button>
          </div>
      </div>


      {/* Main Table */}
      <Card>
        <CardHeader>
          <CardTitle>Flujo De Ventas Facturadas</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
    
    <AddIngresoModal 
        isOpen={isIngresoModalOpen}
        onOpenChange={setIsIngresoModalOpen}
        onFormSubmit={() => setIsIngresoModalOpen(false)}
    />
    <AddEgresoModal
        isOpen={isEgresoModalOpen}
        onOpenChange={setIsEgresoModalOpen}
        onFormSubmit={() => setIsEgresoModalOpen(false)}
    />
    </>
  );
}
