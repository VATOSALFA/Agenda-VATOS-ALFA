'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { format, differenceInMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Loader2,
    DollarSign,
    CheckCircle2,
    ArrowUpDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    Users,
    Banknote,
    RotateCcw,
    AlertTriangle,
    X,
    Wallet,
    Calendar,
    Search,
    ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Timestamp, collection, query, getDocs, writeBatch, doc, orderBy, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { useAuth } from '@/contexts/firebase-auth-context';
import { useLocal } from '@/contexts/local-context';
import { useToast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { User as AppUser, Local } from '@/lib/types';

interface WorkSession {
    id: string;
    empleado_id: string;
    empleado_nombre: string;
    rol: string;
    hora_entrada: Timestamp | null;
    hora_salida: Timestamp | null;
    local_id: string;
    estado: string;
    pagado: boolean;
    dispositivo?: string;
    ultima_actividad?: Timestamp | null;
}

interface PaymentRecord {
    id: string;
    fecha: Timestamp;
    empleado_nombre: string;
    local_nombre: string;
    quien_paga_nombre: string;
    horas_trabajadas: number;
    total_pagado: number;
    tarifa_hora: number;
}

type SortDirection = 'asc' | 'desc';
type PaymentSortKey = 'fecha' | 'empleado_nombre' | 'local_nombre' | 'quien_paga_nombre' | 'horas_trabajadas' | 'total_pagado';

export default function NominaPage() {
    const { user } = useAuth();
    const { selectedLocalId } = useLocal();
    const { toast } = useToast();

    const [tarifaHora, setTarifaHora] = useState(35.5);
    const [loading, setLoading] = useState(true);
    const [sessions, setSessions] = useState<WorkSession[]>([]);
    const [manualHours, setManualHours] = useState<Record<string, number>>({}); // Manual adjustment for each employee
    const [roundHours, setRoundHours] = useState(true); // Default to true as per user interest

    // Payment modal state
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [payingEmployee, setPayingEmployee] = useState<any | null>(null);
    const [selectedPayerId, setSelectedPayerId] = useState('');
    const [processingPayment, setProcessingPayment] = useState(false);

    // Sessions detail modal state
    const [selectedEmployeeSessions, setSelectedEmployeeSessions] = useState<{
        name: string;
        sessions: WorkSession[];
    } | null>(null);
    const [isSessionsModalOpen, setIsSessionsModalOpen] = useState(false);

    // Reset (clean slate) modal
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [processingReset, setProcessingReset] = useState(false);
    const [resetAuthCode, setResetAuthCode] = useState('');

    // Payment history
    const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [historySortConfig, setHistorySortConfig] = useState<{ key: PaymentSortKey; direction: SortDirection }>({ key: 'fecha', direction: 'desc' });
    const [historyPage, setHistoryPage] = useState(1);
    const [historyPerPage, setHistoryPerPage] = useState(10);
    const [historyFilterMode, setHistoryFilterMode] = useState<'current_month' | 'previous_month' | 'custom_month' | 'all'>('current_month');
    const [customMonth, setCustomMonth] = useState(() => {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${yyyy}-${mm}`;
    });
    const [historySearchTerm, setHistorySearchTerm] = useState('');

    // Query key for refreshing
    const [queryKey, setQueryKey] = useState(0);

    const { data: users, loading: usersLoading } = useFirestoreQuery<AppUser>('usuarios');
    const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');

    const adminsDisponibles = useMemo(() => {
        if (usersLoading || !users) return [];
        return users.filter(u => u.role === 'Administrador general' || u.role === 'Administrador local');
    }, [users, usersLoading]);

    const getLocalName = useCallback((localId: string) => {
        if (localesLoading || !locales) return localId;
        return locales.find(l => l.id === localId)?.name || localId;
    }, [locales, localesLoading]);

    // Fetch all unpaid sessions — filter client-side to avoid Firestore index/permission issues
    const fetchSessions = useCallback(async () => {
        setLoading(true);
        try {
            const sessionsRef = collection(db, 'sesiones_trabajo');
            const q = query(sessionsRef);
            const querySnapshot = await getDocs(q);
            const fetchedSessions: WorkSession[] = [];
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data() as WorkSession;
                // Filter unpaid client-side
                if (!data.pagado) {
                    const { id: _id, ...rest } = data;
                    fetchedSessions.push({ id: docSnap.id, ...rest } as WorkSession);
                }
            });
            setSessions(fetchedSessions);
        } catch (error) {
            console.error("Error fetching sessions:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "No se pudieron cargar las sesiones de trabajo.",
            });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    // Fetch payment history
    const fetchPaymentHistory = useCallback(async () => {
        setLoadingHistory(true);
        try {
            const historyRef = collection(db, 'pagos_nomina');
            const q = query(historyRef, orderBy('fecha', 'desc'));
            const querySnapshot = await getDocs(q);
            const records: PaymentRecord[] = [];
            querySnapshot.forEach((docSnap) => {
                records.push({ id: docSnap.id, ...docSnap.data() } as PaymentRecord);
            });
            setPaymentHistory(records);
        } catch (error) {
            console.error("Error fetching payment history:", error);
        } finally {
            setLoadingHistory(false);
        }
    }, []);

    useEffect(() => {
        fetchSessions();
        fetchPaymentHistory();
    }, [fetchSessions, fetchPaymentHistory, queryKey]);

    // Group sessions by employee
    const groupedData = useMemo(() => {
        const grouped: Record<string, {
            empleado_nombre: string;
            roles: string[];
            totalMinutos: number;
            unclosedSessions: number;
            unpaidSessions: number;
            sessionIds: string[];
            local_id: string;
        }> = {};

        sessions.forEach(session => {
            const id = session.empleado_id;
            if (!grouped[id]) {
                grouped[id] = {
                    empleado_nombre: session.empleado_nombre,
                    roles: [],
                    totalMinutos: 0,
                    unclosedSessions: 0,
                    unpaidSessions: 0,
                    sessionIds: [],
                    local_id: session.local_id || '',
                };
            }

            if (!grouped[id].roles.includes(session.rol)) {
                grouped[id].roles.push(session.rol);
            }

            const start = session.hora_entrada?.toDate();
            const end = session.hora_salida?.toDate() || session.ultima_actividad?.toDate();
            const today = new Date();
            
            // Check if it's currently active (same day and no explicit logout)
            const isCurrentlyActive = !session.hora_salida && start && 
              start.getDate() === today.getDate() && 
              start.getMonth() === today.getMonth() && 
              start.getFullYear() === today.getFullYear();

            if (!session.hora_salida && isCurrentlyActive) {
                grouped[id].unclosedSessions++;
            } else {
                if (start && end) {
                    const mins = differenceInMinutes(end, start);
                    const safeMins = Math.max(0, mins);
                    grouped[id].totalMinutos += safeMins;
                    grouped[id].unpaidSessions++;
                    grouped[id].sessionIds.push(session.id);
                } else if (!session.hora_salida) {
                    grouped[id].unclosedSessions++;
                }
            }
        });

        return Object.entries(grouped).map(([id, data]) => {
            const calculatedHorasReal = data.totalMinutos / 60;
            
            // Rounding logic: 
            // 0-19m -> 0
            // 20-49m -> 30m (0.5)
            // 50-59m -> 60m (1.0)
            let calculatedHoras = calculatedHorasReal;
            if (roundHours) {
                const hoursOnly = Math.floor(data.totalMinutos / 60);
                const minsOnly = data.totalMinutos % 60;
                let adjustedMins = 0;
                if (minsOnly >= 20 && minsOnly < 50) adjustedMins = 30;
                else if (minsOnly >= 50) adjustedMins = 60;
                calculatedHoras = hoursOnly + (adjustedMins / 60);
            }

            // Use manual hours if provided, otherwise use calculated
            const activeHoras = manualHours[id] !== undefined ? manualHours[id] : calculatedHoras;

            return {
                id,
                ...data,
                totalHorasCalculadas: calculatedHoras,
                totalHorasReal: calculatedHorasReal,
                totalHoras: activeHoras,
                totalPagar: activeHoras * tarifaHora,
                isManual: manualHours[id] !== undefined
            };
        }).filter(u => u.roles.includes('Recepcionista'));
    }, [sessions, tarifaHora, manualHours, roundHours]);

    // Handle manual hour change
    const handleManualHoursChange = (employeeId: string, hours: string) => {
        const value = hours === '' ? undefined : parseFloat(hours);
        setManualHours(prev => {
            const newManual = { ...prev };
            if (value === undefined) {
                delete newManual[employeeId];
            } else {
                newManual[employeeId] = value;
            }
            return newManual;
        });
    };

    const handleOpenSessionDetails = (employeeId: string, employeeName: string) => {
        const employeeSessions = sessions.filter(s => s.empleado_id === employeeId);
        setSelectedEmployeeSessions({ name: employeeName, sessions: employeeSessions });
        setIsSessionsModalOpen(true);
    };

    const getSessionDuration = (session: WorkSession) => {
        const start = session.hora_entrada?.toDate();
        const today = new Date();
        const isCurrentlyActive = !session.hora_salida && start && 
          start.getDate() === today.getDate() && 
          start.getMonth() === today.getMonth() && 
          start.getFullYear() === today.getFullYear();

        const end = session.hora_salida?.toDate() || (!isCurrentlyActive ? session.ultima_actividad?.toDate() : null);
        
        if (!start || !end) return 'N/A';
        const mins = differenceInMinutes(end, start);
        const hrs = mins / 60;
        return `${hrs.toFixed(2)} hrs (${Math.floor(mins / 60)}h ${mins % 60}m)`;
    };

    const handleForceCloseSession = async (sessionId: string, employeeName: string) => {
        const confirmClose = window.confirm(`¿Estás seguro de que deseas forzar el cierre de la sesión de ${employeeName}? Se guardará con la hora de su último latido de actividad o la hora actual.`);
        if (!confirmClose) return;

        try {
            const sessionRef = doc(db, 'sesiones_trabajo', sessionId);
            const sessionDoc = await getDoc(sessionRef);
            let exitTime = Timestamp.now();
            if (sessionDoc.exists()) {
                const data = sessionDoc.data();
                // If last activity is missing (older session), use the current time (now) instead of entry time
                exitTime = data.ultima_actividad || Timestamp.now();
            }

            await updateDoc(sessionRef, {
                hora_salida: exitTime,
                estado: 'cerrada'
            });

            toast({
                title: "Sesión cerrada",
                description: `Se forzó el cierre de sesión de ${employeeName} con éxito.`,
            });
            
            // Refresh detailed session list inline if open
            if (selectedEmployeeSessions) {
                const refreshedSessions = selectedEmployeeSessions.sessions.map(s => {
                    if (s.id === sessionId) {
                        return { ...s, hora_salida: exitTime, estado: 'cerrada' } as WorkSession;
                    }
                    return s;
                });
                setSelectedEmployeeSessions({ ...selectedEmployeeSessions, sessions: refreshedSessions });
            }
            
            setQueryKey(prev => prev + 1);
        } catch (error) {
            console.error("Error forcing session close:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "No se pudo cerrar la sesión.",
            });
        }
    };

    // Open payment modal for a single employee
    const handleOpenPayment = (employee: typeof groupedData[0]) => {
        setPayingEmployee(employee);
        setSelectedPayerId(user?.uid || '');
        setIsPaymentModalOpen(true);
    };

    // Process payment
    const handlePayNomina = async () => {
        if (!payingEmployee || !selectedPayerId) return;
        setProcessingPayment(true);

        const payerUser = adminsDisponibles.find(a => a.id === selectedPayerId);
        const payerName = payerUser?.name || 'Desconocido';
        const localName = getLocalName(payingEmployee.local_id || selectedLocalId || '');

        try {
            const batch = writeBatch(db);

            // 1. Create Egreso (matching existing finanzas format)
            const egresoRef = doc(collection(db, 'egresos'));
            batch.set(egresoRef, {
                concepto: 'Nómina',
                aQuien: payingEmployee.empleado_nombre,
                aQuienId: payingEmployee.id,
                aQuienNombre: payingEmployee.empleado_nombre,
                monto: Number(payingEmployee.totalPagar.toFixed(2)),
                fecha: Timestamp.now(),
                local_id: payingEmployee.local_id || selectedLocalId || 'general',
                comentarios: `Pago de nómina (${payingEmployee.totalHoras.toFixed(2)} horas a $${tarifaHora}/hr)`,
                persona_entrega_id: user?.uid,
                persona_entrega_nombre: user?.displayName || user?.email,
                quienPagaId: selectedPayerId,
                quienPagaNombre: payerName,
                source: 'nomina',
            });

            // 2. Create payment record in pagos_nomina
            const pagoRef = doc(collection(db, 'pagos_nomina'));
            batch.set(pagoRef, {
                fecha: Timestamp.now(),
                empleado_id: payingEmployee.id,
                empleado_nombre: payingEmployee.empleado_nombre,
                local_id: payingEmployee.local_id || selectedLocalId || 'general',
                local_nombre: localName,
                quien_paga_id: selectedPayerId,
                quien_paga_nombre: payerName,
                horas_trabajadas: Number(payingEmployee.totalHoras.toFixed(2)),
                total_pagado: Number(payingEmployee.totalPagar.toFixed(2)),
                tarifa_hora: tarifaHora,
                sesiones_pagadas: payingEmployee.sessionIds.length,
                egreso_id: egresoRef.id,
            });

            // 3. Mark sessions as paid (reset hours counter)
            for (const sessionId of payingEmployee.sessionIds) {
                const sessionRef = doc(db, 'sesiones_trabajo', sessionId);
                batch.update(sessionRef, {
                    pagado: true,
                    pago_id: egresoRef.id,
                });
            }

            await batch.commit();

            toast({
                title: "Nómina pagada",
                description: `Se registró el pago de $${payingEmployee.totalPagar.toFixed(2)} para ${payingEmployee.empleado_nombre}.`,
            });

            setIsPaymentModalOpen(false);
            setManualHours(prev => {
                const updated = { ...prev };
                delete updated[payingEmployee.id];
                return updated;
            });
            setPayingEmployee(null);
            setSelectedPayerId('');
            setQueryKey(prev => prev + 1);

        } catch (error) {
            console.error("Error paying nomina:", error);
            toast({
                variant: "destructive",
                title: "Error al registrar el pago",
                description: "Ocurrió un problema al procesar el pago de nómina.",
            });
        } finally {
            setProcessingPayment(false);
        }
    };

    // Reset: mark ALL current unpaid sessions as cleared (start fresh)
    const handleResetAllSessions = async () => {
        if (resetAuthCode.trim().toUpperCase() !== 'REINICIAR') {
            toast({
                variant: 'destructive',
                title: 'Código incorrecto',
                description: 'El código de autorización no es válido.',
            });
            return;
        }
        setProcessingReset(true);
        try {
            const batch = writeBatch(db);
            const allSessionIds = sessions.map(s => s.id);

            for (const sessionId of allSessionIds) {
                const sessionRef = doc(db, 'sesiones_trabajo', sessionId);
                batch.update(sessionRef, {
                    pagado: true,
                    pago_id: 'reset_manual',
                });
            }

            await batch.commit();

            toast({
                title: "Contador reiniciado",
                description: `Se limpiaron ${allSessionIds.length} sesiones. El conteo comenzará desde cero.`,
            });

            setIsResetModalOpen(false);
            setResetAuthCode('');
            setQueryKey(prev => prev + 1);
        } catch (error) {
            console.error("Error resetting sessions:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "No se pudo reiniciar el contador.",
            });
        } finally {
            setProcessingReset(false);
        }
    };

    // Generate list of distinct months from history + past 12 months
    const availableMonths = useMemo(() => {
        const monthMap = new Map<string, string>();
        
        // 1. Add current month and past 11 months
        const now = new Date();
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = format(d, 'MMMM yyyy', { locale: es });
            const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
            monthMap.set(key, capitalized);
        }

        // 2. Add any additional month from paymentHistory that might be older
        paymentHistory.forEach(record => {
            if (record.fecha) {
                const date = record.fecha instanceof Timestamp ? record.fecha.toDate() : new Date(record.fecha);
                const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (!monthMap.has(key)) {
                    const label = format(date, 'MMMM yyyy', { locale: es });
                    const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
                    monthMap.set(key, capitalized);
                }
            }
        });

        // Sort descending (newest month first)
        return Array.from(monthMap.entries())
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([key, label]) => ({ key, label }));
    }, [paymentHistory]);

    const selectedMonthLabel = useMemo(() => {
        const found = availableMonths.find(m => m.key === customMonth);
        return found ? found.label : customMonth;
    }, [availableMonths, customMonth]);

    // Filtered payment history by month/period and search term
    const filteredHistory = useMemo(() => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
        const prevYear = prevMonthDate.getFullYear();
        const prevMonth = prevMonthDate.getMonth();

        return paymentHistory.filter(record => {
            if (!record.fecha) return false;
            const recordDate = record.fecha instanceof Timestamp ? record.fecha.toDate() : new Date(record.fecha);
            const recYear = recordDate.getFullYear();
            const recMonth = recordDate.getMonth();

            // 1. Period filter
            if (historyFilterMode === 'current_month') {
                if (recYear !== currentYear || recMonth !== currentMonth) return false;
            } else if (historyFilterMode === 'previous_month') {
                if (recYear !== prevYear || recMonth !== prevMonth) return false;
            } else if (historyFilterMode === 'custom_month') {
                if (customMonth) {
                    const [targetYear, targetMonth] = customMonth.split('-').map(Number);
                    if (recYear !== targetYear || (recMonth + 1) !== targetMonth) return false;
                }
            }

            // 2. Search filter
            if (historySearchTerm.trim()) {
                const query = historySearchTerm.toLowerCase();
                const matchesEmp = (record.empleado_nombre || '').toLowerCase().includes(query);
                const matchesLoc = (record.local_nombre || '').toLowerCase().includes(query);
                const matchesPayer = (record.quien_paga_nombre || '').toLowerCase().includes(query);
                if (!matchesEmp && !matchesLoc && !matchesPayer) return false;
            }

            return true;
        });
    }, [paymentHistory, historyFilterMode, customMonth, historySearchTerm]);

    // Period totals for summary badge
    const periodTotals = useMemo(() => {
        const totalMonto = filteredHistory.reduce((sum, r) => sum + (r.total_pagado || 0), 0);
        const totalHoras = filteredHistory.reduce((sum, r) => sum + (r.horas_trabajadas || 0), 0);
        const count = filteredHistory.length;
        return { totalMonto, totalHoras, count };
    }, [filteredHistory]);

    // Sorted and paginated payment history
    const sortedHistory = useMemo(() => {
        return [...filteredHistory].sort((a, b) => {
            const { key, direction } = historySortConfig;
            const dir = direction === 'asc' ? 1 : -1;

            if (key === 'fecha') {
                const dateA = a.fecha instanceof Timestamp ? a.fecha.toDate().getTime() : 0;
                const dateB = b.fecha instanceof Timestamp ? b.fecha.toDate().getTime() : 0;
                return (dateA - dateB) * dir;
            } else if (key === 'horas_trabajadas') {
                return (a.horas_trabajadas - b.horas_trabajadas) * dir;
            } else if (key === 'total_pagado') {
                return (a.total_pagado - b.total_pagado) * dir;
            } else {
                return ((a[key] || '').localeCompare(b[key] || '')) * dir;
            }
        });
    }, [filteredHistory, historySortConfig]);

    const totalHistoryPages = Math.ceil(sortedHistory.length / historyPerPage);
    const paginatedHistory = sortedHistory.slice(
        (historyPage - 1) * historyPerPage,
        historyPage * historyPerPage
    );

    const handleHistorySort = (key: PaymentSortKey) => {
        setHistorySortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // KPI calculations (only count employees with actual payable hours)
    const totalHorasPendientes = groupedData.reduce((sum, e) => sum + e.totalHoras, 0);
    const totalPorPagar = groupedData.reduce((sum, e) => sum + e.totalPagar, 0);
    const empleadosPendientes = groupedData.filter(e => e.unpaidSessions > 0).length;

    const SortableHeader = ({ label, sortKey }: { label: string; sortKey: PaymentSortKey }) => (
        <Button
            variant="ghost"
            className="h-auto p-0 font-medium text-xs hover:bg-transparent"
            onClick={() => handleHistorySort(sortKey)}
        >
            {label}
            <ArrowUpDown className={cn("ml-1 h-3 w-3", historySortConfig.key === sortKey ? "text-primary" : "text-muted-foreground/40")} />
        </Button>
    );

    return (
        <div className="flex-1 space-y-4 p-3 sm:p-6 pt-4 sm:pt-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/60">
                <div className="flex items-center gap-3">
                    <Wallet className="w-5 h-5 text-slate-300" />
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Nómina de Recepcionistas</h2>
                        <p className="text-xs text-muted-foreground hidden sm:block">Calcula y registra el pago de horas trabajadas y sesiones de turno.</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-muted/20 border border-border/60 rounded-xl px-2.5 py-1">
                        <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Tarifa/hr:</Label>
                        <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                            <Input
                                className="pl-5 w-20 h-7 text-xs bg-background border-border/60 text-right font-medium"
                                type="number"
                                value={tarifaHora}
                                onChange={(e) => setTarifaHora(Number(e.target.value))}
                                step="0.5"
                                min="0"
                            />
                        </div>
                    </div>
                    {sessions.length > 0 && (
                        <>
                            <div className="flex items-center gap-1.5 bg-muted/20 border border-border/60 rounded-xl px-2.5 py-1">
                                <Label htmlFor="round-toggle" className="text-xs font-medium cursor-pointer">Redondeo 30m</Label>
                                <input
                                    id="round-toggle"
                                    type="checkbox"
                                    className="accent-blue-500 h-3.5 w-3.5 cursor-pointer rounded"
                                    checked={roundHours}
                                    onChange={(e) => setRoundHours(e.target.checked)}
                                />
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsResetModalOpen(true)}
                                className="h-8 text-xs border-border/60 text-slate-400 hover:text-foreground"
                            >
                                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                                Reiniciar
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* KPI Cards: Franja compacta optimizada para móvil (3 columnas en una sola tarjeta sin scroll excesivo) */}
            <Card className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-2 sm:p-4">
                <div className="grid grid-cols-3 divide-x divide-border/60 items-center">
                    {/* Empleados pendientes */}
                    <div className="px-2 sm:px-4 flex items-center justify-between">
                        <div className="min-w-0">
                            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                                <span className="sm:hidden">Pendientes</span>
                                <span className="hidden sm:inline">Empleados pendientes</span>
                            </p>
                            <p className="text-sm sm:text-xl font-bold text-foreground mt-0.5">{empleadosPendientes}</p>
                        </div>
                        <Users className="h-5 w-5 text-blue-400 hidden sm:block shrink-0" />
                    </div>

                    {/* Total horas pendientes */}
                    <div className="px-2 sm:px-4 flex items-center justify-between">
                        <div className="min-w-0">
                            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                                <span className="sm:hidden">Horas pend.</span>
                                <span className="hidden sm:inline">Total horas pendientes</span>
                            </p>
                            <p className="text-sm sm:text-xl font-bold text-foreground mt-0.5">
                                {totalHorasPendientes.toFixed(2)} <span className="text-[10px] font-normal text-muted-foreground sm:text-xs">hrs</span>
                            </p>
                        </div>
                        <Clock className="h-5 w-5 text-blue-400 hidden sm:block shrink-0" />
                    </div>

                    {/* Total a liquidar */}
                    <div className="px-2 sm:px-4 flex items-center justify-between">
                        <div className="min-w-0">
                            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                                <span className="sm:hidden">Por liquidar</span>
                                <span className="hidden sm:inline">Total a liquidar</span>
                            </p>
                            <p className="text-sm sm:text-xl font-bold text-blue-400 mt-0.5 truncate">
                                ${totalPorPagar.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                        <Banknote className="h-5 w-5 text-blue-400 hidden sm:block shrink-0" />
                    </div>
                </div>
            </Card>

            {/* Hours Summary Table */}
            <Card className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden">
                <CardHeader className="p-3 sm:p-4 border-b border-border/60">
                    <CardTitle className="text-sm font-semibold">Horas Pendientes de Pago</CardTitle>
                    <CardDescription className="text-[11px] text-muted-foreground hidden sm:block">
                        Sesiones de trabajo cerradas acumuladas listas para liquidar.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                    <TableHead className="py-1 px-3 text-xs font-semibold">Empleado</TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold hidden md:table-cell">Rol</TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold hidden sm:table-cell">Sucursal</TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold text-right">Horas</TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold text-right">Total a Pagar</TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold text-center hidden sm:table-cell">Estado</TableHead>
                                    <TableHead className="py-1 px-2 text-xs font-semibold text-center">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {groupedData.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                                            No hay horas pendientes de pago. ¡Todo al corriente!
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    groupedData.map((employee) => (
                                        <TableRow key={employee.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                            <TableCell className="py-1.5 px-3 text-xs font-semibold text-foreground truncate max-w-[140px] sm:max-w-none">
                                                {employee.empleado_nombre}
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs text-muted-foreground hidden md:table-cell">{employee.roles.join(', ')}</TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs text-muted-foreground hidden sm:table-cell">{getLocalName(employee.local_id)}</TableCell>
                                            <TableCell className="py-1.5 px-3 text-right">
                                                <div className="flex flex-col items-end gap-0.5">
                                                    <div className="flex items-center gap-1">
                                                        <Input
                                                            type="number"
                                                            className={cn(
                                                                "w-16 h-6 text-right px-1 text-xs font-medium bg-background border-border/60",
                                                                employee.isManual && "border-blue-500 bg-blue-500/10 text-blue-400"
                                                            )}
                                                            value={employee.totalHoras.toString()}
                                                            onChange={(e) => handleManualHoursChange(employee.id, e.target.value)}
                                                            onBlur={(e) => {
                                                                if (e.target.value === '' || isNaN(parseFloat(e.target.value))) {
                                                                    handleManualHoursChange(employee.id, '');
                                                                }
                                                            }}
                                                            step="0.01"
                                                        />
                                                        <span className="text-[10px] text-muted-foreground">hrs</span>
                                                    </div>
                                                    {employee.isManual && (
                                                        <button
                                                            type="button"
                                                            className="text-[9px] text-blue-400 hover:underline"
                                                            onClick={() => handleManualHoursChange(employee.id, '')}
                                                        >
                                                            Restaurar ({employee.totalHorasCalculadas.toFixed(2)})
                                                        </button>
                                                    )}
                                                    {!employee.isManual && roundHours && (
                                                        <span className="text-[9px] text-muted-foreground">
                                                            Real: {employee.totalHorasReal.toFixed(2)}h
                                                        </span>
                                                    )}
                                                    {employee.unpaidSessions > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenSessionDetails(employee.id, employee.empleado_nombre)}
                                                            className="text-[9px] text-blue-400 hover:underline font-semibold"
                                                        >
                                                            Ver {employee.unpaidSessions} sesión(es)
                                                        </button>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-right text-xs font-semibold text-foreground">
                                                ${employee.totalPagar.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-center hidden sm:table-cell">
                                                {employee.unclosedSessions > 0 ? (
                                                    <Badge 
                                                        variant="outline" 
                                                        className="text-[10px] cursor-pointer border-blue-500/40 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-colors flex items-center justify-center gap-1 mx-auto w-fit py-0 px-2 h-5"
                                                        onClick={() => handleOpenSessionDetails(employee.id, employee.empleado_nombre)}
                                                    >
                                                        <Clock className="h-2.5 w-2.5 animate-pulse" />
                                                        {employee.unclosedSessions} abierta(s)
                                                    </Badge>
                                                ) : employee.unpaidSessions > 0 ? (
                                                    <Badge 
                                                        variant="outline" 
                                                        className="text-[10px] cursor-pointer border-border/60 text-muted-foreground hover:bg-muted/40 transition-colors py-0 px-2 h-5"
                                                        onClick={() => handleOpenSessionDetails(employee.id, employee.empleado_nombre)}
                                                    >
                                                        Listo
                                                    </Badge>
                                                ) : (
                                                    <span className="text-[10px] text-muted-foreground">Al corriente</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-1.5 px-2 text-center">
                                                {employee.unpaidSessions > 0 && employee.totalPagar > 0 ? (
                                                    <Button
                                                        variant="alfa"
                                                        size="sm"
                                                        className="h-7 text-xs px-2.5"
                                                        onClick={() => handleOpenPayment(employee)}
                                                    >
                                                        <DollarSign className="mr-0.5 h-3 w-3" />
                                                        Pagar
                                                    </Button>
                                                ) : (
                                                    <span className="text-[10px] text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Payment History Table */}
            <Card className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden">
                <CardHeader className="p-3 sm:p-4 border-b border-border/60">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <CardTitle className="text-sm font-semibold text-foreground">Historial de Pagos</CardTitle>
                                <Badge variant="outline" className="border-border/60 text-muted-foreground text-[10px] py-0 px-2 h-5 font-sans">
                                    {periodTotals.count} {periodTotals.count === 1 ? 'pago' : 'pagos'}
                                </Badge>
                                {periodTotals.count > 0 && (
                                    <span className="text-xs font-semibold text-blue-400">
                                        Total: ${periodTotals.totalMonto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                )}
                            </div>
                            <CardDescription className="text-[11px] text-muted-foreground mt-0.5">
                                {historyFilterMode === 'current_month' && `Mostrando pagos del mes en curso (${format(new Date(), 'MMMM yyyy', { locale: es })}).`}
                                {historyFilterMode === 'previous_month' && 'Mostrando pagos del mes anterior.'}
                                {historyFilterMode === 'custom_month' && `Mostrando pagos de ${selectedMonthLabel}.`}
                                {historyFilterMode === 'all' && 'Mostrando todo el historial cronológico de pagos.'}
                            </CardDescription>
                        </div>

                        {/* Filtros de periodo y búsqueda */}
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Selector de periodo rápido */}
                            <div className="flex items-center bg-muted/40 p-0.5 border border-border/60 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => { setHistoryFilterMode('current_month'); setHistoryPage(1); }}
                                    className={cn(
                                        "px-2.5 py-1 text-xs rounded-lg font-medium transition-colors",
                                        historyFilterMode === 'current_month'
                                            ? "bg-background text-foreground shadow-sm font-semibold"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Mes en curso
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setHistoryFilterMode('previous_month'); setHistoryPage(1); }}
                                    className={cn(
                                        "px-2.5 py-1 text-xs rounded-lg font-medium transition-colors",
                                        historyFilterMode === 'previous_month'
                                            ? "bg-background text-foreground shadow-sm font-semibold"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Mes anterior
                                </button>
                                {/* Dropdown de selección de mes */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            type="button"
                                            className={cn(
                                                "px-2.5 py-1 text-xs rounded-lg font-medium transition-colors flex items-center gap-1",
                                                historyFilterMode === 'custom_month'
                                                    ? "bg-background text-foreground shadow-sm font-semibold"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            <span>{historyFilterMode === 'custom_month' ? selectedMonthLabel : 'Elegir mes'}</span>
                                            <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                        align="end"
                                        className="w-48 max-h-60 overflow-y-auto border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] p-1 bg-card"
                                    >
                                        {availableMonths.map((m) => (
                                            <DropdownMenuItem
                                                key={m.key}
                                                onClick={() => {
                                                    setCustomMonth(m.key);
                                                    setHistoryFilterMode('custom_month');
                                                    setHistoryPage(1);
                                                }}
                                                className={cn(
                                                    "text-xs px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center justify-between",
                                                    historyFilterMode === 'custom_month' && customMonth === m.key
                                                        ? "bg-blue-500/10 text-blue-400 font-semibold"
                                                        : "text-foreground hover:bg-muted/30"
                                                )}
                                            >
                                                <span>{m.label}</span>
                                                {historyFilterMode === 'custom_month' && customMonth === m.key && (
                                                    <span className="text-[10px] text-blue-400 font-bold">✓</span>
                                                )}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                <button
                                    type="button"
                                    onClick={() => { setHistoryFilterMode('all'); setHistoryPage(1); }}
                                    className={cn(
                                        "px-2.5 py-1 text-xs rounded-lg font-medium transition-colors",
                                        historyFilterMode === 'all'
                                            ? "bg-background text-foreground shadow-sm font-semibold"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Todos
                                </button>
                            </div>

                            {/* Buscador de empleado */}
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar..."
                                    value={historySearchTerm}
                                    onChange={(e) => { setHistorySearchTerm(e.target.value); setHistoryPage(1); }}
                                    className="h-8 pl-8 pr-7 text-xs bg-background border-border/60 w-32 sm:w-40 rounded-xl font-sans"
                                />
                                {historySearchTerm && (
                                    <button
                                        type="button"
                                        onClick={() => setHistorySearchTerm('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loadingHistory ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            <Table>
                                <TableHeader>
                                    <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                        <TableHead className="py-1 px-3 text-xs font-semibold"><SortableHeader label="Fecha" sortKey="fecha" /></TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold"><SortableHeader label="Quién recibe" sortKey="empleado_nombre" /></TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold hidden sm:table-cell"><SortableHeader label="Sucursal" sortKey="local_nombre" /></TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold hidden md:table-cell"><SortableHeader label="Quién paga" sortKey="quien_paga_nombre" /></TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-right hidden sm:table-cell"><SortableHeader label="Horas" sortKey="horas_trabajadas" /></TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-right"><SortableHeader label="Total Pagado" sortKey="total_pagado" /></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedHistory.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                                                <div className="flex flex-col items-center justify-center gap-2">
                                                    <p>No hay pagos registrados en este periodo.</p>
                                                    {historyFilterMode !== 'all' && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => { setHistoryFilterMode('all'); setHistoryPage(1); }}
                                                            className="h-7 text-xs border-border/60 text-blue-400 hover:text-blue-300"
                                                        >
                                                            Ver todo el historial completo
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        paginatedHistory.map((record) => (
                                            <TableRow key={record.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                                <TableCell className="py-1.5 px-3 text-xs whitespace-nowrap text-muted-foreground">
                                                    {record.fecha instanceof Timestamp
                                                        ? format(record.fecha.toDate(), 'dd/MM/yyyy HH:mm', { locale: es })
                                                        : 'N/A'
                                                    }
                                                </TableCell>
                                                <TableCell className="py-1.5 px-3 text-xs font-medium text-foreground truncate max-w-[140px] sm:max-w-none">
                                                    {record.empleado_nombre}
                                                </TableCell>
                                                <TableCell className="py-1.5 px-3 text-xs text-muted-foreground hidden sm:table-cell">{record.local_nombre}</TableCell>
                                                <TableCell className="py-1.5 px-3 text-xs text-muted-foreground hidden md:table-cell">{record.quien_paga_nombre}</TableCell>
                                                <TableCell className="py-1.5 px-3 text-xs text-right text-muted-foreground hidden sm:table-cell">{record.horas_trabajadas.toFixed(2)} hrs</TableCell>
                                                <TableCell className="py-1.5 px-3 text-xs text-right font-semibold text-foreground">
                                                    ${record.total_pagado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>

                            {/* Single-line Compact Pagination */}
                            {sortedHistory.length > 0 && (
                                <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-t border-border/60 text-xs bg-muted/10">
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground text-[11px]">Por página:</span>
                                        <Select value={String(historyPerPage)} onValueChange={(val) => { setHistoryPerPage(Number(val)); setHistoryPage(1); }}>
                                            <SelectTrigger className="w-[65px] h-7 text-xs border-border/60 bg-background">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="border-2 border-blue-500 rounded-xl">
                                                <SelectItem value="10">10</SelectItem>
                                                <SelectItem value="25">25</SelectItem>
                                                <SelectItem value="50">50</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground text-[11px]">
                                            Pág. {historyPage} de {totalHistoryPages || 1}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs border-border/60" disabled={historyPage <= 1} onClick={() => setHistoryPage(p => p - 1)}>
                                                <ChevronLeft className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs border-border/60" disabled={historyPage >= totalHistoryPages} onClick={() => setHistoryPage(p => p + 1)}>
                                                <ChevronRight className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* ── Modal 1: Registrar Pago de Nómina ── */}
            <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
                <DialogContent hideCloseButton={true} className="sm:max-w-md p-0 overflow-hidden border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card">
                    {/* Cabecera Oficial VATOS ALFA */}
                    <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 border-b border-border/60">
                        <div className="header-light-beam" />
                        <div className="relative z-10 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Banknote className="h-5 w-5 text-slate-300" />
                                <div>
                                    <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                                        Registrar Pago de Nómina
                                    </DialogTitle>
                                    <p className="text-xs text-slate-300">
                                        Confirma la liquidación y selecciona quién autoriza el desembolso.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsPaymentModalOpen(false)}
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {payingEmployee && (
                        <div className="p-4 sm:p-5 space-y-4">
                            <div className="rounded-xl border border-border/60 bg-muted/10 p-3.5 space-y-2">
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Empleado:</span>
                                    <span className="font-semibold text-foreground">{payingEmployee.empleado_nombre}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Horas trabajadas:</span>
                                    <span className="font-medium text-foreground">{payingEmployee.totalHoras.toFixed(2)} hrs</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Tarifa por hora:</span>
                                    <span className="font-medium text-foreground">${tarifaHora}/hr</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Sesiones liquidadas:</span>
                                    <span className="font-medium text-foreground">{payingEmployee.unpaidSessions}</span>
                                </div>
                                <div className="border-t border-border/60 pt-2 flex justify-between items-center">
                                    <span className="font-semibold text-xs text-foreground">Total a Pagar:</span>
                                    <span className="font-bold text-base text-blue-400">
                                        ${payingEmployee.totalPagar.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-foreground">¿Quién autoriza el pago?</Label>
                                <Select value={selectedPayerId} onValueChange={setSelectedPayerId}>
                                    <SelectTrigger className="h-9 text-xs border-border/60 bg-background">
                                        <SelectValue placeholder="Selecciona quién autoriza el pago" />
                                    </SelectTrigger>
                                    <SelectContent className="border-2 border-blue-500 rounded-xl">
                                        {adminsDisponibles.map(admin => (
                                            <SelectItem key={admin.id} value={admin.id} className="text-xs">
                                                {admin.name}{' '}
                                                <span className="text-muted-foreground text-[10px]">
                                                    ({admin.role === 'Administrador general' ? 'Admin General' : 'Admin Local'})
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    <div className="p-3 sm:p-4 border-t border-border/60 flex items-center justify-end gap-2 bg-muted/20">
                        <Button variant="ghost" size="sm" onClick={() => setIsPaymentModalOpen(false)} disabled={processingPayment} className="text-xs h-8">
                            Cancelar
                        </Button>
                        <Button
                            variant="alfa"
                            size="sm"
                            onClick={handlePayNomina}
                            disabled={processingPayment || !selectedPayerId}
                            className="text-xs h-8"
                        >
                            {processingPayment ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                            Confirmar Pago
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Modal 2: Reset Modal ── */}
            <Dialog open={isResetModalOpen} onOpenChange={setIsResetModalOpen}>
                <DialogContent hideCloseButton={true} className="sm:max-w-md p-0 overflow-hidden border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card">
                    {/* Cabecera Oficial VATOS ALFA */}
                    <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 border-b border-border/60">
                        <div className="header-light-beam" />
                        <div className="relative z-10 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <RotateCcw className="h-5 w-5 text-slate-300" />
                                <div>
                                    <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                                        Reiniciar Contador de Horas
                                    </DialogTitle>
                                    <p className="text-xs text-slate-300">
                                        Limpia las sesiones acumuladas para comenzar un nuevo ciclo.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setIsResetModalOpen(false); setResetAuthCode(''); }}
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <div className="p-4 sm:p-5 space-y-3">
                        <div className="text-xs text-muted-foreground rounded-xl border border-border/60 bg-muted/10 p-3 leading-relaxed">
                            Esta acción marcará todas las sesiones actuales ({sessions.length} sesiones) como liquidadas
                            <strong className="text-foreground"> sin generar un egreso ni un registro de pago</strong>. Úsalo solo para empezar el conteo desde cero.
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-foreground">
                                Escribe <strong className="text-blue-400">REINICIAR</strong> para confirmar:
                            </Label>
                            <Input
                                value={resetAuthCode}
                                onChange={(e) => setResetAuthCode(e.target.value)}
                                placeholder="Escribe REINICIAR"
                                className={cn(
                                    "h-8 text-xs bg-background border-border/60 font-mono",
                                    resetAuthCode.length > 0 &&
                                    resetAuthCode.trim().toUpperCase() !== 'REINICIAR'
                                        ? 'border-destructive'
                                        : ''
                                )}
                            />
                        </div>
                    </div>

                    <div className="p-3 sm:p-4 border-t border-border/60 flex items-center justify-end gap-2 bg-muted/20">
                        <Button variant="ghost" size="sm" onClick={() => { setIsResetModalOpen(false); setResetAuthCode(''); }} disabled={processingReset} className="text-xs h-8">
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleResetAllSessions}
                            disabled={processingReset || resetAuthCode.trim().toUpperCase() !== 'REINICIAR'}
                            className="text-xs h-8"
                        >
                            {processingReset ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
                            Sí, reiniciar desde cero
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Modal 3: Sessions Details Modal ── */}
            <Dialog open={isSessionsModalOpen} onOpenChange={setIsSessionsModalOpen}>
                <DialogContent hideCloseButton={true} className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card">
                    {/* Cabecera Oficial VATOS ALFA */}
                    <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 sm:p-5 border-b border-border/60 shrink-0">
                        <div className="header-light-beam" />
                        <div className="relative z-10 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Clock className="h-5 w-5 text-slate-300" />
                                <div>
                                    <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                                        Detalle de Sesiones — {selectedEmployeeSessions?.name}
                                    </DialogTitle>
                                    <p className="text-xs text-slate-300">
                                        Listado de sesiones de trabajo no liquidadas.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsSessionsModalOpen(false)}
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-0 max-h-[55vh]">
                        <Table>
                            <TableHeader>
                                <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                    <TableHead className="py-1 px-3 text-xs font-semibold">Fecha</TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold">Entrada</TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold">Salida</TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold text-right">Duración</TableHead>
                                    <TableHead className="py-1 px-3 text-xs font-semibold text-center">Estado</TableHead>
                                    <TableHead className="py-1 px-2 text-xs font-semibold text-center">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {!selectedEmployeeSessions?.sessions || selectedEmployeeSessions.sessions.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                                            No hay sesiones registradas para este empleado.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    [...selectedEmployeeSessions.sessions]
                                        .sort((a, b) => {
                                            const timeA = a.hora_entrada ? a.hora_entrada.toDate().getTime() : 0;
                                            const timeB = b.hora_entrada ? b.hora_entrada.toDate().getTime() : 0;
                                            return timeB - timeA;
                                        })
                                        .map((session) => {
                                            const hasSalida = !!session.hora_salida;
                                            const entradaDate = session.hora_entrada?.toDate();
                                            const today = new Date();
                                            const isCurrentlyActive = !session.hora_salida && entradaDate && 
                                              entradaDate.getDate() === today.getDate() && 
                                              entradaDate.getMonth() === today.getMonth() && 
                                              entradaDate.getFullYear() === today.getFullYear();
                                            
                                            const showAsClosed = hasSalida || (!isCurrentlyActive && !!session.ultima_actividad);
                                            const hasHeartbeat = !!session.ultima_actividad;
                                            
                                            return (
                                                <TableRow key={session.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                                    <TableCell className="py-1.5 px-3 text-xs font-medium">
                                                        {entradaDate ? format(entradaDate, 'dd/MM/yyyy', { locale: es }) : 'N/A'}
                                                    </TableCell>
                                                    <TableCell className="py-1.5 px-3 text-xs text-muted-foreground">
                                                        {entradaDate ? format(entradaDate, 'HH:mm:ss') : 'N/A'}
                                                    </TableCell>
                                                    <TableCell className="py-1.5 px-3 text-xs text-muted-foreground">
                                                        {hasSalida && session.hora_salida ? (
                                                            format(session.hora_salida.toDate(), 'HH:mm:ss')
                                                        ) : isCurrentlyActive ? (
                                                            <span className="text-blue-400 font-medium">En curso</span>
                                                        ) : session.ultima_actividad ? (
                                                            <span className="text-muted-foreground font-medium" title={`Cierre automático (último latido: ${format(session.ultima_actividad.toDate(), 'HH:mm:ss')})`}>
                                                                {format(session.ultima_actividad.toDate(), 'HH:mm:ss')} (Auto)
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground font-medium">Falta salida</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="py-1.5 px-3 text-xs text-right font-medium">
                                                        {showAsClosed ? (
                                                            getSessionDuration(session)
                                                        ) : (
                                                            <span className="text-muted-foreground">-</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="py-1.5 px-3 text-center">
                                                        {hasSalida ? (
                                                            <Badge variant="outline" className="border-border/60 text-muted-foreground text-[10px] py-0 px-2 h-5">
                                                                Cerrada
                                                            </Badge>
                                                        ) : isCurrentlyActive ? (
                                                            <Badge variant="outline" className="animate-pulse border-blue-500/40 text-blue-400 bg-blue-500/10 text-[10px] py-0 px-2 h-5">
                                                                En curso
                                                            </Badge>
                                                        ) : hasHeartbeat ? (
                                                            <Badge variant="outline" className="border-border/60 text-muted-foreground text-[10px] py-0 px-2 h-5" title="Sesión auto-cerrada al final del día">
                                                                Cerrada (Auto)
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/60 py-0 px-2 h-5">
                                                                Falta salida
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="py-1.5 px-2 text-center">
                                                        {isCurrentlyActive ? (
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                className="h-6 px-2 text-[10px] text-blue-400 border-blue-500/40 hover:bg-blue-500/10 font-semibold"
                                                                onClick={() => handleForceCloseSession(session.id, selectedEmployeeSessions?.name || 'Empleado')}
                                                            >
                                                                Cerrar turno
                                                            </Button>
                                                        ) : (!hasSalida && !hasHeartbeat) ? (
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                className="h-6 px-2 text-[10px] text-blue-400 border-blue-500/40 hover:bg-blue-500/10 font-semibold"
                                                                onClick={() => handleForceCloseSession(session.id, selectedEmployeeSessions?.name || 'Empleado')}
                                                            >
                                                                Forzar Salida
                                                            </Button>
                                                        ) : (
                                                            <span className="text-muted-foreground text-xs">-</span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="p-3 sm:p-4 border-t border-border/60 flex items-center justify-end bg-muted/20 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => setIsSessionsModalOpen(false)} className="text-xs h-8">
                            Cerrar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
