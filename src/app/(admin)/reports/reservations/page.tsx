
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, LineChart as RechartsLineChart, XAxis, YAxis, Tooltip, Legend, BarChart as RechartsBarChart, Bar, CartesianGrid, Line } from 'recharts';
import { Calendar as CalendarIcon, Search, CheckCircle, XCircle, Clock, AlertTriangle, Users, BookOpen, DollarSign, BarChart, LineChartIcon, PieChartIcon, Loader2 } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Reservation, Service, Profesional } from '@/lib/types';
import { where } from 'firebase/firestore';

const reservationStatuses = [
    { id: 'Reservado', label: 'Reservado', icon: <BookOpen className="h-4 w-4 mr-2" /> },
    { id: 'Confirmado', label: 'Confirmado', icon: <CheckCircle className="h-4 w-4 mr-2" /> },
    { id: 'Asiste', label: 'Asiste', icon: <Users className="h-4 w-4 mr-2" /> },
    { id: 'No asiste', label: 'No asiste', icon: <XCircle className="h-4 w-4 mr-2" /> },
    { id: 'Cancelado', label: 'Cancelado', icon: <AlertTriangle className="h-4 w-4 mr-2" /> },
    { id: 'En espera', label: 'En espera', icon: <Clock className="h-4 w-4 mr-2" /> },
    { id: 'Pendiente', label: 'Pendiente', icon: <Clock className="h-4 w-4 mr-2" /> },
];

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];
const DAY_COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#a4de6c', '#d0ed57', '#ffc658'];


const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-background/80 backdrop-blur-sm p-2 border border-border rounded-lg shadow-lg">
                <p className="font-bold">{`${label}`}</p>
                {payload.map((pld: any, index: number) => (
                    <div key={index} style={{ color: pld.color }}>
                        {`${pld.name}: ${pld.value}`}
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

export default function ReservationsReportPage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });
    const [statusFilter, setStatusFilter] = useState('todos');
    const [professionalFilter, setProfessionalFilter] = useState('todos');
    const [serviceFilter, setServiceFilter] = useState('todos');
    const [activeFilters, setActiveFilters] = useState({ dateRange, status: statusFilter, professional: professionalFilter, service: serviceFilter });

    const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');

    const reservationQueryConstraints = useMemo(() => {
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
            constraints.push(where('items', 'array-contains', { servicio: activeFilters.service }))
        }

        return constraints;
    }, [activeFilters]);

    const { data: reservations, loading: reservationsLoading } = useFirestoreQuery<Reservation>('reservas', JSON.stringify(activeFilters), ...reservationQueryConstraints);

    const isLoading = reservationsLoading || servicesLoading || professionalsLoading;

    const handleSearch = () => {
        setActiveFilters({
            dateRange,
            status: statusFilter,
            professional: professionalFilter,
            service: serviceFilter,
        });
    }

    const { totalReservations, totalRevenue, serviceRankingData, reservationsByDayData, reservationsByHourData, dayCount } = useMemo(() => {
        if (isLoading) return { totalReservations: 0, totalRevenue: 0, serviceRankingData: [], reservationsByDayData: [], reservationsByHourData: [], dayCount: {} };

        const serviceCount: Record<string, number> = {};
        const localDayCount: Record<string, number> = { 'Lunes': 0, 'Martes': 0, 'Miércoles': 0, 'Jueves': 0, 'Viernes': 0, 'Sábado': 0, 'Domingo': 0 };
        const hourCount: Record<string, Record<string, number>> = {};

        reservations.forEach(res => {
            if (res.items && Array.isArray(res.items)) {
                res.items.forEach(item => {
                    const serviceName = item.servicio || 'Desconocido';
                    serviceCount[serviceName] = (serviceCount[serviceName] || 0) + 1;
                });
            }

            try {
                const date = parseISO(res.fecha);
                const dayName = format(date, 'EEEE', { locale: es });
                localDayCount[dayName] = (localDayCount[dayName] || 0) + 1;

                const startHour = res.hora_inicio.substring(0, 2) + ':00';
                if (!hourCount[startHour]) {
                    hourCount[startHour] = { 'Lunes': 0, 'Martes': 0, 'Miércoles': 0, 'Jueves': 0, 'Viernes': 0, 'Sábado': 0, 'Domingo': 0 };
                }
                hourCount[startHour][dayName] = (hourCount[startHour][dayName] || 0) + 1;

            } catch (e) {
                console.warn("Invalid date format in reservation:", res);
            }
        });

        const sortedServices = Object.entries(serviceCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

        const hourKeys = Object.keys(hourCount).sort();
        const formattedHourData = hourKeys.map(hour => ({
            hour,
            ...hourCount[hour]
        }));


        return {
            totalReservations: reservations.length,
            totalRevenue: reservations.reduce((acc, r) => acc + (r.precio || 0), 0),
            serviceRankingData: sortedServices.map(([name, value]) => ({ name, value })),
            reservationsByDayData: Object.entries(localDayCount).map(([name, value]) => ({ name, value })),
            reservationsByHourData: formattedHourData,
            dayCount: localDayCount
        };
    }, [reservations, isLoading]);


    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Reporte de reservas</h2>

            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-wrap items-center gap-4 mb-4">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button id="date" variant={"outline"} className={cn("w-[260px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (
                                        dateRange.to ? (
                                            <>{format(dateRange.from, "LLL dd, y", { locale: es })} - {format(dateRange.to, "LLL dd, y", { locale: es })}</>
                                        ) : (
                                            format(dateRange.from, "LLL dd, y", { locale: es })
                                        )
                                    ) : (
                                        <span>Periodo de tiempo</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} />
                            </PopoverContent>
                        </Popover>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Estado" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos los estados</SelectItem>
                                {reservationStatuses.map(status => (
                                    <SelectItem key={status.id} value={status.id}>{status.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={professionalFilter} onValueChange={setProfessionalFilter} disabled={professionalsLoading}>
                            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Profesional" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos</SelectItem>
                                {professionals.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={serviceFilter} onValueChange={setServiceFilter} disabled={servicesLoading}>
                            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Servicio" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos</SelectItem>
                                {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Button onClick={handleSearch} disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />} Buscar
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <main className="lg:col-span-4 space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Cantidad de reservas</CardTitle>
                                <BookOpen className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <div className="text-2xl font-bold">{totalReservations}</div>}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Recaudación</CardTitle>
                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <div className="text-2xl font-bold">${totalRevenue.toLocaleString('es-CL')}</div>}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader><CardTitle className="flex items-center"><PieChartIcon className="mr-2 h-5 w-5" /> Ranking servicios utilizados</CardTitle></CardHeader>
                            <CardContent>
                                {isLoading ? <div className="flex justify-center items-center h-[250px]"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
                                    <ResponsiveContainer width="100%" height={250}>
                                        <RechartsBarChart layout="vertical" data={serviceRankingData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                            <XAxis type="number" hide />
                                            <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 12 }} />
                                            <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
                                            <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                                                {serviceRankingData.map((_, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Bar>
                                        </RechartsBarChart>
                                    </ResponsiveContainer>
                                )}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle className="flex items-center"><PieChartIcon className="mr-2 h-5 w-5" /> Reservas por día de la semana</CardTitle></CardHeader>
                            <CardContent>
                                {isLoading ? <div className="flex justify-center items-center h-[250px]"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
                                    <ResponsiveContainer width="100%" height={250}>
                                        <RechartsPieChart>
                                            <Pie data={reservationsByDayData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                                                {reservationsByDayData.map((_, index) => (
                                                    <Cell key={`cell-${index}`} fill={DAY_COLORS[index % DAY_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip content={<CustomTooltip />} />
                                            <Legend iconSize={10} />
                                        </RechartsPieChart>
                                    </ResponsiveContainer>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader><CardTitle className="flex items-center"><LineChartIcon className="mr-2 h-5 w-5" /> Reservas por hora por día</CardTitle></CardHeader>
                        <CardContent>
                            {isLoading ? <div className="flex justify-center items-center h-[300px]"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
                                <ResponsiveContainer width="100%" height={300}>
                                    <RechartsLineChart data={reservationsByHourData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="hour" />
                                        <YAxis />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend />
                                        {Object.keys(dayCount).map((day, index) => (
                                            <Line key={day} type="monotone" dataKey={day} stroke={DAY_COLORS[index % DAY_COLORS.length]} />
                                        ))}
                                    </RechartsLineChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>
                </main>
            </div>
        </div>
    )
}
