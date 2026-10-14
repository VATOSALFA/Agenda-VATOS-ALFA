'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { DateRange } from 'react-day-picker';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
    Calendar as CalendarIcon, 
    Search, 
    Download, 
    Eye, 
    Loader2, 
    ArrowUpDown, 
    ArrowUp, 
    ArrowDown, 
    ChevronLeft, 
    ChevronRight,
    Receipt,
    X,
    Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CashClosing, User as AppUser, Role } from '@/lib/types';
import { useAuth } from '@/contexts/firebase-auth-context';
import { where, Timestamp, QueryConstraint } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';

const denominations = [
    { value: 1000, label: '$1,000.00' },
    { value: 500, label: '$500.00' },
    { value: 200, label: '$200.00' },
    { value: 100, label: '$100.00' },
    { value: 50, label: '$50.00' },
    { value: 20, label: '$20.00' },
    { value: 10, label: '$10.00' },
    { value: 5, label: '$5.00' },
    { value: 2, label: '$2.00' },
    { value: 1, label: '$1.00' },
    { value: 0.5, label: '$0.50' },
];

const ClosingDetailModal = ({ closing, isOpen, onOpenChange }: { closing: CashClosing | null, isOpen: boolean, onOpenChange: (open: boolean) => void }) => {
    if (!closing) return null;

    const getCount = (val: number) => {
        if (!closing.detalle_conteo) return 0;
        return closing.detalle_conteo[val] || closing.detalle_conteo[String(val)] || 0;
    };

    const totalEntregadoneto = (closing.total_calculado || 0) - (closing.fondo_base || 0);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent 
                hideCloseButton={true}
                className="sm:max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card"
            >
                {/* Cabecera Oficial Vatos Alfa */}
                <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 border-b border-slate-800 shrink-0">
                    <div className="header-light-beam" />
                    <div className="relative z-10 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Receipt className="h-5 w-5 text-slate-300 shrink-0" />
                            <div>
                                <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-tight">
                                    Detalle del Cierre de Caja #{closing.id.slice(0, 6)}
                                </DialogTitle>
                                <DialogDescription className="text-xs text-slate-300 mt-0.5">
                                    Realizado el {format(closing.fecha_corte.toDate(), "dd 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
                                </DialogDescription>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => onOpenChange(false)}
                            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg"
                            title="Cerrar modal"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto p-4 sm:p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Columna Izquierda: Calculadora de Efectivo */}
                        <div className="space-y-3 flex flex-col">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Calculadora de Efectivo</h4>
                            <div className="h-[320px] border border-border/60 rounded-xl overflow-hidden flex flex-col bg-muted/10">
                                <ScrollArea className="h-full">
                                    <div className="p-3 sm:p-4 space-y-2.5">
                                        {denominations.map(d => {
                                            const count = getCount(d.value);
                                            return (
                                                <div key={d.value} className="grid grid-cols-3 gap-2 items-center text-xs">
                                                    <Label className="text-right text-xs font-medium text-muted-foreground">{d.label}</Label>
                                                    <Input
                                                        readOnly
                                                        value={count}
                                                        className="h-8 text-center bg-card border-border/60 text-xs rounded-lg font-semibold"
                                                    />
                                                    <p className="font-semibold text-xs text-center text-foreground">
                                                        = ${(d.value * count).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>

                        {/* Columna Derecha: Detalles del Corte */}
                        <div className="space-y-3.5">
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Fondo base en caja</Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                                    <Input readOnly value={(closing.fondo_base || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} className="pl-6 bg-muted/20 border-border/60 text-xs rounded-lg" />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Total contado</Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                                    <Input readOnly value={(closing.total_calculado || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} className="pl-6 font-bold bg-muted/20 border-border/60 text-xs rounded-lg" />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Efectivo en caja (Sistema)</Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                                    <Input readOnly value={(closing.total_sistema || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} className="pl-6 bg-muted/20 border-border/60 text-xs rounded-lg" />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Nombre de quien recibe</Label>
                                <Input readOnly value={closing.persona_recibe || 'N/A'} className="bg-muted/20 border-border/60 text-xs rounded-lg" />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Comentarios</Label>
                                <Input readOnly value={closing.comentarios || 'Sin comentarios'} className="bg-muted/20 border-border/60 text-xs rounded-lg" />
                            </div>

                            {/* Tarjeta de Total Entregado */}
                            <div className="pt-2">
                                <div className="p-4 rounded-xl bg-gradient-to-br from-[#18223c] to-[#0d1424] border border-blue-500/30 text-center shadow-lg">
                                    <p className="text-xs font-semibold text-slate-300 uppercase tracking-widest">Total entregado</p>
                                    <p className={cn("text-3xl sm:text-4xl font-extrabold mt-1 tracking-tight", totalEntregadoneto < 0 ? "text-red-400" : "text-white")}>
                                        ${totalEntregadoneto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="border-t border-border/40 p-4 bg-muted/10 flex justify-end shrink-0">
                    <Button variant="outline" className="rounded-xl px-4 text-xs font-semibold" onClick={() => onOpenChange(false)}>
                        Cerrar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};


export default function CashClosingsPage() {
    const { toast } = useToast();
    const { user } = useAuth();
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: new Date(),
        to: new Date(),
    });
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [isMobileCalendarOpen, setIsMobileCalendarOpen] = useState(false);
    const [deliveredByFilter, setDeliveredByFilter] = useState('todos');
    const [receivedByFilter, setReceivedByFilter] = useState('todos');

    const [activeFilters, setActiveFilters] = useState({
        dateRange: { from: new Date(), to: new Date() } as DateRange | undefined,
        deliveredBy: 'todos',
        receivedBy: 'todos'
    });

    const [selectedClosing, setSelectedClosing] = useState<CashClosing | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const { data: usersRaw, loading: usersLoading } = useFirestoreQuery<AppUser>('usuarios');
    const { data: roles } = useFirestoreQuery<Role>('roles');
    const userRole = roles?.find(r => r.title === user?.role);
    const historyLimit = userRole?.historyRestrictionDays;

    const users = useMemo(() => {
        return [...(usersRaw || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [usersRaw]);

    const queryConstraints = useMemo(() => {
        const constraints: QueryConstraint[] = [];
        if (activeFilters.dateRange?.from) {
            constraints.push(where('fecha_corte', '>=', Timestamp.fromDate(startOfDay(activeFilters.dateRange.from))));
        }
        if (activeFilters.dateRange?.to) {
            constraints.push(where('fecha_corte', '<=', Timestamp.fromDate(endOfDay(activeFilters.dateRange.to))));
        }
        if (activeFilters.deliveredBy !== 'todos') {
            constraints.push(where('persona_entrega_id', '==', activeFilters.deliveredBy));
        }
        if (activeFilters.receivedBy !== 'todos') {
            constraints.push(where('persona_recibe', '==', activeFilters.receivedBy));
        }
        return constraints;
    }, [activeFilters]);

    const { data: closings, loading: closingsLoading } = useFirestoreQuery<CashClosing>('cortes_caja', JSON.stringify(activeFilters), ...queryConstraints);

    const handleSearch = () => {
        const normalizedRange = dateRange?.from ? {
            from: dateRange.from,
            to: dateRange.to || dateRange.from
        } : undefined;
        setDateRange(normalizedRange);
        setActiveFilters({
            dateRange: normalizedRange,
            deliveredBy: deliveredByFilter,
            receivedBy: receivedByFilter
        });
    };

    const sortedClosings = useMemo(() => {
        let sortableItems = [...(closings || [])];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                let aValue: any;
                let bValue: any;

                switch (sortConfig.key) {
                    case 'fecha':
                        aValue = a.fecha_corte?.seconds || 0;
                        bValue = b.fecha_corte?.seconds || 0;
                        break;
                    case 'entrega':
                        aValue = (a.persona_entrega_nombre || '').toLowerCase();
                        bValue = (b.persona_entrega_nombre || '').toLowerCase();
                        break;
                    case 'recibe':
                        aValue = (a.persona_recibe || '').toLowerCase();
                        bValue = (b.persona_recibe || '').toLowerCase();
                        break;
                    case 'total_sistema':
                        aValue = a.total_sistema || 0;
                        bValue = b.total_sistema || 0;
                        break;
                    case 'total_contado':
                        aValue = a.total_calculado || 0;
                        bValue = b.total_calculado || 0;
                        break;
                    case 'total_entregado':
                        aValue = (a.total_calculado || 0) - (a.fondo_base || 0);
                        bValue = (b.total_calculado || 0) - (b.fondo_base || 0);
                        break;
                    default:
                        return 0;
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        } else {
            sortableItems.sort((a, b) => (b.fecha_corte?.seconds || 0) - (a.fecha_corte?.seconds || 0));
        }
        return sortableItems;
    }, [closings, sortConfig]);

    useEffect(() => {
        setCurrentPage(1);
    }, [activeFilters]);

    const totalPages = Math.ceil(sortedClosings.length / itemsPerPage) || 1;
    const paginatedClosings = sortedClosings.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const SortIcon = ({ field }: { field: string }) => {
        if (!sortConfig || sortConfig.key !== field) {
            return <ArrowUpDown className="ml-1 h-3 w-3 text-slate-500 opacity-60 group-hover:opacity-100" />;
        }
        if (sortConfig.direction === 'asc') {
            return <ArrowUp className="ml-1 h-3 w-3 text-blue-400" />;
        }
        return <ArrowDown className="ml-1 h-3 w-3 text-blue-400" />;
    };

    const handleDownload = () => {
        if (!sortedClosings || sortedClosings.length === 0) {
            toast({
                title: "No hay datos para exportar",
                description: "No hay cierres de caja en el período seleccionado.",
                variant: 'destructive',
            });
            return;
        }

        const dataForExcel = sortedClosings.map((closing: CashClosing) => {
            const totalEntregado = (closing.total_calculado || 0) - (closing.fondo_base || 0);
            const diferencia = totalEntregado - (closing.total_sistema || 0);
            const dateObj = closing.fecha_corte?.toDate ? closing.fecha_corte.toDate() : new Date();

            return {
                'ID Corte': closing.id,
                'Fecha': format(dateObj, 'yyyy-MM-dd'),
                'Hora': format(dateObj, 'HH:mm'),
                'Entrega': closing.persona_entrega_nombre || 'N/A',
                'Recibe': closing.persona_recibe || 'N/A',
                'Fondo Base': closing.fondo_base || 0,
                'Total Contado': closing.total_calculado || 0,
                'Total Sistema': closing.total_sistema || 0,
                'Total Entregado': totalEntregado,
                'Diferencia': diferencia,
                'Comentarios': closing.comentarios || 'N/A'
            };
        });

        const totalEntregadoSum = sortedClosings.reduce((acc, c) => acc + ((c.total_calculado || 0) - (c.fondo_base || 0)), 0);
        const totalSistemaSum = sortedClosings.reduce((acc, c) => acc + (c.total_sistema || 0), 0);
        const totalContadoSum = sortedClosings.reduce((acc, c) => acc + (c.total_calculado || 0), 0);
        const totalFondoBaseSum = sortedClosings.reduce((acc, c) => acc + (c.fondo_base || 0), 0);

        const summaryData = [
            { 'Concepto': 'Cortes Registrados', 'Valor': sortedClosings.length },
            { 'Concepto': 'Total Entregado Acumulado', 'Valor': `$${totalEntregadoSum.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
            { 'Concepto': 'Total Sistema Acumulado', 'Valor': `$${totalSistemaSum.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
            { 'Concepto': 'Total Contado Acumulado', 'Valor': `$${totalContadoSum.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
            { 'Concepto': 'Fondo Base Promedio', 'Valor': `$${(totalFondoBaseSum / (sortedClosings.length || 1)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
            { 'Concepto': 'Diferencia Neta Acumulada', 'Valor': `$${(totalEntregadoSum - totalSistemaSum).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dataForExcel), "Cierres de Caja");
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryData), "Resumen");

        XLSX.writeFile(workbook, `Reporte_Cierres_Caja_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

        toast({
            title: "Descarga iniciada",
            description: "Tu archivo de Excel se está descargando.",
        });
    };

    const isLoading = usersLoading || closingsLoading;

    return (
        <div className="flex-1 space-y-4 p-3 sm:p-6 md:p-8 pt-4 sm:pt-6">
            {/* Header Oficial con Bare Icon de Descarga */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                        Reporte de cierres de caja
                    </h1>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 hidden sm:block">
                        Historial y auditoría de cortes de caja, efectivo entregado y diferencias.
                    </p>
                </div>
                <button 
                    type="button"
                    className="text-slate-400 hover:text-white transition-colors p-1" 
                    onClick={handleDownload}
                    title="Descargar reporte en Excel"
                >
                    <Download className="h-4 w-4" />
                </button>
            </div>

            {/* FILTROS ESCRITORIO (hidden sm:block) */}
            <Card className="hidden sm:block rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/40">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Filter className="h-4 w-4 text-slate-400" /> Filtros de búsqueda
                    </CardTitle>
                    <CardDescription className="text-xs">Busca cierres de caja por fecha o por personas involucradas.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col lg:flex-row lg:items-end gap-3 sm:gap-4">
                        {/* Periodo de tiempo */}
                        <div className="flex-1 min-w-[200px] space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Periodo de tiempo</label>
                            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
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
                                        disabled={historyLimit !== undefined && historyLimit !== null ? (date) => date > new Date() || date < subDays(new Date(), historyLimit) : undefined}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Entregado por */}
                        <div className="flex-1 min-w-[180px] space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Entregado por</label>
                            <Select value={deliveredByFilter} onValueChange={setDeliveredByFilter} disabled={usersLoading}>
                                <SelectTrigger className="w-full rounded-xl h-10 border-border/60 text-xs sm:text-sm">
                                    <SelectValue placeholder="Entregado por..." />
                                </SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1 max-h-64">
                                    <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos</SelectItem>
                                    {users.map(u => (
                                        <SelectItem key={u.id} value={u.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">{u.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Recibido por */}
                        <div className="flex-1 min-w-[180px] space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recibido por</label>
                            <Select value={receivedByFilter} onValueChange={setReceivedByFilter} disabled={usersLoading}>
                                <SelectTrigger className="w-full rounded-xl h-10 border-border/60 text-xs sm:text-sm">
                                    <SelectValue placeholder="Recibido por..." />
                                </SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1 max-h-64">
                                    <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos</SelectItem>
                                    {users.map(u => (
                                        <SelectItem key={u.id} value={u.name} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">{u.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Botón Buscar Vatos Alfa */}
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
                        <Popover open={isMobileCalendarOpen} onOpenChange={setIsMobileCalendarOpen}>
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
                                            setIsMobileCalendarOpen(false);
                                        }
                                    }}
                                    numberOfMonths={1}
                                    locale={es}
                                    disabled={historyLimit !== undefined && historyLimit !== null ? (date) => date > new Date() || date < subDays(new Date(), historyLimit) : undefined}
                                />
                            </PopoverContent>
                        </Popover>

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

                    <div className="grid grid-cols-2 gap-1.5">
                        <Select value={deliveredByFilter} onValueChange={setDeliveredByFilter} disabled={usersLoading}>
                            <SelectTrigger className="rounded-xl h-9 text-xs border-border/60">
                                <SelectValue placeholder="Entrega" />
                            </SelectTrigger>
                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1 max-h-64">
                                <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos</SelectItem>
                                {users.map(u => (
                                    <SelectItem key={u.id} value={u.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">{u.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={receivedByFilter} onValueChange={setReceivedByFilter} disabled={usersLoading}>
                            <SelectTrigger className="rounded-xl h-9 text-xs border-border/60">
                                <SelectValue placeholder="Recibe" />
                            </SelectTrigger>
                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1 max-h-64">
                                <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos</SelectItem>
                                {users.map(u => (
                                    <SelectItem key={u.id} value={u.name} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">{u.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Tabla Historial de Cierres (Estándar Compacto Alta Densidad) */}
            <Card className="rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/40">
                    <CardTitle className="text-base font-semibold">Historial de cierres</CardTitle>
                    <CardDescription className="text-xs">Registro detallado de los cortes de caja realizados en el sistema.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {/* Tabla Desktop (hidden sm:block) */}
                    <div className="hidden sm:block overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                    <TableHead className="py-1 px-3 text-xs font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('fecha')}>
                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Fecha
                                            <SortIcon field="fecha" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('entrega')}>
                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Entrega
                                            <SortIcon field="entrega" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('recibe')}>
                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Recibe
                                            <SortIcon field="recibe" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors group text-right" onClick={() => requestSort('total_sistema')}>
                                        <div className="flex items-center justify-end gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Total sistema
                                            <SortIcon field="total_sistema" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors group text-right" onClick={() => requestSort('total_contado')}>
                                        <div className="flex items-center justify-end gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Total contado
                                            <SortIcon field="total_contado" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors group text-right" onClick={() => requestSort('total_entregado')}>
                                        <div className="flex items-center justify-end gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Total entregado
                                            <SortIcon field="total_entregado" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold text-right w-12">
                                        <span className="sr-only">Acciones</span>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i} className="h-9 border-b border-border/40">
                                            <TableCell colSpan={7} className="py-1.5 px-3"><Skeleton className="h-5 w-full" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : sortedClosings.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center h-20 text-xs text-muted-foreground">
                                            No se encontraron cierres de caja en el período seleccionado.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedClosings.map(closing => {
                                        const totalEntregado = (closing.total_calculado || 0) - (closing.fondo_base || 0);
                                        return (
                                            <TableRow key={closing.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                                <TableCell className="py-1.5 px-3 text-xs font-medium text-foreground">
                                                    {format(closing.fecha_corte.toDate(), 'dd/MM/yyyy HH:mm')}
                                                </TableCell>
                                                <TableCell className="py-1.5 px-3 text-xs text-foreground">
                                                    {closing.persona_entrega_nombre || 'N/A'}
                                                </TableCell>
                                                <TableCell className="py-1.5 px-3 text-xs text-foreground">
                                                    {closing.persona_recibe || 'N/A'}
                                                </TableCell>
                                                <TableCell className="py-1.5 px-3 text-xs text-right text-muted-foreground">
                                                    ${(closing.total_sistema || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </TableCell>
                                                <TableCell className="py-1.5 px-3 text-xs text-right text-foreground">
                                                    ${(closing.total_calculado || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </TableCell>
                                                <TableCell className={cn("py-1.5 px-3 text-xs text-right font-semibold", totalEntregado < 0 ? "text-red-400" : "text-foreground")}>
                                                    ${totalEntregado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </TableCell>
                                                <TableCell className="py-1.5 px-3 text-xs text-right">
                                                    <button 
                                                        type="button" 
                                                        onClick={() => setSelectedClosing(closing)} 
                                                        className="text-slate-400 hover:text-white transition-colors p-1"
                                                        title="Ver detalle del cierre"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Vista Móvil Compacta (sm:hidden) */}
                    <div className="sm:hidden space-y-2.5 p-3">
                        {isLoading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="p-3 rounded-xl border border-border/60 bg-card/60 space-y-2">
                                    <Skeleton className="h-4 w-1/2" />
                                    <Skeleton className="h-4 w-full" />
                                </div>
                            ))
                        ) : sortedClosings.length === 0 ? (
                            <div className="text-center py-6 text-xs text-muted-foreground">
                                No se encontraron cierres de caja en el período seleccionado.
                            </div>
                        ) : (
                            paginatedClosings.map(closing => {
                                const totalEntregado = (closing.total_calculado || 0) - (closing.fondo_base || 0);
                                return (
                                    <div key={closing.id} className="p-3 rounded-xl border border-border/60 bg-card/60 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                                                <CalendarIcon className="h-3.5 w-3.5 text-slate-400" />
                                                {format(closing.fecha_corte.toDate(), 'dd/MM/yyyy HH:mm')}
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={() => setSelectedClosing(closing)} 
                                                className="text-slate-400 hover:text-white transition-colors p-1"
                                                title="Ver detalle del cierre"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/40">
                                            <div>
                                                <span className="text-muted-foreground block text-[11px]">Entrega:</span>
                                                <span className="font-medium text-foreground">{closing.persona_entrega_nombre || 'N/A'}</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground block text-[11px]">Recibe:</span>
                                                <span className="font-medium text-foreground">{closing.persona_recibe || 'N/A'}</span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-border/40">
                                            <div>
                                                <span className="text-muted-foreground block text-[11px]">Sistema:</span>
                                                <span className="font-medium text-foreground">${(closing.total_sistema || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground block text-[11px]">Contado:</span>
                                                <span className="font-medium text-foreground">${(closing.total_calculado || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground block text-[11px]">Entregado:</span>
                                                <span className={cn("font-bold", totalEntregado < 0 ? "text-red-400" : "text-foreground")}>
                                                    ${totalEntregado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Paginación */}
            {!isLoading && sortedClosings.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
                    <div className="flex items-center space-x-2">
                        <span className="text-xs font-medium">Resultados por página</span>
                        <Select
                            value={`${itemsPerPage}`}
                            onValueChange={(value) => {
                                setItemsPerPage(Number(value));
                                setCurrentPage(1);
                            }}
                        >
                            <SelectTrigger className="h-8 w-[70px] rounded-xl border-border/60 text-xs">
                                <SelectValue placeholder={itemsPerPage} />
                            </SelectTrigger>
                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                <SelectItem value="10" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">10</SelectItem>
                                <SelectItem value="20" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">20</SelectItem>
                                <SelectItem value="50" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">50</SelectItem>
                                <SelectItem value="100" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">100</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center space-x-4">
                        <span className="text-xs font-medium text-foreground">
                            Página {currentPage} de {totalPages}
                        </span>
                        <div className="flex items-center space-x-1.5">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 rounded-xl border-border/60 text-xs"
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Anterior
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 rounded-xl border-border/60 text-xs"
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                            >
                                Siguiente <ChevronRight className="h-3.5 w-3.5 ml-1" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <ClosingDetailModal
                isOpen={!!selectedClosing}
                onOpenChange={() => setSelectedClosing(null)}
                closing={selectedClosing}
            />
        </div>
    );
}
