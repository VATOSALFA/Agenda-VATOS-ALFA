'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
    ResponsiveContainer, 
    PieChart as RechartsPieChart, 
    Pie, 
    Cell, 
    XAxis, 
    YAxis, 
    Tooltip, 
    Legend, 
    BarChart as RechartsBarChart, 
    Bar, 
    CartesianGrid 
} from 'recharts';
import { 
    Calendar as CalendarIcon, 
    Search, 
    Clock, 
    BookOpen, 
    DollarSign, 
    BarChart, 
    PieChartIcon, 
    Loader2, 
    Filter, 
    Download 
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Reservation, Service, Profesional, Role } from '@/lib/types';
import { where } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

const reservationStatuses = [
    { id: 'Reservado', label: 'Reservado' },
    { id: 'Confirmado', label: 'Confirmado' },
    { id: 'Asiste', label: 'Asiste' },
    { id: 'No asiste', label: 'No asiste' },
    { id: 'Cancelado', label: 'Cancelado' },
    { id: 'En espera', label: 'En espera' },
    { id: 'Pendiente', label: 'Pendiente' },
];

// Paleta Oficial VATOS ALFA (Cero amarillo/ámbar, cero verde, cero morado)
const BRAND_COLORS = [
    '#202A49', // Azul Navy Institucional
    '#2563EB', // Azul Royal
    '#3B82F6', // Azul Acento Móvil
    '#60A5FA', // Azul Cielo
    '#93C5FD', // Azul Hielo
    '#C5A880', // Dorado Mate Alfa (VIP)
    '#64748B', // Gris Pizarra
    '#94A3B8', // Gris Plata
    '#475569', // Gris Carbón
    '#F87171', // Rojo Suave
];

export default function ReservationsReportPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [isMobileCalendarOpen, setIsMobileCalendarOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>('todos');
    const [professionalFilter, setProfessionalFilter] = useState<string>('todos');
    const [serviceFilter, setServiceFilter] = useState<string>('todos');

    // State for applied filters
    const [activeFilters, setActiveFilters] = useState({
        dateRange: { from: startOfMonth(new Date()), to: endOfMonth(new Date()) } as DateRange | undefined,
        status: 'todos',
        professional: 'todos',
        service: 'todos'
    });

    const { data: servicesRaw, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: professionalsRaw, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');

    const services = useMemo(() => {
        return [...servicesRaw].sort((a, b) => a.name.localeCompare(b.name));
    }, [servicesRaw]);

    const professionals = useMemo(() => {
        return professionalsRaw.filter(p => p.active !== false).sort((a, b) => a.name.localeCompare(b.name));
    }, [professionalsRaw]);

    const queryConstraints = useMemo(() => {
        const constraints = [];
        if (activeFilters.dateRange?.from) {
            constraints.push(where('fecha', '>=', format(activeFilters.dateRange.from, 'yyyy-MM-dd')));
        }
        if (activeFilters.dateRange?.to) {
            constraints.push(where('fecha', '<=', format(activeFilters.dateRange.to, 'yyyy-MM-dd')));
        }
        if (activeFilters.status !== 'todos') {
            constraints.push(where('estado', '==', activeFilters.status));
        }
        if (activeFilters.professional !== 'todos') {
            constraints.push(where('barbero_id', '==', activeFilters.professional));
        }
        if (activeFilters.service !== 'todos') {
            constraints.push(where('items', 'array-contains', { servicio: activeFilters.service }));
        }
        return constraints;
    }, [activeFilters]);

    const { data: reservations, loading: isLoading } = useFirestoreQuery<Reservation>(
        'reservas', 
        JSON.stringify(activeFilters), 
        ...queryConstraints
    );

    const { data: roles } = useFirestoreQuery<Role>('roles');
    const userRole = roles?.find(r => r.title === user?.role);
    const historyLimit = userRole?.historyRestrictionDays;

    const handleSearch = () => {
        const normalizedRange = dateRange?.from ? {
            from: dateRange.from,
            to: dateRange.to || dateRange.from
        } : undefined;
        setDateRange(normalizedRange);
        setActiveFilters({
            dateRange: normalizedRange,
            status: statusFilter,
            professional: professionalFilter,
            service: serviceFilter
        });
    };

    const { 
        totalReservations, 
        totalRevenue, 
        serviceRankingData, 
        reservationsByDayData, 
        reservationsByHourData, 
        bestDay, 
        worstDay, 
        bestHour, 
        worstHour 
    } = useMemo(() => {
        if (isLoading) return { 
            totalReservations: 0, 
            totalRevenue: 0, 
            serviceRankingData: [], 
            reservationsByDayData: [], 
            reservationsByHourData: [], 
            bestDay: null, 
            worstDay: null, 
            bestHour: null, 
            worstHour: null 
        };

        const serviceCount: Record<string, number> = {};
        const dayIndexCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        const hourCount: Record<string, number> = {};

        reservations.forEach(res => {
            if (res.items && Array.isArray(res.items)) {
                res.items.forEach(item => {
                    const serviceName = item.nombre || item.servicio || 'Desconocido';
                    serviceCount[serviceName] = (serviceCount[serviceName] || 0) + 1;
                });
            } else if (res.servicio) {
                serviceCount[res.servicio] = (serviceCount[res.servicio] || 0) + 1;
            }

            try {
                const date = parseISO(res.fecha);
                const dayIndex = date.getDay();
                dayIndexCount[dayIndex] = (dayIndexCount[dayIndex] || 0) + 1;

                if (res.hora_inicio) {
                    const startHour = res.hora_inicio.substring(0, 2) + ':00';
                    hourCount[startHour] = (hourCount[startHour] || 0) + 1;
                }
            } catch (e) {
                console.warn("Invalid date format in reservation:", res);
            }
        });

        const sortedServices = Object.entries(serviceCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const orderedIndices = [1, 2, 3, 4, 5, 6, 0];

        const sortedDays = orderedIndices.map(index => ({
            name: dayNames[index],
            value: dayIndexCount[index] || 0
        }));

        const sortedHours = Object.keys(hourCount).sort().map(hour => ({
            hour,
            reservas: hourCount[hour]
        }));

        let bestDay = null;
        let worstDay = null;
        let bestHour = null;
        let worstHour = null;

        if (sortedDays.length > 0) {
            bestDay = sortedDays.reduce((prev, current) => (prev.value > current.value) ? prev : current, sortedDays[0]);
            worstDay = sortedDays.reduce((prev, current) => (prev.value < current.value) ? prev : current, sortedDays[0]);
        }

        if (sortedHours.length > 0) {
            bestHour = sortedHours.reduce((prev, current) => (prev.reservas > current.reservas) ? prev : current, sortedHours[0]);
            worstHour = sortedHours.reduce((prev, current) => (prev.reservas < current.reservas) ? prev : current, sortedHours[0]);
        }

        return {
            totalReservations: reservations.length,
            totalRevenue: reservations.reduce((acc, r) => acc + (r.precio || r.total || 0), 0),
            serviceRankingData: sortedServices.map(([name, value]) => ({ name, value })),
            reservationsByDayData: sortedDays,
            reservationsByHourData: sortedHours,
            bestDay, 
            worstDay, 
            bestHour, 
            worstHour,
        };
    }, [reservations, isLoading]);

    const handleDownload = () => {
        if (reservations.length === 0) {
            toast({
                variant: "destructive",
                title: "No hay datos para exportar",
                description: "No hay reservas registradas en el período seleccionado.",
            });
            return;
        }

        const profMap = new Map(professionals.map(p => [p.id, p.name]));

        const reservationsData = reservations.map(r => ({
            'ID': r.id,
            'Fecha': r.fecha,
            'Hora Inicio': r.hora_inicio,
            'Hora Fin': r.hora_fin,
            'Estado': r.estado,
            'Profesional': profMap.get(r.barbero_id) || r.barbero_id || 'Sin asignar',
            'Servicios': r.items?.map(i => i.nombre || i.servicio).join(', ') || r.servicio || 'N/A',
            'Precio/Total': r.precio || r.total || 0
        }));

        const servicesData = serviceRankingData.map(s => ({
            'Servicio': s.name,
            'Cantidad': s.value
        }));

        const daysData = reservationsByDayData.map(d => ({
            'Día': d.name,
            'Reservas': d.value
        }));

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reservationsData), "Reservas");
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(servicesData), "Ranking Servicios");
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(daysData), "Por Día");

        XLSX.writeFile(workbook, `Reporte_Reservas_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

        toast({
            title: "Reporte generado",
            description: "La descarga del reporte de reservas ha comenzado.",
        });
    };

    return (
        <div className="flex-1 space-y-4 p-3 sm:p-6 md:p-8 pt-4 sm:pt-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                        Reporte de reservas
                    </h1>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 hidden sm:block">
                        Análisis estadístico de citas, afluencia y servicios más demandados.
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
                    <CardDescription className="text-xs">Filtra por periodo, estado, profesional y servicio.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col lg:flex-row lg:items-end gap-3 sm:gap-4">
                        {/* Periodo de tiempo */}
                        <div className="flex-1 min-w-[180px] space-y-1.5">
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
                                                setIsMobileCalendarOpen(false);
                                            }
                                        }}
                                        numberOfMonths={1}
                                        locale={es}
                                        disabled={historyLimit !== undefined && historyLimit !== null ? (date) => date > new Date() || date < subDays(new Date(), historyLimit) : undefined}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Estado */}
                        <div className="flex-1 min-w-[150px] space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado</label>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-full rounded-xl h-10 border-border/60 text-xs sm:text-sm">
                                    <SelectValue placeholder="Estado" />
                                </SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                    <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos los estados</SelectItem>
                                    {reservationStatuses.map(status => (
                                        <SelectItem key={status.id} value={status.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">{status.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Profesional */}
                        <div className="flex-1 min-w-[160px] space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Profesional</label>
                            <Select value={professionalFilter} onValueChange={setProfessionalFilter} disabled={professionalsLoading}>
                                <SelectTrigger className="w-full rounded-xl h-10 border-border/60 text-xs sm:text-sm">
                                    <SelectValue placeholder="Profesional" />
                                </SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1 max-h-64">
                                    <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos los profesionales</SelectItem>
                                    {professionals.map(p => (
                                        <SelectItem key={p.id} value={p.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">{p.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Servicio */}
                        <div className="flex-1 min-w-[160px] space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Servicio</label>
                            <Select value={serviceFilter} onValueChange={setServiceFilter} disabled={servicesLoading}>
                                <SelectTrigger className="w-full rounded-xl h-10 border-border/60 text-xs sm:text-sm">
                                    <SelectValue placeholder="Servicio" />
                                </SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1 max-h-64">
                                    <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos los servicios</SelectItem>
                                    {services.map(s => (
                                        <SelectItem key={s.id} value={s.name} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">{s.name}</SelectItem>
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
                                            setIsCalendarOpen(false);
                                            setIsMobileCalendarOpen(false);
                                        }
                                    }}
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

                    {/* Fila 2: Estado y Profesional */}
                    <div className="grid grid-cols-2 gap-1.5">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="rounded-xl h-9 text-xs border-border/60">
                                <SelectValue placeholder="Estado" />
                            </SelectTrigger>
                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos</SelectItem>
                                {reservationStatuses.map(status => (
                                    <SelectItem key={status.id} value={status.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">{status.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={professionalFilter} onValueChange={setProfessionalFilter} disabled={professionalsLoading}>
                            <SelectTrigger className="rounded-xl h-9 text-xs border-border/60">
                                <SelectValue placeholder="Profesional" />
                            </SelectTrigger>
                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1 max-h-64">
                                <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos</SelectItem>
                                {professionals.map(p => (
                                    <SelectItem key={p.id} value={p.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Fila 3: Servicio */}
                    <Select value={serviceFilter} onValueChange={setServiceFilter} disabled={servicesLoading}>
                        <SelectTrigger className="rounded-xl h-9 text-xs border-border/60">
                            <SelectValue placeholder="Servicio" />
                        </SelectTrigger>
                        <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1 max-h-64">
                            <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos los servicios</SelectItem>
                            {services.map(s => (
                                <SelectItem key={s.id} value={s.name} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">{s.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {/* TARJETAS DE MÉTRICAS ESCRITORIO (hidden sm:grid) */}
            <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Cantidad de reservas */}
                <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3.5 sm:p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Cantidad de reservas</span>
                        <BookOpen className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="mt-1.5">
                        <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : totalReservations}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            Citas registradas en el periodo
                        </p>
                    </div>
                </Card>

                {/* Recaudación */}
                <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3.5 sm:p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Recaudación</span>
                        <DollarSign className="h-4 w-4 text-[#C5A880]" />
                    </div>
                    <div className="mt-1.5">
                        <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : `$${totalRevenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            Monto total de servicios
                        </p>
                    </div>
                </Card>

                {/* Desempeño por Día */}
                <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3.5 sm:p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Desempeño por Día</span>
                        <CalendarIcon className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="mt-1.5">
                        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                            <div className="space-y-0.5 text-xs">
                                <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground text-[11px]">Mejor:</span>
                                    <span className="font-bold text-blue-400">{bestDay?.name} ({bestDay?.value})</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground text-[11px]">Menor:</span>
                                    <span className="font-medium text-muted-foreground">{worstDay?.name} ({worstDay?.value})</span>
                                </div>
                            </div>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            Afluencia semanal
                        </p>
                    </div>
                </Card>

                {/* Desempeño por Hora */}
                <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3.5 sm:p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Desempeño por Hora</span>
                        <Clock className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="mt-1.5">
                        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                            <div className="space-y-0.5 text-xs">
                                <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground text-[11px]">Mejor:</span>
                                    <span className="font-bold text-blue-400">{bestHour?.hour || '-'} ({bestHour?.reservas || 0})</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground text-[11px]">Menor:</span>
                                    <span className="font-medium text-muted-foreground">{worstHour?.hour || '-'} ({worstHour?.reservas || 0})</span>
                                </div>
                            </div>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            Horarios más solicitados
                        </p>
                    </div>
                </Card>
            </div>

            {/* TARJETA MÉTRICAS MÓVIL COMPACTA (sm:hidden) */}
            <Card className="sm:hidden rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3 space-y-2">
                <div className="flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                            <BookOpen className="h-4 w-4 text-slate-400 shrink-0" />
                            <span className="text-xs font-semibold text-foreground">Total reservas</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            Recaudación: ${totalRevenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </div>
                    <div className="text-lg font-bold tracking-tight text-foreground shrink-0">
                        {totalReservations}
                    </div>
                </div>
                {bestDay && (
                    <div className="text-[11px] text-muted-foreground bg-muted/30 px-2 py-1 rounded-lg flex items-center justify-between">
                        <span>Día pico: <strong className="text-foreground">{bestDay.name}</strong></span>
                        <span className="text-blue-400 font-bold shrink-0">{bestDay.value} citas</span>
                    </div>
                )}
            </Card>

            {/* GRÁFICOS */}
            <div className="grid gap-4 md:grid-cols-2">
                {/* Ranking servicios utilizados */}
                <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm">
                    <CardHeader className="p-3.5 sm:p-5 border-b border-border/40 pb-3">
                        <CardTitle className="text-sm sm:text-base font-semibold flex items-center">
                            <PieChartIcon className="mr-2 h-4 w-4 text-slate-400" />
                            Ranking servicios utilizados
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3.5 sm:p-5 pt-4">
                        {isLoading ? (
                            <div className="flex justify-center items-center h-[250px]"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                        ) : (
                            <ResponsiveContainer width="100%" height={250}>
                                <RechartsBarChart layout="vertical" data={serviceRankingData} margin={{ top: 5, right: 25, left: 10, bottom: 5 }}>
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11, fill: '#94A3B8' }} />
                                    <Tooltip 
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }} 
                                        contentStyle={{ backgroundColor: '#151b2e', borderColor: '#3B82F6', borderRadius: '12px', color: '#FFFFFF', boxShadow: '0 10px 30px rgba(59,130,246,0.18)' }} 
                                        itemStyle={{ color: '#FFFFFF', fontSize: '12px' }}
                                    />
                                    <Bar dataKey="value" name="Reservas" radius={[0, 4, 4, 0]}>
                                        {serviceRankingData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={BRAND_COLORS[index % BRAND_COLORS.length]} />
                                        ))}
                                    </Bar>
                                </RechartsBarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                {/* Reservas por día de la semana */}
                <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm">
                    <CardHeader className="p-3.5 sm:p-5 border-b border-border/40 pb-3">
                        <CardTitle className="text-sm sm:text-base font-semibold flex items-center">
                            <BarChart className="mr-2 h-4 w-4 text-slate-400" />
                            Reservas por día de la semana
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3.5 sm:p-5 pt-4">
                        {isLoading ? (
                            <div className="flex justify-center items-center h-[250px]"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                        ) : (
                            <ResponsiveContainer width="100%" height={250}>
                                <RechartsPieChart>
                                    <Pie data={reservationsByDayData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={78} labelLine={false} label={({ name, percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}>
                                        {reservationsByDayData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={BRAND_COLORS[index % BRAND_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#151b2e', borderColor: '#3B82F6', borderRadius: '12px', color: '#FFFFFF', boxShadow: '0 10px 30px rgba(59,130,246,0.18)' }} 
                                        itemStyle={{ color: '#FFFFFF', fontSize: '12px' }}
                                    />
                                    <Legend iconSize={8} wrapperStyle={{ fontSize: "11px", color: '#94A3B8' }} />
                                </RechartsPieChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {/* Días más concurridos */}
                <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm">
                    <CardHeader className="p-3.5 sm:p-5 border-b border-border/40 pb-3">
                        <CardTitle className="text-sm sm:text-base font-semibold flex items-center">
                            <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                            Días más concurridos (Total)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3.5 sm:p-5 pt-4">
                        {isLoading ? (
                            <div className="flex justify-center items-center h-[280px]"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
                                <RechartsBarChart data={reservationsByDayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.08)" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#151b2e', borderColor: '#3B82F6', borderRadius: '12px', color: '#FFFFFF', boxShadow: '0 10px 30px rgba(59,130,246,0.18)' }} 
                                        itemStyle={{ color: '#FFFFFF', fontSize: '12px' }}
                                    />
                                    <Bar dataKey="value" name="Cantidad de reservas" fill="#2563EB" radius={[4, 4, 0, 0]} />
                                </RechartsBarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                {/* Horarios más concurridos */}
                <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm">
                    <CardHeader className="p-3.5 sm:p-5 border-b border-border/40 pb-3">
                        <CardTitle className="text-sm sm:text-base font-semibold flex items-center">
                            <Clock className="mr-2 h-4 w-4 text-slate-400" />
                            Horarios más concurridos (Total)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3.5 sm:p-5 pt-4">
                        {isLoading ? (
                            <div className="flex justify-center items-center h-[280px]"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
                                <RechartsBarChart data={reservationsByHourData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.08)" />
                                    <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#151b2e', borderColor: '#3B82F6', borderRadius: '12px', color: '#FFFFFF', boxShadow: '0 10px 30px rgba(59,130,246,0.18)' }} 
                                        itemStyle={{ color: '#FFFFFF', fontSize: '12px' }}
                                    />
                                    <Bar dataKey="reservas" name="Cantidad de reservas" fill="#202A49" radius={[4, 4, 0, 0]} />
                                </RechartsBarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
