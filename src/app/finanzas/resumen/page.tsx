

'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PlusCircle, ShoppingCart, Edit, Save, Loader2, TrendingUp, ArrowRight } from 'lucide-react';
import { AddDepositoModal } from '@/components/finanzas/add-deposito-modal';
import { cn } from '@/lib/utils';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Sale, Egreso, Profesional, Service, Product } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Input } from '@/components/ui/input';

const ResumenGeneralItem = ({ label, children, amount, isBold, isPrimary, className, fractionDigits = 2 }: { label: string, children?: React.ReactNode, amount: number, isBold?: boolean, isPrimary?: boolean, className?: string, fractionDigits?: number }) => (
    <div className={cn("flex justify-between items-center text-lg py-2 border-b last:border-0", className)}>
        <div className="flex items-center gap-2">
            <span className={cn(isBold && 'font-semibold', isPrimary && 'text-primary')}>{label}</span>
            {children}
        </div>
        <span className={cn(isBold && 'font-bold', isPrimary && 'text-primary font-extrabold')}>{`$${amount.toLocaleString('es-MX', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })}`}</span>
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
        
        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        const monthlyData: Record<string, { month: string, monthFullName: string, ingresos: number, egresos: number, utilidad: number, subtotalUtilidad: number, rendimiento: number }> = {};

        monthNames.forEach((name, index) => {
            monthlyData[name] = { 
                month: name,
                monthFullName: new Date(2000, index, 1).toLocaleString('es-CL', { month: 'long' }),
                ingresos: 0, 
                egresos: 0, 
                utilidad: 0,
                subtotalUtilidad: 0,
                rendimiento: 0,
            };
        });

        sales.forEach(sale => {
            const saleDate = sale.fecha_hora_venta.toDate();
            const monthName = monthNames[saleDate.getMonth()];
            monthlyData[monthName].ingresos += sale.total;
        });

        const allEgresos = [
            ...egresos.map(e => ({ ...e, fecha: e.fecha.toDate() })),
            ...sales.flatMap(sale => {
                const saleDate = sale.fecha_hora_venta.toDate();
                return sale.items?.map(item => {
                    const professional = professionalMap.get(item.barbero_id);
                    if (!professional) return null;

                    let commissionConfig = null;
                    if (item.tipo === 'servicio') {
                        const service = serviceMap.get(item.id);
                        if (service) commissionConfig = professional.comisionesPorServicio?.[service.name] || service.defaultCommission || professional.defaultCommission;
                    } else if (item.tipo === 'producto') {
                        const product = productMap.get(item.id);
                        if (product) commissionConfig = professional.comisionesPorProducto?.[product.id] || product.commission || professional.defaultCommission;
                    }

                    if (commissionConfig) {
                        const itemSubtotal = item.subtotal || item.precio_unitario || 0;
                        const itemDiscount = item.descuento?.monto || 0;
                        const finalItemPrice = itemSubtotal - itemDiscount;

                        const commissionAmount = commissionConfig.type === '%'
                            ? finalItemPrice * (commissionConfig.value / 100)
                            : commissionConfig.value;
                            
                        return { fecha: saleDate, monto: commissionAmount, aQuien: professional.id, concepto: `Comisión ${item.tipo}` };
                    }
                    return null;
                }).filter(e => e !== null) as { fecha: Date, monto: number, aQuien: string, concepto: string }[]
            })
        ];

        allEgresos.forEach(egreso => {
            const monthName = monthNames[egreso.fecha.getMonth()];
            monthlyData[monthName].egresos += egreso.monto;
        });

        // Calculate Utility and Rendimiento per month
        Object.values(monthlyData).forEach(data => {
            const monthIndex = monthNames.indexOf(data.month);
            const monthlySales = sales.filter(s => s.fecha_hora_venta.toDate().getMonth() === monthIndex);
            
            const ventaProductos = monthlySales.reduce((sum, sale) => {
                return sum + sale.items
                    .filter(i => i.tipo === 'producto')
                    .reduce((itemSum, i) => {
                        const itemSubtotal = i.subtotal || i.precio_unitario || 0;
                        const itemDiscount = i.descuento?.monto || 0;
                        return itemSum + (itemSubtotal - itemDiscount);
                    }, 0);
            }, 0);

            const subtotalUtilidad = data.ingresos - data.egresos - ventaProductos;
            const comisionBeatriz = subtotalUtilidad * (beatrizCommissionPercent / 100);
            data.subtotalUtilidad = subtotalUtilidad;
            data.utilidad = subtotalUtilidad - comisionBeatriz;
            data.rendimiento = data.ingresos > 0 ? (subtotalUtilidad / data.ingresos) * 100 : 0;
        });

        return Object.values(monthlyData);
    }, [isLoading, sales, egresos, professionals, services, products, beatrizCommissionPercent]);
    
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
                    const itemSubtotal = item.subtotal || item.precio_unitario || 0;
                    const itemDiscount = item.descuento?.monto || 0;
                    const finalItemPrice = itemSubtotal - itemDiscount;
                    
                    ventaProductos += finalItemPrice;
                    
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
                                    ? finalItemPrice * (commissionConfig.value / 100)
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
    
    const firstHalfYear = yearlyData.slice(0, 6);
    const secondHalfYear = yearlyData.slice(6, 12);

    return (
        <>
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Resumen Anual</h2>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle>Resumen</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                        {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                          <>
                            <ResumenGeneralItem label="Ingreso Total" amount={totalIngresosAnual} fractionDigits={2}/>
                            <ResumenGeneralItem label="Egreso Total" amount={totalEgresosAnual} fractionDigits={2}/>
                            <ResumenGeneralItem label="Subtotal de utilidad" amount={subtotalUtilidadAnual} isBold fractionDigits={2}/>
                            <ResumenGeneralItem label={`Comisión de Beatriz (${beatrizCommissionPercent}%)`} amount={comisionBeatrizAnual} fractionDigits={2}>
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
                            <ResumenGeneralItem label="Utilidad Neta" amount={utilidadNetaAnual} isPrimary isBold className="text-xl" fractionDigits={2}/>
                          </>
                        )}
                    </CardContent>
                </Card>
                 <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle>Productos</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                            <>
                                <div className="flex justify-between items-center text-base">
                                    <span className="text-muted-foreground">Venta de productos</span>
                                    <span className="font-semibold">${ventaProductosAnual.toLocaleString('es-MX')}</span>
                                </div>
                                <div className="flex justify-between items-center text-base">
                                    <span className="text-muted-foreground">Reinversión</span>
                                    <span className="font-semibold text-red-600">-${reinversionAnual.toLocaleString('es-MX')}</span>
                                </div>
                                <div className="flex justify-between items-center text-base">
                                    <span className="text-muted-foreground">Comisión de profesionales</span>
                                    <span className="font-semibold text-red-600">-${comisionProfesionalesAnual.toLocaleString('es-MX')}</span>
                                </div>
                                <div className="flex justify-between items-center text-lg pt-2 border-t mt-2">
                                    <span className="font-bold text-primary flex items-center"><ShoppingCart className="mr-2 h-5 w-5" />Utilidad Vatos Alfa</span>
                                    <span className="font-extrabold text-primary">${utilidadVatosAlfaAnual.toLocaleString('es-MX')}</span>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle>Rendimiento Mensual</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Mes</TableHead>
                                    <TableHead className="text-right">Rendimiento</TableHead>
                                    <TableHead>Mes</TableHead>
                                    <TableHead className="text-right">Rendimiento</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={4} className="text-center h-24"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                                ) : (
                                    firstHalfYear.map((data, index) => (
                                        <TableRow key={data.monthFullName}>
                                            <TableCell className="capitalize">{data.monthFullName}</TableCell>
                                            <TableCell className="text-right font-semibold text-primary">{data.rendimiento.toFixed(2)}%</TableCell>
                                            <TableCell className="capitalize">{secondHalfYear[index]?.monthFullName}</TableCell>
                                            <TableCell className="text-right font-semibold text-primary">{secondHalfYear[index]?.rendimiento.toFixed(2)}%</TableCell>
                                        </TableRow>
                                    ))
                                )}
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
                            <Tooltip formatter={(value: number) => `$${value.toLocaleString('es-MX')}`} />
                            <Legend />
                            <Line type="monotone" dataKey="ingresos" stroke="hsl(var(--chart-2))" name="Ingresos" />
                            <Line type="monotone" dataKey="egresos" stroke="hsl(var(--destructive))" name="Egresos" />
                            <Line type="monotone" dataKey="utilidad" stroke="#22c55e" name="Utilidad Neta" strokeWidth={2} />
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
