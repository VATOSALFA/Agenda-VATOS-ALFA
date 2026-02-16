
'use client';

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { MoreHorizontal, Search, Download, Plus, Calendar as CalendarIcon, ChevronDown, Eye, Send, Printer, Trash2, AlertTriangle, Info, ChevronLeft, ChevronRight, Pencil, Check, ChevronsUpDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pie, PieChart as RechartsPieChart, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { format, startOfDay, endOfDay, parseISO, subDays } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import { where, doc, deleteDoc, getDocs, collection, query as firestoreQuery, writeBatch, increment, getDoc, Timestamp, updateDoc } from "firebase/firestore";
import type { Client, Local, Profesional, Service, AuthCode, Sale, User, Role } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { SaleDetailModal } from "@/components/sales/sale-detail-modal";
import { cn } from "@/lib/utils";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import * as XLSX from 'xlsx';
import { Alert, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/contexts/firebase-auth-context";
import { db } from "@/lib/firebase-client";
import { DonutChartCard } from "@/components/sales/donut-chart-card";
import { useInvoicedSales } from "./use-invoiced-sales";




export default function InvoicedSalesPage() {
    const { user } = useAuth();
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
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

    // Edit sale state
    const [saleToEdit, setSaleToEdit] = useState<Sale | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editForm, setEditForm] = useState({
        fecha_hora_venta: '',
        cliente_id: '',
        detalle: '',
        barbero_id: '',
        metodo_pago: '',
        total: 0,
        descuento_valor: 0,
        descuento_tipo: 'percentage' as 'fixed' | 'percentage',
    });
    const [isEditSubmitting, setIsEditSubmitting] = useState(false);








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
        if (user?.local_id) {
            setLocalFilter(user.local_id);
        }
    }, [user]); // Removed isReceptionist dependency as logic is now uniform


    const { sales: populatedSales, loading: salesLoading, salesData } = useInvoicedSales(activeFilters, queryKey);
    const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
    const { data: professionals } = useFirestoreQuery<Profesional>('profesionales');

    const professionalOptions = useMemo(() => {
        return professionals?.map(p => ({ value: p.id, label: p.name })) || [];
    }, [professionals]);

    const totalPages = Math.ceil(populatedSales.length / itemsPerPage);
    const paginatedSales = populatedSales.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );


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
            const batch = writeBatch(db);
            const saleRef = doc(db, 'ventas', saleToDelete.id);

            // Revertir inventario si hay productos
            if (saleToDelete.items && saleToDelete.items.length > 0) {
                for (const item of saleToDelete.items) {
                    if (item.tipo === 'producto' && item.id) {
                        const productRef = doc(db, 'productos', item.id);
                        const productSnap = await getDoc(productRef);

                        if (productSnap.exists()) {
                            const productData = productSnap.data();
                            const currentStock = productData.stock || 0;
                            const quantityToReturn = item.cantidad || 1;
                            const newStock = currentStock + quantityToReturn;

                            // 1. Incrementar Stock
                            batch.update(productRef, {
                                stock: increment(quantityToReturn)
                            });

                            // 2. Registrar Movimiento
                            const movementRef = doc(collection(db, 'movimientos_inventario'));
                            batch.set(movementRef, {
                                date: Timestamp.now(),
                                local_id: saleToDelete.local_id || 'unknown',
                                product_id: item.id,
                                presentation_id: productData.presentation_id || 'default',
                                from: currentStock,
                                to: newStock,
                                cause: 'Cancellation',
                                staff_id: user?.uid || 'unknown',
                                comment: `Devolución automática por cancelación de venta: ${saleToDelete.id}`,
                                product_name: item.nombre || productData.nombre,
                                staff_name: user?.displayName || user?.email || 'Admin',
                                local_name: 'System',
                                concepto: 'Devolución por venta cancelada'
                            });
                        }
                    }
                }
            }

            // Revertir Reserva asociada (si existe)
            if (saleToDelete.reservationId) {
                const reservationRef = doc(db, 'reservas', saleToDelete.reservationId);
                const reservationSnap = await getDoc(reservationRef);

                if (reservationSnap.exists()) {
                    const resData = reservationSnap.data();
                    const anticipo = Number(resData.anticipo_pagado || 0);
                    const total = Number(resData.total || 0);

                    // Determinar el estado de pago previo (si hubo anticipo)
                    const newPagoEstado = anticipo > 0 ? 'deposit_paid' : 'pendiente';
                    const newSaldoPendiente = total > anticipo ? (total - anticipo) : total;

                    batch.update(reservationRef, {
                        estado: 'Reservado', // Regresa a estado de "Reservado" (Azul)
                        pago_estado: newPagoEstado,
                        saldo_pendiente: newSaldoPendiente,
                        // Limpiamos campos de cierre si existen
                        monto_pagado: anticipo, // Regresamos al anticipo (o 0)
                    });
                }
            }

            // Eliminar Venta
            batch.delete(saleRef);

            await batch.commit();

            toast({
                title: "Venta Eliminada",
                description: "La venta ha sido eliminada y el stock revertido.",
            });
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
            'Total': (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total) ? sale.monto_pagado_real : sale.total,
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
            // Delay opening the modal slightly to allow dropdown to close cleanly
            // This prevents race conditions with body lock/pointer-events
            setTimeout(() => {
                setAuthAction(() => action);
                setAuthPermissionField('cashbox');
                setIsAuthModalOpen(true);
            }, 100);
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
            where(authPermissionField, '==', true)
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

    const handleOpenEditModal = (sale: Sale) => {
        const action = () => {
            setSaleToEdit(sale);
            // Parse date for the input
            let dateStr = '';
            if (sale.fecha_hora_venta?.seconds) {
                const d = new Date(sale.fecha_hora_venta.seconds * 1000);
                dateStr = format(d, "yyyy-MM-dd'T'HH:mm");
            } else if (typeof sale.fecha_hora_venta === 'string') {
                dateStr = sale.fecha_hora_venta;
            }
            setEditForm({
                fecha_hora_venta: dateStr,
                cliente_id: sale.cliente_id || '',
                detalle: sale.items?.map(i => i.nombre).join(', ') || '',
                barbero_id: sale.items?.[0]?.barbero_id || '',
                metodo_pago: sale.metodo_pago || '',
                total: sale.total || 0,
                descuento_valor: sale.descuento?.valor || 0,
                descuento_tipo: sale.descuento?.tipo || 'percentage',
            });
            setIsEditModalOpen(true);
        };
        if (user?.role === 'Administrador general' || user?.role === 'Administrador local') {
            action();
        } else {
            setTimeout(() => {
                setAuthAction(() => action);
                setAuthPermissionField('invoiced_sales');
                setIsAuthModalOpen(true);
            }, 100);
        }
    };

    const handleEditSubmit = async () => {
        if (!saleToEdit || !db) return;
        setIsEditSubmitting(true);
        try {
            const saleRef = doc(db, 'ventas', saleToEdit.id);
            const newDate = new Date(editForm.fecha_hora_venta);

            const updateData: any = {
                fecha_hora_venta: Timestamp.fromDate(newDate),
                cliente_id: editForm.cliente_id,
                metodo_pago: editForm.metodo_pago,
                total: editForm.total,
                descuento: {
                    valor: editForm.descuento_valor,
                    tipo: editForm.descuento_tipo,
                },
            };

            // Update item names if detalle changed
            if (saleToEdit.items && saleToEdit.items.length > 0) {
                const detalleNames = editForm.detalle.split(',').map(d => d.trim());
                const updatedItems = saleToEdit.items.map((item, idx) => ({
                    ...item,
                    nombre: detalleNames[idx] || item.nombre,
                    barbero_id: editForm.barbero_id || item.barbero_id,
                }));
                updateData.items = updatedItems;
            }

            await updateDoc(saleRef, updateData);

            toast({
                title: 'Venta actualizada',
                description: 'Los cambios han sido guardados correctamente.',
            });
            setIsEditModalOpen(false);
            setSaleToEdit(null);
        } catch (error) {
            console.error('Error updating sale:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudo actualizar la venta.',
            });
        } finally {
            setIsEditSubmitting(false);
        }
    };

    const [authPermissionField, setAuthPermissionField] = useState<string>('cashbox');

    const isLocalAdmin = user?.role !== 'Administrador general';


    const { data: roles } = useFirestoreQuery<Role>('roles');
    const userRole = roles?.find(r => r.title === user?.role);
    const historyLimit = userRole?.historyRestrictionDays;

    return (
        <>
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <h2 className="text-3xl font-bold tracking-tight">Ventas facturadas</h2>

                <Card>
                    <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Popover open={isCalendarOpen} onOpenChange={(open) => {
                            setIsCalendarOpen(open);
                            if (open) {
                                setDateRange(undefined);
                            }
                        }}>
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
                                <Calendar
                                    mode="range"
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
                                <SelectItem value="Pagos en linea">Pagos en linea</SelectItem>
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
                                title="Ventas facturadas totales"
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
                                    Array.from({ length: 5 }).map((_, i) => (
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
                                            <TableCell className="capitalize">
                                                {sale.pago_estado === 'deposit_paid' ? 'Pago en Linea' : (
                                                    sale.metodo_pago === 'combinado' ? 'Combinado' :
                                                        sale.metodo_pago === 'mercadopago' ? 'Pago en Linea' : sale.metodo_pago
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                ${((sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total) ? sale.monto_pagado_real : sale.total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell>0.00%</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="ghost" size="icon" onClick={() => handleViewDetails(sale)}>
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon">
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onSelect={() => handleOpenEditModal(sale)}>
                                                                <Pencil className="mr-2 h-4 w-4 text-blue-500" />
                                                                <span className="text-blue-500">Editar</span>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onSelect={() => window.print()}>
                                                                <Printer className="mr-2 h-4 w-4 text-secondary" />
                                                                <span className="text-secondary">Imprimir</span>
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
                                            ${populatedSales.reduce((acc, sale) => {
                                                const actualRevenue = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                                                    ? sale.monto_pagado_real
                                                    : (sale.total || 0);
                                                return acc + actualRevenue;
                                            }, 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell colSpan={2}></TableCell>
                                    </TableRow>
                                </TableFooter>
                            )}
                        </Table>
                    </CardContent>
                </Card >

                {!salesLoading && populatedSales.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-end gap-4 sm:gap-6 p-4">
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
                )
                }

            </div >

            {selectedSale && (
                <SaleDetailModal
                    isOpen={isDetailModalOpen}
                    onOpenChange={(open) => {
                        setIsDetailModalOpen(open);
                        if (!open) setSelectedSale(null);
                    }}
                    sale={selectedSale}
                />
            )
            }

            {
                saleToDelete && (
                    <Dialog open={!!saleToDelete} onOpenChange={(open) => {
                        if (!open) {
                            setSaleToDelete(null);
                            setDeleteConfirmationText('');
                        }
                    }}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle className="flex items-center"><AlertTriangle className="h-6 w-6 mr-2 text-destructive" />¿Estás absolutamente seguro?</DialogTitle>
                                <DialogDescription>
                                    Esta acción no se puede deshacer. Esto eliminará permanentemente la venta seleccionada.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-2 py-2">
                                <Label htmlFor="delete-confirm">Para confirmar, escribe <strong>ELIMINAR</strong></Label>
                                <Input
                                    id="delete-confirm"
                                    value={deleteConfirmationText}
                                    onChange={(e) => setDeleteConfirmationText(e.target.value)}
                                    placeholder="ELIMINAR"
                                />
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => { setSaleToDelete(null); setDeleteConfirmationText(''); }}>Cancelar</Button>
                                <Button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleDeleteSale();
                                    }}
                                    disabled={deleteConfirmationText !== 'ELIMINAR'}
                                    className="bg-destructive hover:bg-destructive/90"
                                >
                                    Sí, eliminar venta
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )
            }

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
                            Para realizar esta acción, es necesario un código de autorización.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4">
                        <Label htmlFor="auth-code-action">Código de Autorización</Label>
                        <Input id="auth-code-action" type="password" placeholder="Ingrese el código" value={authCode} onChange={e => setAuthCode(e.target.value)} />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => { setAuthCode(''); setAuthAction(null); setIsAuthModalOpen(false); }}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleAuthCodeSubmit}>Aceptar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Edit Sale Modal */}
            {saleToEdit && (
                <Dialog open={isEditModalOpen} onOpenChange={(open) => { if (!open) { setIsEditModalOpen(false); setSaleToEdit(null); } }}>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Editar Venta</DialogTitle>
                            <DialogDescription>Modifica los datos de la venta facturada.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                            <div className="space-y-2">
                                <Label htmlFor="edit-date">Fecha de pago</Label>
                                <Input
                                    id="edit-date"
                                    type="datetime-local"
                                    value={editForm.fecha_hora_venta}
                                    onChange={e => setEditForm(prev => ({ ...prev, fecha_hora_venta: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-client">Cliente</Label>
                                <Input
                                    id="edit-client"
                                    value={saleToEdit.client ? `${saleToEdit.client.nombre} ${saleToEdit.client.apellido || ''}`.trim() : 'Cliente desconocido'}
                                    disabled
                                    className="bg-muted"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-detalle">Detalle (servicios/productos)</Label>
                                <Input
                                    id="edit-detalle"
                                    value={editForm.detalle}
                                    onChange={e => setEditForm(prev => ({ ...prev, detalle: e.target.value }))}
                                    placeholder="Ej: Corte de cabello, Barba"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-professional">Profesional</Label>
                                <Select value={editForm.barbero_id} onValueChange={v => setEditForm(prev => ({ ...prev, barbero_id: v }))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar profesional" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {professionals?.map(pro => (
                                            <SelectItem key={pro.id} value={pro.id}>{pro.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-payment">Método de pago</Label>
                                <Select value={editForm.metodo_pago} onValueChange={v => setEditForm(prev => ({ ...prev, metodo_pago: v }))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar método" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="efectivo">Efectivo</SelectItem>
                                        <SelectItem value="tarjeta">Tarjeta</SelectItem>
                                        <SelectItem value="transferencia">Transferencia</SelectItem>
                                        <SelectItem value="combinado">Combinado</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-total">Total ($)</Label>
                                <Input
                                    id="edit-total"
                                    type="number"
                                    step="0.01"
                                    value={editForm.total}
                                    onChange={e => setEditForm(prev => ({ ...prev, total: parseFloat(e.target.value) || 0 }))}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="edit-discount-value">Descuento</Label>
                                    <Input
                                        id="edit-discount-value"
                                        type="number"
                                        step="0.01"
                                        value={editForm.descuento_valor}
                                        onChange={e => setEditForm(prev => ({ ...prev, descuento_valor: parseFloat(e.target.value) || 0 }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-discount-type">Tipo descuento</Label>
                                    <Select value={editForm.descuento_tipo} onValueChange={(v: 'fixed' | 'percentage') => setEditForm(prev => ({ ...prev, descuento_tipo: v }))}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                                            <SelectItem value="fixed">Fijo ($)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => { setIsEditModalOpen(false); setSaleToEdit(null); }}>Cancelar</Button>
                            <Button onClick={handleEditSubmit} disabled={isEditSubmitting}>
                                {isEditSubmitting && <span className="mr-2 h-4 w-4 animate-spin inline-block border-2 border-current border-t-transparent rounded-full" />}
                                Guardar cambios
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}
