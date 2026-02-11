'use client';

import { useState, useMemo, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { Timestamp, where, orderBy } from 'firebase/firestore'; // Importamos tipos de Firebase

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Download, Filter, Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Local, Profesional, Role } from "@/lib/types";
import { useAuth } from "@/contexts/firebase-auth-context";

export default function TipsPage() {
    const { user } = useAuth();
    const isLocalRestricted = !!user?.local_id;
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);

    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [localFilter, setLocalFilter] = useState('todos');
    const [professionalFilter, setProfessionalFilter] = useState('todos');

    // Estado para los filtros activos (aplicados al buscar)
    const [activeFilters, setActiveFilters] = useState<{
        dateRange: DateRange | undefined;
        local: string;
        professional: string;
    }>({
        dateRange: undefined,
        local: 'todos',
        professional: 'todos'
    });

    const [queryKey, setQueryKey] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const handleDateSelect = (range: DateRange | undefined) => {
        setDateRange(range);
        if (range?.from && range?.to) {
            setIsPopoverOpen(false);
        }
    };

    // 1. Cargar catálogos
    const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', where('active', '==', true));
    const { data: clients } = useFirestoreQuery<any>('clientes');

    // 2. Configurar rango de fechas inicial (Hoy) y filtros por defecto
    useEffect(() => {
        const today = new Date();
        const initialDateRange = { from: startOfDay(today), to: endOfDay(today) };

        // Solo inicializar si no están definidos
        if (!dateRange) {
            setDateRange(initialDateRange);
        }

        const initialFilters = {
            dateRange: initialDateRange,
            local: (isLocalRestricted && user?.local_id) ? user.local_id : 'todos',
            professional: 'todos'
        };

        // Si es la primera carga (activeFilters.dateRange es undefined), aplicamos filtros iniciales
        if (!activeFilters.dateRange) {
            setActiveFilters(initialFilters);
            // Sincronizar UI state
            if (isLocalRestricted && user?.local_id) {
                setLocalFilter(user.local_id);
            }
        }

    }, [user, isLocalRestricted]);

    // 3. Construir consulta a 'ventas' basada en fechas ACTIVAS
    const salesConstraints = useMemo(() => {
        if (!activeFilters.dateRange?.from) return [];

        const start = Timestamp.fromDate(startOfDay(activeFilters.dateRange.from));
        const end = Timestamp.fromDate(endOfDay(activeFilters.dateRange.to || activeFilters.dateRange.from));

        return [
            where('fecha_hora_venta', '>=', start),
            where('fecha_hora_venta', '<=', end),
            orderBy('fecha_hora_venta', 'desc')
        ];
    }, [activeFilters.dateRange]);

    // 4. Ejecutar consulta
    // Usamos activeFilters.dateRange en la key para re-fetching
    const { data: rawSales, loading: salesLoading } = useFirestoreQuery<any>(
        'ventas',
        `tips-sales-${queryKey}`, // Key simple combinada con constraints
        ...salesConstraints
    );

    // 5. Procesar y Filtrar Datos en Memoria usando filtros ACTIVOS
    const filteredTips = useMemo(() => {
        if (!rawSales) return [];

        return rawSales
            // A. Solo ventas con propina registrada mayor a 0
            .filter(sale => (sale.propina && Number(sale.propina) > 0))
            // B. Filtrar por Local ACTIVO
            .filter(sale => activeFilters.local === 'todos' || sale.local_id === activeFilters.local)
            // C. Filtrar por Profesional ACTIVO
            .filter(sale => {
                if (activeFilters.professional === 'todos') return true;
                return sale.items?.some((item: any) => item.barbero_id === activeFilters.professional);
            })
            .map(sale => {
                // D. Enriquecer datos...
                const uniqueBarberIds = Array.from(new Set(sale.items?.map((i: any) => i.barbero_id).filter(Boolean)));
                const professionalNames = uniqueBarberIds.map((id: any) => {
                    const prof = professionals?.find(p => p.id === id);
                    return prof ? prof.name : 'Desconocido';
                }).join(', ');

                const localName = locales?.find(l => l.id === sale.local_id)?.name || 'Local desconocido';

                const clientName = clients?.find((c: any) => c.id === sale.cliente_id)?.nombre
                    ? `${clients.find((c: any) => c.id === sale.cliente_id)?.nombre} ${clients.find((c: any) => c.id === sale.cliente_id)?.apellido || ''}`
                    : (sale.cliente_nombre || 'Cliente General');

                return {
                    id: sale.id,
                    saleId: sale.id.slice(0, 8),
                    date: sale.fecha_hora_venta?.toDate(),
                    localName: localName,
                    clientName: clientName,
                    professionalName: professionalNames || 'Sin asignar',
                    tip: Number(sale.propina)
                };
            });
    }, [rawSales, activeFilters, locales, professionals, clients]);

    const totalPages = Math.ceil(filteredTips.length / itemsPerPage);
    const paginatedTips = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredTips.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredTips, currentPage, itemsPerPage]);

    const totalTips = useMemo(() => {
        return filteredTips.reduce((acc, item) => acc + item.tip, 0);
    }, [filteredTips]);

    const handleSearch = () => {
        setActiveFilters({
            dateRange: dateRange,
            local: localFilter,
            professional: professionalFilter
        });
        setQueryKey(prev => prev + 1); // Forzar re-render si fuera necesario
        setCurrentPage(1); // Resetear paginación al buscar
    }

    const isLoading = localesLoading || professionalsLoading || salesLoading;

    const { data: roles } = useFirestoreQuery<Role>('roles');
    const userRole = roles.find(r => r.title === user?.role);
    const historyLimit = userRole?.historyRestrictionDays;

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Propinas</h2>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" /> Filtros</CardTitle>
                    <CardDescription>Filtra el registro de propinas por diferentes criterios.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Periodo de tiempo</label>
                            <Popover open={isPopoverOpen} onOpenChange={(open) => {
                                setIsPopoverOpen(open);
                                if (open) setDateRange(undefined);
                            }}>
                                <PopoverTrigger asChild>
                                    <Button id="date" variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {dateRange?.from ? (
                                            dateRange.to ? (
                                                <>{format(dateRange.from, "dd/MM/y", { locale: es })} - {format(dateRange.to, "dd/MM/y", { locale: es })}</>
                                            ) : (
                                                format(dateRange.from, "dd/MM/y", { locale: es })
                                            )
                                        ) : (
                                            <span>Seleccionar rango</span>
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
                                        locale={es}
                                        disabled={historyLimit !== undefined && historyLimit !== null ? (date) => date > new Date() || date < subDays(new Date(), historyLimit) : undefined}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Local</label>
                            <Select value={localFilter} onValueChange={setLocalFilter} disabled={localesLoading || isLocalRestricted}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="todos">Todos</SelectItem>
                                    {locales?.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Profesional</label>
                            <Select value={professionalFilter} onValueChange={setProfessionalFilter} disabled={professionalsLoading}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="todos">Todos</SelectItem>
                                    {professionals?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={handleSearch} disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />} Buscar
                        </Button>
                    </div>
                </CardContent >
            </Card >

            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <div>
                        <CardTitle>Registro de Propinas</CardTitle>
                        <CardDescription>Detalle de las propinas recibidas en el período seleccionado.</CardDescription>
                    </div>
                    <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Descargar propinas</Button>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Venta ID</TableHead>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Local</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Profesional</TableHead>
                                <TableHead className="text-right">Propina</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={6} className="text-center h-24"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                            ) : paginatedTips.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-center h-24">No hay propinas registradas en este período.</TableCell></TableRow>
                            ) : paginatedTips.map((tip) => (
                                <TableRow key={tip.id}>
                                    <TableCell className="font-mono text-xs text-muted-foreground">...{tip.saleId}</TableCell>
                                    <TableCell>{tip.date ? format(tip.date, 'dd/MM/yyyy HH:mm', { locale: es }) : '-'}</TableCell>
                                    <TableCell>{tip.localName}</TableCell>
                                    <TableCell>{tip.clientName}</TableCell>
                                    <TableCell>{tip.professionalName}</TableCell>
                                    <TableCell className="text-right font-semibold text-secondary">+${tip.tip.toLocaleString('es-MX')}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        <TableFooter>
                            <TableRow className="bg-muted/50">
                                <TableHead colSpan={5} className="text-right font-bold text-lg">Total Propinas</TableHead>
                                <TableHead className="text-right font-bold text-lg text-primary">${totalTips.toLocaleString('es-MX')}</TableHead>
                            </TableRow>
                        </TableFooter>
                    </Table>

                    {!isLoading && filteredTips.length > 0 && (
                        <div className="flex flex-col sm:flex-row items-center justify-end gap-4 sm:gap-6 pt-4">
                            <div className="flex items-center space-x-2">
                                <p className="text-sm font-medium">Resultados por página</p>
                                <Select
                                    value={`${itemsPerPage}`}
                                    onValueChange={(value) => {
                                        setItemsPerPage(Number(value))
                                        setCurrentPage(1)
                                    }}
                                >
                                    <SelectTrigger className="h-8 w-[70px]">
                                        <SelectValue placeholder={itemsPerPage} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="10">10</SelectItem>
                                        <SelectItem value="20">20</SelectItem>
                                        <SelectItem value="50">50</SelectItem>
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
                </CardContent>
            </Card>
        </div >
    );
}