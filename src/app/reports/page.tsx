
'use client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Bar, BarChart as RechartsBarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Pie, PieChart as RechartsPieChart, Cell } from 'recharts';
import { Calendar, BarChartHorizontal, Users, DollarSign, Wallet, Percent, MessageSquare, Send, CheckCircle } from "lucide-react";

const reservationSourceData = [
    { name: 'Agenda Online', value: 400 },
    { name: 'En Línea (App)', value: 300 },
    { name: 'WhatsApp', value: 200 },
    { name: 'Walk-in', value: 100 },
];
const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

const occupancyData = [
  { professional: 'El Patrón', occupancy: 85 },
  { professional: 'El Sicario', occupancy: 78 },
  { professional: 'El Padrino', occupancy: 92 },
  { professional: 'Extra', occupancy: 65 },
];

const salesData = [
    { name: 'Servicios', value: 750000 },
    { name: 'Productos', value: 250000 },
];

const SummaryCard = ({ title, value, change, icon: Icon }: { title: string, value: string, change?: string, icon: React.ElementType }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
            {change && <p className="text-xs text-muted-foreground">{change}</p>}
        </CardContent>
    </Card>
);

export default function ReportsPage() {
    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Resumen</h2>
                <div className="flex items-center space-x-2">
                    <Select defaultValue="last-30">
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
                <SummaryCard title="TOTAL DE RESERVAS" value="1,254" change="+120 que el mes pasado" icon={Calendar} />
                <SummaryCard title="FACTOR DE OCUPACIÓN" value="78.5%" change="+5% que el mes pasado" icon={Percent} />
                <SummaryCard title="NUEVOS CLIENTES" value="52" change="+15.2% este mes" icon={Users} />
                <SummaryCard title="VENTAS FACTURADAS" value="$4,231,560" change="+20.1% desde el mes pasado" icon={DollarSign} />
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
                                <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} background={{ fill: 'hsl(var(--muted))', radius: 4 }} />
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
