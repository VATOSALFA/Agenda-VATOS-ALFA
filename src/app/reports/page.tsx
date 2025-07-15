
'use client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, LineChart, PieChart, Users, Wallet } from "lucide-react";
import { Bar, BarChart as RechartsBarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, Pie, PieChart as RechartsPieChart, Cell, Line, LineChart as RechartsLineChart } from 'recharts';
import { useState, useEffect } from "react";

const reservationSourceData = [
    { name: 'Agenda Online', value: 400 },
    { name: 'En Línea (App)', value: 300 },
    { name: 'WhatsApp', value: 200 },
    { name: 'Walk-in', value: 100 },
];

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

export default function ReportsPage() {
    const [salesData, setSalesData] = useState<any[]>([]);

    useEffect(() => {
        // Generate random data on the client-side to avoid hydration errors
        const generateSalesData = () => [
            { day: 'Lunes', total: Math.floor(Math.random() * 200000) + 100000 },
            { day: 'Martes', total: Math.floor(Math.random() * 200000) + 100000 },
            { day: 'Miércoles', total: Math.floor(Math.random() * 200000) + 100000 },
            { day: 'Jueves', total: Math.floor(Math.random() * 200000) + 100000 },
            { day: 'Viernes', total: Math.floor(Math.random() * 200000) + 100000 },
            { day: 'Sábado', total: Math.floor(Math.random() * 200000) + 100000 },
            { day: 'Domingo', total: Math.floor(Math.random() * 50000) + 10000 },
        ];
        setSalesData(generateSalesData());
    }, []);


    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Reportes y Métricas</h2>
            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="overview">Vista General</TabsTrigger>
                    <TabsTrigger value="reservas">Reporte de Reservas</TabsTrigger>
                    <TabsTrigger value="ventas">Reporte de Ventas</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Factor de Ocupación</CardTitle>
                                <BarChart className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">78.5%</div>
                                <p className="text-xs text-muted-foreground">+5% que la semana pasada</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Ingresos por Canal</CardTitle>
                                <Wallet className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">$4,231,560</div>
                                <p className="text-xs text-muted-foreground">Agenda Online es el canal principal</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Nuevos Clientes</CardTitle>
                                <Users className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">+52</div>
                                <p className="text-xs text-muted-foreground">+15.2% este mes</p>
                            </CardContent>
                        </Card>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                        <Card className="col-span-4">
                            <CardHeader>
                                <CardTitle>Ventas por Día</CardTitle>
                                <CardDescription>Total de ventas durante la última semana.</CardDescription>
                            </CardHeader>
                            <CardContent className="pl-2">
                                {salesData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={350}>
                                    <RechartsBarChart data={salesData}>
                                        <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${Number(value) / 1000}k`} />
                                        <Tooltip cursor={{ fill: 'hsla(var(--primary), 0.1)' }} contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}/>
                                        <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                                    </RechartsBarChart>
                                </ResponsiveContainer>
                                ) : (
                                    <div className="h-[350px] w-full flex items-center justify-center">
                                        <p className="text-muted-foreground">Cargando datos...</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                        <Card className="col-span-3">
                            <CardHeader>
                                <CardTitle>Origen de Reservas</CardTitle>
                                <CardDescription>Canales de adquisición de citas.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={350}>
                                    <RechartsPieChart>
                                        <Pie data={reservationSourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120} label>
                                            {reservationSourceData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
                                        <Legend />
                                    </RechartsPieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
                <TabsContent value="reservas">
                    <Card>
                        <CardHeader>
                            <CardTitle>Reporte Detallado de Reservas</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-muted-foreground">Aquí iría un reporte detallado de reservas...</p>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="ventas">
                    <Card>
                        <CardHeader>
                            <CardTitle>Reporte Detallado de Ventas</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">Aquí iría un reporte detallado de ventas...</p>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
