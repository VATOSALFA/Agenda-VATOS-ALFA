'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { getOfficialSatDeclarationsAction } from '@/lib/actions/fiscal-actions';
import type { DeclaracionFiscalData } from '@/lib/data/official-sat-declarations';
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
    ChevronDown,
    ChevronRight,
    Calculator,
    CheckCircle2,
    Clock,
    Lock,
    Sparkles,
    ArrowRight,
    AlertCircle,
    Download,
    FileCheck
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

export default function ControlFiscalResicoPage() {
    const { toast } = useToast();
    const currentDate = new Date();
    const [officialSatDeclarations, setOfficialSatDeclarations] = useState<Record<string, DeclaracionFiscalData>>({});

    useEffect(() => {
        let active = true;
        getOfficialSatDeclarationsAction()
            .then((data) => {
                if (active && data) setOfficialSatDeclarations(data);
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, []);

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
        estrategia: 'personalizado',
        montoPersonalizado: 4255,
        porcentajeEfectivo: 20,
        comisionMercadoPagoFacturada: 2100,
        ivaComisionesAcreditable: 0,
        ivaDevolucionesGastos: 0,
        otrosGastosConFactura: 0,
        ivaOtrosGastosAcreditable: 0,
        folioOperacionSAT: '',
        lineaCaptura: '',
        fechaPago: '',
        notas: '',
    });

    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [facturaStepsDone, setFacturaStepsDone] = useState<Record<string, boolean>>({});
    const [cfdiWizardStep, setCfdiWizardStep] = useState<number>(1);
    const [inputFolioFactura, setInputFolioFactura] = useState<string>('7d91d883-a75f-4847-a22a-ef7ca6bb2022');
    const [isSection3Minimized, setIsSection3Minimized] = useState<boolean>(true);
    const [activeTab, setActiveTab] = useState<'paso1' | 'paso2' | 'paso3' | 'historial'>('paso1');

    const toggleStep = (stepKey: string) => {
        setFacturaStepsDone(prev => ({ ...prev, [stepKey]: !prev[stepKey] }));
    };

    // Cargar datos de persistencia de Firestore para el mes seleccionado
    useEffect(() => {
        if (!db) return;
        const officialRecord = selectedYear === 2026 ? officialSatDeclarations[monthName] : undefined;
        const unsub = onSnapshot(doc(db, 'finanzas_mensuales', monthDocId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.declaracion_fiscal && (!officialRecord || data.declaracion_fiscal.folioOperacionSAT === officialRecord.folioOperacionSAT)) {
                    setFiscalData(prev => ({
                        ...prev,
                        ...data.declaracion_fiscal,
                        ivaDevolucionesGastos: data.declaracion_fiscal.ivaDevolucionesGastos ?? 0,
                        montoPersonalizado: data.declaracion_fiscal.montoPersonalizado ?? 3200,
                    }));
                } else if (officialRecord) {
                    setFiscalData(officialRecord);
                    setDoc(doc(db, 'finanzas_mensuales', monthDocId), {
                        declaracion_fiscal: {
                            ...officialRecord,
                            updatedAt: Timestamp.now(),
                        }
                    }, { merge: true }).catch(() => {});
                } else {
                    setFiscalData({
                        estado: 'pendiente',
                        estrategia: 'personalizado',
                        montoPersonalizado: 4255,
                        porcentajeEfectivo: 20,
                        comisionMercadoPagoFacturada: 2100,
                        ivaComisionesAcreditable: 0,
                        ivaDevolucionesGastos: 0,
                        otrosGastosConFactura: 0,
                        ivaOtrosGastosAcreditable: 0,
                        folioOperacionSAT: '',
                        lineaCaptura: '',
                        fechaPago: '',
                        notas: '',
                    });
                }
            } else if (officialRecord) {
                setFiscalData(officialRecord);
                setDoc(doc(db, 'finanzas_mensuales', monthDocId), {
                    declaracion_fiscal: {
                        ...officialRecord,
                        updatedAt: Timestamp.now(),
                    }
                }, { merge: true }).catch(() => {});
            } else {
                setFiscalData({
                    estado: 'pendiente',
                    estrategia: 'personalizado',
                    montoPersonalizado: 4255,
                    porcentajeEfectivo: 20,
                    comisionMercadoPagoFacturada: 2100,
                    ivaComisionesAcreditable: 0,
                    ivaDevolucionesGastos: 0,
                    otrosGastosConFactura: 0,
                    ivaOtrosGastosAcreditable: 0,
                    folioOperacionSAT: '',
                    lineaCaptura: '',
                    fechaPago: '',
                    notas: '',
                });
            }
        });
        return () => unsub();
    }, [monthDocId, monthName, selectedYear, officialSatDeclarations]);

    // Cargar historial anual de todas las declaraciones del año seleccionado
    const [yearlyFiscalRecords, setYearlyFiscalRecords] = useState<Record<string, any>>({});

    useEffect(() => {
        if (!db) return;
        const fetchYearlyData = async () => {
            try {
                const snap = await getDocs(collection(db, 'finanzas_mensuales'));
                const records: Record<string, any> = {};
                if (selectedYear === 2026) {
                    Object.entries(officialSatDeclarations).forEach(([mKey, officialRec]) => {
                        records[mKey] = officialRec;
                        setDoc(doc(db, 'finanzas_mensuales', `${mKey}_2026`), {
                            declaracion_fiscal: {
                                ...officialRec,
                                updatedAt: Timestamp.now(),
                            }
                        }, { merge: true }).catch(() => {});
                    });
                }
                snap.forEach(d => {
                    if (d.id.includes(String(selectedYear))) {
                        const [m] = d.id.split('_');
                        const data = d.data();
                        if (data.declaracion_fiscal) {
                            const officialRec = selectedYear === 2026 ? officialSatDeclarations[m] : undefined;
                            if (officialRec && data.declaracion_fiscal.folioOperacionSAT !== officialRec.folioOperacionSAT) {
                                records[m] = officialRec;
                            } else {
                                records[m] = data.declaracion_fiscal;
                            }
                        }
                    }
                });
                setYearlyFiscalRecords(records);
            } catch (err) {
                console.error("Error fetching yearly fiscal records:", err);
            }
        };
        fetchYearlyData();
    }, [selectedYear, fiscalData.estado, fiscalData.folioOperacionSAT, officialSatDeclarations]);

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
                    const propinaVal = Number(sale.propina) || 0;
                    const pMetodo = (sale as any).propina_metodo;
                    if (propinaVal > 0 && pMetodo && Math.abs(csum - (actualRevenue + propinaVal)) < 0.05) {
                        let adjE = ce;
                        let adjT = ct;
                        let adjTr = ctr;
                        let adjO = co;
                        if (pMetodo === 'tarjeta') adjT = Math.max(0, adjT - propinaVal);
                        else if (pMetodo === 'efectivo') adjE = Math.max(0, adjE - propinaVal);
                        else if (pMetodo === 'transferencia') adjTr = Math.max(0, adjTr - propinaVal);
                        else if (pMetodo === 'mercadopago' || pMetodo === 'en_linea') adjO = Math.max(0, adjO - propinaVal);

                        efectivo += adjE;
                        tarjetaTotal += adjT;
                        transferenciaTotal += adjTr;
                        onlineTotal += adjO;
                        bancarizado += (adjT + adjTr + adjO);
                    } else {
                        const factor = actualRevenue / csum;
                        efectivo += ce * factor;
                        tarjetaTotal += ct * factor;
                        transferenciaTotal += ctr * factor;
                        onlineTotal += co * factor;
                        bancarizado += (ct + ctr + co) * factor;
                    }
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

    // El portal del SAT redondea la base sin IVA al entero más cercano en los formularios de declaración
    const baseGravableRedondeadaSAT = useMemo(() => {
        return Math.round(baseGravableSinIVA);
    }, [baseGravableSinIVA]);

    // ISR RESICO
    const tasaIsr = useMemo(() => {
        return getResicoIsrRate(baseGravableRedondeadaSAT);
    }, [baseGravableRedondeadaSAT]);

    const isrCalculado = useMemo(() => {
        return baseGravableRedondeadaSAT * (tasaIsr / 100);
    }, [baseGravableRedondeadaSAT, tasaIsr]);

    const isrRedondeado = Math.round(isrCalculado);

    // IVA (16%)
    const ivaTrasladado = useMemo(() => {
        return baseGravableSinIVA * 0.16;
    }, [baseGravableSinIVA]);

    const ivaTrasladadoRedondeadoSAT = useMemo(() => {
        return Math.round(baseGravableRedondeadaSAT * 0.16);
    }, [baseGravableRedondeadaSAT]);

    // Deducción de IVA Acreditable (Facturas recibidas tipo Ingreso PUE) y ajuste por Notas de Egreso PUE
    const ivaAcreditableTotal = useMemo(() => {
        const ivaMP = fiscalData.ivaComisionesAcreditable || 0;
        const ivaOtros = fiscalData.ivaOtrosGastosAcreditable || 0;
        return ivaMP + ivaOtros;
    }, [fiscalData.ivaComisionesAcreditable, fiscalData.ivaOtrosGastosAcreditable]);

    const ivaAcreditableIngresoRedondeado = Math.round(ivaAcreditableTotal);
    const ivaDevolucionesEgresoRedondeado = Math.round(fiscalData.ivaDevolucionesGastos || 0);
    const ivaAcreditableNetoSAT = Math.max(0, ivaAcreditableIngresoRedondeado - ivaDevolucionesEgresoRedondeado);

    const ivaAPagar = Math.max(0, ivaTrasladado - ivaAcreditableTotal + (fiscalData.ivaDevolucionesGastos || 0));
    const ivaRedondeado = Math.max(0, ivaTrasladadoRedondeadoSAT - ivaAcreditableIngresoRedondeado + ivaDevolucionesEgresoRedondeado);

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

        const handleGuardarFacturaYAvanzar = async (customFolio?: string) => {
        const folioToSave = (customFolio || inputFolioFactura || '7d91d883-a75f-4847-a22a-ef7ca6bb2022').trim();
        setIsSaving(true);
        try {
            const dataToSave = {
                declaracion_fiscal: {
                    ...fiscalData,
                    estrategia: 'personalizado' as const,
                    montoPersonalizado: Number(montoADeclararBruto.toFixed(2)),
                    montoDeclaradoFinal: Number(montoADeclararBruto.toFixed(2)),
                    facturaGlobalSellada: true,
                    folioFacturaGlobal: folioToSave,
                    fechaFacturaGlobal: '2026-11-14 17:35:43',
                    montoFacturaGlobal: Number(montoADeclararBruto.toFixed(2)),
                    pasoActivo: 'paso2' as const,
                    updatedAt: Timestamp.now(),
                }
            };
            if (db) {
                await setDoc(doc(db, 'finanzas_mensuales', monthDocId), dataToSave, { merge: true });
            }
            if (typeof window !== 'undefined') {
                localStorage.setItem(`fiscal_tab_${monthDocId}`, 'paso2');
                localStorage.setItem(`fiscal_folio_${monthDocId}`, folioToSave);
            }
            setFiscalData(prev => ({
                ...prev,
                ...dataToSave.declaracion_fiscal,
            }));
            setInputFolioFactura(folioToSave);
            setActiveTab('paso2');
            toast({
                title: "Factura Global Guardada con Éxito",
                description: `Folio ${folioToSave.slice(0, 8)}... registrado. Al volver a entrar, la agenda te abrirá directo en el Paso 2.`,
            });
            window.scrollTo({ top: 350, behavior: 'smooth' });
        } catch (err) {
            console.error("Error saving factura data:", err);
            setActiveTab('paso2');
        } finally {
            setIsSaving(false);
        }
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
        <div className="container mx-auto p-3 sm:p-6 max-w-7xl space-y-4 sm:space-y-6">
            {/* Header del Módulo */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/40 pb-4">
                <div>
                    <div className="flex items-center gap-2.5">
                        <Landmark className="h-6 w-6 text-slate-300 shrink-0" />
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Control Fiscal RESICO</h1>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button type="button" className="text-muted-foreground hover:text-foreground transition-colors p-1" title="Ver información del módulo">
                                            <HelpCircle className="h-4 w-4 text-slate-400" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 p-3.5 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card text-foreground">
                                        <p className="text-xs text-muted-foreground">
                                            Pre-cálculo y autogestión de declaraciones mensuales ante el SAT para VATOS ALFA en el Régimen Simplificado de Confianza (RESICO).
                                        </p>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <p className="text-xs text-muted-foreground hidden sm:block">
                                Pre-cálculo y autogestión de declaraciones mensuales ante el SAT para VATOS ALFA
                            </p>
                        </div>
                    </div>
                </div>

                {/* Controles de Período y Estado */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center bg-card border border-border/60 rounded-xl p-0.5 shadow-sm">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={handlePrevMonth}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="px-2.5 text-xs sm:text-sm font-semibold text-foreground min-w-[120px] text-center">
                            {monthLabel} {selectedYear}
                        </span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={handleNextMonth}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    <Badge 
                        variant="outline"
                        className={cn(
                            "px-2.5 py-1 text-xs font-semibold gap-1.5",
                            fiscalData.estado === 'presentada' 
                                ? "border-blue-500/40 text-blue-400 bg-blue-500/10" 
                                : "border-border/60 text-muted-foreground bg-muted/20"
                        )}
                    >
                        {fiscalData.estado === 'presentada' ? (
                            <>
                                <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" /> Presentada y Pagada
                            </>
                        ) : (
                            <>
                                <Clock className="h-3.5 w-3.5 text-slate-400" /> Pendiente (Vence día 17 + 4 días hábiles)
                            </>
                        )}
                    </Badge>

                    <Popover>
                        <PopoverTrigger asChild>
                            <button type="button" className="h-8 px-2.5 text-xs border border-border/60 hover:border-blue-500 text-foreground hover:bg-muted/20 rounded-md flex items-center gap-1.5 transition-colors">
                                <HelpCircle className="h-3.5 w-3.5 text-blue-400" />
                                <span>Ver regla de oro</span>
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-3.5 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card text-foreground">
                            <p className="font-semibold text-blue-600 dark:text-blue-400 text-xs">Regla de Oro Fiscal RESICO:</p>
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                Mercado Pago y los bancos reportan automáticamente al SAT el dinero que ingresa a tus cuentas. La regla de oro recomendada es nunca declarar menos de lo bancarizado para evitar discrepancias ante el SAT.
                            </p>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            {/* BLOQUE 1: RADIOGRAFÍA DE INGRESOS REALES */}
            <div>
                <div className="flex items-center justify-between mb-2.5">
                    <h2 className="text-xs sm:text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                        1. Ingresos Registrados en Agenda ({monthLabel} {selectedYear})
                    </h2>
                    {salesLoading && <span className="text-xs text-muted-foreground animate-pulse">Cargando ventas...</span>}
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {/* Tarjeta Bancarizado */}
                    <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-2 sm:p-3.5 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[11px] sm:text-xs font-semibold text-foreground flex items-center gap-1 sm:gap-1.5 truncate">
                                    <CreditCard className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-400 shrink-0" />
                                    <span className="truncate">Bancarizado</span>
                                </span>
                                <div className="flex items-center gap-1">
                                    <Badge variant="outline" className="hidden sm:inline-flex border-blue-500/30 text-blue-400 bg-blue-500/10 text-[10px] h-5 py-0 px-1.5">
                                        Rastreable
                                    </Badge>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <button type="button" className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors p-0.5 shrink-0" title="Información y desglose">
                                                <HelpCircle className="h-3.5 w-3.5" />
                                            </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 p-3 border-2 border-blue-500 rounded-xl shadow-xl bg-card text-foreground text-xs space-y-2">
                                            <div>
                                                <p className="font-semibold text-blue-600 dark:text-blue-400">Mercado Pago + Tarjetas + SPEI</p>
                                                <p className="text-muted-foreground text-[11px]">Dinero que ingresó a cuentas bancarias y que el SAT ya conoce en automático.</p>
                                            </div>
                                            <div className="space-y-1 text-[11px] border-t border-border/40 pt-1.5">
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">En línea / MP:</span>
                                                    <span className="font-medium text-foreground">${incomeBreakdown.online.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Tarjeta en terminal:</span>
                                                    <span className="font-medium text-foreground">${incomeBreakdown.tarjeta.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Transferencias SPEI:</span>
                                                    <span className="font-medium text-foreground">${incomeBreakdown.transferencia.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                            <div className="text-xs sm:text-2xl font-extrabold text-foreground truncate">
                                ${incomeBreakdown.bancarizado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </div>
                        <div className="hidden sm:block mt-2.5 text-[11px] text-muted-foreground space-y-0.5 border-t border-border/40 pt-2">
                            <div className="flex justify-between">
                                <span>Mercado Pago / En línea:</span>
                                <span className="font-medium text-foreground">${incomeBreakdown.online.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Tarjeta en terminal:</span>
                                <span className="font-medium text-foreground">${incomeBreakdown.tarjeta.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Transferencias SPEI:</span>
                                <span className="font-medium text-foreground">${incomeBreakdown.transferencia.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Tarjeta Efectivo */}
                    <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-2 sm:p-3.5 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[11px] sm:text-xs font-semibold text-foreground flex items-center gap-1 sm:gap-1.5 truncate">
                                    <Banknote className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400 shrink-0" />
                                    <span className="truncate">Efectivo</span>
                                </span>
                                <div className="flex items-center gap-1">
                                    <Badge variant="outline" className="hidden sm:inline-flex border-border/60 text-muted-foreground text-[10px] h-5 py-0 px-1.5">
                                        Cobros Físicos
                                    </Badge>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <button type="button" className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors p-0.5 shrink-0" title="Información">
                                                <HelpCircle className="h-3.5 w-3.5" />
                                            </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 p-3 border-2 border-blue-500 rounded-xl shadow-xl bg-card text-foreground text-xs space-y-1">
                                            <p className="font-semibold text-blue-600 dark:text-blue-400">Cobrado en mostrador</p>
                                            <p className="text-muted-foreground text-[11px]">Billetes y monedas en mostrador. Puedes decidir qué porcentaje reportar en la factura global con total discreción.</p>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                            <div className="text-xs sm:text-2xl font-extrabold text-foreground truncate">
                                ${incomeBreakdown.efectivo.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </div>
                        <div className="hidden sm:flex mt-2.5 text-[11px] text-muted-foreground border-t border-border/40 pt-2 items-center justify-between">
                            <span>Manejo de efectivo:</span>
                            <span className="text-slate-400 font-medium">Discrecional</span>
                        </div>
                    </div>

                    {/* Tarjeta Total Negocio */}
                    <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-2 sm:p-3.5 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[11px] sm:text-xs font-semibold text-foreground flex items-center gap-1 sm:gap-1.5 truncate">
                                    <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-300 shrink-0" />
                                    <span className="truncate">Total</span>
                                </span>
                                <div className="flex items-center gap-1">
                                    <Badge variant="outline" className="hidden sm:inline-flex border-blue-500/40 text-blue-400 bg-blue-500/10 text-[10px] h-5 py-0 px-1.5">
                                        100% Caja
                                    </Badge>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <button type="button" className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors p-0.5 shrink-0" title="Información">
                                                <HelpCircle className="h-3.5 w-3.5" />
                                            </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 p-3 border-2 border-blue-500 rounded-xl shadow-xl bg-card text-foreground text-xs space-y-1">
                                            <p className="font-semibold text-blue-600 dark:text-blue-400">Facturación Bruta Total</p>
                                            <p className="text-muted-foreground text-[11px]">Coincide al 100% con los ingresos de tu sección de Finanzas Mensuales.</p>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                            <div className="text-xs sm:text-2xl font-extrabold text-foreground truncate">
                                ${incomeBreakdown.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </div>
                        <div className="hidden sm:flex mt-2.5 text-[11px] text-muted-foreground border-t border-border/40 pt-2 items-center justify-between">
                            <span>Finanzas del mes:</span>
                            <span className="text-blue-400 font-medium">Sincronizado</span>
                        </div>
                    </div>
                </div>
            </div>

                        {/* BLOQUE 2: ESTRATEGIA DE DECLARACIÓN (UNA SOLA FILA) */}
            <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm p-3 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                {/* 1. Desplegable con 4 opciones */}
                <div className="flex items-center gap-2 shrink-0">
                    <Calculator className="h-4 w-4 text-blue-400 shrink-0" />
                    <span className="text-xs font-bold text-foreground whitespace-nowrap">2. Estrategia:</span>
                    <div className="w-56 sm:w-64">
                        <Select 
                            value={fiscalData.estrategia} 
                            onValueChange={(val: any) => setFiscalData(prev => ({ 
                                ...prev, 
                                estrategia: val,
                                montoPersonalizado: prev.montoPersonalizado || 4255 
                            }))}
                        >
                            <SelectTrigger className="h-8 text-xs font-semibold bg-background border-border/60 text-foreground hover:border-blue-500 focus:border-blue-500">
                                <SelectValue placeholder="Seleccionar estrategia" />
                            </SelectTrigger>
                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card text-foreground">
                                <SelectItem value="personalizado" className="text-xs font-semibold cursor-pointer">
                                    Opción D: Factura Personalizada ($)
                                </SelectItem>
                                <SelectItem value="meta_impuesto" className="text-xs font-semibold cursor-pointer">
                                    Opción E: Fijar Impuesto a Pagar (Meta en $)
                                </SelectItem>
                                <SelectItem value="bancarizado" className="text-xs font-semibold cursor-pointer">
                                    Opción A: 100% Bancarizado (${incomeBreakdown.bancarizado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                </SelectItem>
                                <SelectItem value="bancarizado_mas_efectivo" className="text-xs font-semibold cursor-pointer">
                                    Opción B: Bancarizado + % Efec. (${(incomeBreakdown.bancarizado + (incomeBreakdown.efectivo * ((fiscalData.porcentajeEfectivo || 20) / 100))).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                </SelectItem>
                                <SelectItem value="total" className="text-xs font-semibold cursor-pointer">
                                    Opción C: 100% Ingresos (${incomeBreakdown.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <Popover>
                        <PopoverTrigger asChild>
                            <button type="button" className="text-slate-400 hover:text-blue-500 transition-colors p-1" title="Criterio de cálculo">
                                <HelpCircle className="h-3.5 w-3.5" />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-3 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card text-foreground text-xs space-y-1.5">
                            <p className="font-semibold text-blue-600 dark:text-blue-400">Estrategias de Declaración SAT</p>
                            <p className="text-muted-foreground text-[11px] leading-relaxed">
                                <strong>Opción D (Predeterminada):</strong> Captura manual directa para declarar exactamente lo timbrado en la Factura Global ($4,255.00 MXN).<br/>
                                <strong>Opción A:</strong> Total de cobros con tarjeta y transferencia bancaria ($54,803.30 MXN).<br/>
                                <strong>Opción B:</strong> Cobros bancarizados más un porcentaje de efectivo.<br/>
                                <strong>Opción C:</strong> El 100% absoluto de ingresos de caja ($107,953.80 MXN).
                            </p>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* 2. Captura / Selección de Monto en la misma fila */}
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Monto:</span>
                    {fiscalData.estrategia === 'personalizado' ? (
                        <div className="flex items-center gap-1.5">
                            <div className="w-28 relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">$</span>
                                <Input 
                                    type="number" 
                                    min={0} 
                                    value={fiscalData.montoPersonalizado !== undefined && fiscalData.montoPersonalizado !== 0 ? fiscalData.montoPersonalizado : ''}
                                    onChange={(e) => setFiscalData(prev => ({ ...prev, montoPersonalizado: e.target.value === '' ? 0 : Number(e.target.value) }))}
                                    placeholder="4255"
                                    className="h-8 pl-6 pr-2 text-xs font-bold bg-background border-border/60 text-foreground font-sans hover:border-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div className="hidden sm:flex items-center gap-1">
                                {[3200, 4255].map(preset => (
                                    <button
                                        key={preset}
                                        type="button"
                                        onClick={() => setFiscalData(prev => ({ ...prev, montoPersonalizado: preset }))}
                                        className={cn(
                                            "h-7 px-2 rounded-md border text-[11px] font-sans font-medium transition-colors",
                                            fiscalData.montoPersonalizado === preset 
                                                ? "border-blue-500 bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold" 
                                                : "border-border/60 text-foreground bg-muted/20 hover:bg-muted/40 hover:text-blue-500 dark:hover:text-blue-400"
                                        )}
                                    >
                                        ${preset.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : fiscalData.estrategia === 'meta_impuesto' ? (
                        <div className="flex items-center gap-1.5">
                            <div className="w-24 relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">$</span>
                                <Input 
                                    type="number" 
                                    min={0} 
                                    value={fiscalData.metaImpuestoSAT !== undefined && fiscalData.metaImpuestoSAT !== 0 ? fiscalData.metaImpuestoSAT : ''}
                                    onChange={(e) => setFiscalData(prev => ({ ...prev, metaImpuestoSAT: e.target.value === '' ? 0 : Number(e.target.value) }))}
                                    placeholder="350"
                                    className="h-8 pl-6 pr-2 text-xs font-bold bg-background border-border/60 text-foreground font-sans hover:border-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <span className="text-[11px] text-muted-foreground">meta</span>
                            <div className="hidden sm:flex items-center gap-1">
                                {[300, 334, 350, 400].map(preset => (
                                    <button
                                        key={preset}
                                        type="button"
                                        onClick={() => setFiscalData(prev => ({ ...prev, metaImpuestoSAT: preset }))}
                                        className={cn(
                                            "h-7 px-2 rounded-md border text-[11px] font-sans font-medium transition-colors",
                                            fiscalData.metaImpuestoSAT === preset 
                                                ? "border-blue-500 bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold" 
                                                : "border-border/60 text-foreground bg-muted/20 hover:bg-muted/40 hover:text-blue-500 dark:hover:text-blue-400"
                                        )}
                                    >
                                        ${preset.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </button>
                                ))}
                            </div>
                            <span className="text-xs font-bold text-foreground font-sans hidden md:inline ml-1">
                                → Facturar: ${montoADeclararBruto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    ) : fiscalData.estrategia === 'bancarizado_mas_efectivo' ? (
                        <div className="flex items-center gap-1.5">
                            <div className="w-16">
                                <Input 
                                    type="number" 
                                    min={0} 
                                    max={100} 
                                    value={fiscalData.porcentajeEfectivo || 20} 
                                    onChange={(e) => setFiscalData(prev => ({ ...prev, porcentajeEfectivo: Number(e.target.value) }))} 
                                    className="h-8 text-xs font-bold text-center bg-background border-border/60 text-foreground font-sans hover:border-blue-500" 
                                />
                            </div>
                            <span className="text-xs text-muted-foreground">% efec.</span>
                            <span className="text-xs font-bold text-foreground font-sans">
                                = ${montoADeclararBruto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    ) : (
                        <div className="px-2.5 py-1 rounded-md bg-muted/20 border border-border/40 font-bold text-xs text-foreground font-sans">
                            ${montoADeclararBruto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                        </div>
                    )}
                </div>

                {/* 3. Total a Pagar SAT en la misma fila */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-foreground shrink-0 justify-between lg:justify-end lg:ml-auto">
                    <span className="text-[11px] text-muted-foreground uppercase font-semibold whitespace-nowrap">
                        {fiscalData.estado === 'presentada' ? 'Total Pagado SAT:' : 'Total a Pagar SAT:'}
                    </span>
                    <span className="text-xs sm:text-sm font-extrabold text-blue-600 dark:text-blue-400 font-sans tracking-tight whitespace-nowrap">
                        ${(fiscalData.estado === 'presentada' && (fiscalData.totalPagadoFinal ?? 0) > 0 
                            ? (fiscalData.totalPagadoFinal ?? 0) 
                            : granTotalAPagarSAT).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                    </span>
                    <span className="text-[10px] text-muted-foreground hidden xl:inline whitespace-nowrap">
                        (ISR: ${(fiscalData.estado === 'presentada' && fiscalData.isrPagadoFinal !== undefined 
                            ? fiscalData.isrPagadoFinal 
                            : isrRedondeado).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + IVA: ${(fiscalData.estado === 'presentada' && fiscalData.ivaPagadoFinal !== undefined 
                            ? fiscalData.ivaPagadoFinal 
                            : ivaRedondeado).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                    </span>
                </div>
            </div>

            {/* BLOQUE 3: SIMULADOR DE IMPUESTOS (ISR + IVA) */}
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-blue-400" />
                        <h2 className="text-xs sm:text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                            3. Cálculo Automático de Impuestos (RESICO)
                        </h2>
                        {isSection3Minimized && (
                            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
                                <span>• Base: <strong className="text-foreground font-sans">${(fiscalData.estado === 'presentada' && fiscalData.montoDeclaradoFinal ? fiscalData.montoDeclaradoFinal : baseGravableSinIVA).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                                <span>• ISR: <strong className="text-blue-600 dark:text-blue-400 font-sans">${(fiscalData.estado === 'presentada' && fiscalData.isrPagadoFinal !== undefined ? fiscalData.isrPagadoFinal : isrRedondeado).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                                <span>• IVA: <strong className="text-blue-600 dark:text-blue-400 font-sans">${(fiscalData.estado === 'presentada' && fiscalData.ivaPagadoFinal !== undefined ? fiscalData.ivaPagadoFinal : ivaRedondeado).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                            </div>
                        )}
                    </div>

                    {/* Botón Minimizar / Maximizar: SOLO ICONO DE FLECHITA SIN TEXTO */}
                    <button
                        type="button"
                        onClick={() => setIsSection3Minimized(!isSection3Minimized)}
                        className="h-7 w-7 rounded-lg text-slate-400 hover:text-foreground hover:bg-muted/40 flex items-center justify-center transition-colors border border-border/40 shrink-0"
                        title={isSection3Minimized ? "Expandir desglose" : "Minimizar desglose"}
                        aria-label={isSection3Minimized ? "Expandir desglose" : "Minimizar desglose"}
                    >
                        <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", !isSection3Minimized && "rotate-180")} />
                    </button>
                </div>

                {!isSection3Minimized && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    {/* Tarjeta ISR RESICO */}
                    <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-3.5 shadow-sm space-y-3">
                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                            <div className="flex items-center gap-1.5">
                                <ShieldCheck className="h-4 w-4 text-blue-400 shrink-0" />
                                <span className="text-xs sm:text-sm font-bold text-foreground">Impuesto Sobre la Renta (ISR)</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Badge variant="outline" className="border-blue-500/30 text-blue-400 bg-blue-500/10 text-[10px] h-5 py-0 px-2 font-mono">
                                    Tasa: {tasaIsr}%
                                </Badge>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button type="button" className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors" title="Info ISR">
                                            <HelpCircle className="h-3.5 w-3.5" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-64 p-3 border-2 border-blue-500 rounded-xl shadow-xl bg-card text-foreground text-xs space-y-1">
                                        <p className="font-semibold text-blue-600 dark:text-blue-400">ISR Persona Física RESICO</p>
                                        <p className="text-muted-foreground text-[11px]">En RESICO el ISR se cobra sobre el ingreso neto cobrado sin IVA (Art. 113-E Ley del ISR).</p>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>

                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between py-1 border-b border-border/40">
                                <span className="text-muted-foreground">Monto Bruto Declarado:</span>
                                <span className="font-semibold text-foreground">${montoADeclararBruto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-border/40">
                                <span className="text-muted-foreground flex items-center gap-1">
                                    Base Gravable (sin IVA):
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <button type="button" className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
                                                <HelpCircle className="h-3 w-3" />
                                            </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 p-3 border-2 border-blue-500 rounded-xl shadow-xl bg-card text-foreground text-xs">
                                            Se divide el monto entre 1.16, ya que los cobros en agenda ya incluyen el 16% de IVA.
                                        </PopoverContent>
                                    </Popover>
                                </span>
                                <span className="font-semibold text-foreground">${baseGravableSinIVA.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-border/40">
                                <span className="text-muted-foreground">Tasa oficial RESICO:</span>
                                <span className="font-semibold text-blue-400">{tasaIsr}%</span>
                            </div>
                            <div className="flex justify-between items-center py-2 px-3 bg-muted/20 border border-border/60 rounded-lg text-foreground font-bold">
                                <span>ISR a Pagar al SAT:</span>
                                <span className="text-xs sm:text-sm font-extrabold text-blue-400">${isrCalculado.toFixed(2)} → ${isrRedondeado.toLocaleString('es-MX')}</span>
                            </div>
                        </div>
                    </div>

                    {/* Tarjeta IVA */}
                    <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-3.5 shadow-sm space-y-3">
                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                            <div className="flex items-center gap-1.5">
                                <FileText className="h-4 w-4 text-blue-400 shrink-0" />
                                <span className="text-xs sm:text-sm font-bold text-foreground">Impuesto al Valor Agregado (IVA)</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Badge variant="outline" className="border-blue-500/30 text-blue-400 bg-blue-500/10 text-[10px] h-5 py-0 px-2 font-mono">
                                    Tasa: 16%
                                </Badge>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button type="button" className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors" title="Info IVA">
                                            <HelpCircle className="h-3.5 w-3.5" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-64 p-3 border-2 border-blue-500 rounded-xl shadow-xl bg-card text-foreground text-xs space-y-1">
                                        <p className="font-semibold text-blue-600 dark:text-blue-400">IVA Trasladado y Acreditable</p>
                                        <p className="text-muted-foreground text-[11px]">IVA Cobrado en tus servicios menos el IVA que pagas en comisiones de terminal y compras con CFDI.</p>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>

                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between py-1 border-b border-border/40">
                                <span className="text-muted-foreground">IVA Causado (16% sobre base):</span>
                                <span className="font-semibold text-foreground">
                                    ${ivaTrasladado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} → ${ivaTrasladadoRedondeadoSAT.toLocaleString('es-MX')}
                                </span>
                            </div>

                            {/* Deducción de IVA acreditable por facturas recibidas Tipo Ingreso PUE */}
                            <div className="flex items-center justify-between py-1 border-b border-border/40 gap-2">
                                <div className="space-y-0.5 min-w-0">
                                    <span className="text-xs font-medium text-foreground flex items-center gap-1">
                                        (-) IVA Acreditable Gastos/MP (Tipo Ingreso):
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <button type="button" className="text-slate-400 hover:text-blue-400 transition-colors">
                                                    <HelpCircle className="h-3 w-3" />
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-72 p-3 border-2 border-blue-500 rounded-xl shadow-xl bg-card text-foreground text-xs space-y-1">
                                                <p className="font-semibold text-blue-400">Facturas recibidas Tipo Ingreso (PUE)</p>
                                                <p className="text-muted-foreground text-[11px]">
                                                    El SAT precarga este monto en la casilla <strong>"Determinación del IVA acreditable"</strong> (Hoja 8 de tu declaración). Ejemplo Septiembre: <strong>$689</strong>.
                                                </p>
                                            </PopoverContent>
                                        </Popover>
                                    </span>
                                    <span className="text-[10px] text-muted-foreground block truncate">Precargado en SAT (Facturas PUE recibidas)</span>
                                </div>
                                <div className="w-24 sm:w-28 shrink-0">
                                    <Input 
                                        type="number" 
                                        value={fiscalData.ivaComisionesAcreditable !== undefined && fiscalData.ivaComisionesAcreditable !== 0 ? fiscalData.ivaComisionesAcreditable : ''}
                                        onChange={(e) => setFiscalData(prev => ({ ...prev, ivaComisionesAcreditable: e.target.value === '' ? 0 : Number(e.target.value) }))}
                                        placeholder="689"
                                        className="h-7 text-xs text-right bg-background border-border/60"
                                    />
                                </div>
                            </div>

                            {/* IVA por devoluciones, descuentos y bonificaciones en gastos (Tipo Egreso PUE) */}
                            <div className="flex items-center justify-between py-1 border-b border-border/40 gap-2">
                                <div className="space-y-0.5 min-w-0">
                                    <span className="text-xs font-medium text-foreground flex items-center gap-1">
                                        (+) IVA Notas de Egreso / Bonif. (Tipo Egreso):
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <button type="button" className="text-slate-400 hover:text-blue-400 transition-colors">
                                                    <HelpCircle className="h-3 w-3" />
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-72 p-3 border-2 border-blue-500 rounded-xl shadow-xl bg-card text-foreground text-xs space-y-1">
                                                <p className="font-semibold text-blue-400">Facturas recibidas Tipo Egreso (PUE)</p>
                                                <p className="text-muted-foreground text-[11px]">
                                                    Mercado Pago suele emitir notas de crédito/bonificación sobre comisiones. El SAT las precarga en <strong>"IVA por devoluciones, descuentos y bonificaciones en gastos"</strong> (Hoja 9) y las suma para ajustar tu IVA acreditable neto. Ejemplo Septiembre: <strong>$442</strong>.
                                                </p>
                                            </PopoverContent>
                                        </Popover>
                                    </span>
                                    <span className="text-[10px] text-muted-foreground block truncate">Notas de crédito MP precargadas en SAT</span>
                                </div>
                                <div className="w-24 sm:w-28 shrink-0">
                                    <Input 
                                        type="number" 
                                        value={fiscalData.ivaDevolucionesGastos !== undefined && fiscalData.ivaDevolucionesGastos !== 0 ? fiscalData.ivaDevolucionesGastos : ''}
                                        onChange={(e) => setFiscalData(prev => ({ ...prev, ivaDevolucionesGastos: e.target.value === '' ? 0 : Number(e.target.value) }))}
                                        placeholder="0"
                                        className="h-7 text-xs text-right bg-background border-border/60"
                                    />
                                </div>
                            </div>

                            {/* Deducción adicional de otros gastos facturados */}
                            <div className="flex items-center justify-between py-1 border-b border-border/40 gap-2">
                                <div className="space-y-0.5 min-w-0">
                                    <span className="text-xs font-medium text-foreground">
                                        (-) IVA Otros Gastos adicionales (CFDI):
                                    </span>
                                    <span className="text-[10px] text-muted-foreground block truncate">Si tienes facturas extra no incluidas arriba (IVA neto: ${ivaAcreditableNetoSAT})</span>
                                </div>
                                <div className="w-24 sm:w-28 shrink-0">
                                    <Input 
                                        type="number" 
                                        value={fiscalData.ivaOtrosGastosAcreditable !== undefined && fiscalData.ivaOtrosGastosAcreditable !== 0 ? fiscalData.ivaOtrosGastosAcreditable : ''}
                                        onChange={(e) => setFiscalData(prev => ({ ...prev, ivaOtrosGastosAcreditable: e.target.value === '' ? 0 : Number(e.target.value) }))}
                                        placeholder="0.00"
                                        className="h-7 text-xs text-right bg-background border-border/60"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-between items-center py-2 px-3 bg-muted/20 border border-border/60 rounded-lg text-foreground font-bold">
                                <span>IVA a Pagar al SAT:</span>
                                <span className="text-xs sm:text-sm font-extrabold text-blue-400">
                                    ${ivaTrasladadoRedondeadoSAT} - ${ivaAcreditableIngresoRedondeado}{ivaDevolucionesEgresoRedondeado > 0 ? ` + $${ivaDevolucionesEgresoRedondeado}` : ''} = ${ivaRedondeado.toLocaleString('es-MX')}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                )}
            </div>

{/* TABS DE PROCESO Y GUÍA PASO A PASO */}
            <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="w-full space-y-3">
                <TabsList className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 h-auto bg-card/80 border border-border/60 rounded-xl">
                    <TabsTrigger 
                        value="paso1" 
                        className="text-xs py-2 px-2 data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400 data-[state=active]:border data-[state=active]:border-blue-500/30 flex items-center justify-center gap-1.5 transition-all"
                    >
                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-semibold truncate">1. Factura CFDI</span>
                    </TabsTrigger>
                    <TabsTrigger 
                        value="paso2" 
                        className="text-xs py-2 px-2 data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400 data-[state=active]:border data-[state=active]:border-blue-500/30 flex items-center justify-center gap-1.5 transition-all"
                    >
                        <FileCheck className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-semibold truncate">2. Declaración</span>
                    </TabsTrigger>
                    <TabsTrigger 
                        value="paso3" 
                        className="text-xs py-2 px-2 data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400 data-[state=active]:border data-[state=active]:border-blue-500/30 flex items-center justify-center gap-1.5 transition-all"
                    >
                        <Save className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-semibold truncate">3. Pago y Folio</span>
                    </TabsTrigger>
                    <TabsTrigger 
                        value="historial" 
                        className="text-xs py-2 px-2 data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400 data-[state=active]:border data-[state=active]:border-blue-500/30 flex items-center justify-center gap-1.5 transition-all"
                    >
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-semibold truncate">Historial {selectedYear}</span>
                    </TabsTrigger>
                </TabsList>

                {/* BLOQUE 4: PASO 1 - GENERAR FACTURA GLOBAL (CFDI 4.0) */}
                <TabsContent value="paso1" className="space-y-4 mt-0">
                    <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-3.5 sm:p-5 shadow-sm space-y-4">
                <div className="border-b border-border/40 pb-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="border-blue-500/40 text-blue-400 bg-blue-500/10 font-bold text-xs">
                                    PASO 1 (3 MINUTOS)
                                </Badge>
                                <span className="text-xs text-muted-foreground">Autogestión SAT RESICO</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <FileText className="h-4 w-4 text-blue-400 shrink-0" />
                                <h3 className="text-base sm:text-lg font-bold text-foreground">
                                    Generar Factura Global al Público en General (CFDI 4.0)
                                </h3>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button type="button" className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors" title="Información CFDI">
                                            <HelpCircle className="h-4 w-4 text-blue-400" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 p-3.5 border-2 border-blue-500 rounded-xl shadow-xl bg-card text-foreground text-xs space-y-1.5">
                                        <p className="font-semibold text-blue-600 dark:text-blue-400">¿Por qué timbrar esta factura?</p>
                                        <p className="text-muted-foreground text-[11px]">
                                            Al timbrarla gratis en el SAT con los <strong className="text-foreground">${montoADeclararBruto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong> seleccionados, tu declaración del Paso 2 se prellenará en automático y pagarás únicamente los impuestos estimados (~$300-$400).
                                        </p>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>

                        {/* Botones directos al portal de facturación del SAT */}
                        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                            <Button 
                                variant="alfa" 
                                size="sm"
                                className="h-9 px-4 text-xs gap-1.5"
                                onClick={() => window.open('https://portal.facturaelectronica.sat.gob.mx/', '_blank', 'noopener,noreferrer')}
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Abrir Facturación CFDI 4.0 SAT
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm"
                                className="h-9 text-xs border-border/60 text-foreground hover:bg-muted/20"
                                onClick={() => window.open('https://www.sat.gob.mx/portal/factura', '_blank', 'noopener,noreferrer')}
                            >
                                <ExternalLink className="h-3.5 w-3.5 mr-1 text-slate-400" />
                                Portal Alterno SAT
                            </Button>
                        </div>
                    </div>

                    {/* Acceso Rápido con RFC del Usuario */}
                    <div className="mt-3 pt-3 border-t border-border/40 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                            <span className="text-muted-foreground font-medium">Tu RFC SAT:</span>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 text-xs font-mono font-bold bg-muted/20 text-foreground border-border/60 hover:border-blue-500 gap-1.5"
                                onClick={() => copyToClipboard('PABA850207PA6', 'user_rfc')}
                            >
                                {copiedField === 'user_rfc' ? <Check className="h-3.5 w-3.5 text-blue-400" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
                                PABA850207PA6
                            </Button>
                            <span className="text-[11px] text-muted-foreground hidden sm:inline">(JOSE ALEJANDRO PACHECO BARCENAS)</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Info className="h-3.5 w-3.5 text-blue-400" />
                            Abre el portal en una pestaña nueva y completa estos 6 pasos:
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* ASISTENTE GUIADO PASO A PASO (WIZARD DINÁMICO) */}
<div className="rounded-xl border border-border/60 bg-card/80 p-3 shadow-sm space-y-2.5">
    <div className="flex items-center justify-between px-1 text-xs">
        <span className="font-bold text-foreground flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            Asistente Guiado Paso a Paso SAT (CFDI 4.0)
        </span>
        <Badge variant="outline" className="border-blue-500/40 text-blue-400 bg-blue-500/10 text-[11px] font-bold">
            Paso {cfdiWizardStep} de 6
        </Badge>
    </div>

    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
        {[
            { id: 1, label: '1.1 Sesión', key: 'step_1_1' },
            { id: 2, label: '1.2 Factura Global', key: 'step_1_2' },
            { id: 3, label: '1.3 Cliente', key: 'step_1_3' },
            { id: 4, label: '1.4 Concepto', key: 'step_1_4' },
            { id: 5, label: '1.5 Forma de Pago', key: 'step_1_5' },
            { id: 6, label: '1.6 Sellar y Guardar', key: 'step_1_6' },
        ].map((s) => {
            const isCurrent = cfdiWizardStep === s.id;
            const isDone = Boolean(facturaStepsDone[s.key]);
            return (
                <button
                    key={s.id}
                    type="button"
                    onClick={() => setCfdiWizardStep(s.id)}
                    className={cn(
                        "flex items-center justify-between p-2 rounded-lg text-xs font-semibold transition-all border text-left",
                        isCurrent
                            ? "border-2 border-blue-500 bg-blue-500/15 text-blue-500 dark:text-blue-400 shadow-sm font-bold"
                            : isDone
                                ? "border-blue-500/30 bg-blue-500/5 text-foreground hover:bg-muted/40"
                                : "border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    )}
                >
                    <span className="truncate">{s.label}</span>
                    {isDone ? (
                        <Check className="h-3.5 w-3.5 text-blue-400 shrink-0 ml-1" />
                    ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-border shrink-0 ml-1" />
                    )}
                </button>
            );
        })}
    </div>
</div>

{/* CONTENEDOR DEL PASO ACTIVO */}
<div className="space-y-4">
    {/* PASO 1.1 */}
    {cfdiWizardStep === 1 && (
        <div className="space-y-3 animate-in fade-in-50 duration-200">
            {/* PASO 1.1: Iniciar Sesión en el SAT */}
                        <div className={cn(
                            "rounded-xl border p-3.5 transition-all",
                            facturaStepsDone['step_1_1'] ? "border-blue-500/40 bg-blue-500/5" : "border-border/60 bg-muted/10"
                        )}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-2.5 mb-2.5">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono border-blue-500/40 text-blue-400">1.1</Badge>
                                    <span className="font-bold text-xs sm:text-sm text-foreground">
                                        Iniciar Sesión en el SAT e ir a "Generación de CFDI"
                                    </span>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={cn("h-7 text-xs gap-1.5", facturaStepsDone['step_1_1'] && "border-blue-500/40 text-blue-400 font-bold bg-blue-500/10")}
                                    onClick={() => toggleStep('step_1_1')}
                                >
                                    <Check className={cn("h-3.5 w-3.5", facturaStepsDone['step_1_1'] ? "text-blue-400" : "text-slate-400")} />
                                    {facturaStepsDone['step_1_1'] ? "Completado" : "Marcar completado"}
                                </Button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted-foreground">
                                <div className="space-y-1">
                                    <p>1. Entra a <a href="https://portal.facturaelectronica.sat.gob.mx/" target="_blank" rel="noreferrer" className="text-blue-400 font-semibold underline">portal.facturaelectronica.sat.gob.mx</a> con tu RFC y Contraseña CIEC o e.firma.</p>
                                    <p>2. En el menú superior da clic en <strong>"Generación de CFDI"</strong> (o "Emisión de Factura 4.0").</p>
                                </div>
                                <div className="p-2.5 bg-background rounded-lg border border-border/40 text-[11px] space-y-1">
                                    <div><strong>Régimen del Emisor:</strong> 626 - Régimen Simplificado de Confianza</div>
                                    <div><strong>Tipo de Comprobante:</strong> I - Ingreso</div>
                                    <div><strong>Moneda:</strong> MXN - Peso Mexicano</div>
                                </div>
                            </div>
                        </div>
            <div className="flex items-center justify-end pt-3 border-t border-border/40 mt-3">
                <Button
                    type="button"
                    variant="alfa"
                    size="sm"
                    onClick={() => {
                        setFacturaStepsDone(prev => ({ ...prev, step_1_1: true }));
                        setCfdiWizardStep(2);
                    }}
                    className="h-8 px-4 text-xs gap-1.5 font-bold"
                >
                    <span>Listo, Continuar al Paso 1.2</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    )}

    {/* PASO 1.2 */}
    {cfdiWizardStep === 2 && (
        <div className="space-y-3 animate-in fade-in-50 duration-200">
            {/* PASO 1.2: Activar casilla obligatoria "¿Es factura global?" */}
                        <div className={cn(
                            "rounded-xl border p-3.5 transition-all",
                            facturaStepsDone['step_1_2'] ? "border-blue-500/40 bg-blue-500/5" : "border-border/60 bg-muted/10"
                        )}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-2.5 mb-2.5">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono border-blue-500/40 text-blue-400">1.2</Badge>
                                    <span className="font-bold text-xs sm:text-sm text-foreground">
                                        Activar la casilla obligatoria "¿Es una factura global?"
                                    </span>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={cn("h-7 text-xs gap-1.5", facturaStepsDone['step_1_2'] && "border-blue-500/40 text-blue-400 font-bold bg-blue-500/10")}
                                    onClick={() => toggleStep('step_1_2')}
                                >
                                    <Check className={cn("h-3.5 w-3.5", facturaStepsDone['step_1_2'] ? "text-blue-400" : "text-slate-400")} />
                                    {facturaStepsDone['step_1_2'] ? "Completado" : "Marcar completado"}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2.5">
                                En el encabezado verás la pregunta <em>"¿Es una factura global?"</em>. Marca la casilla como <strong>SÍ</strong> y copia estos 3 valores:
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                                <div className="p-2.5 bg-background rounded-lg border border-border/40 flex items-center justify-between">
                                    <div>
                                        <div className="text-[11px] text-muted-foreground">Periodicidad:</div>
                                        <div className="font-bold text-foreground">05 (Mensual)</div>
                                    </div>
                                    <Button variant="outline" size="sm" className="h-7 text-xs font-mono font-bold" onClick={() => copyToClipboard('05', 'cfdi_per')}>
                                        {copiedField === 'cfdi_per' ? <Check className="h-3 w-3 text-blue-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
                                        05
                                    </Button>
                                </div>

                                <div className="p-2.5 bg-background rounded-lg border border-border/40 flex items-center justify-between">
                                    <div>
                                        <div className="text-[11px] text-muted-foreground">Mes de la venta:</div>
                                        <div className="font-bold text-foreground">{String(selectedMonthIdx + 1).padStart(2, '0')} ({monthLabel})</div>
                                    </div>
                                    <Button variant="outline" size="sm" className="h-7 text-xs font-mono font-bold" onClick={() => copyToClipboard(String(selectedMonthIdx + 1).padStart(2, '0'), 'cfdi_mes')}>
                                        {copiedField === 'cfdi_mes' ? <Check className="h-3 w-3 text-blue-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
                                        {String(selectedMonthIdx + 1).padStart(2, '0')}
                                    </Button>
                                </div>

                                <div className="p-2.5 bg-background rounded-lg border border-border/40 flex items-center justify-between">
                                    <div>
                                        <div className="text-[11px] text-muted-foreground">Año fiscal:</div>
                                        <div className="font-bold text-foreground">{selectedYear}</div>
                                    </div>
                                    <Button variant="outline" size="sm" className="h-7 text-xs font-mono font-bold" onClick={() => copyToClipboard(String(selectedYear), 'cfdi_ano')}>
                                        {copiedField === 'cfdi_ano' ? <Check className="h-3 w-3 text-blue-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
                                        {selectedYear}
                                    </Button>
                                </div>
                            </div>
                        </div>
            <div className="flex items-center justify-between pt-3 border-t border-border/40 mt-3">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCfdiWizardStep(1)}
                    className="h-8 text-xs gap-1.5 border-border/60 hover:border-blue-500 text-foreground hover:bg-muted/30"
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Anterior
                </Button>
                <Button
                    type="button"
                    variant="alfa"
                    size="sm"
                    onClick={() => {
                        setFacturaStepsDone(prev => ({ ...prev, step_1_2: true }));
                        setCfdiWizardStep(3);
                    }}
                    className="h-8 px-4 text-xs gap-1.5 font-bold"
                >
                    <span>Listo, Continuar al Paso 1.3</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    )}

    {/* PASO 1.3 */}
    {cfdiWizardStep === 3 && (
        <div className="space-y-3 animate-in fade-in-50 duration-200">
            {/* PASO 1.3: Datos del Cliente (Público en General) */}
                        <div className={cn(
                            "rounded-xl border p-3.5 transition-all",
                            facturaStepsDone['step_1_3'] ? "border-blue-500/40 bg-blue-500/5" : "border-border/60 bg-muted/10"
                        )}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-2.5 mb-2.5">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono border-blue-500/40 text-blue-400">1.3</Badge>
                                    <span className="font-bold text-xs sm:text-sm text-foreground">
                                        Capturar los Datos del Cliente (Público en General)
                                    </span>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={cn("h-7 text-xs gap-1.5", facturaStepsDone['step_1_3'] && "border-blue-500/40 text-blue-400 font-bold bg-blue-500/10")}
                                    onClick={() => toggleStep('step_1_3')}
                                >
                                    <Check className={cn("h-3.5 w-3.5", facturaStepsDone['step_1_3'] ? "text-blue-400" : "text-slate-400")} />
                                    {facturaStepsDone['step_1_3'] ? "Completado" : "Marcar completado"}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2.5">
                                En la sección <strong>"Cliente / Receptor"</strong>, copia y pega estos datos oficiales del SAT:
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                                <div className="p-2.5 bg-background rounded-lg border border-border/40 space-y-1">
                                    <div className="text-[11px] text-muted-foreground">RFC Receptor:</div>
                                    <Button variant="outline" size="sm" className="w-full justify-between h-8 text-xs font-mono font-bold" onClick={() => copyToClipboard('XAXX010101000', 'cfdi_rfc')}>
                                        XAXX010101000
                                        {copiedField === 'cfdi_rfc' ? <Check className="h-3.5 w-3.5 text-blue-400" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
                                    </Button>
                                </div>

                                <div className="p-2.5 bg-background rounded-lg border border-border/40 space-y-1">
                                    <div className="text-[11px] text-muted-foreground">Nombre / Razón Social:</div>
                                    <Button variant="outline" size="sm" className="w-full justify-between h-8 text-xs font-bold" onClick={() => copyToClipboard('PUBLICO EN GENERAL', 'cfdi_nombre')}>
                                        PUBLICO EN GENERAL
                                        {copiedField === 'cfdi_nombre' ? <Check className="h-3.5 w-3.5 text-blue-400" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
                                    </Button>
                                </div>

                                <div className="p-2.5 bg-background rounded-lg border border-border/40 space-y-1">
                                    <div className="text-[11px] text-muted-foreground">Régimen Fiscal Receptor:</div>
                                    <Button variant="outline" size="sm" className="w-full justify-between h-8 text-xs font-mono font-bold" onClick={() => copyToClipboard('616', 'cfdi_regimen')}>
                                        616 (Sin obligaciones)
                                        {copiedField === 'cfdi_regimen' ? <Check className="h-3.5 w-3.5 text-blue-400" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
                                    </Button>
                                </div>

                                <div className="p-2.5 bg-background rounded-lg border border-border/40 space-y-1">
                                    <div className="text-[11px] text-muted-foreground">Uso de CFDI:</div>
                                    <Button variant="outline" size="sm" className="w-full justify-between h-8 text-xs font-mono font-bold" onClick={() => copyToClipboard('S01', 'cfdi_uso')}>
                                        S01 (Sin efectos)
                                        {copiedField === 'cfdi_uso' ? <Check className="h-3.5 w-3.5 text-blue-400" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
                                    </Button>
                                </div>
                            </div>
                            <div className="mt-2 text-[11px] text-muted-foreground">
                                💡 <strong>Código Postal del Cliente:</strong> Escribe tu mismo código postal fiscal registrado en el SAT.
                            </div>
                        </div>
            <div className="flex items-center justify-between pt-3 border-t border-border/40 mt-3">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCfdiWizardStep(2)}
                    className="h-8 text-xs gap-1.5 border-border/60 hover:border-blue-500 text-foreground hover:bg-muted/30"
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Anterior
                </Button>
                <Button
                    type="button"
                    variant="alfa"
                    size="sm"
                    onClick={() => {
                        setFacturaStepsDone(prev => ({ ...prev, step_1_3: true }));
                        setCfdiWizardStep(4);
                    }}
                    className="h-8 px-4 text-xs gap-1.5 font-bold"
                >
                    <span>Listo, Continuar al Paso 1.4</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    )}

    {/* PASO 1.4 */}
    {cfdiWizardStep === 4 && (
        <div className="space-y-3 animate-in fade-in-50 duration-200">
            {/* PASO 1.4: Agregar el Concepto e Impuestos */}
                        <div className={cn(
                            "rounded-xl border p-3.5 transition-all",
                            facturaStepsDone['step_1_4'] ? "border-blue-500/40 bg-blue-500/5" : "border-border/60 bg-muted/10"
                        )}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-2.5 mb-2.5">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono border-blue-500/40 text-blue-400">1.4</Badge>
                                    <span className="font-bold text-xs sm:text-sm text-foreground">
                                        Agregar el Concepto e Impuesto (Desglose exacto)
                                    </span>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={cn("h-7 text-xs gap-1.5", facturaStepsDone['step_1_4'] && "border-blue-500/40 text-blue-400 font-bold bg-blue-500/10")}
                                    onClick={() => toggleStep('step_1_4')}
                                >
                                    <Check className={cn("h-3.5 w-3.5", facturaStepsDone['step_1_4'] ? "text-blue-400" : "text-slate-400")} />
                                    {facturaStepsDone['step_1_4'] ? "Completado" : "Marcar completado"}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2.5">
                                Haz clic en <strong>"+ Agregar"</strong> concepto en el SAT y completa estos campos:
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs mb-3">
                                <div className="p-2.5 bg-background rounded-lg border border-border/40 space-y-1">
                                    <div className="text-[11px] text-muted-foreground">Clave Producto / Servicio:</div>
                                    <Button variant="outline" size="sm" className="w-full justify-between h-8 text-xs font-mono font-bold" onClick={() => copyToClipboard('01010101', 'cfdi_clave')}>
                                        01010101 (No existe en cat.)
                                        {copiedField === 'cfdi_clave' ? <Check className="h-3 w-3 text-blue-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
                                    </Button>
                                </div>

                                <div className="p-2.5 bg-background rounded-lg border border-border/40 space-y-1">
                                    <div className="text-[11px] text-muted-foreground">Clave de Unidad:</div>
                                    <Button variant="outline" size="sm" className="w-full justify-between h-8 text-xs font-mono font-bold" onClick={() => copyToClipboard('ACT', 'cfdi_act')}>
                                        ACT (Actividad)
                                        {copiedField === 'cfdi_act' ? <Check className="h-3 w-3 text-blue-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
                                    </Button>
                                </div>

                                <div className="p-2.5 bg-background rounded-lg border border-border/40 space-y-1">
                                    <div className="text-[11px] text-muted-foreground">Cantidad:</div>
                                    <Button variant="outline" size="sm" className="w-full justify-between h-8 text-xs font-mono font-bold" onClick={() => copyToClipboard('1', 'cfdi_cant')}>
                                        1
                                        {copiedField === 'cfdi_cant' ? <Check className="h-3 w-3 text-blue-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
                                    </Button>
                                </div>

                                <div className="p-2.5 bg-background rounded-lg border border-border/40 space-y-1 md:col-span-2">
                                    <div className="text-[11px] text-muted-foreground">Descripción:</div>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="w-full justify-between h-8 text-xs font-medium" 
                                        onClick={() => copyToClipboard(`Venta global al publico en general del mes de ${monthName} ${selectedYear}`, 'cfdi_desc')}
                                    >
                                        <span className="truncate">Venta global al publico en general del mes de {monthName} {selectedYear}</span>
                                        {copiedField === 'cfdi_desc' ? <Check className="h-3 w-3 text-blue-400 shrink-0 ml-1" /> : <Copy className="h-3 w-3 text-slate-400 shrink-0 ml-1" />}
                                    </Button>
                                </div>

                                <div className="p-2.5 bg-background rounded-lg border border-border/40 space-y-1">
                                    <div className="text-[11px] text-muted-foreground font-semibold">Valor Unitario (Base sin IVA):</div>
                                    <Button variant="outline" size="sm" className="w-full justify-between h-8 text-xs font-mono font-bold border-blue-500/40 text-blue-400 bg-blue-500/10" onClick={() => copyToClipboard(baseGravableSinIVA.toFixed(2), 'cfdi_base')}>
                                        ${baseGravableSinIVA.toFixed(2)}
                                        {copiedField === 'cfdi_base' ? <Check className="h-3 w-3 text-blue-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
                                    </Button>
                                </div>
                            </div>

                            {/* Pestaña de Impuestos del SAT */}
                            <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/30 text-xs text-foreground space-y-2">
                                <div className="font-bold flex items-center gap-1.5 text-blue-400">
                                    <ShieldCheck className="h-4 w-4 text-blue-400" />
                                    En la sección "Impuestos" dentro del concepto:
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
                                    <div><strong>Objeto de Impuesto:</strong> 02 (Sí objeto)</div>
                                    <div><strong>Impuesto:</strong> 002 (IVA)</div>
                                    <div><strong>Tipo Factor:</strong> Tasa</div>
                                    <div className="flex items-center justify-between">
                                        <span><strong>Tasa:</strong> 0.160000</span>
                                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5" onClick={() => copyToClipboard('0.160000', 'cfdi_tasa')}>
                                            {copiedField === 'cfdi_tasa' ? <Check className="h-3 w-3 text-blue-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
                                        </Button>
                                    </div>
                                </div>
                                <div className="pt-2 border-t border-blue-500/20 flex items-center justify-between font-bold text-xs">
                                    <span>🎯 Total de la Factura en el SAT:</span>
                                    <span className="text-sm text-blue-400">${montoADeclararBruto.toFixed(2)} MXN</span>
                                </div>
                            </div>
                        </div>
            <div className="flex items-center justify-between pt-3 border-t border-border/40 mt-3">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCfdiWizardStep(3)}
                    className="h-8 text-xs gap-1.5 border-border/60 hover:border-blue-500 text-foreground hover:bg-muted/30"
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Anterior
                </Button>
                <Button
                    type="button"
                    variant="alfa"
                    size="sm"
                    onClick={() => {
                        setFacturaStepsDone(prev => ({ ...prev, step_1_4: true }));
                        setCfdiWizardStep(5);
                    }}
                    className="h-8 px-4 text-xs gap-1.5 font-bold"
                >
                    <span>Listo, Continuar al Paso 1.5</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    )}

    {/* PASO 1.5 */}
    {cfdiWizardStep === 5 && (
        <div className="space-y-3 animate-in fade-in-50 duration-200">
            {/* PASO 1.5: Forma y Método de Pago */}
                        <div className={cn(
                            "rounded-xl border p-3.5 transition-all",
                            facturaStepsDone['step_1_5'] ? "border-blue-500/40 bg-blue-500/5" : "border-border/60 bg-muted/10"
                        )}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-2.5 mb-2.5">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono border-blue-500/40 text-blue-400">1.5</Badge>
                                    <span className="font-bold text-xs sm:text-sm text-foreground">
                                        Forma y Método de Pago
                                    </span>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={cn("h-7 text-xs gap-1.5", facturaStepsDone['step_1_5'] && "border-blue-500/40 text-blue-400 font-bold bg-blue-500/10")}
                                    onClick={() => toggleStep('step_1_5')}
                                >
                                    <Check className={cn("h-3.5 w-3.5", facturaStepsDone['step_1_5'] ? "text-blue-400" : "text-slate-400")} />
                                    {facturaStepsDone['step_1_5'] ? "Completado" : "Marcar completado"}
                                </Button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                                <div className="p-2.5 bg-background rounded-lg border border-border/40 flex items-center justify-between">
                                    <div>
                                        <div className="text-[11px] text-muted-foreground">Forma de Pago:</div>
                                        <div className="font-bold text-foreground">01 (Efectivo)</div>
                                    </div>
                                    <Button variant="outline" size="sm" className="h-7 text-xs font-mono font-bold" onClick={() => copyToClipboard('01', 'cfdi_fp')}>
                                        {copiedField === 'cfdi_fp' ? <Check className="h-3 w-3 text-blue-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
                                        01
                                    </Button>
                                </div>

                                <div className="p-2.5 bg-background rounded-lg border border-border/40 flex items-center justify-between">
                                    <div>
                                        <div className="text-[11px] text-muted-foreground">Método de Pago:</div>
                                        <div className="font-bold text-foreground">PUE (Una exhibición)</div>
                                    </div>
                                    <Button variant="outline" size="sm" className="h-7 text-xs font-mono font-bold" onClick={() => copyToClipboard('PUE', 'cfdi_mp')}>
                                        {copiedField === 'cfdi_mp' ? <Check className="h-3 w-3 text-blue-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
                                        PUE
                                    </Button>
                                </div>

                                <div className="p-2.5 bg-background rounded-lg border border-border/40 flex items-center justify-between">
                                    <div>
                                        <div className="text-[11px] text-muted-foreground">Moneda:</div>
                                        <div className="font-bold text-foreground">MXN (Peso Mex.)</div>
                                    </div>
                                    <Button variant="outline" size="sm" className="h-7 text-xs font-mono font-bold" onClick={() => copyToClipboard('MXN', 'cfdi_mon')}>
                                        {copiedField === 'cfdi_mon' ? <Check className="h-3 w-3 text-blue-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
                                        MXN
                                    </Button>
                                </div>
                            </div>
                        </div>
            <div className="flex items-center justify-between pt-3 border-t border-border/40 mt-3">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCfdiWizardStep(4)}
                    className="h-8 text-xs gap-1.5 border-border/60 hover:border-blue-500 text-foreground hover:bg-muted/30"
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Anterior
                </Button>
                <Button
                    type="button"
                    variant="alfa"
                    size="sm"
                    onClick={() => {
                        setFacturaStepsDone(prev => ({ ...prev, step_1_5: true }));
                        setCfdiWizardStep(6);
                    }}
                    className="h-8 px-4 text-xs gap-1.5 font-bold"
                >
                    <span>Listo, Continuar al Paso 1.6</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    )}

    {/* PASO 1.6 */}
    {cfdiWizardStep === 6 && (
        <div className="space-y-4 animate-in fade-in-50 duration-200">
            {/* PASO 1.6: Sellar y Descargar */}
                        <div className={cn(
                            "rounded-xl border p-3.5 transition-all",
                            facturaStepsDone['step_1_6'] ? "border-blue-500/40 bg-blue-500/5" : "border-border/60 bg-muted/10"
                        )}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-2.5 mb-2.5">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono border-blue-500/40 text-blue-400">1.6</Badge>
                                    <span className="font-bold text-xs sm:text-sm text-foreground">
                                        Sellar Factura y Descargar Archivos (XML y PDF)
                                    </span>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={cn("h-7 text-xs gap-1.5", facturaStepsDone['step_1_6'] && "border-blue-500/40 text-blue-400 font-bold bg-blue-500/10")}
                                    onClick={() => toggleStep('step_1_6')}
                                >
                                    <Check className={cn("h-3.5 w-3.5", facturaStepsDone['step_1_6'] ? "text-blue-400" : "text-slate-400")} />
                                    {facturaStepsDone['step_1_6'] ? "Completado" : "Marcar completado"}
                                </Button>
                            </div>
                            <div className="space-y-1.5 text-xs text-muted-foreground">
                                <p>1. Da clic en el botón <strong>"Sellar Factura"</strong> en la esquina inferior derecha del SAT.</p>
                                <p>2. Ingresa tu <strong>e.firma</strong> o tu Contraseña CIEC según lo solicite el portal.</p>
                                <p>3. Da clic en <strong>"Confirmar y Firmar"</strong>.</p>
                                <p>4. 📥 <strong>Descarga tu PDF y XML</strong> para tu expediente contable.</p>
                            </div>
                        </div>
            {/* Banner de Siguiente Paso y Guardar Folio */}
            <div className="p-3.5 sm:p-5 rounded-xl border-2 border-blue-500 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                <div className="space-y-1">
                    <div className="text-sm font-bold flex items-center gap-1.5 text-white">
                        <Sparkles className="h-4 w-4 text-blue-400" />
                        ¿Ya sellaste y descargaste tu Factura Global en el SAT?
                    </div>
                    <div className="text-xs text-slate-300">
                        Guarda el <strong>Folio Fiscal UUID</strong> emitido por el SAT para que tu progreso quede respaldado. Al volver a entrar a la agenda, te llevará en automático al <strong>Paso 2</strong>.
                    </div>
                    <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
                        <span>Folio UUID registrado:</span>
                        <code className="text-blue-400 font-mono bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800/60">
                            {fiscalData.folioFacturaGlobal || inputFolioFactura || '7d91d883-a75f-4847-a22a-ef7ca6bb2022'}
                        </code>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full md:w-auto">
                    <Button
                        variant="alfa"
                        size="sm"
                        className="gap-1.5 text-xs px-4 h-9 font-bold"
                        onClick={() => handleGuardarFacturaYAvanzar(inputFolioFactura)}
                    >
                        <Check className="h-3.5 w-3.5" />
                        Guardar Progreso e Ir al Paso 2
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-border/40 mt-3">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCfdiWizardStep(5)}
                    className="h-8 text-xs gap-1.5 border-border/60 hover:border-blue-500 text-foreground hover:bg-muted/30"
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Anterior
                </Button>
                <Button
                    type="button"
                    variant="alfa"
                    size="sm"
                    onClick={() => handleGuardarFacturaYAvanzar(inputFolioFactura)}
                    className="h-9 px-5 text-xs gap-1.5 font-bold"
                >
                    <Check className="h-4 w-4" />
                    Guardar Progreso e Ir al Paso 2
                    <ArrowRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )}
</div>

                    {/* Blindaje Antierrores */}
                    <div className="rounded-xl border border-border/60 bg-muted/10 p-3.5 space-y-2 text-xs">
                        <div className="font-bold text-foreground flex items-center gap-1.5 text-xs">
                            <ShieldCheck className="h-4 w-4 text-blue-400" />
                            Blindaje Antierrores: Preguntas Frecuentes
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-muted-foreground">
                            <div className="bg-background p-2.5 rounded-lg border border-border/40">
                                <strong className="text-foreground">¿Qué pasa si me equivoco en una cantidad?</strong>
                                <p className="mt-1 text-[11px]">En el mismo portal del SAT ve a "Consultar facturas emitidas", selecciona la factura, da clic en <em>Cancelar</em> (motivo 02) y genera una nueva de inmediato.</p>
                            </div>
                            <div className="bg-background p-2.5 rounded-lg border border-border/40">
                                <strong className="text-foreground">¿Por qué el valor unitario es ${baseGravableSinIVA.toFixed(2)} y el total ${montoADeclararBruto.toFixed(2)}?</strong>
                                <p className="mt-1 text-[11px]">El SAT exige capturar el precio sin IVA. El sistema del portal le suma automáticamente el 16% resultando en los ${montoADeclararBruto.toFixed(2)} exactos.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            </TabsContent>

            {/* BLOQUE 5: PASO 2 - PRESENTAR DECLARACIÓN MENSUAL */}
            <TabsContent value="paso2" className="space-y-4 mt-0">
                <div id="bloque-paso-2" className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-3.5 sm:p-5 shadow-sm space-y-4">
                <div className="border-b border-border/40 pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="border-blue-500/40 text-blue-400 bg-blue-500/10 font-bold text-xs">
                                    PASO 2 (2 MINUTOS)
                                </Badge>
                                <span className="text-xs text-muted-foreground">Portal Declaraciones SAT</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <FileCheck className="h-4 w-4 text-blue-400 shrink-0" />
                                <h3 className="text-base sm:text-lg font-bold text-foreground">
                                    Presentar Declaración Mensual RESICO en el SAT
                                </h3>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button type="button" className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors" title="Información Declaración">
                                            <HelpCircle className="h-4 w-4 text-blue-400" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 p-3.5 border-2 border-blue-500 rounded-xl shadow-xl bg-card text-foreground text-xs space-y-1.5">
                                        <p className="font-semibold text-blue-600 dark:text-blue-400">Prellenado automático</p>
                                        <p className="text-muted-foreground text-[11px]">
                                            Al entrar verás que el SAT ya precargó en automático tu factura timbrada en el Paso 1. Solo valida las casillas y genera tu línea de captura bancaria.
                                        </p>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                        <Button 
                            variant="alfa" 
                            size="sm"
                            className="h-9 px-4 text-xs gap-1.5 shrink-0"
                            onClick={() => window.open('https://www.sat.gob.mx/portal/declaraciones', '_blank', 'noopener,noreferrer')}
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Abrir Declaraciones SAT
                        </Button>
                        <Button 
                            variant="outline" 
                            size="sm"
                            className="h-9 text-xs border-border/60 text-foreground hover:bg-muted/20"
                            onClick={() => window.open('https://www.sat.gob.mx', '_blank', 'noopener,noreferrer')}
                        >
                            <ExternalLink className="h-3.5 w-3.5 mr-1 text-slate-400" />
                            Portal General SAT
                        </Button>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="p-3 bg-muted/20 rounded-xl border border-border/60 text-xs space-y-1">
                        <div className="font-semibold text-foreground flex items-center gap-1.5">
                            <Info className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                            Configuración inicial al entrar al portal de Declaraciones SAT:
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Selecciona <strong>Periodicidad: 2-Mensual</strong> | <strong>Ejercicio: {selectedYear}</strong> | <strong>Periodo: {monthLabel}</strong> | <strong>Tipo: Normal</strong> y marca las 2 obligaciones: <strong>ISR simplificado de confianza. Personas físicas</strong> e <strong>IVA simplificado de confianza</strong>.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                        {/* Paso a paso ISR */}
                        <div className="space-y-3 p-3.5 rounded-xl border border-border/60 bg-muted/10">
                            <div className="font-bold text-xs uppercase tracking-wider text-blue-400 flex items-center gap-1.5 pb-2 border-b border-border/40">
                                <ShieldCheck className="h-4 w-4 text-blue-400" /> 1. Pestaña ISR Simplificado de Confianza
                            </div>

                            <div className="space-y-2 text-xs">
                                <div className="p-2.5 bg-background rounded-lg border border-border/40 space-y-2">
                                    <div className="font-semibold text-foreground">1. Pestaña "Ingresos" (6 campos del SAT en orden):</div>

                                    <div className="space-y-2 text-[11px] text-muted-foreground">
                                        {/* Campo 1 */}
                                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border/30">
                                            <span className="text-foreground font-medium">1. *¿Los ingresos fueron obtenidos a través de copropiedad?</span>
                                            <Badge variant="outline" className="border-border/60 text-foreground bg-muted/20 font-sans font-semibold text-[11px] shrink-0">
                                                No
                                            </Badge>
                                        </div>

                                        {/* Campo 2 */}
                                        <div className="space-y-0.5 pb-1.5 border-b border-border/30">
                                            <div className="text-foreground font-medium">2. Total de ingresos efectivamente cobrados</div>
                                            <div>
                                                <strong className="text-foreground">Ya viene prellenado en automático por el SAT</strong> (campo gris bloqueado con la suma de las facturas emitidas y cobradas en el mes). No necesitas editarlo.
                                            </div>
                                        </div>

                                        {/* Campo 3 */}
                                        <div className="flex items-start justify-between gap-2 pb-1.5 border-b border-border/30">
                                            <div className="space-y-0.5">
                                                <div className="text-foreground font-medium flex items-center gap-1.5 flex-wrap">
                                                    <span>3. Descuentos, devoluciones y bonificaciones (-)</span>
                                                    <span className="inline-flex items-center px-1.5 py-0 rounded border border-red-500/30 bg-red-500/10 text-red-400 font-sans font-bold text-[10px]">!</span>
                                                </div>
                                                <div>
                                                    Viene en <strong className="text-foreground">0</strong>. Si aparece con el signo <span className="text-red-400 font-bold">!</span> rojo a un lado, da clic en su botón <strong className="text-foreground">CAPTURAR</strong>, coloca <strong className="text-foreground">0</strong> y guarda/cierra para quitar la alerta.
                                                </div>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-2.5 gap-1 font-sans font-bold border-border/60 hover:border-blue-500 shrink-0 text-xs"
                                                onClick={() => copyToClipboard('0', 'isr_descuentos')}
                                            >
                                                {copiedField === 'isr_descuentos' ? <Check className="h-3 w-3 text-blue-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
                                                $0
                                            </Button>
                                        </div>

                                        {/* Campo 4 */}
                                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border/30">
                                            <span className="text-foreground font-medium">4. *¿Tienes ingresos a disminuir?</span>
                                            <Badge variant="outline" className="border-border/60 text-foreground bg-muted/20 font-sans font-semibold text-[11px] shrink-0">
                                                No
                                            </Badge>
                                        </div>

                                        {/* Campo 5 */}
                                        <div className="space-y-0.5 pb-1.5 border-b border-border/30">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-foreground font-medium">5. *¿Tienes ingresos adicionales?</span>
                                                <Badge variant="outline" className="border-border/60 text-foreground bg-muted/20 font-sans font-semibold text-[11px] shrink-0">
                                                    No
                                                </Badge>
                                            </div>
                                            <div className="text-[10px]">
                                                (Si el prellenado marcara $0 porque no timbraste CFDI en el mes, selecciona <strong className="text-foreground">Sí</strong> → <em>"Ingresos no considerados en el prellenado"</em>).
                                            </div>
                                        </div>

                                        {/* Campo 6 */}
                                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                            <div className="space-y-0.5">
                                                <div className="text-foreground font-medium flex items-center gap-1.5 flex-wrap">
                                                    <span>6. Total de ingresos percibidos por la actividad (=)</span>
                                                    <span className="inline-flex items-center px-1.5 py-0 rounded border border-red-500/30 bg-red-500/10 text-red-400 font-sans font-bold text-[10px]">!</span>
                                                </div>
                                                <div>
                                                    <strong className="text-foreground">Ya viene prellenado en automático</strong> (igual al campo 2), pero aparece con un signo <span className="text-red-400 font-bold">!</span> rojo. Da clic en su botón <strong className="text-foreground">CAPTURAR</strong>, pega <strong className="text-foreground">el mismo monto que aparece prellenado en este campo</strong> en tu actividad empresarial para que <em>"Monto por detallar"</em> quede en <strong className="text-foreground">0</strong>, y da clic en <strong className="text-foreground">Guardar / Cerrar</strong>.
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap sm:flex-col items-end gap-1.5 shrink-0">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 px-2.5 gap-1 font-sans font-bold border-border/60 hover:border-blue-500 shrink-0 text-xs"
                                                    onClick={() => copyToClipboard(String(baseGravableRedondeadaSAT), 'isr_ingresos')}
                                                    title="Copiar base sin IVA"
                                                >
                                                    {copiedField === 'isr_ingresos' ? <Check className="h-3 w-3 text-blue-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
                                                    ${baseGravableRedondeadaSAT.toLocaleString('es-MX')}
                                                </Button>
                                                {Math.round(montoADeclararBruto) !== baseGravableRedondeadaSAT && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 px-2.5 gap-1 font-sans font-bold border-blue-500/40 text-blue-400 bg-blue-500/10 hover:border-blue-500 shrink-0 text-xs"
                                                        onClick={() => copyToClipboard(String(Math.round(montoADeclararBruto)), 'isr_ingresos_bruto')}
                                                        title="Copiar total prellenado del CFDI"
                                                    >
                                                        {copiedField === 'isr_ingresos_bruto' ? <Check className="h-3 w-3 text-blue-400" /> : <Copy className="h-3 w-3 text-blue-400" />}
                                                        ${Math.round(montoADeclararBruto).toLocaleString('es-MX')}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Block 2: Pestaña Determinación */}
                                <div className="p-2.5 bg-background rounded-lg border border-border/40 space-y-2">
                                    <div className="font-semibold text-foreground">2. Pestaña "Determinación" (6 campos del SAT en orden):</div>

                                    <div className="space-y-2 text-[11px] text-muted-foreground">
                                        {/* Campo 1 */}
                                        <div className="space-y-0.5 pb-1.5 border-b border-border/30">
                                            <div className="text-foreground font-medium">1. Total de ingresos percibidos por la actividad</div>
                                            <div>
                                                <strong className="text-foreground">Prellenado en automático</strong> (viene de la pestaña <em>Ingresos</em>).
                                            </div>
                                        </div>

                                        {/* Campo 2 */}
                                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border/30">
                                            <span className="text-foreground font-medium">2. Tasa aplicable (x)</span>
                                            <Badge variant="outline" className="border-border/60 text-foreground bg-muted/20 font-sans font-semibold text-[11px] shrink-0">
                                                {tasaIsr.toFixed(2)}%
                                            </Badge>
                                        </div>

                                        {/* Campo 3 */}
                                        <div className="space-y-0.5 pb-1.5 border-b border-border/30">
                                            <div className="text-foreground font-medium">3. Impuesto mensual (=)</div>
                                            <div className="font-sans">
                                                <strong className="text-foreground">Calculado en automático por el SAT</strong> (<strong className="text-foreground font-sans">${isrRedondeado.toLocaleString('es-MX')}</strong> o <strong className="text-foreground font-sans">${Math.round(Math.round(montoADeclararBruto) * (tasaIsr / 100)).toLocaleString('es-MX')}</strong>).
                                            </div>
                                        </div>

                                        {/* Campo 4 */}
                                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border/30">
                                            <span className="text-foreground font-medium">4. Pagos efectuados con anterioridad</span>
                                            <span className="text-muted-foreground font-sans">Viene en <strong className="text-foreground">0</strong> (dejar en <strong className="text-foreground">0</strong>)</span>
                                        </div>

                                        {/* Campo 5 */}
                                        <div className="space-y-0.5 pb-1.5 border-b border-border/30">
                                            <div className="text-foreground font-medium flex items-center gap-1.5 flex-wrap">
                                                <span>5. ISR retenido por personas morales (-)</span>
                                                <span className="inline-flex items-center px-1.5 py-0 rounded border border-red-500/30 bg-red-500/10 text-red-400 font-sans font-bold text-[10px]">!</span>
                                            </div>
                                            <div>
                                                Si aparece con el signo <span className="text-red-400 font-bold">!</span> rojo, da clic en <strong className="text-foreground">VER DETALLE</strong>, coloca <strong className="text-foreground">0</strong> (si no aplica retención) o confirma el monto precargado y da clic en <strong className="text-foreground">Guardar / Cerrar</strong> para quitar la alerta.
                                            </div>
                                        </div>

                                        {/* Campo 6 */}
                                        <div className="space-y-0.5">
                                            <div className="text-foreground font-medium">6. Impuesto a cargo (=)</div>
                                            <div>
                                                <strong className="text-foreground">Calculado en automático por el SAT</strong>.
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Block 3: Pestaña Pago */}
                                <div className="p-2.5 bg-background rounded-lg border border-border/40 space-y-2">
                                    <div className="font-semibold text-foreground">3. Pestaña "Pago" (Campos del SAT en orden):</div>

                                    <div className="space-y-2 text-[11px] text-muted-foreground">
                                        {/* Campos 1 y 2 */}
                                        <div className="space-y-0.5 pb-1.5 border-b border-border/30">
                                            <div className="text-foreground font-medium">1. A cargo y 2. Total de contribuciones (=)</div>
                                            <div>
                                                <strong className="text-foreground">Ya vienen prellenados en automático</strong> con tu impuesto a cargo.
                                            </div>
                                        </div>

                                        {/* Campo 3 */}
                                        <div className="space-y-0.5 pb-1.5 border-b border-border/30">
                                            <div className="text-foreground font-medium">3. Subsidio para el empleo</div>
                                            <div>
                                                <strong className="text-foreground">Dejar en blanco / vacío</strong> (no aplica si no tienes empleados con subsidio).
                                            </div>
                                        </div>

                                        {/* Campo 4 */}
                                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border/30">
                                            <div className="text-foreground font-medium flex items-center gap-1.5 flex-wrap">
                                                <span>4. *¿Tienes compensaciones por aplicar?</span>
                                                <span className="inline-flex items-center px-1.5 py-0 rounded border border-red-500/30 bg-red-500/10 text-red-400 font-sans font-bold text-[10px]">!</span>
                                            </div>
                                            <Badge variant="outline" className="border-border/60 text-foreground bg-muted/20 font-sans font-semibold text-[11px] shrink-0">
                                                No
                                            </Badge>
                                        </div>

                                        {/* Campo 5 */}
                                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border/30">
                                            <div className="text-foreground font-medium flex items-center gap-1.5 flex-wrap">
                                                <span>5. *¿Tienes estímulos por aplicar?</span>
                                                <span className="inline-flex items-center px-1.5 py-0 rounded border border-red-500/30 bg-red-500/10 text-red-400 font-sans font-bold text-[10px]">!</span>
                                            </div>
                                            <Badge variant="outline" className="border-border/60 text-foreground bg-muted/20 font-sans font-semibold text-[11px] shrink-0">
                                                No
                                            </Badge>
                                        </div>

                                        {/* Campo 6 */}
                                        <div className="space-y-0.5">
                                            <div className="text-foreground font-medium">6. Total de aplicaciones (=) y resumen inferior</div>
                                            <div>
                                                <em>(Total de contribuciones, Total de aplicaciones (-), Cantidad a cargo (=), Cantidad a pagar)</em>: <strong className="text-foreground">Se calculan solos en automático</strong>.
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-2 bg-blue-500/10 rounded-lg border border-blue-500/30 text-foreground gap-2">
                                    <div>
                                        <div className="font-semibold">Cantidad a pagar de ISR (y siguiente paso en el SAT):</div>
                                        <div className="text-[11px] text-muted-foreground font-sans">
                                            Al quedar "✓ Pago" con palomita, da clic arriba en <strong>GUARDAR</strong> y luego en <strong>ADMINISTRACIÓN DE LA DECLARACIÓN</strong> para pasar al IVA.
                                        </div>
                                    </div>
                                    <span className="font-extrabold text-sm text-blue-400 font-sans shrink-0">${isrRedondeado.toLocaleString('es-MX')} / ${Math.round(Math.round(montoADeclararBruto) * (tasaIsr / 100)).toLocaleString('es-MX')}</span>
                                </div>
                            </div>
                        </div>

                        {/* Paso a paso IVA */}
                        <div className="space-y-3 p-3.5 rounded-xl border border-border/60 bg-muted/10">
                            <div className="font-bold text-xs uppercase tracking-wider text-blue-400 flex items-center gap-1.5 pb-2 border-b border-border/40">
                                <FileText className="h-4 w-4 text-blue-400" /> 2. Pestaña IVA Simplificado de Confianza
                            </div>

                            <div className="space-y-2 text-xs">
                                {/* Block 1: Pestaña Determinación */}
                                <div className="p-2.5 bg-background rounded-lg border border-border/40 space-y-2">
                                    <div className="font-semibold text-foreground">1. Pestaña "Determinación" (Campos del SAT en orden):</div>

                                    <div className="space-y-2 text-[11px] text-muted-foreground">
                                        {/* Campo 1 */}
                                        <div className="space-y-0.5 pb-1.5 border-b border-border/30">
                                            <div className="text-foreground font-medium">1. Actividades gravadas a la tasa del 16%</div>
                                            <div>
                                                <strong className="text-foreground">Ya viene prellenado en automático por el SAT</strong> con tus facturas del mes.
                                            </div>
                                        </div>

                                        {/* Campos 2, 3 y 4 */}
                                        <div className="space-y-0.5 pb-1.5 border-b border-border/30">
                                            <div className="text-foreground font-medium">2. Actividades gravadas a la tasa del 0%, 3. Actividades exentas y 4. Actividades no objeto del impuesto</div>
                                            <div>
                                                Vienen en <strong className="text-foreground font-sans">0</strong> (dejar en <strong className="text-foreground font-sans">0</strong>).
                                            </div>
                                        </div>

                                        {/* Campos 5 y 6 */}
                                        <div className="space-y-0.5 pb-1.5 border-b border-border/30">
                                            <div className="text-foreground font-medium">5. IVA a cargo a la tasa del 16% y 6. Total de IVA a cargo (=)</div>
                                            <div>
                                                <strong className="text-foreground">Calculados en automático por el SAT</strong> (16%).
                                            </div>
                                        </div>

                                        {/* Campos 7 y 8 */}
                                        <div className="space-y-0.5 pb-1.5 border-b border-border/30">
                                            <div className="text-foreground font-medium">7. IVA no cobrado por devoluciones, descuentos y bonificaciones de ventas (-) y 8. IVA retenido (-)</div>
                                            <div>
                                                <strong className="text-foreground">Prellenados en automático por el SAT</strong> (no mover).
                                            </div>
                                        </div>

                                        {/* Campo 9 */}
                                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 pb-1.5 border-b border-border/30">
                                            <div className="space-y-1">
                                                <div className="text-foreground font-medium flex items-center gap-1.5 flex-wrap">
                                                    <span>9. *IVA acreditable del periodo (-)</span>
                                                    <span className="inline-flex items-center px-1.5 py-0 rounded border border-red-500/30 bg-red-500/10 text-red-400 font-sans font-bold text-[10px]">!</span>
                                                </div>
                                                <div>
                                                    Da clic en su botón <strong className="text-foreground">CAPTURAR</strong>. En la ventana <strong>"IVA acreditable del periodo"</strong> que se abre, completa así los 5 campos:
                                                </div>
                                                <div className="pl-2 border-l-2 border-blue-500/30 space-y-0.5 text-[10.5px]">
                                                    <div>• 1. IVA pagado en gastos y adquisiciones: <strong className="text-foreground">Ya viene prellenado arriba en gris por el SAT</strong> (ej. el IVA de tus facturas de gastos/comisiones del mes).</div>
                                                    <div>• 2. *IVA acreditable por actividades gravadas a tasa 16% u 8% y tasa 0% (<span className="text-red-400 font-bold">!</span> rojo): <strong className="text-foreground">Escribe exactamente el mismo número que el SAT te precargó arriba</strong> en el campo 1.</div>
                                                    <div>• 3. *IVA acreditable por actividades mixtas (+) (<span className="text-red-400 font-bold">!</span> rojo): Escribe <strong className="text-foreground font-sans">0</strong>.</div>
                                                    <div>• 4. IVA acreditable del periodo (=) y 5. IVA no acreditable: Se calculan solos al presionar <strong className="text-foreground">Tab</strong>. Da clic en <strong className="text-foreground">CERRAR</strong>.</div>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap sm:flex-col items-end gap-1.5 shrink-0">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 px-2.5 gap-1 font-sans font-bold border-border/60 hover:border-blue-500 shrink-0 text-xs"
                                                    onClick={() => copyToClipboard(String(ivaAcreditableIngresoRedondeado), 'iva_acreditable')}
                                                    title="Copiar IVA acreditable estimado"
                                                >
                                                    {copiedField === 'iva_acreditable' ? <Check className="h-3 w-3 text-blue-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
                                                    ${ivaAcreditableIngresoRedondeado.toLocaleString('es-MX')}
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 px-2.5 gap-1 font-sans font-bold border-border/60 hover:border-blue-500 shrink-0 text-xs"
                                                    onClick={() => copyToClipboard('0', 'iva_mixtas')}
                                                    title="Copiar 0 para actividades mixtas"
                                                >
                                                    {copiedField === 'iva_mixtas' ? <Check className="h-3 w-3 text-blue-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
                                                    $0
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Campo 10 */}
                                        <div className="space-y-0.5 pb-1.5 border-b border-border/30">
                                            <div className="text-foreground font-medium">10. IVA por devoluciones, descuentos y bonificaciones en gastos (+)</div>
                                            <div>
                                                <strong className="text-foreground">Prellenado en automático por el SAT</strong> (notas de egreso/bonificaciones).
                                            </div>
                                        </div>

                                        {/* Campos 11, 12 y 13 */}
                                        <div className="space-y-0.5">
                                            <div className="text-foreground font-medium">11. Cantidad a cargo (=), 12. Acreditamiento del saldo a favor de periodos anteriores (-) <em className="font-normal text-muted-foreground">(dejar en blanco)</em> y 13. Impuesto a cargo (=)</div>
                                            <div>
                                                <strong className="text-foreground">Se calculan solos en automático</strong>.
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Block 2: Pestaña Pago */}
                                <div className="p-2.5 bg-background rounded-lg border border-border/40 space-y-2">
                                    <div className="font-semibold text-foreground">2. Pestaña "Pago" (Campos del SAT en orden):</div>

                                    <div className="space-y-2 text-[11px] text-muted-foreground">
                                        {/* Campos 1 y 2 */}
                                        <div className="space-y-0.5 pb-1.5 border-b border-border/30">
                                            <div className="text-foreground font-medium">1. A cargo y 2. Total de contribuciones (=)</div>
                                            <div>
                                                <strong className="text-foreground">Ya vienen prellenados en automático</strong> con el Impuesto a cargo de la pestaña anterior.
                                            </div>
                                        </div>

                                        {/* Campo 3 */}
                                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border/30">
                                            <div className="text-foreground font-medium flex items-center gap-1.5 flex-wrap">
                                                <span>3. *¿Tienes compensaciones por aplicar?</span>
                                                <span className="inline-flex items-center px-1.5 py-0 rounded border border-red-500/30 bg-red-500/10 text-red-400 font-sans font-bold text-[10px]">!</span>
                                            </div>
                                            <Badge variant="outline" className="border-border/60 text-foreground bg-muted/20 font-sans font-semibold text-[11px] shrink-0">
                                                No
                                            </Badge>
                                        </div>

                                        {/* Campo 4 */}
                                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border/30">
                                            <div className="text-foreground font-medium flex items-center gap-1.5 flex-wrap">
                                                <span>4. *¿Tienes estímulos por aplicar?</span>
                                                <span className="inline-flex items-center px-1.5 py-0 rounded border border-red-500/30 bg-red-500/10 text-red-400 font-sans font-bold text-[10px]">!</span>
                                            </div>
                                            <Badge variant="outline" className="border-border/60 text-foreground bg-muted/20 font-sans font-semibold text-[11px] shrink-0">
                                                No
                                            </Badge>
                                        </div>

                                        {/* Campo 5 */}
                                        <div className="space-y-0.5">
                                            <div className="text-foreground font-medium">5. Total de aplicaciones (=) y resumen inferior</div>
                                            <div>
                                                <em>(Total de contribuciones, Total de aplicaciones (-), Cantidad a cargo (=), Cantidad a pagar)</em>: <strong className="text-foreground">Se calculan solos en automático</strong>.
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Block 3: Summary Bar */}
                                <div className="flex items-center justify-between p-2 bg-blue-500/10 rounded-lg border border-blue-500/30 text-foreground gap-2">
                                    <div>
                                        <div className="font-semibold">Cantidad a pagar de IVA (y envío final en el SAT):</div>
                                        <div className="text-[11px] text-muted-foreground font-sans">
                                            Al quedar "✓ Pago" con palomita, da clic arriba en <strong>GUARDAR</strong>, luego en <strong>ADMINISTRACIÓN DE LA DECLARACIÓN</strong> y finalmente en <strong>ENVIAR DECLARACIÓN</strong> para descargar tu Acuse con Línea de Captura.
                                        </div>
                                    </div>
                                    <span className="font-extrabold text-sm text-blue-400 font-sans shrink-0">${ivaRedondeado.toLocaleString('es-MX')}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Botones de navegación entre pasos */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-border/40">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full sm:w-auto text-xs border-border/60 hover:border-blue-500"
                            onClick={() => {
                                setActiveTab('paso1');
                                window.scrollTo({ top: 350, behavior: 'smooth' });
                            }}
                        >
                            ← Volver al Paso 1 (CFDI)
                        </Button>
                        <Button 
                            variant="alfa" 
                            size="sm" 
                            className="w-full sm:w-auto text-xs gap-1.5 px-4"
                            onClick={() => {
                                setActiveTab('paso3');
                                window.scrollTo({ top: 350, behavior: 'smooth' });
                            }}
                        >
                            Ir al Paso 3 (Registro y Pago)
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </div>
            </TabsContent>

            {/* BLOQUE 6: PASO 3 - REGISTRO DE ACUSE Y CONTROL DE PAGO */}
            <TabsContent value="paso3" className="space-y-4 mt-0">
                <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-3.5 sm:p-5 shadow-sm space-y-4">
                <div className="border-b border-border/40 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="border-blue-500/40 text-blue-400 bg-blue-500/10 font-bold text-xs">
                            PASO 3 FINAL
                        </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                        <Save className="h-4 w-4 text-blue-400 shrink-0" />
                        <h3 className="text-base sm:text-lg font-bold text-foreground">
                            Registro de Línea de Captura y Control de Pago ({monthLabel} {selectedYear})
                        </h3>
                        <Popover>
                            <PopoverTrigger asChild>
                                <button type="button" className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors" title="Información Paso 3">
                                    <HelpCircle className="h-4 w-4 text-blue-400" />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-3.5 border-2 border-blue-500 rounded-xl shadow-xl bg-card text-foreground text-xs space-y-1.5">
                                <p className="font-semibold text-blue-600 dark:text-blue-400">Expediente fiscal completo</p>
                                <p className="text-muted-foreground text-[11px]">
                                    Una vez pagada la línea de captura en tu banca móvil (BBVA, Banorte, Santander, etc.), archiva aquí tus datos para tener tu expediente fiscal completo y ordenado.
                                </p>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-foreground">Estado de la Declaración:</Label>
                            <Select 
                                value={fiscalData.estado} 
                                onValueChange={(val: 'pendiente' | 'presentada') => setFiscalData(prev => ({ ...prev, estado: val }))}
                            >
                                <SelectTrigger className="h-9 text-xs bg-background border-border/60">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                    <SelectItem value="pendiente">Pendiente de presentar</SelectItem>
                                    <SelectItem value="presentada">Presentada y Pagada</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs text-foreground">Número de Operación / Folio SAT:</Label>
                            <Input 
                                value={fiscalData.folioOperacionSAT || ''}
                                onChange={(e) => setFiscalData(prev => ({ ...prev, folioOperacionSAT: e.target.value }))}
                                placeholder="Ej. 260812345678"
                                className="h-9 text-xs bg-background border-border/60"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs text-foreground">Línea de Captura / Referencia:</Label>
                            <Input 
                                value={fiscalData.lineaCaptura || ''}
                                onChange={(e) => setFiscalData(prev => ({ ...prev, lineaCaptura: e.target.value }))}
                                placeholder="Ej. 0324 XXXXXXXXXX"
                                className="h-9 text-xs bg-background border-border/60"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs text-foreground">Notas / Comentarios Internos:</Label>
                        <Input 
                            value={fiscalData.notas || ''}
                            onChange={(e) => setFiscalData(prev => ({ ...prev, notas: e.target.value }))}
                            placeholder="Ej. Pagado vía BBVA el 14 de septiembre por transferencia."
                            className="h-9 text-xs bg-background border-border/60"
                        />
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border/40">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full sm:w-auto text-xs border-border/60 hover:border-blue-500"
                            onClick={() => {
                                setActiveTab('paso2');
                                window.scrollTo({ top: 350, behavior: 'smooth' });
                            }}
                        >
                            ← Volver al Paso 2 (Declaración)
                        </Button>
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="text-xs border-border/60 hover:border-blue-500"
                                onClick={() => setActiveTab('historial')}
                            >
                                <Calendar className="h-3.5 w-3.5 mr-1 text-slate-400" />
                                Ver Historial Anual
                            </Button>
                            <Button 
                                variant="alfa"
                                onClick={handleSaveFiscalData} 
                                disabled={isSaving}
                                className="gap-2 px-5 text-xs h-9"
                            >
                                <Save className="h-4 w-4" />
                                {isSaving ? "Guardando..." : "Guardar Registro Fiscal"}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
            </TabsContent>

            {/* BLOQUE 7: HISTORIAL ANUAL DE DECLARACIONES */}
            <TabsContent value="historial" className="space-y-4 mt-0">
                <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-3.5 sm:p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                    <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-blue-400 shrink-0" />
                        <h3 className="text-sm font-bold text-foreground">
                            Historial Anual de Declaraciones ({selectedYear})
                        </h3>
                    </div>
                    <Popover>
                        <PopoverTrigger asChild>
                            <button type="button" className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors" title="Información Historial">
                                <HelpCircle className="h-3.5 w-3.5 text-blue-400" />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-3 border-2 border-blue-500 rounded-xl shadow-xl bg-card text-foreground text-xs space-y-1">
                            <p className="font-semibold text-blue-600 dark:text-blue-400">Cumplimiento mes a mes</p>
                            <p className="text-muted-foreground text-[11px]">
                                Monitorea tu cumplimiento fiscal mes a mes. Haz clic en cualquier fila para cargar o editar ese periodo.
                            </p>
                        </PopoverContent>
                    </Popover>
                </div>

                <div className="rounded-xl border border-border/60 overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                <TableHead className="py-1 px-3 text-xs font-semibold">Mes</TableHead>
                                <TableHead className="py-1 px-3 text-xs font-semibold">Estado</TableHead>
                                <TableHead className="py-1 px-3 text-xs font-semibold text-right hidden sm:table-cell">Declarado</TableHead>
                                <TableHead className="py-1 px-3 text-xs font-semibold text-right hidden md:table-cell">ISR</TableHead>
                                <TableHead className="py-1 px-3 text-xs font-semibold text-right hidden md:table-cell">IVA</TableHead>
                                <TableHead className="py-1 px-3 text-xs font-semibold text-right">Total Pagado</TableHead>
                                <TableHead className="py-1 px-3 text-xs font-semibold hidden lg:table-cell">Folio SAT</TableHead>
                                <TableHead className="py-1 px-3 text-xs font-semibold text-center w-12"></TableHead>
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
                                            "h-9 hover:bg-muted/30 transition-colors border-b border-border/40 cursor-pointer",
                                            isCurrent && "bg-blue-500/10 font-semibold"
                                        )}
                                        onClick={() => {
                                            setSelectedMonthIdx(idx);
                                            setActiveTab(isPresentada ? 'paso3' : 'paso1');
                                            window.scrollTo({ top: 350, behavior: 'smooth' });
                                        }}
                                    >
                                        <TableCell className="py-1.5 px-3 font-medium text-foreground">
                                            {mLabel} {selectedYear}
                                            {isCurrent && <span className="ml-1.5 text-[10px] text-blue-400 font-bold">(Activo)</span>}
                                        </TableCell>
                                        <TableCell className="py-1.5 px-3">
                                            <Badge 
                                                variant="outline" 
                                                className={cn(
                                                    "text-[10px] py-0 px-1.5 h-5",
                                                    isPresentada 
                                                        ? "border-blue-500/40 text-blue-400 bg-blue-500/10" 
                                                        : "border-border/60 text-muted-foreground bg-muted/20"
                                                )}
                                            >
                                                {isPresentada ? "Pagada" : "Pendiente"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="py-1.5 px-3 text-right hidden sm:table-cell">
                                            {rec?.montoDeclaradoFinal !== undefined ? `$${Number(rec.montoDeclaradoFinal).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : "-"}
                                        </TableCell>
                                        <TableCell className="py-1.5 px-3 text-right text-blue-400 hidden md:table-cell">
                                            {rec?.isrPagadoFinal !== undefined ? `$${Number(rec.isrPagadoFinal).toLocaleString('es-MX')}` : "-"}
                                        </TableCell>
                                        <TableCell className="py-1.5 px-3 text-right text-slate-300 hidden md:table-cell">
                                            {rec?.ivaPagadoFinal !== undefined ? `$${Number(rec.ivaPagadoFinal).toLocaleString('es-MX')}` : "-"}
                                        </TableCell>
                                        <TableCell className="py-1.5 px-3 text-right font-bold text-foreground">
                                            {rec?.totalPagadoFinal !== undefined ? `$${Number(rec.totalPagadoFinal).toLocaleString('es-MX')}` : "-"}
                                        </TableCell>
                                        <TableCell className="py-1.5 px-3 font-mono text-[11px] text-muted-foreground hidden lg:table-cell">
                                            {rec?.folioOperacionSAT || "-"}
                                        </TableCell>
                                        <TableCell className="py-1.5 px-3 text-center">
                                            <button 
                                                type="button"
                                                className="text-slate-400 hover:text-foreground transition-colors p-1"
                                                title="Gestionar este mes"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedMonthIdx(idx);
                                                    setActiveTab(isPresentada ? 'paso3' : 'paso1');
                                                    window.scrollTo({ top: 350, behavior: 'smooth' });
                                                }}
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </div>
            </TabsContent>
            </Tabs>
        </div>
    );
}
