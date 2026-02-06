

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
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { where, Timestamp } from 'firebase/firestore';
import type { Sale, Service, ServiceCategory, SaleItem } from '@/lib/types';


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
            {`$${value.toLocaleString('es-MX')}`}
        </text>
    );
};

export default function SalesReportPage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: subDays(new Date(), 28), to: new Date() });
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [localFilter, setLocalFilter] = useState('todos');
    const [queryKey, setQueryKey] = useState(0);

    const salesQueryConstraints = useMemo(() => {
        const constraints = [];
        if (dateRange?.from) {
            constraints.push(where('fecha_hora_venta', '>=', Timestamp.fromDate(dateRange.from)));
        }
        if (dateRange?.to) {
            constraints.push(where('fecha_hora_venta', '<=', Timestamp.fromDate(dateRange.to)));
        }
        if (localFilter !== 'todos') {
            constraints.push(where('local_id', '==', localFilter));
        }
        return constraints;
    }, [dateRange, localFilter]);


    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', queryKey, ...salesQueryConstraints);
    const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: categories, loading: categoriesLoading } = useFirestoreQuery<ServiceCategory>('categorias_servicios');

    const isLoading = salesLoading || servicesLoading || categoriesLoading;

    const handlePeriodChange = (value: string) => {
        const today = new Date();
        if (value === 'this_week') {
            setDateRange({ from: startOfWeek(today, { weekStartsOn: 1 }), to: endOfWeek(today, { weekStartsOn: 1 }) });
        } else if (value === 'this_month') {
            setDateRange({ from: startOfMonth(today), to: endOfMonth(today) });
        } else if (value === 'last_4_weeks') {
            setDateRange({ from: subDays(today, 28), to: today });
        }
    };

    const handleSearch = () => {
        setQueryKey(prev => prev + 1);
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
            salesByService: []
        };

        const totalSales = sales.reduce((sum, sale) => {
            const amount = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                ? sale.monto_pagado_real
                : (sale.total || 0);
            return sum + amount;
        }, 0);
        const salesCount = sales.length;
        const averageSale = salesCount > 0 ? totalSales / salesCount : 0;

        const salesByDate: Record<string, number> = {};
        sales.forEach(sale => {
            const date = format(sale.fecha_hora_venta.toDate(), 'yyyy-MM-dd');
            const amount = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                ? sale.monto_pagado_real
                : (sale.total || 0);
            salesByDate[date] = (salesByDate[date] || 0) + amount;
        });

        const salesOverTime = Object.entries(salesByDate).map(([date, total]) => ({
            date: format(parseISO(date), 'dd/MM'),
            current: total
        }));

        const salesByService: Record<string, number> = {};
        const salesByCategory: Record<string, number> = {};

        sales.forEach(sale => {
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
                    }
                }
            });
        });

        const sortedServices = Object.entries(salesByService).sort(([, a], [, b]) => b - a).slice(0, 5);
        const sortedCategories = Object.entries(salesByCategory).sort(([, a], [, b]) => b - a).slice(0, 5);

        return {
            totalSales,
            salesCount,
            averageSale,
            salesOverTime,
            salesByCategory: sortedCategories.map(([name, value]) => ({ name, value })),
            salesByService: sortedServices.map(([name, value]) => ({ name, value }))
        };

    }, [sales, services, categoryMap, isLoading]);


    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Reporte de ventas</h2>

            <Card>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Periodo</label>
                            <Select defaultValue="last_4_weeks" onValueChange={handlePeriodChange}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="this_week">Esta semana</SelectItem>
                                    <SelectItem value="this_month">Este mes</SelectItem>
                                    <SelectItem value="last_4_weeks">Últimas 4 semanas</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1 md:col-span-2">
                            <label className="text-sm font-medium">Rango de fechas</label>
                            <Popover open={isCalendarOpen} onOpenChange={(open) => {
                                setIsCalendarOpen(open);
                                if (open) {
                                    setDateRange(undefined);
                                }
                            }}>
                                <PopoverTrigger asChild>
                                    <Button id="date" variant={"outline"} className="w-full justify-start text-left font-normal">
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
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <Button onClick={handleSearch} disabled={isLoading}>
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="mr-2 h-4 w-4" />} Buscar
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
                    <div className="lg:col-span-1">
                        <h3 className="text-xl font-semibold mb-4">Resumen</h3>
                        <div className="space-y-6">
                            <KpiCard title="Total" value={aggregatedData.totalSales.toLocaleString('es-MX')} prefix="$" />
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
                                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} formatter={(value: number) => `$${value.toLocaleString('es-MX')}`} />
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
                                    <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} formatter={(value: number) => `$${value.toLocaleString('es-MX')}`} />
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
                                    <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} formatter={(value: number) => `$${value.toLocaleString('es-MX')}`} />
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
