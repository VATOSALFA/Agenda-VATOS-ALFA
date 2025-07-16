
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
import { Calendar as CalendarIcon, Download, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

const mockStockMovements = [
    { id: 'sm001', date: '2025-07-17 11:10', location: 'VATOS ALFA Barber Shop', product: 'SHAMPOO CRECIMIENTO ACELERADO', presentation: '500 ml', from: 4, to: 14, cause: 'Cambio de stock desde administrador', staff: 'Admin', comment: '1 en utilización sin entrar en el conteo' },
    { id: 'sm002', date: '2025-07-17 11:09', location: 'VATOS ALFA Barber Shop', product: 'SERUM CRECIMIENTO CAPILAR 7% MINOXIDIL', presentation: '50 ml', from: 1, to: 15, cause: 'Cambio de stock desde administrador', staff: 'Admin', comment: 'Se agregaron 14 el día 17.07.25' },
    { id: 'sm003', date: '2025-07-12 11:21', location: 'VATOS ALFA Barber Shop', product: 'SERUM CRECIMIENTO CAPILAR 7% MINOXIDIL', presentation: '50 ml', from: 3, to: 1, cause: 'Venta a cliente', staff: 'Lupita', comment: '' },
    { id: 'sm004', date: '2025-07-11 21:53', location: 'VATOS ALFA Barber Shop', product: 'Polvo textura', presentation: '20gr', from: 6, to: 5, cause: 'Venta a cliente', staff: 'Beatriz Elizarra', comment: '' },
    { id: 'sm005', date: '2025-07-11 21:51', location: 'VATOS ALFA Barber Shop', product: 'Polvo textura', presentation: '20gr', from: 7, to: 6, cause: 'Eliminación de venta a cliente', staff: 'Beatriz Elizarra', comment: '' },
    { id: 'sm006', date: '2025-07-09 21:15', location: 'VATOS ALFA Barber Shop', product: 'SHAMPOO CRECIMIENTO ACELERADO', presentation: '500 ml', from: 5, to: 4, cause: 'Venta a cliente', staff: 'Azucena Sánchez', comment: '' },
];


const AdjustmentCell = ({ from, to }: { from: number, to: number }) => {
    const isIncrease = to > from;
    return (
        <div className={cn("flex items-center gap-2", isIncrease ? "text-green-600" : "text-red-600")}>
            {isIncrease ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            <span className="font-semibold">De {from} a {to}</span>
        </div>
    )
}


export default function StockMovementPage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>();

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Movimientos de stock</h2>
            
            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle>Filtros</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                    <Select><SelectTrigger><SelectValue placeholder="Categoría" /></SelectTrigger><SelectContent /></Select>
                    <Select><SelectTrigger><SelectValue placeholder="Productos" /></SelectTrigger><SelectContent /></Select>
                </CardContent>
            </Card>

            {/* Main Table */}
            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <div>
                        <CardTitle>Movimientos de stock</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Descargar</Button>
                    </div>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Local</TableHead>
                                <TableHead>Producto</TableHead>
                                <TableHead>Formato/Presentación</TableHead>
                                <TableHead>Ajuste</TableHead>
                                <TableHead>Causa</TableHead>
                                <TableHead>Staff</TableHead>
                                <TableHead>Comentario</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {mockStockMovements.map((movement) => (
                                <TableRow key={movement.id}>
                                    <TableCell>{movement.date}</TableCell>
                                    <TableCell>{movement.location}</TableCell>
                                    <TableCell className="font-medium">{movement.product}</TableCell>
                                    <TableCell>{movement.presentation}</TableCell>
                                    <TableCell>
                                        <AdjustmentCell from={movement.from} to={movement.to} />
                                    </TableCell>
                                    <TableCell>{movement.cause}</TableCell>
                                    <TableCell>{movement.staff}</TableCell>
                                    <TableCell>{movement.comment}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

        </div>
    );
}
