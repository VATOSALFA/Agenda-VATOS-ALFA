
'use client';

import { useParams } from 'next/navigation';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, DollarSign, ShoppingCart, ArrowDown, ArrowUp, ChevronDown, User, Loader2 } from 'lucide-react';
import { AddIngresoModal } from '@/components/finanzas/add-ingreso-modal';
import { AddEgresoModal } from '@/components/finanzas/add-egreso-modal';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Sale } from '@/lib/types';
import { where, Timestamp } from 'firebase/firestore';
import { startOfMonth, endOfMonth, format, parse } from 'date-fns';
import { es } from 'date-fns/locale';

const monthNameToNumber: { [key: string]: number } = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
};


const mockEgresos = [
    { fecha: '2024-07-01', concepto: 'Comisión Beatriz', aQuien: 'Beatriz Elizarraga', monto: 15000, comentarios: 'Comisión semana 26' },
    { fecha: '2024-07-02', concepto: 'Insumos', aQuien: 'Proveedor de Cera', monto: 10000, comentarios: 'Cera para cabello' },
    { fecha: '2024-07-03', concepto: 'Nómina', aQuien: 'Recepcionista', monto: 20000, comentarios: 'Pago semanal' },
];

const comisionesPorProfesional = [
    { name: 'Beatriz Elizarraga', commission: 8000, tips: 2500 },
    { name: 'Erick', commission: 4000, tips: 1500 },
    { name: 'Lupita', commission: 3000, tips: 1000 },
];

const totalComisiones = comisionesPorProfesional.reduce((acc, prof) => acc + prof.commission, 0);

const ResumenEgresoItem = ({ label, amount }: { label: string, amount: number }) => (
    <div className="flex justify-between items-center text-sm py-1.5 border-b last:border-0">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">${amount.toLocaleString('es-CL')}</span>
    </div>
);

const ResumenGeneralItem = ({ label, amount, isBold, isPrimary, className }: { label: string, amount: number, isBold?: boolean, isPrimary?: boolean, className?: string }) => (
    <div className={cn("flex justify-between items-center text-lg py-2 border-b last:border-0", className)}>
        <span className={cn(isBold && 'font-semibold', isPrimary && 'text-primary')}>{label}</span>
        <span className={cn(isBold && 'font-bold', isPrimary && 'text-primary font-extrabold')}>{`$${amount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
    </div>
);


export default function FinanzasMensualesPage() {
    const params = useParams();
    const monthName = typeof params.month === 'string' ? params.month : 'enero';
    const monthNumber = monthNameToNumber[monthName.toLowerCase()];
    const currentYear = new Date().getFullYear();
    
    const { startDate, endDate } = useMemo(() => {
        if (monthNumber === undefined) {
             const now = new Date();
             return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
        }
        const date = new Date(currentYear, monthNumber, 1);
        return {
            startDate: startOfMonth(date),
            endDate: endOfMonth(date),
        };
    }, [monthNumber, currentYear]);

    const salesQueryConstraints = useMemo(() => {
        return [
            where('fecha_hora_venta', '>=', Timestamp.fromDate(startDate)),
            where('fecha_hora_venta', '<=', Timestamp.fromDate(endDate))
        ];
    }, [startDate, endDate]);
    
    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', `sales-${monthName}`, ...salesQueryConstraints);

    const [isIngresoModalOpen, setIsIngresoModalOpen] = useState(false);
    const [isEgresoModalOpen, setIsEgresoModalOpen] = useState(false);

    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    
    const dailyIncome = useMemo(() => {
        if (!sales) return [];
        const groupedByDay = sales.reduce((acc, sale) => {
            const saleDate = format(sale.fecha_hora_venta.toDate(), 'yyyy-MM-dd');
            if (!acc[saleDate]) {
                acc[saleDate] = { fecha: saleDate, efectivo: 0, deposito: 0, total: 0 };
            }
            if (sale.metodo_pago === 'efectivo') {
                acc[saleDate].efectivo += sale.total;
            } else if (['tarjeta', 'transferencia'].includes(sale.metodo_pago)) {
                acc[saleDate].deposito += sale.total;
            }
            acc[saleDate].total += sale.total;
            return acc;
        }, {} as Record<string, { fecha: string; efectivo: number; deposito: number; total: number }>);

        return Object.values(groupedByDay).sort((a,b) => a.fecha.localeCompare(b.fecha));
    }, [sales]);


    // Calculation logic
    const ingresoTotal = salesLoading ? 0 : sales.reduce((sum, s) => sum + (s.total || 0), 0);
    const egresoTotal = 38721.44;  // Hardcoded from user request, can be replaced with real data
    const subtotalUtilidad = ingresoTotal - egresoTotal;
    const comisionBeatriz = subtotalUtilidad * 0.20;
    const utilidadNeta = subtotalUtilidad - comisionBeatriz;
    
    // Product summary mock data
    const ventaProductos = 80000;
    const reinversion = 25000;
    const comisionProfesionales = 8000;
    const utilidadVatosAlfa = ventaProductos - reinversion - comisionProfesionales;

    return (
        <>
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Resumen de {capitalize(monthName as string)}</h2>

            {/* KPI Cards */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle>Resumen General del Mes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                       {salesLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                           <>
                            <ResumenGeneralItem label="Ingreso Total" amount={ingresoTotal} />
                            <ResumenGeneralItem label="Egreso Total" amount={egresoTotal} />
                            <ResumenGeneralItem label="Subtotal de utilidad" amount={subtotalUtilidad} isBold />
                            <ResumenGeneralItem label="Comisión de Beatriz" amount={comisionBeatriz} />
                            <ResumenGeneralItem label="Utilidad Neta" amount={utilidadNeta} isPrimary isBold className="text-xl"/>
                           </>
                       )}
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Resumen de Productos</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                         <div className="flex justify-between items-center text-base">
                            <span className="text-muted-foreground">Venta de productos</span>
                            <span className="font-semibold">${ventaProductos.toLocaleString('es-CL')}</span>
                        </div>
                         <div className="flex justify-between items-center text-base">
                            <span className="text-muted-foreground">Reinversión</span>
                            <span className="font-semibold text-red-600">-${reinversion.toLocaleString('es-CL')}</span>
                        </div>
                         <div className="flex justify-between items-center text-base">
                            <span className="text-muted-foreground">Comisión de profesionales</span>
                            <span className="font-semibold text-red-600">-${comisionProfesionales.toLocaleString('es-CL')}</span>
                        </div>
                        <div className="flex justify-between items-center text-lg pt-2 border-t mt-2">
                            <span className="font-bold text-primary flex items-center"><ShoppingCart className="mr-2 h-5 w-5" />Utilidad Vatos Alfa</span>
                            <span className="font-extrabold text-primary">${utilidadVatosAlfa.toLocaleString('es-CL')}</span>
                        </div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Resumen de Egresos por Categoría</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Accordion type="single" collapsible className="w-full">
                            <AccordionItem value="comisiones" className="border-b">
                                <AccordionTrigger className="flex justify-between items-center text-sm py-1.5 hover:no-underline font-normal">
                                    <span className="text-muted-foreground">Comisiones</span>
                                    <span className="font-medium mr-4">${totalComisiones.toLocaleString('es-CL')}</span>
                                </AccordionTrigger>
                                <AccordionContent className="pt-2 pb-2 pl-4 pr-2 bg-muted/50 rounded-b-md">
                                    <div className="space-y-2">
                                        <div className="grid grid-cols-3 text-xs font-semibold text-muted-foreground">
                                            <span>Profesional</span>
                                            <span className="text-right">Comisión</span>
                                            <span className="text-right">Propina</span>
                                        </div>
                                        {comisionesPorProfesional.map((prof, index) => (
                                            <div key={index} className="grid grid-cols-3 text-xs">
                                                <span>{prof.name}</span>
                                                <span className="text-right font-mono">${prof.commission.toLocaleString('es-CL')}</span>
                                                <span className="text-right font-mono">${prof.tips.toLocaleString('es-CL')}</span>
                                            </div>
                                        ))}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
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
                                {salesLoading ? (
                                     <TableRow>
                                        <TableCell colSpan={4} className="text-center h-24">
                                            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                                        </TableCell>
                                    </TableRow>
                                ) : dailyIncome.length === 0 ? (
                                     <TableRow>
                                        <TableCell colSpan={4} className="text-center h-24">
                                            No hay ingresos registrados para {capitalize(monthName)}.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    dailyIncome.map((ingreso, i) => (
                                        <TableRow key={i}>
                                            <TableCell>{ingreso.fecha}</TableCell>
                                            <TableCell>${ingreso.efectivo.toLocaleString('es-CL')}</TableCell>
                                            <TableCell>${ingreso.deposito.toLocaleString('es-CL')}</TableCell>
                                            <TableCell className="font-semibold">${ingreso.total.toLocaleString('es-CL')}</TableCell>
                                        </TableRow>
                                    ))
                                )}
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
