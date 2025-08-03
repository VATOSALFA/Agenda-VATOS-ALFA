
'use client';
import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Bar, BarChart as RechartsBarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Pie, PieChart as RechartsPieChart, Cell, Legend } from 'recharts';
import { Calendar, BarChartHorizontal, Users, DollarSign, Wallet, Percent, MessageSquare, Send, CheckCircle, Loader2 } from "lucide-react";
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Reservation, Client, Sale } from '@/lib/types';
import { where, Timestamp } from 'firebase/firestore';
import { startOfToday, subDays, startOfMonth, endOfMonth, subMonths, endOfToday } from 'date-fns';

const occupancyData = [
  { professional: 'El Patrón', occupancy: 85 },
  { professional: 'El Sicario', occupancy: 78 },
  { professional: 'El Padrino', occupancy: 92 },
  { professional: 'Extra', occupancy: 65 },
];

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

const SummaryCard = ({ title, value, change, icon: Icon, isLoading }: { title: string, value: string, change?: string, icon: React.ElementType, isLoading?: boolean }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <div className="text-2xl font-bold">{value}</div>}
            {change && <p className="text-xs text-muted-foreground">{change}</p>}
        </CardContent>
    </Card>
);

export default function ReportsPage() {
    const [timeFilter, setTimeFilter] = useState('last-30');
    
    const { startDate, previousStartDate, endDate, previousEndDate } = useMemo(() => {
        const now = new Date();
        let start, end, prevStart, prevEnd;

        switch (timeFilter) {
            case 'today':
                start = startOfToday();
                end = endOfToday();
                prevStart = subDays(start, 1);
                prevEnd = subDays(end, 1);
                break;
            case 'last-7':
                start = subDays(now, 6);
                end = now;
                prevStart = subDays(start, 7);
                prevEnd = subDays(end, 7);
                break;
            case 'this-month':
                start = startOfMonth(now);
                end = endOfMonth(now);
                const lastMonth = subMonths(now, 1);
                prevStart = startOfMonth(lastMonth);
                prevEnd = endOfMonth(lastMonth);
                break;
             case 'last-month':
                const prevMonth = subMonths(now, 1);
                start = startOfMonth(prevMonth);
                end = endOfMonth(prevMonth);
                const beforePrevMonth = subMonths(now, 2);
                prevStart = startOfMonth(beforePrevMonth);
                prevEnd = endOfMonth(beforePrevMonth);
                break;
            case 'last-30':
            default:
                start = subDays(now, 29);
                end = now;
                prevStart = subDays(start, 30);
                prevEnd = subDays(end, 30);
                break;
        }
        return { 
            startDate: Timestamp.fromDate(start), 
            endDate: Timestamp.fromDate(end),
            previousStartDate: Timestamp.fromDate(prevStart),
            previousEndDate: Timestamp.fromDate(prevEnd)
        };
    }, [timeFilter]);

    const { data: reservations, loading: reservationsLoading } = useFirestoreQuery<Reservation>('reservas', where('creado_en', '>=', startDate), where('creado_en', '<=', endDate));
    const { data: previousReservations } = useFirestoreQuery<Reservation>('reservas', where('creado_en', '>=', previousStartDate), where('creado_en', '<=', previousEndDate));
    
    const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes', where('creado_en', '>=', startDate), where('creado_en', '<=', endDate));
    const { data: previousClients } = useFirestoreQuery<Client>('clientes', where('creado_en', '>=', previousStartDate), where('creado_en', '<=', previousEndDate));

    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', where('fecha_hora_venta', '>=', startDate), where('fecha_hora_venta', '<=', endDate));
    const { data: previousSales } = useFirestoreQuery<Sale>('ventas', where('fecha_hora_venta', '>=', previousStartDate), where('fecha_hora_venta', '<=', previousEndDate));

    const isLoading = reservationsLoading || clientsLoading || salesLoading;

    const getChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? '+100%' : '+0%';
        const percentageChange = ((current - previous) / previous) * 100;
        return `${percentageChange >= 0 ? '+' : ''}${percentageChange.toFixed(1)}% que el periodo anterior`;
    };

    const totalReservations = reservations.length;
    const prevTotalReservations = previousReservations.length;
    const newClients = clients.length;
    const prevNewClients = previousClients.length;
    const totalSales = sales.reduce((acc, sale) => acc + sale.total, 0);
    const prevTotalSales = previousSales.reduce((acc, sale) => acc + sale.total, 0);
    
    const salesData = useMemo(() => {
        const byCategory = sales.reduce((acc, sale) => {
            sale.items.forEach(item => {
                const category = item.tipo === 'servicio' ? 'Servicios' : 'Productos';
                acc[category] = (acc[category] || 0) + item.subtotal;
            });
            return acc;
        }, {} as Record<string, number>);

        return Object.entries(byCategory).map(([name, value]) => ({ name, value }));
    }, [sales]);
    
    const reservationSourceData = useMemo(() => {
        const bySource = reservations.reduce((acc, res) => {
            const source = res.canal_reserva || 'Desconocido';
            acc[source] = (acc[source] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        return Object.entries(bySource).map(([name, value]) => ({name, value}));
    }, [reservations]);


    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Resumen</h2>
                <div className="flex items-center space-x-2">
                    <Select value={timeFilter} onValueChange={setTimeFilter}>
                        <SelectTrigger className="w-full md:w-[180px]">
                            <SelectValue placeholder="Periodo de tiempo" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="today">Hoy</SelectItem>
                            <SelectItem value="last-7">Últimos 7 días</SelectItem>
                            <SelectItem value="last-30">Últimos 30 días</SelectItem>
                            <SelectItem value="this-month">Este mes</SelectItem>
                            <SelectItem value="last-month">Mes anterior</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Main KPIs */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <SummaryCard title="TOTAL DE RESERVAS" value={totalReservations.toString()} change={getChange(totalReservations, prevTotalReservations)} icon={Calendar} isLoading={isLoading} />
                <SummaryCard title="FACTOR DE OCUPACIÓN" value="78.5%" change="+5% que el mes pasado" icon={Percent} isLoading={isLoading} />
                <SummaryCard title="NUEVOS CLIENTES" value={newClients.toString()} change={getChange(newClients, prevNewClients)} icon={Users} isLoading={isLoading} />
                <SummaryCard title="VENTAS FACTURADAS" value={`$${totalSales.toLocaleString('es-CL')}`} change={getChange(totalSales, prevTotalSales)} icon={DollarSign} isLoading={isLoading} />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Online Payments */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center"><Wallet className="mr-2 h-5 w-5"/> Pagos en línea</CardTitle>
                        <CardDescription>Resumen de transacciones digitales.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-baseline">
                            <span className="text-4xl font-bold text-primary">$1,890,340</span>
                            <span className="text-sm text-green-500">+15%</span>
                        </div>
                        <Progress value={65} />
                        <div className="text-sm text-muted-foreground">
                            <p>65% del total de ventas facturadas.</p>
                            <p>Tasa de aprobación del 99.2%.</p>
                        </div>
                    </CardContent>
                </Card>

                {/* Occupancy Rate */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center"><BarChartHorizontal className="mr-2 h-5 w-5"/> Factor de ocupación</CardTitle>
                        <CardDescription>Ocupación por profesional en el periodo.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <ResponsiveContainer width="100%" height={180}>
                            <RechartsBarChart data={occupancyData} layout="vertical" margin={{ top: 5, right: 20, left: 40, bottom: 5 }}>
                                <XAxis type="number" hide />
                                <YAxis type="category" dataKey="professional" width={80} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                                <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
                                <Bar dataKey="occupancy" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} background={{ fill: 'hsl(var(--muted))', radius: 4 }} />
                            </RechartsBarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
                
                {/* Reservation Source */}
                <Card>
                    <CardHeader>
                        <CardTitle>Origen de las reservas</CardTitle>
                        <CardDescription>Canales de adquisición de citas.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={180}>
                            <RechartsPieChart>
                                <Pie data={reservationSourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} label>
                                    {reservationSourceData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}/>
                                <Legend iconSize={10} />
                            </RechartsPieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Invoiced Sales */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center"><DollarSign className="mr-2 h-5 w-5"/> Ventas Facturadas</CardTitle>
                        <CardDescription>Desglose de ventas por categoría.</CardDescription>
                    </CardHeader>
                     <CardContent>
                         <ResponsiveContainer width="100%" height={180}>
                            <RechartsBarChart data={salesData} layout="vertical" margin={{ top: 5, right: 50, left: 20, bottom: 5 }}>
                                <XAxis type="number" tickFormatter={(value) => `$${Number(value) / 1000}k`} tick={{ fontSize: 10 }} />
                                <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                                <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}/>
                                <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} background={{ fill: 'hsl(var(--muted))', radius: 4 }}>
                                    {salesData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </RechartsBarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* WhatsApp Reminders */}
                <Card>
                     <CardHeader>
                        <CardTitle className="flex items-center"><MessageSquare className="mr-2 h-5 w-5"/> Recordatorios por WhatsApp</CardTitle>
                         <CardDescription>Estado de entrega de los mensajes.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <div className="flex justify-between mb-1">
                                <span className="text-sm font-medium text-green-600 flex items-center"><CheckCircle className="mr-1.5 h-4 w-4"/> Entregados</span>
                                <span className="text-sm font-medium text-green-600">139 (94.5%)</span>
                            </div>
                            <Progress value={94.5} className="h-2 [&>div]:bg-green-500" />
                        </div>
                         <div>
                            <div className="flex justify-between mb-1">
                                <span className="text-sm font-medium text-red-600 flex items-center"><CheckCircle className="mr-1.5 h-4 w-4"/> Fallidos</span>
                                <span className="text-sm font-medium text-red-600">5 (3.4%)</span>
                            </div>
                            <Progress value={3.4} className="h-2 [&>div]:bg-red-500" />
                        </div>
                    </CardContent>
                </Card>
                
                 {/* Email Reminders */}
                <Card className="flex flex-col">
                     <CardHeader>
                        <CardTitle className="flex items-center"><Send className="mr-2 h-5 w-5"/> Recordatorios por email</CardTitle>
                         <CardDescription>Resumen de envíos y aperturas.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 flex-grow">
                         <div className="text-sm"><strong>Enviados:</strong> 1,150</div>
                         <div className="text-sm"><strong>Tasa de Apertura:</strong> 62%</div>
                         <div className="text-sm"><strong>Tasa de Clics:</strong> 18%</div>
                    </CardContent>
                    <div className="p-6 pt-0 mt-auto">
                        <Button className="w-full">Ver reporte detallado</Button>
                    </div>
                </Card>
            </div>
        </div>
    )
}
