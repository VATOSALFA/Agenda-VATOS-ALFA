
'use client';

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { MoreHorizontal, Search, Download, Plus, Calendar as CalendarIcon, ChevronDown, ChevronUp, Eye, Send, Printer, Trash2, AlertTriangle, Info, ChevronLeft, ChevronRight, Pencil, Check, ChevronsUpDown, ArrowUpDown, ArrowUp, ArrowDown, Loader2, ShieldAlert, X, SlidersHorizontal, PieChart as PieChartIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pie, PieChart as RechartsPieChart, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { format, startOfDay, endOfDay, parseISO, subDays, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import { where, doc, deleteDoc, getDocs, collection, query as firestoreQuery, writeBatch, increment, getDoc, Timestamp, updateDoc, runTransaction } from "firebase/firestore";
import type { Client, Local, Profesional, Service, AuthCode, Sale, User, Role, Product } from "@/lib/types";
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
import { logAuditAction } from '@/lib/audit-logger';

function formatPaymentMethodName(saleOrMethod: any): string {
    const rawMethod = (typeof saleOrMethod === 'string'
        ? saleOrMethod
        : (saleOrMethod?.metodo_pago || saleOrMethod?.metodo_pago_anticipo || '')
    ).toLowerCase().trim();

    if (rawMethod === 'tarjeta' || rawMethod === 'terminal' || rawMethod === 'terminal_point' || rawMethod === 'terminal point') {
        return 'Terminal Point';
    }
    if (rawMethod === 'efectivo') {
        return 'Efectivo';
    }
    if (rawMethod === 'transferencia' || rawMethod === 'spei') {
        return 'Transferencia';
    }
    if (rawMethod === 'mercadopago' || rawMethod === 'mercado_pago' || rawMethod === 'pagos en linea' || rawMethod === 'pagos_en_linea' || rawMethod === 'en_linea' || rawMethod === 'online') {
        return 'Pagos en Línea';
    }
    if (rawMethod === 'combinado') {
        return 'Combinado';
    }
    if (rawMethod === 'alfacoins' || rawMethod === 'alfa_coins') {
        return 'Alfa Coins';
    }

    // Fallback: If sale object was passed without rawMethod but marked as deposit_paid
    if (typeof saleOrMethod === 'object' && saleOrMethod?.pago_estado === 'deposit_paid') {
        return 'Pagos en Línea';
    }

    if (!rawMethod) return 'N/A';
    return rawMethod.charAt(0).toUpperCase() + rawMethod.slice(1);
}

export default function InvoicedSalesPage() {
    const { user } = useAuth();
    const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: new Date(), to: new Date() });
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [isMobileCalendarOpen, setIsMobileCalendarOpen] = useState(false);

    const handleDateSelect = (range: DateRange | undefined) => {
        setDateRange(range);
        if (range?.from && range?.to) {
            setTimeout(() => {
                setIsCalendarOpen(false);
                setIsMobileCalendarOpen(false);
            }, 350);
        }
    };

    const [localFilter, setLocalFilter] = useState('todos');
    const [paymentMethodFilter, setPaymentMethodFilter] = useState('todos');
    const [activeFilters, setActiveFilters] = useState<{
        dateRange: DateRange | undefined;
        local: string;
        paymentMethod: string;
        professional?: string;
    }>({
        dateRange: { from: new Date(), to: new Date() },
        local: 'todos',
        paymentMethod: 'todos',
        professional: 'todos'
    });
    const { toast } = useToast();
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
    const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
    const [isDeletingSale, setIsDeletingSale] = useState(false);
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [authAction, setAuthAction] = useState<{ execute: () => void, description: string } | null>(null);
    const [authCode, setAuthCode] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [showMobileFilters, setShowMobileFilters] = useState(false);
    const [showMobileCharts, setShowMobileCharts] = useState(false);
    const [mobileChartTab, setMobileChartTab] = useState<'total' | 'methods'>('total');

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


    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
    const { data: professionals } = useFirestoreQuery<Profesional>('profesionales');

    const { sales: populatedSales, loading: salesLoading, salesData } = useInvoicedSales(activeFilters, queryKey);

    const professionalOptions = useMemo(() => {
        return professionals?.map(p => ({ value: p.id, label: p.name })) || [];
    }, [professionals]);

    const sortedSales = useMemo(() => {
        let sortableItems = [...populatedSales];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                let aValue: any;
                let bValue: any;

                switch (sortConfig.key) {
                    case 'fecha_hora_venta':
                        aValue = a.fecha_hora_venta?.seconds || 0;
                        bValue = b.fecha_hora_venta?.seconds || 0;
                        break;
                    case 'client':
                        aValue = `${a.client?.nombre || ''} ${a.client?.apellido || ''}`.trim().toLowerCase();
                        bValue = `${b.client?.nombre || ''} ${b.client?.apellido || ''}`.trim().toLowerCase();
                        break;
                    case 'concepto':
                        aValue = getSaleConcept(a).toLowerCase();
                        bValue = getSaleConcept(b).toLowerCase();
                        break;
                    case 'professional':
                        aValue = (a.professionalNames || '').toLowerCase();
                        bValue = (b.professionalNames || '').toLowerCase();
                        break;
                    case 'metodo_pago':
                        aValue = formatPaymentMethodName(a).toLowerCase();
                        bValue = formatPaymentMethodName(b).toLowerCase();
                        break;
                    case 'total':
                        aValue = (a.monto_pagado_real !== undefined && a.monto_pagado_real < a.total) ? a.monto_pagado_real : a.total;
                        bValue = (b.monto_pagado_real !== undefined && b.monto_pagado_real < b.total) ? b.monto_pagado_real : b.total;
                        break;
                    case 'detalle':
                        aValue = (a.items?.map(i => i.nombre).join(', ') || '').toLowerCase();
                        bValue = (b.items?.map(i => i.nombre).join(', ') || '').toLowerCase();
                        break;
                    case 'descuento':
                        aValue = a.descuento?.valor || 0;
                        bValue = b.descuento?.valor || 0;
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
        }
        return sortableItems;
    }, [populatedSales, sortConfig]);

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

    const totalPages = Math.ceil(sortedSales.length / itemsPerPage);
    const paginatedSales = sortedSales.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );


    const handleSearch = () => {
        const normalizedRange = dateRange?.from ? {
            from: dateRange.from,
            to: dateRange.to || dateRange.from
        } : undefined;

        setActiveFilters({
            dateRange: normalizedRange,
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
        if (!saleToDelete || deleteConfirmationText !== 'ELIMINAR' || !db || isDeletingSale) return;

        try {
            setIsDeletingSale(true);
            const saleRef = doc(db, 'ventas', saleToDelete.id);

            // 1. Consolidar productos por ID para evitar múltiples devoluciones del mismo producto
            const productQuantitiesToReturn = new Map<string, { quantity: number; name: string }>();
            if (saleToDelete.items && Array.isArray(saleToDelete.items)) {
                for (const item of saleToDelete.items) {
                    if (item.tipo === 'producto' && item.id) {
                        const current = productQuantitiesToReturn.get(item.id) || { quantity: 0, name: item.nombre || 'Producto' };
                        current.quantity += (Number(item.cantidad) || 1);
                        productQuantitiesToReturn.set(item.id, current);
                    }
                }
            }

            // 2. Ejecutar transacción atómica e idempotente
            await runTransaction(db, async (transaction) => {
                const saleDoc = await transaction.get(saleRef);
                // Si la venta ya no existe (ej. eliminada concurrentemente), abortar inmediatamente
                if (!saleDoc.exists()) {
                    return;
                }

                const currentSaleData = saleDoc.data() as Sale;

                // A. Revertir inventario de productos consolidados
                for (const [productId, { quantity, name }] of productQuantitiesToReturn.entries()) {
                    const productRef = doc(db, 'productos', productId);
                    const productSnap = await transaction.get(productRef);

                    if (productSnap.exists()) {
                        const productData = productSnap.data() as Product;
                        const currentStock = productData.stock || 0;
                        const newStock = currentStock + quantity;

                        // 1. Incrementar Stock
                        transaction.update(productRef, {
                            stock: newStock
                        });

                        // 2. Registrar Movimiento con Comentarios Claros y Nombre de Producto
                        const movementRef = doc(collection(db, 'movimientos_inventario'));
                        const clientName = (currentSaleData as any).cliente_nombre || currentSaleData.client?.nombre || 'Cliente';
                        const prodName = name || productData.nombre || 'Producto';

                        transaction.set(movementRef, {
                            date: Timestamp.now(),
                            local_id: currentSaleData.local_id || 'unknown',
                            product_id: productId,
                            presentation_id: (productData as any).presentation_id || 'default',
                            from: currentStock,
                            to: newStock,
                            cause: 'Cancellation',
                            staff_id: user?.uid || 'unknown',
                            comment: `Devolución de ${prodName} por cancelación de venta a ${clientName}`,
                            product_name: prodName,
                            staff_name: user?.displayName || user?.email || 'Admin',
                            local_name: 'System',
                            concepto: 'Devolución por venta cancelada'
                        });
                    }
                }

                // B. Revertir Reserva asociada (si existe)
                if (currentSaleData.reservationId) {
                    const reservationRef = doc(db, 'reservas', currentSaleData.reservationId);
                    const reservationSnap = await transaction.get(reservationRef);

                    if (reservationSnap.exists()) {
                        const resData = reservationSnap.data();
                        const isDepositSale = currentSaleData.tipo_venta === 'anticipo' || saleRef.id.startsWith('deposit_') || currentSaleData.pago_estado === 'deposit_paid';

                        if (isDepositSale) {
                            // If the deleted sale was the deposit itself, clear the deposit from the reservation
                            transaction.update(reservationRef, {
                                pago_estado: 'pendiente',
                                monto_anticipo: 0,
                                anticipo_pagado: 0,
                                anticipoPagado: 0,
                                monto_pagado: 0,
                                monto_pagado_real: 0,
                                saldo_pendiente: Number(resData.total || resData.precio || 0),
                                deposit_payment_id: null,
                                metodo_pago_anticipo: null,
                            });
                        } else {
                            const anticipo = Number(resData.anticipo_pagado || 0);
                            const total = Number(resData.total || 0);

                            const newPagoEstado = anticipo > 0 ? 'deposit_paid' : 'pendiente';
                            const newSaldoPendiente = total > anticipo ? (total - anticipo) : total;

                            transaction.update(reservationRef, {
                                estado: 'Reservado',
                                pago_estado: newPagoEstado,
                                saldo_pendiente: newSaldoPendiente,
                                monto_pagado: anticipo,
                            });
                        }
                    }
                }

                // C. Guardar en ventas_canceladas
                const canceladaRef = doc(collection(db, 'ventas_canceladas'), saleRef.id);
                transaction.set(canceladaRef, {
                    ...currentSaleData,
                    id: saleRef.id,
                    estado_venta: 'cancelada',
                    eliminada_el: Timestamp.now(),
                    eliminada_por: user?.uid || 'unknown',
                    eliminada_por_nombre: user?.displayName || 'unknown'
                });

                // D. Eliminar Venta
                transaction.delete(saleRef);
            });

            toast({
                title: "Venta Eliminada",
                description: "La venta ha sido eliminada y el stock revertido correctamente.",
            });

            await logAuditAction({
                action: 'Eliminar Venta Facturada',
                details: `Venta ID: ${saleToDelete.id} eliminada. Monto: $${saleToDelete.total} del cliente ${saleToDelete.client?.nombre || 'Desconocido'}.`,
                userId: user?.uid || 'unknown',
                userName: user?.displayName || user?.email || 'Unknown',
                userRole: user?.role,
                severity: 'critical',
                entityId: saleToDelete.id,
                localId: saleToDelete.local_id || 'unknown'
            });
        } catch (error) {
            console.error("Error deleting sale: ", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "No se pudo eliminar la venta.",
            });
        } finally {
            setIsDeletingSale(false);
            setSaleToDelete(null);
            setDeleteConfirmationText('');
        }
    };

    const triggerDownload = async () => {
        let allSalesForDownload = [...populatedSales];

        try {
            if (activeFilters.dateRange?.from && activeFilters.dateRange?.to && db) {
                const start = startOfDay(activeFilters.dateRange.from);
                const end = endOfDay(activeFilters.dateRange.to);

                const q = firestoreQuery(
                    collection(db, 'ventas_canceladas'),
                    where('fecha_hora_venta', '>=', Timestamp.fromDate(start)),
                    where('fecha_hora_venta', '<=', Timestamp.fromDate(end))
                );

                const snapshot = await getDocs(q);
                const cancelledSales: any[] = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const localMatch = activeFilters.local === 'todos' || data.local_id === activeFilters.local;
                    const paymentMethodMatch = activeFilters.paymentMethod === 'todos' || (() => {
                        const filter = activeFilters.paymentMethod;
                        if (filter === 'tarjeta') {
                            return data.metodo_pago === 'tarjeta' || data.metodo_pago === 'terminal' || data.metodo_pago === 'terminal_point';
                        }
                        if (filter === 'efectivo') {
                            return data.metodo_pago === 'efectivo';
                        }
                        if (filter === 'transferencia') {
                            return data.metodo_pago === 'transferencia';
                        }
                        if (filter === 'Pagos en linea' || filter === 'pagos_en_linea' || filter === 'Pagos en Línea') {
                            return data.metodo_pago === 'mercadopago' || data.metodo_pago === 'Pagos en linea' || data.metodo_pago === 'pagos_en_linea' || data.metodo_pago === 'en_linea' || (!data.metodo_pago && data.pago_estado === 'deposit_paid');
                        }
                        return data.metodo_pago === filter;
                    })();

                    if (localMatch && paymentMethodMatch) {
                        cancelledSales.push({ ...data, isCancelled: true });
                    }
                });
                allSalesForDownload = [...allSalesForDownload, ...cancelledSales];
            }
        } catch (error) {
            console.error("Error fetching cancelled sales for download", error);
        }

        if (allSalesForDownload.length === 0) {
            toast({
                title: "No hay datos para exportar",
                description: "No hay ventas en el período seleccionado.",
                variant: 'destructive',
            });
            return;
        }

        allSalesForDownload.sort((a, b) => {
            const dateA = a.fecha_hora_venta?.seconds ? new Date(a.fecha_hora_venta.seconds * 1000) : new Date(a.fecha_hora_venta);
            const dateB = b.fecha_hora_venta?.seconds ? new Date(b.fecha_hora_venta.seconds * 1000) : new Date(b.fecha_hora_venta);
            return dateB.getTime() - dateA.getTime();
        });

        const dataForExcel = allSalesForDownload.map((sale: any) => ({
            'Fecha de pago': formatDate(sale.fecha_hora_venta),
            'Cliente': sale.client?.nombre ? `${sale.client.nombre} ${sale.client.apellido || ''}`.trim() : 'Desconocido',
            'Concepto': sale.isCancelled ? `[CANCELADA] ${getSaleConcept(sale)}` : getSaleConcept(sale),
            'Detalle': sale.items?.map((i: any) => i.nombre).join(', ') || 'N/A',
            'Profesional': sale.professionalNames || 'N/A',
            'Método de Pago': formatPaymentMethodName(sale),
            'Total': sale.isCancelled ? 0 : ((sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total) ? sale.monto_pagado_real : sale.total),
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
            await triggerDownload();
            setIsDownloadModalOpen(false);
            setAuthCode('');
        }
    };

    const handleOpenDeleteModal = (sale: Sale) => {
        const action = () => setSaleToDelete(sale);
        if (user?.role === 'Administrador general') {
            action();
        } else {
            // Delay opening the modal slightly to allow dropdown to close cleanly
            // This prevents race conditions with body lock/pointer-events
            setTimeout(() => {
                setAuthAction({ execute: action, description: `Eliminar venta facturada de $${sale.total} para ${sale.client?.nombre || 'Desconocido'}` });
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
            authAction?.execute();
            setIsAuthModalOpen(false);

            await logAuditAction({
                action: 'Autorización por Código',
                details: `Acción autorizada en ventas facturadas: ${authAction?.description || 'Desconocida'}.`,
                userId: user?.uid || 'unknown',
                userName: user?.displayName || user?.email || 'Unknown',
                userRole: user?.role,
                authCode: authCode,
                severity: 'info',
                localId: localFilter !== 'todos' ? localFilter : 'unknown'
            });
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
        if (user?.role === 'Administrador general') {
            action();
        } else {
            setTimeout(() => {
                setAuthAction({ execute: action, description: `Editar venta facturada de $${sale.total} para cliente ID ${sale.cliente_id}` });
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
    const hasActiveSecondaryFilters = localFilter !== 'todos' || paymentMethodFilter !== 'todos';


    const { data: roles } = useFirestoreQuery<Role>('roles');
    const userRole = roles?.find(r => r.title === user?.role);
    const historyLimit = userRole?.historyRestrictionDays;

    return (
        <>
            <div className="flex-1 space-y-3 sm:space-y-4 p-3 sm:p-6 md:p-8 pt-4 sm:pt-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl sm:text-3xl font-bold tracking-tight">Ventas facturadas</h2>
                </div>

                {/* FILTROS ESCRITORIO (hidden sm:block) */}
                <Card className="hidden sm:block rounded-2xl border border-border/60 shadow-sm overflow-hidden">
                    <CardContent className="p-4 flex items-center gap-3">
                        <div className="flex-1 min-w-[220px]">
                            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className="w-full justify-start text-left font-normal rounded-xl h-10 border-border/60">
                                        <CalendarIcon className="mr-2 h-4 w-4 text-slate-400 shrink-0" />
                                        {dateRange?.from ? (
                                            dateRange.to && !isSameDay(dateRange.from, dateRange.to) ? (
                                                `${format(dateRange.from, "dd MMM, y", { locale: es })} - ${format(dateRange.to, "dd MMM, y", { locale: es })}`
                                            ) : (
                                                format(dateRange.from, "dd MMM, y", { locale: es })
                                            )
                                        ) : (
                                            <span>Seleccionar rango</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]" align="start">
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
                        <div className="flex-1 min-w-[180px]">
                            <Select value={localFilter} onValueChange={setLocalFilter} disabled={isLocalAdmin || localesLoading}>
                                <SelectTrigger className="w-full rounded-xl h-10 border-border/60">
                                    <SelectValue placeholder={localesLoading ? "Cargando..." : "Todas las sucursales"} />
                                </SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                    {!isLocalAdmin && <SelectItem value="todos">Todas las sucursales</SelectItem>}
                                    {locales.map(local => (
                                        <SelectItem key={local.id} value={local.id}>{local.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex-1 min-w-[180px]">
                            <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                                <SelectTrigger className="w-full rounded-xl h-10 border-border/60">
                                    <SelectValue placeholder="Todos los métodos de pago" />
                                </SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                    <SelectItem value="todos">Todos los métodos de pago</SelectItem>
                                    <SelectItem value="efectivo">Efectivo</SelectItem>
                                    <SelectItem value="tarjeta">Terminal Point</SelectItem>
                                    <SelectItem value="transferencia">Transferencia</SelectItem>
                                    <SelectItem value="Pagos en linea">Pagos en Línea</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button variant="alfa" className="h-10 rounded-xl px-6 text-xs sm:text-sm font-bold text-white shadow-md shrink-0 w-auto" onClick={handleSearch}>
                            <Search className="mr-2 h-4 w-4" />
                            Buscar
                        </Button>
                    </CardContent>
                </Card>

                {/* FILTROS MÓVIL COMPACTO (sm:hidden) */}
                <Card className="sm:hidden rounded-2xl border border-border/60 shadow-sm overflow-hidden">
                    <CardContent className="p-2.5 space-y-2">
                        <div className="flex items-center gap-1.5">
                            {/* Selector de Rango de Fecha */}
                            <Popover open={isMobileCalendarOpen} onOpenChange={setIsMobileCalendarOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="flex-1 justify-start text-left font-normal rounded-xl h-9 text-xs border-border/60 px-2.5 truncate">
                                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
                                        <span className="truncate">
                                            {dateRange?.from ? (
                                                dateRange.to && !isSameDay(dateRange.from, dateRange.to) ? (
                                                    `${format(dateRange.from, "dd MMM", { locale: es })} - ${format(dateRange.to, "dd MMM", { locale: es })}`
                                                ) : (
                                                    format(dateRange.from, "dd MMM, y", { locale: es })
                                                )
                                            ) : (
                                                'Fecha'
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
                                        onSelect={handleDateSelect}
                                        numberOfMonths={1}
                                        locale={es}
                                        disabled={historyLimit !== undefined && historyLimit !== null ? (date) => date > new Date() || date < subDays(new Date(), historyLimit) : undefined}
                                    />
                                </PopoverContent>
                            </Popover>

                            {/* Botón Filtros Adicionales */}
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowMobileFilters(!showMobileFilters)}
                                className={cn(
                                    "h-9 px-2.5 rounded-xl border-border/60 text-xs flex items-center gap-1 shrink-0 transition-colors",
                                    (showMobileFilters || hasActiveSecondaryFilters) && "border-blue-500 text-blue-400 bg-blue-500/10"
                                )}
                                title="Filtros adicionales"
                            >
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                                <span className="text-[11px] font-medium hidden xs:inline">Filtros</span>
                                {hasActiveSecondaryFilters && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                                )}
                            </Button>

                            {/* Botón Buscar con Variante Alfa */}
                            <Button variant="alfa" className="h-9 rounded-xl px-3 text-xs font-bold text-white shadow-md shrink-0" onClick={handleSearch}>
                                <Search className="h-3.5 w-3.5 mr-1" />
                                Buscar
                            </Button>
                        </div>

                        {/* Desplegable de filtros secundarios */}
                        {showMobileFilters && (
                            <div className="pt-2 border-t border-border/40 grid grid-cols-1 gap-2 animate-in fade-in-50 duration-200">
                                <div className="space-y-1">
                                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Sucursal</span>
                                    <Select value={localFilter} onValueChange={setLocalFilter} disabled={isLocalAdmin || localesLoading}>
                                        <SelectTrigger className="rounded-xl h-9 text-xs border-border/60">
                                            <SelectValue placeholder={localesLoading ? "Cargando..." : "Todas las sucursales"} />
                                        </SelectTrigger>
                                        <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                            {!isLocalAdmin && <SelectItem value="todos">Todas las sucursales</SelectItem>}
                                            {locales.map(local => (
                                                <SelectItem key={local.id} value={local.id}>{local.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Método de pago</span>
                                    <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                                        <SelectTrigger className="rounded-xl h-9 text-xs border-border/60">
                                            <SelectValue placeholder="Todos los métodos de pago" />
                                        </SelectTrigger>
                                        <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                            <SelectItem value="todos">Todos los métodos de pago</SelectItem>
                                            <SelectItem value="efectivo">Efectivo</SelectItem>
                                            <SelectItem value="tarjeta">Terminal Point</SelectItem>
                                            <SelectItem value="transferencia">Transferencia</SelectItem>
                                            <SelectItem value="Pagos en linea">Pagos en Línea</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* GRÁFICAS ESCRITORIO (hidden sm:grid) */}
                <div className="hidden sm:grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                    {salesLoading ? (
                        <>
                            <Card className="rounded-2xl border border-border/60 shadow-sm"><CardContent className="p-6"><Skeleton className="h-[380px] w-full" /></CardContent></Card>
                            <Card className="rounded-2xl border border-border/60 shadow-sm"><CardContent className="p-6"><Skeleton className="h-[380px] w-full" /></CardContent></Card>
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

                {/* RESUMEN COMPACTO MÓVIL (sm:hidden) */}
                <div className="sm:hidden space-y-2.5">
                    {salesLoading ? (
                        <Card className="rounded-2xl border border-border/60 shadow-sm"><CardContent className="p-4"><Skeleton className="h-28 w-full" /></CardContent></Card>
                    ) : (
                        <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card">
                            <CardContent className="p-3.5 space-y-2.5">
                                {/* Total Principal y Contador de Ventas */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total Facturado</span>
                                        <div className="text-2xl font-black text-foreground tracking-tight leading-none mt-0.5">
                                            ${salesData.totalSales.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className="text-xs px-2.5 py-1 font-semibold rounded-lg">
                                        {populatedSales.length} {populatedSales.length === 1 ? 'venta' : 'ventas'}
                                    </Badge>
                                </div>

                                {/* Desglose rápido: Servicios vs Productos */}
                                <div className="grid grid-cols-2 gap-2 pt-0.5">
                                    {salesData.totalSales.dataLabels?.map((label) => {
                                        const item = salesData.totalSales.data.find(d => d.name.toLowerCase() === label.toLowerCase());
                                        const val = item ? item.value : 0;
                                        const pct = salesData.totalSales.total > 0 ? Math.round((val / salesData.totalSales.total) * 100) : 0;
                                        return (
                                            <div key={label} className="p-2 rounded-xl bg-muted/20 border border-border/40">
                                                <div className="text-[10px] text-muted-foreground flex items-center justify-between">
                                                    <span>{label}</span>
                                                    <span className="font-semibold text-slate-300">{pct}%</span>
                                                </div>
                                                <div className="text-xs font-bold text-foreground mt-0.5">
                                                    ${val.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Desglose Medios de Pago con Barra de Distribución Segmentada */}
                                <div className="pt-2 border-t border-border/40 space-y-2">
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground font-medium text-[10px] uppercase tracking-wider">Medios de Pago</span>
                                        <span className="text-slate-400 text-[10px]">{salesData.paymentMethods.data.length} métodos</span>
                                    </div>

                                    {/* Barra de porcentaje segmentada ultra compacta */}
                                    {salesData.paymentMethods.total > 0 && (
                                        <div className="h-2 w-full rounded-full overflow-hidden flex bg-muted/30">
                                            {salesData.paymentMethods.data.map((item, idx) => {
                                                const pct = (item.value / salesData.paymentMethods.total) * 100;
                                                const colors = ['bg-[#202A49]', 'bg-blue-500', 'bg-slate-400', 'bg-[#C5A880]'];
                                                if (pct <= 0) return null;
                                                return (
                                                    <div
                                                        key={item.name}
                                                        style={{ width: `${pct}%` }}
                                                        className={cn("h-full transition-all", colors[idx % colors.length])}
                                                        title={`${item.name}: $${item.value} (${Math.round(pct)}%)`}
                                                    />
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Métodos de pago en chips/pills compactos */}
                                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                                        {salesData.paymentMethods.dataLabels?.map((label, idx) => {
                                            const item = salesData.paymentMethods.data.find(d => d.name.toLowerCase() === label.toLowerCase());
                                            const val = item ? item.value : 0;
                                            if (val === 0 && salesData.paymentMethods.total > 0) return null;
                                            const dotColors = ['#202A49', '#3b82f6', '#94a3b8', '#C5A880'];
                                            return (
                                                <div key={label} className="flex items-center justify-between px-2 py-1 rounded-lg bg-muted/15 border border-border/30">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColors[idx % dotColors.length] }} />
                                                        <span className="truncate text-muted-foreground text-[10px]">{label}</span>
                                                    </div>
                                                    <span className="font-semibold text-foreground text-[10px] shrink-0 ml-1">
                                                        ${val.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Botón para desplegar / ocultar gráficas circulares */}
                                <div className="pt-1 border-t border-border/40">
                                    <button
                                        type="button"
                                        onClick={() => setShowMobileCharts(!showMobileCharts)}
                                        className="w-full text-xs text-muted-foreground hover:text-foreground py-1 flex items-center justify-center gap-1.5 font-medium transition-colors"
                                    >
                                        <PieChartIcon className="h-3.5 w-3.5 text-blue-400" />
                                        <span>{showMobileCharts ? 'Ocultar gráficas circulares' : 'Ver gráficas circulares'}</span>
                                        {showMobileCharts ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                    </button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Gráfica circular desplegable con pestañas (Facturación / Medios de Pago) */}
                    {showMobileCharts && !salesLoading && (
                        <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden animate-in fade-in-50 duration-200">
                            <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between">
                                <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl w-full">
                                    <button
                                        type="button"
                                        onClick={() => setMobileChartTab('total')}
                                        className={cn(
                                            "flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all text-center",
                                            mobileChartTab === 'total' ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        Facturación
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMobileChartTab('methods')}
                                        className={cn(
                                            "flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all text-center",
                                            mobileChartTab === 'methods' ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        Medios de Pago
                                    </button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-3 pt-2">
                                {mobileChartTab === 'total' ? (
                                    <DonutChartCard
                                        title="Ventas facturadas totales"
                                        data={salesData.totalSales.data}
                                        total={salesData.totalSales.total}
                                        dataLabels={salesData.totalSales.dataLabels}
                                    />
                                ) : (
                                    <DonutChartCard
                                        title="Medios de Pago"
                                        data={salesData.paymentMethods.data}
                                        total={salesData.paymentMethods.total}
                                        dataLabels={salesData.paymentMethods.dataLabels}
                                    />
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden">
                    <CardHeader className="flex-row items-center justify-between p-4 sm:p-6 pb-3 sm:pb-4 border-b border-border/40">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl font-semibold">
                                Pagos
                                <Badge variant="secondary" className="font-normal text-xs">
                                    {populatedSales.length} {populatedSales.length === 1 ? 'venta' : 'ventas'}
                                </Badge>
                            </CardTitle>
                            <CardDescription className="text-xs">Listado de ventas facturadas en el período seleccionado.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" className="h-9 rounded-xl border-border/60 text-xs font-medium" onClick={() => setIsDownloadModalOpen(true)}>
                                <Download className="mr-1.5 h-3.5 w-3.5 text-slate-400" />
                                <span className="hidden sm:inline">Descargar pagos</span>
                                <span className="sm:hidden">Descargar</span>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {/* Vista Móvil: Tarjetas compactas sin scroll horizontal */}
                        <div className="sm:hidden">
                            {/* Barra de ordenamiento móvil */}
                            {!salesLoading && paginatedSales.length > 0 && (
                                <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/20 border-b border-border/60 overflow-x-auto no-scrollbar">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0 mr-1">Ordenar:</span>
                                    {[
                                        { key: 'fecha_hora_venta', label: 'Fecha' },
                                        { key: 'total', label: 'Monto' },
                                        { key: 'client', label: 'Cliente' },
                                        { key: 'professional', label: 'Barbero' },
                                        { key: 'metodo_pago', label: 'Pago' },
                                    ].map((col) => {
                                        const isActive = sortConfig?.key === col.key;
                                        return (
                                            <button
                                                key={col.key}
                                                type="button"
                                                onClick={() => requestSort(col.key)}
                                                className={cn(
                                                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors shrink-0 border",
                                                    isActive
                                                        ? "bg-[#202A49] text-white border-blue-500 shadow-xs"
                                                        : "bg-card/60 text-muted-foreground border-border/60 hover:text-foreground"
                                                )}
                                            >
                                                <span>{col.label}</span>
                                                {isActive ? (
                                                    sortConfig.direction === 'asc' ? (
                                                        <ArrowUp className="h-3 w-3 text-blue-400" />
                                                    ) : (
                                                        <ArrowDown className="h-3 w-3 text-blue-400" />
                                                    )
                                                ) : (
                                                    <ArrowUpDown className="h-3 w-3 text-slate-400/60" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            <div className="divide-y divide-border/60">
                            {salesLoading ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="p-4 space-y-2">
                                        <Skeleton className="h-5 w-3/4" />
                                        <Skeleton className="h-4 w-1/2" />
                                        <Skeleton className="h-4 w-full" />
                                    </div>
                                ))
                            ) : paginatedSales.length > 0 ? (
                                paginatedSales.map((sale) => (
                                    <div key={sale.id} className="p-3.5 space-y-2 hover:bg-muted/10 transition-colors">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="font-semibold text-sm truncate text-foreground">
                                                    {sale.client?.nombre ? `${sale.client.nombre} ${sale.client.apellido || ''}`.trim() : 'Cliente Desconocido'}
                                                </div>
                                                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                                    <span>{formatDate(sale.fecha_hora_venta)}</span>
                                                    <span>•</span>
                                                    <span className="font-medium text-slate-300 truncate">{sale.professionalNames || 'Sin profesional'}</span>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="font-bold text-sm text-foreground">
                                                    ${((sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total) ? sale.monto_pagado_real : sale.total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                                {sale.descuento?.valor ? (
                                                    <div className="text-[10px] text-blue-400 font-medium">
                                                        Desc: {sale.descuento.tipo === 'percentage' ? `${sale.descuento.valor}%` : `$${sale.descuento.valor}`}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between gap-2 pt-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-muted/40 border border-border/50 text-slate-300 capitalize">
                                                    {getSaleConcept(sale)}
                                                </span>
                                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-400 capitalize">
                                                    {formatPaymentMethodName(sale)}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleViewDetails(sale)}
                                                    className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                                                    title="Ver comprobante"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </button>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button
                                                            type="button"
                                                            className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                                                            title="Más opciones"
                                                        >
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-36 bg-[#151b2e] border-2 border-blue-500 text-white rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] p-1.5">
                                                        <DropdownMenuItem onSelect={() => handleOpenEditModal(sale)} className="text-xs rounded-lg py-2 focus:bg-white/10 cursor-pointer">
                                                            <Pencil className="mr-2 h-3.5 w-3.5 text-blue-400" />
                                                            <span>Editar</span>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onSelect={() => handleOpenDeleteModal(sale)} className="text-xs rounded-lg py-2 text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer">
                                                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                                                            <span>Eliminar</span>
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-10 text-xs text-muted-foreground">
                                    No hay ventas para el período seleccionado.
                                </div>
                            )}

                            {!salesLoading && populatedSales.length > 0 && (
                                <div className="p-3 bg-muted/20 flex items-center justify-between text-xs font-semibold">
                                    <span className="text-muted-foreground">Total ventas:</span>
                                    <span className="font-bold text-sm text-foreground">
                                        ${populatedSales.reduce((acc, sale) => {
                                            const actualRevenue = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                                                ? sale.monto_pagado_real
                                                : (sale.total || 0);
                                            return acc + actualRevenue;
                                        }, 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            )}
                            </div>
                        </div>

                        {/* Vista Escritorio: Tabla compacta */}
                        <div className="hidden sm:block overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-b border-border/40 hover:bg-transparent">
                                        <TableHead className="py-2.5 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('fecha_hora_venta')}>
                                            <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                Fecha de pago
                                                <SortIcon field="fecha_hora_venta" />
                                            </div>
                                        </TableHead>
                                        <TableHead className="py-2.5 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('client')}>
                                            <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                Cliente
                                                <SortIcon field="client" />
                                            </div>
                                        </TableHead>
                                        <TableHead className="py-2.5 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('concepto')}>
                                            <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                Concepto
                                                <SortIcon field="concepto" />
                                            </div>
                                        </TableHead>
                                        <TableHead className="py-2.5 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('detalle')}>
                                            <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                Detalle
                                                <SortIcon field="detalle" />
                                            </div>
                                        </TableHead>
                                        <TableHead className="py-2.5 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('professional')}>
                                            <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                Profesional
                                                <SortIcon field="professional" />
                                            </div>
                                        </TableHead>
                                        <TableHead className="py-2.5 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('metodo_pago')}>
                                            <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                Método de Pago
                                                <SortIcon field="metodo_pago" />
                                            </div>
                                        </TableHead>
                                        <TableHead className="py-2.5 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('total')}>
                                            <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                Total
                                                <SortIcon field="total" />
                                            </div>
                                        </TableHead>
                                        <TableHead className="py-2.5 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('descuento')}>
                                            <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                Descuento
                                                <SortIcon field="descuento" />
                                            </div>
                                        </TableHead>
                                        <TableHead className="py-2.5 px-3 text-xs text-right font-semibold">Opciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {salesLoading ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                            <TableRow key={i}>
                                                <TableCell colSpan={9} className="py-2.5 px-3"><Skeleton className="h-6 w-full" /></TableCell>
                                            </TableRow>
                                        ))
                                    ) : paginatedSales.length > 0 ? (
                                        paginatedSales.map((sale) => (
                                            <TableRow key={sale.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                                                <TableCell className="py-2.5 px-3 text-xs">{formatDate(sale.fecha_hora_venta)}</TableCell>
                                                <TableCell className="py-2.5 px-3 text-xs font-medium">{sale.client?.nombre ? `${sale.client.nombre} ${sale.client.apellido || ''}`.trim() : 'Desconocido'}</TableCell>
                                                <TableCell className="py-2.5 px-3 text-xs capitalize">{getSaleConcept(sale)}</TableCell>
                                                <TableCell className="py-2.5 px-3 text-xs text-muted-foreground">{sale.items && Array.isArray(sale.items) ? sale.items.map(i => i.nombre).join(', ') : 'N/A'}</TableCell>
                                                <TableCell className="py-2.5 px-3 text-xs">{sale.professionalNames}</TableCell>
                                                <TableCell className="py-2.5 px-3 text-xs capitalize">
                                                    {formatPaymentMethodName(sale)}
                                                </TableCell>
                                                <TableCell className="py-2.5 px-3 text-xs font-semibold">
                                                    ${((sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total) ? sale.monto_pagado_real : sale.total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </TableCell>
                                                <TableCell className="py-2.5 px-3 text-xs">
                                                    {sale.descuento?.valor ? (
                                                        sale.descuento.tipo === 'percentage'
                                                            ? `${sale.descuento.valor}%`
                                                            : `$${sale.descuento.valor.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                                                    ) : '0.00%'}
                                                </TableCell>
                                                <TableCell className="py-2.5 px-3 text-right">
                                                    <div className="flex justify-end items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleViewDetails(sale)}
                                                            className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                                                            title="Ver comprobante"
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </button>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <button
                                                                    type="button"
                                                                    className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                                                                    title="Más opciones"
                                                                >
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                </button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-36 bg-[#151b2e] border-2 border-blue-500 text-white rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] p-1.5">
                                                                <DropdownMenuItem onSelect={() => handleOpenEditModal(sale)} className="text-xs rounded-lg py-2 focus:bg-white/10 cursor-pointer">
                                                                    <Pencil className="mr-2 h-3.5 w-3.5 text-blue-400" />
                                                                    <span>Editar</span>
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onSelect={() => handleOpenDeleteModal(sale)} className="text-xs rounded-lg py-2 text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer">
                                                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                                                    <span>Eliminar</span>
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={9} className="text-center h-24 text-muted-foreground text-xs">
                                                No hay ventas para el período seleccionado.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                                {!salesLoading && populatedSales.length > 0 && (
                                    <TableFooter>
                                        <TableRow className="border-t border-border/40 font-bold text-xs">
                                            <TableCell colSpan={6} className="text-right py-2.5 px-3">Total</TableCell>
                                            <TableCell className="py-2.5 px-3">
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
                        </div>
                    </CardContent>
                </Card>

                {!salesLoading && populatedSales.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2 px-1 text-xs">
                        <div className="flex items-center space-x-2">
                            <p className="font-medium text-muted-foreground">Resultados por página:</p>
                            <Select
                                value={`${itemsPerPage}`}
                                onValueChange={(value) => {
                                    setItemsPerPage(Number(value))
                                    setCurrentPage(1)
                                }}
                            >
                                <SelectTrigger className="h-8 w-[70px] rounded-xl border-border/60">
                                    <SelectValue placeholder={itemsPerPage} />
                                </SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="20">20</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="font-medium text-muted-foreground">
                                Página <span className="text-foreground font-semibold">{currentPage}</span> de <span className="text-foreground font-semibold">{totalPages}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-xl border-border/60 text-xs"
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                >
                                    <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Anterior
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-xl border-border/60 text-xs"
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                >
                                    Siguiente <ChevronRight className="h-3.5 w-3.5 ml-1" />
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

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
                        <DialogContent hideCloseButton className="p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background max-w-md">
                            {/* Header Oficial Vatos Alfa */}
                            <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
                                <div className="header-light-beam" aria-hidden="true" />
                                <div className="relative z-10 flex items-center justify-between w-full">
                                    <div className="flex items-center gap-3">
                                        <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                                        <div>
                                            <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                                                Eliminar Venta
                                            </DialogTitle>
                                            <DialogDescription className="text-xs text-slate-300/90">
                                                Esta acción es irreversible y eliminará el registro
                                            </DialogDescription>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setSaleToDelete(null); setDeleteConfirmationText(''); }}
                                        className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors shrink-0"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="p-5 space-y-3">
                                <p className="text-xs text-muted-foreground">
                                    Esta acción eliminará permanentemente la venta seleccionada y revertirá el stock de los productos involucrados.
                                </p>
                                <div className="space-y-1.5 pt-1">
                                    <Label htmlFor="delete-confirm" className="text-xs font-semibold">
                                        Para confirmar, escribe <strong className="text-destructive">ELIMINAR</strong>
                                    </Label>
                                    <Input
                                        id="delete-confirm"
                                        value={deleteConfirmationText}
                                        onChange={(e) => setDeleteConfirmationText(e.target.value)}
                                        placeholder="ELIMINAR"
                                        className="rounded-xl h-10 border-border/60"
                                    />
                                </div>
                            </div>
                            <DialogFooter className="p-4 bg-muted/20 border-t border-border/40 flex justify-end gap-2">
                                <Button variant="outline" className="rounded-xl" disabled={isDeletingSale} onClick={() => { setSaleToDelete(null); setDeleteConfirmationText(''); }}>
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleDeleteSale();
                                    }}
                                    disabled={deleteConfirmationText !== 'ELIMINAR' || isDeletingSale}
                                    className="bg-destructive hover:bg-destructive/90 text-white font-bold rounded-xl"
                                >
                                    {isDeletingSale ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Eliminando...
                                        </>
                                    ) : (
                                        'Sí, eliminar venta'
                                    )}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )
            }

            <Dialog open={isDownloadModalOpen} onOpenChange={setIsDownloadModalOpen}>
                <DialogContent hideCloseButton className="p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background max-w-md">
                    <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
                        <div className="header-light-beam" aria-hidden="true" />
                        <div className="relative z-10 flex items-center justify-between w-full">
                            <div className="flex items-center gap-3">
                                <ShieldAlert className="h-5 w-5 text-slate-300 shrink-0" />
                                <div>
                                    <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                                        Requiere Autorización
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-slate-300/90">
                                        Permiso requerido para descargar reporte
                                    </DialogDescription>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setIsDownloadModalOpen(false); setAuthCode(''); }}
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors shrink-0"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    <div className="p-5 space-y-3">
                        <p className="text-xs text-muted-foreground">
                            Para descargar este archivo, es necesario ingresar un código de autorización con permisos de descarga.
                        </p>
                        <div className="space-y-1.5 pt-1">
                            <Label htmlFor="auth-code" className="text-xs font-semibold">Código de Autorización</Label>
                            <Input
                                id="auth-code"
                                type="password"
                                placeholder="Ingrese el código"
                                value={authCode}
                                onChange={e => setAuthCode(e.target.value)}
                                className="rounded-xl h-10 border-border/60"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleDownloadRequest();
                                    }
                                }}
                            />
                        </div>
                    </div>
                    <DialogFooter className="p-4 bg-muted/20 border-t border-border/40 flex justify-end gap-2">
                        <Button variant="outline" className="rounded-xl" onClick={() => { setIsDownloadModalOpen(false); setAuthCode(''); }}>
                            Cancelar
                        </Button>
                        <Button variant="alfa" className="rounded-xl px-5 text-white" onClick={handleDownloadRequest}>
                            Aceptar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isAuthModalOpen} onOpenChange={setIsAuthModalOpen}>
                <DialogContent hideCloseButton className="p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background max-w-md">
                    <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
                        <div className="header-light-beam" aria-hidden="true" />
                        <div className="relative z-10 flex items-center justify-between w-full">
                            <div className="flex items-center gap-3">
                                <ShieldAlert className="h-5 w-5 text-slate-300 shrink-0" />
                                <div>
                                    <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                                        Requiere Autorización
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-slate-300/90">
                                        Se requiere autorización para esta acción
                                    </DialogDescription>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setAuthCode(''); setAuthAction(null); setIsAuthModalOpen(false); }}
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors shrink-0"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    <div className="p-5 space-y-3">
                        <p className="text-xs text-muted-foreground">
                            Para realizar esta acción ({authAction?.description || 'operación protegida'}), ingrese el código de autorización correspondiente.
                        </p>
                        <div className="space-y-1.5 pt-1">
                            <Label htmlFor="auth-code-action" className="text-xs font-semibold">Código de Autorización</Label>
                            <Input
                                id="auth-code-action"
                                type="password"
                                placeholder="Ingrese el código"
                                value={authCode}
                                onChange={e => setAuthCode(e.target.value)}
                                className="rounded-xl h-10 border-border/60"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAuthCodeSubmit();
                                    }
                                }}
                            />
                        </div>
                    </div>
                    <DialogFooter className="p-4 bg-muted/20 border-t border-border/40 flex justify-end gap-2">
                        <Button variant="outline" className="rounded-xl" onClick={() => { setAuthCode(''); setAuthAction(null); setIsAuthModalOpen(false); }}>
                            Cancelar
                        </Button>
                        <Button variant="alfa" className="rounded-xl px-5 text-white" onClick={handleAuthCodeSubmit}>
                            Aceptar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Sale Modal */}
            {saleToEdit && (
                <Dialog open={isEditModalOpen} onOpenChange={(open) => { if (!open) { setIsEditModalOpen(false); setSaleToEdit(null); } }}>
                    <DialogContent hideCloseButton className="sm:max-w-lg p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background">
                        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
                            <div className="header-light-beam" aria-hidden="true" />
                            <div className="relative z-10 flex items-center justify-between w-full">
                                <div className="flex items-center gap-3">
                                    <Pencil className="h-5 w-5 text-slate-300 shrink-0" />
                                    <div>
                                        <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                                            Editar Venta
                                        </DialogTitle>
                                        <DialogDescription className="text-xs text-slate-300/90">
                                            Modifica los datos de la venta facturada
                                        </DialogDescription>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setIsEditModalOpen(false); setSaleToEdit(null); }}
                                    className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors shrink-0"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        <div className="space-y-4 p-5 max-h-[60vh] overflow-y-auto">
                            <div className="space-y-1.5">
                                <Label htmlFor="edit-date" className="text-xs font-semibold">Fecha de pago</Label>
                                <Input
                                    id="edit-date"
                                    type="datetime-local"
                                    value={editForm.fecha_hora_venta}
                                    onChange={e => setEditForm(prev => ({ ...prev, fecha_hora_venta: e.target.value }))}
                                    className="rounded-xl h-10 border-border/60"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="edit-client" className="text-xs font-semibold">Cliente</Label>
                                <Input
                                    id="edit-client"
                                    value={saleToEdit.client ? `${saleToEdit.client.nombre} ${saleToEdit.client.apellido || ''}`.trim() : 'Cliente desconocido'}
                                    disabled
                                    className="bg-muted rounded-xl h-10 border-border/60"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="edit-detalle" className="text-xs font-semibold">Detalle (servicios/productos)</Label>
                                <Input
                                    id="edit-detalle"
                                    value={editForm.detalle}
                                    onChange={e => setEditForm(prev => ({ ...prev, detalle: e.target.value }))}
                                    placeholder="Ej: Corte de cabello, Barba"
                                    className="rounded-xl h-10 border-border/60"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="edit-professional" className="text-xs font-semibold">Profesional</Label>
                                <Select value={editForm.barbero_id} onValueChange={v => setEditForm(prev => ({ ...prev, barbero_id: v }))}>
                                    <SelectTrigger className="rounded-xl h-10 border-border/60">
                                        <SelectValue placeholder="Seleccionar profesional" />
                                    </SelectTrigger>
                                    <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                        {professionals?.map(pro => (
                                            <SelectItem key={pro.id} value={pro.id}>{pro.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="edit-payment" className="text-xs font-semibold">Método de pago</Label>
                                <Select value={editForm.metodo_pago} onValueChange={v => setEditForm(prev => ({ ...prev, metodo_pago: v }))}>
                                    <SelectTrigger className="rounded-xl h-10 border-border/60">
                                        <SelectValue placeholder="Seleccionar método" />
                                    </SelectTrigger>
                                    <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                        <SelectItem value="efectivo">Efectivo</SelectItem>
                                        <SelectItem value="tarjeta">Terminal Point</SelectItem>
                                        <SelectItem value="transferencia">Transferencia</SelectItem>
                                        <SelectItem value="mercadopago">Pagos en Línea</SelectItem>
                                        <SelectItem value="combinado">Combinado</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="edit-total" className="text-xs font-semibold">Total ($)</Label>
                                <Input
                                    id="edit-total"
                                    type="number"
                                    step="0.01"
                                    value={editForm.total}
                                    onChange={e => setEditForm(prev => ({ ...prev, total: parseFloat(e.target.value) || 0 }))}
                                    className="rounded-xl h-10 border-border/60"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="edit-discount-value" className="text-xs font-semibold">Descuento</Label>
                                    <Input
                                        id="edit-discount-value"
                                        type="number"
                                        step="0.01"
                                        value={editForm.descuento_valor}
                                        onChange={e => setEditForm(prev => ({ ...prev, descuento_valor: parseFloat(e.target.value) || 0 }))}
                                        className="rounded-xl h-10 border-border/60"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="edit-discount-type" className="text-xs font-semibold">Tipo descuento</Label>
                                    <Select value={editForm.descuento_tipo} onValueChange={(v: 'fixed' | 'percentage') => setEditForm(prev => ({ ...prev, descuento_tipo: v }))}>
                                        <SelectTrigger className="rounded-xl h-10 border-border/60">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                            <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                                            <SelectItem value="fixed">Fijo ($)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="p-4 bg-muted/20 border-t border-border/40 flex justify-end gap-2">
                            <Button variant="outline" className="rounded-xl" onClick={() => { setIsEditModalOpen(false); setSaleToEdit(null); }}>
                                Cancelar
                            </Button>
                            <Button variant="alfa" className="rounded-xl px-5 text-white" onClick={handleEditSubmit} disabled={isEditSubmitting}>
                                {isEditSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Guardar cambios
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}
