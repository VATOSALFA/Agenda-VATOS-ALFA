'use client';

import { useState, useMemo, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { Timestamp, where, orderBy } from 'firebase/firestore';
import * as XLSX from 'xlsx';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { 
    Calendar as CalendarIcon, 
    Download, 
    Filter, 
    Search, 
    Loader2, 
    ChevronLeft, 
    ChevronRight,
    DollarSign,
    Receipt,
    TrendingUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Local, Profesional, Role } from "@/lib/types";
import { useAuth } from "@/contexts/firebase-auth-context";
import { useToast } from "@/hooks/use-toast";

export default function TipsPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const isLocalRestricted = !!user?.local_id && user?.role !== 'Administrador general';
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);

    const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: new Date(), to: new Date() });
    const [localFilter, setLocalFilter] = useState('todos');
    const [professionalFilter, setProfessionalFilter] = useState('todos');

    // Estado para los filtros activos (aplicados al buscar)
    const [activeFilters, setActiveFilters] = useState<{
        dateRange: DateRange | undefined;
        local: string;
        professional: string;
    }>({
        dateRange: { from: new Date(), to: new Date() },
        local: 'todos',
        professional: 'todos'
    });

    const [queryKey, setQueryKey] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const handleDateSelect = (range: DateRange | undefined) => {
        setDateRange(range);
        if (range?.from && range?.to) {
            setIsPopoverOpen(false);
        }
    };

    // 1. Cargar catálogos
    const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', where('active', '==', true));
    const { data: clients } = useFirestoreQuery<any>('clientes');

    // 2. Configurar rango de fechas inicial (Hoy) y filtros por defecto
    useEffect(() => {
        const today = new Date();
        const initialDateRange = { from: startOfDay(today), to: endOfDay(today) };

        if (!dateRange) {
            setDateRange(initialDateRange);
        }

        const initialFilters = {
            dateRange: initialDateRange,
            local: (isLocalRestricted && user?.local_id) ? user.local_id : 'todos',
            professional: 'todos'
        };

        if (!activeFilters.dateRange) {
            setActiveFilters(initialFilters);
            if (isLocalRestricted && user?.local_id) {
                setLocalFilter(user.local_id);
            }
        }
    }, [user, isLocalRestricted]);

    // 3. Construir consulta a 'ventas' basada en fechas ACTIVAS
    const salesConstraints = useMemo(() => {
        if (!activeFilters.dateRange?.from) return [];

        const start = Timestamp.fromDate(startOfDay(activeFilters.dateRange.from));
        const end = Timestamp.fromDate(endOfDay(activeFilters.dateRange.to || activeFilters.dateRange.from));

        return [
            where('fecha_hora_venta', '>=', start),
            where('fecha_hora_venta', '<=', end),
            orderBy('fecha_hora_venta', 'desc')
        ];
    }, [activeFilters.dateRange]);

    // 4. Ejecutar consulta
    const { data: rawSales, loading: salesLoading } = useFirestoreQuery<any>(
        'ventas',
        `tips-sales-${queryKey}`,
        ...salesConstraints
    );

    // 5. Procesar y Filtrar Datos en Memoria usando filtros ACTIVOS
    const filteredTips = useMemo(() => {
        if (!rawSales) return [];

        return rawSales
            // Solo ventas con propina mayor a 0
            .filter(sale => (sale.propina && Number(sale.propina) > 0))
            // Filtrar por Local ACTIVO
            .filter(sale => activeFilters.local === 'todos' || sale.local_id === activeFilters.local)
            // Filtrar por Profesional ACTIVO
            .filter(sale => {
                if (activeFilters.professional === 'todos') return true;
                return sale.items?.some((item: any) => item.barbero_id === activeFilters.professional);
            })
            .map(sale => {
                const allBarberIds = Array.from(new Set(sale.items?.map((i: any) => i.barbero_id).filter(Boolean)));
                const uniqueBarberIds = allBarberIds.filter(id => professionals?.some(p => p.id === id));
                const professionalNames = uniqueBarberIds.map((id: any) => {
                    const prof = professionals?.find(p => p.id === id);
                    return prof ? prof.name : 'Desconocido';
                }).join(', ');

                const localName = locales?.find(l => l.id === sale.local_id)?.name || 'Local desconocido';

                const clientName = clients?.find((c: any) => c.id === sale.cliente_id)?.nombre
                    ? `${clients.find((c: any) => c.id === sale.cliente_id)?.nombre} ${clients.find((c: any) => c.id === sale.cliente_id)?.apellido || ''}`
                    : (sale.cliente_nombre || 'Cliente General');

                return {
                    id: sale.id,
                    saleId: sale.id.slice(0, 8),
                    date: sale.fecha_hora_venta?.toDate(),
                    localName: localName,
                    clientName: clientName,
                    professionalName: professionalNames || 'Sin asignar',
                    tip: Number(sale.propina)
                };
            });
    }, [rawSales, activeFilters, locales, professionals, clients]);

    const totalPages = Math.ceil(filteredTips.length / itemsPerPage);
    const paginatedTips = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredTips.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredTips, currentPage, itemsPerPage]);

    const totalTips = useMemo(() => {
        return filteredTips.reduce((acc, item) => acc + item.tip, 0);
    }, [filteredTips]);

    const averageTip = useMemo(() => {
        if (filteredTips.length === 0) return 0;
        return totalTips / filteredTips.length;
    }, [filteredTips, totalTips]);

    const handleSearch = () => {
        setActiveFilters({
            dateRange: dateRange,
            local: localFilter,
            professional: professionalFilter
        });
        setQueryKey(prev => prev + 1);
        setCurrentPage(1);
    };

    const handleDownload = () => {
        if (filteredTips.length === 0) {
            toast({
                variant: "destructive",
                title: "No hay datos para exportar",
                description: "No hay registros de propinas en el período seleccionado.",
            });
            return;
        }

        const dataForExcel = filteredTips.map(tip => ({
            'Folio Venta': tip.saleId,
            'Fecha': tip.date ? format(tip.date, 'dd/MM/yyyy HH:mm') : 'N/A',
            'Local': tip.localName,
            'Cliente': tip.clientName,
            'Profesional': tip.professionalName,
            'Propina': tip.tip
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Propinas");
        XLSX.writeFile(workbook, `Reporte_Propinas_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

        toast({
            title: "Reporte generado",
            description: "La descarga del reporte de propinas ha comenzado.",
        });
    };

    const isLoading = localesLoading || professionalsLoading || salesLoading;

    const { data: roles } = useFirestoreQuery<Role>('roles');
    const userRole = roles?.find(r => r.title === user?.role);
    const historyLimit = userRole?.historyRestrictionDays;

    return (
        <div className="flex-1 space-y-4 p-3 sm:p-6 md:p-8 pt-4 sm:pt-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                        Propinas
                    </h1>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 hidden sm:block">
                        Registro y control de propinas recibidas por profesional y sucursal.
                    </p>
                </div>
            </div>

            {/* FILTROS ESCRITORIO (hidden sm:block) */}
            <Card className="hidden sm:block rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/40">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Filter className="h-4 w-4 text-slate-400" /> Filtros de búsqueda
                    </CardTitle>
                    <CardDescription className="text-xs">Filtra el registro de propinas por periodo, local y profesional.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col lg:flex-row lg:items-end gap-3 sm:gap-4">
                        {/* Periodo de tiempo */}
                        <div className="flex-1 min-w-[200px] space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Periodo de tiempo</label>
                            <Popover open={isPopoverOpen} onOpenChange={(open) => {
                                setIsPopoverOpen(open);
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
                                            <span>Seleccionar rango</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]" align="start">
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        defaultMonth={dateRange?.from}
                                        selected={dateRange}
                                        onSelect={handleDateSelect}
                                        numberOfMonths={1}
                                        locale={es}
                                        disabled={historyLimit !== undefined && historyLimit !== null ? (date) => date > new Date() || date < subDays(new Date(), historyLimit) : undefined}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Local */}
                        <div className="flex-1 min-w-[170px] space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Local / Sucursal</label>
                            <Select value={localFilter} onValueChange={setLocalFilter} disabled={localesLoading || isLocalRestricted}>
                                <SelectTrigger className="w-full rounded-xl h-10 border-border/60 text-xs sm:text-sm">
                                    <SelectValue placeholder={localesLoading ? "Cargando..." : "Todos"} />
                                </SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                    {!isLocalRestricted && <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">Todos los locales</SelectItem>}
                                    {locales?.map(l => (
                                        <SelectItem key={l.id} value={l.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">{l.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Profesional */}
                        <div className="flex-1 min-w-[170px] space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Profesional</label>
                            <Select value={professionalFilter} onValueChange={setProfessionalFilter} disabled={professionalsLoading}>
                                <SelectTrigger className="w-full rounded-xl h-10 border-border/60 text-xs sm:text-sm">
                                    <SelectValue placeholder={professionalsLoading ? "Cargando..." : "Todos"} />
                                </SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1 max-h-64">
                                    <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">Todos los profesionales</SelectItem>
                                    {professionals?.map(p => (
                                        <SelectItem key={p.id} value={p.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">
                                            {p.name}{p.deleted ? ' (Eliminado)' : ''}
                                        </SelectItem>
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
                                disabled={isLoading}
                            >
                                {isLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
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
                        <Popover open={isPopoverOpen} onOpenChange={(open) => {
                            setIsPopoverOpen(open);
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
                                            'Fecha'
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
                                    onSelect={handleDateSelect}
                                    numberOfMonths={1}
                                    locale={es}
                                    disabled={historyLimit !== undefined && historyLimit !== null ? (date) => date > new Date() || date < subDays(new Date(), historyLimit) : undefined}
                                />
                            </PopoverContent>
                        </Popover>

                        {/* Botón Buscar */}
                        <Button 
                            variant="alfa" 
                            size="sm" 
                            className="h-9 px-3 rounded-xl text-xs font-bold text-white shadow-sm shrink-0" 
                            onClick={handleSearch} 
                            disabled={isLoading}
                        >
                            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1" />}
                            Buscar
                        </Button>
                    </div>

                    {/* Fila 2: Selectores compactos */}
                    <div className="grid grid-cols-2 gap-1.5">
                        <Select value={localFilter} onValueChange={setLocalFilter} disabled={localesLoading || isLocalRestricted}>
                            <SelectTrigger className="rounded-xl h-9 text-xs border-border/60">
                                <SelectValue placeholder={localesLoading ? "Cargando..." : "Local"} />
                            </SelectTrigger>
                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                {!isLocalRestricted && <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">Todos los locales</SelectItem>}
                                {locales?.map(l => (
                                    <SelectItem key={l.id} value={l.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">{l.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={professionalFilter} onValueChange={setProfessionalFilter} disabled={professionalsLoading}>
                            <SelectTrigger className="rounded-xl h-9 text-xs border-border/60">
                                <SelectValue placeholder={professionalsLoading ? "Cargando..." : "Profesional"} />
                            </SelectTrigger>
                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1 max-h-64">
                                <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">Todos</SelectItem>
                                {professionals?.map(p => (
                                    <SelectItem key={p.id} value={p.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">
                                        {p.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* TARJETAS DE MÉTRICAS ESCRITORIO (hidden sm:grid) */}
            <div className="hidden sm:grid sm:grid-cols-3 gap-3">
                {/* Total Propinas */}
                <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3.5 sm:p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Total Propinas</span>
                        <DollarSign className="h-4 w-4 text-[#C5A880]" />
                    </div>
                    <div className="mt-1.5">
                        <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                            ${totalTips.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            En el período seleccionado
                        </p>
                    </div>
                </Card>

                {/* Registros */}
                <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3.5 sm:p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Registros con Propina</span>
                        <Receipt className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="mt-1.5">
                        <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                            {filteredTips.length}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            Ventas con propina recibida
                        </p>
                    </div>
                </Card>

                {/* Promedio */}
                <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3.5 sm:p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Promedio por Propina</span>
                        <TrendingUp className="h-4 w-4 text-blue-400" />
                    </div>
                    <div className="mt-1.5">
                        <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                            ${averageTip.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            Por transacción
                        </p>
                    </div>
                </Card>
            </div>

            {/* TARJETA MÉTRICAS MÓVIL COMPACTA (sm:hidden) */}
            <Card className="sm:hidden rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3">
                <div className="flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                            <DollarSign className="h-4 w-4 text-[#C5A880] shrink-0" />
                            <span className="text-xs font-semibold text-foreground">Total Propinas</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            {filteredTips.length} {filteredTips.length === 1 ? 'registro' : 'registros'} • Prom. ${averageTip.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </div>
                    <div className="text-lg font-bold tracking-tight text-foreground shrink-0">
                        ${totalTips.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>
            </Card>

            {/* TABLA PRINCIPAL */}
            <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm">
                <CardHeader className="flex-row items-center justify-between p-3.5 sm:p-5 border-b border-border/60">
                    <div>
                        <CardTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                            Registro de Propinas
                            <Badge variant="secondary" className="font-normal text-xs">
                                {filteredTips.length} {filteredTips.length === 1 ? 'propina' : 'propinas'}
                            </Badge>
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                            Detalle de las propinas recibidas en el período seleccionado.
                        </CardDescription>
                    </div>
                    <button 
                        type="button"
                        className="text-slate-400 hover:text-white transition-colors p-1" 
                        onClick={handleDownload}
                        title="Descargar propinas en Excel"
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
                                    <TableHead className="py-1 px-3 text-xs font-semibold">Folio Venta</TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold">Fecha</TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold">Local</TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold">Cliente</TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold">Profesional</TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold text-right">Propina</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow className="h-16">
                                        <TableCell colSpan={6} className="text-center text-xs text-muted-foreground">
                                            <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400 mb-1" />
                                            Cargando propinas...
                                        </TableCell>
                                    </TableRow>
                                ) : paginatedTips.length === 0 ? (
                                    <TableRow className="h-16">
                                        <TableCell colSpan={6} className="text-center text-xs text-muted-foreground">
                                            No hay propinas registradas en este período.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedTips.map((tip) => (
                                        <TableRow key={tip.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                            <TableCell className="py-1.5 px-3 font-mono text-xs text-muted-foreground">...{tip.saleId}</TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs whitespace-nowrap">{tip.date ? format(tip.date, 'dd/MM/yyyy HH:mm', { locale: es }) : '-'}</TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs">{tip.localName}</TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs font-medium text-foreground">{tip.clientName}</TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs">{tip.professionalName}</TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs text-right font-bold text-foreground">
                                                +${tip.tip.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                            {!isLoading && filteredTips.length > 0 && (
                                <TableFooter>
                                    <TableRow className="h-8 bg-muted/40 font-bold border-t border-border/60">
                                        <TableCell colSpan={5} className="py-1 px-3 text-right font-bold text-xs uppercase tracking-wider text-muted-foreground">
                                            Total Propinas
                                        </TableCell>
                                        <TableCell className="py-1 px-3 text-right font-extrabold text-sm text-foreground">
                                            +${totalTips.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </TableCell>
                                    </TableRow>
                                </TableFooter>
                            )}
                        </Table>
                    </div>

                    {/* VISTA MÓVIL: TARJETAS COMPACTAS */}
                    <div className="sm:hidden divide-y divide-border/60">
                        {isLoading ? (
                            <div className="text-center py-10 space-y-2">
                                <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
                                <span className="text-xs text-muted-foreground">Cargando propinas...</span>
                            </div>
                        ) : paginatedTips.length === 0 ? (
                            <div className="text-center py-10 text-xs text-muted-foreground">
                                No hay propinas registradas en este período.
                            </div>
                        ) : (
                            paginatedTips.map((tip) => (
                                <div key={tip.id} className="p-3 space-y-1.5 bg-card/40 hover:bg-muted/20 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div className="min-w-0 pr-2">
                                            <p className="font-bold text-sm text-foreground truncate">
                                                {tip.clientName}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                                <span>{tip.date ? format(tip.date, 'dd/MM/yyyy HH:mm', { locale: es }) : '-'}</span>
                                                <span>•</span>
                                                <span className="truncate">{tip.localName}</span>
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-sm font-extrabold text-foreground">
                                                +${tip.tip.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground font-mono">ID: ...{tip.saleId}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 px-2.5 py-1.5 rounded-lg">
                                        <span className="text-[11px] text-slate-300 truncate">Atendió: <span className="font-medium text-foreground">{tip.professionalName}</span></span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* PAGINACIÓN */}
                    {!isLoading && filteredTips.length > 0 && (
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