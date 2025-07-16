
'use client';

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoreHorizontal, Search, Download, Plus, Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pie, PieChart as RechartsPieChart, ResponsiveContainer, Cell, Tooltip, Legend } from 'recharts';
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Skeleton } from "@/components/ui/skeleton";

const DonutChartCard = ({ title, data, total }: { title: string, data: any[], total: number }) => {
    const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 items-center">
                <div className="h-48 relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={60}
                                fill="#8884d8"
                                paddingAngle={2}
                                dataKey="value"
                                labelLine={false}
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'hsl(var(--background))',
                                    border: '1px solid hsl(var(--border))'
                                }}
                            />
                        </RechartsPieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center flex-col">
                        <span className="text-2xl font-bold">${total.toLocaleString('es-CL')}</span>
                    </div>
                </div>
                <div className="text-sm">
                    <ul>
                        {data.map((item, index) => (
                            <li key={index} className="flex justify-between items-center py-1 border-b">
                                <div className="flex items-center">
                                    <span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                                    <span>{item.name}</span>
                                </div>
                                <span>${item.value.toLocaleString('es-CL')}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </CardContent>
        </Card>
    )
}

const mockSales = [
    { id: 'V001', fecha: '2025-07-15', local: 'Principal', cliente: 'Juan Perez', comprobante: 'Boleta #123', detalle: 'Corte Vatos', monto: 10000, descuento: 0 },
    { id: 'V002', fecha: '2025-07-15', local: 'Principal', cliente: 'Carlos Gomez', comprobante: 'Boleta #124', detalle: 'Afeitado Alfa + Cera', monto: 28980, descuento: 2000 },
    { id: 'V003', fecha: '2025-07-14', local: 'Norte', cliente: 'Luis Rodriguez', comprobante: 'Boleta #125', detalle: 'Corte y Barba', monto: 18000, descuento: 0 },
];

export default function InvoicedSalesPage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [salesData, setSalesData] = useState<any | null>(null);

    useEffect(() => {
        // Simulate data loading and avoid hydration errors
        setTimeout(() => {
            setSalesData({
                totalSales: {
                    data: [
                        { name: 'Servicios', value: 2400000 },
                        { name: 'Productos', value: 750000 },
                        { name: 'Planes', value: 150000 },
                    ],
                    total: 3300000,
                },
                paymentMethods: {
                    data: [
                        { name: 'Efectivo', value: 1200000 },
                        { name: 'Tarjeta de Crédito', value: 900000 },
                        { name: 'Tarjeta de Débito', value: 1000000 },
                        { name: 'Transferencia', value: 200000 },
                    ],
                    total: 3300000,
                },
            });
        }, 1000);
    }, []);

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Ventas Facturadas</h2>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"} className="justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (
                                    dateRange.to ? (
                                        `${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`
                                    ) : (
                                        format(dateRange.from, "LLL dd, y")
                                    )
                                ) : (
                                    <span>Seleccionar rango</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2} />
                        </PopoverContent>
                    </Popover>
                    <Select><SelectTrigger><SelectValue placeholder="Todas las sucursales" /></SelectTrigger><SelectContent /></Select>
                    <Select><SelectTrigger><SelectValue placeholder="Todos los métodos de pago" /></SelectTrigger><SelectContent /></Select>
                    <Select><SelectTrigger><SelectValue placeholder="Todos los comprobantes" /></SelectTrigger><SelectContent /></Select>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Buscar por cliente, folio..." className="pl-10" />
                    </div>
                </CardContent>
            </Card>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                {salesData ? (
                    <>
                        <DonutChartCard title="Ventas Facturadas Totales" data={salesData.totalSales.data} total={salesData.totalSales.total} />
                        <DonutChartCard title="Medios de Pago" data={salesData.paymentMethods.data} total={salesData.paymentMethods.total} />
                    </>
                ) : (
                    <>
                        <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
                        <Card><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
                    </>
                )}
            </div>

            {/* Sales Table */}
            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <div>
                        <CardTitle>Pagos</CardTitle>
                        <CardDescription>Listado de ventas facturadas en el período seleccionado.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Descargar pagos</Button>
                        <Button><Plus className="mr-2 h-4 w-4" /> Nueva venta</Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="pagos">
                        <TabsList>
                            <TabsTrigger value="pagos">Pagos</TabsTrigger>
                            <TabsTrigger value="ventas-internas" disabled>Ventas Internas</TabsTrigger>
                        </TabsList>
                        <TabsContent value="pagos">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>ID</TableHead>
                                        <TableHead>Fecha de pago</TableHead>
                                        <TableHead>Local</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Comprobante</TableHead>
                                        <TableHead>Detalle</TableHead>
                                        <TableHead>Monto Facturado</TableHead>
                                        <TableHead>Descuento</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {mockSales.map((sale) => (
                                        <TableRow key={sale.id}>
                                            <TableCell className="font-medium">{sale.id}</TableCell>
                                            <TableCell>{format(new Date(sale.fecha), 'PP', { locale: es })}</TableCell>
                                            <TableCell>{sale.local}</TableCell>
                                            <TableCell>{sale.cliente}</TableCell>
                                            <TableCell>{sale.comprobante}</TableCell>
                                            <TableCell>{sale.detalle}</TableCell>
                                            <TableCell>${sale.monto.toLocaleString('es-CL')}</TableCell>
                                            <TableCell>${sale.descuento.toLocaleString('es-CL')}</TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem>Ver Detalle</DropdownMenuItem>
                                                        <DropdownMenuItem>Anular Venta</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <div className="flex justify-end font-bold text-lg pt-4 pr-4">
                                Total: $56,980
                            </div>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

        </div>
    );
}
