
'use client';

import { useState, useMemo, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { format, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import { where, Timestamp } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Download, ArrowUp, ArrowDown, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StockMovement, Local, Product, ProductPresentation, ProductCategory, Profesional } from "@/lib/types";

const AdjustmentCell = ({ from, to }: { from: number; to: number }) => {
  const isIncrease = to > from;
  return (
    <div className={cn("flex items-center gap-2", isIncrease ? "text-green-600" : "text-red-600")}>
      {isIncrease ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      <span className="font-semibold">De {from} a {to}</span>
    </div>
  );
};

export default function StockMovementPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState('todos');
  const [categoryFilter, setCategoryFilter] = useState('todos');
  const [productFilter, setProductFilter] = useState('todos');

  const [activeFilters, setActiveFilters] = useState({
    dateRange: dateRange,
    status: 'todos',
    category: 'todos',
    product: 'todos'
  });
  
  const [queryKey, setQueryKey] = useState(0);

  useEffect(() => {
    const today = new Date();
    const from = startOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30));
    const to = endOfDay(today);
    setDateRange({ from, to });
    setActiveFilters(prev => ({ ...prev, dateRange: { from, to }}));
  }, []);

  const { data: locales } = useFirestoreQuery<Local>('locales');
  const { data: products } = useFirestoreQuery<Product>('productos');
  const { data: presentations } = useFirestoreQuery<ProductPresentation>('formatos_productos');
  const { data: categories } = useFirestoreQuery<ProductCategory>('categorias_productos');
  const { data: professionals } = useFirestoreQuery<Profesional>('profesionales');

  const movementsQueryConstraints = useMemo(() => {
    const constraints = [];
    if (activeFilters.dateRange?.from) {
        constraints.push(where('date', '>=', Timestamp.fromDate(activeFilters.dateRange.from)));
    }
    if (activeFilters.dateRange?.to) {
        constraints.push(where('date', '<=', Timestamp.fromDate(activeFilters.dateRange.to)));
    }
    if (activeFilters.product !== 'todos') {
        constraints.push(where('product_id', '==', activeFilters.product));
    }
    return constraints;
  }, [activeFilters]);

  const { data: movements, loading: movementsLoading } = useFirestoreQuery<StockMovement>(
    'movimientos_stock', 
    `movements-${queryKey}`, 
    ...movementsQueryConstraints
  );

  const filteredMovements = useMemo(() => {
    if (movementsLoading) return [];
    
    let filtered = movements;

    if (activeFilters.category !== 'todos') {
      const productIdsInCategory = products.filter(p => p.category_id === activeFilters.category).map(p => p.id);
      filtered = filtered.filter(m => productIdsInCategory.includes(m.product_id));
    }

    if (activeFilters.status !== 'todos') {
        const productIdsWithStatus = products.filter(p => (activeFilters.status === 'active' && p.active) || (activeFilters.status === 'inactive' && !p.active)).map(p => p.id);
        filtered = filtered.filter(m => productIdsWithStatus.includes(m.product_id));
    }

    return filtered;

  }, [movements, products, movementsLoading, activeFilters]);

  const handleSearch = () => {
      setActiveFilters({
          dateRange: dateRange,
          status: statusFilter,
          category: categoryFilter,
          product: productFilter
      });
      setQueryKey(prev => prev + 1);
  }

  const localMap = useMemo(() => new Map(locales.map(l => [l.id, l.name])), [locales]);
  const productMap = useMemo(() => new Map(products.map(p => [p.id, p.nombre])), [products]);
  const presentationMap = useMemo(() => new Map(presentations.map(p => [p.id, p.name])), [presentations]);
  const professionalMap = useMemo(() => new Map(professionals.map(p => [p.id, p.name])), [professionals]);

  const isLoading = movementsLoading;

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <h2 className="text-3xl font-bold tracking-tight">Movimientos de stock</h2>
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div className="space-y-1">
            <label className="text-sm font-medium">Periodo de tiempo</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button id="date" variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>{format(dateRange.from, "LLL dd, y", { locale: es })} - {format(dateRange.to, "LLL dd, y", { locale: es })}</>
                    ) : (
                      format(dateRange.from, "LLL dd, y", { locale: es })
                    )
                  ) : (
                    <span>Desde/Hasta</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
              <label className="text-sm font-medium">Estado del producto</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="active">Activo</SelectItem><SelectItem value="inactive">Inactivo</SelectItem></SelectContent></Select>
          </div>
           <div className="space-y-1">
              <label className="text-sm font-medium">Categoría</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas</SelectItem>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
          </div>
           <div className="space-y-1">
              <label className="text-sm font-medium">Productos</label>
              <Select value={productFilter} onValueChange={setProductFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent></Select>
          </div>
          <Button onClick={handleSearch} disabled={isLoading}><Search className="mr-2 h-4 w-4" /> Buscar</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>Movimientos de stock</CardTitle></div>
          <div className="flex items-center gap-2"><Button variant="outline"><Download className="mr-2 h-4 w-4" /> Descargar</Button></div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Formato/Presentación</TableHead>
                <TableHead>Ajuste</TableHead>
                <TableHead>Causa</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Comentario</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                  Array.from({length: 5}).map((_, i) => (
                      <TableRow key={i}>
                          <TableCell colSpan={8} className="h-10"><div className="h-6 w-full bg-muted animate-pulse rounded-md"></div></TableCell>
                      </TableRow>
                  ))
              ) : filteredMovements.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center h-24">No hay movimientos para los filtros seleccionados.</TableCell></TableRow>
              ) : filteredMovements.map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell>{movement.date ? format(movement.date.toDate(), 'yyyy-MM-dd HH:mm') : 'N/A'}</TableCell>
                  <TableCell>{localMap.get(movement.local_id) || 'N/A'}</TableCell>
                  <TableCell className="font-medium">{productMap.get(movement.product_id) || 'N/A'}</TableCell>
                  <TableCell>{presentationMap.get(movement.presentation_id) || 'N/A'}</TableCell>
                  <TableCell><AdjustmentCell from={movement.from} to={movement.to} /></TableCell>
                  <TableCell>{movement.cause}</TableCell>
                  <TableCell>{professionalMap.get(movement.staff_id) || 'Admin'}</TableCell>
                  <TableCell>{movement.comment}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
