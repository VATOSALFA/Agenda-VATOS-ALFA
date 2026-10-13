'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
    Calendar as CalendarIcon, 
    Search, 
    ShieldAlert, 
    ShieldCheck, 
    Info, 
    Loader2, 
    Download, 
    ChevronLeft, 
    ChevronRight, 
    ArrowUpDown,
    Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';
import { AuditLogEntry } from '@/lib/audit-logger';
import type { Role } from '@/lib/types';
import { useAuth } from '@/contexts/firebase-auth-context';
import { Skeleton } from '@/components/ui/skeleton';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';

export default function AuditPage() {
    const { toast } = useToast();
    const { user } = useAuth();
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: subDays(new Date(), 7),
        to: new Date(),
    });
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'fecha', direction: 'desc' });

    const { data: logs, loading: logsLoading } = useFirestoreQuery<AuditLogEntry & { id: string }>('audit_logs');
    const { data: usersData, loading: usersLoading } = useFirestoreQuery<any>('usuarios');
    const { data: roles } = useFirestoreQuery<Role>('roles');
    const userRole = roles?.find(r => r.title === user?.role);
    const historyLimit = userRole?.historyRestrictionDays;

    const loading = logsLoading || usersLoading;

    // Mapa de userId -> role
    const userRolesMap = useMemo(() => {
        const map = new Map<string, string>();
        usersData?.forEach(user => {
            if (user.uid) map.set(user.uid, user.role);
            if (user.id) map.set(user.id, user.role);
        });
        return map;
    }, [usersData]);

    const filteredLogs = useMemo(() => {
        if (!logs) return [];

        let filtered = [...logs];

        // 1. Filtrar por Rango de Fecha
        if (dateRange?.from) {
            const from = startOfDay(dateRange.from);
            const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);

            filtered = filtered.filter(log => {
                const logDate = log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000) : new Date();
                return logDate >= from && logDate <= to;
            });
        }

        // 2. Filtrar por término de búsqueda
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(log =>
                (log.action || '').toLowerCase().includes(lowerTerm) ||
                (log.details || '').toLowerCase().includes(lowerTerm) ||
                (log.userName || '').toLowerCase().includes(lowerTerm) ||
                (log.authCode || '').toLowerCase().includes(lowerTerm)
            );
        }

        // 3. Ordenar
        filtered.sort((a, b) => {
            const { key, direction } = sortConfig;
            const dir = direction === 'asc' ? 1 : -1;

            if (key === 'fecha') {
                const dateA = a.timestamp?.seconds || 0;
                const dateB = b.timestamp?.seconds || 0;
                return (dateA - dateB) * dir;
            }

            let valA = '';
            let valB = '';

            if (key === 'usuario') {
                valA = (a.userName || '').toLowerCase();
                valB = (b.userName || '').toLowerCase();
            } else if (key === 'rol') {
                valA = (a.userRole || userRolesMap.get(a.userId) || '').toLowerCase();
                valB = (b.userRole || userRolesMap.get(b.userId) || '').toLowerCase();
            } else if (key === 'accion') {
                valA = (a.action || '').toLowerCase();
                valB = (b.action || '').toLowerCase();
            } else if (key === 'detalles') {
                valA = (a.details || '').toLowerCase();
                valB = (b.details || '').toLowerCase();
            }

            return valA.localeCompare(valB) * dir;
        });

        return filtered;
    }, [logs, dateRange, searchTerm, sortConfig, userRolesMap]);

    const handleSort = (key: string) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const SortableHeader = ({ label, sortKey, className }: { label: string; sortKey: string; className?: string }) => (
        <TableHead className={cn("py-1 px-3 text-xs font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors group", className)} onClick={() => handleSort(sortKey)}>
            <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                {label}
                <ArrowUpDown className={cn("h-3 w-3 transition-colors", sortConfig.key === sortKey ? "text-blue-400" : "text-slate-500 opacity-60 group-hover:opacity-100")} />
            </div>
        </TableHead>
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, dateRange]);

    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
    const paginatedLogs = filteredLogs.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const formatDate = (timestamp: any) => {
        if (!timestamp?.seconds) return 'N/A';
        return format(new Date(timestamp.seconds * 1000), "dd MMM yyyy HH:mm", { locale: es });
    };

    const handleDownload = () => {
        if (filteredLogs.length === 0) {
            toast({ variant: "destructive", title: "Sin datos", description: "No hay registros para exportar." });
            return;
        }

        const data = filteredLogs.map(log => {
            const dateObj = log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000) : new Date();
            return {
                'Fecha': format(dateObj, 'yyyy-MM-dd'),
                'Hora': format(dateObj, 'HH:mm'),
                'Usuario': log.userName || 'N/A',
                'Rol': log.userRole || userRolesMap.get(log.userId) || 'Desconocido',
                'Acción': log.action || 'N/A',
                'Código de Autorización': log.authCode || 'N/A',
                'Detalles': log.details || 'N/A',
                'ID Entidad': log.entityId || 'N/A',
            };
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Auditoría");
        XLSX.writeFile(wb, `Auditoria_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

        toast({
            title: "Reporte generado",
            description: "La descarga del registro de auditoría ha comenzado.",
        });
    };

    return (
        <div className="flex-1 space-y-4 p-3 sm:p-6 md:p-8 pt-4 sm:pt-6">
            {/* Header Oficial con Bare Icon de Descarga */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                        Registro de Auditoría
                    </h1>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 hidden sm:block">
                        Monitorea acciones sensibles y cambios en el sistema.
                    </p>
                </div>
                <button 
                    type="button"
                    className="text-slate-400 hover:text-white transition-colors p-1" 
                    onClick={handleDownload}
                    title="Descargar reporte en Excel"
                >
                    <Download className="h-4 w-4" />
                </button>
            </div>

            {/* FILTROS ESCRITORIO (hidden sm:block) */}
            <Card className="hidden sm:block rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/40">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Filter className="h-4 w-4 text-slate-400" /> Filtros de búsqueda
                    </CardTitle>
                    <CardDescription className="text-xs">Filtra por periodo o busca por usuario, acción o detalles.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        {/* Selector de Fechas */}
                        <div className="flex-1 min-w-[200px] space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Periodo de tiempo</label>
                            <Popover open={isCalendarOpen} onOpenChange={(open) => {
                                setIsCalendarOpen(open);
                                if (open) setDateRange(undefined);
                            }}>
                                <PopoverTrigger asChild>
                                    <Button
                                        id="date"
                                        variant="outline"
                                        className={cn(
                                            "w-full justify-start text-left font-normal rounded-xl h-10 border-border/60 text-xs sm:text-sm",
                                            !dateRange && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4 text-slate-400 shrink-0" />
                                        {dateRange?.from ? (
                                            dateRange.to ? (
                                                <>{format(dateRange.from, "dd MMM, y", { locale: es })} - {format(dateRange.to, "dd MMM, y", { locale: es })}</>
                                            ) : (
                                                format(dateRange.from, "dd MMM, y", { locale: es })
                                            )
                                        ) : (
                                            <span>Periodo de tiempo</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]" align="start">
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        defaultMonth={dateRange?.from}
                                        selected={dateRange}
                                        onSelect={(range) => {
                                            setDateRange(range);
                                            if (range?.from && range?.to) {
                                                setIsCalendarOpen(false);
                                            }
                                        }}
                                        numberOfMonths={1}
                                        locale={es}
                                        disabled={historyLimit !== undefined && historyLimit !== null ? (date) => date > new Date() || date < subDays(new Date(), historyLimit) : undefined}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Buscador de texto */}
                        <div className="flex-1 min-w-[240px] space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Buscar</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Buscar usuario, acción, detalle..."
                                    className="pl-9 h-10 rounded-xl border-border/60 text-xs sm:text-sm bg-card"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* FILTROS MÓVIL COMPACTO (sm:hidden) */}
            <Card className="sm:hidden rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm">
                <CardContent className="p-2.5 space-y-2">
                    <Popover open={isCalendarOpen} onOpenChange={(open) => {
                        setIsCalendarOpen(open);
                        if (open) setDateRange(undefined);
                    }}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal rounded-xl h-9 text-xs border-border/60 px-2.5 truncate">
                                <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="truncate">
                                    {dateRange?.from ? (
                                        dateRange.to ? (
                                            `${format(dateRange.from, "dd MMM", { locale: es })} - ${format(dateRange.to, "dd MMM", { locale: es })}`
                                        ) : (
                                            format(dateRange.from, "dd MMM, y", { locale: es })
                                        )
                                    ) : (
                                        'Periodo de tiempo'
                                    )}
                                </span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]" align="start">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={dateRange?.from}
                                selected={dateRange}
                                onSelect={(range) => {
                                    setDateRange(range);
                                    if (range?.from && range?.to) {
                                        setIsCalendarOpen(false);
                                    }
                                }}
                                numberOfMonths={1}
                                locale={es}
                                disabled={historyLimit !== undefined && historyLimit !== null ? (date) => date > new Date() || date < subDays(new Date(), historyLimit) : undefined}
                            />
                        </PopoverContent>
                    </Popover>

                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                        <Input
                            placeholder="Buscar usuario, acción..."
                            className="pl-8 h-9 rounded-xl border-border/60 text-xs bg-card"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Tabla Historial de Auditoría (Estándar Compacto Alta Densidad) */}
            <Card className="rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                <CardContent className="p-0">
                    {/* Tabla Desktop (hidden sm:block) */}
                    <div className="hidden sm:block overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                    <SortableHeader label="Fecha" sortKey="fecha" className="w-[160px]" />
                                    <SortableHeader label="Usuario" sortKey="usuario" className="w-[170px]" />
                                    <SortableHeader label="Rol" sortKey="rol" className="w-[150px]" />
                                    <SortableHeader label="Acción/Código" sortKey="accion" className="w-[230px]" />
                                    <SortableHeader label="Detalles" sortKey="detalles" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 6 }).map((_, i) => (
                                        <TableRow key={i} className="h-9 border-b border-border/40">
                                            <TableCell colSpan={5} className="py-1.5 px-3"><Skeleton className="h-5 w-full" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredLogs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center h-20 text-xs text-muted-foreground">
                                            No se encontraron registros de auditoría.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedLogs.map((log, index) => (
                                        <TableRow key={log.id || index} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                            <TableCell className="py-1.5 px-3 text-xs font-medium text-foreground whitespace-nowrap">
                                                {formatDate(log.timestamp)}
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs text-foreground font-medium">
                                                {log.userName || 'N/A'}
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs">
                                                <Badge variant="outline" className="text-[10px] py-0 px-2 font-normal rounded-lg border-border/60 bg-muted/20 text-muted-foreground">
                                                    {log.userRole || userRolesMap.get(log.userId) || 'Desconocido'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-semibold text-foreground">{log.action}</span>
                                                    {log.authCode && (
                                                        <span className="text-[10px] bg-muted/30 border border-border/40 text-muted-foreground px-1.5 py-0.2 rounded w-fit">
                                                            Código: {log.authCode}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs text-muted-foreground leading-relaxed">
                                                {log.details}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Vista Móvil Compacta (sm:hidden) */}
                    <div className="sm:hidden space-y-2.5 p-3">
                        {loading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="p-3 rounded-xl border border-border/60 bg-card/60 space-y-2">
                                    <Skeleton className="h-4 w-1/2" />
                                    <Skeleton className="h-4 w-full" />
                                </div>
                            ))
                        ) : filteredLogs.length === 0 ? (
                            <div className="text-center py-6 text-xs text-muted-foreground">
                                No se encontraron registros de auditoría.
                            </div>
                        ) : (
                            paginatedLogs.map((log, index) => (
                                <div key={log.id || index} className="p-3 rounded-xl border border-border/60 bg-card/60 space-y-1.5">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-medium text-foreground">{formatDate(log.timestamp)}</span>
                                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 rounded-lg border-border/60 bg-muted/20 text-muted-foreground">
                                            {log.userRole || userRolesMap.get(log.userId) || 'Desconocido'}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                                        <span className="font-semibold text-foreground">{log.action}</span>
                                        <span className="text-muted-foreground text-[11px]">{log.userName}</span>
                                    </div>
                                    {log.authCode && (
                                        <div className="text-[10px] text-muted-foreground">
                                            Código: {log.authCode}
                                        </div>
                                    )}
                                    <p className="text-xs text-muted-foreground leading-relaxed pt-1 border-t border-border/30">
                                        {log.details}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Paginación */}
            {!loading && filteredLogs.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
                    <div className="flex items-center space-x-2">
                        <span className="text-xs font-medium">Resultados por página</span>
                        <Select
                            value={`${itemsPerPage}`}
                            onValueChange={(value) => {
                                setItemsPerPage(Number(value));
                                setCurrentPage(1);
                            }}
                        >
                            <SelectTrigger className="h-8 w-[70px] rounded-xl border-border/60 text-xs">
                                <SelectValue placeholder={itemsPerPage} />
                            </SelectTrigger>
                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                <SelectItem value="10" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">10</SelectItem>
                                <SelectItem value="20" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">20</SelectItem>
                                <SelectItem value="50" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">50</SelectItem>
                                <SelectItem value="100" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">100</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center space-x-4">
                        <span className="text-xs font-medium text-foreground">
                            Página {currentPage} de {totalPages}
                        </span>
                        <div className="flex items-center space-x-1.5">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 rounded-xl border-border/60 text-xs"
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Anterior
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 rounded-xl border-border/60 text-xs"
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                            >
                                Siguiente <ChevronRight className="h-3.5 w-3.5 ml-1" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
