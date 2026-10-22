
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
import { where, Timestamp, writeBatch, collection, doc, getDocs, getDoc, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Info, Loader2, X, Percent } from 'lucide-react';
import type { Sale, Profesional, Service, Product, Egreso, SaleItem } from '@/lib/types';
import { Checkbox } from '../ui/checkbox';
import { cn } from '@/lib/utils';
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

    const todayStart = useMemo(() => startOfDay(new Date()), []);
    const todayEnd = useMemo(() => endOfDay(new Date()), []);

    const salesQueryConstraints = useMemo(() => {
        const start = dateRange?.from ? startOfDay(dateRange.from) : todayStart;
        const end = dateRange?.to ? endOfDay(dateRange.to) : (dateRange?.from ? endOfDay(dateRange.from) : todayEnd);

        const constraints = [];
        constraints.push(where('fecha_hora_venta', '>=', Timestamp.fromDate(start)));
        constraints.push(where('fecha_hora_venta', '<=', Timestamp.fromDate(end)));
        if (localId && localId !== 'todos') {
            constraints.push(where('local_id', '==', localId));
        }
        return constraints;
    }, [dateRange, todayStart, todayEnd, localId]);

    const startKey = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : format(todayStart, 'yyyy-MM-dd');
    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', salesQueryConstraints ? `sales-commissions-${startKey}-${localId}` : undefined, ...(salesQueryConstraints || []));
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
    const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');

    const isLoading = salesLoading || professionalsLoading || servicesLoading || productsLoading;

    const [combinedSales, setCombinedSales] = useState<Sale[]>([]);

    useEffect(() => {
        if (isLoading || !isOpen) return;

        let isCancelled = false;

        const syncCombinedSales = async () => {
            const start = dateRange?.from ? startOfDay(dateRange.from) : todayStart;
            const end = dateRange?.to ? endOfDay(dateRange.to) : (dateRange?.from ? endOfDay(dateRange.from) : todayEnd);
            const startStr = format(start, 'yyyy-MM-dd');
            const endStr = format(end, 'yyyy-MM-dd');

            const salesMap = new Map<string, Sale>();
            sales.forEach(s => {
                // If this sale was absorbed into another sale (e.g. advance liquidated at POS), ignore it to avoid duplicate commissions
                if ((s as any).absorbed_in_sale_id) {
                    return;
                }
                // Advance payments (tipo_venta === 'anticipo' or id starts with 'deposit_')
                // MUST NOT be awarded commission on the payment date (fecha_hora_venta).
                // They are only awarded on the appointment date once the client actually attended (estado === 'Asiste').
                // Retained deposits (tipo_venta === 'anticipo_retenido') are recognized on the date they were retained.
                if (s.tipo_venta === 'anticipo' || (s.id.startsWith('deposit_') && s.tipo_venta !== 'anticipo_retenido')) {
                    return;
                }
                salesMap.set(s.id, s);
            });

            try {
                // Fetch appointments in the selected date range and filter attended in memory (avoids composite index errors)
                const qRes = query(
                    collection(db, 'reservas'),
                    where('fecha', '>=', startStr),
                    where('fecha', '<=', endStr)
                );
                const resSnap = await getDocs(qRes);

                const attendedResIds: string[] = [];
                const directSaleIds = new Set<string>();

                resSnap.forEach(d => {
                    const r = d.data();
                    if (r.estado !== 'Asiste') return;
                    if (localId && localId !== 'todos' && r.local_id !== localId) return;

                    attendedResIds.push(d.id);
                    if (r.deposit_payment_id) {
                        directSaleIds.add(r.deposit_payment_id);
                    }
                    directSaleIds.add(d.id);
                });

                // 1. Fetch direct sale IDs if not already in salesMap
                const missingDirectIds = Array.from(directSaleIds).filter(id => !salesMap.has(id));
                if (missingDirectIds.length > 0) {
                    const docSnaps = await Promise.all(
                        missingDirectIds.map(id => getDoc(doc(db, 'ventas', id)).catch(err => {
                            console.error("Error fetching candidate sale for payment modal:", id, err);
                            return null;
                        }))
                    );
                    docSnaps.forEach(sDoc => {
                        if (sDoc && sDoc.exists()) {
                            const saleData = { id: sDoc.id, ...sDoc.data() } as Sale;
                            if (!(saleData as any).absorbed_in_sale_id) {
                                salesMap.set(saleData.id, saleData);
                            }
                        }
                    });
                }

                // 2. Query sales by reservationId in chunks of 30 for all attended reservations
                // This guarantees finding any deposit sale (e.g. deposit_ujT2... or Point terminal sales)
                if (attendedResIds.length > 0) {
                    const chunkSize = 30;
                    for (let i = 0; i < attendedResIds.length; i += chunkSize) {
                        const chunk = attendedResIds.slice(i, i + chunkSize);
                        try {
                            const qLinked = query(
                                collection(db, 'ventas'),
                                where('reservationId', 'in', chunk)
                            );
                            const linkedSnap = await getDocs(qLinked);
                            linkedSnap.forEach(sDoc => {
                                const saleData = { id: sDoc.id, ...sDoc.data() } as Sale;
                                if ((saleData as any).absorbed_in_sale_id) {
                                    return;
                                }
                                const hasFinalSale = Array.from(salesMap.values()).some(
                                    existing => existing.reservationId === saleData.reservationId && existing.tipo_venta !== 'anticipo' && !existing.id.startsWith('deposit_')
                                );
                                if (!hasFinalSale && !salesMap.has(saleData.id)) {
                                    salesMap.set(saleData.id, saleData);
                                }
                            });
                        } catch (err) {
                            console.error("Error fetching linked sales by reservationId for payment modal:", err);
                        }
                    }
                }
            } catch (err) {
                console.error("Error fetching attended reservations for advance commissions:", err);
            }

            if (!isCancelled) {
                setCombinedSales(Array.from(salesMap.values()));
            }
        };

        syncCombinedSales();

        return () => {
            isCancelled = true;
        };
    }, [isLoading, isOpen, sales, dateRange, localId, todayStart, todayEnd]);

    useEffect(() => {
        if (isLoading || !isOpen) return;

        const professionalMap = new Map(professionals.map(p => [p.id, p]));
        const serviceMap = new Map(services.map(s => [s.id, s]));
        const productMap = new Map(products.map(p => [p.id, p]));

        const commissionsByProfessional: Record<string, CommissionRowData> = {};

        combinedSales.forEach(sale => {
            const saleTip = (sale as any).propina || 0;
            const allSellersInSale = Array.from(new Set(sale.items?.map(i => i.barbero_id).filter(Boolean)));
            const professionalsInSale = allSellersInSale.filter(id => id && professionalMap.has(id));

            // Distribute tip among professionals in the sale, only if tip is not paid for this professional
            if (saleTip > 0 && professionalsInSale.length > 0) {
                const tipPerProfessional = saleTip / professionalsInSale.length;
                professionalsInSale.forEach(profId => {
                    // Check if tip has already been paid for this specific professional
                    const isTipPaidForProf = sale.tipsPaidTo 
                        ? sale.tipsPaidTo.includes(profId) 
                        : (sale as any).tipPaid === true;
                    if (isTipPaidForProf) return;

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
                const totalCovered = (sale.monto_pagado_real || 0) + (sale.anticipoPagado || 0) + Number((sale as any).descuento_alfacoins || 0);
                if (sale.monto_pagado_real !== undefined && (sale.total - totalCovered) > 1) {
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
        const validProfIds = new Set(commissionList.map(c => c.professionalId));
        setSelectedProfessionals(prev => prev.filter(id => validProfIds.has(id)));

    }, [isOpen, combinedSales, professionals, services, products, isLoading, discountsAffectCommissions]);

    useEffect(() => {
        if (!isOpen) {
            setSelectedProfessionals([]);
        }
    }, [isOpen, dateRange, localId]);

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'settings', 'commissions'), (docSnap) => {
            if (docSnap.exists()) {
                setDiscountsAffectCommissions(docSnap.data().discountsAffectCommissions ?? true);
            }
        }, (error) => {
            console.error("Error loading commission settings", error);
        });
        return () => unsubscribe();
    }, []);


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
            const tipsToUpdate = new Map<string, Set<string>>();
            const salesToUpdate = new Map<string, Sale>();
            const professionalMapForSave = new Map(professionals.map(p => [p.id, p]));

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
                        commission_payment_details: {
                            professionalId: comm.professionalId,
                            saleItemIds: comm.saleItemIds,
                            tipSaleIds: comm.tipSaleIds
                        }
                    });

                    // Mark items as paid (accumulate changes in salesToUpdate map declared outside the loop)
                    comm.saleItemIds.forEach(idPair => {
                        if (!salesToUpdate.has(idPair.saleId)) {
                            const originalSale = combinedSales.find(s => s.id === idPair.saleId);
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

                    // Collect tips to mark as paid
                    comm.tipSaleIds.forEach(saleId => {
                        if (!tipsToUpdate.has(saleId)) {
                            const originalSale = combinedSales.find(s => s.id === saleId);
                            tipsToUpdate.set(saleId, new Set(originalSale?.tipsPaidTo || []));
                        }
                        tipsToUpdate.get(saleId)!.add(comm.professionalId);
                    });
                }
            }

            // Apply all sales updates accumulated across all paid professionals
            salesToUpdate.forEach((updatedSale, saleId) => {
                const saleRef = doc(db, 'ventas', saleId);
                batch.update(saleRef, { items: updatedSale.items });
            });

            // Apply all tip updates
            tipsToUpdate.forEach((professionalIdsSet, saleId) => {
                const saleRef = doc(db, 'ventas', saleId);
                const professionalIds = Array.from(professionalIdsSet);
                
                // Determine if everyone in the sale has been paid for their tip
                const originalSale = combinedSales.find(s => s.id === saleId);
                const allSellersInSale = Array.from(new Set(originalSale?.items?.map(i => i.barbero_id).filter(Boolean)));
                const validProfessionalsIds = allSellersInSale.filter(id => id && professionalMapForSave.has(id));
                
                const isEveryonePaid = validProfessionalsIds.every(id => professionalIds.includes(id));

                batch.update(saleRef, { 
                    tipsPaidTo: professionalIds,
                    tipPaid: isEveryonePaid
                });
            });

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
            <DialogContent className="p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 w-[95vw] sm:w-full sm:max-w-4xl max-h-[88dvh] sm:max-h-[90vh] flex flex-col" hideCloseButton={true}>
                <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-5 border-b border-slate-800 text-white shrink-0">
                    <div className="header-light-beam" />
                    <div className="relative z-10 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Percent className="h-5 w-5 text-[#C5A880]" />
                            <div>
                                <DialogTitle className="text-base font-semibold text-white tracking-tight">
                                    Pago de Comisiones y Propinas
                                </DialogTitle>
                                <DialogDescription className="text-xs text-slate-300">
                                    Calcula y registra el pago para los profesionales en el periodo seleccionado
                                </DialogDescription>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => onOpenChange(false)}
                            className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>
                <div className="p-3 sm:p-6 flex-1 overflow-y-auto min-h-0 scrollbar-thin overscroll-contain touch-pan-y">
                    <Alert className="mb-3 hidden sm:flex">
                        <Info className="h-4 w-4" />
                        <AlertTitle>Revisión de Pagos</AlertTitle>
                        <AlertDescription>
                            El sistema ha calculado las comisiones y propinas pendientes de pago para el periodo seleccionado. Al presionar "Pagar", se generará un egreso por el total para cada profesional seleccionado.
                        </AlertDescription>
                    </Alert>

                    {/* VISTA ESCRITORIO: TABLA */}
                    <div className="hidden sm:block max-h-[50vh] sm:max-h-96 w-full">
                        <div className="overflow-x-auto w-full border rounded-xl scrollbar-thin overscroll-contain touch-pan-y">
                            <Table className="min-w-[600px] sm:min-w-full">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">
                                            <Checkbox
                                                checked={commissionData.length > 0 && selectedProfessionals.length === commissionData.length}
                                                onCheckedChange={(checked) => handleSelectAll(!!checked)}
                                            />
                                        </TableHead>
                                        <TableHead>Profesional</TableHead>
                                        <TableHead className="text-right whitespace-nowrap">Comisión Servicios</TableHead>
                                        <TableHead className="text-right whitespace-nowrap">Comisión Productos</TableHead>
                                        <TableHead className="text-right whitespace-nowrap">Propina</TableHead>
                                        <TableHead className="text-right whitespace-nowrap">Total a Pagar</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={6} className="text-center h-24"><Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" /></TableCell></TableRow>
                                    ) : commissionData.length === 0 ? (
                                        <TableRow><TableCell colSpan={6} className="text-center h-24 text-muted-foreground">No hay comisiones ni propinas pendientes para el periodo seleccionado.</TableCell></TableRow>
                                    ) : commissionData.map((row) => (
                                        <TableRow key={row.professionalId}>
                                            <TableCell>
                                                <Checkbox
                                                    checked={selectedProfessionals.includes(row.professionalId)}
                                                    onCheckedChange={(checked) => handleSelectProfessional(row.professionalId, checked)}
                                                />
                                            </TableCell>
                                            <TableCell className="font-medium whitespace-nowrap">{row.professionalName}</TableCell>
                                            <TableCell className="text-right">${row.totalServiceCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right">${row.totalProductCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right">${row.totalTips.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right font-semibold text-primary">${(row.totalCommission + row.totalTips).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-right font-bold text-base whitespace-nowrap">Total a Pagar Seleccionado</TableCell>
                                        <TableCell className="text-right font-bold text-base text-primary whitespace-nowrap">${overallTotalToPay.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </div>
                    </div>

                    {/* VISTA MÓVIL: TARJETAS TOUCH */}
                    <div className="sm:hidden space-y-2.5">
                        <div className="flex items-center justify-between p-2.5 bg-muted/20 border border-border/40 rounded-xl">
                            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-foreground select-none">
                                <Checkbox
                                    checked={commissionData.length > 0 && selectedProfessionals.length === commissionData.length}
                                    onCheckedChange={(checked) => handleSelectAll(!!checked)}
                                />
                                <span>Seleccionar todos ({selectedProfessionals.length}/{commissionData.length})</span>
                            </label>
                        </div>

                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center py-10">
                                <Loader2 className="h-6 w-6 animate-spin text-slate-400 mb-2" />
                                <span className="text-xs text-muted-foreground">Calculando comisiones...</span>
                            </div>
                        ) : commissionData.length === 0 ? (
                            <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded-xl p-4">
                                No hay comisiones ni propinas pendientes para el periodo seleccionado.
                            </div>
                        ) : (
                            commissionData.map((row) => {
                                const isSelected = selectedProfessionals.includes(row.professionalId);
                                const totalStaff = row.totalCommission + row.totalTips;
                                return (
                                    <div
                                        key={row.professionalId}
                                        onClick={() => handleSelectProfessional(row.professionalId, !isSelected)}
                                        className={cn(
                                            "p-3 rounded-xl border transition-all cursor-pointer",
                                            isSelected
                                                ? "border-blue-500/60 bg-blue-500/5 shadow-sm"
                                                : "border-border/60 bg-card/60 hover:bg-muted/10"
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <Checkbox
                                                    checked={isSelected}
                                                    onCheckedChange={(checked) => handleSelectProfessional(row.professionalId, checked)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                                <span className="font-semibold text-sm text-foreground truncate">{row.professionalName}</span>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className="text-[10px] text-muted-foreground block leading-tight">Total</span>
                                                <span className="text-sm font-bold text-foreground">
                                                    ${totalStaff.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-2.5 pt-2 border-t border-border/40 grid grid-cols-3 gap-1 text-[11px]">
                                            <div>
                                                <span className="text-muted-foreground text-[10px] block">Servicios</span>
                                                <span className="font-medium text-foreground">${row.totalServiceCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground text-[10px] block">Productos</span>
                                                <span className="font-medium text-foreground">${row.totalProductCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground text-[10px] block">Propinas</span>
                                                <span className="font-medium text-foreground">${row.totalTips.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
                <div className="p-3 sm:p-4 bg-muted/20 border-t border-border/40 flex items-center justify-between sm:justify-end gap-2 shrink-0">
                    <div className="sm:hidden flex flex-col">
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">Total a Pagar</span>
                        <span className="text-sm font-black text-foreground">
                            ${overallTotalToPay.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl h-9 text-xs sm:text-sm">Cancelar</Button>
                        <Button
                            variant="alfa"
                            onClick={handlePayCommissions}
                            disabled={isLoading || isProcessing || selectedProfessionals.length === 0}
                            className="px-4 sm:px-6 font-semibold h-9 text-xs sm:text-sm"
                        >
                            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Pagar ({selectedProfessionals.length})
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
