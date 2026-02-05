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
import { Calendar as CalendarIcon, Download, Filter, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Local, Profesional } from "@/lib/types";
import { useAuth } from "@/contexts/firebase-auth-context";

export default function TipsPage() {
    const { user } = useAuth();
    const isReceptionist = useMemo(() => user?.role === 'Recepcionista' || user?.role === 'Recepcionista (Sin edición)', [user]);
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);

    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

    const handleDateSelect = (range: DateRange | undefined) => {
        setDateRange(range);
        if (range?.from && range?.to) {
            setIsPopoverOpen(false);
        }
    };
    const [localFilter, setLocalFilter] = useState('todos');
    const [professionalFilter, setProfessionalFilter] = useState('todos');
    const [queryKey, setQueryKey] = useState(0); // Para forzar recarga si es necesario

    // 1. Cargar catálogos
    const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', where('active', '==', true));
    const { data: clients } = useFirestoreQuery<any>('clientes'); // Traemos clientes para mapear nombres si hace falta

    // 3. Configurar rango de fechas inicial (Hoy)
    useEffect(() => {
        if (!dateRange) {
            const today = new Date();
            const from = startOfDay(today); // Inicio del día
            const to = endOfDay(today);     // Fin del día
            setDateRange({ from, to });
        }
        if (isReceptionist && user?.local_id) {
            setLocalFilter(user.local_id);
        }
    }, [user, isReceptionist]);

    // 3. Construir consulta a 'ventas' basada en fechas
    const salesConstraints = useMemo(() => {
        if (!dateRange?.from) return [];

        const start = Timestamp.fromDate(startOfDay(dateRange.from));
        // Si no hay 'to', usamos el final del mismo día 'from'
        const end = Timestamp.fromDate(endOfDay(dateRange.to || dateRange.from));

        // Importante: Firestore requiere índices compuestos para rangos + otros filtros.
        // Para simplificar y evitar errores de índices ahora, traemos por fecha y filtramos propina en cliente.
        return [
            where('fecha_hora_venta', '>=', start),
            where('fecha_hora_venta', '<=', end),
            orderBy('fecha_hora_venta', 'desc')
        ];
    }, [dateRange]);

    // 4. Ejecutar consulta
    const { data: rawSales, loading: salesLoading } = useFirestoreQuery<any>('ventas', JSON.stringify(dateRange), ...salesConstraints);

    // 5. Procesar y Filtrar Datos en Memoria
    const filteredTips = useMemo(() => {
        if (!rawSales) return [];

        return rawSales
            // A. Solo ventas con propina registrada mayor a 0
            .filter(sale => (sale.propina && Number(sale.propina) > 0))
            // B. Filtrar por Local
            .filter(sale => localFilter === 'todos' || sale.local_id === localFilter)
            // C. Filtrar por Profesional (Buscamos si el profesional participó en algún item de la venta)
            .filter(sale => {
                if (professionalFilter === 'todos') return true;
                // Revisamos los items de la venta para ver si el barbero seleccionado participó
                return sale.items?.some((item: any) => item.barbero_id === professionalFilter);
            })
            .map(sale => {
                // D. Enriquecer datos para la tabla

                // Obtener nombres de profesionales involucrados en esta venta
                const uniqueBarberIds = Array.from(new Set(sale.items?.map((i: any) => i.barbero_id).filter(Boolean)));
                const professionalNames = uniqueBarberIds.map((id: any) => {
                    const prof = professionals?.find(p => p.id === id);
                    return prof ? prof.name : 'Desconocido';
                }).join(', ');

                // Obtener nombre del local
                const localName = locales?.find(l => l.id === sale.local_id)?.name || 'Local desconocido';

                // Obtener nombre del cliente (si no viene en la venta, buscar en catalogo)
                // Normalmente guardas 'cliente_nombre' en la venta, si no, fallback al ID
                const clientName = clients?.find((c: any) => c.id === sale.cliente_id)?.nombre
                    ? `${clients.find((c: any) => c.id === sale.cliente_id)?.nombre} ${clients.find((c: any) => c.id === sale.cliente_id)?.apellido || ''}`
                    : (sale.cliente_nombre || 'Cliente General');

                return {
                    id: sale.id,
                    saleId: sale.id.slice(0, 8), // ID corto visual
                    date: sale.fecha_hora_venta?.toDate(), // Convertir Timestamp a Date
                    localName: localName,
                    clientName: clientName,
                    professionalName: professionalNames || 'Sin asignar',
                    tip: Number(sale.propina)
                };
            });
    }, [rawSales, localFilter, professionalFilter, locales, professionals, clients]);

    const totalTips = useMemo(() => {
        return filteredTips.reduce((acc, item) => acc + item.tip, 0);
    }, [filteredTips]);

    const handleSearch = () => {
        setQueryKey(prev => prev + 1); // Forzar re-render si fuera necesario
    }

    const isLoading = localesLoading || professionalsLoading || salesLoading;

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
                            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
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
                                        disabled={isReceptionist ? (date) => date > new Date() || date < subDays(new Date(), 2) : undefined}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Local</label>
                            <Select value={localFilter} onValueChange={setLocalFilter} disabled={localesLoading || isReceptionist}>
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
                            ) : filteredTips.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-center h-24">No hay propinas registradas en este período.</TableCell></TableRow>
                            ) : filteredTips.map((tip) => (
                                <TableRow key={tip.id}>
                                    <TableCell className="font-mono text-xs text-muted-foreground">...{tip.saleId}</TableCell>
                                    <TableCell>{tip.date ? format(tip.date, 'dd/MM/yyyy HH:mm', { locale: es }) : '-'}</TableCell>
                                    <TableCell>{tip.localName}</TableCell>
                                    <TableCell>{tip.clientName}</TableCell>
                                    <TableCell>{tip.professionalName}</TableCell>
                                    <TableCell className="text-right font-semibold text-green-600">+${tip.tip.toLocaleString('es-MX')}</TableCell>
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
                </CardContent>
            </Card>
        </div >
    );
}