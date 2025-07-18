
'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, DollarSign, ShoppingCart, ArrowDown, ArrowUp } from 'lucide-react';
import { AddIngresoModal } from '@/components/finanzas/add-ingreso-modal';
import { AddEgresoModal } from '@/components/finanzas/add-egreso-modal';

// Mock Data
const mockIngresos = [
    { fecha: '2024-07-01', efectivo: 50000, deposito: 25000, total: 75000 },
    { fecha: '2024-07-02', efectivo: 60000, deposito: 30000, total: 90000 },
];

const mockEgresos = [
    { fecha: '2024-07-01', concepto: 'Comisión Beatriz', aQuien: 'Beatriz Elizarraga', monto: 15000, comentarios: 'Comisión semana 26' },
    { fecha: '2024-07-02', concepto: 'Insumos', aQuien: 'Proveedor de Cera', monto: 10000, comentarios: 'Cera para cabello' },
    { fecha: '2024-07-03', concepto: 'Nómina', aQuien: 'Recepcionista', monto: 20000, comentarios: 'Pago semanal' },
];

const ResumenEgresoItem = ({ label, amount }: { label: string, amount: number }) => (
    <div className="flex justify-between items-center text-sm py-1.5 border-b last:border-0">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">${amount.toLocaleString('es-CL')}</span>
    </div>
);


export default function FinanzasMensualesPage() {
    const params = useParams();
    const month = typeof params.month === 'string' ? params.month : 'Mes';
    const [isIngresoModalOpen, setIsIngresoModalOpen] = useState(false);
    const [isEgresoModalOpen, setIsEgresoModalOpen] = useState(false);

    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

    return (
        <>
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Resumen de {capitalize(month)}</h2>

            {/* KPI Cards */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle>Resumen General del Mes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex justify-between items-center text-lg">
                            <span className="flex items-center text-green-600"><ArrowUp className="mr-2 h-5 w-5"/>Ingreso Total</span>
                            <span className="font-bold text-green-600">$165,000</span>
                        </div>
                        <div className="flex justify-between items-center text-lg">
                            <span className="flex items-center text-red-600"><ArrowDown className="mr-2 h-5 w-5"/>Egreso Total</span>
                            <span className="font-bold text-red-600">$45,000</span>
                        </div>
                        <div className="flex justify-between items-center text-xl pt-2 border-t mt-2">
                            <span className="flex items-center font-bold text-primary"><DollarSign className="mr-2 h-5 w-5"/>Utilidad</span>
                            <span className="font-extrabold text-primary">$120,000</span>
                        </div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Resumen de Productos</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                         <div className="flex justify-between items-center text-base">
                            <span className="text-muted-foreground">Venta de productos</span>
                            <span className="font-semibold">$80,000</span>
                        </div>
                         <div className="flex justify-between items-center text-base">
                            <span className="text-muted-foreground">Comisión de venta</span>
                            <span className="font-semibold">-$8,000</span>
                        </div>
                        <div className="flex justify-between items-center text-lg pt-2 border-t mt-2">
                            <span className="font-bold text-primary flex items-center"><ShoppingCart className="mr-2 h-5 w-5" />Utilidad de productos</span>
                            <span className="font-extrabold text-primary">$72,000</span>
                        </div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Resumen de Egresos por Categoría</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResumenEgresoItem label="Comisiones" amount={15000} />
                        <ResumenEgresoItem label="Propinas" amount={5000} />
                        <ResumenEgresoItem label="Nómina" amount={20000} />
                        <ResumenEgresoItem label="Costos fijos" amount={0} />
                        <ResumenEgresoItem label="Insumos" amount={10000} />
                    </CardContent>
                </Card>
            </div>

            {/* Detailed Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader className="flex-row items-center justify-between">
                        <CardTitle>Ingresos del Mes</CardTitle>
                        <Button variant="outline" onClick={() => setIsIngresoModalOpen(true)}>
                            <PlusCircle className="mr-2 h-4 w-4"/> Agregar Ingreso
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Efectivo</TableHead><TableHead>Depósito</TableHead><TableHead>Total venta</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {mockIngresos.map((ingreso, i) => (
                                    <TableRow key={i}>
                                        <TableCell>{ingreso.fecha}</TableCell>
                                        <TableCell>${ingreso.efectivo.toLocaleString('es-CL')}</TableCell>
                                        <TableCell>${ingreso.deposito.toLocaleString('es-CL')}</TableCell>
                                        <TableCell className="font-semibold">${ingreso.total.toLocaleString('es-CL')}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex-row items-center justify-between">
                        <CardTitle>Egresos del Mes</CardTitle>
                        <Button variant="outline" onClick={() => setIsEgresoModalOpen(true)}>
                             <PlusCircle className="mr-2 h-4 w-4"/> Agregar Egreso
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Concepto</TableHead><TableHead>A quién se entrega</TableHead><TableHead>Monto</TableHead><TableHead>Comentarios</TableHead></TableRow></TableHeader>
                            <TableBody>
                               {mockEgresos.map((egreso, i) => (
                                    <TableRow key={i}>
                                        <TableCell>{egreso.fecha}</TableCell>
                                        <TableCell>{egreso.concepto}</TableCell>
                                        <TableCell>{egreso.aQuien}</TableCell>
                                        <TableCell className="font-semibold">${egreso.monto.toLocaleString('es-CL')}</TableCell>
                                        <TableCell>{egreso.comentarios}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>

        <AddIngresoModal 
            isOpen={isIngresoModalOpen}
            onOpenChange={setIsIngresoModalOpen}
            onFormSubmit={() => setIsIngresoModalOpen(false)}
        />
        <AddEgresoModal
            isOpen={isEgresoModalOpen}
            onOpenChange={setIsEgresoModalOpen}
            onFormSubmit={() => setIsEgresoModalOpen(false)}
        />
        </>
    );
}
