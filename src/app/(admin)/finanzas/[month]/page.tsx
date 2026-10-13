'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowRight, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Edit, LineChart, TrendingUp, Save, Undo, MoreVertical, Search, CalendarDays, ExternalLink, HelpCircle, PlusCircle, ShoppingCart, Loader2, Trash2, DollarSign, FileEdit, X, ArrowUpDown, Minus, UserCircle, ArrowUpRight, ArrowDownLeft, Download, Percent, Scissors } from "lucide-react";
import * as XLSX from 'xlsx';
import { AddEgresoModal } from '@/components/finanzas/add-egreso-modal';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Sale, Egreso, Profesional, Service, Product, User, IngresoManual } from '@/lib/types';
import { where, Timestamp, doc, deleteDoc, onSnapshot, setDoc, getDoc, updateDoc, collection } from 'firebase/firestore';
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

const capitalize = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

const COLORS = {
    primary: '#202A49',
    secondary: '#314177',
    accent: '#C9C9C9'
};

const ResumenGeneralItem = ({ label, children, amount, isBold, isPrimary, className, tooltipText }: { label: string, children?: React.ReactNode, amount: number, isBold?: boolean, isPrimary?: boolean, className?: string, tooltipText?: string }) => {
    const isNegative = amount < 0;
    const formattedAmount = isNegative
        ? `-$${Math.abs(amount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <div className={cn("flex justify-between items-center text-sm sm:text-base py-2 border-b border-border/40 last:border-0", className)}>
            <div className="flex items-center gap-2">
                <span className={cn(isBold && 'font-semibold', isPrimary && 'text-blue-400 font-medium')}>{label}</span>
                {tooltipText && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-3 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white">
                            <p className="max-w-xs text-xs sm:text-sm font-normal text-slate-300 text-center">{tooltipText}</p>
                        </PopoverContent>
                    </Popover>
                )}
                {children}
            </div>
            <span className={cn(
                isBold && 'font-bold',
                isPrimary ? 'text-blue-400 font-bold text-base sm:text-lg' : 'font-semibold text-foreground',
                isNegative && 'text-red-400 font-semibold'
            )}>
                {formattedAmount}
            </span>
        </div>
    );
};

const CurrencyInput = ({ value, onChange, className }: { value: number, onChange: (val: number) => void, className?: string }) => {
    const [localValue, setLocalValue] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        if (!isFocused) {
            setLocalValue(value === 0 || value === undefined ? '' : value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
        }
    }, [value, isFocused]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawValue = e.target.value;
        const numberString = rawValue.replace(/[^0-9.]/g, '');

        if (numberString === '') {
            setLocalValue('');
            onChange(0);
            return;
        }

        const parts = numberString.split('.');
        let cleanString = numberString;
        if (parts.length > 2) {
            cleanString = parts[0] + '.' + parts.slice(1).join('');
        }

        let formattedStr = cleanString;
        const split = cleanString.split('.');
        let whole = split[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        if (split.length > 1) {
            formattedStr = `${whole}.${split[1]}`;
        } else {
            formattedStr = whole;
        }

        setLocalValue(formattedStr);

        const num = parseFloat(cleanString);
        onChange(isNaN(num) ? 0 : num);
    };

    return (
        <div className={cn("relative", className)}>
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">$</span>
            <Input
                type="text"
                className="pl-7"
                placeholder="0"
                value={localValue}
                onChange={handleChange}
                onFocus={() => {
                    setIsFocused(true);
                    if (value === 0) setLocalValue('');
                }}
                onBlur={() => {
                    setIsFocused(false);
                    setLocalValue(value === 0 || value === undefined ? '' : value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
                }}
            />
        </div>
    );
};


function ResumenEgresoItem({ label, amount, tooltip }: { label: string, amount: number, tooltip?: string }) {
    const isNegative = amount < 0;
    const formattedAmount = isNegative
        ? `-$${Math.abs(amount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <div className="flex justify-between items-center text-xs sm:text-sm py-1.5 border-b border-border/40 last:border-0 text-muted-foreground">
            <span className="flex items-center">
                {label}
                {tooltip && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <HelpCircle className="h-3.5 w-3.5 inline-block ml-1 cursor-help" />
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-3 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white">
                            <p className="max-w-xs text-xs text-slate-300">{tooltip}</p>
                        </PopoverContent>
                    </Popover>
                )}
            </span>
            <span className={cn(isNegative ? "font-semibold text-red-400" : "font-semibold text-foreground")}>
                {formattedAmount}
            </span>
        </div>
    );
}

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

    const incomesManualQueryConstraints = useMemo(() => {
        return [
            where('fecha', '>=', Timestamp.fromDate(startDate)),
            where('fecha', '<=', Timestamp.fromDate(endDate))
        ]
    }, [startDate, endDate]);

    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', `sales-${monthName}-${selectedYear}-${queryKey}`, ...salesQueryConstraints);
    const { data: egresos, loading: egresosLoading } = useFirestoreQuery<Egreso>('egresos', `egresos-${monthName}-${selectedYear}-${queryKey}`, ...egresosQueryConstraints);
    const { data: incomesManual, loading: incomesManualLoading } = useFirestoreQuery<IngresoManual>('ingresos_manuales', `incomes-${monthName}-${selectedYear}-${queryKey}`, ...incomesManualQueryConstraints);
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
    const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');
    const { data: users, loading: usersLoading } = useFirestoreQuery<User>('usuarios');
    const { data: liquidaciones, loading: liquidacionesLoading } = useFirestoreQuery<any>(`finanzas_mensuales/${monthName.toLowerCase()}_${selectedYear}/liquidaciones_admin`, `liq-${monthName}-${selectedYear}-${queryKey}`);


    const [isEgresoModalOpen, setIsEgresoModalOpen] = useState(false);
    const [egresosPage, setEgresosPage] = useState(1);
    const [egresosPerPage, setEgresosPerPage] = useState(10);
    const [incomesPage, setIncomesPage] = useState(1);
    const [incomesPerPage, setIncomesPerPage] = useState(10);
    const [cashMovementsPage, setCashMovementsPage] = useState(1);
    const [cashMovementsPerPage, setCashMovementsPerPage] = useState(10);

    // Sort configurations
    type SortDirection = 'asc' | 'desc';
    const [ingresosSortConfig, setIngresosSortConfig] = useState<{ key: string; direction: SortDirection }>({ key: 'fecha', direction: 'asc' });
    const [egresosSortConfig, setEgresosSortConfig] = useState<{ key: string; direction: SortDirection }>({ key: 'fecha', direction: 'asc' });
    const [cashMovementsSortConfig, setCashMovementsSortConfig] = useState<{ key: string; direction: SortDirection }>({ key: 'fecha', direction: 'desc' });

    const [isIngresosCollapsed, setIsIngresosCollapsed] = useState(true);
    const [isEgresosCollapsed, setIsEgresosCollapsed] = useState(true);
    const [isMovementsCollapsed, setIsMovementsCollapsed] = useState(true);
    const [isAdminBalanceCollapsed, setIsAdminBalanceCollapsed] = useState(true);
    const [isLiquidacionModalOpen, setIsLiquidacionModalOpen] = useState(false);
    const [isEditingComment, setIsEditingComment] = useState(false);
    const [commentToEdit, setCommentToEdit] = useState<{ id: string, type: 'egreso' | 'ingreso' | 'liquidacion', comment: string, monto?: number } | null>(null);

    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

    const dailyIncome = useMemo(() => {
        if (!sales) return [];
        const groupedByDay = sales.reduce((acc, sale) => {
            const saleDate = format(sale.fecha_hora_venta.toDate(), 'yyyy-MM-dd');
            if (!acc[saleDate]) {
                acc[saleDate] = { fecha: saleDate, efectivo: 0, tarjeta: 0, transferencia: 0, pagos_en_linea: 0, deposito: 0, total: 0 };
            }

            const realPaid = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                ? sale.monto_pagado_real
                : (sale.total || 0);

            const metodoPago = sale.metodo_pago;

            if (metodoPago === 'mercadopago') {
                acc[saleDate].pagos_en_linea += realPaid;
                acc[saleDate].deposito += realPaid;
            } else if (metodoPago === 'efectivo') {
                acc[saleDate].efectivo += realPaid;
            } else if (metodoPago === 'tarjeta') {
                acc[saleDate].tarjeta += realPaid;
                acc[saleDate].deposito += realPaid;
            } else if (metodoPago === 'transferencia') {
                acc[saleDate].transferencia += realPaid;
                acc[saleDate].deposito += realPaid;
            } else if (metodoPago === 'combinado' && sale.detalle_pago_combinado) {
                const ce = sale.detalle_pago_combinado.efectivo || 0;
                const ct = sale.detalle_pago_combinado.tarjeta || 0;
                const ctr = sale.detalle_pago_combinado.transferencia || 0;
                const co = sale.detalle_pago_combinado.pagos_en_linea || 0;
                const csum = ce + ct + ctr + co;

                if (csum > realPaid && sale.propina && Math.abs(csum - (realPaid + sale.propina)) < 0.05) {
                    const pMetodo = (sale as any).propina_metodo;
                    let adjE = ce, adjT = ct, adjTr = ctr, adjO = co;
                    if (pMetodo === 'tarjeta') adjT = Math.max(0, ct - sale.propina);
                    else if (pMetodo === 'efectivo') adjE = Math.max(0, ce - sale.propina);
                    else if (pMetodo === 'transferencia') adjTr = Math.max(0, ctr - sale.propina);
                    else if (pMetodo === 'mercadopago' || pMetodo === 'en_linea') adjO = Math.max(0, co - sale.propina);
                    else {
                        const f = realPaid / csum;
                        adjE = ce * f; adjT = ct * f; adjTr = ctr * f; adjO = co * f;
                    }
                    acc[saleDate].efectivo += adjE;
                    acc[saleDate].tarjeta += adjT;
                    acc[saleDate].transferencia += adjTr;
                    acc[saleDate].pagos_en_linea += adjO;
                    acc[saleDate].deposito += adjT + adjTr + adjO;
                } else {
                    acc[saleDate].efectivo += ce;
                    acc[saleDate].tarjeta += ct;
                    acc[saleDate].transferencia += ctr;
                    acc[saleDate].pagos_en_linea += co;
                    acc[saleDate].deposito += ct + ctr + co;
                }
            } else if (sale.pago_estado === 'deposit_paid') {
                acc[saleDate].pagos_en_linea += realPaid;
                acc[saleDate].deposito += realPaid;
            }

            acc[saleDate].total += realPaid;
            return acc;
        }, {} as Record<string, { fecha: string; efectivo: number; tarjeta: number; transferencia: number; pagos_en_linea: number; deposito: number; total: number }>);

        return Object.values(groupedByDay).sort((a, b) => {
            const { key, direction } = ingresosSortConfig;
            const dir = direction === 'asc' ? 1 : -1;

            if (key === 'fecha') {
                return a.fecha.localeCompare(b.fecha) * dir;
            } else if (key === 'efectivo') {
                return (a.efectivo - b.efectivo) * dir;
            } else if (key === 'tarjeta') {
                return (a.tarjeta - b.tarjeta) * dir;
            } else if (key === 'transferencia') {
                return (a.transferencia - b.transferencia) * dir;
            } else if (key === 'pagos_en_linea') {
                return (a.pagos_en_linea - b.pagos_en_linea) * dir;
            } else if (key === 'deposito') {
                return (a.deposito - b.deposito) * dir;
            } else if (key === 'total') {
                return (a.total - b.total) * dir;
            }
            return 0;
        });
    }, [sales, ingresosSortConfig]);

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
        egresos_insumos: number;
        egresos_costos_fijos: number;
        egresos_propinas: number;
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
        egresos_insumos: 0,
        egresos_costos_fijos: 0,
        egresos_propinas: 0,
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
            setOverrideForm({
                ...manualOverride,
                egresos_insumos: manualOverride.egresos_insumos || 0
            });
        } else {
            setOverrideForm({
                servicios_ingreso: Number(ingresoServiciosTotal.toFixed(2)),
                servicios_egreso: Number(egresoTotal.toFixed(2)),
                servicios_subtotal: Number(subtotalUtilidad.toFixed(2)),
                servicios_comision_admin: Number(totalLocalAdminCommissions.toFixed(2)),
                servicios_utilidad: Number(utilidadNeta.toFixed(2)),
                productos_ingreso: Number(ventaProductos.toFixed(2)),
                productos_reinversion: Number(reinversion.toFixed(2)),
                productos_comision_prof: Number(totalComisionesProductos.toFixed(2)),
                productos_subtotal: Number(utilidadVatosAlfa.toFixed(2)),
                productos_utilidad: Number(utilidadNetaProductos.toFixed(2)),
                egresos_comisiones_servicios: commissionsFromEgresos.professionalList.filter((c: any) => c.service > 0).map((c: any) => ({ nombre: c.nombre, monto: Number(c.service.toFixed(2)) })),
                egresos_comisiones_productos: Number(totalComisionesProductos.toFixed(2)),
                egresos_nomina: Number(nominaTotal.toFixed(2)),
                egresos_insumos: Number(insumosTotal.toFixed(2)),
                egresos_costos_fijos: Number(costosFijosTotal.toFixed(2)),
                egresos_propinas: Number(propinasTotal.toFixed(2)),
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

    // Helper to get name from ID outside of existing helper to use in useMemo
    // But since getNameFromId relies on professionals/users state which are dependencies anyway, 
    // we can use the same logic inside the sort function or ensure getNameFromId is stable.
    // The existing getNameFromId uses state, so let's stick to using data maps or helper within sort.

    // --- CORRECCIÓN APLICADA AQUÍ ---
    // Eliminamos el cálculo predictivo. Solo mostramos lo que existe en la BD 'egresos'.
    const calculatedEgresos = useMemo(() => {
        if (egresosLoading) return [];

        const manualEgresos: Egreso[] = egresos
            .filter(e => {
                const concepto = e.concepto?.toLowerCase() || '';
                const comentarios = e.comentarios?.toLowerCase() || '';
                if (concepto.includes('entrega de efectivo') ||
                    concepto.includes('entrega de dinero') ||
                    concepto.includes('cierre de caja') ||
                    concepto.includes('retiro de efectivo')) {
                    return false;
                }
                return true;
            })
            .map(e => {
                const fechaRaw = e.fecha instanceof Timestamp ? e.fecha.toDate() : new Date(e.fecha);
                let comS = e.comisionServicios || 0;
                let comP = e.comisionProductos || 0;
                let prop = e.propina || 0;
                let commentClean = e.comentarios || '';

                if (!comS && !comP && !prop && commentClean) {
                    const matchS = commentClean.match(/Comisión Servicios: \$([0-9.,]+)/);
                    const matchP = commentClean.match(/Comisión Productos: \$([0-9.,]+)/);
                    const matchT = commentClean.match(/Propina: \$([0-9.,]+)/);
                    const parseAmt = (val: string) => {
                        let c = val.replace(/[^0-9.,]/g, '');
                        if (c.match(/,\d{1,2}$/)) c = c.replace(/(.*),(.*)/, '$1.$2');
                        return parseFloat(c.replace(/,/g, '')) || 0;
                    };
                    if (matchS) comS = parseAmt(matchS[1]);
                    if (matchP) comP = parseAmt(matchP[1]);
                    if (matchT) prop = parseAmt(matchT[1]);

                    if (matchS || matchP || matchT) {
                        commentClean = 'Auto Pago (Sistema)';
                    }
                }

                return {
                    ...e,
                    fecha: fechaRaw,
                    displayComS: comS,
                    displayComP: comP,
                    displayProp: prop,
                    displayComment: commentClean
                };
            });

        return manualEgresos.sort((a: any, b: any) => {
            const { key, direction } = egresosSortConfig;
            const dir = direction === 'asc' ? 1 : -1;

            if (key === 'fecha') {
                return (a.fecha.getTime() - b.fecha.getTime()) * dir;
            } else if (key === 'monto') {
                return (a.monto - b.monto) * dir;
            } else if (key === 'concepto') {
                return (a.concepto || '').localeCompare(b.concepto || '') * dir;
            } else if (key === 'aQuien') {
                const getName = (id: string) => {
                    const professional = professionals?.find(p => p.id === id);
                    if (professional) return professional.name;
                    const user = users?.find(u => u.id === id);
                    if (user) return user.name;
                    return id || '';
                };
                return getName(a.aQuien).localeCompare(getName(b.aQuien)) * dir;
            } else if (key === 'comisionServicios') {
                return (a.displayComS - b.displayComS) * dir;
            } else if (key === 'comisionProductos') {
                return (a.displayComP - b.displayComP) * dir;
            } else if (key === 'propina') {
                return (a.displayProp - b.displayProp) * dir;
            } else if (key === 'comentarios') {
                return (a.displayComment || '').localeCompare(b.displayComment || '') * dir;
            } else if (key === 'quienPagaNombre') {
                return (a.quienPagaNombre || '').localeCompare(b.quienPagaNombre || '') * dir;
            }
            return 0;
        });

    }, [egresos, egresosLoading, egresosSortConfig, professionals, users]);
    // ---------------------------------

    const cashMovementsData = useMemo(() => {
        if (egresosLoading || incomesManualLoading) return { movements: [], totalEntradas: 0, totalSalidas: 0, totalReembolsos: 0 };

        const movements: any[] = [];
        let totalEntradas = 0;
        let totalSalidas = 0;
        let totalReembolsos = 0;

        // Add relevant Egresos (Entrega de efectivo)
        egresos.forEach(e => {
            const concepto = e.concepto?.toLowerCase() || '';
            if (concepto.includes('entrega de efectivo') || concepto.includes('entrega de dinero')) {
                // Filter by role: exclude if "Administrador general"
                const userById = users?.find(u => u.id === e.aQuien);
                const userByName = users?.find(u => u.name.toLowerCase() === e.aQuien.toLowerCase());
                const targetUser = userById || userByName;

                if (targetUser && targetUser.role === 'Administrador general') {
                    return; // Skip movements from general admin
                }

                totalSalidas += e.monto;
                movements.push({
                    id: e.id,
                    dbType: 'egreso',
                    fecha: e.fecha instanceof Timestamp ? e.fecha.toDate() : new Date(e.fecha),
                    tipo: 'Salida (Entrega)',
                    concepto: e.concepto,
                    quien: e.aQuien,
                    quienPaga: e.quienPagaNombre || 'No esp.',
                    monto: e.monto,
                    comentarios: e.comentarios,
                    color: 'text-primary' // Aceto (Blue)
                });
            }
        });

        // Add manual incomes from caja balance
        incomesManual.forEach(i => {
            const comentarios = i.comentarios?.toLowerCase() || '';
            const concepto = i.concepto?.toLowerCase() || '';


            const isBalanceAjuste = concepto.includes('lo ingresó') || concepto.includes('lo ingreso') || concepto.includes('ajuste de caja') ||
                comentarios.includes('lo ingresó') || comentarios.includes('lo ingreso') || comentarios.includes('ajuste de caja');
            
            if (isBalanceAjuste) {
                let quien = 'Sistema';
                if (concepto.includes('lo ingresó') || concepto.includes('lo ingreso')) {
                    quien = i.concepto?.replace(/lo ingres[oó]\s*/i, '').trim() || 'Sistema';
                } else if (comentarios.includes('lo ingresó') || comentarios.includes('lo ingreso')) {
                    quien = i.comentarios?.replace(/lo ingres[oó]\s*/i, '').trim() || 'Sistema';
                }

                const targetUser = users?.find(u => u.name.toLowerCase() === quien.toLowerCase());
                if (targetUser && targetUser.role === 'Administrador general') {
                    return; 
                }

                totalEntradas += i.monto;

                







                movements.push({
                    id: i.id,
                    dbType: 'ingreso',
                    fecha: i.fecha instanceof Timestamp ? i.fecha.toDate() : new Date(i.fecha),
                    tipo: 'Entrada (Balance)',
                    concepto: i.concepto,
                    quien: quien,
                    quienPaga: 'Sistema',
                    monto: i.monto,
                    comentarios: i.comentarios,
                    color: 'text-slate-500' 
                });
            }
        });

        // Calculate Liquidaciones Directas total (but don't add to general movements table)
        liquidaciones.forEach(l => {
            totalReembolsos += l.monto;
        });

        const sorted = [...movements].sort((a, b) => {
            const { key, direction } = cashMovementsSortConfig;
            const dir = direction === 'asc' ? 1 : -1;

            if (key === 'fecha') {
                return (a.fecha.getTime() - b.fecha.getTime()) * dir;
            } else if (key === 'monto') {
                return (a.monto - b.monto) * dir;
            } else if (key === 'tipo') {
                return a.tipo.localeCompare(b.tipo) * dir;
            } else if (key === 'concepto') {
                return (a.concepto || '').localeCompare(b.concepto || '') * dir;
            } else if (key === 'quien') {
                return (a.quien || '').localeCompare(b.quien || '') * dir;
            } else if (key === 'quienPaga') {
                return (a.quienPaga || '').localeCompare(b.quienPaga || '') * dir;
            } else if (key === 'comentarios') {
                return (a.comentarios || '').localeCompare(b.comentarios || '') * dir;
            }
            return 0;
        });

        return { movements: sorted, totalEntradas, totalSalidas, totalReembolsos };
    }, [egresos, egresosLoading, incomesManual, incomesManualLoading, liquidaciones, liquidacionesLoading, cashMovementsSortConfig, users]);

    const { movements: cashMovements, totalEntradas, totalSalidas, totalReembolsos } = cashMovementsData;

    const handleCashMovementsSort = (key: string) => {
        setCashMovementsSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const paginatedCashMovements = useMemo(() => {
        const start = (cashMovementsPage - 1) * cashMovementsPerPage;
        return cashMovements.slice(start, start + cashMovementsPerPage);
    }, [cashMovements, cashMovementsPage, cashMovementsPerPage]);

    const totalCashMovementsPages = Math.ceil(cashMovements.length / cashMovementsPerPage);

    const adminSummaryData = useMemo(() => {
        const localAdminIds = users?.filter(u => u.role === 'Administrador local').map(u => u.id) || [];
        
        const egresosAdmin = calculatedEgresos
            .filter(e => e.quienPagaId && localAdminIds.includes(e.quienPagaId))
            .reduce((sum, e) => sum + e.monto, 0);

        const resultado = (totalSalidas + (totalReembolsos || 0)) - totalEntradas - egresosAdmin;
        
        return {
            totalSalidas,
            totalEntradas,
            totalReembolsos,
            egresosAdmin,
            resultado
        };
    }, [calculatedEgresos, totalSalidas, totalEntradas, totalReembolsos, users]);

    const handleSaveComment = async () => {
        if (!commentToEdit) return;
        try {
            let docRef;
            if (commentToEdit.type === 'egreso') {
                docRef = doc(db, 'egresos', commentToEdit.id);
            } else if (commentToEdit.type === 'ingreso') {
                docRef = doc(db, 'ingresos_manuales', commentToEdit.id);
            } else {
                docRef = doc(db, `finanzas_mensuales/${monthName.toLowerCase()}_${selectedYear}/liquidaciones_admin`, commentToEdit.id);
            }

            const updateData: any = {
                comentarios: commentToEdit.comment
            };
            if (commentToEdit.type === 'liquidacion' && commentToEdit.monto !== undefined) {
                updateData.monto = commentToEdit.monto;
            }

            await updateDoc(docRef, updateData);
            setIsEditingComment(false);
            setCommentToEdit(null);
            setQueryKey(prev => prev + 1);
            toast({
                title: "Comentario actualizado",
                description: "El movimiento ha sido actualizado correctamente.",
            });
        } catch (error) {
            console.error("Error updating comment:", error);
            toast({
                title: "Error",
                description: "No se pudo actualizar el comentario.",
                variant: "destructive"
            });
        }
    };

    const handleDeleteLiquidacion = async (id: string) => {
        if (!db) return;
        try {
            const docRef = doc(db, `finanzas_mensuales/${monthName.toLowerCase()}_${selectedYear}/liquidaciones_admin`, id);
            await deleteDoc(docRef);
            setQueryKey(prev => prev + 1);
            toast({
                title: "Liquidación eliminada",
                description: "El registro del pago ha sido borrado.",
            });
        } catch (error) {
            console.error("Error deleting liquidacion:", error);
            toast({
                title: "Error",
                description: "No se pudo eliminar el registro.",
                variant: "destructive"
            });
        }
    };


    // Calculation logic
    const ingresoServiciosTotal = useMemo(() => {
        if (!sales) return 0;
        let total = 0;
        sales.forEach(sale => {
            const saleTotal = sale.total || 0;
            const realPaid = (sale.pago_estado === 'deposit_paid' || (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < saleTotal))
                ? (sale.monto_pagado_real || 0)
                : saleTotal;

            const computedSubtotal = sale.subtotal || sale.items?.reduce((sum, it) => sum + (it.subtotal ?? (((it.precio || 0) * (it.cantidad || 1)))), 0) || realPaid || 1;

            sale.items?.forEach(item => {
                if (item.tipo !== 'producto') {
                    const itemSubtotal = item.subtotal ?? (((item.precio || 0) * (item.cantidad || 1)));
                    const proportion = computedSubtotal > 0 ? (itemSubtotal / computedSubtotal) : 0;
                    total += proportion * realPaid;
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
            const saleTotal = sale.total || 0;
            const realPaid = (sale.pago_estado === 'deposit_paid' || (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < saleTotal))
                ? (sale.monto_pagado_real || 0)
                : saleTotal;

            const computedSubtotal = sale.subtotal || sale.items?.reduce((sum, it) => sum + (it.subtotal ?? (((it.precio || 0) * (it.cantidad || 1)))), 0) || realPaid || 1;

            sale.items?.forEach(item => {
                if (item.tipo === 'producto') {
                    const itemQty = item.cantidad || 1;
                    const itemSubtotal = item.subtotal ?? (((item.precio || 0) * itemQty));
                    const proportion = computedSubtotal > 0 ? (itemSubtotal / computedSubtotal) : 0;
                    const finalItemPrice = proportion * realPaid;

                    ventaProductos += finalItemPrice;

                    const product = productMap.get(item.id);
                    if (product && product.purchase_cost) {
                        reinversion += product.purchase_cost * itemQty;
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

    const { ventaProductos, reinversion } = productSummary;

    const commissionsFromEgresos = useMemo(() => {
        const summary: Record<string, { service: number, product: number, tip: number, other: number }> = {};
        const profIdToName: Record<string, string> = {};

        professionals.forEach(prof => {
            summary[prof.id] = { service: 0, product: 0, tip: 0, other: 0 };
            profIdToName[prof.id] = prof.name;
        });

        let totalService = 0;
        let totalProduct = 0;
        let totalTips = 0;
        let totalOtros = 0;

        calculatedEgresos.forEach(egreso => {
            const concepto = egreso.concepto.toLowerCase();
            const aQuien = egreso.aQuien;

            // Skip fixed costs/nomina as they are handled separately
            if (concepto === 'nómina' || aQuien === 'Insumos' || aQuien === 'Costos fijos') return;

            const profMatch = professionals.find(p => p.id === aQuien || p.name === aQuien);

            // RegEx for detailed payment comments
            const serviceMatch = egreso.comentarios?.match(/Comisión Servicios: \$([0-9.,]+)/);
            const productMatch = egreso.comentarios?.match(/Comisión Productos: \$([0-9.,]+)/);
            const tipMatch = egreso.comentarios?.match(/Propina: \$([0-9.,]+)/);

            if (serviceMatch || productMatch || tipMatch) {
                const parseAmt = (val: string) => {
                    let c = val.replace(/[^0-9.,]/g, '');
                    if (c.match(/,\d{1,2}$/)) c = c.replace(/(.*),(.*)/, '$1.$2');
                    return parseFloat(c.replace(/,/g, '')) || 0;
                };
                const s = serviceMatch ? parseAmt(serviceMatch[1]) : 0;
                const p = productMatch ? parseAmt(productMatch[1]) : 0;
                const t = tipMatch ? parseAmt(tipMatch[1]) : 0;

                totalService += s;
                totalProduct += p;
                totalTips += t;

                if (profMatch) {
                    summary[profMatch.id].service += s;
                    summary[profMatch.id].product += p;
                    summary[profMatch.id].tip += t;
                }
            } else {
                // Not a detailed payment, categorize by concept
                if (concepto.includes('comisi') || concepto.includes('pago')) {
                    totalService += egreso.monto;
                    if (profMatch) summary[profMatch.id].service += egreso.monto;
                } else if (concepto.includes('propina')) {
                    totalTips += egreso.monto;
                    if (profMatch) summary[profMatch.id].tip += egreso.monto;
                } else {
                    totalOtros += egreso.monto;
                    if (profMatch) summary[profMatch.id].other += egreso.monto;
                }
            }
        });

        const professionalList = Object.entries(summary)
            .filter(([_, data]) => data.service > 0 || data.product > 0 || data.tip > 0 || data.other > 0)
            .map(([id, data]) => ({
                id,
                nombre: profIdToName[id] || id,
                service: data.service,
                product: data.product,
                tip: data.tip,
                other: data.other
            }));

        return { totalService, totalProduct, totalTips, totalOtros, professionalList };
    }, [calculatedEgresos, professionals]);

    const totalComisionesServicios = commissionsFromEgresos.totalService;
    const totalComisionesProductos = commissionsFromEgresos.totalProduct;
    const totalComisiones = totalComisionesServicios + totalComisionesProductos;
    const totalOtrosEgresos = commissionsFromEgresos.totalOtros;

    const propinasTotal = commissionsFromEgresos.totalTips; // Strict cash basis: only paid tips

    const nominaTotal = useMemo(() => {
        return calculatedEgresos
            .filter(e => e.concepto === 'Nómina')
            .reduce((sum, e) => sum + e.monto, 0);
    }, [calculatedEgresos]);

    const insumosTotal = useMemo(() => {
        return calculatedEgresos
            .filter(e => e.aQuien === 'Insumos')
            .reduce((sum, e) => sum + e.monto, 0);
    }, [calculatedEgresos]);

    const costosFijosTotal = useMemo(() => {
        return calculatedEgresos
            .filter(e => e.aQuien === 'Costos fijos')
            .reduce((sum, e) => sum + e.monto, 0);
    }, [calculatedEgresos]);


    // --- FINANCIAL SUMMARY LOGIC (CASH BASIS / REAL EGRESOS) ---

    // 1. Products: Use REAL paid commissions from egresos
    const utilidadVatosAlfa = ventaProductos - reinversion - totalComisionesProductos;

    // 2. Services: Use REAL paid expenses (Commissions + Nomina + Insumos + Fixed)
    const egresoTotal = totalComisionesServicios + nominaTotal + insumosTotal + costosFijosTotal + totalOtrosEgresos;
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
        productos_comision_prof: hasOverride ? manualOverride!.productos_comision_prof : totalComisionesProductos,
        productos_subtotal: hasOverride ? manualOverride!.productos_subtotal : utilidadVatosAlfa,
        productos_utilidad: hasOverride ? manualOverride!.productos_utilidad : utilidadNetaProductos,
        egresos_comisiones_servicios_total: hasOverride
            ? manualOverride!.egresos_comisiones_servicios.reduce((sum, c) => sum + c.monto, 0)
            : totalComisionesServicios,
        egresos_comisiones_servicios_list: hasOverride
            ? manualOverride!.egresos_comisiones_servicios
            : commissionsFromEgresos.professionalList.filter(c => (c.service > 0 || c.other > 0)).map(c => ({ nombre: c.nombre, monto: c.service + c.other })),
        egresos_comisiones_productos: hasOverride ? manualOverride!.egresos_comisiones_productos : totalComisionesProductos,
        egresos_nomina: hasOverride ? manualOverride!.egresos_nomina : nominaTotal,
        egresos_insumos: hasOverride ? (manualOverride!.egresos_insumos || 0) : insumosTotal,
        egresos_costos_fijos: hasOverride ? manualOverride!.egresos_costos_fijos : costosFijosTotal,
        egresos_propinas: hasOverride ? (manualOverride!.egresos_propinas || 0) : propinasTotal,
    };
    const display_totalEgresos = display.egresos_comisiones_servicios_total + display.egresos_nomina + display.egresos_insumos + display.egresos_costos_fijos;
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


    const handleIngresosSort = (key: string) => {
        setIngresosSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleEgresosSort = (key: string) => {
        setEgresosSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
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

    const handleDownloadReport = () => {
        // 1. Resumen General del Mes
        const summaryRows = [
            { 'Concepto': 'Mes', 'Valor': capitalize(monthName) },
            { 'Concepto': 'Año', 'Valor': selectedYear },
            { 'Concepto': 'Ingresos Totales (Mes)', 'Valor': display_ingresosTotalesMes },
            { 'Concepto': 'Utilidad Neta Total', 'Valor': display_utilidadNetaTotal },
            { 'Concepto': 'Margen Promedio', 'Valor': `${display_margen.toFixed(1)}%` },
            { 'Concepto': 'Ingresos Servicios', 'Valor': display.servicios_ingreso },
            { 'Concepto': 'Egresos Operativos Servicios', 'Valor': display.servicios_egreso },
            { 'Concepto': 'Utilidad Servicios', 'Valor': display.servicios_utilidad },
            { 'Concepto': 'Ingresos Productos', 'Valor': display.productos_ingreso },
            { 'Concepto': 'Reinversión Productos', 'Valor': display.productos_reinversion },
            { 'Concepto': 'Comisiones Barberos Productos', 'Valor': display.productos_comision_prof },
            { 'Concepto': 'Utilidad Productos', 'Valor': display.productos_utilidad },
            { 'Concepto': 'Egresos Operativos Totales', 'Valor': display_totalEgresos },
        ];

        // 2. Ingresos Diarios
        const incomeRows = dailyIncome.map(item => ({
            'Fecha': item.fecha,
            'Efectivo': item.efectivo,
            'Tarjeta': item.tarjeta,
            'Transferencia': item.transferencia,
            'En Línea': item.pagos_en_linea,
            'Total': item.total
        }));

        // 3. Egresos
        const egresosRows = calculatedEgresos.map((egreso: any) => ({
            'Fecha': egreso.fecha instanceof Timestamp ? format(egreso.fecha.toDate(), 'dd/MM/yyyy HH:mm') : (egreso.fecha ? format(new Date(egreso.fecha), 'dd/MM/yyyy HH:mm') : ''),
            'Concepto': egreso.concepto,
            'A quién se entrega': getNameFromId(egreso.aQuien),
            'Comisión Servicios': egreso.displayComS || 0,
            'Comisión Productos': egreso.displayComP || 0,
            'Propina': egreso.displayProp || 0,
            'Comentarios': egreso.displayComment || '',
            'Pagado por': egreso.quienPagaNombre || '',
            'Total': egreso.monto
        }));

        // 4. Movimientos Flujo de Caja
        const cashRows = cashMovements.map(mov => ({
            'Fecha': safeFormatDate(mov.fecha),
            'Tipo': mov.tipo,
            'Concepto': mov.concepto,
            'Responsable / Destino': mov.quien,
            'Monto': mov.monto,
            'Comentarios': mov.comentarios || ''
        }));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Resumen General");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incomeRows), "Ingresos Diarios");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(egresosRows), "Egresos");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cashRows), "Flujo de Caja");

        XLSX.writeFile(wb, `Reporte_Financiero_${capitalize(monthName)}_${selectedYear}.xlsx`);

        toast({
            title: "Reporte generado",
            description: `Se descargó el reporte financiero de ${capitalize(monthName)} ${selectedYear} en formato Excel.`,
        });
    };

    return (
        <>
            <div className="flex-1 space-y-4 sm:space-y-6 p-3 sm:p-6 md:p-8 pt-4 sm:pt-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" onClick={goToPrevMonth} className="h-9 w-9">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Select value={monthName.toLowerCase()} onValueChange={(val) => navigateToMonth(val)}>
                            <SelectTrigger className="w-[160px] text-base sm:text-lg font-bold capitalize">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                {monthLabels.map((m) => (
                                    <SelectItem key={m.value} value={m.value} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">
                                        {m.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button variant="outline" size="icon" onClick={goToNextMonth} className="h-9 w-9">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="flex items-center gap-3">
                        <Select value={String(selectedYear)} onValueChange={handleYearChange}>
                            <SelectTrigger className="w-[105px] h-9 rounded-xl border-border/60 text-xs font-semibold bg-card">
                                <SelectValue placeholder="Año" />
                            </SelectTrigger>
                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                {years.map((y) => (
                                    <SelectItem key={y} value={String(y)} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">
                                        {y}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {hasOverride && (
                            <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-400 bg-blue-500/10">
                                📋 Datos manuales
                            </Badge>
                        )}
                        <button 
                            type="button" 
                            className="text-slate-400 hover:text-foreground transition-colors p-1" 
                            onClick={openOverrideModal} 
                            title="Editar datos financieros"
                        >
                            <FileEdit className="h-4 w-4" />
                        </button>
                        <button 
                            type="button"
                            className="text-slate-400 hover:text-foreground transition-colors p-1" 
                            onClick={handleDownloadReport}
                            title="Descargar reporte mensual en Excel"
                        >
                            <Download className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* KPI Cards Corporativas */}
                <div className="grid gap-4 grid-cols-1 md:grid-cols-3 mb-6">
                    {/* Card 1: Ingresos Totales */}
                    <Card className="rounded-2xl border border-border/60 shadow-sm bg-gradient-to-br from-[#10172b] via-[#18223c] to-[#0f1627] text-white overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 border-b border-slate-800/80">
                            <CardTitle className="text-xs sm:text-sm font-medium text-slate-300">Ingresos Totales (Mes)</CardTitle>
                            <DollarSign className="h-4 w-4 text-[#C5A880]" />
                        </CardHeader>
                        <CardContent className="p-4 pt-3">
                            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                                ${display_ingresosTotalesMes.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <p className="text-xs text-slate-400 mt-1">Productos + Servicios</p>
                        </CardContent>
                    </Card>

                    {/* Card 2: Utilidad Neta Total */}
                    <Card className="rounded-2xl border border-border/60 shadow-sm bg-gradient-to-br from-[#10172b] via-[#1c2847] to-[#12192d] text-white overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 border-b border-slate-800/80">
                            <CardTitle className="text-xs sm:text-sm font-medium text-slate-300">Utilidad Neta Total</CardTitle>
                            <TrendingUp className="h-4 w-4 text-blue-400" />
                        </CardHeader>
                        <CardContent className="p-4 pt-3">
                            <div className={cn("text-2xl sm:text-3xl font-bold tracking-tight", display_utilidadNetaTotal < 0 ? "text-red-400" : "text-blue-400")}>
                                {display_utilidadNetaTotal < 0
                                    ? `-$${Math.abs(display_utilidadNetaTotal).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : `$${display_utilidadNetaTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                }
                            </div>
                            <p className="text-xs text-slate-400 mt-1">Después de todos los gastos</p>
                        </CardContent>
                    </Card>

                    {/* Card 3: Margen Promedio */}
                    <Card className="rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 border-b border-border/40">
                            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Margen Promedio</CardTitle>
                            <Percent className="h-4 w-4 text-slate-400" />
                        </CardHeader>
                        <CardContent className="p-4 pt-3">
                            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                                {display_margen.toFixed(1)}%
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Rendimiento mensual</p>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
                    <Card className="lg:col-span-4 rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                        <CardHeader className="p-4 pb-2 border-b border-border/40">
                            <CardTitle className="text-base font-semibold">Resumen de servicios</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1 text-sm p-4 pt-3">
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
                                                <button type="button" className="text-muted-foreground hover:text-foreground transition-colors p-1 ml-1" onClick={() => handleEditCommission({ id: admin.id, name: admin.name, type: type as any, value }, 'service')} title="Editar comisión">
                                                    <Edit className="h-3 w-3" />
                                                </button>
                                            </ResumenGeneralItem>
                                        );
                                    })}

                                    <ResumenGeneralItem
                                        label="Utilidad neta"
                                        amount={display.servicios_utilidad}
                                        isPrimary
                                        isBold
                                        className="text-base sm:text-lg pt-2 border-t border-border/40 mt-2"
                                        tooltipText="Ganancia neta del mes tras restar todos los gastos operativos y comisiones administrativas sobre servicios."
                                    />
                                </>
                            )}
                        </CardContent>
                    </Card>
                    <Card className="lg:col-span-4 rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                        <CardHeader className="p-4 pb-2 border-b border-border/40">
                            <CardTitle className="text-base font-semibold">Resumen de productos</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1 text-sm p-4 pt-3">
                            <ResumenGeneralItem
                                label="Ingreso total"
                                amount={display.productos_ingreso}
                                tooltipText="Suma total de todas las ventas de productos realizadas en el mes."
                            />
                            <ResumenGeneralItem
                                label="Reinversión"
                                amount={-display.productos_reinversion}
                                className="text-muted-foreground"
                                tooltipText="Costo estimado o configurado de los productos para su resurtido (costo de inversión)."
                            />
                            <ResumenGeneralItem
                                label="Comisión de profesionales"
                                amount={-display.productos_comision_prof}
                                className="text-muted-foreground"
                                tooltipText="Comisiones pagadas a los colaboradores por la venta directa de estos productos."
                            />
                            <ResumenGeneralItem
                                label="Subtotal de utilidad"
                                amount={display.productos_subtotal}
                                isBold
                                tooltipText="Utilidad bruta de productos antes de pagar comisiones administrativas."
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
                                        <button type="button" className="text-muted-foreground hover:text-foreground transition-colors p-1 ml-1" onClick={() => handleEditCommission({ id: admin.id, name: admin.name, type: type as any, value }, 'product')} title="Editar comisión">
                                            <Edit className="h-3 w-3" />
                                        </button>
                                    </ResumenGeneralItem>
                                );
                            })}

                            <ResumenGeneralItem
                                label="Utilidad neta"
                                amount={display.productos_utilidad}
                                isPrimary
                                isBold
                                className="text-base sm:text-lg pt-2 border-t border-border/40 mt-2"
                                tooltipText="Utilidad final de productos que queda para el dueño después de todos los pagos."
                            />
                        </CardContent>
                    </Card>
                    <Card className="lg:col-span-4 rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                        <CardHeader className="p-4 pb-2 border-b border-border/40">
                            <CardTitle className="text-base font-semibold">Egresos</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 p-4 pt-3">
                            <Accordion type="multiple" className="w-full">
                                <AccordionItem value="comisiones-servicios" className="border-b-0">
                                    <div className="flex justify-between items-center text-sm py-1.5 border-b border-border/40">
                                        <AccordionTrigger className="flex-grow hover:no-underline font-normal p-0">
                                            <span className="text-muted-foreground flex items-center">
                                                Comisiones Servicios
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <HelpCircle className="h-3.5 w-3.5 inline-block ml-1 cursor-help" />
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-80 p-3 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white">
                                                        <p className="max-w-xs text-xs text-slate-300">Dinero pagado exclusivamente por comisión de servicios realizados por los profesionales.</p>
                                                    </PopoverContent>
                                                </Popover>
                                            </span>
                                        </AccordionTrigger>
                                        <span className="font-semibold mr-4">${display.egresos_comisiones_servicios_total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <AccordionContent className="p-0">
                                        <Table className="my-1">
                                            <TableHeader>
                                                <TableRow className="h-7 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                                    <TableHead className="w-[60%] py-1 px-3 text-xs font-semibold text-muted-foreground">Profesional</TableHead>
                                                    <TableHead className="text-right py-1 px-3 text-xs font-semibold text-muted-foreground">Monto</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {display.egresos_comisiones_servicios_list.map((item) => (
                                                    <TableRow key={item.nombre} className="h-8 hover:bg-muted/30 transition-colors border-b border-border/40">
                                                        <TableCell className="py-1 px-3 text-xs font-medium">
                                                            <span>{item.nombre}</span>
                                                        </TableCell>
                                                        <TableCell className="py-1 px-3 text-xs text-right font-bold text-blue-400">${item.monto.toLocaleString('es-MX')}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                            <ResumenEgresoItem label="Nómina" amount={display.egresos_nomina} tooltip="Sueldos base pagados al personal administrativo o staff general." />
                            <ResumenEgresoItem label="Insumos" amount={display.egresos_insumos} tooltip="Gasto en materia prima de trabajo (Papel, geles, etc)." />
                            <ResumenEgresoItem label="Costos fijos" amount={display.egresos_costos_fijos} tooltip="Gastos fijos de operación del local (Renta, Luz, Internet)." />

                            {totalOtrosEgresos > 0 && (
                                <ResumenEgresoItem label="Otros egresos registrados" amount={totalOtrosEgresos} tooltip="Gastos varios registrados en caja que no entran en las categorías principales." />
                            )}

                            <div className="flex justify-between items-center text-base pt-3 mt-2 border-t border-border/40">
                                <span className="font-bold text-foreground">Total</span>
                                <span className="font-extrabold text-foreground text-lg">${display_totalEgresos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs sm:text-sm pt-2 mt-2 border-t border-border/40 text-muted-foreground">
                                <span className="flex items-center">
                                    Propinas (Informativo)
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <HelpCircle className="h-3.5 w-3.5 inline-block ml-1 cursor-help" />
                                        </PopoverTrigger>
                                        <PopoverContent className="w-80 p-3 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white">
                                            <p className="max-w-xs text-xs text-slate-300">Total de propinas pagadas realmente a los profesionales (egresos registrados en caja). No incluye propinas de ventas que aún no se han liquidado con el barbero.</p>
                                        </PopoverContent>
                                    </Popover>
                                </span>
                                <span className="font-medium text-foreground">${display.egresos_propinas.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                    <Card className="lg:col-span-5 rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                        <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors py-2.5 px-4 border-b border-border/40" onClick={() => setIsIngresosCollapsed(!isIngresosCollapsed)}>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-semibold">Ingresos</CardTitle>
                                <button type="button" className="text-slate-400 hover:text-foreground transition-colors p-1">
                                    {isIngresosCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                                </button>
                            </div>
                        </CardHeader>
                        {!isIngresosCollapsed && (
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                            <TableHead className="py-1 px-1.5 sm:px-3 text-[11px] sm:text-xs font-semibold text-muted-foreground">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground transition-colors" onClick={() => handleIngresosSort('fecha')}>
                                                    Fecha {ingresosSortConfig.key === 'fecha' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="py-1 px-1.5 sm:px-3 text-[11px] sm:text-xs font-semibold text-muted-foreground">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground transition-colors" onClick={() => handleIngresosSort('efectivo')}>
                                                    Efectivo {ingresosSortConfig.key === 'efectivo' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="py-1 px-1.5 sm:px-3 text-[11px] sm:text-xs font-semibold text-muted-foreground">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground transition-colors" onClick={() => handleIngresosSort('tarjeta')}>
                                                    Tarjeta {ingresosSortConfig.key === 'tarjeta' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="py-1 px-1.5 sm:px-3 text-[11px] sm:text-xs font-semibold text-muted-foreground">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground transition-colors" onClick={() => handleIngresosSort('transferencia')}>
                                                    <span className="hidden sm:inline">Transferencia</span><span className="sm:hidden">Transf.</span> {ingresosSortConfig.key === 'transferencia' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="hidden md:table-cell py-1 px-3 text-xs font-semibold text-muted-foreground">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center gap-1 text-xs text-muted-foreground transition-colors" onClick={() => handleIngresosSort('pagos_en_linea')}>
                                                    En línea {ingresosSortConfig.key === 'pagos_en_linea' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="py-1 px-1.5 sm:px-3 text-[11px] sm:text-xs font-semibold text-muted-foreground text-right">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center justify-end gap-1 text-[11px] sm:text-xs text-muted-foreground transition-colors w-full" onClick={() => handleIngresosSort('total')}>
                                                    <span className="hidden sm:inline">Total venta</span><span className="sm:hidden">Total</span> {ingresosSortConfig.key === 'total' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow className="h-9">
                                                <TableCell colSpan={6} className="text-center py-4">
                                                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                                                </TableCell>
                                            </TableRow>
                                        ) : dailyIncome.length === 0 ? (
                                            <TableRow className="h-9">
                                                <TableCell colSpan={6} className="text-center py-4 text-xs text-muted-foreground">
                                                    No hay ingresos registrados para {capitalize(monthName)}.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            paginatedIncomes.map((ingreso, i) => (
                                                <TableRow key={i} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                                    <TableCell className="py-1.5 px-1.5 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap">{ingreso.fecha.split('-').reverse().join('/')}</TableCell>
                                                    <TableCell className="py-1.5 px-1.5 sm:px-3 text-[11px] sm:text-xs">${ingreso.efectivo.toLocaleString('es-MX')}</TableCell>
                                                    <TableCell className="py-1.5 px-1.5 sm:px-3 text-[11px] sm:text-xs">${ingreso.tarjeta.toLocaleString('es-MX')}</TableCell>
                                                    <TableCell className="py-1.5 px-1.5 sm:px-3 text-[11px] sm:text-xs">${ingreso.transferencia.toLocaleString('es-MX')}</TableCell>
                                                    <TableCell className="hidden md:table-cell py-1.5 px-3 text-xs">${ingreso.pagos_en_linea.toLocaleString('es-MX')}</TableCell>
                                                    <TableCell className="py-1.5 px-1.5 sm:px-3 text-[11px] sm:text-xs font-semibold text-foreground text-right">${ingreso.total.toLocaleString('es-MX')}</TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                                {dailyIncome.length > 0 && (
                                    <div className="flex flex-row items-center justify-between gap-2 p-2.5 sm:p-3 border-t border-border/40 w-full">
                                        <div className="flex items-center gap-1 sm:gap-2">
                                            <span className="text-[11px] text-muted-foreground sm:hidden">Filas:</span>
                                            <span className="text-xs text-muted-foreground hidden sm:inline">Resultados por página</span>
                                            <Select
                                                value={`${incomesPerPage}`}
                                                onValueChange={(value) => {
                                                    setIncomesPerPage(Number(value));
                                                    setIncomesPage(1);
                                                }}
                                            >
                                                <SelectTrigger className="h-7 w-[54px] sm:w-[65px] text-xs px-1.5 bg-background">
                                                    <SelectValue placeholder={incomesPerPage} />
                                                </SelectTrigger>
                                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                                    <SelectItem value="10" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">10</SelectItem>
                                                    <SelectItem value="20" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">20</SelectItem>
                                                    <SelectItem value="50" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">50</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="text-[11px] sm:text-xs font-medium text-muted-foreground text-center">
                                            <span className="hidden sm:inline">Página </span><span className="sm:hidden">Pág. </span>{incomesPage} de {totalIncomesPages}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-1.5 sm:px-2 text-xs"
                                                onClick={() => setIncomesPage(p => Math.max(1, p - 1))}
                                                disabled={incomesPage === 1}
                                            >
                                                <ChevronLeft className="h-3.5 w-3.5" />
                                                <span className="hidden sm:inline ml-1">Anterior</span>
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-1.5 sm:px-2 text-xs"
                                                onClick={() => setIncomesPage(p => Math.min(totalIncomesPages, p + 1))}
                                                disabled={incomesPage === totalIncomesPages}
                                            >
                                                <span className="hidden sm:inline mr-1">Siguiente</span>
                                                <ChevronRight className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        )}
                    </Card>
                    <Card className="lg:col-span-7 rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                        <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors py-2.5 px-4 border-b border-border/40" onClick={() => setIsEgresosCollapsed(!isEgresosCollapsed)}>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-semibold">Egresos</CardTitle>
                                <div className="flex items-center gap-1.5 sm:gap-2">
                                    <button 
                                        type="button" 
                                        className="text-slate-400 hover:text-foreground transition-colors p-1"
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            setEditingEgreso(null); 
                                            setIsEgresoModalOpen(true); 
                                        }}
                                        title="Agregar egreso"
                                    >
                                        <PlusCircle className="h-4 w-4" />
                                    </button>
                                    <button type="button" className="text-slate-400 hover:text-foreground transition-colors p-1">
                                        {isEgresosCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                        </CardHeader>
                        {!isEgresosCollapsed && (
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                            <TableHead className="py-1 px-1.5 sm:px-3 text-[11px] sm:text-xs font-semibold text-muted-foreground whitespace-nowrap">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground transition-colors" onClick={() => handleEgresosSort('fecha')}>
                                                    Fecha {egresosSortConfig.key === 'fecha' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="py-1 px-1.5 sm:px-3 text-[11px] sm:text-xs font-semibold text-muted-foreground">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground transition-colors" onClick={() => handleEgresosSort('concepto')}>
                                                    Concepto {egresosSortConfig.key === 'concepto' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="hidden md:table-cell py-1 px-3 text-xs font-semibold text-muted-foreground">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center gap-1 text-xs text-muted-foreground transition-colors" onClick={() => handleEgresosSort('aQuien')}>
                                                    A quién se entrega {egresosSortConfig.key === 'aQuien' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="hidden lg:table-cell py-1 px-3 text-xs font-semibold text-muted-foreground">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center gap-1 text-xs text-muted-foreground transition-colors" onClick={() => handleEgresosSort('comisionServicios')}>
                                                    Com. Servicio {egresosSortConfig.key === 'comisionServicios' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="hidden lg:table-cell py-1 px-3 text-xs font-semibold text-muted-foreground">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center gap-1 text-xs text-muted-foreground transition-colors" onClick={() => handleEgresosSort('comisionProductos')}>
                                                    Com. Producto {egresosSortConfig.key === 'comisionProductos' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="hidden lg:table-cell py-1 px-3 text-xs font-semibold text-muted-foreground">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center gap-1 text-xs text-muted-foreground transition-colors" onClick={() => handleEgresosSort('propina')}>
                                                    Propina {egresosSortConfig.key === 'propina' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="hidden xl:table-cell py-1 px-3 text-xs font-semibold text-muted-foreground">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center gap-1 text-xs text-muted-foreground transition-colors" onClick={() => handleEgresosSort('comentarios')}>
                                                    Comentarios {egresosSortConfig.key === 'comentarios' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="hidden md:table-cell py-1 px-3 text-xs font-semibold text-muted-foreground">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center gap-1 text-xs text-muted-foreground transition-colors" onClick={() => handleEgresosSort('quienPagaNombre')}>
                                                    Pagado por {egresosSortConfig.key === 'quienPagaNombre' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="py-1 px-1.5 sm:px-3 text-[11px] sm:text-xs font-semibold text-muted-foreground text-right whitespace-nowrap">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center justify-end gap-1 text-[11px] sm:text-xs text-muted-foreground transition-colors w-full" onClick={() => handleEgresosSort('monto')}>
                                                    Total {egresosSortConfig.key === 'monto' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="w-[50px] sm:w-[70px] text-right py-1 px-1 sm:px-3 text-xs font-semibold text-muted-foreground"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow className="h-9"><TableCell colSpan={10} className="text-center py-4"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></TableCell></TableRow>
                                        ) : calculatedEgresos.length === 0 ? (
                                            <TableRow className="h-9"><TableCell colSpan={10} className="text-center py-4 text-xs text-muted-foreground">No hay egresos registrados.</TableCell></TableRow>
                                        ) : (
                                            paginatedEgresos.map((egreso: any) => {
                                                const comS = egreso.displayComS;
                                                const comP = egreso.displayComP;
                                                const prop = egreso.displayProp;
                                                const commentClean = egreso.displayComment;

                                                return (
                                                    <TableRow key={egreso.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                                        <TableCell className="py-1.5 px-1.5 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap text-muted-foreground font-medium">
                                                            {egreso.fecha instanceof Timestamp ? format(egreso.fecha.toDate(), 'dd/MM HH:mm') : (egreso.fecha ? format(new Date(egreso.fecha), 'dd/MM HH:mm') : '-')}
                                                        </TableCell>
                                                        <TableCell className="py-1.5 px-1.5 sm:px-3 text-xs">
                                                            <div className="font-medium text-foreground line-clamp-1">{egreso.concepto}</div>
                                                            <div className="text-[10px] text-muted-foreground md:hidden flex items-center gap-1 mt-0.5">
                                                                <span className="truncate max-w-[120px]">Para: {getNameFromId(egreso.aQuien)}</span>
                                                                {egreso.quienPagaNombre && <span className="opacity-70 truncate max-w-[90px]">· {egreso.quienPagaNombre}</span>}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="hidden md:table-cell py-1.5 px-3 text-xs">{getNameFromId(egreso.aQuien)}</TableCell>
                                                        <TableCell className="hidden lg:table-cell py-1.5 px-3 text-xs font-medium text-muted-foreground">{comS > 0 ? `$${comS.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '-'}</TableCell>
                                                        <TableCell className="hidden lg:table-cell py-1.5 px-3 text-xs font-medium text-muted-foreground">{comP > 0 ? `$${comP.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '-'}</TableCell>
                                                        <TableCell className="hidden lg:table-cell py-1.5 px-3 text-xs font-medium text-muted-foreground">{prop > 0 ? `$${prop.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '-'}</TableCell>
                                                        <TableCell className="hidden xl:table-cell py-1.5 px-3 text-xs text-muted-foreground truncate max-w-[120px]">{commentClean || '-'}</TableCell>
                                                        <TableCell className="hidden md:table-cell py-1.5 px-3 text-xs text-muted-foreground">{egreso.quienPagaNombre || '-'}</TableCell>
                                                        <TableCell className="py-1.5 px-1.5 sm:px-3 text-xs text-right whitespace-nowrap">
                                                            <span className="font-bold text-foreground block">${egreso.monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                            {(comS > 0 || prop > 0) && (
                                                                <span className="text-[10px] text-muted-foreground lg:hidden block">
                                                                    {comS > 0 && `Com: $${comS.toLocaleString('es-MX')}`} {prop > 0 && `· Prop: $${prop.toLocaleString('es-MX')}`}
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="py-1.5 px-1 sm:px-3 text-right">
                                                            {!egreso.id.startsWith('comm-') && (
                                                                <div className="flex gap-0.5 sm:gap-1 justify-end items-center">
                                                                    <button type="button" className="text-muted-foreground hover:text-foreground transition-colors p-1" onClick={() => handleOpenEditEgreso(egreso)} title="Editar egreso">
                                                                        <Edit className="h-3.5 w-3.5" />
                                                                    </button>
                                                                    <button type="button" className="text-muted-foreground hover:text-red-400 transition-colors p-1" onClick={() => setEgresoToDelete(egreso)} title="Eliminar egreso">
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                                {calculatedEgresos.length > 0 && (
                                    <div className="flex flex-row items-center justify-between gap-2 p-2.5 sm:p-3 border-t border-border/40 w-full">
                                        <div className="flex items-center gap-1 sm:gap-2">
                                            <span className="text-[11px] text-muted-foreground sm:hidden">Filas:</span>
                                            <span className="text-xs text-muted-foreground hidden sm:inline">Resultados por página</span>
                                            <Select
                                                value={`${egresosPerPage}`}
                                                onValueChange={(value) => {
                                                    setEgresosPerPage(Number(value));
                                                    setEgresosPage(1);
                                                }}
                                            >
                                                <SelectTrigger className="h-7 w-[54px] sm:w-[65px] text-xs px-1.5 bg-background">
                                                    <SelectValue placeholder={egresosPerPage} />
                                                </SelectTrigger>
                                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                                    <SelectItem value="10" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">10</SelectItem>
                                                    <SelectItem value="20" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">20</SelectItem>
                                                    <SelectItem value="50" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">50</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="text-[11px] sm:text-xs font-medium text-muted-foreground text-center">
                                            <span className="hidden sm:inline">Página </span><span className="sm:hidden">Pág. </span>{egresosPage} de {totalEgresosPages}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-1.5 sm:px-2 text-xs"
                                                onClick={() => setEgresosPage(prev => Math.max(prev - 1, 1))}
                                                disabled={egresosPage === 1}
                                            >
                                                <ChevronLeft className="h-3.5 w-3.5" />
                                                <span className="hidden sm:inline ml-1">Anterior</span>
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-1.5 sm:px-2 text-xs"
                                                onClick={() => setEgresosPage(prev => Math.min(prev + 1, totalEgresosPages))}
                                                disabled={egresosPage === totalEgresosPages}
                                            >
                                                <span className="hidden sm:inline mr-1">Siguiente</span>
                                                <ChevronRight className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        )}
                    </Card>
                </div>

                <div className="mt-6">
                    <Card className="rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                        <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors py-2.5 px-4 border-b border-border/40" onClick={() => setIsMovementsCollapsed(!isMovementsCollapsed)}>
                            <div className="flex items-center justify-between gap-4">
                                <CardTitle className="flex items-center gap-2 min-w-0 flex-1 text-base font-semibold">
                                    <DollarSign className="h-4 w-4 text-[#C5A880] flex-shrink-0" />
                                    <span className="truncate sm:whitespace-normal">Flujo de caja</span>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help flex-shrink-0" />
                                        </PopoverTrigger>
                                        <PopoverContent className="w-80 p-3 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white">
                                            <p className="max-w-xs text-xs text-slate-300">
                                                Registro de entregas de efectivo (sobrantes) y entradas de dinero (ajustes) para balancear la caja diaria.
                                                Estos movimientos NO afectan la utilidad neta ya que son transferencias internas de efectivo.
                                            </p>
                                        </PopoverContent>
                                    </Popover>
                                </CardTitle>
                                <div className="flex items-center gap-3 sm:gap-6 flex-shrink-0">
                                    <div className="text-right">
                                        <p className="text-[10px] text-muted-foreground leading-none">Total Entradas</p>
                                        <p className="text-xs sm:text-sm font-bold text-slate-400">${totalEntradas.toLocaleString('es-MX')}</p>
                                    </div>
                                    <div className="text-right border-l border-border/40 pl-3 sm:pl-4">
                                        <p className="text-[10px] text-muted-foreground leading-none">Total Salidas</p>
                                        <p className="text-xs sm:text-sm font-bold text-blue-400">${totalSalidas.toLocaleString('es-MX')}</p>
                                    </div>
                                    <button type="button" className="text-muted-foreground hover:text-foreground transition-colors p-1">
                                        {isMovementsCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                        </CardHeader>
                        {!isMovementsCollapsed && (
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                            <TableHead className="py-1 px-1.5 sm:px-3 text-[11px] sm:text-xs font-semibold text-muted-foreground whitespace-nowrap">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground transition-colors" onClick={() => handleCashMovementsSort('fecha')}>
                                                    Fecha {cashMovementsSortConfig.key === 'fecha' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="py-1 px-1.5 sm:px-3 text-[11px] sm:text-xs font-semibold text-muted-foreground">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground transition-colors" onClick={() => handleCashMovementsSort('tipo')}>
                                                    Tipo {cashMovementsSortConfig.key === 'tipo' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="hidden md:table-cell py-1 px-3 text-xs font-semibold text-muted-foreground">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center gap-1 text-xs text-muted-foreground transition-colors" onClick={() => handleCashMovementsSort('concepto')}>
                                                    Concepto {cashMovementsSortConfig.key === 'concepto' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="hidden lg:table-cell py-1 px-3 text-xs font-semibold text-muted-foreground">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center gap-1 text-xs text-muted-foreground transition-colors" onClick={() => handleCashMovementsSort('quien')}>
                                                    Responsable / Destino {cashMovementsSortConfig.key === 'quien' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="py-1 px-1.5 sm:px-3 text-[11px] sm:text-xs font-semibold text-muted-foreground text-right whitespace-nowrap">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center justify-end gap-1 text-[11px] sm:text-xs text-muted-foreground transition-colors w-full" onClick={() => handleCashMovementsSort('monto')}>
                                                    Monto {cashMovementsSortConfig.key === 'monto' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="hidden md:table-cell py-1 px-3 text-xs font-semibold text-muted-foreground">
                                                <button type="button" className="hover:text-foreground font-medium flex items-center gap-1 text-xs text-muted-foreground transition-colors" onClick={() => handleCashMovementsSort('comentarios')}>
                                                    Comentarios {cashMovementsSortConfig.key === 'comentarios' && <ArrowUpDown className="h-3 w-3" />}
                                                </button>
                                            </TableHead>
                                            <TableHead className="w-[40px] sm:w-[50px] text-right py-1 px-1 sm:px-3 text-xs font-semibold text-muted-foreground"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {egresosLoading || incomesManualLoading ? (
                                            <TableRow className="h-9"><TableCell colSpan={7} className="text-center py-4"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></TableCell></TableRow>
                                        ) : cashMovements.length === 0 ? (
                                            <TableRow className="h-9"><TableCell colSpan={7} className="text-center py-4 text-xs text-muted-foreground">No hay movimientos de flujo de caja registrados este mes.</TableCell></TableRow>
                                        ) : (
                                            paginatedCashMovements.map((mov) => (
                                                <TableRow key={mov.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                                    <TableCell className="py-1.5 px-1.5 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap text-muted-foreground font-medium">{safeFormatDate(mov.fecha)}</TableCell>
                                                    <TableCell className="py-1.5 px-1.5 sm:px-3 text-xs">
                                                        <span className="font-semibold text-foreground block">{mov.tipo}</span>
                                                        <span className="text-[10px] text-muted-foreground md:hidden block truncate max-w-[130px]">
                                                            {mov.concepto || mov.quien}
                                                        </span>
                                                        {mov.comentarios && (
                                                            <span className="text-[10px] text-muted-foreground/80 italic md:hidden block truncate max-w-[130px]">
                                                                "{mov.comentarios}"
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="hidden md:table-cell py-1.5 px-3 text-xs">{mov.concepto}</TableCell>
                                                    <TableCell className="hidden lg:table-cell py-1.5 px-3 text-xs">{mov.quien}</TableCell>
                                                    <TableCell className={cn("py-1.5 px-1.5 sm:px-3 text-xs font-bold text-right whitespace-nowrap", mov.color)}>${mov.monto.toLocaleString('es-MX')}</TableCell>
                                                    <TableCell className="hidden md:table-cell py-1.5 px-3 text-xs text-muted-foreground italic">{mov.comentarios || 'Sin comentario'}</TableCell>
                                                    <TableCell className="py-1.5 px-1 sm:px-3 text-right">
                                                        <button type="button" className="text-muted-foreground hover:text-foreground transition-colors p-1" onClick={() => { setCommentToEdit({ id: mov.id, type: mov.dbType, comment: mov.comentarios || '' }); setIsEditingComment(true); }} title="Editar comentario">
                                                            <FileEdit className="h-3.5 w-3.5" />
                                                        </button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                                {cashMovements.length > 0 && (
                                    <div className="flex flex-row items-center justify-between gap-2 p-2.5 sm:p-3 border-t border-border/40 w-full">
                                        <div className="flex items-center gap-1 sm:gap-2">
                                            <span className="text-[11px] text-muted-foreground sm:hidden">Filas:</span>
                                            <span className="text-xs text-muted-foreground hidden sm:inline">Resultados por página</span>
                                            <Select
                                                value={`${cashMovementsPerPage}`}
                                                onValueChange={(value) => {
                                                    setCashMovementsPerPage(Number(value));
                                                    setCashMovementsPage(1);
                                                }}
                                            >
                                                <SelectTrigger className="h-7 w-[54px] sm:w-[65px] text-xs px-1.5 bg-background">
                                                    <SelectValue placeholder={cashMovementsPerPage} />
                                                </SelectTrigger>
                                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                                    <SelectItem value="10" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">10</SelectItem>
                                                    <SelectItem value="20" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">20</SelectItem>
                                                    <SelectItem value="50" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">50</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="text-[11px] sm:text-xs font-medium text-muted-foreground text-center">
                                            <span className="hidden sm:inline">Página </span><span className="sm:hidden">Pág. </span>{cashMovementsPage} de {totalCashMovementsPages}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-1.5 sm:px-2 text-xs"
                                                onClick={() => setCashMovementsPage(prev => Math.max(prev - 1, 1))}
                                                disabled={cashMovementsPage === 1}
                                            >
                                                <ChevronLeft className="h-3.5 w-3.5" />
                                                <span className="hidden sm:inline ml-1">Anterior</span>
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-1.5 sm:px-2 text-xs"
                                                onClick={() => setCashMovementsPage(prev => Math.min(prev + 1, totalCashMovementsPages))}
                                                disabled={cashMovementsPage === totalCashMovementsPages}
                                            >
                                                <span className="hidden sm:inline mr-1">Siguiente</span>
                                                <ChevronRight className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        )}
                    </Card>
                </div>

                {/* Tabla de Cálculo de Administradora Local */}
                <Card className="my-6 rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                    <CardHeader 
                        className="py-2.5 px-4 border-b border-border/40 cursor-pointer hover:bg-muted/20 transition-colors"
                        onClick={() => setIsAdminBalanceCollapsed(!isAdminBalanceCollapsed)}
                    >
                        <CardTitle className="text-base flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <UserCircle className="h-4 w-4 text-[#C5A880]" />
                                <span>Balance</span>
                                <Popover>
                                    <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help ml-1" />
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 p-3 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white">
                                        <p className="max-w-xs text-xs text-slate-300 text-center">
                                            Cálculo informativo del flujo de efectivo acumulado por la administración local del negocio, considerando entregas de dinero y pagos realizados.
                                        </p>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-4">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={(e) => { e.stopPropagation(); setIsLiquidacionModalOpen(true); }} 
                                    className="h-7 text-xs border-border/60 text-foreground hover:bg-muted/20 flex items-center"
                                >
                                    <DollarSign className="mr-1 h-3 w-3 text-[#C5A880]" /> <span className="hidden sm:inline">Registrar Liquidación</span><span className="sm:hidden">Liquidar</span>
                                </Button>
                                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider hidden md:inline ml-2">Resumen Mensual de Efectivo</span>
                                <button type="button" className="text-slate-400 hover:text-foreground transition-colors p-1">
                                    {isAdminBalanceCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                                </button>
                            </div>
                        </CardTitle>
                    </CardHeader>
                    {!isAdminBalanceCollapsed && (
                        <CardContent className="p-0">
                        {/* Vista Desktop / Tablet: Tabla Completa */}
                        <div className="hidden sm:block">
                        <Table>
                            <TableHeader>
                                <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                    <TableHead className="text-center py-2 px-3 border-r border-border/40">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[10px] uppercase text-muted-foreground font-semibold flex items-center gap-1">
                                                Total Salidas Flow
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <HelpCircle className="h-3 w-3 cursor-help text-slate-400" />
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-80 p-3 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white">
                                                        <p className="max-w-xs text-xs text-slate-300">Efectivo total que ha salido de la caja según los movimientos informativos (lo que la administradora se lleva).</p>
                                                    </PopoverContent>
                                                </Popover>
                                            </span>
                                            <span className="text-blue-400 flex items-center gap-1 font-bold text-xs">
                                                <ArrowUpRight className="h-3 w-3" /> Efectivo Retirado
                                            </span>
                                        </div>
                                    </TableHead>
                                    <TableHead className="text-center py-2 px-3 border-r border-border/40">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[10px] uppercase text-muted-foreground font-semibold flex items-center gap-1">
                                                Total Entradas Flow
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <HelpCircle className="h-3 w-3 cursor-help text-slate-400" />
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-80 p-3 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white">
                                                        <p className="max-w-xs text-xs text-slate-300">Efectivo total que la administradora ha ingresado a la caja para cuadrar faltantes.</p>
                                                    </PopoverContent>
                                                </Popover>
                                            </span>
                                            <span className="text-slate-400 flex items-center gap-1 font-bold text-xs">
                                                <ArrowDownLeft className="h-3 w-3" /> Efectivo Ingresado
                                            </span>
                                        </div>
                                    </TableHead>
                                    <TableHead className="text-center py-2 px-3 border-r border-border/40">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[10px] uppercase text-muted-foreground font-semibold flex items-center gap-1">
                                                Pagos / Reembolsos
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <HelpCircle className="h-3 w-3 cursor-help text-slate-400" />
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-80 p-3 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white">
                                                        <p className="max-w-xs text-xs text-slate-300">Dinero entregado por el Administrador General a la administradora local para saldar deudas del mes.</p>
                                                    </PopoverContent>
                                                </Popover>
                                            </span>
                                            <span className="text-slate-300 flex items-center gap-1 font-bold text-xs">
                                                <DollarSign className="h-3 w-3" /> Liquidaciones
                                            </span>
                                        </div>
                                    </TableHead>
                                    <TableHead className="text-center py-2 px-3 border-r border-border/40">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[10px] uppercase text-muted-foreground font-semibold flex items-center gap-1">
                                                Egresos Pagados
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <HelpCircle className="h-3 w-3 cursor-help text-slate-400" />
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-80 p-3 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white">
                                                        <p className="max-w-xs text-xs text-slate-300">Gastos operativos o de insumos que la administradora pagó de su bolsillo o del efectivo retirado.</p>
                                                    </PopoverContent>
                                                </Popover>
                                            </span>
                                            <span className="text-slate-400 font-bold text-xs">Insumos / Otros</span>
                                        </div>
                                    </TableHead>
                                    <TableHead className="text-center py-2 px-3 bg-muted/20">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[10px] uppercase text-muted-foreground font-semibold flex items-center gap-1">
                                                Estado de Cuenta
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <HelpCircle className="h-3 w-3 cursor-help text-slate-400" />
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-80 p-3 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white">
                                                        <p className="max-w-xs text-xs text-slate-300">Cálculo final: Salidas - Entradas - Egresos pagados. Determina si sobra dinero o si hay un adeudo.</p>
                                                    </PopoverContent>
                                                </Popover>
                                            </span>
                                            <span className="text-foreground font-bold text-xs">Resultado Final</span>
                                        </div>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow className="hover:bg-muted/10 border-b border-border/40">
                                    <TableCell className="text-center py-4 border-r border-border/40">
                                        <span className="text-xl sm:text-2xl font-bold text-blue-400">
                                            ${adminSummaryData.totalSalidas.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-center py-4 border-r border-border/40">
                                        <span className="text-xl sm:text-2xl font-bold text-slate-400">
                                            ${adminSummaryData.totalEntradas.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-center py-4 border-r border-border/40">
                                        <span className="text-xl sm:text-2xl font-bold text-slate-300">
                                            ${(adminSummaryData.totalReembolsos || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-center py-4 border-r border-border/40">
                                        <span className="text-xl sm:text-2xl font-bold text-slate-400">
                                            ${adminSummaryData.egresosAdmin.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-center py-4 bg-muted/20">
                                        <div className="flex flex-col items-center">
                                            <span className={cn("text-2xl sm:text-3xl font-extrabold", adminSummaryData.resultado < 0 ? "text-red-400" : "text-blue-400")}>
                                                {adminSummaryData.resultado < 0 ? `-$${Math.abs(adminSummaryData.resultado).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : `$${adminSummaryData.resultado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
                                            </span>
                                            <span className="text-[10px] mt-1 font-semibold text-muted-foreground uppercase">
                                                {adminSummaryData.resultado >= 0 ? "A Favor Administrador Gral" : "A Favor Administradora Local"}
                                            </span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                        </div>

                        {/* Vista Móvil: Grid Compacto sin desplazamiento horizontal */}
                        <div className="sm:hidden p-3 space-y-2.5">
                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-2.5 rounded-xl border border-border/60 bg-muted/20 flex flex-col">
                                    <span className="text-[10px] uppercase text-muted-foreground font-semibold flex items-center gap-1">
                                        <ArrowUpRight className="h-3 w-3 text-blue-400" /> Salidas Flow
                                    </span>
                                    <span className="text-[9px] text-muted-foreground mb-1">Efectivo Retirado</span>
                                    <span className="text-base font-bold text-blue-400 mt-auto">
                                        ${adminSummaryData.totalSalidas.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="p-2.5 rounded-xl border border-border/60 bg-muted/20 flex flex-col">
                                    <span className="text-[10px] uppercase text-muted-foreground font-semibold flex items-center gap-1">
                                        <ArrowDownLeft className="h-3 w-3 text-slate-400" /> Entradas Flow
                                    </span>
                                    <span className="text-[9px] text-muted-foreground mb-1">Efectivo Ingresado</span>
                                    <span className="text-base font-bold text-slate-400 mt-auto">
                                        ${adminSummaryData.totalEntradas.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="p-2.5 rounded-xl border border-border/60 bg-muted/20 flex flex-col">
                                    <span className="text-[10px] uppercase text-muted-foreground font-semibold flex items-center gap-1">
                                        <DollarSign className="h-3 w-3 text-[#C5A880]" /> Liquidaciones
                                    </span>
                                    <span className="text-[9px] text-muted-foreground mb-1">Pagos / Reembolsos</span>
                                    <span className="text-base font-bold text-slate-300 mt-auto">
                                        ${(adminSummaryData.totalReembolsos || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="p-2.5 rounded-xl border border-border/60 bg-muted/20 flex flex-col">
                                    <span className="text-[10px] uppercase text-muted-foreground font-semibold flex items-center gap-1">
                                        Egresos Pagados
                                    </span>
                                    <span className="text-[9px] text-muted-foreground mb-1">Insumos / Otros</span>
                                    <span className="text-base font-bold text-slate-400 mt-auto">
                                        ${adminSummaryData.egresosAdmin.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                            <div className="p-3 rounded-xl border border-border/60 bg-muted/30 text-center">
                                <span className="text-[10px] uppercase text-muted-foreground font-semibold block">
                                    Estado de Cuenta · Resultado Final
                                </span>
                                <div className={cn("text-2xl font-extrabold mt-0.5", adminSummaryData.resultado < 0 ? "text-red-400" : "text-blue-400")}>
                                    {adminSummaryData.resultado < 0 ? `-$${Math.abs(adminSummaryData.resultado).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : `$${adminSummaryData.resultado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
                                </div>
                                <span className="text-[10px] mt-0.5 font-semibold text-muted-foreground uppercase block">
                                    {adminSummaryData.resultado >= 0 ? "A Favor Administrador Gral" : "A Favor Administradora Local"}
                                </span>
                            </div>
                        </div>

                        {/* Sub-tabla de detalle de liquidaciones */}
                        <div className="border-t border-border/40 bg-muted/10 p-2.5 sm:p-4">
                            <div className="flex items-center justify-between mb-2 sm:mb-3">
                                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                    <DollarSign className="h-3.5 w-3.5 text-[#C5A880]" /> Historial de Liquidaciones del mes
                                </h4>
                            </div>
                            {liquidacionesLoading ? (
                                <div className="flex justify-center p-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                            ) : liquidaciones.length === 0 ? (
                                <div className="text-center py-4 text-xs text-muted-foreground border border-dashed border-border/60 rounded-xl bg-card/40">
                                    No se han registrado liquidaciones directas este mes.
                                </div>
                            ) : (
                                <div className="rounded-xl border border-border/60 overflow-hidden bg-card/60">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                                <TableHead className="py-1 px-2 sm:px-3 text-[11px] sm:text-xs font-semibold text-muted-foreground whitespace-nowrap">Fecha</TableHead>
                                                <TableHead className="py-1 px-2 sm:px-3 text-[11px] sm:text-xs font-semibold text-muted-foreground">Monto</TableHead>
                                                <TableHead className="hidden sm:table-cell py-1 px-3 text-xs font-semibold text-muted-foreground">Comentarios / Notas</TableHead>
                                                <TableHead className="w-[50px] sm:w-[70px] text-right py-1 px-1 sm:px-3 text-xs font-semibold text-muted-foreground"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {liquidaciones.sort((a: any, b: any) => (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0)).map((liq: any) => (
                                                <TableRow key={liq.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                                    <TableCell className="py-1.5 px-2 sm:px-3 text-[11px] sm:text-xs whitespace-nowrap font-medium text-foreground">
                                                        {format(liq.fecha instanceof Timestamp ? liq.fecha.toDate() : new Date(), 'dd/MM/yyyy HH:mm')}
                                                    </TableCell>
                                                    <TableCell className="py-1.5 px-2 sm:px-3 text-xs">
                                                        <span className="font-bold text-foreground block">${liq.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                                        {liq.comentarios && (
                                                            <span className="text-[10px] text-muted-foreground italic sm:hidden block truncate max-w-[130px]">
                                                                {liq.comentarios}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="hidden sm:table-cell py-1.5 px-3 text-xs italic text-muted-foreground">{liq.comentarios || 'Sin nota'}</TableCell>
                                                    <TableCell className="py-1.5 px-1 sm:px-3 text-right">
                                                        <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                                                            <button 
                                                                type="button"
                                                                className="text-slate-400 hover:text-foreground transition-colors p-1" 
                                                                onClick={() => { setCommentToEdit({ id: liq.id, type: 'liquidacion', comment: liq.comentarios || '', monto: liq.monto }); setIsEditingComment(true); }}
                                                                title="Editar liquidación"
                                                            >
                                                                <FileEdit className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button 
                                                                type="button"
                                                                className="text-slate-400 hover:text-red-400 transition-colors p-1" 
                                                                onClick={() => { if (confirm('¿Deseas eliminar este registro de liquidación?')) handleDeleteLiquidacion(liq.id); }}
                                                                title="Eliminar liquidación"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </div>
                    </CardContent>
                    )}
                </Card>
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
                source="finanzas"
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
                <DialogContent className="p-0 overflow-hidden rounded-2xl border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)] sm:max-w-md bg-card" hideCloseButton={true}>
                    <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 border-b border-slate-800 text-white">
                        <div className="header-light-beam pointer-events-none" />
                        <div className="relative z-10 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <DollarSign className="h-5 w-5 text-[#C5A880]" />
                                <div>
                                    <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                                        Ajustar Comisión Mensual ({editingCommissionType === 'service' ? 'Servicios' : 'Productos'})
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-slate-300 mt-0.5">
                                        Ajuste para <strong>{editingCommissionUser?.name}</strong> solo para el mes de {monthName}
                                    </DialogDescription>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsCommissionModalOpen(false)}
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    {editingCommissionUser && (
                        <div className="grid gap-4 p-5">
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo de comisión</Label>
                                <Select
                                    value={editingCommissionUser.type}
                                    onValueChange={(val: 'fixed' | 'percentage') => setEditingCommissionUser({ ...editingCommissionUser, type: val })}
                                >
                                    <SelectTrigger className="h-10 text-xs rounded-xl border-border/60">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                        <SelectItem value="fixed" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Monto Fijo ($)</SelectItem>
                                        <SelectItem value="percentage" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Porcentaje Utilidad (%)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{editingCommissionUser.type === 'fixed' ? 'Monto ($)' : 'Porcentaje (%)'}</Label>
                                <Input
                                    type="number"
                                    value={editingCommissionUser.value}
                                    onChange={(e) => setEditingCommissionUser({ ...editingCommissionUser, value: Number(e.target.value) })}
                                    className="h-10 text-xs rounded-xl"
                                />
                            </div>
                        </div>
                    )}
                    <div className="p-4 bg-muted/20 border-t border-border/40 flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsCommissionModalOpen(false)} className="rounded-xl text-xs h-9">Cancelar</Button>
                        <Button variant="alfa" onClick={handleSaveCommission} className="rounded-xl text-xs h-9 font-semibold px-4">Guardar Ajuste</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Manual Override Dialog */}
            <Dialog open={isOverrideModalOpen} onOpenChange={setIsOverrideModalOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] p-0 overflow-hidden rounded-2xl border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card" hideCloseButton={true}>
                    <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 border-b border-slate-800 text-white">
                        <div className="header-light-beam pointer-events-none" />
                        <div className="relative z-10 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <FileEdit className="h-5 w-5 text-slate-300" />
                                <div>
                                    <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                                        Editar datos financieros — {capitalize(monthName)} {selectedYear}
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-slate-300 mt-0.5">
                                        Ingresa los datos manuales para este mes. Los datos automáticos serán reemplazados.
                                    </DialogDescription>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsOverrideModalOpen(false)}
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4 p-4 sm:p-6 overflow-y-auto max-h-[calc(90vh-140px)] min-h-0">
                        <div className="p-3 bg-muted/20 border border-border/40 rounded-xl text-xs text-muted-foreground flex items-center gap-2.5">
                            <HelpCircle className="h-4 w-4 text-blue-400 shrink-0" />
                            <span>Los datos manuales anulan temporalmente los cálculos automáticos del sistema para este mes. Puedes restaurar los valores automáticos en cualquier momento.</span>
                        </div>
                        {/* Resumen de Servicios */}
                        <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
                            <div className="py-2 px-3.5 bg-muted/30 border-b border-border/40 font-semibold text-xs text-foreground flex items-center gap-2">
                                <Scissors className="h-3.5 w-3.5 text-muted-foreground" /> Resumen de Servicios
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5">
                                <div>
                                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase">Ingreso total</Label>
                                    <CurrencyInput value={overrideForm.servicios_ingreso} onChange={v => setOverrideForm(f => ({ ...f, servicios_ingreso: v }))} className="mt-1" />
                                </div>
                                <div>
                                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase">Egreso total</Label>
                                    <CurrencyInput value={overrideForm.servicios_egreso} onChange={v => setOverrideForm(f => ({ ...f, servicios_egreso: v }))} className="mt-1" />
                                </div>
                                <div>
                                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase">Subtotal de utilidad</Label>
                                    <CurrencyInput value={overrideForm.servicios_subtotal} onChange={v => setOverrideForm(f => ({ ...f, servicios_subtotal: v }))} className="mt-1" />
                                </div>
                                <div>
                                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase">Comisión admin</Label>
                                    <CurrencyInput value={overrideForm.servicios_comision_admin} onChange={v => setOverrideForm(f => ({ ...f, servicios_comision_admin: v }))} className="mt-1" />
                                </div>
                                <div className="col-span-1 sm:col-span-2 p-2.5 bg-muted/30 rounded-xl border border-border/40 flex items-center justify-between">
                                    <Label className="text-xs font-semibold text-foreground">Utilidad neta (Servicios)</Label>
                                    <CurrencyInput value={overrideForm.servicios_utilidad} onChange={v => setOverrideForm(f => ({ ...f, servicios_utilidad: v }))} className="w-36 font-bold" />
                                </div>
                            </div>
                        </div>

                        {/* Resumen de Productos */}
                        <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
                            <div className="py-2 px-3.5 bg-muted/30 border-b border-border/40 font-semibold text-xs text-foreground flex items-center gap-2">
                                <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" /> Resumen de Productos
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5">
                                <div>
                                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase">Ingreso total</Label>
                                    <CurrencyInput value={overrideForm.productos_ingreso} onChange={v => setOverrideForm(f => ({ ...f, productos_ingreso: v }))} className="mt-1" />
                                </div>
                                <div>
                                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase">Reinversión</Label>
                                    <CurrencyInput value={overrideForm.productos_reinversion} onChange={v => setOverrideForm(f => ({ ...f, productos_reinversion: v }))} className="mt-1" />
                                </div>
                                <div>
                                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase">Comisión profesionales</Label>
                                    <CurrencyInput value={overrideForm.productos_comision_prof} onChange={v => setOverrideForm(f => ({ ...f, productos_comision_prof: v }))} className="mt-1" />
                                </div>
                                <div>
                                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase">Subtotal utilidad</Label>
                                    <CurrencyInput value={overrideForm.productos_subtotal} onChange={v => setOverrideForm(f => ({ ...f, productos_subtotal: v }))} className="mt-1" />
                                </div>
                                <div className="col-span-1 sm:col-span-2 p-2.5 bg-muted/30 rounded-xl border border-border/40 flex items-center justify-between">
                                    <Label className="text-xs font-semibold text-foreground">Utilidad neta (Productos)</Label>
                                    <CurrencyInput value={overrideForm.productos_utilidad} onChange={v => setOverrideForm(f => ({ ...f, productos_utilidad: v }))} className="w-36 font-bold" />
                                </div>
                            </div>
                        </div>

                        {/* Egresos */}
                        <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
                            <div className="py-2 px-3.5 bg-muted/30 border-b border-border/40 font-semibold text-xs text-foreground flex items-center gap-2">
                                <DollarSign className="h-3.5 w-3.5 text-[#C5A880]" /> Egresos y Comisiones
                            </div>
                            <div className="p-3.5 space-y-4">
                                <div className="p-3 border border-border/50 rounded-xl bg-muted/20">
                                    <Label className="text-xs font-semibold mb-2.5 block text-foreground">Comisiones Servicios (por profesional)</Label>
                                    <div className="space-y-2">
                                        {overrideForm.egresos_comisiones_servicios.map((item, index) => (
                                            <div key={index} className="flex items-center gap-2 bg-background p-2 rounded-xl border border-border/40">
                                                <Input
                                                    placeholder="Nombre del profesional"
                                                    value={item.nombre}
                                                    onChange={e => updateComisionServicio(index, 'nombre', e.target.value)}
                                                    className="flex-1 bg-background text-xs h-8"
                                                />
                                                <CurrencyInput
                                                    value={item.monto}
                                                    onChange={v => updateComisionServicio(index, 'monto', v)}
                                                    className="w-28 bg-background font-medium text-xs h-8"
                                                />
                                                <button 
                                                    type="button"
                                                    className="text-muted-foreground hover:text-red-400 p-1 transition-colors" 
                                                    onClick={() => removeComisionServicio(index)}
                                                    title="Eliminar profesional"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                        <Button variant="outline" size="sm" onClick={addComisionServicio} className="mt-2 w-full border-dashed text-xs h-8">
                                            <PlusCircle className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" /> Agregar profesional
                                        </Button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                    <div>
                                        <Label className="text-[11px] font-semibold text-muted-foreground uppercase">Comisiones Productos</Label>
                                        <CurrencyInput value={overrideForm.egresos_comisiones_productos} onChange={v => setOverrideForm(f => ({ ...f, egresos_comisiones_productos: v }))} className="mt-1" />
                                    </div>
                                    <div>
                                        <Label className="text-[11px] font-semibold text-muted-foreground uppercase">Nómina</Label>
                                        <CurrencyInput value={overrideForm.egresos_nomina} onChange={v => setOverrideForm(f => ({ ...f, egresos_nomina: v }))} className="mt-1" />
                                    </div>
                                    <div>
                                        <Label className="text-[11px] font-semibold text-muted-foreground uppercase">Insumos</Label>
                                        <CurrencyInput value={overrideForm.egresos_insumos} onChange={v => setOverrideForm(f => ({ ...f, egresos_insumos: v }))} className="mt-1" />
                                    </div>
                                    <div>
                                        <Label className="text-[11px] font-semibold text-muted-foreground uppercase">Costos fijos</Label>
                                        <CurrencyInput value={overrideForm.egresos_costos_fijos} onChange={v => setOverrideForm(f => ({ ...f, egresos_costos_fijos: v }))} className="mt-1" />
                                    </div>
                                    <div>
                                        <Label className="text-[11px] font-semibold text-muted-foreground uppercase">Propinas (Informativo)</Label>
                                        <CurrencyInput value={overrideForm.egresos_propinas} onChange={v => setOverrideForm(f => ({ ...f, egresos_propinas: v }))} className="mt-1" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-muted/20 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-3">
                        {hasOverride ? (
                            <Button variant="outline" size="sm" onClick={handleDeleteOverride} className="w-full sm:w-auto text-xs text-red-400 hover:text-red-300 border-red-500/30 hover:bg-red-500/10 h-9">
                                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Restaurar datos automáticos
                            </Button>
                        ) : <div />}
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            <Button variant="outline" onClick={() => setIsOverrideModalOpen(false)} className="rounded-xl text-xs h-9">
                                Cancelar
                            </Button>
                            <Button variant="alfa" onClick={handleSaveOverride} disabled={isSavingOverride} className="rounded-xl text-xs h-9 font-semibold px-4">
                                {isSavingOverride ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                                Guardar datos
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            <Dialog open={isEditingComment} onOpenChange={setIsEditingComment}>
                <DialogContent className="p-0 overflow-hidden rounded-2xl border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)] sm:max-w-md bg-card" hideCloseButton={true}>
                    <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 border-b border-slate-800 text-white">
                        <div className="header-light-beam pointer-events-none" />
                        <div className="relative z-10 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <FileEdit className="h-5 w-5 text-slate-300" />
                                <div>
                                    <DialogTitle className="text-base font-bold text-white tracking-wide">
                                        Editar Comentario
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-slate-300 mt-0.5">
                                        Actualiza el comentario o monto para este movimiento de caja
                                    </DialogDescription>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsEditingComment(false)}
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    <div className="p-5 space-y-4">
                        {commentToEdit?.type === 'liquidacion' && (
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase">Monto</Label>
                                <CurrencyInput
                                    value={commentToEdit.monto || 0}
                                    onChange={(val) => setCommentToEdit(prev => prev ? { ...prev, monto: val } : null)}
                                    className="h-9 text-xs"
                                />
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase">Comentario / Nota</Label>
                            <Input
                                value={commentToEdit?.comment || ''}
                                onChange={(e) => setCommentToEdit(prev => prev ? { ...prev, comment: e.target.value } : null)}
                                placeholder="Escribe un comentario o nota..."
                                className="h-9 text-xs rounded-xl"
                            />
                        </div>
                    </div>
                    <div className="p-4 bg-muted/20 border-t border-border/40 flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsEditingComment(false)} className="rounded-xl text-xs h-9">Cancelar</Button>
                        <Button variant="alfa" onClick={handleSaveComment} className="rounded-xl text-xs h-9 font-semibold px-4">Guardar cambio</Button>
                    </div>
                </DialogContent>
            </Dialog>

            <AddLiquidacionModal
                isOpen={isLiquidacionModalOpen}
                onOpenChange={setIsLiquidacionModalOpen}
                onSuccess={() => {
                    setIsLiquidacionModalOpen(false);
                    setQueryKey(prev => prev + 1);
                    toast({ title: 'Liquidación registrada', description: 'El pago se ha guardado correctamente como control interno.' });
                }}
                monthYear={`${monthName.toLowerCase()}_${selectedYear}`}
                currentBalance={adminSummaryData.resultado}
            />
        </>
    );
}

function AddLiquidacionModal({ isOpen, onOpenChange, onSuccess, monthYear, currentBalance = 0 }: { isOpen: boolean, onOpenChange: (val: boolean) => void, onSuccess: () => void, monthYear: string, currentBalance?: number }) {
    const [monto, setMonto] = useState(0);
    const [comentarios, setComentarios] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleQuickFill = () => {
        if (currentBalance < 0) {
            setMonto(Math.abs(currentBalance));
            setComentarios(`Liquidación de balance (${monthYear.replace('_', ' ')})`);
        }
    };

    const handleSave = async () => {
        if (monto <= 0) return;
        setIsSaving(true);
        try {
            await setDoc(doc(collection(db, `finanzas_mensuales/${monthYear}/liquidaciones_admin`)), {
                monto,
                comentarios: comentarios || 'Liquidación de balance mensual',
                fecha: Timestamp.now(),
                monthYear
            });
            onSuccess();
            setMonto(0);
            setComentarios('');
        } catch (error) {
            console.error('Error saving liquidacion:', error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="p-0 overflow-hidden rounded-2xl border-2 border-blue-500 shadow-[0_10px_30px_rgba(59,130,246,0.18)] sm:max-w-md bg-card" hideCloseButton={true}>
                <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 border-b border-slate-800 text-white">
                    <div className="header-light-beam pointer-events-none" />
                    <div className="relative z-10 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <DollarSign className="h-5 w-5 text-[#C5A880]" />
                            <div>
                                <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                                    Registrar Pago a Administradora
                                </DialogTitle>
                                <DialogDescription className="text-xs text-slate-300 mt-0.5">
                                    Liquidación de balance mensual o reembolso de caja
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

                <div className="space-y-4 p-5">
                    {/* Tarjeta de estado de balance actual */}
                    <div className="p-3 rounded-xl border border-border/60 bg-muted/20 flex items-center justify-between">
                        <div>
                            <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                                Balance acumulado del mes
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={cn("text-base font-bold", currentBalance < 0 ? "text-red-400" : "text-blue-400")}>
                                    {currentBalance < 0 ? `-$${Math.abs(currentBalance).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : `$${currentBalance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                    ({currentBalance < 0 ? "A favor administradora" : "A favor administrador gral"})
                                </span>
                            </div>
                        </div>
                        {currentBalance < 0 && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleQuickFill}
                                className="h-7 text-[11px] px-2 border-border/60 text-foreground hover:bg-muted/30"
                            >
                                Saldar total
                            </Button>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
                            <DollarSign className="mr-1 h-3.5 w-3.5 text-[#C5A880]" /> Monto a entregar
                        </Label>
                        <CurrencyInput value={monto} onChange={setMonto} className="h-10 text-base font-bold" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Comentarios / Nota</Label>
                        <Input 
                            placeholder="Ej. Depósito parcial, pago de adeudo, liquidación del mes..." 
                            value={comentarios} 
                            onChange={(e) => setComentarios(e.target.value)} 
                            className="h-10 text-xs rounded-xl"
                        />
                    </div>
                    <div className="p-3 bg-muted/20 border border-border/40 rounded-xl text-xs text-muted-foreground flex items-start gap-2.5">
                        <HelpCircle className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                        <span>Este registro es de control interno y <strong className="text-foreground">NO afecta</strong> los ingresos fiscales reportados en la caja diaria.</span>
                    </div>
                </div>

                <div className="p-4 bg-muted/20 border-t border-border/40 flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving} className="rounded-xl text-xs h-9">
                        Cancelar
                    </Button>
                    <Button variant="alfa" onClick={handleSave} disabled={isSaving || monto <= 0} className="rounded-xl text-xs h-9 font-semibold px-4">
                        {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5 mr-1.5 text-[#C5A880]" />}
                        Confirmar Pago
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
