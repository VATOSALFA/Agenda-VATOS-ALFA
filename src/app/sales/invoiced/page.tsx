
'use client';

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoreHorizontal, Search, Download, Plus, Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pie, PieChart as RechartsPieChart, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { format, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import { where } from "firebase/firestore";
import type { Client, Local } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

interface Sale {
    id: string;
    fecha_hora_venta?: { seconds: number };
    cliente_id: string;
    local_id?: string;
    metodo_pago: string;
    total: number;
    items?: { nombre: string }[];
}

const DonutChartCard = ({ title, data, total }: { title: string, data: any[], total: number }) => {
    const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-xl font-medium">{title}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-5 gap-4 items-center">
                <div className="h-[320px] relative col-span-3">
                    <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={85}
                                outerRadius={145}
                                fill="#8884d8"
                                paddingAngle={2}
                                dataKey="value"
                                labelLine={false}
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'hsl(var(--background))',
                                    border: '1px solid hsl(var(--border))'
                                }}
                                formatter={(value: number) => `$${value.toLocaleString('es-CL')}`}
                            />
                        </RechartsPieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                        <span className="text-2xl font-bold">${total.toLocaleString('es-CL')}</span>
                    </div>
                </div>
                <div className="text-sm col-span-2">
                    <ul>
                        {data.map((item, index) => (
                            <li key={index} className="flex justify-between items-center py-1 border-b">
                                <div className="flex items-center">
                                    <span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                                    <span className="capitalize">{item.name}</span>
                                </div>
                                <span>${item.value.toLocaleString('es-CL')}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </CardContent>
        </Card>
    )
}

export default function InvoicedSalesPage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [localFilter, setLocalFilter] = useState('todos');
    const [paymentMethodFilter, setPaymentMethodFilter] = useState('todos');
    const [activeFilters, setActiveFilters] = useState<{
        dateRange: DateRange | undefined;
        local: string;
        paymentMethod: string;
    }>({
        dateRange: undefined,
        local: 'todos',
        paymentMethod: 'todos'
    });
    const { toast } = useToast();

    useEffect(() => {
        // Set initial date range on client-side to avoid hydration mismatch
        const today = new Date();
        const initialDateRange = { from: today, to: today };
        setDateRange(initialDateRange);
        setActiveFilters({ dateRange: initialDateRange, local: 'todos', paymentMethod: 'todos' });
    }, []);


    const salesQueryConstraints = useMemo(() => {
        const constraints = [];
        if (activeFilters.dateRange?.from) {
            constraints.push(where('fecha_hora_venta', '>=', startOfDay(activeFilters.dateRange.from)));
        }
        if (activeFilters.dateRange?.to) {
            constraints.push(where('fecha_hora_venta', '<=', endOfDay(activeFilters.dateRange.to)));
        }
        if (activeFilters.local !== 'todos') {
            constraints.push(where('local_id', '==', activeFilters.local));
        }
        if (activeFilters.paymentMethod !== 'todos') {
            constraints.push(where('metodo_pago', '==', activeFilters.paymentMethod));
        }
        return constraints;
    }, [activeFilters]);

    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', salesQueryConstraints);
    const { data: clients } = useFirestoreQuery<Client>('clientes');
    const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');

    const clientMap = useMemo(() => {
        if (!clients) return new Map();
        return new Map(clients.map(c => [c.id, c]));
    }, [clients]);

    const salesData = useMemo(() => {
        if (salesLoading || !sales || sales.length === 0) return null;

        const salesByType = sales.reduce((acc, sale) => {
            if (sale.items && Array.isArray(sale.items)) {
                sale.items.forEach(item => {
                    const type = (item as any).tipo === 'producto' ? 'Productos' : 'Servicios';
                    acc[type] = (acc[type] || 0) + (item as any).subtotal;
                });
            }
            return acc;
        }, {} as Record<string, number>);

        const salesByPaymentMethod = sales.reduce((acc, sale) => {
            const method = sale.metodo_pago || 'Otro';
            acc[method] = (acc[method] || 0) + (sale.total || 0);
            return acc;
        }, {} as Record<string, number>);

        const totalSales = sales.reduce((acc, sale) => acc + (sale.total || 0), 0);

        return {
            totalSales: {
                data: Object.entries(salesByType).map(([name, value]) => ({ name, value })),
                total: totalSales,
            },
            paymentMethods: {
                data: Object.entries(salesByPaymentMethod).map(([name, value]) => ({ name, value })),
                total: totalSales,
            },
        };
    }, [sales, salesLoading]);

    const handleSearch = () => {
        setActiveFilters({
            dateRange,
            local: localFilter,
            paymentMethod: paymentMethodFilter
        });
        toast({
            title: "Filtros aplicados",
            description: "Los datos de ventas han sido actualizados."
        })
    };

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Ventas Facturadas</h2>

            <Card>
                <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"} className="justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (
                                    dateRange.to ? (
                                        `${format(dateRange.from, "LLL dd, y", { locale: es })} - ${format(dateRange.to, "LLL dd, y", { locale: es })}`
                                    ) : (
                                        format(dateRange.from, "LLL dd, y", { locale: es })
                                    )
                                ) : (
                                    <span>Seleccionar rango</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} />
                        </PopoverContent>
                    </Popover>
                    <Select value={localFilter} onValueChange={setLocalFilter} disabled={localesLoading}>
                      <SelectTrigger>
                        <SelectValue placeholder={localesLoading ? "Cargando..." : "Todas las sucursales"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas las sucursales</SelectItem>
                        {locales.map(local => (
                          <SelectItem key={local.id} value={local.id}>{local.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="todos">Todos los métodos de pago</SelectItem>
                            <SelectItem value="efectivo">Efectivo</SelectItem>
                            <SelectItem value="tarjeta">Tarjeta</SelectItem>
                            <SelectItem value="transferencia">Transferencia</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button onClick={handleSearch}>
                        <Search className="mr-2 h-4 w-4" />
                        Buscar
                    </Button>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                {salesLoading || !salesData ? (
                    <>
                        <Card><CardContent className="p-6"><Skeleton className="h-[380px] w-full" /></CardContent></Card>
                        <Card><CardContent className="p-6"><Skeleton className="h-[380px] w-full" /></CardContent></Card>
                    </>
                ) : (
                    <>
                        <DonutChartCard title="Ventas Facturadas Totales" data={salesData.totalSales.data} total={salesData.totalSales.total} />
                        <DonutChartCard title="Medios de Pago" data={salesData.paymentMethods.data} total={salesData.paymentMethods.total} />
                    </>
                )}
            </div>

            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <div>
                        <CardTitle>Pagos</CardTitle>
                        <CardDescription>Listado de ventas facturadas en el período seleccionado.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Descargar pagos</Button>
                        <Button><Plus className="mr-2 h-4 w-4" /> Nueva venta</Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="pagos">
                        <TabsList>
                            <TabsTrigger value="pagos">Pagos</TabsTrigger>
                            <TabsTrigger value="ventas-internas" disabled>Ventas Internas</TabsTrigger>
                        </TabsList>
                        <TabsContent value="pagos">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha de pago</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Detalle</TableHead>
                                        <TableHead>Método de Pago</TableHead>
                                        <TableHead>Total</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {salesLoading ? (
                                        Array.from({length: 5}).map((_, i) => (
                                            <TableRow key={i}>
                                                <TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell>
                                            </TableRow>
                                        ))
                                    ) : sales.map((sale) => (
                                        <TableRow key={sale.id}>
                                            <TableCell>
                                                {sale.fecha_hora_venta?.seconds
                                                  ? format(sale.fecha_hora_venta.seconds * 1000, 'PP p', { locale: es })
                                                  : 'Fecha no disponible'}
                                            </TableCell>
                                            <TableCell>{clientMap.get(sale.cliente_id)?.nombre || 'Desconocido'}</TableCell>
                                            <TableCell>{sale.items && Array.isArray(sale.items) ? sale.items.map(i => i.nombre).join(', ') : 'N/A'}</TableCell>
                                            <TableCell className="capitalize">{sale.metodo_pago}</TableCell>
                                            <TableCell>${(sale.total || 0).toLocaleString('es-CL')}</TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem>Ver Detalle</DropdownMenuItem>
                                                        <DropdownMenuItem>Anular Venta</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            { !salesLoading && sales.length > 0 &&
                                <div className="flex justify-end font-bold text-lg pt-4 pr-4">
                                    Total: ${sales.reduce((acc, s) => acc + (s.total || 0), 0).toLocaleString('es-CL')}
                                </div>
                            }
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

        </div>
    );
}
