
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { DateRange } from 'react-day-picker';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    TableFooter
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { where, Timestamp, writeBatch, collection, doc, getDocs, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Info, Loader2 } from 'lucide-react';
import type { Sale, Profesional, Service, Product, Egreso, SaleItem } from '@/lib/types';
import { Checkbox } from '../ui/checkbox';
import { startOfDay, endOfDay, format } from 'date-fns';
import { es } from 'date-fns/locale';


interface CommissionPaymentModalProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    onFormSubmit: () => void;
    dateRange: DateRange | undefined;
    localId: string | null;
}

interface CommissionRowData {
    professionalId: string;
    professionalName: string;
    totalSales: number;
    totalServiceCommission: number; // New field
    totalProductCommission: number; // New field
    totalCommission: number; // Keeps total logic for backward compatibility/total sum
    totalTips: number;
    saleItemIds: { saleId: string; itemIndex: number }[];
    tipSaleIds: string[];
}

export function CommissionPaymentModal({ isOpen, onOpenChange, onFormSubmit, dateRange, localId }: CommissionPaymentModalProps) {
    const [commissionData, setCommissionData] = useState<CommissionRowData[]>([]);
    const [discountsAffectCommissions, setDiscountsAffectCommissions] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const { toast } = useToast();
    const [selectedProfessionals, setSelectedProfessionals] = useState<string[]>([]);

    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    const salesQueryConstraints = useMemo(() => {
        const constraints = [];
        constraints.push(where('fecha_hora_venta', '>=', Timestamp.fromDate(todayStart)));
        constraints.push(where('fecha_hora_venta', '<=', Timestamp.fromDate(todayEnd)));
        if (localId && localId !== 'todos') {
            constraints.push(where('local_id', '==', localId));
        }
        return constraints;
    }, [todayStart, todayEnd, localId]);

    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', salesQueryConstraints ? `sales-commissions-${format(todayStart, 'yyyy-MM-dd')}-${localId}` : undefined, ...(salesQueryConstraints || []));
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
    const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');

    const isLoading = salesLoading || professionalsLoading || servicesLoading || productsLoading;

    useEffect(() => {
        if (isLoading || !isOpen) return;

        const professionalMap = new Map(professionals.map(p => [p.id, p]));
        const serviceMap = new Map(services.map(s => [s.id, s]));
        const productMap = new Map(products.map(p => [p.id, p]));

        const commissionsByProfessional: Record<string, CommissionRowData> = {};

        sales.forEach(sale => {
            const saleTip = (sale as any).propina || 0;
            const professionalsInSale = Array.from(new Set(sale.items?.map(i => i.barbero_id).filter(Boolean)));

            // Distribute tip among professionals in the sale, only if tip is not paid
            if (saleTip > 0 && !(sale as any).tipPaid && professionalsInSale.length > 0) {
                const tipPerProfessional = saleTip / professionalsInSale.length;
                professionalsInSale.forEach(profId => {
                    const professional = professionalMap.get(profId);
                    if (professional) {
                        if (!commissionsByProfessional[profId]) {
                            commissionsByProfessional[profId] = {
                                professionalId: profId,
                                professionalName: professional.name,
                                totalSales: 0,
                                totalServiceCommission: 0,
                                totalProductCommission: 0,
                                totalCommission: 0,
                                totalTips: 0,
                                saleItemIds: [],
                                tipSaleIds: [],
                            };
                        }
                        commissionsByProfessional[profId].totalTips += tipPerProfessional;
                        if (!commissionsByProfessional[profId].tipSaleIds.includes(sale.id)) {
                            commissionsByProfessional[profId].tipSaleIds.push(sale.id);
                        }
                    }
                });
            }

            sale.items?.forEach((item, itemIndex) => {
                // Filter out non-completed payments for commissions
                if (sale.pago_estado === 'deposit_paid' || sale.pago_estado === 'Pago Parcial' || sale.pago_estado === 'Pendiente') return;

                // Safety check: specific for online/partial payments that might have been marked 'Pagado' incorrectly
                // If it has a tracked 'monto_pagado_real' that is less than the total, it's not fully paid.
                // We allow a small epsilon for floating point issues.
                if (sale.monto_pagado_real !== undefined && (sale.total - sale.monto_pagado_real) > 1) {
                    return;
                }

                if (!item.barbero_id || item.commissionPaid) return;

                const professional = professionalMap.get(item.barbero_id);
                if (!professional) return;

                if (!commissionsByProfessional[professional.id]) {
                    commissionsByProfessional[professional.id] = {
                        professionalId: professional.id,
                        professionalName: professional.name,
                        totalSales: 0,
                        totalServiceCommission: 0,
                        totalProductCommission: 0,
                        totalCommission: 0,
                        totalTips: 0,
                        saleItemIds: [],
                        tipSaleIds: [],
                    };
                }

                const itemPrice = item.subtotal || item.precio || 0;
                const itemDiscount = item.descuento?.monto || 0;
                // If discounts affect commissions (default), subtract discount. Otherwise use gross price.
                const finalItemPrice = discountsAffectCommissions ? (itemPrice - itemDiscount) : itemPrice;

                let commissionConfig = null;

                if (item.tipo === 'servicio') {
                    const service = serviceMap.get(item.id);
                    if (service) {
                        // Priority: 1. Specific Override per Service, 2. Service Default, 3. Professional Default (Base)
                        commissionConfig = professional?.comisionesPorServicio?.[service.id] || service.defaultCommission || professional.defaultCommission;
                    }
                } else if (item.tipo === 'producto') {
                    const product = productMap.get(item.id);
                    if (product) {
                        // Priority: 1. Specific Override per Product, 2. Product Default, 3. Professional Default (Base)
                        commissionConfig = professional?.comisionesPorProducto?.[product.id] || product.commission || professional.defaultCommission;
                    }
                }

                if (commissionConfig) {
                    const commissionAmount = commissionConfig.type === '%'
                        ? finalItemPrice * (commissionConfig.value / 100)
                        : commissionConfig.value;

                    commissionsByProfessional[professional.id].totalSales += finalItemPrice;

                    if (item.tipo === 'servicio') {
                        commissionsByProfessional[professional.id].totalServiceCommission += commissionAmount;
                    } else if (item.tipo === 'producto') {
                        commissionsByProfessional[professional.id].totalProductCommission += commissionAmount;
                    }

                    commissionsByProfessional[professional.id].totalCommission += commissionAmount;
                    commissionsByProfessional[professional.id].saleItemIds.push({ saleId: sale.id, itemIndex });
                }
            });
        });

        const commissionList = Object.values(commissionsByProfessional).filter(c => c.totalCommission > 0 || c.totalTips > 0);
        setCommissionData(commissionList);
        setSelectedProfessionals(commissionList.map(c => c.professionalId));

    }, [isOpen, sales, professionals, services, products, isLoading, discountsAffectCommissions]);

    useEffect(() => {
        if (!isOpen) return;
        const fetchSettings = async () => {
            try {
                const d = await getDoc(doc(db, 'settings', 'commissions'));
                if (d.exists()) {
                    setDiscountsAffectCommissions(d.data().discountsAffectCommissions ?? true);
                }
            } catch (e) {
                console.error("Error loading commission settings", e);
            }
        };
        fetchSettings();
    }, [isOpen]);


    const handlePayCommissions = async () => {
        if (selectedProfessionals.length === 0) {
            toast({ variant: 'destructive', title: 'Sin selección', description: 'Por favor, selecciona al menos un profesional para pagar.' });
            return;
        }
        setIsProcessing(true);
        try {
            const batch = writeBatch(db);
            const now = Timestamp.now();
            const formattedDate = format(now.toDate(), "dd/MM/yyyy HH:mm", { locale: es });

            const professionalsToPay = commissionData.filter(c => selectedProfessionals.includes(c.professionalId));

            for (const comm of professionalsToPay) {
                const totalPayment = comm.totalCommission + comm.totalTips;
                if (totalPayment > 0) {
                    // Create expense record
                    const egresoRef = doc(collection(db, 'egresos'));
                    batch.set(egresoRef, {
                        fecha: now,
                        monto: totalPayment,
                        concepto: 'Pago de Comisión y Propinas',
                        aQuien: comm.professionalId,
                        local_id: localId,
                        comentarios: `Pago a ${comm.professionalName} (Comisión Servicios: $${comm.totalServiceCommission.toFixed(2)}, Comisión Productos: $${comm.totalProductCommission.toFixed(2)}, Propina: $${comm.totalTips.toFixed(2)}) el ${formattedDate}`,
                    });

                    // Mark items as paid
                    const salesToUpdate = new Map<string, Sale>();
                    comm.saleItemIds.forEach(idPair => {
                        if (!salesToUpdate.has(idPair.saleId)) {
                            const originalSale = sales.find(s => s.id === idPair.saleId);
                            if (originalSale) {
                                // Deep copy to avoid modifying original state
                                salesToUpdate.set(idPair.saleId, JSON.parse(JSON.stringify(originalSale)));
                            }
                        }
                        const saleToUpdate = salesToUpdate.get(idPair.saleId);
                        if (saleToUpdate && saleToUpdate.items[idPair.itemIndex]) {
                            saleToUpdate.items[idPair.itemIndex].commissionPaid = true;
                        }
                    });

                    salesToUpdate.forEach((updatedSale, saleId) => {
                        const saleRef = doc(db, 'ventas', saleId);
                        batch.update(saleRef, { items: updatedSale.items });
                    });

                    // Mark tips as paid
                    comm.tipSaleIds.forEach(saleId => {
                        const saleRef = doc(db, 'ventas', saleId);
                        batch.update(saleRef, { tipPaid: true });
                    });
                }
            }

            await batch.commit();

            toast({ title: 'Comisiones y propinas pagadas', description: `Se han registrado ${professionalsToPay.length} egresos.` });
            onFormSubmit();
            onOpenChange(false);
        } catch (error) {
            console.error("Error al pagar comisiones y propinas:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron registrar los pagos.' });
        } finally {
            setIsProcessing(false);
        }
    }

    const handleSelectProfessional = (profId: string, checked: boolean | string) => {
        setSelectedProfessionals(prev =>
            checked ? [...prev, profId] : prev.filter(id => id !== profId)
        );
    }

    const handleSelectAll = (checked: boolean | string) => {
        setSelectedProfessionals(checked ? commissionData.map(c => c.professionalId) : []);
    }

    const overallTotalToPay = useMemo(() => {
        return commissionData
            .filter(c => selectedProfessionals.includes(c.professionalId))
            .reduce((acc, curr) => acc + curr.totalCommission + curr.totalTips, 0);
    }, [commissionData, selectedProfessionals]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Pago de Comisiones y Propinas del Día</DialogTitle>
                    <DialogDescription>
                        Calcula y registra el pago para los profesionales para el día de hoy.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Alert>
                        <Info className="h-4 w-4" />
                        <AlertTitle>Revisión de Pagos</AlertTitle>
                        <AlertDescription>
                            El sistema ha calculado las comisiones y propinas pendientes de pago para hoy. Al presionar "Pagar", se generará un egreso por el total para cada profesional seleccionado.
                        </AlertDescription>
                    </Alert>

                    <div className="mt-4 max-h-96">
                        <ScrollArea className="h-full">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">
                                            <Checkbox
                                                checked={commissionData.length > 0 && selectedProfessionals.length === commissionData.length}
                                                onCheckedChange={handleSelectAll}
                                            />
                                        </TableHead>
                                        <TableHead>Profesional</TableHead>
                                        <TableHead className="text-right">Comisión Servicios</TableHead>
                                        <TableHead className="text-right">Comisión Productos</TableHead>
                                        <TableHead className="text-right">Propina</TableHead>
                                        <TableHead className="text-right">Total a Pagar</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={6} className="text-center h-24"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                                    ) : commissionData.length === 0 ? (
                                        <TableRow><TableCell colSpan={6} className="text-center h-24">No hay comisiones ni propinas pendientes para hoy.</TableCell></TableRow>
                                    ) : commissionData.map((row) => (
                                        <TableRow key={row.professionalId}>
                                            <TableCell>
                                                <Checkbox
                                                    checked={selectedProfessionals.includes(row.professionalId)}
                                                    onCheckedChange={(checked) => handleSelectProfessional(row.professionalId, checked)}
                                                />
                                            </TableCell>
                                            <TableCell className="font-medium">{row.professionalName}</TableCell>
                                            <TableCell className="text-right">${row.totalServiceCommission.toLocaleString('es-MX')}</TableCell>
                                            <TableCell className="text-right">${row.totalProductCommission.toLocaleString('es-MX')}</TableCell>
                                            <TableCell className="text-right">${row.totalTips.toLocaleString('es-MX')}</TableCell>
                                            <TableCell className="text-right font-semibold text-primary">${(row.totalCommission + row.totalTips).toLocaleString('es-MX')}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-right font-bold text-lg">Total a Pagar Seleccionado</TableCell>
                                        <TableCell className="text-right font-bold text-lg text-primary">${overallTotalToPay.toLocaleString('es-MX')}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </ScrollArea>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handlePayCommissions} disabled={isLoading || isProcessing || selectedProfessionals.length === 0}>
                        {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Pagar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
