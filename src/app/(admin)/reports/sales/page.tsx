'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, BarChart, XAxis, YAxis, Tooltip, Bar, LineChart, Line, Legend, CartesianGrid, Cell } from 'recharts';
import { ArrowUp, ArrowDown, Search, Download, Filter } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon, Loader2, Clock, TrendingUp, ArrowUpDown } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { format, subDays, startOfMonth, endOfMonth, parseISO, getDay, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { where, Timestamp } from 'firebase/firestore';
import type { Sale, Service, ServiceCategory, SaleItem, Role, Profesional, Client } from '@/lib/types';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

const CHART_COLORS = ['#202A49', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#C5A880', '#64748B', '#94A3B8'];

const tooltipContentStyle = {
    backgroundColor: '#151b2e',
    borderColor: '#3B82F6',
    borderWidth: 2,
    borderRadius: '12px',
    color: '#FFFFFF',
    boxShadow: '0 10px 30px rgba(59,130,246,0.18)',
    fontSize: '12px'
};

const KpiCard = ({ title, value, change, isPositive, prefix = '', suffix = '' }: { title: string, value: string, change?: string, isPositive?: boolean, prefix?: string, suffix?: string }) => (
    <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{prefix}{value}{suffix}</p>
        {change && (
            <p className={cn("text-xs flex items-center font-medium", isPositive ? 'text-blue-400' : 'text-red-400')}>
                {isPositive ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
                {change}
            </p>
        )}
    </div>
);

const CustomBarLabel = (props: any) => {
    const { x, y, width, value } = props;
    if (value === undefined || value === null) return null;
    return (
        <text x={x + width + 8} y={y + 12} fill="hsl(var(--foreground))" textAnchor="start" fontSize={11} fontWeight={500}>
            {`$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </text>
    );
};

const formatDayPlural = (dayName: string, count: number) => {
    const lower = dayName.toLowerCase();
    if (count === 1) return lower;
    if (lower === 'sábado') return 'sábados';
    if (lower === 'domingo') return 'domingos';
    return lower;
};

export default function SalesReportPage() {
    const { toast } = useToast();
    const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: subDays(new Date(), 28), to: new Date() });
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [professionalFilter, setProfessionalFilter] = useState('todos');
    const [serviceFilter, setServiceFilter] = useState('todos');
    const [daySortOrder, setDaySortOrder] = useState<'chronological' | 'desc' | 'asc'>('chronological');

    const [activeFilters, setActiveFilters] = useState({
        professional: 'todos',
        service: 'todos',
        dateRange: { from: subDays(new Date(), 28), to: new Date() } as DateRange | undefined
    });

    const salesQueryConstraints = useMemo(() => {
        const constraints = [];
        if (activeFilters.dateRange?.from) {
            constraints.push(where('fecha_hora_venta', '>=', Timestamp.fromDate(activeFilters.dateRange.from)));
        }
        if (activeFilters.dateRange?.to) {
            // Include entire end day
            const end = new Date(activeFilters.dateRange.to);
            end.setHours(23, 59, 59, 999);
            constraints.push(where('fecha_hora_venta', '<=', Timestamp.fromDate(end)));
        }
        return constraints;
    }, [activeFilters.dateRange]);

    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', JSON.stringify(activeFilters.dateRange), ...salesQueryConstraints);
    const { data: servicesRaw, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: categories, loading: categoriesLoading } = useFirestoreQuery<ServiceCategory>('categorias_servicios');
    const { data: professionalsRaw, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
    const { data: clients } = useFirestoreQuery<Client>('clientes');

    const services = useMemo(() => {
        return [...(servicesRaw || [])].sort((a, b) => a.name.localeCompare(b.name));
    }, [servicesRaw]);

    const professionals = useMemo(() => {
        return (professionalsRaw || []).filter(p => p.active !== false).sort((a, b) => a.name.localeCompare(b.name));
    }, [professionalsRaw]);

    const isLoading = salesLoading || servicesLoading || categoriesLoading || professionalsLoading;

    const handleSearch = () => {
        setActiveFilters({
            professional: professionalFilter,
            service: serviceFilter,
            dateRange: dateRange
        });
    };

    const categoryMap = useMemo(() => {
        if (categoriesLoading || !categories) return new Map();
        return new Map(categories.map(c => [c.id, c.name]));
    }, [categories, categoriesLoading]);

    const aggregatedData = useMemo(() => {
        if (isLoading) return {
            totalSales: 0,
            salesCount: 0,
            averageSale: 0,
            salesOverTime: [],
            salesByCategory: [],
            salesByService: [],
            bestDay: null as { name: string, value: number } | null,
            worstDay: null as { name: string, value: number } | null,
            bestHour: null as { hour: string, value: number } | null,
            worstHour: null as { hour: string, value: number } | null,
            averageSalesByDay: [] as Array<{
                dayIndex: number;
                name: string;
                total: number;
                occurrences: number;
                activeDays: number;
                salesCount: number;
                average: number;
                percentage: number;
                isBest: boolean;
                isWorst: boolean;
            }>,
            maxAvgDay: 0,
        };

        const filteredSales = (sales || []).filter(sale => {
            if (activeFilters.professional === 'todos' && activeFilters.service === 'todos') return true;
            if (!sale.items || !Array.isArray(sale.items)) return false;

            const matchesProf = activeFilters.professional === 'todos' || sale.items.some(i => i.barbero_id === activeFilters.professional);
            const matchesService = activeFilters.service === 'todos' || sale.items.some(i => i.id === activeFilters.service || i.servicio === activeFilters.service || i.servicio === services.find(s => s.id === activeFilters.service)?.name);

            return matchesProf && matchesService;
        });

        const totalSales = filteredSales.reduce((sum, sale) => {
            const amount = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                ? sale.monto_pagado_real
                : (sale.total || 0);
            return sum + amount;
        }, 0);
        const salesCount = filteredSales.length;
        const averageSale = salesCount > 0 ? totalSales / salesCount : 0;

        // 1. Calcular cuántas veces ocurre cada día de la semana en el rango seleccionado
        const dayOccurrences: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        if (activeFilters.dateRange?.from) {
            const start = new Date(activeFilters.dateRange.from);
            start.setHours(0, 0, 0, 0);
            const end = activeFilters.dateRange.to ? new Date(activeFilters.dateRange.to) : new Date(start);
            end.setHours(0, 0, 0, 0);

            try {
                if (start <= end) {
                    const intervalDays = eachDayOfInterval({ start, end });
                    intervalDays.forEach(d => {
                        const dayOfWeek = getDay(d);
                        dayOccurrences[dayOfWeek] = (dayOccurrences[dayOfWeek] || 0) + 1;
                    });
                } else {
                    const intervalDays = eachDayOfInterval({ start: end, end: start });
                    intervalDays.forEach(d => {
                        const dayOfWeek = getDay(d);
                        dayOccurrences[dayOfWeek] = (dayOccurrences[dayOfWeek] || 0) + 1;
                    });
                }
            } catch (err) {
                console.warn('Error calculando intervalo de fechas:', err);
            }
        }

        const salesByDate: Record<string, number> = {};
        const dayIndexCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        const daySalesCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        const dayDatesWithSales: Record<number, Set<string>> = {
            0: new Set(), 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set()
        };
        const hourCount: Record<string, number> = {};

        filteredSales.forEach(sale => {
            const dateObj = sale.fecha_hora_venta?.toDate ? sale.fecha_hora_venta.toDate() : new Date();
            const date = format(dateObj, 'yyyy-MM-dd');
            const amount = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                ? sale.monto_pagado_real
                : (sale.total || 0);
            salesByDate[date] = (salesByDate[date] || 0) + amount;

            const dayIndex = getDay(dateObj);
            dayIndexCount[dayIndex] = (dayIndexCount[dayIndex] || 0) + amount;
            daySalesCount[dayIndex] = (daySalesCount[dayIndex] || 0) + 1;
            dayDatesWithSales[dayIndex].add(date);

            const hourStr = format(dateObj, 'HH:00');
            hourCount[hourStr] = (hourCount[hourStr] || 0) + amount;
        });

        const salesOverTime = Object.entries(salesByDate).map(([date, total]) => ({
            date: format(parseISO(date), 'dd/MM'),
            current: total
        }));

        const salesByService: Record<string, number> = {};
        const salesByCategory: Record<string, number> = {};

        filteredSales.forEach(sale => {
            const saleTotal = sale.total || 1;
            const realPaid = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                ? sale.monto_pagado_real
                : (sale.total || 0);
            const ratio = realPaid / saleTotal;

            (sale.items || []).forEach((item: SaleItem) => {
                const itemAmount = (item.subtotal || 0) * ratio;

                if (item.tipo === 'servicio') {
                    const service = services.find(s => s.id === item.id || s.name === item.servicio);
                    if (service) {
                        salesByService[service.name] = (salesByService[service.name] || 0) + itemAmount;
                        const categoryName = categoryMap.get(service.category);
                        if (categoryName) {
                            salesByCategory[categoryName] = (salesByCategory[categoryName] || 0) + itemAmount;
                        }
                    } else if (item.servicio) {
                        // Fallback using name directly
                        salesByService[item.servicio] = (salesByService[item.servicio] || 0) + itemAmount;
                    }
                }
            });
        });

        const sortedServices = Object.entries(salesByService).sort(([, a], [, b]) => b - a).slice(0, 5);
        const sortedCategories = Object.entries(salesByCategory).sort(([, a], [, b]) => b - a).slice(0, 5);

        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const orderedIndices = [1, 2, 3, 4, 5, 6, 0];
        const sortedDays = orderedIndices.map(index => ({
            name: dayNames[index],
            value: dayIndexCount[index] || 0
        })).filter(d => d.value > 0);

        // 2. Calcular promedio de ventas por día de la semana (Lunes a Domingo)
        const allDayAverages = orderedIndices.map(index => {
            const occurrences = dayOccurrences[index] || 0;
            const total = dayIndexCount[index] || 0;
            const activeDays = dayDatesWithSales[index]?.size || 0;
            const salesCount = daySalesCount[index] || 0;
            // Promedio: total de ventas dividido entre el número de veces que ocurrió ese día en el rango
            const average = occurrences > 0 ? total / occurrences : 0;
            const percentage = totalSales > 0 ? (total / totalSales) * 100 : 0;

            return {
                dayIndex: index,
                name: dayNames[index],
                total,
                occurrences,
                activeDays,
                salesCount,
                average: Math.round(average * 100) / 100,
                percentage: Math.round(percentage * 10) / 10,
                isBest: false,
                isWorst: false,
            };
        });

        // Si se especificó un rango y hay ocurrencias calculadas, mostramos sólo los días que existieron en el rango
        const hasAnyOccurrences = allDayAverages.some(d => d.occurrences > 0);
        const averageSalesByDay = hasAnyOccurrences
            ? allDayAverages.filter(d => d.occurrences > 0)
            : allDayAverages;

        // Identificar mejor y peor día según promedio diario
        let maxAvg = 0;
        let minAvg = Infinity;
        averageSalesByDay.forEach(d => {
            if (d.average > maxAvg) maxAvg = d.average;
            if (d.average > 0 && d.average < minAvg) minAvg = d.average;
        });
        if (minAvg === Infinity) minAvg = 0;

        averageSalesByDay.forEach(d => {
            d.isBest = d.average > 0 && d.average === maxAvg;
            d.isWorst = d.average > 0 && d.average === minAvg && maxAvg !== minAvg;
        });

        const sortedHours = Object.keys(hourCount).sort().map(hour => ({
            hour,
            value: hourCount[hour]
        }));

        let bestDay = null;
        let worstDay = null;
        if (sortedDays.length > 0) {
            bestDay = sortedDays.reduce((prev, current) => (prev.value > current.value) ? prev : current, sortedDays[0]);
            worstDay = sortedDays.reduce((prev, current) => (prev.value < current.value) ? prev : current, sortedDays[0]);
        }

        let bestHour = null;
        let worstHour = null;
        if (sortedHours.length > 0) {
            bestHour = sortedHours.reduce((prev, current) => (prev.value > current.value) ? prev : current, sortedHours[0]);
            worstHour = sortedHours.reduce((prev, current) => (prev.value < current.value) ? prev : current, sortedHours[0]);
        }

        return {
            totalSales,
            salesCount,
            averageSale,
            salesOverTime,
            salesByCategory: sortedCategories.map(([name, value]) => ({ name, value })),
            salesByService: sortedServices.map(([name, value]) => ({ name, value })),
            bestDay, worstDay, bestHour, worstHour,
            averageSalesByDay,
            maxAvgDay: maxAvg
        };

    }, [sales, services, categoryMap, isLoading, activeFilters]);

    const { user } = useAuth();

    const { data: roles } = useFirestoreQuery<Role>('roles');
    const userRole = roles?.find(r => r.title === user?.role);
    const historyLimit = userRole?.historyRestrictionDays;

    const sortedAverageSalesByDay = useMemo(() => {
        const list = [...aggregatedData.averageSalesByDay];
        const orderMap: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 0: 7 };

        if (daySortOrder === 'desc') {
            return list.sort((a, b) => b.average - a.average || (orderMap[a.dayIndex] || 0) - (orderMap[b.dayIndex] || 0));
        }
        if (daySortOrder === 'asc') {
            return list.sort((a, b) => a.average - b.average || (orderMap[a.dayIndex] || 0) - (orderMap[b.dayIndex] || 0));
        }
        return list.sort((a, b) => (orderMap[a.dayIndex] || 0) - (orderMap[b.dayIndex] || 0));
    }, [aggregatedData.averageSalesByDay, daySortOrder]);

    const handleDownload = () => {
        if (!sales || sales.length === 0) {
            toast({
                variant: "destructive",
                title: "No hay datos para exportar",
                description: "No hay ventas registradas en el período seleccionado.",
            });
            return;
        }

        const profMap = new Map(professionals.map(p => [p.id, p.name]));
        const clientMap = new Map((clients || []).map(c => [c.id, c.nombre]));

        const salesData = sales.map(sale => {
            const dateObj = sale.fecha_hora_venta?.toDate ? sale.fecha_hora_venta.toDate() : new Date();
            const realPaid = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                ? sale.monto_pagado_real
                : (sale.total || 0);

            const profs = Array.from(new Set(
                (sale.items || [])
                    .map(i => profMap.get(i.barbero_id) || i.barbero_id)
                    .filter(Boolean)
            )).join(', ');

            const itemsStr = (sale.items || [])
                .map(i => `${i.cantidad || 1}x ${i.nombre || i.servicio || 'Ítem'}`)
                .join(', ');

            return {
                'ID Venta': sale.id,
                'Fecha': format(dateObj, 'yyyy-MM-dd'),
                'Hora': format(dateObj, 'HH:mm'),
                'Cliente': clientMap.get(sale.cliente_id) || sale.client?.nombre || 'General / Sin Registrar',
                'Profesional(es)': profs || 'N/A',
                'Conceptos': itemsStr || 'N/A',
                'Método de Pago': sale.metodo_pago || 'Efectivo',
                'Subtotal': sale.subtotal || 0,
                'Descuento': sale.descuento?.valor || 0,
                'Total': sale.total || 0,
                'Monto Pagado Real': realPaid,
                'Propina': sale.propina || 0,
            };
        });

        const generalSummary = [
            { 'Concepto': 'Total Pagado', 'Valor': `$${aggregatedData.totalSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
            { 'Concepto': 'Cantidad de Ventas', 'Valor': aggregatedData.salesCount },
            { 'Concepto': 'Venta Promedio', 'Valor': `$${aggregatedData.averageSale.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
            { 'Concepto': 'Mejor Día', 'Valor': `${aggregatedData.bestDay?.name || 'N/A'} ($${aggregatedData.bestDay?.value?.toLocaleString('es-MX', { minimumFractionDigits: 2 }) || '0'})` },
            { 'Concepto': 'Peor Día', 'Valor': `${aggregatedData.worstDay?.name || 'N/A'} ($${aggregatedData.worstDay?.value?.toLocaleString('es-MX', { minimumFractionDigits: 2 }) || '0'})` },
            { 'Concepto': 'Mejor Hora', 'Valor': `${aggregatedData.bestHour?.hour || 'N/A'} ($${aggregatedData.bestHour?.value?.toLocaleString('es-MX', { minimumFractionDigits: 2 }) || '0'})` },
            { 'Concepto': 'Peor Hora', 'Valor': `${aggregatedData.worstHour?.hour || 'N/A'} ($${aggregatedData.worstHour?.value?.toLocaleString('es-MX', { minimumFractionDigits: 2 }) || '0'})` },
        ];

        const daysData = aggregatedData.averageSalesByDay.map(d => ({
            'Día': d.name,
            'Total Acumulado': d.total,
            'Promedio Diario': d.average,
            'Ocurrencias en Rango': d.occurrences,
            'Días con Venta': d.activeDays,
            'Ventas Realizadas': d.salesCount,
            '% del Total': `${d.percentage}%`
        }));

        const categoriesData = aggregatedData.salesByCategory.map(c => ({
            'Categoría': c.name,
            'Total Vendido': c.value
        }));

        const servicesData = aggregatedData.salesByService.map(s => ({
            'Servicio': s.name,
            'Total Vendido': s.value
        }));

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(salesData), "Ventas Detalladas");
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(generalSummary), "Resumen");
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(daysData), "Promedio por Día");
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(categoriesData), "Por Categoría");
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(servicesData), "Por Servicio");

        XLSX.writeFile(workbook, `Reporte_Ventas_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

        toast({
            title: "Reporte generado",
            description: "La descarga del reporte de ventas ha comenzado.",
        });
    };

    return (
        <div className="flex-1 space-y-4 p-3 sm:p-6 md:p-8 pt-4 sm:pt-6">
            {/* Header Oficial */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                        Reporte de ventas
                    </h1>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 hidden sm:block">
                        Análisis general de ventas por periodo, servicio, categoría y días de la semana.
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
                    <CardDescription className="text-xs">Filtra por periodo, profesional y servicio.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col lg:flex-row lg:items-end gap-3 sm:gap-4">
                        {/* Rango de fechas */}
                        <div className="flex-1 min-w-[200px] space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rango de fechas</label>
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
                                            <span>Selecciona un rango</span>
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

                        {/* Profesional */}
                        <div className="flex-1 min-w-[180px] space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Profesional</label>
                            <Select value={professionalFilter} onValueChange={setProfessionalFilter} disabled={professionalsLoading}>
                                <SelectTrigger className="w-full rounded-xl h-10 border-border/60 text-xs sm:text-sm">
                                    <SelectValue placeholder="Todos los profesionales" />
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
                        <div className="flex-1 min-w-[180px] space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Servicio</label>
                            <Select value={serviceFilter} onValueChange={setServiceFilter} disabled={servicesLoading}>
                                <SelectTrigger className="w-full rounded-xl h-10 border-border/60 text-xs sm:text-sm">
                                    <SelectValue placeholder="Todos los servicios" />
                                </SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1 max-h-64">
                                    <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos los servicios</SelectItem>
                                    {services.map(s => (
                                        <SelectItem key={s.id} value={s.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">{s.name}</SelectItem>
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

                        <Select value={serviceFilter} onValueChange={setServiceFilter} disabled={servicesLoading}>
                            <SelectTrigger className="rounded-xl h-9 text-xs border-border/60">
                                <SelectValue placeholder="Servicio" />
                            </SelectTrigger>
                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1 max-h-64">
                                <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos</SelectItem>
                                {services.map(s => (
                                    <SelectItem key={s.id} value={s.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Desempeño Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 border-b border-border/40">
                        <CardTitle className="text-sm font-semibold">Desempeño por Día</CardTitle>
                        <CalendarIcon className="h-4 w-4 text-slate-400" />
                    </CardHeader>
                    <CardContent className="p-4 pt-3">
                        <div className="space-y-2">
                            <div className="flex justify-between items-center text-xs sm:text-sm">
                                <span className="text-muted-foreground">Mejor:</span>
                                <span className="font-bold text-blue-400">
                                    {aggregatedData.bestDay?.name || '-'} ({aggregatedData.bestDay?.value ? `$${aggregatedData.bestDay.value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'})
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-xs sm:text-sm">
                                <span className="text-muted-foreground">Peor:</span>
                                <span className="font-bold text-slate-400">
                                    {aggregatedData.worstDay?.name || '-'} ({aggregatedData.worstDay?.value ? `$${aggregatedData.worstDay.value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'})
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 border-b border-border/40">
                        <CardTitle className="text-sm font-semibold">Desempeño por Hora</CardTitle>
                        <Clock className="h-4 w-4 text-slate-400" />
                    </CardHeader>
                    <CardContent className="p-4 pt-3">
                        <div className="space-y-2">
                            <div className="flex justify-between items-center text-xs sm:text-sm">
                                <span className="text-muted-foreground">Mejor:</span>
                                <span className="font-bold text-blue-400">
                                    {aggregatedData.bestHour?.hour || '-'} ({aggregatedData.bestHour?.value ? `$${aggregatedData.bestHour.value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'})
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-xs sm:text-sm">
                                <span className="text-muted-foreground">Peor:</span>
                                <span className="font-bold text-slate-400">
                                    {aggregatedData.worstHour?.hour || '-'} ({aggregatedData.worstHour?.value ? `$${aggregatedData.worstHour.value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00'})
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Resumen & Ventas por periodo */}
            <Card className="rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-4 sm:p-6">
                    <div className="lg:col-span-1">
                        <h3 className="text-lg font-bold tracking-tight mb-4 text-foreground">Resumen</h3>
                        <div className="space-y-5">
                            <KpiCard 
                                title="Total (Pagado)" 
                                value={aggregatedData.totalSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                                prefix="$" 
                            />
                            <KpiCard 
                                title="Cantidad de ventas" 
                                value={aggregatedData.salesCount.toLocaleString()} 
                            />
                            <KpiCard 
                                title="Venta promedio" 
                                value={aggregatedData.averageSale.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                                prefix="$" 
                            />
                        </div>
                    </div>
                    <div className="lg:col-span-2">
                        <h3 className="text-lg font-bold tracking-tight mb-4 text-foreground">Ventas por periodo</h3>
                        {isLoading ? (
                            <div className="h-[250px] flex items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={aggregatedData.salesOverTime}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.08)" />
                                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} stroke="rgba(255,255,255,0.1)" />
                                    <YAxis tickFormatter={(value) => `$${value / 1000}k`} tick={{ fontSize: 12, fill: '#94a3b8' }} stroke="rgba(255,255,255,0.1)" />
                                    <Tooltip 
                                        contentStyle={tooltipContentStyle}
                                        itemStyle={{ color: '#ffffff' }}
                                        labelStyle={{ color: '#94a3b8', fontWeight: 600 }}
                                        formatter={(value: number) => [`$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Ventas']} 
                                    />
                                    <Legend iconSize={10} wrapperStyle={{ fontSize: "12px", color: '#94a3b8' }} />
                                    <Line type="monotone" name="Periodo seleccionado" dataKey="current" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 3, fill: '#3B82F6' }} activeDot={{ r: 5 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </Card>

            {/* Gráficos Top Categorías y Servicios */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                    <CardHeader className="p-4 sm:p-5 pb-2 border-b border-border/40">
                        <CardTitle className="text-base font-semibold">Ventas por categoría</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-5">
                        {isLoading ? (
                            <div className="h-[250px] flex items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={aggregatedData.salesByCategory} layout="vertical" margin={{ top: 5, right: 90, left: 60, bottom: 5 }}>
                                    <XAxis type="number" hide domain={[0, (dataMax: number) => (dataMax > 0 ? Math.ceil(dataMax * 1.25) : 100)]} />
                                    <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                    <Tooltip 
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }} 
                                        contentStyle={tooltipContentStyle}
                                        itemStyle={{ color: '#ffffff' }}
                                        labelStyle={{ color: '#94a3b8', fontWeight: 600 }}
                                        formatter={(value: number) => [`$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Total']} 
                                    />
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20} label={<CustomBarLabel value={0} x={0} y={0} width={0} />}>
                                        {aggregatedData.salesByCategory.map((_, index) => (
                                            <Cell key={`cell-cat-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                <Card className="rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                    <CardHeader className="p-4 sm:p-5 pb-2 border-b border-border/40">
                        <CardTitle className="text-base font-semibold">Ventas por servicio (Top 5)</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-5">
                        {isLoading ? (
                            <div className="h-[250px] flex items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={aggregatedData.salesByService} layout="vertical" margin={{ top: 5, right: 90, left: 120, bottom: 5 }}>
                                    <XAxis type="number" hide domain={[0, (dataMax: number) => (dataMax > 0 ? Math.ceil(dataMax * 1.25) : 100)]} />
                                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                    <Tooltip 
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }} 
                                        contentStyle={tooltipContentStyle}
                                        itemStyle={{ color: '#ffffff' }}
                                        labelStyle={{ color: '#94a3b8', fontWeight: 600 }}
                                        formatter={(value: number) => [`$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Total']} 
                                    />
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20} label={<CustomBarLabel value={0} x={0} y={0} width={0} />}>
                                        {aggregatedData.salesByService.map((_, index) => (
                                            <Cell key={`cell-srv-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* PROMEDIO DE VENTAS POR DÍA DE LA SEMANA */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                    <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 pb-3 border-b border-border/40 gap-2">
                        <div className="space-y-1">
                            <CardTitle className="text-base font-semibold flex items-center gap-2">
                                <CalendarIcon className="h-4 w-4 text-slate-400" />
                                Promedio de ventas por día
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Promedio diario de ventas por cada día de la semana en el rango seleccionado.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground hidden sm:inline-block" />
                            <Select value={daySortOrder} onValueChange={(val: any) => setDaySortOrder(val)}>
                                <SelectTrigger className="h-8 text-xs w-[185px] rounded-xl border-border/60">
                                    <SelectValue placeholder="Ordenar..." />
                                </SelectTrigger>
                                <SelectContent align="end" className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                    <SelectItem value="chronological" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">
                                        Orden por día (Lun - Dom)
                                    </SelectItem>
                                    <SelectItem value="desc" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">
                                        Mayor a menor venta
                                    </SelectItem>
                                    <SelectItem value="asc" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">
                                        Menor a mayor venta
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-5">
                        {isLoading ? (
                            <div className="h-[280px] flex items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                            </div>
                        ) : sortedAverageSalesByDay.length === 0 ? (
                            <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                                No hay ventas registradas en el periodo seleccionado.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={Math.max(260, sortedAverageSalesByDay.length * 38)}>
                                <BarChart
                                    data={sortedAverageSalesByDay}
                                    layout="vertical"
                                    margin={{ top: 5, right: 95, left: 10, bottom: 5 }}
                                >
                                    <XAxis
                                        type="number"
                                        hide
                                        domain={[0, (dataMax: number) => (dataMax > 0 ? Math.ceil(dataMax * 1.25) : 100)]}
                                    />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        width={85}
                                        tick={{ fontSize: 12, fontWeight: 500, fill: '#94a3b8' }}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const d = payload[0].payload;
                                                return (
                                                    <div className="bg-[#151b2e] border-2 border-blue-500 p-2.5 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] text-xs space-y-1 min-w-[200px] text-white">
                                                        <p className="font-bold text-sm text-white border-b border-border/60 pb-1">
                                                            {d.name}
                                                        </p>
                                                        <div className="flex justify-between items-center pt-0.5">
                                                            <span className="text-slate-400">Promedio / día:</span>
                                                            <span className="font-bold text-blue-400">
                                                                ${d.average.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-slate-400">Total acumulado:</span>
                                                            <span className="font-medium text-white">
                                                                ${d.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-slate-400">Días en rango:</span>
                                                            <span>
                                                                {d.occurrences} {formatDayPlural(d.name, d.occurrences)} ({d.activeDays} con venta)
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-slate-400">Tickets / ventas:</span>
                                                            <span>{d.salesCount} ventas</span>
                                                        </div>
                                                        <div className="flex justify-between items-center pt-1 border-t border-border/40">
                                                            <span className="text-slate-400">Aporte al periodo:</span>
                                                            <span className="font-semibold text-white">{d.percentage}%</span>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar
                                        dataKey="average"
                                        radius={[0, 4, 4, 0]}
                                        barSize={18}
                                        label={<CustomBarLabel value={0} x={0} y={0} width={0} />}
                                    >
                                        {sortedAverageSalesByDay.map((entry, index) => (
                                            <Cell
                                                key={`day-bar-${entry.dayIndex}-${daySortOrder}`}
                                                fill={entry.isBest ? '#3B82F6' : CHART_COLORS[(index + 1) % CHART_COLORS.length]}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                <Card className="rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                    <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 pb-3 border-b border-border/40 gap-2">
                        <div className="space-y-1">
                            <CardTitle className="text-base font-semibold flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-slate-400" />
                                Desglose de promedios por día
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Rendimiento por día de la semana con totales y número de días evaluados.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground hidden sm:inline-block" />
                            <Select value={daySortOrder} onValueChange={(val: any) => setDaySortOrder(val)}>
                                <SelectTrigger className="h-8 text-xs w-[185px] rounded-xl border-border/60">
                                    <SelectValue placeholder="Ordenar..." />
                                </SelectTrigger>
                                <SelectContent align="end" className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                    <SelectItem value="chronological" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">
                                        Orden por día (Lun - Dom)
                                    </SelectItem>
                                    <SelectItem value="desc" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">
                                        Mayor a menor venta
                                    </SelectItem>
                                    <SelectItem value="asc" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">
                                        Menor a mayor venta
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-5">
                        {isLoading ? (
                            <div className="h-[280px] flex items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                            </div>
                        ) : sortedAverageSalesByDay.length === 0 ? (
                            <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                                No hay datos disponibles para el periodo seleccionado.
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {sortedAverageSalesByDay.map((day) => (
                                    <div
                                        key={day.name}
                                        className="p-3 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-all space-y-1.5"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-sm text-foreground">{day.name}</span>
                                                {day.isBest && (
                                                    <Badge className="bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px] py-0 px-1.5 font-medium">
                                                        Mayor venta
                                                    </Badge>
                                                )}
                                                {day.isWorst && (
                                                    <Badge variant="outline" className="text-muted-foreground text-[10px] py-0 px-1.5 font-normal">
                                                        Menor venta
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <span className="font-bold text-sm text-foreground">
                                                    ${day.average.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                                <span className="text-[11px] text-muted-foreground ml-1">prom.</span>
                                            </div>
                                        </div>

                                        {/* Barra de progreso */}
                                        <div className="w-full bg-muted/60 rounded-full h-1.5 overflow-hidden">
                                            <div
                                                className={cn(
                                                    "h-full rounded-full transition-all duration-500",
                                                    day.isBest ? "bg-blue-500" : "bg-blue-600/70"
                                                )}
                                                style={{
                                                    width: `${aggregatedData.maxAvgDay > 0 ? Math.max(3, (day.average / aggregatedData.maxAvgDay) * 100) : 0}%`,
                                                }}
                                            />
                                        </div>

                                        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                                            <span>
                                                Total: <strong className="text-foreground font-medium">${day.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                            </span>
                                            <span>
                                                {day.occurrences} {formatDayPlural(day.name, day.occurrences)} ({day.salesCount} vtas.) • {day.percentage}%
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
