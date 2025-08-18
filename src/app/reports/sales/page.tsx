'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { where, Timestamp } from 'firebase/firestore';
import type { Sale, Service, ServiceCategory, Local, SaleItem } from '@/lib/types';


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

const CustomBarLabel = ({ x, y, width, value }: any) => {
    return (
        <text x={x + width + 10} y={y + 10} fill="hsl(var(--foreground))" textAnchor="start" fontSize={12}>
            {`$${value.toLocaleString('es-MX')}`}
        </text>
    );
};

export default function SalesReportPage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: subDays(new Date(), 28), to: new Date() });
    const [localFilter, setLocalFilter] = useState('todos');
    const [queryKey, setQueryKey] = useState(0);

    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', queryKey,
        ...(dateRange?.from ? [where('fecha_hora_venta', '>=', Timestamp.fromDate(dateRange.from))] : []),
        ...(dateRange?.to ? [where('fecha_hora_venta', '<=', Timestamp.fromDate(dateRange.to))] : []),
        ...(localFilter !== 'todos' ? [where('local_id', '==', localFilter)] : [])
    );
    const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: categories, loading: categoriesLoading } = useFirestoreQuery<ServiceCategory>('categorias_servicios');
    const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
    
    const isLoading = salesLoading || servicesLoading || categoriesLoading || localesLoading;

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

    const serviceMap = useMemo(() => {
        if (servicesLoading) return new Map();
        return new Map(services.map(s => [s.id, s]));
    }, [services, servicesLoading]);
    
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
        
        const totalSales = sales.reduce((sum, sale) => sum + (sale.total || 0), 0);
        const salesCount = sales.length;
        const averageSale = salesCount > 0 ? totalSales / salesCount : 0;
        
        const salesByDate: Record<string, number> = {};
        sales.forEach(sale => {
            const date = format(sale.fecha_hora_venta.toDate(), 'yyyy-MM-dd');
            salesByDate[date] = (salesByDate[date] || 0) + (sale.total || 0);
        });

        const salesOverTime = Object.entries(salesByDate).map(([date, total]) => ({
            date: format(parseISO(date), 'dd/MM'),
            current: total
        }));

        const salesByService: Record<string, number> = {};
        const salesByCategory: Record<string, number> = {};

        sales.forEach(sale => {
            sale.items?.forEach((item: SaleItem) => {
                if (item.tipo === 'servicio') {
                    const service = services.find(s => s.id === item.id || s.name === item.servicio);
                    if (service) {
                        salesByService[service.name] = (salesByService[service.name] || 0) + (item.subtotal || 0);
                        const categoryName = categoryMap.get(service.category);
                        if (categoryName) {
                            salesByCategory[categoryName] = (salesByCategory[categoryName] || 0) + (item.subtotal || 0);
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

    }, [sales, services, categories, categoryMap, isLoading]);


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
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button id="date" variant={"outline"} className="w-full justify-start text-left font-normal">
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange?.from ? (dateRange.to ? <>{format(dateRange.from, "LLL dd, y", { locale: es })} - {format(dateRange.to, "LLL dd, y", { locale: es })}</> : format(dateRange.from, "LLL dd, y", { locale: es })) : <span>Selecciona un rango</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} />
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
                                <YAxis tickFormatter={(value) => `$${value/1000}k`} tick={{ fontSize: 12 }} />
                                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} formatter={(value: number) => `$${value.toLocaleString('es-MX')}`} />
                                <Legend iconSize={10} wrapperStyle={{fontSize: "12px"}}/>
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
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20} label={<CustomBarLabel />}>
                                    {aggregatedData.salesByCategory.map((entry, index) => (
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
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20} label={<CustomBarLabel />}>
                                     {aggregatedData.salesByService.map((entry, index) => (
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
