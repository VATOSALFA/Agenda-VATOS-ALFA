

'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { DateRange } from 'react-day-picker';
import { format, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar as CalendarIcon, Search, Download, Eye, Loader2, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CashClosing, User as AppUser } from '@/lib/types';
import { where, Timestamp, QueryConstraint } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';

const denominations = [
    { value: 1000, label: '$1,000.00' },
    { value: 500, label: '$500.00' },
    { value: 200, label: '$200.00' },
    { value: 100, label: '$100.00' },
    { value: 50, label: '$50.00' },
    { value: 20, label: '$20.00' },
    { value: 10, label: '$10.00' },
    { value: 5, label: '$5.00' },
    { value: 2, label: '$2.00' },
    { value: 1, label: '$1.00' },
    { value: 0.5, label: '$0.50' },
];

const ClosingDetailModal = ({ closing, isOpen, onOpenChange }: { closing: CashClosing | null, isOpen: boolean, onOpenChange: (open: boolean) => void }) => {
    if (!closing) return null;

    // Helper to safely get count; handle potential missing keys if structure changed
    const getCount = (val: number) => {
        if (!closing.detalle_conteo) return 0;
        // Try exact number key, or string key
        return closing.detalle_conteo[val] || closing.detalle_conteo[String(val)] || 0;
    };

    const totalEntregadoneto = closing.total_calculado - closing.fondo_base;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-5xl max-h-[95vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Detalle del Cierre de Caja #{closing.id.slice(0, 6)}</DialogTitle>
                    <DialogDescription>
                        Realizado el {format(closing.fecha_corte.toDate(), "dd 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-grow overflow-y-auto py-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Column Left: Calculator */}
                        <div className="space-y-4 flex flex-col">
                            <h3 className="font-semibold">Calculadora de Efectivo</h3>
                            <div className="h-[300px] border rounded-lg overflow-hidden flex flex-col">
                                <ScrollArea className="h-full">
                                    <div className="p-4 space-y-3">
                                        {denominations.map(d => {
                                            const count = getCount(d.value);
                                            return (
                                                <div key={d.value} className="grid grid-cols-3 gap-2 items-center">
                                                    <Label className="text-right">{d.label}</Label>
                                                    <Input
                                                        readOnly
                                                        value={count}
                                                        className="h-8 text-center bg-muted/20"
                                                    />
                                                    <p className="font-medium text-sm text-center">= ${(d.value * count).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>

                        {/* Column Right: Details */}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Fondo base en caja</Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                    <Input readOnly value={closing.fondo_base} className="pl-6 bg-muted/20" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Total contado</Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                    <Input readOnly value={closing.total_calculado} className="pl-6 font-bold bg-muted/20" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Efectivo en caja (Sistema)</Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                    <Input readOnly value={closing.total_sistema} className="pl-6 bg-muted/20" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Nombre de quien recibe</Label>
                                <Input readOnly value={closing.persona_recibe} className="bg-muted/20" />
                            </div>

                            <div className="space-y-2">
                                <Label>Comentarios</Label>
                                <Input readOnly value={closing.comentarios || 'Sin comentarios'} className="bg-muted/20" />
                            </div>

                            <div className="space-y-2 pt-4 border-t">
                                <div className="p-4 bg-primary rounded-lg text-primary-foreground text-center shadow-md">
                                    <p className="text-sm font-medium opacity-90 uppercase tracking-widest">Total entregado</p>
                                    <p className="text-4xl font-extrabold mt-1">
                                        ${totalEntregadoneto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


export default function CashClosingsPage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: new Date(),
        to: new Date(),
    });
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [deliveredByFilter, setDeliveredByFilter] = useState('todos');
    const [receivedByFilter, setReceivedByFilter] = useState('todos');
    const [queryKey, setQueryKey] = useState(0);
    const [selectedClosing, setSelectedClosing] = useState<CashClosing | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const { data: users, loading: usersLoading } = useFirestoreQuery<AppUser>('usuarios');

    const queryConstraints = useMemo(() => {
        const constraints: QueryConstraint[] = [];
        if (dateRange?.from) {
            constraints.push(where('fecha_corte', '>=', Timestamp.fromDate(startOfDay(dateRange.from))));
        }
        if (dateRange?.to) {
            constraints.push(where('fecha_corte', '<=', Timestamp.fromDate(endOfDay(dateRange.to))));
        }
        if (deliveredByFilter !== 'todos') {
            constraints.push(where('persona_entrega_id', '==', deliveredByFilter));
        }
        if (receivedByFilter !== 'todos') {
            constraints.push(where('persona_recibe', '==', receivedByFilter));
        }
        return constraints;
    }, [dateRange, deliveredByFilter, receivedByFilter]);

    const { data: closings, loading: closingsLoading } = useFirestoreQuery<CashClosing>('cortes_caja', queryKey, ...queryConstraints);

    const sortedClosings = useMemo(() => {
        let sortableItems = [...closings];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                let aValue: any;
                let bValue: any;

                switch (sortConfig.key) {
                    case 'fecha':
                        aValue = a.fecha_corte?.seconds || 0;
                        bValue = b.fecha_corte?.seconds || 0;
                        break;
                    case 'entrega':
                        aValue = (a.persona_entrega_nombre || '').toLowerCase();
                        bValue = (b.persona_entrega_nombre || '').toLowerCase();
                        break;
                    case 'recibe':
                        aValue = (a.persona_recibe || '').toLowerCase();
                        bValue = (b.persona_recibe || '').toLowerCase();
                        break;
                    case 'total_sistema':
                        aValue = a.total_sistema || 0;
                        bValue = b.total_sistema || 0;
                        break;
                    case 'total_contado':
                        aValue = a.total_calculado || 0;
                        bValue = b.total_calculado || 0;
                        break;
                    case 'total_entregado':
                        aValue = (a.total_calculado || 0) - (a.fondo_base || 0);
                        bValue = (b.total_calculado || 0) - (b.fondo_base || 0);
                        break;
                    default:
                        return 0;
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        } else {
            // Default sort by date desc if no sort is applied (usually firestore does this but good to enforce in UI if mixing/matching)
            // Actually firestore query doesn't have orderBy here, so we should probably add default sort.
            sortableItems.sort((a, b) => (b.fecha_corte?.seconds || 0) - (a.fecha_corte?.seconds || 0));
        }
        return sortableItems;
    }, [closings, sortConfig]);

    useEffect(() => {
        setCurrentPage(1);
    }, [dateRange, deliveredByFilter, receivedByFilter]);

    const totalPages = Math.ceil(sortedClosings.length / itemsPerPage) || 1;
    const paginatedClosings = sortedClosings.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const SortIcon = ({ field }: { field: string }) => {
        if (!sortConfig || sortConfig.key !== field) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />;
        if (sortConfig.direction === 'asc') return <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" />;
        return <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />;
    };

    const isLoading = usersLoading || closingsLoading;

    return (
        <>
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-bold tracking-tight">Reporte de cierres de caja</h2>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Filtros de búsqueda</CardTitle>
                        <CardDescription>Busca cierres de caja por fecha o por personas involucradas.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                        <Popover open={isCalendarOpen} onOpenChange={(open) => {
                            setIsCalendarOpen(open);
                            if (open) {
                                setDateRange(undefined);
                            }
                        }}>
                            <PopoverTrigger asChild>
                                <Button id="date" variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (
                                        dateRange.to ? (
                                            <>{format(dateRange.from, "LLL dd, y", { locale: es })} - {format(dateRange.to, "LLL dd, y", { locale: es })}</>
                                        ) : (
                                            format(dateRange.from, "LLL dd, y", { locale: es })
                                        )
                                    ) : (
                                        <span>Periodo de tiempo</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
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
                                />
                            </PopoverContent>
                        </Popover>
                        <Select value={deliveredByFilter} onValueChange={setDeliveredByFilter} disabled={usersLoading}>
                            <SelectTrigger><SelectValue placeholder="Entregado por..." /></SelectTrigger>
                            <SelectContent><SelectItem value="todos">Todos</SelectItem>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={receivedByFilter} onValueChange={setReceivedByFilter} disabled={usersLoading}>
                            <SelectTrigger><SelectValue placeholder="Recibido por..." /></SelectTrigger>
                            <SelectContent><SelectItem value="todos">Todos</SelectItem>{users.map(u => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button onClick={() => setQueryKey(k => k + 1)} disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                            Buscar
                        </Button>
                    </CardContent>
                </Card >

                <Card>
                    <CardHeader className="flex-row items-center justify-between">
                        <CardTitle>Historial de cierres</CardTitle>
                        <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Descargar</Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('fecha')}>
                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Fecha
                                            <SortIcon field="fecha" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('entrega')}>
                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Entrega
                                            <SortIcon field="entrega" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('recibe')}>
                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Recibe
                                            <SortIcon field="recibe" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group text-right" onClick={() => requestSort('total_sistema')}>
                                        <div className="flex items-center justify-end gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Total sistema
                                            <SortIcon field="total_sistema" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group text-right" onClick={() => requestSort('total_contado')}>
                                        <div className="flex items-center justify-end gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Total contado
                                            <SortIcon field="total_contado" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group text-right" onClick={() => requestSort('total_entregado')}>
                                        <div className="flex items-center justify-end gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                            Total entregado
                                            <SortIcon field="total_entregado" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                                    ))
                                ) : sortedClosings.length === 0 ? (
                                    <TableRow><TableCell colSpan={7} className="text-center h-24">No se encontraron cierres de caja.</TableCell></TableRow>
                                ) : (
                                    paginatedClosings.map(closing => (
                                        <TableRow key={closing.id}>
                                            <TableCell>{format(closing.fecha_corte.toDate(), 'dd/MM/yyyy HH:mm')}</TableCell>
                                            <TableCell>{closing.persona_entrega_nombre}</TableCell>
                                            <TableCell>{closing.persona_recibe}</TableCell>
                                            <TableCell className="text-right">${closing.total_sistema.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right">${closing.total_calculado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                            <TableCell className="text-right font-bold">
                                                ${(closing.total_calculado - closing.fondo_base).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="outline" size="sm" onClick={() => setSelectedClosing(closing)}><Eye className="mr-2 h-4 w-4" /> Ver Detalle</Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {!isLoading && sortedClosings.length > 0 && (
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
            </div >

            <ClosingDetailModal
                isOpen={!!selectedClosing}
                onOpenChange={() => setSelectedClosing(null)}
                closing={selectedClosing}
            />
        </>
    );
}

