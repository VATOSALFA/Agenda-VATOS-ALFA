'use client';

import { useState, useMemo, useEffect } from 'react';
import type { DateRange } from 'react-day-picker';
import { format, startOfWeek, endOfWeek, differenceInMinutes } from 'date-fns';
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
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Calendar as CalendarIcon,
    Search,
    Download,
    Loader2,
    DollarSign,
    Settings,
    CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Timestamp, collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { useAuth } from '@/contexts/firebase-auth-context';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

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

export default function NominaPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    
    // Default to current week
    const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
        const today = new Date();
        return {
            from: startOfWeek(today, { weekStartsOn: 1 }),
            to: endOfWeek(today, { weekStartsOn: 1 })
        };
    });
    
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const [tarifaHora, setTarifaHora] = useState(35.5);
    const [loading, setLoading] = useState(false);
    const [sessions, setSessions] = useState<WorkSession[]>([]);
    
    const [selectedUsersInfo, setSelectedUsersInfo] = useState<Record<string, boolean>>({});
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [processingPayment, setProcessingPayment] = useState(false);

    const handleDateSelect = (range: DateRange | undefined) => {
        setDateRange(range);
        if (range?.from && range?.to) {
            setIsPopoverOpen(false);
        }
    };

    const fetchSessions = async () => {
        if (!dateRange?.from || !dateRange?.to) return;
        setLoading(true);
        try {
            const sessionsRef = collection(db, 'sesiones_trabajo');
            const q = query(
                sessionsRef,
                where('hora_entrada', '>=', Timestamp.fromDate(dateRange.from)),
                where('hora_entrada', '<=', Timestamp.fromDate(dateRange.to))
            );
            const querySnapshot = await getDocs(q);
            const fetchedSessions: WorkSession[] = [];
            querySnapshot.forEach((doc) => {
                fetchedSessions.push({ id: doc.id, ...doc.data() } as WorkSession);
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
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    const groupedData = useMemo(() => {
        const grouped: Record<string, { empleado_nombre: string; roles: string[]; totalMinutos: number; unclosedSessions: number; paidSessions: number; unpaidSessions: number; sessionIds: string[] }> = {};
        
        sessions.forEach(session => {
            const id = session.empleado_id;
            if (!grouped[id]) {
                grouped[id] = {
                    empleado_nombre: session.empleado_nombre,
                    roles: [],
                    totalMinutos: 0,
                    unclosedSessions: 0,
                    paidSessions: 0,
                    unpaidSessions: 0,
                    sessionIds: []
                };
            }
            
            if (!grouped[id].roles.includes(session.rol)) {
                grouped[id].roles.push(session.rol);
            }
            
            if (session.pagado) {
                grouped[id].paidSessions++;
            } else {
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
            }
        });
        
        return Object.entries(grouped).map(([id, data]) => ({
            id,
            ...data,
            totalHoras: data.totalMinutos / 60,
            totalPagar: (data.totalMinutos / 60) * tarifaHora
        })).filter(user => user.roles.includes('Recepcionista') || user.roles.includes('Administrador local')); // Show only relevant roles
    }, [sessions, tarifaHora]);

    const handleSelectAll = (checked: boolean) => {
        const newSelected: Record<string, boolean> = {};
        if (checked) {
            groupedData.forEach(user => {
                if (user.unpaidSessions > 0) {
                    newSelected[user.id] = true;
                }
            });
        }
        setSelectedUsersInfo(newSelected);
    };

    const handleSelectUser = (userId: string, checked: boolean) => {
        setSelectedUsersInfo(prev => ({
            ...prev,
            [userId]: checked
        }));
    };

    const selectedUsersList = groupedData.filter(u => selectedUsersInfo[u.id] && u.unpaidSessions > 0);
    const totalSelectedToPay = selectedUsersList.reduce((acc, user) => acc + user.totalPagar, 0);

    const handlePayNomina = async () => {
        if (selectedUsersList.length === 0) return;
        setProcessingPayment(true);
        
        try {
            const batch = writeBatch(db);
            const egresosCollection = collection(db, 'egresos');
            
            for (const employee of selectedUsersList) {
                // 1. Create Egreso
                const egresoRef = doc(egresosCollection);
                batch.set(egresoRef, {
                    concepto: 'Nómina',
                    aQuien: employee.id,
                    aQuienNombre: employee.empleado_nombre,
                    monto: Number(employee.totalPagar.toFixed(2)),
                    fecha: Timestamp.now(),
                    metodoPago: 'efectivo', // Or could be an option
                    local_id: user?.local_id || 'general',
                    comentarios: `Pago de nómina (${employee.totalHoras.toFixed(2)} horas a $${tarifaHora}/hr)`,
                    registradoPor: user?.uid,
                    registradoPorNombre: user?.displayName || user?.email,
                    tipo: 'gasto_operativo'
                });
                
                // 2. Update Sessions to paid
                for (const sessionId of employee.sessionIds) {
                    const sessionRef = doc(db, 'sesiones_trabajo', sessionId);
                    batch.update(sessionRef, {
                        pagado: true,
                        pago_id: egresoRef.id
                    });
                }
            }
            
            await batch.commit();
            
            toast({
                title: "Nómina pagada",
                description: `Se han registrado los egresos correctamente por un total de $${totalSelectedToPay.toFixed(2)}`,
            });
            
            setIsPaymentModalOpen(false);
            setSelectedUsersInfo({});
            fetchSessions(); // Reload data
            
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

    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Cálculo de Nómina</h1>
                    <p className="text-muted-foreground">Calcula y registra el pago de horas trabajadas para Recepcionistas.</p>
                </div>
            </div>

            <Card>
                <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Configuración y Filtros</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="space-y-2 w-full md:w-auto flex-1">
                            <Label>Período de tiempo</Label>
                            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !dateRange && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange?.from ? (
                                            dateRange.to ? (
                                                <>
                                                    {format(dateRange.from, "LLL dd, y", { locale: es })} -{" "}
                                                    {format(dateRange.to, "LLL dd, y", { locale: es })}
                                                </>
                                            ) : (
                                                format(dateRange.from, "LLL dd, y", { locale: es })
                                            )
                                        ) : (
                                            <span>Selecciona un rango</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        defaultMonth={dateRange?.from}
                                        selected={dateRange}
                                        onSelect={handleDateSelect}
                                        numberOfMonths={1}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        
                        <div className="space-y-2 w-full md:w-48">
                            <Label>Tarifa por Hora</Label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    className="pl-9"
                                    type="number" 
                                    value={tarifaHora} 
                                    onChange={(e) => setTarifaHora(Number(e.target.value))}
                                    step="0.5"
                                    min="0"    
                                />
                            </div>
                        </div>

                        <Button onClick={fetchSessions} disabled={loading} className="w-full md:w-auto">
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                            Calcular
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Resumen de Horas</CardTitle>
                        <CardDescription>Detalle de horas trabajadas por empleado en el período.</CardDescription>
                    </div>
                    {selectedUsersList.length > 0 && (
                        <Button 
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => setIsPaymentModalOpen(true)}
                        >
                            <DollarSign className="mr-2 h-4 w-4" />
                            Pagar Nómina Seleccionada (${totalSelectedToPay.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                        </Button>
                    )}
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
                                        <TableHead className="w-[50px] text-center">
                                            <Checkbox 
                                                checked={groupedData.length > 0 && groupedData.every(u => selectedUsersInfo[u.id] || u.unpaidSessions === 0)}
                                                onCheckedChange={handleSelectAll}
                                            />
                                        </TableHead>
                                        <TableHead>Empleado</TableHead>
                                        <TableHead>Rol</TableHead>
                                        <TableHead className="text-right">Horas Trabajadas</TableHead>
                                        <TableHead className="text-right">Total a Pagar</TableHead>
                                        <TableHead className="text-center">Estado</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {groupedData.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                                No se encontraron sesiones de trabajo en este período.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        groupedData.map((employee) => (
                                            <TableRow key={employee.id}>
                                                <TableCell className="text-center">
                                                    <Checkbox 
                                                        disabled={employee.unpaidSessions === 0}
                                                        checked={!!selectedUsersInfo[employee.id]}
                                                        onCheckedChange={(checked) => handleSelectUser(employee.id, !!checked)}
                                                    />
                                                </TableCell>
                                                <TableCell className="font-medium">{employee.empleado_nombre}</TableCell>
                                                <TableCell>{employee.roles.join(', ')}</TableCell>
                                                <TableCell className="text-right">
                                                    {employee.totalHoras.toFixed(2)} hrs
                                                    {employee.totalHoras > 0 && (
                                                        <span className="text-xs text-muted-foreground block">
                                                            ({employee.unpaidSessions} sesiones a pagar)
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right font-medium text-green-600">
                                                    ${employee.totalPagar.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {employee.unclosedSessions > 0 ? (
                                                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full whitespace-nowrap">
                                                            {employee.unclosedSessions} sesiones abiertas (no calc.)
                                                        </span>
                                                    ) : employee.unpaidSessions > 0 ? (
                                                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full whitespace-nowrap">
                                                            Pendiente de pago
                                                        </span>
                                                    ) : employee.paidSessions > 0 ? (
                                                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full whitespace-nowrap flex items-center justify-center gap-1">
                                                            <CheckCircle2 className="h-3 w-3" /> Pagado
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">Sin horas</span>
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

            <AlertDialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Pago de Nómina</AlertDialogTitle>
                        <AlertDialogDescription>
                            ¿Estás seguro de que deseas registrar el pago de nómina para {selectedUsersList.length} empleados?
                            Esto creará automáticamente los egresos correspondientes en el sistema.
                        </AlertDialogDescription>
                        <div className="my-4 py-4 rounded-md border bg-muted/50 px-4">
                            <p className="text-sm font-medium mb-2">Desglose:</p>
                            <ul className="text-sm space-y-1">
                                {selectedUsersList.map(u => (
                                    <li key={u.id} className="flex justify-between">
                                        <span>{u.empleado_nombre} ({u.totalHoras.toFixed(2)} hrs)</span>
                                        <span className="font-medium">${u.totalPagar.toFixed(2)}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                                <span>Total a Pagar</span>
                                <span>${totalSelectedToPay.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={processingPayment}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={(e) => { e.preventDefault(); handlePayNomina(); }}
                            disabled={processingPayment}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            {processingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Confirmar Pago
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
