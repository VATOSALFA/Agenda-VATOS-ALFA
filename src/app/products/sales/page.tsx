
'use client';

import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar as CalendarIcon, Download, TrendingUp, TrendingDown, Package, DollarSign, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

const mockSalesData = [
    { product: 'SERUM COCTEL MULTINUTRIENTES', presentation: '30 ml', unitsSold: 15, revenue: 268500 },
    { product: 'SERUM CRECIMIENTO CAPILAR 7% MINOXIDIL', presentation: '50 ml', unitsSold: 12, revenue: 238800 },
    { product: 'MASCARILLA CARBON ACTIVADO', presentation: '50 gr', unitsSold: 10, revenue: 165000 },
    { product: 'SHAMPOO CRECIMIENTO ACELERADO', presentation: '500 ml', unitsSold: 8, revenue: 132000 },
    { product: 'JABÓN LÍQUIDO PURIFICANTE Y EXFOLIANTE', presentation: '120 ml', unitsSold: 5, revenue: 82500 },
];

const totalRevenue = mockSalesData.reduce((acc, item) => acc + item.revenue, 0);
const totalUnitsSold = mockSalesData.reduce((acc, item) => acc + item.unitsSold, 0);

const highestRevenueProduct = { name: 'SERUM COCTEL MULTINUTRIENTES', seller: 'El Patrón', amount: 268500 };
const lowestRevenueProduct = { name: 'JABÓN LÍQUIDO PURIFICANTE Y EXFOLIANTE', seller: 'Barbero Extra', amount: 82500 };


export default function ProductSalesPage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>();

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Venta de Productos</h2>
            
            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle>Filtros</CardTitle>
                    <CardDescription>Filtra las ventas por diferentes criterios.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <Popover>
                        <PopoverTrigger asChild>
                            <Button id="date" variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (
                                    dateRange.to ? (
                                        <>{format(dateRange.from, "LLL dd, y", {locale: es})} - {format(dateRange.to, "LLL dd, y", {locale: es})}</>
                                    ) : (
                                        format(dateRange.from, "LLL dd, y", {locale: es})
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
                    <Select><SelectTrigger><SelectValue placeholder="Estado del producto" /></SelectTrigger><SelectContent /></Select>
                    <Select><SelectTrigger><SelectValue placeholder="Productos" /></SelectTrigger><SelectContent /></Select>
                </CardContent>
            </Card>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">RECAUDACIÓN TOTAL</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${totalRevenue.toLocaleString('es-CL')}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">UNIDADES VENDIDAS</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalUnitsSold}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Mayor ingreso</CardTitle>
                        <TrendingUp className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg font-bold truncate">{highestRevenueProduct.name}</div>
                        <p className="text-xs text-muted-foreground">Vendedor: {highestRevenueProduct.seller}</p>
                        <p className="text-sm font-semibold text-primary">${highestRevenueProduct.amount.toLocaleString('es-CL')}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Menor ingreso</CardTitle>
                        <TrendingDown className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg font-bold truncate">{lowestRevenueProduct.name}</div>
                        <p className="text-xs text-muted-foreground">Vendedor: {lowestRevenueProduct.seller}</p>
                         <p className="text-sm font-semibold text-primary">${lowestRevenueProduct.amount.toLocaleString('es-CL')}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Main Table */}
            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <div>
                        <CardTitle>Detalle de la venta</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Descargar reporte</Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="por-productos">
                        <TabsList className="mb-4">
                            <TabsTrigger value="por-productos">Por productos</TabsTrigger>
                            <TabsTrigger value="por-vendedor">Por vendedor</TabsTrigger>
                        </TabsList>
                        <TabsContent value="por-productos">
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Producto</TableHead>
                                        <TableHead>Formato/Presentación</TableHead>
                                        <TableHead className="text-right">Unidades vendidas</TableHead>
                                        <TableHead className="text-right">Recaudación</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {mockSalesData.map((sale) => (
                                        <TableRow key={sale.product}>
                                            <TableCell className="font-medium">{sale.product}</TableCell>
                                            <TableCell>{sale.presentation}</TableCell>
                                            <TableCell className="text-right">{sale.unitsSold}</TableCell>
                                            <TableCell className="text-right font-semibold text-primary">${sale.revenue.toLocaleString('es-CL')}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="outline" size="sm">
                                                    <Eye className="mr-2 h-4 w-4" />
                                                    Ver detalles
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TabsContent>
                         <TabsContent value="por-vendedor">
                            <p className="text-muted-foreground text-center py-10">La tabla de ventas por vendedor estará disponible aquí.</p>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

        </div>
    );
}
