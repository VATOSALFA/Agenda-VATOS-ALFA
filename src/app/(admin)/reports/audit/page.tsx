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
import { Calendar as CalendarIcon, Search, ShieldAlert, ShieldCheck, Info, Loader2, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';
import { AuditLogEntry } from '@/lib/audit-logger';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';

export default function AuditPage() {
    const { toast } = useToast();
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: subDays(new Date(), 7),
        to: new Date(),
    });
    const [severityFilter, setSeverityFilter] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const { data: logs, loading: logsLoading } = useFirestoreQuery<AuditLogEntry & { id: string }>('audit_logs');
    const { data: usersData, loading: usersLoading } = useFirestoreQuery<any>('usuarios');

    const loading = logsLoading || usersLoading;

    // Create a map of userId -> role
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

        // 1. Sort by Date Descending
        filtered.sort((a, b) => {
            const dateA = a.timestamp?.seconds ? new Date(a.timestamp.seconds * 1000) : new Date();
            const dateB = b.timestamp?.seconds ? new Date(b.timestamp.seconds * 1000) : new Date();
            return dateB.getTime() - dateA.getTime();
        });

        // 2. Filter by Date Range
        if (dateRange?.from) {
            const from = startOfDay(dateRange.from);
            const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);

            filtered = filtered.filter(log => {
                const logDate = log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000) : new Date();
                return logDate >= from && logDate <= to;
            });
        }



        // 4. Filter by Search Term
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(log =>
                log.action.toLowerCase().includes(lowerTerm) ||
                log.details.toLowerCase().includes(lowerTerm) ||
                log.userName.toLowerCase().includes(lowerTerm)
            );
        }

        return filtered;
    }, [logs, dateRange, severityFilter, searchTerm]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, dateRange]);

    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
    const paginatedLogs = filteredLogs.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const getSeverityBadge = (severity: string) => {
        switch (severity) {
            case 'critical':
                return <Badge variant="destructive" className="flex items-center gap-1"><ShieldAlert className="h-3 w-3" /> Crítico</Badge>;
            case 'warning':
                return <Badge variant="outline" className="border-yellow-500 text-yellow-600 flex items-center gap-1 bg-yellow-50"><ShieldCheck className="h-3 w-3" /> Advertencia</Badge>;
            case 'info':
            default:
                return <Badge variant="secondary" className="flex items-center gap-1"><Info className="h-3 w-3" /> Info</Badge>;
        }
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp?.seconds) return 'N/A';
        return format(new Date(timestamp.seconds * 1000), "dd MMM yyyy HH:mm", { locale: es });
    };

    const handleDownload = () => {
        if (filteredLogs.length === 0) {
            toast({ variant: "destructive", title: "Sin datos", description: "No hay registros para exportar." });
            return;
        }

        const data = filteredLogs.map(log => ({
            Fecha: formatDate(log.timestamp),
            Usuario: log.userName,
            Rol: log.userRole || userRolesMap.get(log.userId) || 'Desconocido',
            Acción: log.authCode ? `${log.action} - (Código: ${log.authCode})` : log.action,
            Detalles: log.details,
            ID_Entidad: log.entityId || 'N/A',
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Auditoría");
        XLSX.writeFile(wb, `Auditoria_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Registro de Auditoría</h2>
                    <p className="text-muted-foreground">Monitorea acciones sensibles y cambios en el sistema.</p>
                </div>
                <Button variant="outline" onClick={handleDownload}>
                    <Download className="mr-2 h-4 w-4" /> Exportar
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Filtros</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                            <Popover>
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
                                                <>{format(dateRange.from, "LLL dd, y", { locale: es })} - {format(dateRange.to, "LLL dd, y", { locale: es })}</>
                                            ) : (
                                                format(dateRange.from, "LLL dd, y", { locale: es })
                                            )
                                        ) : (
                                            <span>Seleccionar fechas</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        defaultMonth={dateRange?.from}
                                        selected={dateRange}
                                        onSelect={setDateRange}
                                        numberOfMonths={2}
                                        locale={es}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="w-full md:w-[300px]">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar usuario, acción..."
                                    className="pl-8"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[180px]">Fecha</TableHead>
                                <TableHead className="w-[150px]">Usuario</TableHead>
                                <TableHead className="w-[150px]">Rol</TableHead>
                                <TableHead className="w-[250px]">Acción/Código</TableHead>
                                <TableHead>Detalles</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">
                                        <div className="flex justify-center items-center">
                                            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Cargando registros...
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filteredLogs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                        No se encontraron registros de auditoría.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedLogs.map((log, index) => (
                                    <TableRow key={log.id || index}>
                                        <TableCell className="font-medium">{formatDate(log.timestamp)}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{log.userName}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="text-xs">
                                                {log.userRole || userRolesMap.get(log.userId) || 'Desconocido'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <span className="font-semibold">{log.action}</span>
                                                {log.authCode && (
                                                    <span className="text-[10px] font-mono bg-muted text-muted-foreground px-1 py-0.5 rounded w-fit capitalize">
                                                        Código: {log.authCode}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm">{log.details}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {!loading && filteredLogs.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-end gap-4 sm:gap-6 pt-2">
                    <div className="flex items-center space-x-2">
                        <p className="text-sm font-medium">Resultados por página</p>
                        <Select
                            value={`${itemsPerPage}`}
                            onValueChange={(value) => {
                                setItemsPerPage(Number(value));
                                setCurrentPage(1);
                            }}
                        >
                            <SelectTrigger className="h-8 w-[70px]">
                                <SelectValue placeholder={itemsPerPage} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="20">20</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="text-sm font-medium">
                        Página {currentPage} de {totalPages}
                    </div>
                    <div className="flex items-center space-x-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages}
                        >
                            Siguiente <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
