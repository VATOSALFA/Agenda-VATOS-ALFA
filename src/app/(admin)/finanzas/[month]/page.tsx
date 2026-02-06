'use client';

import { useParams } from 'next/navigation';
import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, ShoppingCart, Loader2, Edit, Save, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { AddEgresoModal } from '@/components/finanzas/add-egreso-modal';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Sale, Egreso, Profesional, Service, Product, User } from '@/lib/types';
import { where, Timestamp, doc, deleteDoc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { startOfMonth, endOfMonth, format, isValid } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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

    const { toast } = useToast();
    const [editingEgreso, setEditingEgreso] = useState<Egreso | null>(null);
    const [egresoToDelete, setEgresoToDelete] = useState<Egreso | null>(null);
    const [monthlyAdjustments, setMonthlyAdjustments] = useState<Record<string, { type: 'fixed' | 'percentage', value: number }>>({});
    const [editingCommissionUser, setEditingCommissionUser] = useState<{ id: string, name: string, type: 'fixed' | 'percentage', value: number } | null>(null);
    const [isCommissionModalOpen, setIsCommissionModalOpen] = useState(false);

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

    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', `sales-${monthName}-${queryKey}`, ...salesQueryConstraints);
    const { data: egresos, loading: egresosLoading } = useFirestoreQuery<Egreso>('egresos', `egresos-${monthName}-${queryKey}`, ...egresosQueryConstraints);
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
    const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');
    const { data: users, loading: usersLoading } = useFirestoreQuery<User>('usuarios');


    const [isEgresoModalOpen, setIsEgresoModalOpen] = useState(false);
    const [egresosPage, setEgresosPage] = useState(1);
    const [egresosPerPage, setEgresosPerPage] = useState(10);

    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

    const dailyIncome = useMemo(() => {
        if (!sales) return [];
        const groupedByDay = sales.reduce((acc, sale) => {
            const saleDate = format(sale.fecha_hora_venta.toDate(), 'yyyy-MM-dd');
            if (!acc[saleDate]) {
                acc[saleDate] = { fecha: saleDate, efectivo: 0, deposito: 0, total: 0 };
            }

            const realPaid = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                ? sale.monto_pagado_real
                : (sale.total || 0);

            const metodoPago = sale.metodo_pago;

            if (sale.pago_estado === 'deposit_paid' || metodoPago === 'mercadopago') {
                acc[saleDate].deposito += realPaid;
            } else if (metodoPago === 'efectivo') {
                acc[saleDate].efectivo += realPaid;
            } else if (['tarjeta', 'transferencia'].includes(metodoPago)) {
                acc[saleDate].deposito += realPaid;
            } else if (metodoPago === 'combinado' && sale.detalle_pago_combinado) {
                acc[saleDate].efectivo += sale.detalle_pago_combinado.efectivo || 0;
                acc[saleDate].deposito += (sale.detalle_pago_combinado.tarjeta || 0) + (sale.detalle_pago_combinado.pagos_en_linea || 0);
            }

            acc[saleDate].total += realPaid;
            return acc;
        }, {} as Record<string, { fecha: string; efectivo: number; deposito: number; total: number }>);

        return Object.values(groupedByDay).sort((a, b) => a.fecha.localeCompare(b.fecha));
    }, [sales]);

    // Fetch monthly adjustments
    useEffect(() => {
        if (!db) return;
        const docId = `${monthName.toLowerCase()}_${currentYear}`;
        const unsub = onSnapshot(doc(db, 'finanzas_mensuales', docId), (doc) => {
            if (doc.exists()) {
                setMonthlyAdjustments(doc.data().adminCommissions || {});
            } else {
                setMonthlyAdjustments({});
            }
        });
        return () => unsub();
    }, [monthName, currentYear]);

    // --- CORRECCIÓN APLICADA AQUÍ ---
    // Eliminamos el cálculo predictivo. Solo mostramos lo que existe en la BD 'egresos'.
    const calculatedEgresos = useMemo(() => {
        if (egresosLoading) return [];

        const manualEgresos: Egreso[] = egresos.map(e => ({
            ...e,
            fecha: e.fecha instanceof Timestamp ? e.fecha.toDate() : new Date(e.fecha)
        }));

        return manualEgresos.sort((a, b) => {
            const dateA = a.fecha instanceof Date ? a.fecha : new Date();
            const dateB = b.fecha instanceof Date ? b.fecha : new Date();
            return dateA.getTime() - dateB.getTime();
        });

    }, [egresos, egresosLoading]);
    // ---------------------------------


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
            const saleTotal = sale.total || 1;
            const realPaid = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                ? sale.monto_pagado_real
                : (sale.total || 0);
            const ratio = realPaid / saleTotal;

            sale.items?.forEach(item => {
                if (item.tipo === 'producto') {
                    const itemSubtotal = item.subtotal || ((item.precio || 0) * item.cantidad) || 0;
                    const itemDiscount = item.descuento?.monto || 0;
                    const finalItemPrice = (itemSubtotal - itemDiscount) * ratio;

                    ventaProductos += finalItemPrice;

                    const product = productMap.get(item.id);
                    if (product && product.purchase_cost) {
                        reinversion += product.purchase_cost * item.cantidad;
                    }

                    if (product && item.barbero_id) {
                        const professional = professionalMap.get(item.barbero_id);
                        if (professional) {
                            const commissionConfig = professional.comisionesPorProducto?.[product.id] || product.commission || professional.defaultCommission;
                            if (commissionConfig) {
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

        return { ventaProductos, reinversion, comisionProfesionales, utilidadVatosAlfa };
    }, [sales, products, professionals, salesLoading, productsLoading, professionalsLoading]);

    const { ventaProductos, reinversion, comisionProfesionales, utilidadVatosAlfa } = productSummary;

    const commissionsSummary = useMemo(() => {
        const summary: Record<string, { commission: number, tips: number, avatarUrl?: string }> = {};
        const profIdToData: Record<string, { name: string, avatarUrl?: string }> = {};

        professionals.forEach(prof => {
            summary[prof.name] = { commission: 0, tips: 0, avatarUrl: prof.avatarUrl };
            profIdToData[prof.id] = { name: prof.name, avatarUrl: prof.avatarUrl };
        });

        calculatedEgresos.forEach(egreso => {
            // Buscamos conceptos que indiquen comisión para agruparlos visualmente
            if (egreso.concepto.toLowerCase().includes('comisi')) {
                const profId = egreso.aQuien;
                const profData = profIdToData[profId];
                // Try to find by ID (most common now) or fallback to name if legacy data
                const profName = profData?.name || profId;

                if (summary[profName]) {
                    summary[profName].commission += egreso.monto;
                } else {
                    summary[profName] = { commission: egreso.monto, tips: 0, avatarUrl: profData?.avatarUrl };
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

    // Calculate Local Admin Commissions
    // Calculate Local Admin Commissions
    const localAdminCommissions = useMemo(() => {
        if (!users) return [];
        return users
            .filter(u => u.role === 'Administrador local')
            .map(u => {
                // Check for monthly override
                const adjustment = monthlyAdjustments[u.id];
                // Base config
                const baseType = u.commissionType || 'none';
                const baseValue = u.commissionValue || 0;

                const type = adjustment ? adjustment.type : baseType;
                const value = adjustment ? adjustment.value : baseValue;

                if (!type || type === 'none') return null;

                let amount = 0;
                if (type === 'fixed') {
                    amount = value || 0;
                } else if (type === 'percentage') {
                    amount = subtotalUtilidad * ((value || 0) / 100);
                }

                return {
                    name: u.name,
                    amount,
                    type,
                    value,
                    id: u.id,
                };
            })
            .filter((u): u is NonNullable<typeof u> => u !== null);
    }, [users, subtotalUtilidad, monthlyAdjustments]);

    const totalLocalAdminCommissions = localAdminCommissions.reduce((acc, curr) => acc + curr.amount, 0);

    // Keep legacy Beatriz logic separate if she is NOT in the users list with a config, 
    // OR migrate her to be just another admin if the user prefers. 
    // For now, let's assume the "Comisión de Beatriz" hardcoded field is legacy and we might want to hide it if she is now a configured user,
    // or just leave it as a manual override/legacy setting.
    // The user request implies replacing/augmenting.
    // "if I choose that I don't want to give him utility that section of commission that appears in the summaries of the months is hidden"

    // Let's assume we ADD these new commissions to the list.



    // If we have dynamic admins, maybe we don't need the hardcoded Beatriz one? 
    // But the user didn't explicitly say "remove Beatriz hardcoded field". 
    // They just said "adjust in the summaries".
    // I'll subtract BOTH for Utility Net.

    const utilidadNeta = subtotalUtilidad - totalLocalAdminCommissions;


    const isLoading = salesLoading || egresosLoading || professionalsLoading || servicesLoading || productsLoading || usersLoading;
    const totalResumenEgresos = totalComisiones + nominaTotal + costosFijosTotal;

    const handleEditCommission = (admin: { id: string, name: string, type: 'fixed' | 'percentage' | 'none' | undefined, value: number | undefined }) => {
        const type = (admin.type === 'fixed' || admin.type === 'percentage') ? admin.type : 'fixed';
        const value = admin.value || 0;

        setEditingCommissionUser({
            id: admin.id,
            name: admin.name,
            type,
            value
        });
        setIsCommissionModalOpen(true);
    };

    const handleSaveCommission = async () => {
        if (!editingCommissionUser || !db) return;

        try {
            const docId = `${monthName.toLowerCase()}_${currentYear}`;
            const adjustmentData = {
                type: editingCommissionUser.type,
                value: editingCommissionUser.value
            };

            await setDoc(doc(db, 'finanzas_mensuales', docId), {
                adminCommissions: {
                    [editingCommissionUser.id]: adjustmentData
                }
            }, { merge: true });

            toast({ title: "Comisión actualizada", description: `Se ha actualizado la comisión para ${monthName}.` });
            setIsCommissionModalOpen(false);
        } catch (error) {
            console.error("Error saving commission adjustment:", error);
            toast({ variant: "destructive", title: "Error", description: "No se pudo guardar la configuración." });
        }
    };

    const handleOpenEditEgreso = (egreso: Egreso) => {
        const editableEgreso = {
            ...egreso,
            fecha: egreso.fecha instanceof Timestamp ? egreso.fecha.toDate() : new Date(egreso.fecha)
        }
        setEditingEgreso(editableEgreso);
        setIsEgresoModalOpen(true);
    };

    const handleDeleteEgreso = async () => {
        if (!egresoToDelete || !db) return;
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

    const safeFormatDate = (date: Timestamp | Date | undefined) => {
        if (!date) return 'Fecha inválida';
        const dateObj = date instanceof Timestamp ? date.toDate() : new Date(date);
        if (!isValid(dateObj)) return 'Fecha inválida';
        return format(dateObj, 'yyyy-MM-dd');
    };


    const totalEgresosPages = Math.ceil(calculatedEgresos.length / egresosPerPage);
    const paginatedEgresos = calculatedEgresos.slice(
        (egresosPage - 1) * egresosPerPage,
        egresosPage * egresosPerPage
    );

    return (
        <>
            <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
                <h2 className="text-3xl font-bold tracking-tight">Resumen de {monthName.toLowerCase()}</h2>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
                    <Card className="lg:col-span-4">
                        <CardHeader>
                            <CardTitle>Resumen</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1 text-sm">
                            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                                <>
                                    <ResumenGeneralItem label="Ingreso total" amount={ingresoTotal} />
                                    <ResumenGeneralItem label="Egreso total" amount={egresoTotal} />
                                    <ResumenGeneralItem label="Subtotal de utilidad" amount={subtotalUtilidad} isBold />
                                    {localAdminCommissions.map(admin => (
                                        <ResumenGeneralItem
                                            key={admin.id}
                                            label={`Comisión ${admin.name} (${admin.type === 'percentage' ? admin.value + '%' : 'Fijo'})`}
                                            amount={admin.amount}
                                        >
                                            <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" onClick={() => handleEditCommission(admin)}>
                                                <Edit className="h-3 w-3" />
                                            </Button>
                                        </ResumenGeneralItem>
                                    ))}



                                    <ResumenGeneralItem label="Utilidad neta" amount={utilidadNeta} isPrimary isBold className="text-xl" />
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
                                <span className="font-semibold text-muted-foreground">-${reinversion.toLocaleString('es-MX')}</span>
                            </div>
                            <div className="flex justify-between items-center text-base">
                                <span className="text-muted-foreground">Comisión de profesionales</span>
                                <span className="font-semibold text-muted-foreground">-${comisionProfesionales.toLocaleString('es-MX')}</span>
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
                                    <AccordionContent className="p-0">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="hover:bg-transparent">
                                                    <TableHead className="w-[40%]">Profesional</TableHead>
                                                    <TableHead className="text-right">Comisión</TableHead>
                                                    <TableHead className="text-right">Propinas</TableHead>
                                                    <TableHead className="text-right">Total</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {commissionsSummary.map(({ name, commission, tips, avatarUrl }) => (
                                                    <TableRow key={name}>
                                                        <TableCell className="font-medium flex items-center gap-2">
                                                            <Avatar className="h-8 w-8">
                                                                <AvatarImage src={avatarUrl} alt={name} />
                                                                <AvatarFallback>{name.charAt(0)}</AvatarFallback>
                                                            </Avatar>
                                                            <span>{name}</span>
                                                        </TableCell>
                                                        <TableCell className="text-right">${commission.toLocaleString('es-MX')}</TableCell>
                                                        <TableCell className="text-right">${tips.toLocaleString('es-MX')}</TableCell>
                                                        <TableCell className="text-right font-bold text-primary">${(commission + tips).toLocaleString('es-MX')}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
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
                                <PlusCircle className="mr-2 h-4 w-4" /> Agregar egreso
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
                                        paginatedEgresos.map((egreso) => (
                                            <TableRow key={egreso.id}>
                                                <TableCell>{safeFormatDate(egreso.fecha)}</TableCell>
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
                            {calculatedEgresos.length > 0 && (
                                <div className="flex items-center justify-end space-x-6 pt-4 pb-4">
                                    <div className="flex items-center space-x-2">
                                        <p className="text-sm font-medium">Resultados por página</p>
                                        <Select
                                            value={`${egresosPerPage}`}
                                            onValueChange={(value) => {
                                                setEgresosPerPage(Number(value));
                                                setEgresosPage(1);
                                            }}
                                        >
                                            <SelectTrigger className="h-8 w-[70px]">
                                                <SelectValue placeholder={egresosPerPage} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="10">10</SelectItem>
                                                <SelectItem value="20">20</SelectItem>
                                                <SelectItem value="50">50</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="text-sm font-medium">
                                        Página {egresosPage} de {totalEgresosPages}
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setEgresosPage(prev => Math.max(prev - 1, 1))}
                                            disabled={egresosPage === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setEgresosPage(prev => Math.min(prev + 1, totalEgresosPages))}
                                            disabled={egresosPage === totalEgresosPages}
                                        >
                                            Siguiente <ChevronRight className="h-4 w-4 ml-1" />
                                        </Button>
                                    </div>
                                </div>
                            )}
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

            <Dialog open={isCommissionModalOpen} onOpenChange={setIsCommissionModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ajustar Comisión Mensual</DialogTitle>
                        <DialogDescription>
                            Ajuste la comisión para <strong>{editingCommissionUser?.name}</strong> solo para el mes de <strong>{monthName}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    {editingCommissionUser && (
                        <div className="grid gap-4 py-4">
                            <div className="flex flex-col gap-2">
                                <Label>Tipo de comisión</Label>
                                <Select
                                    value={editingCommissionUser.type}
                                    onValueChange={(val: 'fixed' | 'percentage') => setEditingCommissionUser({ ...editingCommissionUser, type: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="fixed">Monto Fijo</SelectItem>
                                        <SelectItem value="percentage">Porcentaje Utilidad</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label>{editingCommissionUser.type === 'fixed' ? 'Monto ($)' : 'Porcentaje (%)'}</Label>
                                <Input
                                    type="number"
                                    value={editingCommissionUser.value}
                                    onChange={(e) => setEditingCommissionUser({ ...editingCommissionUser, value: Number(e.target.value) })}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCommissionModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveCommission}>Guardar Ajuste</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}