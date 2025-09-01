

'use client';

import { useParams } from 'next/navigation';
import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, DollarSign, ShoppingCart, ArrowDown, ArrowUp, ChevronDown, User, Loader2, Edit, Save, Trash2 } from 'lucide-react';
import { AddEgresoModal } from '@/components/finanzas/add-egreso-modal';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Sale, Egreso, Profesional, Service, Product } from '@/lib/types';
import { where, Timestamp, doc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { startOfMonth, endOfMonth, format, parse, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const monthNameToNumber: { [key: string]: number } = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
};



const ResumenEgresoItem = ({ label, amount, isBold, isPrimary }: { label: string, amount: number, isBold?: boolean, isPrimary?: boolean }) => (
    <div className="flex justify-between items-center text-base py-1.5 border-b last:border-b-0">
        <span className={cn("text-muted-foreground", isBold && "font-bold text-foreground", isPrimary && "font-bold text-primary flex items-center")}>{label}</span>
        <span className={cn("font-semibold", isBold && "font-extrabold", isPrimary && "text-primary")}>${amount.toLocaleString('es-MX')}</span>
    </div>
);

const ResumenGeneralItem = ({ label, children, amount, isBold, isPrimary, className }: { label: string, children?: React.ReactNode, amount: number, isBold?: boolean, isPrimary?: boolean, className?: string }) => (
    <div className={cn("flex justify-between items-center text-lg py-2 border-b last:border-0", className)}>
        <div className="flex items-center gap-2">
            <span className={cn(isBold && 'font-semibold', isPrimary && 'text-primary')}>{label}</span>
            {children}
        </div>
        <span className={cn(isBold && 'font-bold', isPrimary && 'text-primary font-extrabold')}>{`$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
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
    const { toast } = useToast();
    const [editingEgreso, setEditingEgreso] = useState<Egreso | null>(null);
    const [egresoToDelete, setEgresoToDelete] = useState<Egreso | null>(null);
    
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
            
            const metodoPago = sale.metodo_pago;

            if (metodoPago === 'efectivo') {
                acc[saleDate].efectivo += sale.total;
            } else if (['tarjeta', 'transferencia'].includes(metodoPago)) {
                acc[saleDate].deposito += sale.total;
            } else if (metodoPago === 'combinado' && sale.detalle_pago_combinado) {
                acc[saleDate].efectivo += sale.detalle_pago_combinado.efectivo || 0;
                acc[saleDate].deposito += sale.detalle_pago_combinado.tarjeta || 0;
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
                    
                    const itemSubtotal = item.subtotal || item.precio_unitario || 0;
                    const itemDiscount = item.descuento?.monto || 0;
                    const finalItemPrice = itemSubtotal - itemDiscount;

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
                            ? finalItemPrice * (commissionConfig.value / 100)
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
                    const itemSubtotal = item.subtotal || item.precio_unitario || 0;
                    const itemDiscount = item.descuento?.monto || 0;
                    const finalItemPrice = itemSubtotal - itemDiscount;

                    ventaProductos += finalItemPrice;
                    
                    const product = productMap.get(item.id);
                    if (product && product.purchase_cost) {
                        reinversion += product.purchase_cost * item.cantidad;
                    }
                    
                    const professional = professionalMap.get(item.barbero_id);
                    if (product && professional) {
                        const commissionConfig = professional.comisionesPorProducto?.[product.id] || product.commission || professional.defaultCommission;
                        if(commissionConfig) {
                            comisionProfesionales += commissionConfig.type === '%'
                                ? finalItemPrice * (commissionConfig.value / 100)
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

    const egresoTotal = totalComisiones + nominaTotal + costosFijosTotal;
    const subtotalUtilidad = ingresoTotal - egresoTotal - ventaProductos;
    const comisionBeatriz = subtotalUtilidad * (beatrizCommissionPercent / 100);
    const utilidadNeta = subtotalUtilidad - comisionBeatriz;


    const isLoading = salesLoading || egresosLoading || professionalsLoading || servicesLoading || productsLoading;
    const totalResumenEgresos = totalComisiones + nominaTotal + costosFijosTotal;

    const handleOpenEditEgreso = (egreso: Egreso) => {
        const editableEgreso = {
          ...egreso,
          fecha: egreso.fecha instanceof Timestamp ? egreso.fecha.toDate() : new Date(egreso.fecha)
        }
        setEditingEgreso(editableEgreso);
        setIsEgresoModalOpen(true);
    };

    const handleDeleteEgreso = async () => {
        if (!egresoToDelete) return;
        try {
            await deleteDoc(doc(db, "egresos", egresoToDelete.id));
            toast({
                title: "Egreso Eliminado",
                description: `El egreso ha sido eliminado permanentemente.`,
            });
            setQueryKey(prev => prev + 1); // Refetch data
        } catch (error) {
            console.error("Error deleting egreso: ", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "No se pudo eliminar el egreso. Inténtalo de nuevo.",
            });
        } finally {
            setEgresoToDelete(null);
        }
    };


    return (
        <>
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Resumen de {capitalize(monthName as string)}</h2>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
                <Card className="lg:col-span-4">
                    <CardHeader>
                        <CardTitle>Resumen</CardTitle>
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
                <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle>Productos</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex justify-between items-center text-base">
                            <span className="text-muted-foreground">Venta de productos</span>
                            <span className="font-semibold">${ventaProductos.toLocaleString('es-MX')}</span>
                        </div>
                        <div className="flex justify-between items-center text-base">
                            <span className="text-muted-foreground">Reinversión</span>
                            <span className="font-semibold text-red-600">-${reinversion.toLocaleString('es-MX')}</span>
                        </div>
                        <div className="flex justify-between items-center text-base">
                            <span className="text-muted-foreground">Comisión de profesionales</span>
                            <span className="font-semibold text-red-600">-${comisionProfesionales.toLocaleString('es-MX')}</span>
                        </div>
                        <div className="flex justify-between items-center text-lg pt-2 border-t mt-2">
                            <span className="font-bold text-primary flex items-center"><ShoppingCart className="mr-2 h-5 w-5" />Utilidad Vatos Alfa</span>
                            <span className="font-extrabold text-primary">${utilidadVatosAlfa.toLocaleString('es-MX')}</span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="lg:col-span-5">
                    <CardHeader>
                        <CardTitle>Egresos</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Accordion type="single" collapsible className="w-full">
                            <AccordionItem value="comisiones" className="border-b-0">
                                <div className="flex justify-between items-center text-base py-1.5 border-b">
                                    <AccordionTrigger className="flex-grow hover:no-underline font-normal p-0">
                                        <span className="text-muted-foreground">Comisiones</span>
                                    </AccordionTrigger>
                                     <span className="font-semibold mr-4">${totalComisiones.toLocaleString('es-MX')}</span>
                                </div>
                                <AccordionContent className="pt-2 pb-2 pl-4 pr-2 bg-muted/50 rounded-md">
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
                                                <span className="text-right font-mono">${commission.toLocaleString('es-MX')}</span>
                                                <span className="text-right font-mono">${tips.toLocaleString('es-MX')}</span>
                                                <span className="text-right font-bold">${(commission + tips).toLocaleString('es-MX')}</span>
                                            </div>
                                        ))}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                        <ResumenEgresoItem label="Nómina" amount={nominaTotal} />
                        <ResumenEgresoItem label="Costos fijos" amount={costosFijosTotal} />
                         <div className="flex justify-between items-center text-lg pt-2 mt-2">
                            <span className="font-bold text-primary">Total</span>
                            <span className="font-extrabold text-primary text-lg">${totalResumenEgresos.toLocaleString('es-MX')}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
            
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                 <Card className="lg:col-span-5">
                    <CardHeader>
                        <CardTitle>Ingresos</CardTitle>
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
                                            <TableCell>${ingreso.efectivo.toLocaleString('es-MX')}</TableCell>
                                            <TableCell>${ingreso.deposito.toLocaleString('es-MX')}</TableCell>
                                            <TableCell className="font-semibold">${ingreso.total.toLocaleString('es-MX')}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                <Card className="lg:col-span-7">
                    <CardHeader className="flex-row items-center justify-between">
                        <CardTitle>Egresos</CardTitle>
                        <Button variant="outline" onClick={() => { setEditingEgreso(null); setIsEgresoModalOpen(true); }}>
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
                                calculatedEgresos.map((egreso) => (
                                    <TableRow key={egreso.id}>
                                        <TableCell>{(egreso.fecha && isValid(new Date(egreso.fecha))) ? format(new Date(egreso.fecha), 'yyyy-MM-dd') : 'Fecha inválida'}</TableCell>
                                        <TableCell>{egreso.concepto}</TableCell>
                                        <TableCell>{egreso.aQuien}</TableCell>
                                        <TableCell className="font-semibold">${egreso.monto.toLocaleString('es-MX')}</TableCell>
                                        <TableCell>{egreso.comentarios}</TableCell>
                                        <TableCell className="text-right">
                                            {!egreso.id.startsWith('comm-') && (
                                                <div className="flex gap-1 justify-end">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenEditEgreso(egreso)}><Edit className="h-4 w-4" /></Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setEgresoToDelete(egreso)}><Trash2 className="h-4 w-4" /></Button>
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
                setIsEgresoModalOpen(false);
                setEditingEgreso(null);
                setQueryKey(prev => prev + 1);
            }}
            egreso={editingEgreso}
        />
        
        {egresoToDelete && (
            <AlertDialog open={!!egresoToDelete} onOpenChange={() => setEgresoToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Confirmar eliminación?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. Se eliminará permanentemente el egreso de <strong>{egresoToDelete.concepto}</strong> por <strong>${egresoToDelete.monto.toLocaleString('es-MX')}</strong>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteEgreso} className="bg-destructive hover:bg-destructive/90">
                            Sí, eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        )}
        </>
    );
}
