
'use client';

import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Search, Download, Briefcase, FileText, ShoppingBag, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

const mockCommissions = [
    { id: '1', professional: 'El Patrón', totalSales: 750000, commissionAmount: 75000, internalSales: 50000 },
    { id: '2', professional: 'El Sicario', totalSales: 680000, commissionAmount: 68000, internalSales: 25000 },
    { id: '3', professional: 'El Padrino', totalSales: 820000, commissionAmount: 82000, internalSales: 100000 },
    { id: '4', professional: 'Barbero Extra', totalSales: 550000, commissionAmount: 55000, internalSales: 0 },
];

const totalSales = mockCommissions.reduce((acc, item) => acc + item.totalSales, 0);
const totalCommission = mockCommissions.reduce((acc, item) => acc + item.commissionAmount, 0);

export default function CommissionsPage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>();

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">Reporte de Comisiones</h2>
        </div>
        
        {/* Filters */}
        <Card>
            <CardHeader>
                <CardTitle>Filtros</CardTitle>
                <CardDescription>Selecciona los filtros para generar el reporte de comisiones.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Periodo de tiempo</label>
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
                                        <span>Seleccionar rango</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} />
                            </PopoverContent>
                        </Popover>
                    </div>
                    <div className="space-y-2">
                         <label className="text-sm font-medium">Locales</label>
                        <Select><SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger><SelectContent /></Select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Tipo de usuario</label>
                        <Select><SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger><SelectContent /></Select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Usuarios</label>
                        <Select><SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger><SelectContent /></Select>
                    </div>
                    <Button className="w-full lg:w-auto"><Search className="mr-2 h-4 w-4" /> Buscar</Button>
                </div>
            </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Ventas de servicios</CardTitle>
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">$1,850,000</div>
                    <p className="text-xs text-muted-foreground">Comisión: $185,000</p>
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Ventas de planes</CardTitle>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">$350,000</div>
                    <p className="text-xs text-muted-foreground">Comisión: $17,500</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Ventas de productos</CardTitle>
                    <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">$600,000</div>
                    <p className="text-xs text-muted-foreground">Comisión: $60,000</p>
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Cobros por ventas internas</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">$175,000</div>
                     <p className="text-xs text-muted-foreground">&nbsp;</p>
                </CardContent>
            </Card>
        </div>

        {/* Commissions Table */}
        <Card>
             <CardHeader className="flex-row items-center justify-between">
                <div>
                    <CardTitle>Comisiones por Profesional</CardTitle>
                    <CardDescription>Detalle de las comisiones generadas en el período seleccionado.</CardDescription>
                </div>
                <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Exportar</Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Profesional / Staff</TableHead>
                            <TableHead className="text-right">Ventas totales</TableHead>
                            <TableHead className="text-right">Monto comisión</TableHead>
                            <TableHead className="text-right">Ventas internas</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {mockCommissions.map((commission) => (
                            <TableRow key={commission.id}>
                                <TableCell className="font-medium">{commission.professional}</TableCell>
                                <TableCell className="text-right">${commission.totalSales.toLocaleString('es-CL')}</TableCell>
                                <TableCell className="text-right text-primary font-semibold">${commission.commissionAmount.toLocaleString('es-CL')}</TableCell>
                                <TableCell className="text-right">${commission.internalSales.toLocaleString('es-CL')}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter>
                        <TableRow className="bg-muted/50">
                            <TableHead className="text-right font-bold">Totales</TableHead>
                            <TableHead className="text-right font-bold">${totalSales.toLocaleString('es-CL')}</TableHead>
                            <TableHead className="text-right font-bold text-primary">${totalCommission.toLocaleString('es-CL')}</TableHead>
                            <TableHead></TableHead>
                        </TableRow>
                    </TableFooter>
                </Table>
            </CardContent>
        </Card>
    </div>
  );
}
