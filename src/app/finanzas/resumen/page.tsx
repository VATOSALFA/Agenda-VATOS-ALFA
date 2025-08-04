
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PlusCircle, ShoppingCart, Edit, Save, Loader2 } from 'lucide-react';
import { AddDepositoModal } from '@/components/finanzas/add-deposito-modal';
import { cn } from '@/lib/utils';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Sale, Egreso, Profesional, Service, Product } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Input } from '@/components/ui/input';

// Mock data for deposits, as this feature is not fully implemented
const mockDeposits = [
    { fecha: '2024-07-15', monto: 10000, comentario: 'Adelanto socio' },
    { fecha: '2024-06-20', monto: 25000, comentario: 'Inversión inicial' },
];

const ResumenGeneralItem = ({ label, children, amount, isBold, isPrimary, className, fractionDigits = 2 }: { label: string, children?: React.ReactNode, amount: number, isBold?: boolean, isPrimary?: boolean, className?: string, fractionDigits?: number }) => (
    <div className={cn("flex justify-between items-center text-lg py-2 border-b last:border-0", className)}>
        <div className="flex items-center gap-2">
            <span className={cn(isBold && 'font-semibold', isPrimary && 'text-primary')}>{label}</span>
            {children}
        </div>
        <span className={cn(isBold && 'font-bold', isPrimary && 'text-primary font-extrabold')}>{`$${amount.toLocaleString('es-CL', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })}`}</span>
    </div>
);


export default function FinanzasResumenPage() {
    const [isDepositoModalOpen, setIsDepositoModalOpen] = useState(false);
    const [beatrizCommissionPercent, setBeatrizCommissionPercent] = useState(20);
    const [isEditingCommission, setIsEditingCommission] = useState(false);

    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas');
    const { data: egresos, loading: egresosLoading } = useFirestoreQuery<Egreso>('egresos');
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
    const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');
    
    const isLoading = salesLoading || egresosLoading || professionalsLoading || servicesLoading || productsLoading;

    const yearlyData = useMemo(() => {
        if (isLoading) return [];

        const professionalMap = new Map(professionals.map(p => [p.id, p]));
        const serviceMap = new Map(services.map(s => [s.id, s]));
        const productMap = new Map(products.map(p => [p.id, p]));
        
        const monthlyData: Record<string, { month: string, ingresos: number, egresos: number, utilidad: number }> = {};
        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

        monthNames.forEach((name, index) => {
            monthlyData[name] = { month: name, ingresos: 0, egresos: 0, utilidad: 0 };
        });

        sales.forEach(sale => {
            const saleDate = sale.fecha_hora_venta.toDate();
            const monthName = monthNames[saleDate.getMonth()];
            monthlyData[monthName].ingresos += sale.total;
        });

        egresos.forEach(egreso => {
            const egresoDate = egreso.fecha.toDate();
            const monthName = monthNames[egresoDate.getMonth()];
            monthlyData[monthName].egresos += egreso.monto;
        });
        
        sales.forEach(sale => {
            const saleDate = sale.fecha_hora_venta.toDate();
            const monthName = monthNames[saleDate.getMonth()];

             sale.items?.forEach(item => {
                const professional = professionalMap.get(item.barbero_id);
                if (!professional) return;
                
                let commissionConfig = null;
                if (item.tipo === 'servicio') {
                    const service = serviceMap.get(item.id);
                    if (service) commissionConfig = professional.comisionesPorServicio?.[service.name] || service.defaultCommission || professional.defaultCommission;
                } else if (item.tipo === 'producto') {
                    const product = productMap.get(item.id);
                    if (product) commissionConfig = professional.comisionesPorProducto?.[product.id] || product.commission || professional.defaultCommission;
                }

                if (commissionConfig) {
                    const commissionAmount = commissionConfig.type === '%'
                        ? item.subtotal * (commissionConfig.value / 100)
                        : commissionConfig.value;
                    monthlyData[monthName].egresos += commissionAmount;
                }
            });
        });

        Object.values(monthlyData).forEach(data => {
            data.utilidad = data.ingresos - data.egresos;
        });

        return Object.values(monthlyData);
    }, [isLoading, sales, egresos, professionals, services, products]);
    
    const { totalIngresosAnual, totalEgresosAnual } = useMemo(() => {
        return yearlyData.reduce((acc, month) => {
            acc.totalIngresosAnual += month.ingresos;
            acc.totalEgresosAnual += month.egresos;
            return acc;
        }, { totalIngresosAnual: 0, totalEgresosAnual: 0 });
    }, [yearlyData]);

    const { ventaProductosAnual, reinversionAnual, comisionProfesionalesAnual, utilidadVatosAlfaAnual } = useMemo(() => {
        if (isLoading) return { ventaProductosAnual: 0, reinversionAnual: 0, comisionProfesionalesAnual: 0, utilidadVatosAlfaAnual: 0 };
        
        const productMap = new Map(products.map(p => [p.id, p]));
        const professionalMap = new Map(professionals.map(p => [p.id, p]));

        let ventaProductos = 0;
        let reinversion = 0;
        let comisionProfesionales = 0;
        
        sales.forEach(sale => {
            sale.items?.forEach(item => {
                if (item.tipo === 'producto') {
                    ventaProductos += item.subtotal;
                    
                    const product = productMap.get(item.id);
                    if (product && product.purchase_cost) {
                        reinversion += product.purchase_cost * item.cantidad;
                    }
                    
                    if (product && item.barbero_id) {
                         const professional = professionalMap.get(item.barbero_id);
                         if (professional) {
                            const commissionConfig = professional?.comisionesPorProducto?.[product.id] || product.commission || professional.defaultCommission;
                            if(commissionConfig) {
                                comisionProfesionales += commissionConfig.type === '%'
                                    ? item.subtotal * (commissionConfig.value / 100)
                                    : commissionConfig.value;
                            }
                         }
                    }
                }
            })
        });
        
        const utilidadVatosAlfa = ventaProductos - reinversion - comisionProfesionales;
        return { ventaProductosAnual: ventaProductos, reinversionAnual: reinversion, comisionProfesionalesAnual: comisionProfesionales, utilidadVatosAlfaAnual: utilidadVatosAlfa };

    }, [isLoading, sales, products, professionals]);

    const subtotalUtilidadAnual = totalIngresosAnual - totalEgresosAnual - ventaProductosAnual;
    const comisionBeatrizAnual = subtotalUtilidadAnual * (beatrizCommissionPercent / 100);
    const utilidadNetaAnual = subtotalUtilidadAnual - comisionBeatrizAnual;

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
                        {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                          <>
                            <ResumenGeneralItem label="Ingreso Total" amount={totalIngresosAnual} />
                            <ResumenGeneralItem label="Egreso Total" amount={totalEgresosAnual} />
                            <ResumenGeneralItem label="Subtotal de utilidad" amount={subtotalUtilidadAnual} isBold />
                            <ResumenGeneralItem label={`Comisión de Beatriz (${beatrizCommissionPercent}%)`} amount={comisionBeatrizAnual}>
                                {isEditingCommission ? (
                                    <div className="flex items-center gap-1">
                                        <Input
                                            type="number"
                                            value={beatrizCommissionPercent}
                                            onChange={(e) => setBeatrizCommissionPercent(Number(e.target.value))}
                                            className="w-20 h-7 text-sm"
                                            autoFocus
                                        />
                                        <Button size="icon" className="h-7 w-7" onClick={() => setIsEditingCommission(false)}><Save className="h-4 w-4" /></Button>
                                    </div>
                                ) : (
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsEditingCommission(true)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                )}
                            </ResumenGeneralItem>
                            <ResumenGeneralItem label="Utilidad Neta" amount={utilidadNetaAnual} isPrimary isBold className="text-xl"/>
                          </>
                        )}
                    </CardContent>
                </Card>
                 <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle>Resumen de Productos (Anual)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                            <>
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
                            </>
                        )}
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
                  {isLoading ? <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={yearlyData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                            <Tooltip formatter={(value: number) => `$${value.toLocaleString('es-CL')}`} />
                            <Legend />
                            <Line type="monotone" dataKey="ingresos" stroke="hsl(var(--chart-2))" name="Ingresos" />
                            <Line type="monotone" dataKey="egresos" stroke="hsl(var(--destructive))" name="Egresos" />
                            <Line type="monotone" dataKey="utilidad" stroke="#22c55e" name="Utilidad" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                  )}
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
