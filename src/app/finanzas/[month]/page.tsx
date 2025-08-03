
'use client';

import { useParams } from 'next/navigation';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, DollarSign, ShoppingCart, ArrowDown, ArrowUp, ChevronDown, User, Loader2, Edit, Save, Trash2 } from 'lucide-react';
import { AddEgresoModal } from '@/components/finanzas/add-egreso-modal';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Sale, Egreso, Profesional, Service, Product } from '@/lib/types';
import { where, Timestamp } from 'firebase/firestore';
import { startOfMonth, endOfMonth, format, parse, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { Input } from '@/components/ui/input';

const monthNameToNumber: { [key: string]: number } = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
};



const ResumenEgresoItem = ({ label, amount, isBold }: { label: string, amount: number, isBold?: boolean }) => (
    <div className="flex justify-between items-center text-sm py-1.5 border-b last:border-0">
        <span className={cn("text-muted-foreground", isBold && "font-bold text-foreground")}>{label}</span>
        <span className={cn("font-medium", isBold && "font-bold")}>${amount.toLocaleString('es-CL')}</span>
    </div>
);

const ResumenGeneralItem = ({ label, children, amount, isBold, isPrimary, className }: { label: string, children?: React.ReactNode, amount: number, isBold?: boolean, isPrimary?: boolean, className?: string }) => (
    <div className={cn("flex justify-between items-center text-lg py-2 border-b last:border-0", className)}>
        <div className="flex items-center gap-2">
            <span className={cn(isBold && 'font-semibold', isPrimary && 'text-primary')}>{label}</span>
            {children}
        </div>
        <span className={cn(isBold && 'font-bold', isPrimary && 'text-primary font-extrabold')}>{`$${amount.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
    </div>
);


export default function FinanzasMensualesPage() {
    const params = useParams();
    const monthName = typeof params.month === 'string' ? params.month : 'enero';
    const monthNumber = monthNameToNumber[monthName.toLowerCase()];
    const currentYear = new Date().getFullYear();
    const [queryKey, setQueryKey] = useState(0);
    const [beatrizCommissionPercent, setBeatrizCommissionPercent] = useState(20);
    const [isEditingCommission, setIsEditingCommission] = useState(false);
    
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
    
    const egresosQueryConstraints = useMemo(() => {
        return [
            where('fecha', '>=', Timestamp.fromDate(startDate)),
            where('fecha', '<=', Timestamp.fromDate(endDate))
        ]
    }, [startDate, endDate]);

    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', `sales-${monthName}`, ...salesQueryConstraints);
    const { data: egresos, loading: egresosLoading } = useFirestoreQuery<Egreso>('egresos', `egresos-${monthName}-${queryKey}`, ...egresosQueryConstraints);
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
    const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');


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

    const calculatedEgresos = useMemo(() => {
        const commissionsByDayAndProf: Record<string, { professionalName: string; serviceCommission: number, productCommission: number, date: Date }> = {};

        if (!salesLoading && !professionalsLoading && !servicesLoading && !productsLoading) {
            const professionalMap = new Map(professionals.map(p => [p.id, p]));
            const serviceMap = new Map(services.map(s => [s.id, s]));
            const productMap = new Map(products.map(p => [p.id, p]));

            sales.forEach(sale => {
                const saleDate = sale.fecha_hora_venta.toDate();

                sale.items?.forEach(item => {
                    const professional = professionalMap.get(item.barbero_id);
                    if (!professional) return;

                    let commissionConfig = null;
                    if (item.tipo === 'servicio') {
                        const service = serviceMap.get(item.id);
                        if (service) {
                            commissionConfig = professional.comisionesPorServicio?.[service.name] || service.defaultCommission || professional.defaultCommission;
                        }
                    } else if (item.tipo === 'producto') {
                        const product = productMap.get(item.id);
                        if (product) {
                            commissionConfig = professional.comisionesPorProducto?.[product.id] || product.commission || professional.defaultCommission;
                        }
                    }

                    if (commissionConfig) {
                        const commissionAmount = commissionConfig.type === '%'
                            ? item.subtotal * (commissionConfig.value / 100)
                            : commissionConfig.value;
                        
                        const key = `${format(saleDate, 'yyyy-MM-dd')}-${professional.id}`;
                        if (!commissionsByDayAndProf[key]) {
                            commissionsByDayAndProf[key] = { professionalName: professional.name, serviceCommission: 0, productCommission: 0, date: saleDate };
                        }
                        
                        if (item.tipo === 'servicio') {
                           commissionsByDayAndProf[key].serviceCommission += commissionAmount;
                        } else if (item.tipo === 'producto') {
                           commissionsByDayAndProf[key].productCommission += commissionAmount;
                        }
                    }
                });
            });
        }
        
        const commissionEgresos: Egreso[] = [];
        Object.values(commissionsByDayAndProf).forEach((data) => {
            if (data.serviceCommission > 0) {
                commissionEgresos.push({
                    id: `comm-serv-${data.professionalName}-${data.date.toISOString()}`,
                    fecha: data.date,
                    concepto: 'Comisión Servicios',
                    aQuien: data.professionalName,
                    monto: data.serviceCommission,
                    comentarios: '',
                });
            }
            if (data.productCommission > 0) {
                commissionEgresos.push({
                    id: `comm-prod-${data.professionalName}-${data.date.toISOString()}`,
                    fecha: data.date,
                    concepto: 'Comision Venta de productos',
                    aQuien: data.professionalName,
                    monto: data.productCommission,
                    comentarios: '',
                });
            }
        });


        const manualEgresos: Egreso[] = egresos.map(e => ({...e, fecha: e.fecha instanceof Timestamp ? e.fecha.toDate() : new Date(e.fecha) }));
        
        return [...commissionEgresos, ...manualEgresos].sort((a,b) => {
            const dateA = a.fecha instanceof Date ? a.fecha : new Date();
            const dateB = b.fecha instanceof Date ? b.fecha : new Date();
            return dateA.getTime() - dateB.getTime();
        });

    }, [sales, professionals, services, products, egresos, salesLoading, professionalsLoading, servicesLoading, productsLoading]);


    // Calculation logic
    const ingresoTotal = useMemo(() => dailyIncome.reduce((sum, d) => sum + d.total, 0), [dailyIncome]);
    const egresoTotal = useMemo(() => calculatedEgresos.reduce((sum, e) => sum + e.monto, 0), [calculatedEgresos]);
    
    const productSummary = useMemo(() => {
        if (salesLoading || productsLoading || professionalsLoading) {
            return { ventaProductos: 0, reinversion: 0, comisionProfesionales: 0, utilidadVatosAlfa: 0 };
        }
        
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
                    
                    const professional = professionalMap.get(item.barbero_id);
                    if (product && professional) {
                        const commissionConfig = professional.comisionesPorProducto?.[product.id] || product.commission || professional.defaultCommission;
                        if(commissionConfig) {
                            comisionProfesionales += commissionConfig.type === '%'
                                ? item.subtotal * (commissionConfig.value / 100)
                                : commissionConfig.value;
                        }
                    }
                }
            })
        });
        
        const utilidadVatosAlfa = ventaProductos - reinversion - comisionProfesionales;
        
        return { ventaProductos, reinversion, comisionProfesionales, utilidadVatosAlfa };
    }, [sales, products, professionals, salesLoading, productsLoading, professionalsLoading]);

    const { ventaProductos, reinversion, comisionProfesionales, utilidadVatosAlfa } = productSummary;

    const subtotalUtilidad = ingresoTotal - egresoTotal - ventaProductos;
    const comisionBeatriz = subtotalUtilidad * (beatrizCommissionPercent / 100);
    const utilidadNeta = subtotalUtilidad - comisionBeatriz;


    const commissionsSummary = useMemo(() => {
        const summary: Record<string, { commission: number, tips: number }> = {};
        
        professionals.forEach(prof => {
            summary[prof.name] = { commission: 0, tips: 0 };
        });

        calculatedEgresos.forEach(egreso => {
            if (egreso.concepto.toLowerCase().includes('comisi')) {
                const profName = egreso.aQuien; // aQuien is already the name
                 if (summary[profName]) {
                    summary[profName].commission += egreso.monto;
                }
            }
        });
        
        return Object.entries(summary).map(([name, data]) => ({
            name,
            ...data
        }));

    }, [calculatedEgresos, professionals]);

    const totalComisiones = commissionsSummary.reduce((acc, curr) => acc + curr.commission + curr.tips, 0);
    
    const nominaTotal = useMemo(() => {
        return calculatedEgresos
            .filter(e => e.concepto === 'Nómina')
            .reduce((sum, e) => sum + e.monto, 0);
    }, [calculatedEgresos]);

    const costosFijosTotal = useMemo(() => {
        return calculatedEgresos
            .filter(e => e.aQuien === 'Costos fijos')
            .reduce((sum, e) => sum + e.monto, 0);
    }, [calculatedEgresos]);

    const isLoading = salesLoading || egresosLoading || professionalsLoading || servicesLoading || productsLoading;
    const totalResumenEgresos = totalComisiones + nominaTotal + costosFijosTotal;


    return (
        <>
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Resumen de {capitalize(monthName as string)}</h2>

            {/* KPI Cards */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-[1fr_0.75fr_1.25fr]">
                <Card>
                    <CardHeader>
                        <CardTitle>Resumen General del Mes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                       {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                           <>
                            <ResumenGeneralItem label="Ingreso Total" amount={ingresoTotal} />
                            <ResumenGeneralItem label="Egreso Total" amount={egresoTotal} />
                            <ResumenGeneralItem label="Subtotal de utilidad" amount={subtotalUtilidad} isBold />
                            <ResumenGeneralItem label={`Comisión de Beatriz (${beatrizCommissionPercent}%)`} amount={comisionBeatriz}>
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
                                        <div className="grid grid-cols-4 text-xs font-semibold text-muted-foreground">
                                            <span>Profesional</span>
                                            <span className="text-right">Comisión</span>
                                            <span className="text-right">Propinas Terminal</span>
                                            <span className="text-right">Total</span>
                                        </div>
                                        {commissionsSummary.map(({name, commission, tips}) => (
                                            <div key={name} className="grid grid-cols-4 text-xs">
                                                <span>{name}</span>
                                                <span className="text-right font-mono">${commission.toLocaleString('es-CL')}</span>
                                                <span className="text-right font-mono">${tips.toLocaleString('es-CL')}</span>
                                                <span className="text-right font-bold">${(commission + tips).toLocaleString('es-CL')}</span>
                                            </div>
                                        ))}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                        <ResumenEgresoItem label="Nómina" amount={nominaTotal} />
                        <ResumenEgresoItem label="Costos fijos" amount={costosFijosTotal} />
                        <ResumenEgresoItem label="Total" amount={totalResumenEgresos} isBold />
                    </CardContent>
                </Card>
            </div>

            {/* Detailed Tables */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-6">
                <Card>
                    <CardHeader className="flex-row items-center justify-between">
                        <CardTitle>Ingresos del Mes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Efectivo</TableHead><TableHead>Depósito</TableHead><TableHead>Total venta</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {isLoading ? (
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
                            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Concepto</TableHead><TableHead>A quién se entrega</TableHead><TableHead>Monto</TableHead><TableHead>Comentarios</TableHead><TableHead className="text-right">Opciones</TableHead></TableRow></TableHeader>
                            <TableBody>
                               {isLoading ? (
                                     <TableRow><TableCell colSpan={6} className="text-center h-24"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                                ) : calculatedEgresos.length === 0 ? (
                                    <TableRow><TableCell colSpan={6} className="text-center h-24">No hay egresos registrados.</TableCell></TableRow>
                                ) : (
                                    calculatedEgresos.map((egreso, i) => (
                                        <TableRow key={egreso.id}>
                                            <TableCell>{(egreso.fecha && isValid(new Date(egreso.fecha))) ? format(new Date(egreso.fecha), 'yyyy-MM-dd') : 'Fecha inválida'}</TableCell>
                                            <TableCell>{egreso.concepto}</TableCell>
                                            <TableCell>{egreso.aQuien}</TableCell>
                                            <TableCell className="font-semibold">${egreso.monto.toLocaleString('es-CL')}</TableCell>
                                            <TableCell>{egreso.comentarios}</TableCell>
                                            <TableCell className="text-right">
                                                {!egreso.id.startsWith('comm-') && (
                                                    <div className="flex gap-1 justify-end">
                                                        <Button variant="ghost" size="icon" className="h-7 w-7"><Edit className="h-4 w-4" /></Button>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>

        <AddEgresoModal
            isOpen={isEgresoModalOpen}
            onOpenChange={setIsEgresoModalOpen}
            onFormSubmit={() => {
                setIsEgresoModalOpen(false)
                setQueryKey(prev => prev + 1);
            }}
        />
        </>
    );
}
