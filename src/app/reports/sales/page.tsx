
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, BarChart, XAxis, YAxis, Tooltip, Bar, LineChart, Line, Legend, CartesianGrid } from 'recharts';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from "@/lib/utils";

const salesOverTimeData = [
  { date: '14/06', current: 4000, previous: 2400 },
  { date: '21/06', current: 3000, previous: 1398 },
  { date: '28/06', current: 2000, previous: 9800 },
  { date: '05/07', current: 2780, previous: 3908 },
  { date: '12/07', current: 1890, previous: 4800 },
  { date: '19/07', current: 2390, previous: 3800 },
  { date: '26/07', current: 3490, previous: 4300 },
];

const salesByCategoryData = [
    { name: 'Cortes y lavado', value: 75869, change: 1.1 },
    { name: 'Paquetes', value: 11220, change: 25.5 },
    { name: 'Barba', value: 1875, change: -18.3 },
    { name: 'Capilar', value: 1500, change: 0 },
    { name: 'Facial', value: 1500, change: 21.9 },
];

const salesByServiceData = [
    { name: 'Corte clásico y moderno', value: 75789, change: 1.1 },
    { name: 'El Caballero Alfa', value: 4114, change: -14.7 },
    { name: 'Héroe en descanso', value: 2031, change: 82.4 },
];

const KpiCard = ({ title, value, change, isPositive }: { title: string, value: string, change: string, isPositive: boolean }) => (
    <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-3xl font-bold">{value}</p>
        <p className={cn("text-xs flex items-center", isPositive ? 'text-green-500' : 'text-red-500')}>
            {isPositive ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
            {change}
        </p>
    </div>
);

const CustomBarLabel = ({ x, y, width, value }: any) => {
    return (
        <text x={x + width + 10} y={y + 10} fill="hsl(var(--foreground))" textAnchor="start" fontSize={12}>
            {`$${value.toLocaleString('es-CL')}`}
        </text>
    );
};

export default function SalesReportPage() {

    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Reporte de ventas</h2>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Periodo</label>
                            <Select defaultValue="last-4-weeks"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="last-4-weeks">Últimas 4 semanas</SelectItem></SelectContent></Select>
                        </div>
                         <div className="space-y-1">
                            <label className="text-sm font-medium">Local</label>
                            <Select><SelectTrigger><SelectValue placeholder="Seleccione una opción" /></SelectTrigger><SelectContent/></Select>
                        </div>
                         <div className="space-y-1">
                            <label className="text-sm font-medium">Comparar contra</label>
                            <Select defaultValue="previous-period"><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="previous-period">Periodo anterior</SelectItem></SelectContent></Select>
                        </div>
                    </div>
                </CardContent>
            </Card>
            
            <Card>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
                    {/* KPIs */}
                    <div className="lg:col-span-1">
                        <h3 className="text-xl font-semibold mb-4">Resumen</h3>
                        <div className="space-y-6">
                           <KpiCard title="Total" value="$96,376.1" change="8.5%" isPositive={true} />
                           <KpiCard title="Cantidad de ventas" value="558" change="5.7%" isPositive={true} />
                           <KpiCard title="Venta promedio" value="$172.72" change="2.6%" isPositive={true} />
                        </div>
                    </div>

                    {/* Line Chart */}
                    <div className="lg:col-span-2">
                        <h3 className="text-xl font-semibold mb-4">Ventas por periodo</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={salesOverTimeData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                                <YAxis tickFormatter={(value) => `${value/1000}k`} tick={{ fontSize: 12 }} />
                                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
                                <Legend iconSize={10} wrapperStyle={{fontSize: "12px"}}/>
                                <Line type="monotone" name="Periodo seleccionado" dataKey="current" stroke="hsl(var(--primary))" strokeWidth={2} />
                                <Line type="monotone" name="Periodo comparativo" dataKey="previous" stroke="hsl(var(--secondary))" strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <Card>
                    <CardHeader>
                        <CardTitle>Ventas por categoría</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={salesByCategoryData} layout="vertical" margin={{ left: 60 }}>
                                <XAxis type="number" hide />
                                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                                <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
                                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={20} label={<CustomBarLabel />} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Ventas por servicio</CardTitle>
                    </CardHeader>
                    <CardContent>
                         <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={salesByServiceData} layout="vertical" margin={{ left: 120 }}>
                                <XAxis type="number" hide />
                                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                                <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
                                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={20} label={<CustomBarLabel />} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>


        </div>
    );
}
