'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, ShoppingCart, Loader2, Edit, Save, Trash2, ChevronLeft, ChevronRight, HelpCircle, TrendingUp, DollarSign, FileEdit, X } from 'lucide-react';
import { AddEgresoModal } from '@/components/finanzas/add-egreso-modal';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Sale, Egreso, Profesional, Service, Product, User } from '@/lib/types';
import { where, Timestamp, doc, deleteDoc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
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

const numberToMonthName: { [key: number]: string } = {
    0: 'enero', 1: 'febrero', 2: 'marzo', 3: 'abril', 4: 'mayo', 5: 'junio',
    6: 'julio', 7: 'agosto', 8: 'septiembre', 9: 'octubre', 10: 'noviembre', 11: 'diciembre'
};

const monthLabels = [
    { value: 'enero', label: 'Enero' },
    { value: 'febrero', label: 'Febrero' },
    { value: 'marzo', label: 'Marzo' },
    { value: 'abril', label: 'Abril' },
    { value: 'mayo', label: 'Mayo' },
    { value: 'junio', label: 'Junio' },
    { value: 'julio', label: 'Julio' },
    { value: 'agosto', label: 'Agosto' },
    { value: 'septiembre', label: 'Septiembre' },
    { value: 'octubre', label: 'Octubre' },
    { value: 'noviembre', label: 'Noviembre' },
    { value: 'diciembre', label: 'Diciembre' },
];

const COLORS = {
    primary: '#202A49',
    secondary: '#314177',
    accent: '#C9C9C9'
};

const ResumenEgresoItem = ({ label, amount, isBold, isPrimary }: { label: string, amount: number, isBold?: boolean, isPrimary?: boolean }) => (
    <div className="flex justify-between items-center text-base py-1.5 border-b last:border-b-0">
        <span className={cn("text-muted-foreground", isBold && "font-bold text-foreground", isPrimary && "font-bold text-primary flex items-center")}>{label}</span>
        <span className={cn("font-semibold", isBold && "font-extrabold", isPrimary && "text-primary")}>${amount.toLocaleString('es-MX')}</span>
    </div>
);

const ResumenGeneralItem = ({ label, children, amount, isBold, isPrimary, className, tooltipText }: { label: string, children?: React.ReactNode, amount: number, isBold?: boolean, isPrimary?: boolean, className?: string, tooltipText?: string }) => (
    <div className={cn("flex justify-between items-center text-lg py-2 border-b last:border-0", className)}>
        <div className="flex items-center gap-2">
            <span className={cn(isBold && 'font-semibold', isPrimary && 'text-primary')}>{label}</span>
            {tooltipText && (
                <TooltipProvider>
                    <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p className="max-w-xs text-sm font-normal text-center">{tooltipText}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}
            {children}
        </div>
        <span className={cn(isBold && 'font-bold', isPrimary && 'text-primary font-extrabold')}>{`$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
    </div>
);


export default function FinanzasMensualesPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const monthName = typeof params.month === 'string' ? params.month : 'enero';
    const monthNumber = monthNameToNumber[monthName.toLowerCase()];
    const currentYear = new Date().getFullYear();

    // Read year from URL query param, fallback to current year
    const yearFromUrl = searchParams.get('year');
    const [selectedYear, setSelectedYear] = useState(() => {
        if (yearFromUrl) return parseInt(yearFromUrl, 10);
        return currentYear;
    });
    const [queryKey, setQueryKey] = useState(0);

    // Sync year from URL when it changes (e.g. browser back/forward)
    useEffect(() => {
        if (yearFromUrl) {
            const parsed = parseInt(yearFromUrl, 10);
            if (!isNaN(parsed) && parsed !== selectedYear) {
                setSelectedYear(parsed);
            }
        }
    }, [yearFromUrl]);

    // Dynamic year range: from 2024 to current year + 1
    const startYear = 2024;
    const years = Array.from({ length: (currentYear + 1) - startYear + 1 }, (_, i) => startYear + i);

    // Navigation helpers — year is always included in the URL
    const navigateToMonth = (newMonthName: string, yearOverride?: number) => {
        const yearToUse = yearOverride ?? selectedYear;
        router.push(`/finanzas/${newMonthName}?year=${yearToUse}`);
    };

    const goToPrevMonth = () => {
        const currentIdx = monthNumber;
        if (currentIdx === 0) {
            // Go to December of previous year
            const newYear = selectedYear - 1;
            setSelectedYear(newYear);
            router.push(`/finanzas/diciembre?year=${newYear}`);
        } else {
            router.push(`/finanzas/${numberToMonthName[currentIdx - 1]}?year=${selectedYear}`);
        }
    };

    const goToNextMonth = () => {
        const currentIdx = monthNumber;
        if (currentIdx === 11) {
            // Go to January of next year
            const newYear = selectedYear + 1;
            setSelectedYear(newYear);
            router.push(`/finanzas/enero?year=${newYear}`);
        } else {
            router.push(`/finanzas/${numberToMonthName[currentIdx + 1]}?year=${selectedYear}`);
        }
    };

    const handleYearChange = (newYear: string) => {
        const yr = Number(newYear);
        setSelectedYear(yr);
        router.push(`/finanzas/${monthName}?year=${yr}`);
    };

    const { toast } = useToast();
    const [editingEgreso, setEditingEgreso] = useState<Egreso | null>(null);
    const [egresoToDelete, setEgresoToDelete] = useState<Egreso | null>(null);
    const [monthlyAdjustments, setMonthlyAdjustments] = useState<Record<string, { type: 'fixed' | 'percentage', value: number }>>({});
    const [monthlyProductAdjustments, setMonthlyProductAdjustments] = useState<Record<string, { type: 'fixed' | 'percentage', value: number }>>({});
    const [editingCommissionUser, setEditingCommissionUser] = useState<{ id: string, name: string, type: 'fixed' | 'percentage', value: number } | null>(null);
    const [editingCommissionType, setEditingCommissionType] = useState<'service' | 'product'>('service');
    const [isCommissionModalOpen, setIsCommissionModalOpen] = useState(false);

    const { startDate, endDate } = useMemo(() => {
        if (monthNumber === undefined) {
            const now = new Date();
            // If month is undefined, defaulting to current month of selected year might be better, 
            // but let's stick to simple logic or just use StartOfMonth of selected Year's specific month if logic flow allows.
            // Actually monthNumber comes from URL, so it should be defined if route is valid.
            return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
        }
        const date = new Date(selectedYear, monthNumber, 1);
        return {
            startDate: startOfMonth(date),
            endDate: endOfMonth(date),
        };
    }, [monthNumber, selectedYear]);

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

    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', `sales-${monthName}-${selectedYear}-${queryKey}`, ...salesQueryConstraints);
    const { data: egresos, loading: egresosLoading } = useFirestoreQuery<Egreso>('egresos', `egresos-${monthName}-${selectedYear}-${queryKey}`, ...egresosQueryConstraints);
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
    const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');
    const { data: users, loading: usersLoading } = useFirestoreQuery<User>('usuarios');


    const [isEgresoModalOpen, setIsEgresoModalOpen] = useState(false);
    const [egresosPage, setEgresosPage] = useState(1);
    const [egresosPerPage, setEgresosPerPage] = useState(10);
    const [incomesPage, setIncomesPage] = useState(1);
    const [incomesPerPage, setIncomesPerPage] = useState(10);

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

    // --- Manual Override State ---
    interface ManualOverrideData {
        servicios_ingreso: number;
        servicios_egreso: number;
        servicios_subtotal: number;
        servicios_comision_admin: number;
        servicios_utilidad: number;
        productos_ingreso: number;
        productos_reinversion: number;
        productos_comision_prof: number;
        productos_subtotal: number;
        productos_utilidad: number;
        egresos_comisiones_servicios: { nombre: string; monto: number }[];
        egresos_comisiones_productos: number;
        egresos_nomina: number;
        egresos_costos_fijos: number;
    }
    const [manualOverride, setManualOverride] = useState<ManualOverrideData | null>(null);
    const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
    const [overrideForm, setOverrideForm] = useState<ManualOverrideData>({
        servicios_ingreso: 0,
        servicios_egreso: 0,
        servicios_subtotal: 0,
        servicios_comision_admin: 0,
        servicios_utilidad: 0,
        productos_ingreso: 0,
        productos_reinversion: 0,
        productos_comision_prof: 0,
        productos_subtotal: 0,
        productos_utilidad: 0,
        egresos_comisiones_servicios: [],
        egresos_comisiones_productos: 0,
        egresos_nomina: 0,
        egresos_costos_fijos: 0,
    });
    const [isSavingOverride, setIsSavingOverride] = useState(false);

    // Fetch monthly adjustments + manual override
    useEffect(() => {
        if (!db) return;
        const docId = `${monthName.toLowerCase()}_${selectedYear}`;
        const unsub = onSnapshot(doc(db, 'finanzas_mensuales', docId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setMonthlyAdjustments(data.adminCommissions || {});
                setMonthlyProductAdjustments(data.adminProductCommissions || {});
                if (data.manualOverride) {
                    setManualOverride(data.manualOverride as ManualOverrideData);
                } else {
                    setManualOverride(null);
                }
            } else {
                setMonthlyAdjustments({});
                setMonthlyProductAdjustments({});
                setManualOverride(null);
            }
        });
        return () => unsub();
    }, [monthName, selectedYear]);

    const openOverrideModal = () => {
        if (manualOverride) {
            setOverrideForm({ ...manualOverride });
        } else {
            setOverrideForm({
                servicios_ingreso: ingresoServiciosTotal,
                servicios_egreso: egresoTotal,
                servicios_subtotal: subtotalUtilidad,
                servicios_comision_admin: totalLocalAdminCommissions,
                servicios_utilidad: utilidadNeta,
                productos_ingreso: ventaProductos,
                productos_reinversion: reinversion,
                productos_comision_prof: comisionProfesionales,
                productos_subtotal: utilidadVatosAlfa,
                productos_utilidad: utilidadNetaProductos,
                egresos_comisiones_servicios: commissionsSummary.filter(c => c.commissionServices > 0).map(c => ({ nombre: c.name, monto: c.commissionServices })),
                egresos_comisiones_productos: totalComisionesProductos,
                egresos_nomina: nominaTotal,
                egresos_costos_fijos: costosFijosTotal,
            });
        }
        setIsOverrideModalOpen(true);
    };

    const handleSaveOverride = async () => {
        if (!db) return;
        setIsSavingOverride(true);
        try {
            const docId = `${monthName.toLowerCase()}_${selectedYear}`;
            await setDoc(doc(db, 'finanzas_mensuales', docId), {
                manualOverride: overrideForm
            }, { merge: true });
            toast({ title: 'Datos guardados', description: `Se han guardado los datos manuales para ${monthName} ${selectedYear}.` });
            setIsOverrideModalOpen(false);
        } catch (error) {
            console.error('Error saving override:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron guardar los datos.' });
        } finally {
            setIsSavingOverride(false);
        }
    };

    const handleDeleteOverride = async () => {
        if (!db) return;
        try {
            const docId = `${monthName.toLowerCase()}_${selectedYear}`;
            // We use setDoc with merge to remove just the manualOverride field
            const docRef = doc(db, 'finanzas_mensuales', docId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = { ...docSnap.data() };
                delete data.manualOverride;
                await setDoc(docRef, data);
            }
            toast({ title: 'Override eliminado', description: 'Se han restaurado los datos automáticos.' });
            setIsOverrideModalOpen(false);
        } catch (error) {
            console.error('Error deleting override:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el override.' });
        }
    };

    const addComisionServicio = () => {
        setOverrideForm(prev => ({
            ...prev,
            egresos_comisiones_servicios: [...prev.egresos_comisiones_servicios, { nombre: '', monto: 0 }]
        }));
    };

    const removeComisionServicio = (index: number) => {
        setOverrideForm(prev => ({
            ...prev,
            egresos_comisiones_servicios: prev.egresos_comisiones_servicios.filter((_, i) => i !== index)
        }));
    };

    const updateComisionServicio = (index: number, field: 'nombre' | 'monto', value: string | number) => {
        setOverrideForm(prev => {
            const updated = [...prev.egresos_comisiones_servicios];
            updated[index] = { ...updated[index], [field]: value };
            return { ...prev, egresos_comisiones_servicios: updated };
        });
    };

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
    const ingresoServiciosTotal = useMemo(() => {
        if (!sales) return 0;
        let total = 0;
        sales.forEach(sale => {
            const saleTotal = sale.total || 1;
            const realPaid = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                ? sale.monto_pagado_real
                : (sale.total || 0);
            const ratio = realPaid / saleTotal;

            sale.items?.forEach(item => {
                if (item.tipo === 'servicio') {
                    const itemSubtotal = item.subtotal || ((item.precio || 0) * item.cantidad) || 0;
                    const itemDiscount = item.descuento?.monto || 0;
                    const finalItemPrice = (itemSubtotal - itemDiscount) * ratio;
                    total += finalItemPrice;
                }
            });
        });
        return total;
    }, [sales]);

    const ingresoTotal = useMemo(() => dailyIncome.reduce((sum, d) => sum + d.total, 0), [dailyIncome]); // Mantener por si acaso, pero usaremos el de servicios

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
        const summary: Record<string, { commissionServices: number, commissionProducts: number, tips: number, avatarUrl?: string, active?: boolean }> = {};
        const profIdToData: Record<string, { name: string, avatarUrl?: string, active?: boolean }> = {};

        professionals.forEach(prof => {
            summary[prof.name] = { commissionServices: 0, commissionProducts: 0, tips: 0, avatarUrl: prof.avatarUrl, active: prof.active };
            profIdToData[prof.id] = { name: prof.name, avatarUrl: prof.avatarUrl, active: prof.active };
        });

        calculatedEgresos.forEach(egreso => {
            // Buscamos conceptos que indiquen comisión para agruparlos visualmente
            if (egreso.concepto.toLowerCase().includes('comisi')) {
                const profId = egreso.aQuien;
                const profData = profIdToData[profId];
                // Try to find by ID (most common now) or fallback to name if legacy data
                const profName = profData?.name || profId;

                let serviceAmount = 0;
                let productAmount = 0;
                let tipAmount = 0;

                // Intentar parsear el comentario para separar servicios y productos
                // Formato esperado: "Pago a X (Comisión Servicios: $70.00, Comisión Productos: $26.85, Propina: $0.00)..."
                const serviceMatch = egreso.comentarios?.match(/Comisión Servicios: \$([0-9.,]+)/);
                const productMatch = egreso.comentarios?.match(/Comisión Productos: \$([0-9.,]+)/);
                const tipMatch = egreso.comentarios?.match(/Propina: \$([0-9.,]+)/);

                if (serviceMatch || productMatch) {
                    if (serviceMatch) serviceAmount = parseFloat(serviceMatch[1].replace(/,/g, ''));
                    if (productMatch) productAmount = parseFloat(productMatch[1].replace(/,/g, ''));
                    if (tipMatch) tipAmount = parseFloat(tipMatch[1].replace(/,/g, ''));

                    // Si el monto total del egreso es mayor que la suma parseada (por ajuste manual u otro), 
                    // asignamos la diferencia a Servicios por defecto o respetamos el parseo?
                    // Respetamos el parseo para la división, pero si la suma no cuadra con egreso.monto,
                    // podría haber un desbalance visual.
                    // Para simplificar, asumimos que si hay desglose, es correcto.
                    // Si NO hay desglose en el comentario pero es una "comisión", todo a servicios.
                } else {
                    serviceAmount = egreso.monto;
                }

                if (summary[profName]) {
                    summary[profName].commissionServices += serviceAmount;
                    summary[profName].commissionProducts += productAmount;
                    summary[profName].tips += tipAmount;
                } else {
                    // Fallback using parsed amounts or total to service
                    const legacyProf = professionals.find(p => p.name === profName);
                    summary[profName] = {
                        commissionServices: serviceAmount,
                        commissionProducts: productAmount,
                        tips: tipAmount,
                        avatarUrl: profData?.avatarUrl || legacyProf?.avatarUrl,
                        active: profData?.active ?? legacyProf?.active ?? false
                    };
                }
            }
        });

        return Object.entries(summary)
            .filter(([_, data]) => {
                // Mostrar si tiene algún monto > 0 (histórico o actual)
                return data.commissionServices > 0 || data.commissionProducts > 0 || data.tips > 0;
            })
            .map(([name, data]) => ({
                name,
                ...data
            }));

    }, [calculatedEgresos, professionals]);

    const totalComisionesServicios = commissionsSummary.reduce((acc, curr) => acc + curr.commissionServices + curr.tips, 0);
    const totalComisionesProductos = commissionsSummary.reduce((acc, curr) => acc + curr.commissionProducts, 0);
    const totalComisiones = totalComisionesServicios + totalComisionesProductos;

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

    const egresoTotal = (totalComisiones + nominaTotal + costosFijosTotal) - comisionProfesionales;

    // Subtotal de Utilidad = Ingreso Servicios - Egreso (ajustado sin productos)
    // NOTA: ventaProductos ya NO se resta aquí porque ingresoServiciosTotal NO incluye productos.
    const subtotalUtilidad = ingresoServiciosTotal - egresoTotal;

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

    // Calculate Local Admin Product Commissions
    const localAdminProductCommissions = useMemo(() => {
        if (!users) return [];
        return users
            .filter(u => u.role === 'Administrador local')
            .map(u => {
                const adjustment = monthlyProductAdjustments[u.id];
                // Default to none if not set specifically for products for this month
                const type = adjustment ? adjustment.type : 'none';
                const value = adjustment ? adjustment.value : 0;

                if (!type || type === 'none') return null;

                let amount = 0;
                if (type === 'fixed') {
                    amount = value || 0;
                } else if (type === 'percentage') {
                    amount = utilidadVatosAlfa * ((value || 0) / 100);
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
    }, [users, utilidadVatosAlfa, monthlyProductAdjustments]);

    const totalLocalAdminProductCommissions = localAdminProductCommissions.reduce((acc, curr) => acc + curr.amount, 0);
    const utilidadNetaProductos = utilidadVatosAlfa - totalLocalAdminProductCommissions;

    const utilidadNeta = subtotalUtilidad - totalLocalAdminCommissions;


    const isLoading = salesLoading || egresosLoading || professionalsLoading || servicesLoading || productsLoading || usersLoading;
    const totalResumenEgresos = totalComisiones + nominaTotal + costosFijosTotal;

    // --- Apply manual overrides ---
    const hasOverride = !!manualOverride;
    const display = {
        servicios_ingreso: hasOverride ? manualOverride!.servicios_ingreso : ingresoServiciosTotal,
        servicios_egreso: hasOverride ? manualOverride!.servicios_egreso : egresoTotal,
        servicios_subtotal: hasOverride ? manualOverride!.servicios_subtotal : subtotalUtilidad,
        servicios_comision_admin: hasOverride ? manualOverride!.servicios_comision_admin : totalLocalAdminCommissions,
        servicios_utilidad: hasOverride ? manualOverride!.servicios_utilidad : utilidadNeta,
        productos_ingreso: hasOverride ? manualOverride!.productos_ingreso : ventaProductos,
        productos_reinversion: hasOverride ? manualOverride!.productos_reinversion : reinversion,
        productos_comision_prof: hasOverride ? manualOverride!.productos_comision_prof : comisionProfesionales,
        productos_subtotal: hasOverride ? manualOverride!.productos_subtotal : utilidadVatosAlfa,
        productos_utilidad: hasOverride ? manualOverride!.productos_utilidad : utilidadNetaProductos,
        egresos_comisiones_servicios_total: hasOverride
            ? manualOverride!.egresos_comisiones_servicios.reduce((sum, c) => sum + c.monto, 0)
            : totalComisionesServicios,
        egresos_comisiones_servicios_list: hasOverride
            ? manualOverride!.egresos_comisiones_servicios
            : commissionsSummary.filter(c => c.commissionServices > 0 || c.tips > 0).map(c => ({ nombre: c.name, monto: c.commissionServices + c.tips })),
        egresos_comisiones_productos: hasOverride ? manualOverride!.egresos_comisiones_productos : totalComisionesProductos,
        egresos_nomina: hasOverride ? manualOverride!.egresos_nomina : nominaTotal,
        egresos_costos_fijos: hasOverride ? manualOverride!.egresos_costos_fijos : costosFijosTotal,
    };
    const display_totalEgresos = display.egresos_comisiones_servicios_total + display.egresos_comisiones_productos + display.egresos_nomina + display.egresos_costos_fijos;
    const display_ingresosTotalesMes = display.servicios_ingreso + display.productos_ingreso;
    const display_utilidadNetaTotal = display.servicios_utilidad + display.productos_utilidad;
    const display_margen = display_ingresosTotalesMes > 0 ? (display_utilidadNetaTotal / display_ingresosTotalesMes * 100) : 0;

    const handleEditCommission = (admin: { id: string, name: string, type: 'fixed' | 'percentage' | 'none' | undefined, value: number | undefined }, type: 'service' | 'product') => {
        const commType = (admin.type === 'fixed' || admin.type === 'percentage') ? admin.type : 'fixed';
        const value = admin.value || 0;

        setEditingCommissionUser({
            id: admin.id,
            name: admin.name,
            type: commType,
            value
        });
        setEditingCommissionType(type);
        setIsCommissionModalOpen(true);
    };

    const handleSaveCommission = async () => {
        if (!editingCommissionUser || !db) return;

        try {
            const docId = `${monthName.toLowerCase()}_${selectedYear}`;
            const adjustmentData = {
                type: editingCommissionUser.type,
                value: editingCommissionUser.value
            };

            const fieldToUpdate = editingCommissionType === 'service' ? 'adminCommissions' : 'adminProductCommissions';

            await setDoc(doc(db, 'finanzas_mensuales', docId), {
                [fieldToUpdate]: {
                    [editingCommissionUser.id]: adjustmentData
                }
            }, { merge: true });

            toast({ title: "Comisión actualizada", description: `Se ha actualizado la comisión de ${editingCommissionType === 'service' ? 'servicios' : 'productos'} para ${monthName}.` });
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
        return format(dateObj, 'dd/MM/yyyy');
    };

    const getNameFromId = (id: string) => {
        if (!id) return '';
        const professional = professionals?.find(p => p.id === id);
        if (professional) return professional.name;

        const user = users?.find(u => u.id === id);
        if (user) return user.name;

        return id;
    };


    const totalEgresosPages = Math.ceil(calculatedEgresos.length / egresosPerPage);
    const paginatedEgresos = calculatedEgresos.slice(
        (egresosPage - 1) * egresosPerPage,
        egresosPage * egresosPerPage
    );

    const totalIncomesPages = Math.ceil(dailyIncome.length / incomesPerPage);
    const paginatedIncomes = dailyIncome.slice(
        (incomesPage - 1) * incomesPerPage,
        incomesPage * incomesPerPage
    );

    return (
        <>
            <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" onClick={goToPrevMonth} className="h-9 w-9">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Select value={monthName.toLowerCase()} onValueChange={(val) => navigateToMonth(val)}>
                            <SelectTrigger className="w-[160px] text-lg font-bold capitalize">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {monthLabels.map((m) => (
                                    <SelectItem key={m.value} value={m.value}>
                                        {m.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button variant="outline" size="icon" onClick={goToNextMonth} className="h-9 w-9">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <Select value={String(selectedYear)} onValueChange={handleYearChange}>
                        <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="Año" />
                        </SelectTrigger>
                        <SelectContent>
                            {years.map((y) => (
                                <SelectItem key={y} value={String(y)}>
                                    {y}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {hasOverride && (
                        <Badge variant="outline" className="text-xs border-amber-500 text-amber-600 bg-amber-50">
                            📋 Datos manuales
                        </Badge>
                    )}
                    <Button variant="outline" size="sm" onClick={openOverrideModal}>
                        <FileEdit className="h-4 w-4 mr-2" /> Editar datos
                    </Button>
                </div>

                {/* KPI Cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
                    {/* Primary Color Card */}
                    <Card style={{ backgroundColor: COLORS.primary }} className="text-white border-none shadow-lg">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-white/90">Ingresos Totales (Mes)</CardTitle>
                            <DollarSign className="h-4 w-4 text-white/80" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">${display_ingresosTotalesMes.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            <p className="text-xs text-white/70">Productos + Servicios</p>
                        </CardContent>
                    </Card>

                    {/* Secondary Color Card */}
                    <Card style={{ backgroundColor: COLORS.secondary }} className="text-white border-none shadow-lg">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-white/90">Utilidad Neta Total</CardTitle>
                            <TrendingUp className="h-4 w-4 text-white/80" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">${display_utilidadNetaTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            <p className="text-xs text-white/70">Después de todos los gastos</p>
                        </CardContent>
                    </Card>

                    {/* Accent Color Card */}
                    <Card style={{ backgroundColor: COLORS.accent }} className="text-slate-900 border-none shadow-lg">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-slate-800">Margen Promedio</CardTitle>
                            <TrendingUp className="h-4 w-4 text-slate-700" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-slate-900">
                                {display_margen.toFixed(1)}%
                            </div>
                            <p className="text-xs text-slate-700">Rendimiento mensual</p>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
                    <Card className="lg:col-span-4">
                        <CardHeader>
                            <CardTitle>Resumen de servicios</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1 text-sm">
                            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                                <>
                                    <ResumenGeneralItem
                                        label="Ingreso total"
                                        amount={display.servicios_ingreso}
                                        tooltipText="Total de ingresos provenientes exclusivamente de servicios."
                                    />
                                    <ResumenGeneralItem
                                        label="Egreso total"
                                        amount={display.servicios_egreso}
                                        tooltipText="Egreso total menos las comisiones de productos (solo gastos operativos y de servicios)."
                                    />
                                    <ResumenGeneralItem
                                        label="Subtotal de utilidad"
                                        amount={display.servicios_subtotal}
                                        isBold
                                        tooltipText="Ingreso por servicios menos Egresos (sin considerar comisiones de productos)."
                                    />
                                    {users?.filter(u => u.role === 'Administrador local').map(admin => {
                                        const commission = localAdminCommissions.find(c => c.id === admin.id);
                                        const hasCommission = !!commission;
                                        const type = commission?.type || 'none';
                                        const value = commission?.value || 0;

                                        return (
                                            <ResumenGeneralItem
                                                key={admin.id}
                                                label={`Comisión ${admin.name} ${hasCommission ? `(${type === 'percentage' ? value + '%' : 'Fijo'})` : '(Configurar)'}`}
                                                amount={commission?.amount || 0}
                                                tooltipText="Si el dueño decide pagarle un porcentaje, se calcula del subtotal de la utilidad de servicios."
                                            >
                                                <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" onClick={() => handleEditCommission({ id: admin.id, name: admin.name, type: type as any, value }, 'service')}>
                                                    <Edit className="h-3 w-3" />
                                                </Button>
                                            </ResumenGeneralItem>
                                        );
                                    })}



                                    <ResumenGeneralItem
                                        label="Utilidad neta"
                                        amount={display.servicios_utilidad}
                                        isPrimary
                                        isBold
                                        className="text-xl"
                                        tooltipText="Se considera la ganancia final del mes."
                                    />
                                </>
                            )}
                        </CardContent>
                    </Card>
                    <Card className="lg:col-span-4">
                        <CardHeader>
                            <CardTitle>Resumen de productos</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1 text-sm">
                            <ResumenGeneralItem
                                label="Ingreso total"
                                amount={display.productos_ingreso}
                            />
                            <ResumenGeneralItem
                                label="Reinversión"
                                amount={-display.productos_reinversion}
                                className="text-muted-foreground"
                            />
                            <ResumenGeneralItem
                                label="Comisión de profesionales"
                                amount={-display.productos_comision_prof}
                                className="text-muted-foreground"
                            />
                            <ResumenGeneralItem
                                label="Subtotal de utilidad"
                                amount={display.productos_subtotal}
                                isBold
                            />

                            {/* Mostrar administradores locales para configurar comisión (si hay alguno) */}
                            {users?.filter(u => u.role === 'Administrador local').map(admin => {
                                const commission = localAdminProductCommissions.find(c => c.id === admin.id);
                                const hasCommission = !!commission;
                                const type = commission?.type || 'none';
                                const value = commission?.value || 0;

                                return (
                                    <ResumenGeneralItem
                                        key={admin.id}
                                        label={`Comisión ${admin.name} ${hasCommission ? `(${type === 'percentage' ? value + '%' : 'Fijo'})` : '(Configurar)'}`}
                                        amount={commission?.amount || 0}
                                        tooltipText="Comisión del administrador sobre la utilidad de productos."
                                    >
                                        <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" onClick={() => handleEditCommission({ id: admin.id, name: admin.name, type: type as any, value }, 'product')}>
                                            <Edit className="h-3 w-3" />
                                        </Button>
                                    </ResumenGeneralItem>
                                );
                            })}


                            <ResumenGeneralItem
                                label="Utilidad neta"
                                amount={display.productos_utilidad}
                                isPrimary
                                isBold
                                className="text-xl pt-2 border-t mt-2"
                            />
                        </CardContent>
                    </Card>
                    <Card className="lg:col-span-4">
                        <CardHeader>
                            <CardTitle>Egresos</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Accordion type="multiple" className="w-full">
                                <AccordionItem value="comisiones-servicios" className="border-b-0">
                                    <div className="flex justify-between items-center text-base py-1.5 border-b">
                                        <AccordionTrigger className="flex-grow hover:no-underline font-normal p-0">
                                            <span className="text-muted-foreground">Comisiones Servicios</span>
                                        </AccordionTrigger>
                                        <span className="font-semibold mr-4">${display.egresos_comisiones_servicios_total.toLocaleString('es-MX')}</span>
                                    </div>
                                    <AccordionContent className="p-0">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="hover:bg-transparent">
                                                    <TableHead className="w-[60%]">Profesional</TableHead>
                                                    <TableHead className="text-right">Monto</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {display.egresos_comisiones_servicios_list.map((item) => (
                                                    <TableRow key={item.nombre}>
                                                        <TableCell className="font-medium">
                                                            <span>{item.nombre}</span>
                                                        </TableCell>
                                                        <TableCell className="text-right font-bold text-primary">${item.monto.toLocaleString('es-MX')}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </AccordionContent>
                                </AccordionItem>

                                <AccordionItem value="comisiones-productos" className="border-b-0">
                                    <div className="flex justify-between items-center text-base py-1.5 border-b">
                                        <AccordionTrigger className="flex-grow hover:no-underline font-normal p-0">
                                            <span className="text-muted-foreground">Comisiones Productos</span>
                                        </AccordionTrigger>
                                        <span className="font-semibold mr-4">${display.egresos_comisiones_productos.toLocaleString('es-MX')}</span>
                                    </div>
                                    <AccordionContent className="p-0">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="hover:bg-transparent">
                                                    <TableHead className="w-[60%]">Profesional</TableHead>
                                                    <TableHead className="text-right">Comisión</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {commissionsSummary.filter(c => c.commissionProducts > 0).map(({ name, commissionProducts, avatarUrl }) => (
                                                    <TableRow key={name}>
                                                        <TableCell className="font-medium flex items-center gap-2">
                                                            <Avatar className="h-8 w-8">
                                                                <AvatarImage src={avatarUrl} alt={name} />
                                                                <AvatarFallback>{name.charAt(0)}</AvatarFallback>
                                                            </Avatar>
                                                            <span>{name}</span>
                                                        </TableCell>
                                                        <TableCell className="text-right font-bold text-primary">${commissionProducts.toLocaleString('es-MX')}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                            <ResumenEgresoItem label="Nómina" amount={display.egresos_nomina} />
                            <ResumenEgresoItem label="Costos fijos" amount={display.egresos_costos_fijos} />
                            <div className="flex justify-between items-center text-lg pt-2 mt-2">
                                <span className="font-bold text-primary">Total</span>
                                <span className="font-extrabold text-primary text-lg">${display_totalEgresos.toLocaleString('es-MX')}</span>
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
                                        paginatedIncomes.map((ingreso, i) => (
                                            <TableRow key={i}>
                                                <TableCell>{ingreso.fecha.split('-').reverse().join('/')}</TableCell>
                                                <TableCell>${ingreso.efectivo.toLocaleString('es-MX')}</TableCell>
                                                <TableCell>${ingreso.deposito.toLocaleString('es-MX')}</TableCell>
                                                <TableCell className="font-semibold">${ingreso.total.toLocaleString('es-MX')}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                            {dailyIncome.length > 0 && (
                                <div className="flex items-center justify-end space-x-6 pt-4 pb-4">
                                    <div className="flex items-center space-x-2">
                                        <p className="text-sm font-medium">Resultados por página</p>
                                        <Select
                                            value={`${incomesPerPage}`}
                                            onValueChange={(value) => {
                                                setIncomesPerPage(Number(value));
                                                setIncomesPage(1);
                                            }}
                                        >
                                            <SelectTrigger className="h-8 w-[70px]">
                                                <SelectValue placeholder={incomesPerPage} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="10">10</SelectItem>
                                                <SelectItem value="20">20</SelectItem>
                                                <SelectItem value="50">50</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="text-sm font-medium">
                                        Página {incomesPage} de {totalIncomesPages}
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Button
                                            variant="outline"
                                            className="h-8 w-8 p-0"
                                            onClick={() => setIncomesPage(p => Math.max(1, p - 1))}
                                            disabled={incomesPage === 1}
                                        >
                                            <span className="sr-only">Anterior</span>
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="h-8 w-8 p-0"
                                            onClick={() => setIncomesPage(p => Math.min(totalIncomesPages, p + 1))}
                                            disabled={incomesPage === totalIncomesPages}
                                        >
                                            <span className="sr-only">Siguiente</span>
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
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
                                                <TableCell>{getNameFromId(egreso.aQuien)}</TableCell>
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
                        <DialogTitle>Ajustar Comisión Mensual ({editingCommissionType === 'service' ? 'Servicios' : 'Productos'})</DialogTitle>
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

            {/* Manual Override Dialog */}
            <Dialog open={isOverrideModalOpen} onOpenChange={setIsOverrideModalOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Editar datos financieros — {monthName.charAt(0).toUpperCase() + monthName.slice(1)} {selectedYear}</DialogTitle>
                        <DialogDescription>
                            Ingresa los datos manuales para este mes. Los datos automáticos serán reemplazados.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        {/* Resumen de Servicios */}
                        <div className="space-y-3">
                            <h4 className="font-semibold text-sm text-primary border-b pb-1">Resumen de Servicios</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs">Ingreso total</Label>
                                    <Input type="number" step="0.01" value={overrideForm.servicios_ingreso} onChange={e => setOverrideForm(f => ({ ...f, servicios_ingreso: Number(e.target.value) }))} />
                                </div>
                                <div>
                                    <Label className="text-xs">Egreso total</Label>
                                    <Input type="number" step="0.01" value={overrideForm.servicios_egreso} onChange={e => setOverrideForm(f => ({ ...f, servicios_egreso: Number(e.target.value) }))} />
                                </div>
                                <div>
                                    <Label className="text-xs">Subtotal de utilidad</Label>
                                    <Input type="number" step="0.01" value={overrideForm.servicios_subtotal} onChange={e => setOverrideForm(f => ({ ...f, servicios_subtotal: Number(e.target.value) }))} />
                                </div>
                                <div>
                                    <Label className="text-xs">Comisión admin</Label>
                                    <Input type="number" step="0.01" value={overrideForm.servicios_comision_admin} onChange={e => setOverrideForm(f => ({ ...f, servicios_comision_admin: Number(e.target.value) }))} />
                                </div>
                                <div className="col-span-2">
                                    <Label className="text-xs">Utilidad neta</Label>
                                    <Input type="number" step="0.01" value={overrideForm.servicios_utilidad} onChange={e => setOverrideForm(f => ({ ...f, servicios_utilidad: Number(e.target.value) }))} />
                                </div>
                            </div>
                        </div>

                        {/* Resumen de Productos */}
                        <div className="space-y-3">
                            <h4 className="font-semibold text-sm text-primary border-b pb-1">Resumen de Productos</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs">Ingreso total</Label>
                                    <Input type="number" step="0.01" value={overrideForm.productos_ingreso} onChange={e => setOverrideForm(f => ({ ...f, productos_ingreso: Number(e.target.value) }))} />
                                </div>
                                <div>
                                    <Label className="text-xs">Reinversión</Label>
                                    <Input type="number" step="0.01" value={overrideForm.productos_reinversion} onChange={e => setOverrideForm(f => ({ ...f, productos_reinversion: Number(e.target.value) }))} />
                                </div>
                                <div>
                                    <Label className="text-xs">Comisión profesionales</Label>
                                    <Input type="number" step="0.01" value={overrideForm.productos_comision_prof} onChange={e => setOverrideForm(f => ({ ...f, productos_comision_prof: Number(e.target.value) }))} />
                                </div>
                                <div>
                                    <Label className="text-xs">Subtotal utilidad</Label>
                                    <Input type="number" step="0.01" value={overrideForm.productos_subtotal} onChange={e => setOverrideForm(f => ({ ...f, productos_subtotal: Number(e.target.value) }))} />
                                </div>
                                <div className="col-span-2">
                                    <Label className="text-xs">Utilidad neta</Label>
                                    <Input type="number" step="0.01" value={overrideForm.productos_utilidad} onChange={e => setOverrideForm(f => ({ ...f, productos_utilidad: Number(e.target.value) }))} />
                                </div>
                            </div>
                        </div>

                        {/* Egresos */}
                        <div className="space-y-3">
                            <h4 className="font-semibold text-sm text-primary border-b pb-1">Egresos</h4>

                            <div>
                                <Label className="text-xs font-medium">Comisiones Servicios (por profesional)</Label>
                                <div className="space-y-2 mt-2">
                                    {overrideForm.egresos_comisiones_servicios.map((item, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                            <Input
                                                placeholder="Nombre"
                                                value={item.nombre}
                                                onChange={e => updateComisionServicio(index, 'nombre', e.target.value)}
                                                className="flex-1"
                                            />
                                            <Input
                                                type="number"
                                                step="0.01"
                                                placeholder="Monto"
                                                value={item.monto}
                                                onChange={e => updateComisionServicio(index, 'monto', Number(e.target.value))}
                                                className="w-32"
                                            />
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeComisionServicio(index)}>
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    <Button variant="outline" size="sm" onClick={addComisionServicio}>
                                        <PlusCircle className="h-4 w-4 mr-1" /> Agregar profesional
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <Label className="text-xs">Comisiones Productos</Label>
                                    <Input type="number" step="0.01" value={overrideForm.egresos_comisiones_productos} onChange={e => setOverrideForm(f => ({ ...f, egresos_comisiones_productos: Number(e.target.value) }))} />
                                </div>
                                <div>
                                    <Label className="text-xs">Nómina</Label>
                                    <Input type="number" step="0.01" value={overrideForm.egresos_nomina} onChange={e => setOverrideForm(f => ({ ...f, egresos_nomina: Number(e.target.value) }))} />
                                </div>
                                <div>
                                    <Label className="text-xs">Costos fijos</Label>
                                    <Input type="number" step="0.01" value={overrideForm.egresos_costos_fijos} onChange={e => setOverrideForm(f => ({ ...f, egresos_costos_fijos: Number(e.target.value) }))} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="flex-col sm:flex-row gap-2">
                        {hasOverride && (
                            <Button variant="destructive" size="sm" onClick={handleDeleteOverride} className="mr-auto">
                                <Trash2 className="h-4 w-4 mr-1" /> Restaurar datos automáticos
                            </Button>
                        )}
                        <Button variant="outline" onClick={() => setIsOverrideModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveOverride} disabled={isSavingOverride}>
                            {isSavingOverride ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                            Guardar datos
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}