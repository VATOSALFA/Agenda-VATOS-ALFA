'use client';

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { MoreHorizontal, Search, Download, Plus, Calendar as CalendarIcon, ChevronDown, Eye, Send, Printer, Trash2, AlertTriangle, Info, ChevronLeft, ChevronRight } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pie, PieChart as RechartsPieChart, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { format, startOfDay, endOfDay, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import { where, doc, deleteDoc, getDocs, collection, query as firestoreQuery } from "firebase/firestore";
import type { Client, Local, Profesional, Service, AuthCode, Sale, User } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { SaleDetailModal } from "@/components/sales/sale-detail-modal";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import * as XLSX from 'xlsx';
import { Alert, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/contexts/firebase-auth-context";


const DonutChartCard = ({ title, data, total, dataLabels }: { title: string, data: any[], total: number, dataLabels?: string[] }) => {
    const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];
    
    const allLabels = dataLabels || ['Efectivo', 'Tarjeta', 'Transferencia'];
    
    const tableData = allLabels.map(label => {
        const found = data.find(d => d.name.toLowerCase() === label.toLowerCase());
        return {
            name: label,
            value: found ? found.value : 0,
        };
    });

    const chartData = data.length > 0 ? data : [{ name: 'Sin datos', value: 1 }];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-xl font-medium">{title}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-6 items-center">
                <div className="h-[320px] relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={85}
                                outerRadius={145}
                                fill="#8884d8"
                                paddingAngle={data.length > 0 ? 2 : 0}
                                dataKey="value"
                                labelLine={false}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={data.length > 0 ? COLORS[index % COLORS.length] : '#e5e7eb'} />
                                ))}
                            </Pie>
                            {data.length > 0 && <Tooltip
                                contentStyle={{
                                    backgroundColor: 'hsl(var(--background))',
                                    border: '1px solid hsl(var(--border))'
                                }}
                                formatter={(value: number) => `$${value.toLocaleString('es-MX')}`}
                            />}
                        </RechartsPieChart>
                    </ResponsiveContainer>
                    {data.length > 0 && <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                        <span className="text-2xl font-bold">${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>}
                </div>
                 <div className="text-sm">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Tipo</TableHead>
                                <TableHead className="text-right">Monto</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tableData.map((item, index) => (
                                <TableRow key={index}>
                                    <TableCell className="capitalize font-medium flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                                        {item.name}
                                    </TableCell>
                                    <TableCell className="text-right">${item.value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}

export default function InvoicedSalesPage() {
    const { user, db } = useAuth();
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
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
    const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [authAction, setAuthAction] = useState<(() => void) | null>(null);
    const [authCode, setAuthCode] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const [queryKey, setQueryKey] = useState(0);

    const { data: allSales, loading: allSalesLoading } = useFirestoreQuery<Sale>('ventas');

    useEffect(() => {
        const today = new Date();
        const initialDateRange = { from: today, to: today };
        setDateRange(initialDateRange);
        const initialFilters = {
            dateRange: initialDateRange,
            local: user?.local_id || 'todos',
            paymentMethod: 'todos'
        };
        setActiveFilters(initialFilters);
        if(user?.local_id) {
            setLocalFilter(user.local_id);
        }
    }, [user]);


    const salesQueryConstraints = useMemo(() => {
        const constraints = [];
        if (activeFilters.dateRange?.from) {
            constraints.push(where('fecha_hora_venta', '>=', startOfDay(activeFilters.dateRange.from)));
        }
        if (activeFilters.dateRange?.to) {
            constraints.push(where('fecha_hora_venta', '<=', endOfDay(activeFilters.dateRange.to)));
        }
        return constraints;
    }, [activeFilters.dateRange]);

    const { data: salesDataFromHook, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', queryKey, ...salesQueryConstraints);
    const { data: clients } = useFirestoreQuery<Client>('clientes');
    const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
    const { data: professionals } = useFirestoreQuery<Profesional>('profesionales');
    const { data: users } = useFirestoreQuery<User>('usuarios');

    const sales = useMemo(() => {
        return salesDataFromHook.filter(sale => {
            const localMatch = activeFilters.local === 'todos' || sale.local_id === activeFilters.local;
            const paymentMethodMatch = activeFilters.paymentMethod === 'todos' || sale.metodo_pago === activeFilters.paymentMethod;
            return localMatch && paymentMethodMatch;
        });
    }, [salesDataFromHook, activeFilters.local, activeFilters.paymentMethod]);

    const clientMap = useMemo(() => {
        if (!clients) return new Map();
        return new Map(clients.map(c => [c.id, c]));
    }, [clients]);

    const sellerMap = useMemo(() => {
        const map = new Map<string, string>();
        if (professionals) {
            professionals.forEach(p => map.set(p.id, p.name));
        }
        if (users) {
            users.forEach(u => map.set(u.id, u.name));
        }
        return map;
    }, [professionals, users]);
    
    const populatedSales = useMemo(() => {
        if (!sales || !clientMap.size || !sellerMap.size) return [];
        return sales.map(sale => ({
            ...sale,
            client: clientMap.get(sale.cliente_id),
            professionalNames: sale.items?.map(item => sellerMap.get(item.barbero_id)).filter(Boolean).join(', ') || 'N/A'
        }));
    }, [sales, clientMap, sellerMap]);

    const totalPages = Math.ceil(populatedSales.length / itemsPerPage);
    const paginatedSales = populatedSales.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );


    const salesData = useMemo(() => {
        if (!populatedSales) {
            return {
                totalSales: { data: [], total: 0, dataLabels: ['Servicios', 'Productos'] },
                paymentMethods: { data: [], total: 0, dataLabels: ['Efectivo', 'Tarjeta', 'Transferencia'] }
            };
        }

        const salesByType = populatedSales.reduce((acc, sale) => {
          const saleSubtotal = sale.subtotal || 1; // Avoid division by zero
          const saleTotal = sale.total || 0;
            if (sale.items && Array.isArray(sale.items)) {
                sale.items.forEach(item => {
                    const type = (item as any).tipo === 'producto' ? 'Productos' : 'Servicios';
                    const itemSubtotal = (item as any).subtotal || 0;
                    const proportion = itemSubtotal / saleSubtotal;
                    const proportionalTotal = proportion * saleTotal;
                    acc[type] = (acc[type] || 0) + proportionalTotal;
                });
            }
            return acc;
        }, {} as Record<string, number>);

        const salesByPaymentMethod = populatedSales.reduce((acc, sale) => {
          if (sale.metodo_pago === 'combinado') {
              acc['efectivo'] = (acc['efectivo'] || 0) + (sale.detalle_pago_combinado?.efectivo || 0);
              acc['tarjeta'] = (acc['tarjeta'] || 0) + (sale.detalle_pago_combinado?.tarjeta || 0);
          } else {
              const method = sale.metodo_pago || 'otro';
              acc[method] = (acc[method] || 0) + (sale.total || 0);
          }
          return acc;
        }, {} as Record<string, number>);

        const totalSales = populatedSales.reduce((acc, sale) => acc + (sale.total || 0), 0);

        return {
            totalSales: {
                data: Object.entries(salesByType).map(([name, value]) => ({ name, value })),
                total: totalSales,
                dataLabels: ['Servicios', 'Productos'],
            },
            paymentMethods: {
                data: Object.entries(salesByPaymentMethod).map(([name, value]) => ({ name, value })),
                total: totalSales,
                dataLabels: ['Efectivo', 'Tarjeta', 'Transferencia']
            },
        };
    }, [populatedSales]);

    const handleSearch = () => {
        setActiveFilters({
            dateRange,
            local: localFilter,
            paymentMethod: paymentMethodFilter
        });
        setCurrentPage(1);
        setQueryKey(prev => prev + 1);
        toast({
            title: "Filtros aplicados",
            description: "Los datos de ventas han sido actualizados."
        })
    };
    
    const handleViewDetails = (sale: Sale) => {
        setSelectedSale(sale);
        setIsDetailModalOpen(true);
    }
    
    const formatDate = (date: any) => {
        if (!date) return 'Fecha no disponible';
        let dateObj: Date;
        if (date.seconds) { // Firestore Timestamp
          dateObj = new Date(date.seconds * 1000);
        } else if (typeof date === 'string') { // ISO String
          dateObj = parseISO(date);
        } else {
            return 'Fecha inválida';
        }
        if (isNaN(dateObj.getTime())) return 'Fecha inválida';
        return format(dateObj, 'PP p', { locale: es });
    };

    const handleDeleteSale = async () => {
        if (!saleToDelete || deleteConfirmationText !== 'ELIMINAR' || !db) return;
        try {
            await deleteDoc(doc(db, 'ventas', saleToDelete.id));
            toast({
                title: "Venta Eliminada",
                description: "La venta ha sido eliminada permanentemente.",
            });
            setQueryKey(prevKey => prevKey + 1);
        } catch (error) {
            console.error("Error deleting sale: ", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "No se pudo eliminar la venta.",
            });
        } finally {
            setSaleToDelete(null);
            setDeleteConfirmationText('');
        }
    };
    
    const triggerDownload = () => {
        if (populatedSales.length === 0) {
            toast({
                title: "No hay datos para exportar",
                description: "No hay ventas en el período seleccionado.",
                variant: 'destructive',
            });
            return;
        }
    
        const dataForExcel = populatedSales.map(sale => ({
            'Fecha de pago': formatDate(sale.fecha_hora_venta),
            'Cliente': sale.client?.nombre ? `${sale.client.nombre} ${sale.client.apellido}` : 'Desconocido',
            'Concepto': getSaleConcept(sale),
            'Detalle': sale.items?.map(i => i.nombre).join(', ') || 'N/A',
            'Profesional': sale.professionalNames || 'N/A',
            'Método de Pago': sale.metodo_pago,
            'Total': sale.total,
            'Descuento': '0.00%', // Placeholder
        }));
    
        const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Pagos");
    
        XLSX.writeFile(workbook, `Pagos_VATOS_ALFA_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    
        toast({
            title: "Descarga iniciada",
            description: "Tu archivo de Excel se está descargando.",
        });
    };
    
    const handleDownloadRequest = async () => {
        if (!authCode || !db) {
            toast({ variant: 'destructive', title: 'Código requerido' });
            return;
        }

        const authCodeQuery = firestoreQuery(
            collection(db, 'codigos_autorizacion'),
            where('code', '==', authCode),
            where('active', '==', true),
            where('download', '==', true)
        );
        
        const querySnapshot = await getDocs(authCodeQuery);

        if (querySnapshot.empty) {
            toast({ variant: 'destructive', title: 'Código inválido o sin permiso' });
        } else {
            toast({ title: 'Código correcto', description: 'Iniciando descarga...' });
            triggerDownload();
            setIsDownloadModalOpen(false);
            setAuthCode('');
        }
    };

    const handleOpenDeleteModal = (sale: Sale) => {
        const action = () => setSaleToDelete(sale);
        if (user?.role === 'Administrador general' || user?.role === 'Administrador local') {
            action();
        } else {
            setAuthAction(() => action);
            setIsAuthModalOpen(true);
        }
    }

    const handleAuthCodeSubmit = async () => {
        if (!authCode || !db) {
            toast({ variant: 'destructive', title: 'Código requerido' });
            return;
        }
        const authCodeQuery = firestoreQuery(
            collection(db, 'codigos_autorizacion'),
            where('code', '==', authCode),
            where('active', '==', true),
            where('cashbox', '==', true)
        );
        const querySnapshot = await getDocs(authCodeQuery);
        if (querySnapshot.empty) {
            toast({ variant: 'destructive', title: 'Código inválido o sin permiso' });
        } else {
            toast({ title: 'Código correcto' });
            authAction?.();
            setIsAuthModalOpen(false);
        }
        setAuthCode('');
        setAuthAction(null);
    };

    const getSaleConcept = (sale: Sale) => {
        if (!sale.items || sale.items.length === 0) return 'N/A';
        const hasService = sale.items.some(item => item.tipo === 'servicio');
        const hasProduct = sale.items.some(item => item.tipo === 'producto');

        if (hasService && hasProduct) return 'Mixto';
        if (hasService) return 'Servicio';
        if (hasProduct) return 'Producto';
        return 'N/A';
    }

    const isLocalAdmin = user?.role !== 'Administrador general';


    return (
        <>
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
                    <Select value={localFilter} onValueChange={setLocalFilter} disabled={isLocalAdmin || localesLoading}>
                      <SelectTrigger>
                        <SelectValue placeholder={localesLoading ? "Cargando..." : "Todas las sucursales"} />
                      </SelectTrigger>
                      <SelectContent>
                        {!isLocalAdmin && <SelectItem value="todos">Todas las sucursales</SelectItem>}
                        {locales.map(local => (
                          <SelectItem key={local.id} value={local.id}>{local.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                        <SelectTrigger><SelectValue placeholder="Todos los métodos de pago" /></SelectTrigger>
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
                {salesLoading ? (
                    <>
                        <Card><CardContent className="p-6"><Skeleton className="h-[380px] w-full" /></CardContent></Card>
                        <Card><CardContent className="p-6"><Skeleton className="h-[380px] w-full" /></CardContent></Card>
                    </>
                ) : (
                    <>
                        <DonutChartCard 
                            title="Ventas Facturadas Totales" 
                            data={salesData.totalSales.data} 
                            total={salesData.totalSales.total} 
                            dataLabels={salesData.totalSales.dataLabels}
                        />
                        <DonutChartCard 
                            title="Medios de Pago" 
                            data={salesData.paymentMethods.data} 
                            total={salesData.paymentMethods.total}
                            dataLabels={salesData.paymentMethods.dataLabels}
                        />
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
                        <Button variant="outline" onClick={() => setIsDownloadModalOpen(true)}><Download className="mr-2 h-4 w-4" /> Descargar pagos</Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha de pago</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Concepto</TableHead>
                                <TableHead>Detalle</TableHead>
                                <TableHead>Profesional</TableHead>
                                <TableHead>Método de Pago</TableHead>
                                <TableHead>Total</TableHead>
                                <TableHead>Descuento</TableHead>
                                <TableHead className="text-right">Opciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {salesLoading ? (
                                Array.from({length: 5}).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell colSpan={9}><Skeleton className="h-6 w-full" /></TableCell>
                                    </TableRow>
                                ))
                            ) : paginatedSales.length > 0 ? (
                                paginatedSales.map((sale) => (
                                <TableRow key={sale.id}>
                                    <TableCell>{formatDate(sale.fecha_hora_venta)}</TableCell>
                                    <TableCell>{sale.client?.nombre || 'Desconocido'}</TableCell>
                                    <TableCell className="capitalize">{getSaleConcept(sale)}</TableCell>
                                    <TableCell>{sale.items && Array.isArray(sale.items) ? sale.items.map(i => i.nombre).join(', ') : 'N/A'}</TableCell>
                                    <TableCell>{sale.professionalNames}</TableCell>
                                    <TableCell className="capitalize">{sale.metodo_pago}</TableCell>
                                    <TableCell>${(sale.total || 0).toLocaleString('es-MX')}</TableCell>
                                    <TableCell>
                                        {sale.descuento?.valor > 0 
                                            ? (sale.descuento.tipo === 'percentage' ? `${sale.descuento.valor}%` : `$${sale.descuento.valor.toLocaleString('es-MX')}`)
                                            : '0.00%'
                                        }
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button variant="outline" size="sm" onClick={() => handleViewDetails(sale)}>
                                                <Eye className="mr-2 h-4 w-4" /> Ver
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="outline" size="sm">
                                                        Acciones <ChevronDown className="ml-2 h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onSelect={() => toast({ title: "Funcionalidad no implementada", description: "El envío de comprobantes estará disponible próximamente." })}>
                                                        <Send className="mr-2 h-4 w-4 text-blue-500" />
                                                        <span className="text-blue-500">Enviar Comprobante</span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => window.print()}>
                                                        <Printer className="mr-2 h-4 w-4 text-yellow-500" />
                                                        <span className="text-yellow-500">Imprimir</span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => handleOpenDeleteModal(sale)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Eliminar
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center h-24 text-muted-foreground">
                                        No hay ventas para el período seleccionado.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        {!salesLoading && populatedSales.length > 0 && (
                             <TableFooter>
                                <TableRow>
                                    <TableCell colSpan={6} className="text-right font-bold">Total</TableCell>
                                    <TableCell className="font-bold">
                                        ${populatedSales.reduce((acc, s) => acc + (s.total || 0), 0).toLocaleString('es-MX')}
                                    </TableCell>
                                    <TableCell colSpan={2}></TableCell>
                                </TableRow>
                            </TableFooter>
                        )}
                    </Table>
                </CardContent>
            </Card>

            {!salesLoading && populatedSales.length > 0 && (
                <div className="flex items-center justify-end space-x-6 p-4">
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

        </div>
        
        {selectedSale && (
            <SaleDetailModal
                isOpen={isDetailModalOpen}
                onOpenChange={setIsDetailModalOpen}
                sale={selectedSale}
            />
        )}
        {saleToDelete && (
         <AlertDialog open={!!saleToDelete} onOpenChange={(open) => {
             if(!open) {
                setSaleToDelete(null);
                setDeleteConfirmationText('');
            }
         }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center"><AlertTriangle className="h-6 w-6 mr-2 text-destructive"/>¿Estás absolutamente seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta acción no se puede deshacer. Esto eliminará permanentemente la venta seleccionada.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                 <div className="space-y-2 py-2">
                    <Label htmlFor="delete-confirm">Para confirmar, escribe <strong>ELIMINAR</strong></Label>
                    <Input 
                        id="delete-confirm"
                        value={deleteConfirmationText}
                        onChange={(e) => setDeleteConfirmationText(e.target.value)}
                        placeholder="ELIMINAR"
                    />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => { setSaleToDelete(null); setDeleteConfirmationText(''); }}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction 
                        onClick={handleDeleteSale} 
                        disabled={deleteConfirmationText !== 'ELIMINAR'}
                        className="bg-destructive hover:bg-destructive/90"
                    >
                        Sí, eliminar venta
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}

      <AlertDialog open={isDownloadModalOpen} onOpenChange={setIsDownloadModalOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-6 w-6 text-yellow-500" />
                    Requiere Autorización
                </AlertDialogTitle>
                <AlertDialogDescription>
                    Para descargar este archivo, es necesario un código de autorización con permisos de descarga.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
                <Label htmlFor="auth-code">Código de Autorización</Label>
                <Input id="auth-code" type="password" placeholder="Ingrese el código" value={authCode} onChange={e => setAuthCode(e.target.value)} />
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setAuthCode('')}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDownloadRequest}>Aceptar</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    
    <AlertDialog open={isAuthModalOpen} onOpenChange={setIsAuthModalOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-6 w-6 text-yellow-500" />
                    Requiere Autorización
                </AlertDialogTitle>
                <AlertDialogDescription>
                    Para realizar esta acción, es necesario un código con permisos de caja.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
                <Label htmlFor="auth-code-action">Código de Autorización</Label>
                <Input id="auth-code-action" type="password" placeholder="Ingrese el código" value={authCode} onChange={e => setAuthCode(e.target.value)} />
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => { setAuthCode(''); setAuthAction(null); }}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleAuthCodeSubmit}>Aceptar</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
