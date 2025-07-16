
'use client';

import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Filter, Gift, DollarSign } from "lucide-react";

const mockTips = [
    { id: '#3883', saleId: 'V001', date: '2025-07-15 07:03 pm', location: 'VATOS ALFA Barber Shop', client: 'Sandra Sanchez', professional: 'El Patrón', tip: 1000 },
    { id: '#3879', saleId: 'V002', date: '2025-07-15 05:14 pm', location: 'VATOS ALFA Barber Shop', client: 'Luis Angel Martinez', professional: 'El Sicario', tip: 1400 },
    { id: '#3876', saleId: 'V003', date: '2025-07-15 03:27 pm', location: 'VATOS ALFA Barber Shop', client: 'Aldo Faraz', professional: 'El Sicario', tip: 1400 },
    { id: '#3873', saleId: 'V004', date: '2025-07-15 01:43 pm', location: 'VATOS ALFA Barber Shop', client: 'Pablo Fiores', professional: 'El Padrino', tip: 1700 },
    { id: '#3872', saleId: 'V005', date: '2025-07-15 01:10 pm', location: 'VATOS ALFA Barber Shop', client: 'David Flores', professional: 'El Padrino', tip: 3290 },
    { id: '#3871', saleId: 'V006', date: '2025-07-15 11:53 am', location: 'VATOS ALFA Barber Shop', client: 'Dariel Siva', professional: 'El Patrón', tip: 2100 },
    { id: '#3864', saleId: 'V007', date: '2025-07-14 05:25 pm', location: 'VATOS ALFA Barber Shop', client: 'Antonio Castellano', professional: 'Barbero Extra', tip: 2800 },
];

const totalTips = mockTips.reduce((acc, item) => acc + item.tip, 0);

export default function TipsPage() {

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">Propinas</h2>
        </div>
        
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" /> Filtros</CardTitle>
                <CardDescription>Filtra el registro de propinas por diferentes criterios.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Periodo</label>
                        <Select><SelectTrigger><SelectValue placeholder="Últimos 7 días" /></SelectTrigger><SelectContent /></Select>
                    </div>
                    <div className="space-y-2">
                         <label className="text-sm font-medium">Local</label>
                        <Select><SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger><SelectContent /></Select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Profesional</label>
                        <Select><SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger><SelectContent /></Select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Venta</label>
                        <Select><SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger><SelectContent /></Select>
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card>
             <CardHeader className="flex-row items-center justify-between">
                <div>
                    <CardTitle>Registro de Propinas</CardTitle>
                    <CardDescription>Detalle de las propinas recibidas en el período seleccionado.</CardDescription>
                </div>
                <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Generar reporte</Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>Venta</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Local</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Profesional</TableHead>
                            <TableHead className="text-right">Propina</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {mockTips.map((tip) => (
                            <TableRow key={tip.id}>
                                <TableCell className="font-mono text-xs">{tip.id}</TableCell>
                                <TableCell className="font-mono text-xs">{tip.saleId}</TableCell>
                                <TableCell>{tip.date}</TableCell>
                                <TableCell>{tip.location}</TableCell>
                                <TableCell>{tip.client}</TableCell>
                                <TableCell>{tip.professional}</TableCell>
                                <TableCell className="text-right font-semibold">${tip.tip.toLocaleString('es-CL')}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter>
                        <TableRow className="bg-muted/50">
                            <TableHead colSpan={6} className="text-right font-bold text-lg">Total Propinas</TableHead>
                            <TableHead className="text-right font-bold text-lg text-primary">${totalTips.toLocaleString('es-CL')}</TableHead>
                        </TableRow>
                    </TableFooter>
                </Table>
            </CardContent>
        </Card>
    </div>
  );
}
