
'use client';

import { useParams } from 'next/navigation';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, DollarSign, ShoppingCart, ArrowDown, ArrowUp, ChevronDown, User, Loader2 } from 'lucide-react';
import { AddEgresoModal } from '@/components/finanzas/add-egreso-modal';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Sale, Egreso, Profesional, Service, Product } from '@/lib/types';
import { where, Timestamp } from 'firebase/firestore';
import { startOfMonth, endOfMonth, format, parse, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

const monthNameToNumber: { [key: string]: number } = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
};



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
    const [queryKey, setQueryKey] = useState(0);
    
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
                            commissionConfig = professional.comisionesPorServicio?.[service.id] || service.defaultCommission || professional.defaultCommission;
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
        Object.values(commissionsByDayAndProf).forEach((data, index) => {
            if (data.serviceCommission > 0) {
                commissionEgresos.push({
                    id: `comm-serv-${index}`,
                    fecha: data.date,
                    concepto: 'Comisión Servicios',
                    aQuien: data.professionalName,
                    monto: data.serviceCommission,
                    comentarios: '',
                });
            }
            if (data.productCommission > 0) {
                commissionEgresos.push({
                    id: `comm-prod-${index}`,
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
    const ingresoTotal = salesLoading ? 0 : sales.reduce((sum, s) => sum + (s.total || 0), 0);
    const egresoTotal = calculatedEgresos.reduce((sum, e) => sum + e.monto, 0);
    const subtotalUtilidad = ingresoTotal - egresoTotal;
    const comisionBeatriz = subtotalUtilidad * 0.20;
    const utilidadNeta = subtotalUtilidad - comisionBeatriz;
    
    // Product summary mock data
    const ventaProductos = 80000;
    const reinversion = 25000;
    const comisionProfesionales = 8000;
    const utilidadVatosAlfa = ventaProductos - reinversion - comisionProfesionales;

    const commissionsSummary = useMemo(() => {
        return calculatedEgresos
            .filter(e => e.concepto.startsWith('Comisión'))
            .reduce((acc, curr) => {
                acc[curr.aQuien] = (acc[curr.aQuien] || 0) + curr.monto;
                return acc;
            }, {} as Record<string, number>);
    }, [calculatedEgresos]);

    const totalComisiones = Object.values(commissionsSummary).reduce((acc, curr) => acc + curr, 0);
    
    const isLoading = salesLoading || egresosLoading || professionalsLoading || servicesLoading || productsLoading;

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
                       {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
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
                                        <div className="grid grid-cols-2 text-xs font-semibold text-muted-foreground">
                                            <span>Profesional</span>
                                            <span className="text-right">Comisión Total</span>
                                        </div>
                                        {Object.entries(commissionsSummary).map(([name, commission]) => (
                                            <div key={name} className="grid grid-cols-2 text-xs">
                                                <span>{name}</span>
                                                <span className="text-right font-mono">${commission.toLocaleString('es-CL')}</span>
                                            </div>
                                        ))}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                        <ResumenEgresoItem label="Nómina" amount={20000} />
                        <ResumenEgresoItem label="Costos fijos" amount={0} />
                        <ResumenEgresoItem label="Insumos" amount={10000} />
                    </CardContent>
                </Card>
            </div>

            {/* Detailed Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <Card className="lg:col-span-2">
                    <CardHeader>
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
                 <Card className="lg:col-span-3">
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
                               {isLoading ? (
                                     <TableRow><TableCell colSpan={5} className="text-center h-24"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                                ) : calculatedEgresos.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="text-center h-24">No hay egresos registrados.</TableCell></TableRow>
                                ) : (
                                    calculatedEgresos.map((egreso, i) => (
                                        <TableRow key={i}>
                                            <TableCell>{(egreso.fecha && isValid(new Date(egreso.fecha))) ? format(new Date(egreso.fecha), 'yyyy-MM-dd') : 'Fecha inválida'}</TableCell>
                                            <TableCell>{egreso.concepto}</TableCell>
                                            <TableCell>{egreso.aQuien}</TableCell>
                                            <TableCell className="font-semibold">${egreso.monto.toLocaleString('es-CL')}</TableCell>
                                            <TableCell>{egreso.comentarios}</TableCell>
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

    

    
    

