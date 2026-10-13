'use client';

import { useState, useMemo, useEffect } from "react";
import { format, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { Timestamp, where } from "firebase/firestore";
import type { DateRange } from "react-day-picker";
import { useRouter } from "next/navigation";
import * as XLSX from 'xlsx';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import { Badge } from "@/components/ui/badge";
import { 
    Loader2, 
    ArrowRight, 
    Calendar as CalendarIcon, 
    Search, 
    ChevronLeft, 
    ChevronRight, 
    ArrowUpDown, 
    ArrowUp, 
    ArrowDown,
    Download,
    Filter,
    Boxes,
    TrendingUp,
    TrendingDown
} from "lucide-react";
import type { StockMovement, Product, ProductCategory } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/firebase-auth-context";
import { useToast } from "@/hooks/use-toast";

export default function StockMovementPage() {
    const { toast } = useToast();
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState('todos');
    const [categoryFilter, setCategoryFilter] = useState('todos');
    const [productFilter, setProductFilter] = useState('todos');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [queryKey, setQueryKey] = useState(0);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && user) {
            const hasPermission = user.role === 'Administrador general' || user.permissions?.includes('ver_movimiento_stock');
            if (!hasPermission) {
                router.push('/dashboard');
            }
        }
    }, [user, authLoading, router]);

    // Queries
    const { data: movements, loading: movementsLoading } = useFirestoreQuery<StockMovement>(
        'movimientos_inventario',
        `movements-${queryKey}`,
        ...(dateRange?.from ? [where('date', '>=', Timestamp.fromDate(startOfDay(dateRange.from)))] : []),
        ...(dateRange?.to ? [where('date', '<=', Timestamp.fromDate(endOfDay(dateRange.to)))] : [])
    );
    const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');
    const { data: categories, loading: categoriesLoading } = useFirestoreQuery<ProductCategory>('categorias_productos');

    const loading = movementsLoading || productsLoading || categoriesLoading;

    // Filter Logic
    const filteredMovements = useMemo(() => {
        if (!movements || !products) return [];

        let filtered = [...movements];
        const productMap = new Map(products.map(p => [p.id, p]));

        // 1. Filter by Product Status
        if (statusFilter !== 'todos') {
            const isActive = statusFilter === 'active';
            filtered = filtered.filter(m => {
                const prod = productMap.get(m.product_id);
                return prod ? prod.active === isActive : false;
            });
        }

        // 2. Filter by Category
        if (categoryFilter !== 'todos') {
            filtered = filtered.filter(m => {
                const prod = productMap.get(m.product_id);
                return prod ? prod.category_id === categoryFilter : false;
            });
        }

        // 3. Filter by Product
        if (productFilter !== 'todos') {
            filtered = filtered.filter(m => m.product_id === productFilter);
        }

        // Sort
        if (sortConfig !== null) {
            filtered.sort((a, b) => {
                let aValue: any;
                let bValue: any;

                switch (sortConfig.key) {
                    case 'date':
                        aValue = a.date instanceof Timestamp ? a.date.toMillis() : new Date(a.date).getTime();
                        bValue = b.date instanceof Timestamp ? b.date.toMillis() : new Date(b.date).getTime();
                        break;
                    case 'local':
                        aValue = (a.local_name || a.local_id || '').toLowerCase();
                        bValue = (b.local_name || b.local_id || '').toLowerCase();
                        break;
                    case 'product':
                        aValue = (a.product_name || '').toLowerCase();
                        bValue = (b.product_name || '').toLowerCase();
                        break;
                    case 'adjustment':
                        aValue = (a.to || 0) - (a.from || 0);
                        bValue = (b.to || 0) - (b.from || 0);
                        break;
                    case 'concept':
                        aValue = (a.concepto || a.cause || '').toLowerCase();
                        bValue = (b.concepto || b.cause || '').toLowerCase();
                        break;
                    case 'staff':
                        aValue = (a.staff_name || '').toLowerCase();
                        bValue = (b.staff_name || '').toLowerCase();
                        break;
                    case 'comment':
                        aValue = (a.comment || '').toLowerCase();
                        bValue = (b.comment || '').toLowerCase();
                        break;
                    default:
                        return 0;
                }

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        } else {
            // Sort by date desc (default)
            filtered.sort((a, b) => {
                const dateA = a.date instanceof Timestamp ? a.date.toMillis() : new Date(a.date).getTime();
                const dateB = b.date instanceof Timestamp ? b.date.toMillis() : new Date(b.date).getTime();
                return dateB - dateA;
            });
        }

        return filtered;
    }, [movements, products, statusFilter, categoryFilter, productFilter, sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const SortIcon = ({ field }: { field: string }) => {
        if (!sortConfig || sortConfig.key !== field) return <ArrowUpDown className="ml-1 h-3 w-3 text-slate-400/60 transition-colors group-hover:text-foreground" />;
        if (sortConfig.direction === 'asc') return <ArrowUp className="ml-1 h-3 w-3 text-blue-400" />;
        return <ArrowDown className="ml-1 h-3 w-3 text-blue-400" />;
    };

    // Metrics Logic
    const metrics = useMemo(() => {
        let entradas = 0;
        let salidas = 0;
        filteredMovements.forEach(m => {
            const diff = (m.to || 0) - (m.from || 0);
            if (diff > 0) entradas += 1;
            else if (diff < 0) salidas += 1;
        });
        return {
            total: filteredMovements.length,
            entradas,
            salidas
        };
    }, [filteredMovements]);

    // Pagination Logic
    useEffect(() => {
        setCurrentPage(1);
    }, [dateRange, statusFilter, categoryFilter, productFilter, queryKey]);

    const totalPages = Math.ceil(filteredMovements.length / itemsPerPage);
    const paginatedMovements = filteredMovements.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handleSearch = () => {
        setQueryKey(prev => prev + 1);
        setCurrentPage(1);
    };

    const handleDownload = () => {
        if (filteredMovements.length === 0) {
            toast({
                variant: "destructive",
                title: "No hay datos para exportar",
                description: "No hay movimientos registrados en el período seleccionado.",
            });
            return;
        }

        const dataForExcel = filteredMovements.map(m => {
            const date = m.date instanceof Timestamp ? m.date.toDate() : new Date(m.date);
            const diff = (m.to || 0) - (m.from || 0);
            return {
                'Fecha': format(date, "dd/MM/yyyy HH:mm", { locale: es }),
                'Local': m.local_name || m.local_id || 'N/A',
                'Producto': m.product_name || 'Desconocido',
                'Stock Anterior': m.from ?? 0,
                'Stock Nuevo': m.to ?? 0,
                'Ajuste': diff > 0 ? `+${diff}` : `${diff}`,
                'Concepto': m.concepto || m.cause || 'N/A',
                'Staff': m.staff_name || 'Sistema',
                'Comentarios': m.comment || ''
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Movimientos_Stock");
        XLSX.writeFile(workbook, `Movimientos_Stock_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

        toast({
            title: "Reporte generado",
            description: "La descarga de movimientos de stock ha comenzado.",
        });
    };

    if (authLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="w-8 h-8 animate-spin" /></div>;

    return (
        <div className="flex-1 space-y-4 p-3 sm:p-6 md:p-8 pt-4 sm:pt-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                        Movimientos de stock
                    </h1>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 hidden sm:block">
                        Historial de cambios y ajustes en el inventario.
                    </p>
                </div>
            </div>

            {/* FILTROS ESCRITORIO (hidden sm:block) */}
            <Card className="hidden sm:block rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/40">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Filter className="h-4 w-4 text-slate-400" /> Filtros de búsqueda
                    </CardTitle>
                    <CardDescription className="text-xs">Filtra por fecha, estado, categoría o producto específico.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col lg:flex-row lg:items-end gap-3 sm:gap-4">
                        {/* Periodo de tiempo */}
                        <div className="flex-1 min-w-[180px] space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Periodo de tiempo</label>
                            <Popover open={isCalendarOpen} onOpenChange={(open) => {
                                setIsCalendarOpen(open);
                                if (open) setDateRange(undefined);
                            }}>
                                <PopoverTrigger asChild>
                                    <Button id="date" variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl h-10 border-border/60 text-xs sm:text-sm", !dateRange && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4 text-slate-400 shrink-0" />
                                        {dateRange?.from ? (
                                            dateRange.to ? (
                                                <>{format(dateRange.from, "dd MMM, y", { locale: es })} - {format(dateRange.to, "dd MMM, y", { locale: es })}</>
                                            ) : (
                                                format(dateRange.from, "dd MMM, y", { locale: es })
                                            )
                                        ) : (
                                            <span>Periodo de tiempo</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]" align="start">
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        defaultMonth={dateRange?.from}
                                        selected={dateRange}
                                        onSelect={(range) => {
                                            setDateRange(range);
                                            if (range?.from && range?.to) {
                                                setIsCalendarOpen(false);
                                            }
                                        }}
                                        numberOfMonths={1}
                                        locale={es}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Estado */}
                        <div className="flex-1 min-w-[140px] space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado</label>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-full rounded-xl h-10 border-border/60 text-xs sm:text-sm">
                                    <SelectValue placeholder="Estado del producto" />
                                </SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                    <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos los estados</SelectItem>
                                    <SelectItem value="active" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Activo</SelectItem>
                                    <SelectItem value="inactive" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Inactivo</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Categoría */}
                        <div className="flex-1 min-w-[150px] space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Categoría</label>
                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger className="w-full rounded-xl h-10 border-border/60 text-xs sm:text-sm">
                                    <SelectValue placeholder="Categoría" />
                                </SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                    <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todas las categorías</SelectItem>
                                    {categories?.map(c => (
                                        <SelectItem key={c.id} value={c.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Producto */}
                        <div className="flex-1 min-w-[160px] space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Producto</label>
                            <Select value={productFilter} onValueChange={setProductFilter}>
                                <SelectTrigger className="w-full rounded-xl h-10 border-border/60 text-xs sm:text-sm">
                                    <SelectValue placeholder="Producto" />
                                </SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1 max-h-64">
                                    <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos los productos</SelectItem>
                                    {products?.map(p => (
                                        <SelectItem key={p.id} value={p.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">{p.nombre}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Botón Buscar Vatos Alfa (Ajustado al tamaño del texto) */}
                        <div className="shrink-0">
                            <Button 
                                variant="alfa" 
                                className="h-10 rounded-xl px-4 text-xs sm:text-sm font-bold text-white shadow-md w-auto" 
                                onClick={handleSearch} 
                                disabled={loading}
                            >
                                {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
                                Buscar
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* FILTROS MÓVIL COMPACTO (sm:hidden) */}
            <Card className="sm:hidden rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm">
                <CardContent className="p-2.5 space-y-2">
                    <div className="flex items-center gap-1.5">
                        {/* Selector de Rango de Fecha */}
                        <Popover open={isCalendarOpen} onOpenChange={(open) => {
                            setIsCalendarOpen(open);
                            if (open) setDateRange(undefined);
                        }}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="flex-1 justify-start text-left font-normal rounded-xl h-9 text-xs border-border/60 px-2.5 truncate">
                                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
                                    <span className="truncate">
                                        {dateRange?.from ? (
                                            dateRange.to ? (
                                                `${format(dateRange.from, "dd MMM", { locale: es })} - ${format(dateRange.to, "dd MMM", { locale: es })}`
                                            ) : (
                                                format(dateRange.from, "dd MMM, y", { locale: es })
                                            )
                                        ) : (
                                            'Periodo'
                                        )}
                                    </span>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]" align="start">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange?.from}
                                    selected={dateRange}
                                    onSelect={(range) => {
                                        setDateRange(range);
                                        if (range?.from && range?.to) {
                                            setIsCalendarOpen(false);
                                        }
                                    }}
                                    numberOfMonths={1}
                                    locale={es}
                                />
                            </PopoverContent>
                        </Popover>

                        {/* Botón Buscar */}
                        <Button 
                            variant="alfa" 
                            size="sm" 
                            className="h-9 px-3 rounded-xl text-xs font-bold text-white shadow-sm shrink-0" 
                            onClick={handleSearch} 
                            disabled={loading}
                        >
                            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1" />}
                            Buscar
                        </Button>
                    </div>

                    {/* Fila 2: Categoría y Producto */}
                    <div className="grid grid-cols-2 gap-1.5">
                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                            <SelectTrigger className="rounded-xl h-9 text-xs border-border/60">
                                <SelectValue placeholder="Categoría" />
                            </SelectTrigger>
                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todas</SelectItem>
                                {categories?.map(c => (
                                    <SelectItem key={c.id} value={c.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={productFilter} onValueChange={setProductFilter}>
                            <SelectTrigger className="rounded-xl h-9 text-xs border-border/60">
                                <SelectValue placeholder="Producto" />
                            </SelectTrigger>
                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1 max-h-64">
                                <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos</SelectItem>
                                {products?.map(p => (
                                    <SelectItem key={p.id} value={p.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">{p.nombre}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* TARJETAS DE MÉTRICAS ESCRITORIO (hidden sm:grid) */}
            <div className="hidden sm:grid sm:grid-cols-3 gap-3">
                {/* Total Movimientos */}
                <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3.5 sm:p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Total Movimientos</span>
                        <Boxes className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="mt-1.5">
                        <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-mono">
                            {metrics.total}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            Registros en inventario
                        </p>
                    </div>
                </Card>

                {/* Entradas / Incrementos */}
                <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3.5 sm:p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Incrementos (+Stock)</span>
                        <TrendingUp className="h-4 w-4 text-blue-400" />
                    </div>
                    <div className="mt-1.5">
                        <div className="text-xl sm:text-2xl font-bold tracking-tight text-blue-400 font-mono">
                            +{metrics.entradas}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            Entradas o cancelaciones
                        </p>
                    </div>
                </Card>

                {/* Salidas / Reducciones */}
                <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3.5 sm:p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Reducciones (-Stock)</span>
                        <TrendingDown className="h-4 w-4 text-red-400" />
                    </div>
                    <div className="mt-1.5">
                        <div className="text-xl sm:text-2xl font-bold tracking-tight text-red-400 font-mono">
                            -{metrics.salidas}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            Ventas o mermas registradas
                        </p>
                    </div>
                </Card>
            </div>

            {/* TARJETA MÉTRICAS MÓVIL COMPACTA (sm:hidden) */}
            <Card className="sm:hidden rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3">
                <div className="flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                            <Boxes className="h-4 w-4 text-slate-400 shrink-0" />
                            <span className="text-xs font-semibold text-foreground">Movimientos</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            <span className="text-blue-400 font-medium">+{metrics.entradas} entradas</span> • <span className="text-red-400 font-medium">-{metrics.salidas} salidas</span>
                        </p>
                    </div>
                    <div className="text-lg font-bold tracking-tight text-foreground font-mono shrink-0">
                        {metrics.total}
                    </div>
                </div>
            </Card>

            {/* TABLA PRINCIPAL */}
            <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm">
                <CardHeader className="flex-row items-center justify-between p-3.5 sm:p-5 border-b border-border/60">
                    <div>
                        <CardTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                            Historial de movimientos
                            <Badge variant="secondary" className="font-normal text-xs">
                                {filteredMovements.length} {filteredMovements.length === 1 ? 'registro' : 'registros'}
                            </Badge>
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                            Detalle de cada ajuste o cambio registrado en el stock.
                        </CardDescription>
                    </div>
                    <button 
                        type="button"
                        className="text-slate-400 hover:text-white transition-colors p-1" 
                        onClick={handleDownload}
                        title="Descargar movimientos en Excel"
                    >
                        <Download className="h-4 w-4" />
                    </button>
                </CardHeader>
                <CardContent className="p-0">
                    {/* VISTA ESCRITORIO: TABLA COMPACTA ("PEGADITA") */}
                    <div className="hidden sm:block overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                    <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('date')}>
                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Fecha
                                            <SortIcon field="date" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('local')}>
                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Local
                                            <SortIcon field="local" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('product')}>
                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Producto
                                            <SortIcon field="product" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('adjustment')}>
                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Ajuste
                                            <SortIcon field="adjustment" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('concept')}>
                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Concepto
                                            <SortIcon field="concept" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('staff')}>
                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Staff
                                            <SortIcon field="staff" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="py-1 px-3 text-xs min-w-[240px] cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('comment')}>
                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Comentarios
                                            <SortIcon field="comment" />
                                        </div>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow className="h-16">
                                        <TableCell colSpan={7} className="text-center text-xs text-muted-foreground">
                                            <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400 mb-1" />
                                            Cargando movimientos...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredMovements.length === 0 ? (
                                    <TableRow className="h-16">
                                        <TableCell colSpan={7} className="text-center text-xs text-muted-foreground">
                                            No hay movimientos registrados con estos filtros.
                                        </TableCell>
                                    </TableRow>
                                ) : paginatedMovements.map((movement) => {
                                    const date = movement.date instanceof Timestamp ? movement.date.toDate() : new Date(movement.date);
                                    const diff = (movement.to || 0) - (movement.from || 0);
                                    const isPositive = diff > 0;

                                    return (
                                        <TableRow key={movement.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                            <TableCell className="py-1.5 px-3 text-xs whitespace-nowrap">
                                                {format(date, "dd/MM/yyyy HH:mm", { locale: es })}
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs">
                                                {movement.local_name || movement.local_id}
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs font-medium text-foreground">
                                                {movement.product_name || 'Producto desconocido'}
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs">
                                                <div className="flex items-center gap-1.5 font-mono text-xs">
                                                    <span className="text-muted-foreground">{movement.from}</span>
                                                    <ArrowRight className="h-3 w-3 text-slate-400" />
                                                    <span className="font-semibold text-foreground">{movement.to}</span>
                                                    <span className={cn(
                                                        "text-[10px] font-bold px-1.5 py-0.5 rounded font-mono",
                                                        isPositive ? "text-blue-400 bg-blue-500/10" : "text-slate-300 bg-white/10"
                                                    )}>
                                                        {isPositive ? '+' : ''}{diff}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs">
                                                <span className="text-xs text-foreground/90 font-medium truncate block max-w-[180px]" title={movement.concepto || movement.cause || 'N/A'}>
                                                    {movement.concepto || movement.cause || 'N/A'}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs text-slate-300">
                                                <span className="truncate block max-w-[140px]">{movement.staff_name || 'Sistema'}</span>
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs text-muted-foreground" title={movement.comment}>
                                                <span className="truncate block max-w-[320px]">{movement.comment || '-'}</span>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>

                    {/* VISTA MÓVIL: TARJETAS COMPACTAS */}
                    <div className="sm:hidden divide-y divide-border/60">
                        {loading ? (
                            <div className="text-center py-10 space-y-2">
                                <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
                                <span className="text-xs text-muted-foreground">Cargando movimientos...</span>
                            </div>
                        ) : paginatedMovements.length === 0 ? (
                            <div className="text-center py-10 text-xs text-muted-foreground">
                                No hay movimientos registrados con estos filtros.
                            </div>
                        ) : (
                            paginatedMovements.map((movement) => {
                                const date = movement.date instanceof Timestamp ? movement.date.toDate() : new Date(movement.date);
                                const diff = (movement.to || 0) - (movement.from || 0);
                                const isPositive = diff > 0;

                                return (
                                    <div key={movement.id} className="p-3 space-y-1.5 bg-card/40 hover:bg-muted/20 transition-colors">
                                        <div className="flex items-center justify-between">
                                            <div className="min-w-0 pr-2">
                                                <p className="font-bold text-sm text-foreground truncate">
                                                    {movement.product_name || 'Producto desconocido'}
                                                </p>
                                                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                                    <span>{format(date, "dd/MM/yyyy HH:mm", { locale: es })}</span>
                                                    <span>•</span>
                                                    <span className="truncate">{movement.local_name || movement.local_id}</span>
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="flex items-center gap-1 font-mono text-xs">
                                                    <span className="text-muted-foreground">{movement.from}</span>
                                                    <ArrowRight className="h-3 w-3 text-slate-400" />
                                                    <span className="font-bold text-foreground">{movement.to}</span>
                                                </div>
                                                <span className={cn(
                                                    "inline-block text-[10px] font-bold px-1.5 py-0.5 rounded font-mono mt-0.5",
                                                    isPositive ? "text-blue-400 bg-blue-500/10" : "text-slate-300 bg-white/10"
                                                )}>
                                                    {isPositive ? '+' : ''}{diff}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 px-2.5 py-1.5 rounded-lg">
                                            <span className="text-[11px] text-slate-300 truncate">
                                                {movement.concepto || movement.cause || 'Ajuste'}
                                            </span>
                                            <span className="text-[11px] text-muted-foreground truncate pl-2 shrink-0">
                                                {movement.staff_name || 'Sistema'}
                                            </span>
                                        </div>

                                        {movement.comment && (
                                            <p className="text-[11px] text-muted-foreground/80 italic px-1 truncate">
                                                "{movement.comment}"
                                            </p>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* PAGINACIÓN */}
                    {!loading && filteredMovements.length > 0 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 sm:p-4 border-t border-border/60">
                            <div className="flex items-center space-x-2">
                                <p className="text-xs text-muted-foreground">Resultados por página</p>
                                <Select
                                    value={`${itemsPerPage}`}
                                    onValueChange={(value) => {
                                        setItemsPerPage(Number(value));
                                        setCurrentPage(1);
                                    }}
                                >
                                    <SelectTrigger className="h-8 w-[70px] rounded-lg text-xs border-border/60">
                                        <SelectValue placeholder={itemsPerPage} />
                                    </SelectTrigger>
                                    <SelectContent className="border-2 border-blue-500 rounded-xl bg-[#151b2e] text-white">
                                        <SelectItem value="10">10</SelectItem>
                                        <SelectItem value="20">20</SelectItem>
                                        <SelectItem value="50">50</SelectItem>
                                        <SelectItem value="100">100</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="text-xs text-muted-foreground font-medium">
                                    Página {currentPage} de {totalPages || 1}
                                </div>
                                <div className="flex items-center space-x-1.5">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        className="h-8 rounded-lg border-border/60 text-xs"
                                    >
                                        <ChevronLeft className="h-3.5 w-3.5 mr-1 text-slate-400" /> Anterior
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                        className="h-8 rounded-lg border-border/60 text-xs"
                                    >
                                        Siguiente <ChevronRight className="h-3.5 w-3.5 ml-1 text-slate-400" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}