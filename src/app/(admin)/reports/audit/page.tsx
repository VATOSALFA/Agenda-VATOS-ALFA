'use client';

import { useState, useMemo } from 'react';
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
import { Calendar as CalendarIcon, Search, ShieldAlert, ShieldCheck, Info, Loader2, Download } from 'lucide-react';
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
    const [limitCount, setLimitCount] = useState<number>(100);

    // Fetch logs - simplified fetching without filtering at query level for now to allow flexible client-side filtering
    // In production with massive data, this should be paginated and filtered at Firestore level.
    const { data: logs, loading } = useFirestoreQuery<AuditLogEntry & { id: string }>('audit_logs');

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

        // 3. Filter by Severity
        if (severityFilter !== 'all') {
            filtered = filtered.filter(log => log.severity === severityFilter);
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
            Acción: log.action,
            Severidad: log.severity.toUpperCase(),
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
                        <div className="w-full md:w-[200px]">
                            <Select value={severityFilter} onValueChange={setSeverityFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Severidad" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas</SelectItem>
                                    <SelectItem value="info">Info</SelectItem>
                                    <SelectItem value="warning">Advertencia</SelectItem>
                                    <SelectItem value="critical">Crítico</SelectItem>
                                </SelectContent>
                            </Select>
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
                                <TableHead className="w-[120px]">Severidad</TableHead>
                                <TableHead className="w-[200px]">Acción</TableHead>
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
                                filteredLogs.slice(0, limitCount).map((log, index) => (
                                    <TableRow key={log.id || index}>
                                        <TableCell className="font-medium">{formatDate(log.timestamp)}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{log.userName}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>{getSeverityBadge(log.severity)}</TableCell>
                                        <TableCell className="font-semibold">{log.action}</TableCell>
                                        <TableCell className="text-muted-foreground text-sm">{log.details}</TableCell>
                                    </TableRow>
                                ))
                            )}
                            {filteredLogs.length > limitCount && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center">
                                        <Button variant="ghost" onClick={() => setLimitCount(prev => prev + 100)}>Cargar más</Button>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
