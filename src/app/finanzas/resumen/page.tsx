
'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PlusCircle, ShoppingCart } from 'lucide-react';
import { AddDepositoModal } from '@/components/finanzas/add-deposito-modal';
import { cn } from '@/lib/utils';


// Mock data for the whole year
const yearlyData = [
    { month: 'Ene', ingresos: 48000, egresos: 35000, utilidad: 13000 },
    { month: 'Feb', ingresos: 52000, egresos: 37000, utilidad: 15000 },
    { month: 'Mar', ingresos: 60000, egresos: 40000, utilidad: 20000 },
    { month: 'Abr', ingresos: 55000, egresos: 38000, utilidad: 17000 },
    { month: 'May', ingresos: 62000, egresos: 41000, utilidad: 21000 },
    { month: 'Jun', ingresos: 58000, egresos: 39000, utilidad: 19000 },
    { month: 'Jul', ingresos: 57341, egresos: 38721, utilidad: 14896 },
    { month: 'Ago', ingresos: 0, egresos: 0, utilidad: 0 },
    { month: 'Sep', ingresos: 0, egresos: 0, utilidad: 0 },
    { month: 'Oct', ingresos: 0, egresos: 0, utilidad: 0 },
    { month: 'Nov', ingresos: 0, egresos: 0, utilidad: 0 },
    { month: 'Dic', ingresos: 0, egresos: 0, utilidad: 0 },
];

const mockDeposits = [
    { fecha: '2024-07-15', monto: 10000, comentario: 'Adelanto socio' },
    { fecha: '2024-06-20', monto: 25000, comentario: 'Inversión inicial' },
];

const totalIngresosAnual = yearlyData.reduce((acc, data) => acc + data.ingresos, 0);
const totalEgresosAnual = yearlyData.reduce((acc, data) => acc + data.egresos, 0);
const subtotalUtilidadAnual = totalIngresosAnual - totalEgresosAnual;
const comisionBeatrizAnual = subtotalUtilidadAnual * 0.20;
const utilidadNetaAnual = subtotalUtilidadAnual - comisionBeatrizAnual;

// Product summary mock data for the year
const ventaProductosAnual = 560000;
const reinversionAnual = 175000;
const comisionProfesionalesAnual = 56000;
const utilidadVatosAlfaAnual = ventaProductosAnual - reinversionAnual - comisionProfesionalesAnual;


const ResumenGeneralItem = ({ label, amount, isBold, isPrimary, className }: { label: string, amount: number, isBold?: boolean, isPrimary?: boolean, className?: string }) => (
    <div className={cn("flex justify-between items-center text-lg py-2 border-b last:border-0", className)}>
        <span className={cn(isBold && 'font-semibold', isPrimary && 'text-primary')}>{label}</span>
        <span className={cn(isBold && 'font-bold', isPrimary && 'text-primary font-extrabold')}>{`$${amount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
    </div>
);


export default function FinanzasResumenPage() {
    const [isDepositoModalOpen, setIsDepositoModalOpen] = useState(false);

    return (
        <>
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Resumen Anual</h2>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle>Resumen General Anual</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                        <ResumenGeneralItem label="Ingreso Total" amount={totalIngresosAnual} />
                        <ResumenGeneralItem label="Egreso Total" amount={totalEgresosAnual} />
                        <ResumenGeneralItem label="Subtotal de utilidad" amount={subtotalUtilidadAnual} isBold />
                        <ResumenGeneralItem label="Comisión de Beatriz" amount={comisionBeatrizAnual} />
                        <ResumenGeneralItem label="Utilidad Neta" amount={utilidadNetaAnual} isPrimary isBold className="text-xl"/>
                    </CardContent>
                </Card>
                 <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle>Resumen de Productos (Anual)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                         <div className="flex justify-between items-center text-base">
                            <span className="text-muted-foreground">Venta de productos</span>
                            <span className="font-semibold">${ventaProductosAnual.toLocaleString('es-CL')}</span>
                        </div>
                         <div className="flex justify-between items-center text-base">
                            <span className="text-muted-foreground">Reinversión</span>
                            <span className="font-semibold text-red-600">-${reinversionAnual.toLocaleString('es-CL')}</span>
                        </div>
                         <div className="flex justify-between items-center text-base">
                            <span className="text-muted-foreground">Comisión de profesionales</span>
                            <span className="font-semibold text-red-600">-${comisionProfesionalesAnual.toLocaleString('es-CL')}</span>
                        </div>
                        <div className="flex justify-between items-center text-lg pt-2 border-t mt-2">
                            <span className="font-bold text-primary flex items-center"><ShoppingCart className="mr-2 h-5 w-5" />Utilidad Vatos Alfa</span>
                            <span className="font-extrabold text-primary">${utilidadVatosAlfaAnual.toLocaleString('es-CL')}</span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="lg:col-span-1">
                    <CardHeader className="flex-row items-center justify-between">
                        <CardTitle>Historial de Depósitos</CardTitle>
                        <Button variant="outline" size="sm" onClick={() => setIsDepositoModalOpen(true)}>
                            <PlusCircle className="mr-2 h-4 w-4"/> Agregar Depósito
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                             <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Monto</TableHead><TableHead>Comentario</TableHead></TableRow></TableHeader>
                             <TableBody>
                                {mockDeposits.map((dep, i) => (
                                    <TableRow key={i}>
                                        <TableCell>{dep.fecha}</TableCell>
                                        <TableCell>${dep.monto.toLocaleString('es-CL')}</TableCell>
                                        <TableCell>{dep.comentario}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Tendencia Mensual: Ingresos, Egresos y Utilidad</CardTitle>
                </CardHeader>
                <CardContent className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={yearlyData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                            <Tooltip formatter={(value: number) => `$${value.toLocaleString('es-CL')}`} />
                            <Legend />
                            <Line type="monotone" dataKey="ingresos" stroke="hsl(var(--chart-2))" name="Ingresos" />
                            <Line type="monotone" dataKey="egresos" stroke="hsl(var(--destructive))" name="Egresos" />
                            <Line type="monotone" dataKey="utilidad" stroke="hsl(var(--chart-1))" name="Utilidad" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
        <AddDepositoModal
            isOpen={isDepositoModalOpen}
            onOpenChange={setIsDepositoModalOpen}
        />
        </>
    );
}

