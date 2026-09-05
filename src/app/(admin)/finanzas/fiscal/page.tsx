'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Sale } from '@/lib/types';
import { Timestamp, doc, onSnapshot, setDoc, where, collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { useToast } from '@/hooks/use-toast';
import { 
    Landmark, 
    Calendar, 
    CreditCard, 
    Banknote, 
    DollarSign, 
    Copy, 
    Check, 
    ExternalLink, 
    ShieldCheck, 
    AlertTriangle, 
    Info, 
    FileText, 
    Save, 
    HelpCircle,
    ChevronLeft,
    ChevronRight,
    Calculator,
    CheckCircle2,
    Clock,
    Lock
} from 'lucide-react';
import { startOfMonth, endOfMonth, format } from 'date-fns';

const monthNames = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const monthLabels = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Tabla de tasas de ISR para RESICO Persona Física (Art. 113-E Ley del ISR)
function getResicoIsrRate(incomeWithoutVat: number): number {
    if (incomeWithoutVat <= 25000) return 1.0;
    if (incomeWithoutVat <= 50000) return 1.1;
    if (incomeWithoutVat <= 83333.33) return 1.5;
    if (incomeWithoutVat <= 208333.33) return 2.0;
    return 2.5;
}

interface DeclaracionFiscalData {
    estado: 'pendiente' | 'presentada';
    estrategia: 'bancarizado' | 'bancarizado_mas_efectivo' | 'total' | 'personalizado';
    montoPersonalizado?: number;
    porcentajeEfectivo?: number;
    comisionMercadoPagoFacturada?: number;
    ivaComisionesAcreditable?: number;
    otrosGastosConFactura?: number;
    ivaOtrosGastosAcreditable?: number;
    folioOperacionSAT?: string;
    lineaCaptura?: string;
    fechaPago?: string;
    notas?: string;
    montoDeclaradoFinal?: number;
    isrPagadoFinal?: number;
    ivaPagadoFinal?: number;
    totalPagadoFinal?: number;
}

export default function ControlFiscalResicoPage() {
    const { toast } = useToast();
    const currentDate = new Date();

    const [selectedMonthIdx, setSelectedMonthIdx] = useState(currentDate.getMonth() === 0 ? 11 : currentDate.getMonth() - 1); // Por defecto el mes anterior (mes que se declara)
    const [selectedYear, setSelectedYear] = useState(currentDate.getMonth() === 0 ? currentDate.getFullYear() - 1 : currentDate.getFullYear());

    const monthName = monthNames[selectedMonthIdx];
    const monthLabel = monthLabels[selectedMonthIdx];
    const monthDocId = `${monthName}_${selectedYear}`;

    // Rango de fechas del mes seleccionado
    const { startDate, endDate } = useMemo(() => {
        const d = new Date(selectedYear, selectedMonthIdx, 1);
        return {
            startDate: startOfMonth(d),
            endDate: endOfMonth(d),
        };
    }, [selectedYear, selectedMonthIdx]);

    const salesQueryConstraints = useMemo(() => {
        return [
            where('fecha_hora_venta', '>=', Timestamp.fromDate(startDate)),
            where('fecha_hora_venta', '<=', Timestamp.fromDate(endDate))
        ];
    }, [startDate, endDate]);

    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>(
        'ventas',
        `fiscal-sales-${monthName}-${selectedYear}`,
        ...salesQueryConstraints
    );

    // Estado de persistencia en Firestore para el mes
    const [fiscalData, setFiscalData] = useState<DeclaracionFiscalData>({
        estado: 'pendiente',
        estrategia: 'bancarizado',
        montoPersonalizado: 0,
        porcentajeEfectivo: 20,
        comisionMercadoPagoFacturada: 2100,
        ivaComisionesAcreditable: 289.65,
        otrosGastosConFactura: 0,
        ivaOtrosGastosAcreditable: 0,
        folioOperacionSAT: '',
        lineaCaptura: '',
        fechaPago: '',
        notas: '',
    });

    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Cargar datos de persistencia de Firestore para el mes seleccionado
    useEffect(() => {
        if (!db) return;
        const unsub = onSnapshot(doc(db, 'finanzas_mensuales', monthDocId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.declaracion_fiscal) {
                    setFiscalData(prev => ({
                        ...prev,
                        ...data.declaracion_fiscal,
                    }));
                } else {
                    setFiscalData({
                        estado: 'pendiente',
                        estrategia: 'bancarizado',
                        montoPersonalizado: 0,
                        porcentajeEfectivo: 20,
                        comisionMercadoPagoFacturada: 2100,
                        ivaComisionesAcreditable: 289.65,
                        otrosGastosConFactura: 0,
                        ivaOtrosGastosAcreditable: 0,
                        folioOperacionSAT: '',
                        lineaCaptura: '',
                        fechaPago: '',
                        notas: '',
                    });
                }
            }
        });
        return () => unsub();
    }, [monthDocId]);

    // Cargar historial anual de todas las declaraciones del año seleccionado
    const [yearlyFiscalRecords, setYearlyFiscalRecords] = useState<Record<string, any>>({});

    useEffect(() => {
        if (!db) return;
        const fetchYearlyData = async () => {
            try {
                const snap = await getDocs(collection(db, 'finanzas_mensuales'));
                const records: Record<string, any> = {};
                snap.forEach(d => {
                    if (d.id.includes(String(selectedYear))) {
                        const [m] = d.id.split('_');
                        const data = d.data();
                        if (data.declaracion_fiscal) {
                            records[m] = data.declaracion_fiscal;
                        }
                    }
                });
                setYearlyFiscalRecords(records);
            } catch (err) {
                console.error("Error fetching yearly fiscal records:", err);
            }
        };
        fetchYearlyData();
    }, [selectedYear, fiscalData.estado, fiscalData.folioOperacionSAT]);

    // Cálculo exacto de ingresos del mes: Bancarizado vs Efectivo
    const incomeBreakdown = useMemo(() => {
        if (!sales) return { bancarizado: 0, efectivo: 0, total: 0, tarjeta: 0, transferencia: 0, online: 0 };

        let bancarizado = 0;
        let efectivo = 0;
        let tarjetaTotal = 0;
        let transferenciaTotal = 0;
        let onlineTotal = 0;

        sales.forEach(sale => {
            const actualRevenue = (sale.pago_estado === 'deposit_paid' || (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total))
                ? (sale.monto_pagado_real || 0)
                : (sale.total || 0);

            if (sale.metodo_pago === 'combinado' && sale.detalle_pago_combinado) {
                const ce = sale.detalle_pago_combinado.efectivo || 0;
                const ct = sale.detalle_pago_combinado.tarjeta || 0;
                const ctr = sale.detalle_pago_combinado.transferencia || 0;
                const co = sale.detalle_pago_combinado.pagos_en_linea || 0;
                const csum = ce + ct + ctr + co;

                if (csum > 0 && Math.abs(csum - actualRevenue) > 0.01) {
                    const factor = actualRevenue / csum;
                    efectivo += ce * factor;
                    tarjetaTotal += ct * factor;
                    transferenciaTotal += ctr * factor;
                    onlineTotal += co * factor;
                    bancarizado += (ct + ctr + co) * factor;
                } else {
                    efectivo += ce;
                    tarjetaTotal += ct;
                    transferenciaTotal += ctr;
                    onlineTotal += co;
                    bancarizado += (ct + ctr + co);
                }
            } else if (sale.metodo_pago === 'efectivo') {
                efectivo += actualRevenue;
            } else if (sale.metodo_pago === 'tarjeta') {
                tarjetaTotal += actualRevenue;
                bancarizado += actualRevenue;
            } else if (sale.metodo_pago === 'transferencia') {
                transferenciaTotal += actualRevenue;
                bancarizado += actualRevenue;
            } else if (sale.metodo_pago === 'mercadopago' || sale.pago_estado === 'deposit_paid') {
                onlineTotal += actualRevenue;
                bancarizado += actualRevenue;
            } else {
                bancarizado += actualRevenue;
            }
        });

        const total = bancarizado + efectivo;
        return { bancarizado, efectivo, total, tarjeta: tarjetaTotal, transferencia: transferenciaTotal, online: onlineTotal };
    }, [sales]);

    // Estrategia y Monto a Declarar
    const montoADeclararBruto = useMemo(() => {
        if (fiscalData.estrategia === 'bancarizado') {
            return incomeBreakdown.bancarizado;
        }
        if (fiscalData.estrategia === 'bancarizado_mas_efectivo') {
            const pct = (fiscalData.porcentajeEfectivo || 20) / 100;
            return incomeBreakdown.bancarizado + (incomeBreakdown.efectivo * pct);
        }
        if (fiscalData.estrategia === 'total') {
            return incomeBreakdown.total;
        }
        if (fiscalData.estrategia === 'personalizado') {
            return fiscalData.montoPersonalizado || 0;
        }
        return incomeBreakdown.bancarizado;
    }, [fiscalData.estrategia, fiscalData.montoPersonalizado, fiscalData.porcentajeEfectivo, incomeBreakdown]);

    // En México los precios al público de barbería y productos ya incluyen IVA (16%)
    // Base sin IVA = Monto / 1.16
    const baseGravableSinIVA = useMemo(() => {
        return montoADeclararBruto > 0 ? (montoADeclararBruto / 1.16) : 0;
    }, [montoADeclararBruto]);

    // ISR RESICO
    const tasaIsr = useMemo(() => {
        return getResicoIsrRate(baseGravableSinIVA);
    }, [baseGravableSinIVA]);

    const isrCalculado = useMemo(() => {
        return baseGravableSinIVA * (tasaIsr / 100);
    }, [baseGravableSinIVA, tasaIsr]);

    const isrRedondeado = Math.round(isrCalculado);

    // IVA (16%)
    const ivaTrasladado = useMemo(() => {
        return baseGravableSinIVA * 0.16;
    }, [baseGravableSinIVA]);

    // Deducción de IVA Acreditable (Comisiones MP + Insumos)
    const ivaAcreditableTotal = useMemo(() => {
        const ivaMP = fiscalData.ivaComisionesAcreditable || 0;
        const ivaOtros = fiscalData.ivaOtrosGastosAcreditable || 0;
        return ivaMP + ivaOtros;
    }, [fiscalData.ivaComisionesAcreditable, fiscalData.ivaOtrosGastosAcreditable]);

    const ivaAPagar = Math.max(0, ivaTrasladado - ivaAcreditableTotal);
    const ivaRedondeado = Math.round(ivaAPagar);

    const granTotalAPagarSAT = isrRedondeado + ivaRedondeado;

    // Funciones de utilidad
    const copyToClipboard = (text: string, fieldId: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(fieldId);
        toast({
            title: "Copiado al portapapeles",
            description: `Valor listo para pegar en el SAT: ${text}`,
        });
        setTimeout(() => setCopiedField(null), 2000);
    };

    const handleSaveFiscalData = async () => {
        if (!db) return;
        setIsSaving(true);
        try {
            const dataToSave = {
                declaracion_fiscal: {
                    ...fiscalData,
                    montoDeclaradoFinal: Number(montoADeclararBruto.toFixed(2)),
                    isrPagadoFinal: isrRedondeado,
                    ivaPagadoFinal: ivaRedondeado,
                    totalPagadoFinal: granTotalAPagarSAT,
                    updatedAt: Timestamp.now(),
                }
            };
            await setDoc(doc(db, 'finanzas_mensuales', monthDocId), dataToSave, { merge: true });
            toast({
                title: "Datos fiscales guardados",
                description: `Los ajustes para ${monthLabel} ${selectedYear} se guardaron exitosamente.`,
            });
        } catch (error) {
            console.error("Error saving fiscal data:", error);
            toast({
                title: "Error al guardar",
                description: "No se pudieron actualizar los datos fiscales.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handlePrevMonth = () => {
        if (selectedMonthIdx === 0) {
            setSelectedMonthIdx(11);
            setSelectedYear(y => y - 1);
        } else {
            setSelectedMonthIdx(m => m - 1);
        }
    };

    const handleNextMonth = () => {
        if (selectedMonthIdx === 11) {
            setSelectedMonthIdx(0);
            setSelectedYear(y => y + 1);
        } else {
            setSelectedMonthIdx(m => m + 1);
        }
    };

    return (
        <div className="container mx-auto p-4 sm:p-6 max-w-7xl space-y-6">
            {/* Header del Módulo */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <Landmark className="h-6 w-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-[#202A49]">Control Fiscal RESICO</h1>
                            <p className="text-sm text-muted-foreground">
                                Pre-cálculo y autogestión de declaraciones mensuales ante el SAT para VATOS ALFA
                            </p>
                        </div>
                    </div>
                </div>

                {/* Controles de Período y Estado */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center bg-background border rounded-lg p-1 shadow-sm">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevMonth}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="px-3 text-sm font-semibold text-[#202A49] min-w-[130px] text-center">
                            {monthLabel} {selectedYear}
                        </span>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNextMonth}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    <Badge 
                        variant={fiscalData.estado === 'presentada' ? 'default' : 'outline'}
                        className={cn(
                            "px-3 py-1 text-xs font-semibold gap-1.5",
                            fiscalData.estado === 'presentada' 
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white" 
                                : "border-amber-500/50 text-amber-700 bg-amber-50"
                        )}
                    >
                        {fiscalData.estado === 'presentada' ? (
                            <>
                                <CheckCircle2 className="h-3.5 w-3.5" /> Presentada y Pagada
                            </>
                        ) : (
                            <>
                                <Clock className="h-3.5 w-3.5" /> Pendiente (Vence día 17)
                            </>
                        )}
                    </Badge>

                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="gap-1.5 border-primary/20 text-[#202A49]"
                        onClick={() => window.open('https://www.sat.gob.mx/declaracion/74744/presenta-tus-declaraciones-provisionales-o-definitivas-de-personas-fisicas', '_blank')}
                    >
                        <ExternalLink className="h-4 w-4" />
                        Portal del SAT
                    </Button>
                </div>
            </div>

            {/* AVISO IMPORTANTE DE SEGURIDAD FISCAL */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-blue-900 flex items-start gap-3 text-sm shadow-sm">
                <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                <div>
                    <span className="font-semibold">Regla de oro fiscal para tu barbería:</span> Mercado Pago y los bancos reportan automáticamente al SAT el dinero que ingresa a tus cuentas. La estrategia recomendada de blindaje es declarar como base **el 100% de lo bancarizado** para evitar discrepancias y multas, mientras administras el efectivo con total discreción.
                </div>
            </div>

            {/* BLOQUE 1: RADIOGRAFÍA DE INGRESOS REALES */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                        1. Ingresos Registrados en Agenda ({monthLabel} {selectedYear})
                    </h2>
                    {salesLoading && <span className="text-xs text-muted-foreground animate-pulse">Cargando ventas...</span>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Tarjeta Bancarizado */}
                    <Card className="border-blue-200 bg-gradient-to-br from-blue-50/50 to-white shadow-sm">
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                                <CardTitle className="text-sm font-medium text-blue-900 flex items-center gap-1.5">
                                    <CreditCard className="h-4 w-4 text-blue-600" />
                                    Bancarizado (Visible al SAT)
                                </CardTitle>
                                <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-[10px]">
                                    Fiscalmente Rastreable
                                </Badge>
                            </div>
                            <CardDescription className="text-xs text-blue-700">
                                Mercado Pago + Tarjetas + Transferencias
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-extrabold text-[#202A49]">
                                ${incomeBreakdown.bancarizado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="mt-2 text-[11px] text-muted-foreground space-y-0.5 border-t pt-2">
                                <div className="flex justify-between">
                                    <span>Mercado Pago / En línea:</span>
                                    <span className="font-medium">${incomeBreakdown.online.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Tarjeta en terminal:</span>
                                    <span className="font-medium">${incomeBreakdown.tarjeta.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Transferencias SPEI:</span>
                                    <span className="font-medium">${incomeBreakdown.transferencia.toFixed(2)}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Tarjeta Efectivo */}
                    <Card className="border-slate-200 bg-white shadow-sm">
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                                <CardTitle className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                                    <Banknote className="h-4 w-4 text-emerald-600" />
                                    Efectivo en Caja
                                </CardTitle>
                                <Badge variant="outline" className="text-slate-600 text-[10px]">
                                    Cobros Físicos
                                </Badge>
                            </div>
                            <CardDescription className="text-xs text-muted-foreground">
                                Cobrado en mostrador en billetes y monedas
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-extrabold text-slate-700">
                                ${incomeBreakdown.efectivo.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <p className="mt-2 text-[11px] text-muted-foreground border-t pt-2">
                                Puedes decidir qué porcentaje reportar en la factura global al público en general.
                            </p>
                        </CardContent>
                    </Card>

                    {/* Tarjeta Total Negocio */}
                    <Card className="border-primary/20 bg-primary/5 shadow-sm">
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                                <CardTitle className="text-sm font-medium text-[#202A49] flex items-center gap-1.5">
                                    <DollarSign className="h-4 w-4 text-primary" />
                                    Total Real Recaudado
                                </CardTitle>
                                <Badge className="bg-primary text-white text-[10px]">
                                    100% Caja
                                </Badge>
                            </div>
                            <CardDescription className="text-xs text-muted-foreground">
                                Facturación bruta total del mes
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-extrabold text-[#202A49]">
                                ${incomeBreakdown.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <p className="mt-2 text-[11px] text-muted-foreground border-t pt-2">
                                Coincide 100% con tu sección de Finanzas Mensuales.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* BLOQUE 2: ESTRATEGIA DE DECLARACIÓN */}
            <Card className="shadow-sm border-slate-200">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base font-bold text-[#202A49] flex items-center gap-2">
                        <Calculator className="h-5 w-5 text-primary" />
                        2. Estrategia de Declaración para el SAT
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Selecciona el criterio para determinar el monto bruto de ventas que reportarás en tu declaración mensual
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {/* Opción A: Bancarizado */}
                        <div 
                            onClick={() => setFiscalData(prev => ({ ...prev, estrategia: 'bancarizado' }))}
                            className={cn(
                                "cursor-pointer rounded-xl border p-4 transition-all",
                                fiscalData.estrategia === 'bancarizado'
                                    ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                                    : "border-slate-200 hover:border-slate-300 bg-white"
                            )}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-primary">OPCIÓN A (RECOMENDADA)</span>
                                {fiscalData.estrategia === 'bancarizado' && <Check className="h-4 w-4 text-primary" />}
                            </div>
                            <div className="font-semibold text-sm text-[#202A49]">100% Bancarizado</div>
                            <p className="text-[11px] text-muted-foreground mt-1">
                                Declara exactamente lo cobrado con tarjeta, transferencia y Mercado Pago. Blindaje contra auditorías bancarias.
                            </p>
                            <div className="mt-3 text-sm font-extrabold text-[#202A49]">
                                ${incomeBreakdown.bancarizado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </div>

                        {/* Opción B: Bancarizado + Efectivo parcial */}
                        <div 
                            onClick={() => setFiscalData(prev => ({ ...prev, estrategia: 'bancarizado_mas_efectivo' }))}
                            className={cn(
                                "cursor-pointer rounded-xl border p-4 transition-all",
                                fiscalData.estrategia === 'bancarizado_mas_efectivo'
                                    ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                                    : "border-slate-200 hover:border-slate-300 bg-white"
                            )}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-slate-700">OPCIÓN B</span>
                                {fiscalData.estrategia === 'bancarizado_mas_efectivo' && <Check className="h-4 w-4 text-primary" />}
                            </div>
                            <div className="font-semibold text-sm text-[#202A49]">Bancarizado + % Efectivo</div>
                            <p className="text-[11px] text-muted-foreground mt-1">
                                Bancarizado más una fracción de efectivo ({fiscalData.porcentajeEfectivo || 20}%) para declarar actividad en caja.
                            </p>
                            <div className="mt-3 text-sm font-extrabold text-[#202A49]">
                                ${(incomeBreakdown.bancarizado + (incomeBreakdown.efectivo * ((fiscalData.porcentajeEfectivo || 20) / 100))).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </div>

                        {/* Opción C: Totalidad */}
                        <div 
                            onClick={() => setFiscalData(prev => ({ ...prev, estrategia: 'total' }))}
                            className={cn(
                                "cursor-pointer rounded-xl border p-4 transition-all",
                                fiscalData.estrategia === 'total'
                                    ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                                    : "border-slate-200 hover:border-slate-300 bg-white"
                            )}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-slate-700">OPCIÓN C</span>
                                {fiscalData.estrategia === 'total' && <Check className="h-4 w-4 text-primary" />}
                            </div>
                            <div className="font-semibold text-sm text-[#202A49]">100% de los Ingresos</div>
                            <p className="text-[11px] text-muted-foreground mt-1">
                                Declara el total absoluto generado en el mes (bancarizado + todo el efectivo de caja).
                            </p>
                            <div className="mt-3 text-sm font-extrabold text-[#202A49]">
                                ${incomeBreakdown.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </div>

                        {/* Opción D: Personalizado */}
                        <div 
                            onClick={() => setFiscalData(prev => ({ ...prev, estrategia: 'personalizado' }))}
                            className={cn(
                                "cursor-pointer rounded-xl border p-4 transition-all",
                                fiscalData.estrategia === 'personalizado'
                                    ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                                    : "border-slate-200 hover:border-slate-300 bg-white"
                            )}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-slate-700">OPCIÓN D</span>
                                {fiscalData.estrategia === 'personalizado' && <Check className="h-4 w-4 text-primary" />}
                            </div>
                            <div className="font-semibold text-sm text-[#202A49]">Monto Personalizado</div>
                            <p className="text-[11px] text-muted-foreground mt-1">
                                Tú defines libremente una cifra específica para simular o cumplir un objetivo puntual.
                            </p>
                            <div className="mt-3 text-sm font-extrabold text-[#202A49]">
                                ${(fiscalData.montoPersonalizado || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </div>
                    </div>

                    {/* Inputs condicionales para estrategia B o D */}
                    {fiscalData.estrategia === 'bancarizado_mas_efectivo' && (
                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border text-sm">
                            <Label className="text-xs font-medium">Porcentaje de efectivo a sumar:</Label>
                            <div className="w-24">
                                <Input 
                                    type="number" 
                                    min={0} 
                                    max={100}
                                    value={fiscalData.porcentajeEfectivo || 20}
                                    onChange={(e) => setFiscalData(prev => ({ ...prev, porcentajeEfectivo: Number(e.target.value) }))}
                                    className="h-8 text-xs"
                                />
                            </div>
                            <span className="text-xs text-muted-foreground">% de ${incomeBreakdown.efectivo.toFixed(2)} = ${(incomeBreakdown.efectivo * ((fiscalData.porcentajeEfectivo || 20) / 100)).toFixed(2)}</span>
                        </div>
                    )}

                    {fiscalData.estrategia === 'personalizado' && (
                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border text-sm">
                            <Label className="text-xs font-medium">Monto bruto que deseas declarar ($):</Label>
                            <div className="w-48">
                                <Input 
                                    type="number" 
                                    min={0} 
                                    value={fiscalData.montoPersonalizado || ''}
                                    onChange={(e) => setFiscalData(prev => ({ ...prev, montoPersonalizado: Number(e.target.value) }))}
                                    placeholder="Ej. 60000"
                                    className="h-8 text-xs"
                                />
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* BLOQUE 3: SIMULADOR DE IMPUESTOS (ISR + IVA) */}
            <div>
                <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground mb-3">
                    3. Cálculo Automático de Impuestos (RESICO)
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Tarjeta ISR RESICO */}
                    <Card className="border-slate-200 shadow-sm">
                        <CardHeader className="bg-slate-50/50 pb-3 border-b">
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-base font-bold text-[#202A49] flex items-center gap-2">
                                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                                    Impuesto Sobre la Renta (ISR)
                                </CardTitle>
                                <Badge variant="secondary" className="bg-emerald-50 text-emerald-800 border-emerald-200">
                                    Tasa RESICO: {tasaIsr}%
                                </Badge>
                            </div>
                            <CardDescription className="text-xs">
                                En RESICO el ISR se cobra sobre el ingreso neto cobrado sin IVA
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-3 text-sm">
                            <div className="flex justify-between py-1 border-b">
                                <span className="text-muted-foreground">Monto Bruto Declarado:</span>
                                <span className="font-semibold">${montoADeclararBruto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b">
                                <span className="text-muted-foreground flex items-center gap-1">
                                    Base Gravable para ISR (sin IVA):
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-pointer" />
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 text-xs p-3">
                                            Se obtiene dividiendo el monto total entre 1.16, ya que los precios de mostrador ya tienen el 16% de IVA incluido.
                                        </PopoverContent>
                                    </Popover>
                                </span>
                                <span className="font-semibold">${baseGravableSinIVA.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b">
                                <span className="text-muted-foreground">Tasa oficial RESICO mensual:</span>
                                <span className="font-semibold text-emerald-700">{tasaIsr}%</span>
                            </div>
                            <div className="flex justify-between py-2 bg-emerald-50/60 rounded px-2 text-emerald-950 font-bold">
                                <span>ISR a Pagar al SAT:</span>
                                <span>${isrCalculado.toFixed(2)} → Redondeado: ${isrRedondeado.toLocaleString('es-MX')}</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Tarjeta IVA */}
                    <Card className="border-slate-200 shadow-sm">
                        <CardHeader className="bg-slate-50/50 pb-3 border-b">
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-base font-bold text-[#202A49] flex items-center gap-2">
                                    <FileText className="h-5 w-5 text-blue-600" />
                                    Impuesto al Valor Agregado (IVA 16%)
                                </CardTitle>
                                <Badge variant="secondary" className="bg-blue-50 text-blue-800 border-blue-200">
                                    16% Servicios y Productos
                                </Badge>
                            </div>
                            <CardDescription className="text-xs">
                                IVA Cobrado menos el IVA de comisiones de Mercado Pago y compras
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-3 text-sm">
                            <div className="flex justify-between py-1 border-b">
                                <span className="text-muted-foreground">IVA Causado (16% sobre base):</span>
                                <span className="font-semibold">${ivaTrasladado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>

                            {/* Deducción de comisiones MP */}
                            <div className="flex items-center justify-between py-1 border-b">
                                <div className="space-y-0.5">
                                    <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                                        (-) IVA de Comisiones Mercado Pago:
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">Factura mensual descargable en MP</span>
                                </div>
                                <div className="w-28">
                                    <Input 
                                        type="number" 
                                        value={fiscalData.ivaComisionesAcreditable || ''}
                                        onChange={(e) => setFiscalData(prev => ({ ...prev, ivaComisionesAcreditable: Number(e.target.value) }))}
                                        placeholder="289.65"
                                        className="h-7 text-xs text-right"
                                    />
                                </div>
                            </div>

                            {/* Deducción de otros gastos facturados */}
                            <div className="flex items-center justify-between py-1 border-b">
                                <div className="space-y-0.5">
                                    <span className="text-xs font-medium text-emerald-700">
                                        (-) IVA de Compras e Insumos con CFDI:
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">Facturas a tu RFC con IVA desglosado</span>
                                </div>
                                <div className="w-28">
                                    <Input 
                                        type="number" 
                                        value={fiscalData.ivaOtrosGastosAcreditable || ''}
                                        onChange={(e) => setFiscalData(prev => ({ ...prev, ivaOtrosGastosAcreditable: Number(e.target.value) }))}
                                        placeholder="0.00"
                                        className="h-7 text-xs text-right"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-between py-2 bg-blue-50/60 rounded px-2 text-blue-950 font-bold">
                                <span>IVA a Pagar al SAT:</span>
                                <span>${ivaAPagar.toFixed(2)} → Redondeado: ${ivaRedondeado.toLocaleString('es-MX')}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Resumen Total a Pagar */}
                <div className="mt-4 p-4 rounded-xl bg-[#202A49] text-white flex flex-col sm:flex-row justify-between items-center gap-4 shadow-md">
                    <div>
                        <div className="text-xs uppercase tracking-wider text-slate-300 font-semibold">
                            Total a Pagar en Línea de Captura SAT ({monthLabel} {selectedYear})
                        </div>
                        <div className="text-xs text-slate-300 mt-0.5">
                            ISR: ${isrRedondeado.toLocaleString('es-MX')} + IVA: ${ivaRedondeado.toLocaleString('es-MX')}
                        </div>
                    </div>
                    <div className="text-3xl font-black tracking-tight text-white">
                        ${granTotalAPagarSAT.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>
            </div>

            {/* BLOQUE 4: LA GUÍA COPIA-PEGA DEL SAT */}
            <Card className="border-primary/30 shadow-md">
                <CardHeader className="bg-primary/5 pb-3 border-b">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-base font-bold text-[#202A49] flex items-center gap-2">
                                <Copy className="h-5 w-5 text-primary" />
                                4. Guía Rápida para Copiar y Pegar en el Portal del SAT
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Abre <span className="font-semibold text-primary">sat.gob.mx</span> en otra pestaña y simplemente copia estos datos exactos en cada casilla correspondiente
                            </CardDescription>
                        </div>
                        <Button 
                            variant="default" 
                            size="sm"
                            className="bg-primary hover:bg-primary/90 text-white gap-1.5 shrink-0"
                            onClick={() => window.open('https://www.sat.gob.mx/declaracion/74744/presenta-tus-declaraciones-provisionales-o-definitivas-de-personas-fisicas', '_blank')}
                        >
                            <ExternalLink className="h-4 w-4" />
                            Ir a Declaraciones SAT
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                    <div className="text-xs text-muted-foreground">
                        El portal del SAT solicita capturar valores enteros sin centavos. Los botones ya copian los números redondeados oficiales:
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Paso a paso ISR */}
                        <div className="space-y-3 p-4 rounded-lg border bg-slate-50/50">
                            <div className="font-bold text-xs uppercase tracking-wider text-emerald-800 flex items-center gap-1.5 pb-2 border-b">
                                <ShieldCheck className="h-4 w-4" /> Formulario ISR RESICO
                            </div>

                            <div className="space-y-2 text-xs">
                                <div className="flex items-center justify-between p-2 bg-white rounded border">
                                    <div>
                                        <div className="font-semibold text-[#202A49]">1. Total de ingresos cobrados:</div>
                                        <div className="text-[11px] text-muted-foreground">Casilla principal de ingresos</div>
                                    </div>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-8 gap-1.5 font-bold"
                                        onClick={() => copyToClipboard(String(Math.round(baseGravableSinIVA)), 'isr_ingresos')}
                                    >
                                        {copiedField === 'isr_ingresos' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                        ${Math.round(baseGravableSinIVA).toLocaleString('es-MX')}
                                    </Button>
                                </div>

                                <div className="flex items-center justify-between p-2 bg-white rounded border">
                                    <div>
                                        <div className="font-semibold text-[#202A49]">2. Ingresos exentos / no acumulables:</div>
                                        <div className="text-[11px] text-muted-foreground">Para barbería siempre es $0</div>
                                    </div>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-8 gap-1.5 font-bold"
                                        onClick={() => copyToClipboard('0', 'isr_exentos')}
                                    >
                                        {copiedField === 'isr_exentos' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                        $0
                                    </Button>
                                </div>

                                <div className="flex items-center justify-between p-2 bg-emerald-50 rounded border border-emerald-200 text-emerald-900">
                                    <div>
                                        <div className="font-semibold">3. ISR determinado (Automático por SAT):</div>
                                        <div className="text-[11px]">Debe arrojar exactamente este valor</div>
                                    </div>
                                    <span className="font-extrabold text-sm">${isrRedondeado.toLocaleString('es-MX')}</span>
                                </div>
                            </div>
                        </div>

                        {/* Paso a paso IVA */}
                        <div className="space-y-3 p-4 rounded-lg border bg-slate-50/50">
                            <div className="font-bold text-xs uppercase tracking-wider text-blue-800 flex items-center gap-1.5 pb-2 border-b">
                                <FileText className="h-4 w-4" /> Formulario IVA RESICO
                            </div>

                            <div className="space-y-2 text-xs">
                                <div className="flex items-center justify-between p-2 bg-white rounded border">
                                    <div>
                                        <div className="font-semibold text-[#202A49]">1. Actividades gravadas al 16%:</div>
                                        <div className="text-[11px] text-muted-foreground">Base neta gravable de cortes y productos</div>
                                    </div>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-8 gap-1.5 font-bold"
                                        onClick={() => copyToClipboard(String(Math.round(baseGravableSinIVA)), 'iva_actividades')}
                                    >
                                        {copiedField === 'iva_actividades' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                        ${Math.round(baseGravableSinIVA).toLocaleString('es-MX')}
                                    </Button>
                                </div>

                                <div className="flex items-center justify-between p-2 bg-white rounded border">
                                    <div>
                                        <div className="font-semibold text-[#202A49]">2. IVA acreditable del periodo:</div>
                                        <div className="text-[11px] text-muted-foreground">Comisiones Mercado Pago e insumos</div>
                                    </div>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-8 gap-1.5 font-bold"
                                        onClick={() => copyToClipboard(String(Math.round(ivaAcreditableTotal)), 'iva_acreditable')}
                                    >
                                        {copiedField === 'iva_acreditable' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                        ${Math.round(ivaAcreditableTotal).toLocaleString('es-MX')}
                                    </Button>
                                </div>

                                <div className="flex items-center justify-between p-2 bg-blue-50 rounded border border-blue-200 text-blue-900">
                                    <div>
                                        <div className="font-semibold">3. IVA a cargo (A pagar en banco):</div>
                                        <div className="text-[11px]">Debe arrojar exactamente este valor</div>
                                    </div>
                                    <span className="font-extrabold text-sm">${ivaRedondeado.toLocaleString('es-MX')}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* BLOQUE 5: REGISTRO DE ACUSE Y CONTROL DE PAGO */}
            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base font-bold text-[#202A49] flex items-center gap-2">
                        <Save className="h-5 w-5 text-primary" />
                        5. Registro y Control de Pago ({monthLabel} {selectedYear})
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Una vez pagada la línea de captura en tu banca móvil (BBVA, Banorte, Santander, etc.), archiva aquí tus datos para tener tu expediente fiscal completo
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Estado de la Declaración:</Label>
                            <Select 
                                value={fiscalData.estado} 
                                onValueChange={(val: 'pendiente' | 'presentada') => setFiscalData(prev => ({ ...prev, estado: val }))}
                            >
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="pendiente">🟡 Pendiente de presentar</SelectItem>
                                    <SelectItem value="presentada">🟢 Presentada y Pagada</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">Número de Operación / Folio SAT:</Label>
                            <Input 
                                value={fiscalData.folioOperacionSAT || ''}
                                onChange={(e) => setFiscalData(prev => ({ ...prev, folioOperacionSAT: e.target.value }))}
                                placeholder="Ej. 260812345678"
                                className="h-9 text-xs"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">Línea de Captura / Referencia:</Label>
                            <Input 
                                value={fiscalData.lineaCaptura || ''}
                                onChange={(e) => setFiscalData(prev => ({ ...prev, lineaCaptura: e.target.value }))}
                                placeholder="Ej. 0324 XXXXXXXXXX"
                                className="h-9 text-xs"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs">Notas / Comentarios Internos:</Label>
                        <Input 
                            value={fiscalData.notas || ''}
                            onChange={(e) => setFiscalData(prev => ({ ...prev, notas: e.target.value }))}
                            placeholder="Ej. Pagado vía BBVA el 14 de septiembre por transferencia electrónica."
                            className="h-9 text-xs"
                        />
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end border-t pt-4">
                    <Button 
                        onClick={handleSaveFiscalData} 
                        disabled={isSaving}
                        className="bg-[#202A49] hover:bg-[#314177] text-white gap-2"
                    >
                        <Save className="h-4 w-4" />
                        {isSaving ? "Guardando..." : "Guardar Registro Fiscal del Mes"}
                    </Button>
                </CardFooter>
            </Card>

            {/* BLOQUE 6: HISTORIAL ANUAL DE DECLARACIONES */}
            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base font-bold text-[#202A49] flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-primary" />
                        6. Historial Anual de Declaraciones ({selectedYear})
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Monitorea tu cumplimiento fiscal mes a mes a lo largo del año. Haz clic en cualquier mes para revisar o editar su declaración.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-lg border overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50 text-xs">
                                    <TableHead className="font-bold">Mes</TableHead>
                                    <TableHead className="font-bold">Estado SAT</TableHead>
                                    <TableHead className="font-bold text-right">Monto Declarado</TableHead>
                                    <TableHead className="font-bold text-right">ISR Pagado</TableHead>
                                    <TableHead className="font-bold text-right">IVA Pagado</TableHead>
                                    <TableHead className="font-bold text-right">Total Pagado</TableHead>
                                    <TableHead className="font-bold">Folio de Acuse</TableHead>
                                    <TableHead className="font-bold text-center">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="text-xs">
                                {monthLabels.map((mLabel, idx) => {
                                    const mKey = monthNames[idx];
                                    const rec = yearlyFiscalRecords[mKey];
                                    const isCurrent = idx === selectedMonthIdx;
                                    const isPresentada = rec?.estado === 'presentada';

                                    return (
                                        <TableRow 
                                            key={mKey}
                                            className={cn(
                                                "cursor-pointer hover:bg-slate-50 transition-colors",
                                                isCurrent && "bg-primary/5 font-semibold"
                                            )}
                                            onClick={() => setSelectedMonthIdx(idx)}
                                        >
                                            <TableCell className="font-medium text-[#202A49]">
                                                {mLabel} {selectedYear}
                                                {isCurrent && <span className="ml-2 text-[10px] text-primary font-bold">(Seleccionado)</span>}
                                            </TableCell>
                                            <TableCell>
                                                <Badge 
                                                    variant={isPresentada ? "default" : "outline"} 
                                                    className={cn(
                                                        "text-[10px] py-0.5",
                                                        isPresentada 
                                                            ? "bg-emerald-600 hover:bg-emerald-700 text-white" 
                                                            : "text-amber-700 border-amber-300 bg-amber-50"
                                                    )}
                                                >
                                                    {isPresentada ? "Pagada" : "Pendiente"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {rec?.montoDeclaradoFinal ? `$${Number(rec.montoDeclaradoFinal).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : "-"}
                                            </TableCell>
                                            <TableCell className="text-right text-emerald-800">
                                                {rec?.isrPagadoFinal !== undefined ? `$${Number(rec.isrPagadoFinal).toLocaleString('es-MX')}` : "-"}
                                            </TableCell>
                                            <TableCell className="text-right text-blue-800">
                                                {rec?.ivaPagadoFinal !== undefined ? `$${Number(rec.ivaPagadoFinal).toLocaleString('es-MX')}` : "-"}
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-[#202A49]">
                                                {rec?.totalPagadoFinal !== undefined ? `$${Number(rec.totalPagadoFinal).toLocaleString('es-MX')}` : "-"}
                                            </TableCell>
                                            <TableCell className="font-mono text-[11px] text-muted-foreground">
                                                {rec?.folioOperacionSAT || "-"}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="h-7 text-xs text-primary hover:text-primary hover:bg-primary/10"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedMonthIdx(idx);
                                                    }}
                                                >
                                                    Gestionar
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
