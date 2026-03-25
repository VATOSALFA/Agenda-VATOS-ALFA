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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Timestamp, collection, query, getDocs, writeBatch, doc, orderBy } from 'firebase/firestore';
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

    // Payment modal state
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [payingEmployee, setPayingEmployee] = useState<any | null>(null);
    const [selectedPayerId, setSelectedPayerId] = useState('');
    const [processingPayment, setProcessingPayment] = useState(false);

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

            if (!session.hora_salida) {
                grouped[id].unclosedSessions++;
            } else {
                const start = session.hora_entrada?.toDate();
                const end = session.hora_salida?.toDate();
                if (start && end) {
                    const mins = differenceInMinutes(end, start);
                    grouped[id].totalMinutos += mins;
                    grouped[id].unpaidSessions++;
                    grouped[id].sessionIds.push(session.id);
                }
            }
        });

        return Object.entries(grouped).map(([id, data]) => ({
            id,
            ...data,
            totalHoras: data.totalMinutos / 60,
            totalPagar: (data.totalMinutos / 60) * tarifaHora
        })).filter(u => u.roles.includes('Recepcionista') || u.roles.includes('Administrador local'));
    }, [sessions, tarifaHora]);

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

    // Sorted and paginated payment history
    const sortedHistory = useMemo(() => {
        return [...paymentHistory].sort((a, b) => {
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
    }, [paymentHistory, historySortConfig]);

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
        <div className="flex flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Nómina de Recepcionistas</h1>
                    <p className="text-muted-foreground">Calcula y registra el pago de horas trabajadas.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Label className="text-sm font-medium whitespace-nowrap">Tarifa por Hora</Label>
                    <div className="relative">
                        <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            className="pl-9 w-32"
                            type="number"
                            value={tarifaHora}
                            onChange={(e) => setTarifaHora(Number(e.target.value))}
                            step="0.5"
                            min="0"
                        />
                    </div>
                    {sessions.length > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsResetModalOpen(true)}
                            className="text-muted-foreground"
                        >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Reiniciar contador
                        </Button>
                    )}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-2 bg-muted rounded-lg">
                            <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Empleados con horas pendientes</p>
                            <p className="text-2xl font-bold">{empleadosPendientes}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-2 bg-muted rounded-lg">
                            <Clock className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Total horas pendientes</p>
                            <p className="text-2xl font-bold">{totalHorasPendientes.toFixed(2)} hrs</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-2 bg-muted rounded-lg">
                            <Banknote className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Total por pagar</p>
                            <p className="text-2xl font-bold">${totalPorPagar.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Hours Summary Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Horas Pendientes de Pago</CardTitle>
                    <CardDescription>Sesiones cerradas que aún no han sido pagadas.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Empleado</TableHead>
                                        <TableHead>Rol</TableHead>
                                        <TableHead>Sucursal</TableHead>
                                        <TableHead className="text-right">Horas Trabajadas</TableHead>
                                        <TableHead className="text-right">Total a Pagar</TableHead>
                                        <TableHead className="text-center">Estado</TableHead>
                                        <TableHead className="text-center">Acción</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {groupedData.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                                No hay horas pendientes de pago. ¡Todo al corriente!
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        groupedData.map((employee) => (
                                            <TableRow key={employee.id}>
                                                <TableCell className="font-medium">{employee.empleado_nombre}</TableCell>
                                                <TableCell>{employee.roles.join(', ')}</TableCell>
                                                <TableCell>{getLocalName(employee.local_id)}</TableCell>
                                                <TableCell className="text-right">
                                                    {employee.totalHoras.toFixed(2)} hrs
                                                    {employee.unpaidSessions > 0 && (
                                                        <span className="text-xs text-muted-foreground block">
                                                            ({employee.unpaidSessions} sesiones)
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right font-semibold">
                                                    ${employee.totalPagar.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {employee.unclosedSessions > 0 ? (
                                                        <Badge variant="secondary" className="text-xs">
                                                            {employee.unclosedSessions} sesión(es) abierta(s)
                                                        </Badge>
                                                    ) : employee.unpaidSessions > 0 ? (
                                                        <Badge variant="outline" className="text-xs">
                                                            Listo para pagar
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">Sin horas</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {employee.unpaidSessions > 0 && employee.totalPagar > 0 && (
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleOpenPayment(employee)}
                                                        >
                                                            <DollarSign className="mr-1 h-3 w-3" />
                                                            Pagar
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Payment History Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Historial de Pagos</CardTitle>
                    <CardDescription>Registro de todos los pagos de nómina realizados.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loadingHistory ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead><SortableHeader label="Fecha" sortKey="fecha" /></TableHead>
                                            <TableHead><SortableHeader label="Quién recibe" sortKey="empleado_nombre" /></TableHead>
                                            <TableHead><SortableHeader label="Sucursal" sortKey="local_nombre" /></TableHead>
                                            <TableHead><SortableHeader label="Quién paga" sortKey="quien_paga_nombre" /></TableHead>
                                            <TableHead className="text-right"><SortableHeader label="Horas" sortKey="horas_trabajadas" /></TableHead>
                                            <TableHead className="text-right"><SortableHeader label="Total Pagado" sortKey="total_pagado" /></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedHistory.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                                    No hay pagos registrados aún.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            paginatedHistory.map((record) => (
                                                <TableRow key={record.id}>
                                                    <TableCell className="whitespace-nowrap">
                                                        {record.fecha instanceof Timestamp
                                                            ? format(record.fecha.toDate(), 'dd/MM/yyyy HH:mm', { locale: es })
                                                            : 'Fecha inválida'
                                                        }
                                                    </TableCell>
                                                    <TableCell className="font-medium">{record.empleado_nombre}</TableCell>
                                                    <TableCell>{record.local_nombre}</TableCell>
                                                    <TableCell>{record.quien_paga_nombre}</TableCell>
                                                    <TableCell className="text-right">{record.horas_trabajadas.toFixed(2)} hrs</TableCell>
                                                    <TableCell className="text-right font-semibold">
                                                        ${record.total_pagado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Pagination */}
                            {sortedHistory.length > 0 && (
                                <div className="flex items-center justify-end gap-4 mt-4 text-sm">
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground">Por página</span>
                                        <Select value={String(historyPerPage)} onValueChange={(val) => { setHistoryPerPage(Number(val)); setHistoryPage(1); }}>
                                            <SelectTrigger className="w-[70px] h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="10">10</SelectItem>
                                                <SelectItem value="25">25</SelectItem>
                                                <SelectItem value="50">50</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <span className="text-muted-foreground">
                                        Página {historyPage} de {totalHistoryPages || 1}
                                    </span>
                                    <div className="flex gap-1">
                                        <Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage(p => p - 1)}>
                                            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                                        </Button>
                                        <Button variant="outline" size="sm" disabled={historyPage >= totalHistoryPages} onClick={() => setHistoryPage(p => p + 1)}>
                                            Siguiente <ChevronRight className="h-4 w-4 ml-1" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* ── Pay Modal ── */}
            <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Registrar Pago de Nómina</DialogTitle>
                        <DialogDescription>
                            Confirma el pago y selecciona quién autoriza.
                        </DialogDescription>
                    </DialogHeader>

                    {payingEmployee && (
                        <div className="space-y-4 py-4">
                            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Empleado:</span>
                                    <span className="font-semibold">{payingEmployee.empleado_nombre}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Horas trabajadas:</span>
                                    <span className="font-medium">{payingEmployee.totalHoras.toFixed(2)} hrs</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Tarifa:</span>
                                    <span className="font-medium">${tarifaHora}/hr</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Sesiones:</span>
                                    <span className="font-medium">{payingEmployee.unpaidSessions}</span>
                                </div>
                                <div className="border-t pt-2 flex justify-between">
                                    <span className="font-semibold">Total a Pagar:</span>
                                    <span className="font-bold text-lg">
                                        ${payingEmployee.totalPagar.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-medium">¿Quién paga?</Label>
                                <Select value={selectedPayerId} onValueChange={setSelectedPayerId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona quién autoriza el pago" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {adminsDisponibles.map(admin => (
                                            <SelectItem key={admin.id} value={admin.id}>
                                                {admin.name}{' '}
                                                <span className="text-muted-foreground text-xs">
                                                    ({admin.role === 'Administrador general' ? 'Admin General' : 'Admin Local'})
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPaymentModalOpen(false)} disabled={processingPayment}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handlePayNomina}
                            disabled={processingPayment || !selectedPayerId}
                        >
                            {processingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                            Confirmar Pago
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Reset Modal ── */}
            <Dialog open={isResetModalOpen} onOpenChange={setIsResetModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                            Reiniciar contador de horas
                        </DialogTitle>
                        <DialogDescription>
                            Esta acción marcará todas las sesiones actuales ({sessions.length} sesiones) como liquidadas
                            <strong> sin generar un egreso ni un registro de pago</strong>. Úsalo solo para empezar el conteo desde cero.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2 text-sm text-muted-foreground rounded-md border bg-muted/50 p-3">
                        Se limpiarán <strong>{sessions.length} sesiones</strong> de los empleados:
                        <ul className="mt-1 ml-4 list-disc">
                            {groupedData.map(e => (
                                <li key={e.id}>{e.empleado_nombre} — {e.totalHoras.toFixed(2)} hrs</li>
                            ))}
                        </ul>
                    </div>

                    {/* Authorization code */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">
                            Código de autorización
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            Escribe <strong>REINICIAR</strong> para confirmar esta acción.
                        </p>
                        <Input
                            value={resetAuthCode}
                            onChange={(e) => setResetAuthCode(e.target.value)}
                            placeholder="Escribe REINICIAR para confirmar"
                            className={cn(
                                resetAuthCode.length > 0 &&
                                resetAuthCode.trim().toUpperCase() !== 'REINICIAR'
                                    ? 'border-destructive'
                                    : ''
                            )}
                        />
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setIsResetModalOpen(false); setResetAuthCode(''); }} disabled={processingReset}>
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleResetAllSessions}
                            disabled={processingReset || resetAuthCode.trim().toUpperCase() !== 'REINICIAR'}
                        >
                            {processingReset ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                            Sí, reiniciar desde cero
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
