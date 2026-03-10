

'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, BarChart, XAxis, YAxis, Tooltip, Bar, LineChart, Line, Legend, CartesianGrid, Cell } from 'recharts';
import { ArrowUp, ArrowDown, Search } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon, Loader2, Clock } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { format, subDays, startOfMonth, endOfMonth, parseISO, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { where, Timestamp } from 'firebase/firestore';
import type { Sale, Service, ServiceCategory, SaleItem, Role, Profesional } from '@/lib/types';
import { useAuth } from '@/contexts/firebase-auth-context';


const KpiCard = ({ title, value, change, isPositive, prefix = '', suffix = '' }: { title: string, value: string, change?: string, isPositive?: boolean, prefix?: string, suffix?: string }) => (
    <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-3xl font-bold">{prefix}{value}{suffix}</p>
        {change && (
            <p className={cn("text-xs flex items-center", isPositive ? 'text-green-500' : 'text-red-500')}>
                {isPositive ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
                {change}
            </p>
        )}
    </div>
);

const CustomBarLabel = (props: any) => {
    const { x, y, width, value } = props;
    return (
        <text x={x + width + 10} y={y + 10} fill="hsl(var(--foreground))" textAnchor="start" fontSize={12}>
            {`$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </text>
    );
};

export default function SalesReportPage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: subDays(new Date(), 28), to: new Date() });
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [professionalFilter, setProfessionalFilter] = useState('todos');
    const [serviceFilter, setServiceFilter] = useState('todos');

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
    const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: categories, loading: categoriesLoading } = useFirestoreQuery<ServiceCategory>('categorias_servicios');
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');

    const isLoading = salesLoading || servicesLoading || categoriesLoading || professionalsLoading;

    const handleSearch = () => {
        setActiveFilters({
            professional: professionalFilter,
            service: serviceFilter,
            dateRange: dateRange
        });
    };

    const categoryMap = useMemo(() => {
        if (categoriesLoading) return new Map();
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
        };

        const filteredSales = sales.filter(sale => {
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

        const salesByDate: Record<string, number> = {};
        const dayIndexCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        const hourCount: Record<string, number> = {};

        filteredSales.forEach(sale => {
            const dateObj = sale.fecha_hora_venta.toDate();
            const date = format(dateObj, 'yyyy-MM-dd');
            const amount = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                ? sale.monto_pagado_real
                : (sale.total || 0);
            salesByDate[date] = (salesByDate[date] || 0) + amount;

            const dayIndex = getDay(dateObj);
            dayIndexCount[dayIndex] = (dayIndexCount[dayIndex] || 0) + amount;

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
            bestDay, worstDay, bestHour, worstHour
        };

    }, [sales, services, categoryMap, isLoading, activeFilters]);


    const { user } = useAuth();


    const { data: roles } = useFirestoreQuery<Role>('roles');
    const userRole = roles.find(r => r.title === user?.role);
    const historyLimit = userRole?.historyRestrictionDays;

    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Reporte de ventas</h2>

            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-wrap items-end gap-4 mb-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Rango de fechas</label>
                            <Popover open={isCalendarOpen} onOpenChange={(open) => {
                                setIsCalendarOpen(open);
                                if (open) {
                                    setDateRange(undefined);
                                }
                            }}>
                                <PopoverTrigger asChild>
                                    <Button id="date" variant={"outline"} className="w-[260px] justify-start text-left font-normal border-input">
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange?.from ? (dateRange.to ? <>{format(dateRange.from, "LLL dd, y", { locale: es })} - {format(dateRange.to, "LLL dd, y", { locale: es })}</> : format(dateRange.from, "LLL dd, y", { locale: es })) : <span>Selecciona un rango</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
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
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Profesional</label>
                            <Select value={professionalFilter} onValueChange={setProfessionalFilter} disabled={professionalsLoading}>
                                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Profesional" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="todos">Todos los profesionales</SelectItem>
                                    {professionals.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Servicio</label>
                            <Select value={serviceFilter} onValueChange={setServiceFilter} disabled={servicesLoading}>
                                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Servicio" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="todos">Todos los servicios</SelectItem>
                                    {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={handleSearch} disabled={isLoading}>
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="mr-2 h-4 w-4" />} Buscar
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Desempeño por Día</CardTitle>
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-1 mt-1">
                            <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Mejor:</span><span className="text-sm font-bold text-primary">{aggregatedData.bestDay?.name} ({aggregatedData.bestDay?.value ? `$${aggregatedData.bestDay.value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0'})</span></div>
                            <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Peor:</span><span className="text-sm font-bold text-muted-foreground">{aggregatedData.worstDay?.name} ({aggregatedData.worstDay?.value ? `$${aggregatedData.worstDay.value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0'})</span></div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Desempeño por Hora</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-1 mt-1">
                            <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Mejor:</span><span className="text-sm font-bold text-primary">{aggregatedData.bestHour?.hour || '-'} ({aggregatedData.bestHour?.value ? `$${aggregatedData.bestHour.value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0'})</span></div>
                            <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Peor:</span><span className="text-sm font-bold text-muted-foreground">{aggregatedData.worstHour?.hour || '-'} ({aggregatedData.worstHour?.value ? `$${aggregatedData.worstHour.value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0'})</span></div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
                    <div className="lg:col-span-1">
                        <h3 className="text-xl font-semibold mb-4">Resumen</h3>
                        <div className="space-y-6">
                            <KpiCard title="Total (Pagado)" value={aggregatedData.totalSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} prefix="$" />
                            <KpiCard title="Cantidad de ventas" value={aggregatedData.salesCount.toLocaleString()} />
                            <KpiCard title="Venta promedio" value={aggregatedData.averageSale.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} prefix="$" />


                        </div>
                    </div>
                    <div className="lg:col-span-2">
                        <h3 className="text-xl font-semibold mb-4">Ventas por periodo</h3>
                        {isLoading ? <div className="h-[250px] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
                            <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={aggregatedData.salesOverTime}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                    <YAxis tickFormatter={(value) => `$${value / 1000}k`} tick={{ fontSize: 12 }} />
                                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} formatter={(value: number) => `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                                    <Legend iconSize={10} wrapperStyle={{ fontSize: "12px" }} />
                                    <Line type="monotone" name="Periodo seleccionado" dataKey="current" stroke="hsl(var(--primary))" strokeWidth={2} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Ventas por categoría</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <div className="h-[250px] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={aggregatedData.salesByCategory} layout="vertical" margin={{ left: 60 }}>
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                                    <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} formatter={(value: number) => `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20} label={<CustomBarLabel value={0} x={0} y={0} width={0} />}>
                                        {aggregatedData.salesByCategory.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={index % 2 === 0 ? 'hsl(var(--primary))' : 'hsl(var(--secondary))'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Ventas por servicio (Top 5)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <div className="h-[250px] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={aggregatedData.salesByService} layout="vertical" margin={{ left: 120 }}>
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                                    <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} formatter={(value: number) => `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20} label={<CustomBarLabel value={0} x={0} y={0} width={0} />}>
                                        {aggregatedData.salesByService.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={index % 2 === 0 ? 'hsl(var(--primary))' : 'hsl(var(--secondary))'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
