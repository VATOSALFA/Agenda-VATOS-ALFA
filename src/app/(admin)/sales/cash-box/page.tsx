
'use client';

import { useState, useMemo, useEffect } from 'react';
import type { DateRange } from 'react-day-picker';
import { format, startOfDay, endOfDay, subDays, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import {
    Calendar as CalendarIcon,
    Search,
    Download,
    ChevronDown,
    Eye,
    Loader2,
    Plus,
    Minus,
    Equal,
    Pencil,
    Trash2,
    Send,
    Printer,
    Mail,
    AlertTriangle,
    LogOut,
    Percent,
    MessageCircle,
    ChevronLeft,
    ChevronRight,
    DollarSign,
    CreditCard,
    Settings,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    X,
    KeyRound,
    SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Sale, Local, Client, Egreso, Profesional, User, IngresoManual, CashClosing, Role, Product } from '@/lib/types';
import { where, Timestamp, QueryConstraint, doc, deleteDoc, getDocs, collection, query, getDoc, orderBy, limit, writeBatch, increment, runTransaction } from 'firebase/firestore';
import { AddEgresoModal } from '@/components/finanzas/add-egreso-modal';
import { AddIngresoModal } from '@/components/finanzas/add-ingreso-modal';
import { SaleDetailModal } from '@/components/sales/sale-detail-modal';
import { useToast } from '@/hooks/use-toast';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db, functions, httpsCallable } from '@/lib/firebase-client';
import { useAuth } from '@/contexts/firebase-auth-context';
import { CashBoxClosingModal } from '@/components/sales/cash-box-closing-modal';
import { CommissionPaymentModal } from '@/components/sales/commission-payment-modal';
import { Switch } from '@/components/ui/switch';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { playAgendaClickSound } from '@/lib/notification-sound';
import { useCashBoxData } from './use-cash-box-data';
import { useLiveCash } from './use-live-cash';
import { useLocal } from '@/contexts/local-context';
import { logAuditAction } from '@/lib/audit-logger';


const SummaryCard = ({
    title,
    amount,
    highlighted = false,
    className
}: {
    title: string;
    amount: number;
    highlighted?: boolean;
    className?: string;
}) => (
    <Card className={cn(
        "flex flex-col justify-center rounded-xl transition-all",
        highlighted
            ? "border-2 border-blue-500/50 bg-blue-500/5 shadow-[0_4px_20px_rgba(59,130,246,0.12)]"
            : "border-border/60 bg-card/60",
        className
    )}>
        <CardContent className="p-3.5 text-center">
            <p className="text-xs font-medium text-muted-foreground mb-1">{title}</p>
            <p className={cn(
                "text-xl sm:text-2xl font-extrabold tracking-tight",
                highlighted ? "text-blue-400" : "text-foreground"
            )}>
                ${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
        </CardContent>
    </Card>
);

const IconSeparator = ({ icon: Icon }: { icon: any }) => (
    <div className="hidden lg:flex items-center justify-center">
        <Icon className="h-5 w-5 text-slate-400" />
    </div>
);


export default function CashBoxPage() {
    const { user } = useAuth();
    const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: new Date(), to: new Date() });
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const [isMobilePopoverOpen, setIsMobilePopoverOpen] = useState(false);
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    const handleDateSelect = (range: DateRange | undefined) => {
        setDateRange(range);
        if (range?.from && range?.to) {
            setTimeout(() => {
                setIsPopoverOpen(false);
                setIsMobilePopoverOpen(false);
            }, 350);
        }
    };

    const [selectedLocalId, setSelectedLocalId] = useState<string>('todos');
    const [activeFilters, setActiveFilters] = useState<{
        dateRange: DateRange | undefined;
        localId: string;
    }>({
        dateRange: { from: new Date(), to: new Date() },
        localId: 'todos'
    });

    const [isEgresoModalOpen, setIsEgresoModalOpen] = useState(false);
    const [isIngresoModalOpen, setIsIngresoModalOpen] = useState(false);
    const [isClientMounted, setIsClientMounted] = useState(false);
    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [isCommissionModalOpen, setIsCommissionModalOpen] = useState(false);
    const [queryKey, setQueryKey] = useState(0);

    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
    const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
    const [isDeletingSale, setIsDeletingSale] = useState(false);
    const [editingEgreso, setEditingEgreso] = useState<Egreso | null>(null);
    const [editingIngreso, setEditingIngreso] = useState<IngresoManual | null>(null);
    const [egresoToDelete, setEgresoToDelete] = useState<Egreso | null>(null);
    const [ingresoToDelete, setIngresoToDelete] = useState<IngresoManual | null>(null);
    const [egresoDeleteConfirmationText, setEgresoDeleteConfirmationText] = useState('');
    const [ingresoDeleteConfirmationText, setIngresoDeleteConfirmationText] = useState('');
    const { toast } = useToast();
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const [authCode, setAuthCode] = useState('');
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [authAction, setAuthAction] = useState<{ execute: () => void, description: string } | null>(null);
    const [currentPageSales, setCurrentPageSales] = useState(1);
    const [itemsPerPageSales, setItemsPerPageSales] = useState(10);
    const [currentPageEgresos, setCurrentPageEgresos] = useState(1);
    const [itemsPerPageEgresos, setItemsPerPageEgresos] = useState(10);
    const [currentPageIngresos, setCurrentPageIngresos] = useState(1);
    const [itemsPerPageIngresos, setItemsPerPageIngresos] = useState(10);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [sortConfigEgresos, setSortConfigEgresos] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [sortConfigIngresos, setSortConfigIngresos] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    const { data: cashboxSettings, loading: cashboxSettingsLoading } = useFirestoreQuery<any>('configuracion', 'caja-settings', where('__name__', '==', 'caja'));
    const mainTerminalId = cashboxSettings?.[0]?.mercadoPagoTerminalId;

    const { selectedLocalId: contextSelectedLocalId } = useLocal();

    useEffect(() => {
        setIsClientMounted(true);
        const today = new Date();
        const initialDateRange = { from: startOfDay(today), to: endOfDay(today) };
        setDateRange(initialDateRange);

        let initialLocalId = 'todos';
        if (user?.role === 'Administrador general') {
            if (contextSelectedLocalId) {
                initialLocalId = contextSelectedLocalId;
            } else if (user.local_id) {
                initialLocalId = user.local_id;
            }
        } else if (user?.local_id) {
            initialLocalId = user.local_id;
        }

        setSelectedLocalId(initialLocalId);
        setActiveFilters({ dateRange: initialDateRange, localId: initialLocalId });
    }, [user, contextSelectedLocalId]);

    const {
        sales: salesWithClientData,
        egresos: egresosWithData,
        ingresos,
        loading: dataLoading,
        totals,
        maps: { local: localMap, professional: professionalMap },
        raw: { locales }
    } = useCashBoxData(activeFilters, queryKey);

    const sortedSales = useMemo(() => {
        let sortableItems = [...salesWithClientData];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                let aValue: any;
                let bValue: any;

                switch (sortConfig.key) {
                    case 'id':
                        aValue = a.id;
                        bValue = b.id;
                        break;
                    case 'fecha_hora_venta':
                        aValue = a.fecha_hora_venta?.seconds || 0;
                        bValue = b.fecha_hora_venta?.seconds || 0;
                        break;
                    case 'local':
                        aValue = (localMap.get(a.local_id ?? '') || a.local_id || '').toLowerCase();
                        bValue = (localMap.get(b.local_id ?? '') || b.local_id || '').toLowerCase();
                        break;
                    case 'client':
                        aValue = `${a.client?.nombre || ''} ${a.client?.apellido || ''}`.trim().toLowerCase();
                        bValue = `${b.client?.nombre || ''} ${b.client?.apellido || ''}`.trim().toLowerCase();
                        break;
                    case 'professional':
                        const getProfNames = (s: Sale) => Array.from(new Set(s.items?.map(i => professionalMap.get(i.barbero_id) || '').filter(Boolean))).join(', ').toLowerCase();
                        aValue = getProfNames(a);
                        bValue = getProfNames(b);
                        break;
                    case 'items':
                        aValue = (a.items?.map(i => i.nombre).join(', ') || '').toLowerCase();
                        bValue = (b.items?.map(i => i.nombre).join(', ') || '').toLowerCase();
                        break;
                    case 'total':
                        aValue = (a.monto_pagado_real !== undefined && a.monto_pagado_real < a.total) ? a.monto_pagado_real : a.total;
                        bValue = (b.monto_pagado_real !== undefined && b.monto_pagado_real < b.total) ? b.monto_pagado_real : b.total;
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
    }, [salesWithClientData, sortConfig, localMap, professionalMap]);

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

    const sortedEgresos = useMemo(() => {
        let sortableItems = [...egresosWithData];
        if (sortConfigEgresos !== null) {
            sortableItems.sort((a, b) => {
                let aValue: any;
                let bValue: any;

                switch (sortConfigEgresos.key) {
                    case 'fecha':
                        aValue = a.fecha instanceof Timestamp ? a.fecha.toMillis() : new Date(a.fecha).getTime();
                        bValue = b.fecha instanceof Timestamp ? b.fecha.toMillis() : new Date(b.fecha).getTime();
                        break;
                    case 'local':
                        aValue = (localMap.get(a.local_id ?? '') || '').toLowerCase();
                        bValue = (localMap.get(b.local_id ?? '') || '').toLowerCase();
                        break;
                    case 'concepto':
                        aValue = (a.concepto || '').toLowerCase();
                        bValue = (b.concepto || '').toLowerCase();
                        break;
                    case 'aQuien':
                        aValue = (a.aQuienNombre || a.aQuien || '').toLowerCase();
                        bValue = (b.aQuienNombre || b.aQuien || '').toLowerCase();
                        break;
                    case 'comentarios':
                        aValue = (a.comentarios || '').toLowerCase();
                        bValue = (b.comentarios || '').toLowerCase();
                        break;
                    case 'monto':
                        aValue = a.monto || 0;
                        bValue = b.monto || 0;
                        break;
                    default:
                        return 0;
                }

                if (aValue < bValue) return sortConfigEgresos.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfigEgresos.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [egresosWithData, sortConfigEgresos, localMap]);

    const requestSortEgresos = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfigEgresos && sortConfigEgresos.key === key && sortConfigEgresos.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfigEgresos({ key, direction });
    };

    const SortIconEgresos = ({ field }: { field: string }) => {
        if (!sortConfigEgresos || sortConfigEgresos.key !== field) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />;
        if (sortConfigEgresos.direction === 'asc') return <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" />;
        return <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />;
    };

    const sortedIngresos = useMemo(() => {
        let sortableItems = [...ingresos];
        if (sortConfigIngresos !== null) {
            sortableItems.sort((a, b) => {
                let aValue: any;
                let bValue: any;

                switch (sortConfigIngresos.key) {
                    case 'fecha':
                        aValue = a.fecha instanceof Timestamp ? a.fecha.toMillis() : new Date(a.fecha).getTime();
                        bValue = b.fecha instanceof Timestamp ? b.fecha.toMillis() : new Date(b.fecha).getTime();
                        break;
                    case 'concepto':
                        aValue = (a.concepto || '').toLowerCase();
                        bValue = (b.concepto || '').toLowerCase();
                        break;
                    case 'comentarios':
                        aValue = (a.comentarios || '').toLowerCase();
                        bValue = (b.comentarios || '').toLowerCase();
                        break;
                    case 'monto':
                        aValue = a.monto || 0;
                        bValue = b.monto || 0;
                        break;
                    default:
                        return 0;
                }

                if (aValue < bValue) return sortConfigIngresos.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfigIngresos.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [ingresos, sortConfigIngresos]);

    const requestSortIngresos = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfigIngresos && sortConfigIngresos.key === key && sortConfigIngresos.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfigIngresos({ key, direction });
    };

    const SortIconIngresos = ({ field }: { field: string }) => {
        if (!sortConfigIngresos || sortConfigIngresos.key !== field) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />;
        if (sortConfigIngresos.direction === 'asc') return <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" />;
        return <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />;
    };

    // We already have loading state from hook
    const localesLoading = dataLoading;
    const clientsLoading = dataLoading;
    const salesLoading = dataLoading;
    const egresosLoading = dataLoading;
    const ingresosLoading = dataLoading;

    // Derived values for summary cards (mapping to hook outputs)
    const totalVentasFacturadas = totals.ventas;
    const ingresosManuales = totals.ingresosManuales;
    const totalEgresos = totals.egresos;

    const handleSearch = () => {
        const normalizedRange = dateRange?.from ? {
            from: dateRange.from,
            to: dateRange.to || dateRange.from
        } : undefined;

        setActiveFilters({ dateRange: normalizedRange, localId: selectedLocalId });
        setCurrentPageSales(1);
        setCurrentPageEgresos(1);
        setCurrentPageIngresos(1);

        setQueryKey(prev => prev + 1);
    };

    const handleViewDetails = (sale: Sale) => {
        setSelectedSale(sale);
        setIsDetailModalOpen(true);
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
                        const selectedLocal = locales.find(l => l.id === currentSaleData.local_id);

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
                            local_name: selectedLocal?.name || 'Local',
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
            setQueryKey(prevKey => prevKey + 1);

            await logAuditAction({
                action: 'Eliminar Venta',
                details: `Venta ID: ${saleToDelete.id} eliminada. Monto: $${saleToDelete.total}. Local: ${saleToDelete.local_id}`,
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

    const handleOpenEditEgreso = (egreso: Egreso) => {
        const action = () => {
            setEditingEgreso(egreso);
            setIsEgresoModalOpen(true);
        };
        if (user?.role === 'Administrador general') {
            action();
        } else {
            setAuthAction({ execute: action, description: `Editar egreso: ${egreso.concepto} por $${egreso.monto}` });
            setTimeout(() => setIsAuthModalOpen(true), 0);
        }
    };

    const handleDeleteEgreso = async () => {
        if (!egresoToDelete || egresoDeleteConfirmationText !== 'ELIMINAR' || !db) return;
        try {
            const batch = writeBatch(db);
            const egresoRef = doc(db, 'egresos', egresoToDelete.id);

            // SPECIAL LOGIC: Revert Commission Payment
            if (egresoToDelete.concepto === 'Pago de Comisión y Propinas') {
                const professionalId = egresoToDelete.aQuien;

                // Case A: Structured details exist (New payments)
                if (egresoToDelete.commission_payment_details) {
                    const { saleItemIds, tipSaleIds } = egresoToDelete.commission_payment_details;

                    // Group item updates by saleId
                    const salesToUpdate = new Map<string, { itemsToUnpay: number[], unpayTip: boolean }>();

                    saleItemIds?.forEach((detail: { saleId: string, itemIndex: number }) => { // Type check safety
                        if (!salesToUpdate.has(detail.saleId)) {
                            salesToUpdate.set(detail.saleId, { itemsToUnpay: [], unpayTip: false });
                        }
                        salesToUpdate.get(detail.saleId)?.itemsToUnpay.push(detail.itemIndex);
                    });

                    tipSaleIds?.forEach((saleId: string) => { // Type check safety
                        if (!salesToUpdate.has(saleId)) {
                            salesToUpdate.set(saleId, { itemsToUnpay: [], unpayTip: false });
                        }
                        const data = salesToUpdate.get(saleId);
                        if (data) data.unpayTip = true;
                    });

                    // Fetch and update each sale
                    for (const [saleId, changes] of Array.from(salesToUpdate.entries())) {
                        const saleRef = doc(db, 'ventas', saleId);
                        const saleSnap = await getDoc(saleRef);
                        if (saleSnap.exists()) {
                            const saleData = saleSnap.data() as Sale;
                            const newItems = [...(saleData.items || [])];
                            let modified = false;

                            changes.itemsToUnpay.forEach(index => {
                                if (newItems[index]) {
                                    newItems[index].commissionPaid = false;
                                    modified = true;
                                }
                            });

                            const updateData: any = {};
                            if (modified) updateData.items = newItems;
                            if (changes.unpayTip) {
                                const currentPaidTo = saleData.tipsPaidTo || [];
                                updateData.tipsPaidTo = currentPaidTo.filter(id => id !== professionalId);
                                if (updateData.tipsPaidTo.length === 0) updateData.tipPaid = false;
                            }

                            if (Object.keys(updateData).length > 0) {
                                batch.update(saleRef, updateData);
                            }
                        }
                    }

                } else {
                    // Case B: Heuristic fallback (Old/Current payments)
                    // Find sales on the same day as the expense
                    const expenseDate = egresoToDelete.fecha instanceof Timestamp ? egresoToDelete.fecha.toDate() : new Date(egresoToDelete.fecha);
                    const start = startOfDay(expenseDate);
                    const end = endOfDay(expenseDate);

                    const salesQuery = query(
                        collection(db, 'ventas'),
                        where('fecha_hora_venta', '>=', Timestamp.fromDate(start)),
                        where('fecha_hora_venta', '<=', Timestamp.fromDate(end))
                    );

                    const salesSnap = await getDocs(salesQuery);

                    salesSnap.forEach(docSnap => {
                        const sale = docSnap.data() as Sale;
                        let modified = false;
                        const newItems = [...(sale.items || [])];

                        // Revert item commissions
                        newItems.forEach((item, index) => {
                            if (item.barbero_id === professionalId && item.commissionPaid) {
                                newItems[index].commissionPaid = false;
                                modified = true;
                            }
                        });

                        const updateData: any = {};
                        if (modified) updateData.items = newItems;

                        // Revert tips if this professional is involved
                        if (sale.tipPaid || (sale.tipsPaidTo && sale.tipsPaidTo.length > 0)) {
                            const isProfessionalInvolved = sale.items?.some(i => i.barbero_id === professionalId);
                            if (isProfessionalInvolved) {
                                const currentPaidTo = sale.tipsPaidTo || [];
                                updateData.tipsPaidTo = currentPaidTo.filter(id => id !== professionalId);
                                if (updateData.tipsPaidTo.length === 0) updateData.tipPaid = false;
                            }
                        }

                        if (Object.keys(updateData).length > 0) {
                            batch.update(docSnap.ref, updateData);
                        }
                    });
                }
            }

            // Delete Egreso
            batch.delete(egresoRef);

            await batch.commit();

            toast({
                title: "Egreso Eliminado",
                description: "El egreso ha sido eliminado y, si era un pago de comisión, se ha revertido.",
            });
            setQueryKey(prevKey => prevKey + 1);

            await logAuditAction({
                action: 'Eliminar Egreso',
                details: `Egreso ID: ${egresoToDelete.id} eliminado. Monto: $${egresoToDelete.monto}. Concepto: ${egresoToDelete.concepto}`,
                userId: user?.uid || 'unknown',
                userName: user?.displayName || user?.email || 'Unknown',
                userRole: user?.role,
                severity: 'warning',
                entityId: egresoToDelete.id,
                localId: egresoToDelete.local_id || 'unknown'
            });
        } catch (error) {
            console.error("Error deleting egreso: ", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "No se pudo eliminar el egreso.",
            });
        } finally {
            setEgresoToDelete(null);
            setEgresoDeleteConfirmationText('');
        }
    };

    const handleOpenDeleteEgresoModal = (egreso: Egreso) => {
        const action = () => setEgresoToDelete(egreso);
        if (user?.role === 'Administrador general') {
            action();
        } else {
            setAuthAction({ execute: action, description: `Eliminar egreso: ${egreso.concepto} por $${egreso.monto}` });
            setTimeout(() => setIsAuthModalOpen(true), 0);
        }
    }

    const handleOpenEditIngreso = (ingreso: IngresoManual) => {
        const action = () => {
            setEditingIngreso(ingreso);
            setIsIngresoModalOpen(true);
        };
        if (user?.role === 'Administrador general') {
            action();
        } else {
            setAuthAction({ execute: action, description: `Editar ingreso: ${ingreso.concepto} por $${ingreso.monto}` });
            setTimeout(() => setIsAuthModalOpen(true), 0);
        }
    };

    const handleOpenDeleteIngresoModal = (ingreso: IngresoManual) => {
        const action = () => setIngresoToDelete(ingreso);
        if (user?.role === 'Administrador general') {
            action();
        } else {
            setAuthAction({ execute: action, description: `Eliminar ingreso: ${ingreso.concepto} por $${ingreso.monto}` });
            setTimeout(() => setIsAuthModalOpen(true), 0);
        }
    };

    const handleDeleteIngreso = async () => {
        if (!ingresoToDelete || ingresoDeleteConfirmationText !== 'ELIMINAR' || !db) return;
        try {
            await deleteDoc(doc(db, 'ingresos_manuales', ingresoToDelete.id));
            toast({
                title: "Ingreso Eliminado",
                description: "El ingreso ha sido eliminado permanentemente.",
            });
            setQueryKey(prevKey => prevKey + 1);

            await logAuditAction({
                action: 'Eliminar Ingreso',
                details: `Ingreso ID: ${ingresoToDelete.id} eliminado. Monto: $${ingresoToDelete.monto}. Concepto: ${ingresoToDelete.concepto}`,
                userId: user?.uid || 'unknown',
                userName: user?.displayName || user?.email || 'Unknown',
                userRole: user?.role,
                severity: 'warning',
                entityId: ingresoToDelete.id,
                localId: ingresoToDelete.local_id || 'unknown'
            });
        } catch (error) {
            console.error("Error deleting ingreso: ", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "No se pudo eliminar el ingreso.",
            });
        } finally {
            setIngresoToDelete(null);
            setIngresoDeleteConfirmationText('');
        }
    };

    const triggerDownload = () => {
        const salesData = salesWithClientData.map(sale => ({
            ID: sale.id,
            'Fecha De Pago': sale.fecha_hora_venta ? format(sale.fecha_hora_venta.toDate(), 'dd-MM-yyyy HH:mm') : 'N/A',
            Local: localMap.get(sale.local_id ?? '') || sale.local_id,
            Cliente: `${sale.client?.nombre || ''} ${sale.client?.apellido || ''}`,
            Profesional: Array.from(new Set(sale.items?.map(i => professionalMap.get(i.barbero_id) || 'N/A'))).join(', '),
            Detalle: sale.items?.map(i => i.nombre).join(', '),
            'Monto Facturado': sale.total,
        }));

        const egresosData = egresosWithData.map(egreso => ({
            Fecha: egreso.fecha instanceof Timestamp ? format(egreso.fecha.toDate(), 'dd-MM-yyyy') : format(egreso.fecha, 'dd-MM-yyyy'),
            Local: localMap.get(egreso.local_id ?? ''),
            Concepto: egreso.concepto,
            'A quién se entrega': egreso.aQuien,
            Comentarios: egreso.comentarios,
            Monto: egreso.monto,
        }));

        if (salesData.length === 0 && egresosData.length === 0) {
            toast({
                variant: "destructive",
                title: "No hay datos para exportar",
                description: "No hay ventas ni egresos en el período seleccionado.",
            });
            return;
        }

        const workbook = XLSX.utils.book_new();

        if (salesData.length > 0) {
            const salesWorksheet = XLSX.utils.json_to_sheet(salesData);
            XLSX.utils.book_append_sheet(workbook, salesWorksheet, 'Ventas');
        }

        if (egresosData.length > 0) {
            const egresosWorksheet = XLSX.utils.json_to_sheet(egresosData);
            XLSX.utils.book_append_sheet(workbook, egresosWorksheet, 'Egresos');
        }

        XLSX.writeFile(workbook, `Reporte_Caja_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

        toast({
            title: 'Reporte generado',
            description: 'La descarga de tu reporte ha comenzado.'
        })
    }

    const handleDownloadRequest = async () => {
        if (!authCode || !db) {
            toast({ variant: 'destructive', title: 'Código requerido' });
            return;
        }
        const authCodeQuery = query(
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

    const handleAuthCodeSubmit = async () => {
        if (!authCode || !db) {
            toast({ variant: 'destructive', title: 'Código requerido' });
            return;
        }
        const authCodeQuery = query(
            collection(db, 'codigos_autorizacion'),
            where('code', '==', authCode),
            where('active', '==', true),
            where('cashbox', '==', true) // Check for cashbox permission
        );
        const querySnapshot = await getDocs(authCodeQuery);
        if (querySnapshot.empty) {
            toast({ variant: 'destructive', title: 'Código inválido o sin permiso' });
        } else {
            toast({ title: 'Código correcto' });
            authAction?.execute(); // Execute the stored action
            setIsAuthModalOpen(false);

            await logAuditAction({
                action: 'Autorización por Código',
                details: `Acción autorizada en caja: ${authAction?.description || 'Desconocida'}.`,
                userId: user?.uid || 'unknown',
                userName: user?.displayName || user?.email || 'Unknown',
                userRole: user?.role,
                authCode: authCode,
                severity: 'info',
                localId: selectedLocalId
            });
        }
        setAuthCode('');
        setAuthAction(null);
    };


    const handleOpenDeleteSaleModal = (sale: Sale) => {
        const action = () => setSaleToDelete(sale);
        if (user?.role === 'Administrador general') {
            action();
        } else {
            setAuthAction({ execute: action, description: `Eliminar venta de $${sale.total} para ${sale.client?.nombre || 'Desconocido'}` });
            // Delay opening the modal slightly to allow dropdown to close cleanly
            setTimeout(() => setIsAuthModalOpen(true), 100);
        }
    }


    const isLoading = localesLoading || salesLoading || clientsLoading || egresosLoading || ingresosLoading;

    // --- LIVE CASH LOGIC: Calculates current cash in box based on Last Cut + Transactions since then ---
    const { liveCashInBox, loading: liveCashLoading } = useLiveCash(selectedLocalId, queryKey);
    // ----------------------

    const isLocalAdmin = user?.role !== 'Administrador general';

    // Use sortedSales instead of salesWithClientData
    const totalPagesSales = Math.ceil(sortedSales.length / itemsPerPageSales);
    const paginatedSales = sortedSales.slice(
        (currentPageSales - 1) * itemsPerPageSales,
        currentPageSales * itemsPerPageSales
    );

    const totalPagesEgresos = Math.ceil(sortedEgresos.length / itemsPerPageEgresos);
    const paginatedEgresos = sortedEgresos.slice(
        (currentPageEgresos - 1) * itemsPerPageEgresos,
        currentPageEgresos * itemsPerPageEgresos
    );

    const totalPagesIngresos = Math.ceil(sortedIngresos.length / itemsPerPageIngresos);
    const paginatedIngresos = sortedIngresos.slice(
        (currentPageIngresos - 1) * itemsPerPageIngresos,
        currentPageIngresos * itemsPerPageIngresos
    );

    const { data: roles } = useFirestoreQuery<Role>('roles');
    const userRole = roles.find(r => r.title === user?.role);
    const historyLimit = userRole?.historyRestrictionDays;

    return (
        <>
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">Caja</h2>
                        <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                            Gestión y control de flujo de caja, ingresos, egresos y cortes
                        </p>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                        <TooltipProvider delayDuration={150}>
                            {/* Pago de Comisiones */}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() => {
                                            playAgendaClickSound();
                                            setIsCommissionModalOpen(true);
                                        }}
                                        title="Pago de Comisiones"
                                        aria-label="Pago de Comisiones"
                                        className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg text-slate-500 hover:text-foreground hover:bg-muted/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer"
                                    >
                                        <Percent className="h-4 w-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs font-medium">
                                    Pago de Comisiones
                                </TooltipContent>
                            </Tooltip>

                            {/* Corte de Caja */}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() => {
                                            playAgendaClickSound();
                                            setIsClosingModalOpen(true);
                                        }}
                                        title="Corte de Caja"
                                        aria-label="Corte de Caja"
                                        className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg text-slate-500 hover:text-foreground hover:bg-muted/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer"
                                    >
                                        <LogOut className="h-4 w-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs font-medium">
                                    Corte de Caja
                                </TooltipContent>
                            </Tooltip>

                            {/* Registrar Ingreso */}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() => {
                                            playAgendaClickSound();
                                            setEditingIngreso(null);
                                            setIsIngresoModalOpen(true);
                                        }}
                                        title="Registrar Ingreso"
                                        aria-label="Registrar Ingreso"
                                        className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg text-slate-500 hover:text-foreground hover:bg-muted/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs font-medium">
                                    Registrar Ingreso
                                </TooltipContent>
                            </Tooltip>

                            {/* Registrar Egreso */}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() => {
                                            playAgendaClickSound();
                                            setEditingEgreso(null);
                                            setIsEgresoModalOpen(true);
                                        }}
                                        title="Registrar Egreso"
                                        aria-label="Registrar Egreso"
                                        className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg text-slate-500 hover:text-foreground hover:bg-muted/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer"
                                    >
                                        <Minus className="h-4 w-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs font-medium">
                                    Registrar Egreso
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-stretch">
                        <Card className="border-border/60 bg-card/60 rounded-xl h-full shadow-xs">
                            <CardContent className="p-3 sm:p-5 flex flex-col justify-center h-full">
                                {/* VISTA ESCRITORIO (hidden sm:grid) */}
                                <div className="hidden sm:grid grid-cols-[1fr_1fr_auto] items-end gap-3 w-full">
                                    <div className="space-y-1.5 min-w-0">
                                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block truncate">Periodo</label>
                                        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    id="date"
                                                    variant={"outline"}
                                                    className={cn(
                                                        "w-full justify-start text-left font-normal rounded-xl h-9 text-xs border-border/60 px-3 truncate",
                                                        !dateRange && "text-muted-foreground"
                                                    )}
                                                >
                                                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
                                                    {dateRange?.from ? (
                                                        dateRange.to && !isSameDay(dateRange.from, dateRange.to) ? (
                                                            <span className="truncate">{format(dateRange.from, "dd MMM", { locale: es })} - {format(dateRange.to, "dd MMM", { locale: es })}</span>
                                                        ) : (
                                                            <span className="truncate">{format(dateRange.from, "dd MMM, y", { locale: es })}</span>
                                                        )
                                                    ) : (
                                                        <span className="truncate">Seleccionar</span>
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
                                    <div className="space-y-1.5 min-w-0">
                                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block truncate">Local</label>
                                        <Select value={selectedLocalId} onValueChange={setSelectedLocalId} disabled={isLocalAdmin || localesLoading}>
                                            <SelectTrigger className="rounded-xl h-9 text-xs border-border/60 px-3 truncate">
                                                <SelectValue placeholder={localesLoading ? "Cargando..." : "Seleccionar"} />
                                            </SelectTrigger>
                                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] p-1">
                                                {!isLocalAdmin && <SelectItem value="todos">Todos los locales</SelectItem>}
                                                {locales.map(local => (
                                                    <SelectItem key={local.id} value={local.id}>
                                                        {local.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button
                                        variant="alfa"
                                        className="h-9 px-4 shrink-0 font-semibold text-xs flex items-center justify-center gap-1.5"
                                        onClick={handleSearch}
                                        disabled={isLoading}
                                    >
                                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 shrink-0" />}
                                        <span>Buscar</span>
                                    </Button>
                                </div>

                                {/* VISTA MÓVIL (sm:hidden) - IDÉNTICA A VENTAS FACTURADAS */}
                                <div className="sm:hidden space-y-2">
                                    <div className="flex items-center gap-1.5">
                                        {/* Selector de Rango de Fecha */}
                                        <Popover open={isMobilePopoverOpen} onOpenChange={setIsMobilePopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    id="date-mobile"
                                                    variant="outline"
                                                    className={cn(
                                                        "flex-1 justify-start text-left font-normal rounded-xl h-9 text-xs border-border/60 px-2.5 truncate",
                                                        !dateRange && "text-muted-foreground"
                                                    )}
                                                >
                                                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
                                                    <span className="truncate">
                                                        {dateRange?.from ? (
                                                            dateRange.to && !isSameDay(dateRange.from, dateRange.to) ? (
                                                                `${format(dateRange.from, "dd MMM", { locale: es })} - ${format(dateRange.to, "dd MMM", { locale: es })}`
                                                            ) : (
                                                                format(dateRange.from, "dd MMM, y", { locale: es })
                                                            )
                                                        ) : (
                                                            'Periodo'
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

                                        {/* Botón Filtro Sucursal */}
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setShowMobileFilters(!showMobileFilters)}
                                            className={cn(
                                                "h-9 px-2.5 rounded-xl border-border/60 text-xs flex items-center gap-1 shrink-0 transition-colors",
                                                (showMobileFilters || selectedLocalId !== 'todos') && "border-blue-500 text-blue-400 bg-blue-500/10"
                                            )}
                                            title="Sucursal"
                                        >
                                            <SlidersHorizontal className="h-3.5 w-3.5" />
                                            {selectedLocalId !== 'todos' && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                                            )}
                                        </Button>

                                        {/* Botón Buscar */}
                                        <Button
                                            variant="alfa"
                                            className="h-9 px-3 shrink-0 font-semibold text-xs flex items-center justify-center gap-1.5"
                                            onClick={handleSearch}
                                            disabled={isLoading}
                                        >
                                            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5 shrink-0" />}
                                            <span>Buscar</span>
                                        </Button>
                                    </div>

                                    {/* Desplegable de Sucursal en móvil */}
                                    {showMobileFilters && (
                                        <div className="pt-2 border-t border-border/40 space-y-1 animate-in fade-in-50 duration-200">
                                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Sucursal</span>
                                            <Select value={selectedLocalId} onValueChange={setSelectedLocalId} disabled={isLocalAdmin || localesLoading}>
                                                <SelectTrigger className="rounded-xl h-9 text-xs border-border/60">
                                                    <SelectValue placeholder={localesLoading ? "Cargando..." : "Todos los locales"} />
                                                </SelectTrigger>
                                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                                                    {!isLocalAdmin && <SelectItem value="todos">Todos los locales</SelectItem>}
                                                    {locales.map(local => (
                                                        <SelectItem key={local.id} value={local.id}>
                                                            {local.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="flex-shrink-0 w-full md:w-64 border-border/60 bg-card/60 rounded-xl h-full shadow-xs">
                            <CardContent className="p-4 flex flex-col items-center justify-center h-full text-center">
                                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                                    <DollarSign className="h-4 w-4 text-[#C5A880]" />
                                    <span className="text-xs font-semibold uppercase tracking-wider">Efectivo en caja</span>
                                </div>
                                {selectedLocalId === 'todos' ? (
                                    <p className="text-sm font-semibold text-muted-foreground">Seleccione sucursal</p>
                                ) : liveCashLoading ? (
                                    <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
                                ) : (
                                    <p className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                                        ${liveCashInBox.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="flex justify-between items-center">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resumen de Flujo</p>
                        <button
                            type="button"
                            onClick={() => setIsDownloadModalOpen(true)}
                            className="text-slate-400 hover:text-white transition-colors p-1"
                            title="Descargar reporte"
                        >
                            <Download className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Detailed Summary - Desktop */}
                    <div className="hidden lg:grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1.15fr] gap-3 items-center">
                        <SummaryCard title="Ventas Facturadas" amount={totalVentasFacturadas} />
                        <IconSeparator icon={Plus} />
                        <SummaryCard title="Otros Ingresos" amount={ingresosManuales} />
                        <IconSeparator icon={Minus} />
                        <SummaryCard title="Egresos" amount={totalEgresos} />
                        <IconSeparator icon={Equal} />
                        <SummaryCard
                            title="Resultado de Flujo del Periodo"
                            amount={totalVentasFacturadas + ingresosManuales - totalEgresos}
                            highlighted
                        />
                    </div>

                    {/* Detailed Summary - Mobile (Compact Card instead of 7 stacked items) */}
                    <Card className="lg:hidden p-3 border-border/60 bg-card/60 rounded-xl shadow-xs">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40">
                                <p className="text-[11px] text-muted-foreground uppercase font-medium">Ventas Fact.</p>
                                <p className="text-base font-bold text-foreground">
                                    ${totalVentasFacturadas.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            </div>
                            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40">
                                <p className="text-[11px] text-muted-foreground uppercase font-medium">Otros Ingresos</p>
                                <p className="text-base font-bold text-foreground">
                                    ${ingresosManuales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            </div>
                            <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40">
                                <p className="text-[11px] text-muted-foreground uppercase font-medium">Egresos</p>
                                <p className="text-base font-bold text-destructive">
                                    ${totalEgresos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            </div>
                            <div className="p-2.5 rounded-lg bg-blue-500/10 border-2 border-blue-500/40">
                                <p className="text-[11px] text-blue-400 uppercase font-semibold">Flujo Neto</p>
                                <p className="text-base font-extrabold text-blue-400">
                                    ${(totalVentasFacturadas + ingresosManuales - totalEgresos).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            </div>
                        </div>
                    </Card>

                    {/* Main Table */}
                    <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm">
                        <Tabs defaultValue="ventas-facturadas" className="w-full">
                            <div className="p-3 sm:p-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-muted/10">
                                <TabsList className="bg-muted/40 p-1 rounded-xl border border-border/60 h-auto grid grid-cols-3 w-full sm:w-auto sm:flex sm:flex-wrap gap-1">
                                    <TabsTrigger
                                        value="ventas-facturadas"
                                        className="rounded-lg text-xs font-semibold data-[state=active]:bg-[#202A49] data-[state=active]:text-white data-[state=active]:shadow-sm px-1.5 sm:px-3.5 py-1.5 transition-all flex items-center justify-center gap-1 sm:gap-1.5 truncate"
                                    >
                                        <span className="sm:hidden">Flujo</span>
                                        <span className="hidden sm:inline">Flujo de Ventas Facturadas</span>
                                        <Badge variant="secondary" className="text-[10px] px-1 sm:px-1.5 py-0 font-normal shrink-0">
                                            {sortedSales.length}
                                        </Badge>
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="otros-ingresos"
                                        className="rounded-lg text-xs font-semibold data-[state=active]:bg-[#202A49] data-[state=active]:text-white data-[state=active]:shadow-sm px-1.5 sm:px-3.5 py-1.5 transition-all flex items-center justify-center gap-1 sm:gap-1.5 truncate"
                                    >
                                        <span className="sm:hidden">Ingresos</span>
                                        <span className="hidden sm:inline">Otros Ingresos</span>
                                        <Badge variant="secondary" className="text-[10px] px-1 sm:px-1.5 py-0 font-normal shrink-0">
                                            {sortedIngresos.length}
                                        </Badge>
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="egresos"
                                        className="rounded-lg text-xs font-semibold data-[state=active]:bg-[#202A49] data-[state=active]:text-white data-[state=active]:shadow-sm px-1.5 sm:px-3.5 py-1.5 transition-all flex items-center justify-center gap-1 sm:gap-1.5 truncate"
                                    >
                                        <span className="truncate">Egresos</span>
                                        <Badge variant="secondary" className="text-[10px] px-1 sm:px-1.5 py-0 font-normal shrink-0">
                                            {sortedEgresos.length}
                                        </Badge>
                                    </TabsTrigger>
                                </TabsList>
                            </div>
                            <TabsContent value="ventas-facturadas" className="mt-0">
                                {/* Vista Escritorio: Tabla */}
                                <div className="hidden sm:block overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                                <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('id')}>
                                                    <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                        ID
                                                        <SortIcon field="id" />
                                                    </div>
                                                </TableHead>
                                                <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('fecha_hora_venta')}>
                                                    <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                        Fecha De Pago
                                                        <SortIcon field="fecha_hora_venta" />
                                                    </div>
                                                </TableHead>
                                                <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('local')}>
                                                    <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                        Local
                                                        <SortIcon field="local" />
                                                    </div>
                                                </TableHead>
                                                <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('client')}>
                                                    <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                        Cliente
                                                        <SortIcon field="client" />
                                                    </div>
                                                </TableHead>
                                                <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('professional')}>
                                                    <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                        Profesional
                                                        <SortIcon field="professional" />
                                                    </div>
                                                </TableHead>
                                                <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('items')}>
                                                    <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                        Detalle
                                                        <SortIcon field="items" />
                                                    </div>
                                                </TableHead>
                                                <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group text-right" onClick={() => requestSort('total')}>
                                                    <div className="flex items-center justify-end gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                        Monto Facturado
                                                        <SortIcon field="total" />
                                                    </div>
                                                </TableHead>
                                                <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group text-right" onClick={() => requestSort('total')}>
                                                    <div className="flex items-center justify-end gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                        Flujo Del Periodo
                                                        <SortIcon field="total" />
                                                    </div>
                                                </TableHead>
                                                <TableHead className="py-1 px-3 text-xs text-right">Opciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isLoading ? (
                                                Array.from({ length: 3 }).map((_, i) => (
                                                    <TableRow key={i} className="h-9">
                                                        <TableCell colSpan={9} className="py-1.5 px-3"><div className="h-6 w-full bg-muted animate-pulse rounded-md" /></TableCell>
                                                    </TableRow>
                                                ))
                                            ) : paginatedSales.length === 0 ? (
                                                <TableRow className="h-16">
                                                    <TableCell colSpan={9} className="text-center text-xs text-muted-foreground">No hay ventas para el período seleccionado.</TableCell>
                                                </TableRow>
                                            ) : (
                                                paginatedSales.map((sale) => (
                                                    <TableRow key={sale.id} onClick={() => setSelectedSale(sale)} className={cn("h-9 cursor-pointer hover:bg-muted/30 transition-colors border-b border-border/40", selectedSale?.id === sale.id && "bg-muted/40")}>
                                                        <TableCell className="py-1.5 px-3 font-mono text-xs">{sale.id.slice(0, 8)}...</TableCell>
                                                        <TableCell className="py-1.5 px-3 text-xs whitespace-nowrap">{sale.fecha_hora_venta ? format(sale.fecha_hora_venta.toDate(), 'dd-MM-yyyy HH:mm') : 'N/A'}</TableCell>
                                                        <TableCell className="py-1.5 px-3 text-xs">{localMap.get(sale.local_id ?? '') || sale.local_id}</TableCell>
                                                        <TableCell className="py-1.5 px-3 text-xs font-medium">{sale.client?.nombre} {sale.client?.apellido}</TableCell>
                                                        <TableCell className="py-1.5 px-3 text-xs">{Array.from(new Set(sale.items?.map(i => professionalMap.get(i.barbero_id) || 'N/A').filter(Boolean))).join(', ')}</TableCell>
                                                        <TableCell className="py-1.5 px-3 text-xs">{sale.items?.map(i => i.nombre).join(', ')}</TableCell>
                                                        <TableCell className="py-1.5 px-3 text-xs text-right font-medium">${((sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total) ? sale.monto_pagado_real : sale.total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                        <TableCell className="py-1.5 px-3 text-xs text-right font-medium text-foreground">${((sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total) ? sale.monto_pagado_real : sale.total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                        <TableCell className="py-1.5 px-3 text-xs text-right">
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleViewDetails(sale)}
                                                                    className="text-slate-400 hover:text-white transition-colors p-1"
                                                                    title="Ver comprobante"
                                                                >
                                                                    <Eye className="h-4 w-4" />
                                                                </button>
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild>
                                                                        <button
                                                                            type="button"
                                                                            className="text-slate-400 hover:text-white transition-colors p-1"
                                                                            title="Acciones"
                                                                        >
                                                                            <ChevronDown className="h-4 w-4" />
                                                                        </button>
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end" className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1.5">
                                                                        <DropdownMenuItem onSelect={() => toast({ title: "Funcionalidad no implementada" })} className="rounded-lg cursor-pointer">
                                                                            <Mail className="mr-2 h-4 w-4 text-slate-300" />
                                                                            <span>Enviar Comprobante</span>
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem onSelect={() => window.print()} className="rounded-lg cursor-pointer">
                                                                            <Printer className="mr-2 h-4 w-4 text-slate-300" />
                                                                            <span>Imprimir</span>
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem onSelect={() => setTimeout(() => handleOpenDeleteSaleModal(sale), 150)} className="rounded-lg cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
                                                                            <Trash2 className="mr-2 h-4 w-4 text-red-400" />
                                                                            <span>Eliminar</span>
                                                                        </DropdownMenuItem>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>

                                {/* Vista Móvil: Tarjetas compactas */}
                                <div className="sm:hidden divide-y divide-border/60">
                                    {isLoading ? (
                                        <div className="text-center py-10 space-y-2">
                                            <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
                                            <span className="text-xs text-muted-foreground">Cargando ventas...</span>
                                        </div>
                                    ) : paginatedSales.length === 0 ? (
                                        <div className="text-center py-10 text-xs text-muted-foreground">
                                            No hay ventas para el período seleccionado.
                                        </div>
                                    ) : (
                                        paginatedSales.map((sale) => {
                                            const amount = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                                                ? sale.monto_pagado_real
                                                : sale.total;
                                            const dateStr = sale.fecha_hora_venta
                                                ? format(sale.fecha_hora_venta.toDate(), 'dd/MM/yyyy HH:mm')
                                                : 'N/A';
                                            const itemsList = sale.items?.map(i => i.nombre).join(', ') || 'Sin detalle';
                                            const profNames = Array.from(new Set(sale.items?.map(i => professionalMap.get(i.barbero_id) || 'N/A').filter(Boolean))).join(', ');

                                            return (
                                                <div key={sale.id} className="p-3.5 space-y-2 bg-card/40 hover:bg-muted/20 transition-colors">
                                                    <div className="flex items-center justify-between">
                                                        <div className="min-w-0 pr-2">
                                                            <p className="font-bold text-sm text-foreground truncate">
                                                                {sale.client?.nombre ? `${sale.client.nombre} ${sale.client.apellido || ''}` : 'Cliente General'}
                                                            </p>
                                                            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                                                <span>{dateStr}</span>
                                                                <span>•</span>
                                                                <span className="truncate">{localMap.get(sale.local_id ?? '') || 'Local'}</span>
                                                            </p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className="text-sm font-extrabold text-foreground">
                                                                ${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </p>
                                                            <p className="text-[10px] text-muted-foreground font-mono">ID: {sale.id.slice(0, 6)}</p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 px-2.5 py-1.5 rounded-lg">
                                                        <div className="truncate pr-2">
                                                            <span className="font-medium text-foreground">{itemsList}</span>
                                                            {profNames && <span className="block text-[10px] text-slate-400 mt-0.5">Atendió: {profNames}</span>}
                                                        </div>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleViewDetails(sale)}
                                                                className="text-slate-400 hover:text-white transition-colors p-1"
                                                                title="Ver comprobante"
                                                            >
                                                                <Eye className="h-4 w-4" />
                                                            </button>
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <button
                                                                        type="button"
                                                                        className="text-slate-400 hover:text-white transition-colors p-1"
                                                                        title="Acciones"
                                                                    >
                                                                        <ChevronDown className="h-4 w-4" />
                                                                    </button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end" className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1.5">
                                                                    <DropdownMenuItem onSelect={() => toast({ title: "Funcionalidad no implementada" })} className="rounded-lg cursor-pointer">
                                                                        <Mail className="mr-2 h-4 w-4 text-slate-300" />
                                                                        <span>Enviar Comprobante</span>
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onSelect={() => window.print()} className="rounded-lg cursor-pointer">
                                                                        <Printer className="mr-2 h-4 w-4 text-slate-300" />
                                                                        <span>Imprimir</span>
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onSelect={() => setTimeout(() => handleOpenDeleteSaleModal(sale), 150)} className="rounded-lg cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
                                                                        <Trash2 className="mr-2 h-4 w-4 text-red-400" />
                                                                        <span>Eliminar</span>
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                {/* Paginación */}
                                {paginatedSales.length > 0 && (
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-border/60">
                                        <div className="flex items-center space-x-2">
                                            <p className="text-xs text-muted-foreground">Resultados por página</p>
                                            <Select
                                                value={`${itemsPerPageSales}`}
                                                onValueChange={(value) => {
                                                    setItemsPerPageSales(Number(value))
                                                    setCurrentPageSales(1)
                                                }}
                                            >
                                                <SelectTrigger className="h-8 w-[70px] rounded-lg text-xs border-border/60"><SelectValue placeholder={itemsPerPageSales} /></SelectTrigger>
                                                <SelectContent className="border-2 border-blue-500 rounded-xl bg-[#151b2e] text-white">
                                                    <SelectItem value="10">10</SelectItem>
                                                    <SelectItem value="20">20</SelectItem>
                                                    <SelectItem value="50">50</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-xs text-muted-foreground font-medium">Página {currentPageSales} de {totalPagesSales || 1}</div>
                                            <div className="flex items-center space-x-1.5">
                                                <Button variant="outline" size="sm" onClick={() => setCurrentPageSales(p => Math.max(p - 1, 1))} disabled={currentPageSales === 1} className="h-8 rounded-lg border-border/60 text-xs">
                                                    <ChevronLeft className="h-3.5 w-3.5 mr-1 text-slate-400" /> Anterior
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => setCurrentPageSales(p => Math.min(p + 1, totalPagesSales))} disabled={currentPageSales === totalPagesSales} className="h-8 rounded-lg border-border/60 text-xs">
                                                    Siguiente <ChevronRight className="h-3.5 w-3.5 ml-1 text-slate-400" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </TabsContent>
                                <TabsContent value="otros-ingresos" className="mt-0">
                                    {isLoading ? (
                                        <div className="flex justify-center items-center h-28"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                                    ) : (
                                        <>
                                            {/* Vista Escritorio: Tabla */}
                                            <div className="hidden sm:block overflow-x-auto">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                                            <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSortIngresos('fecha')}>
                                                                <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">Fecha <SortIconIngresos field="fecha" /></div>
                                                            </TableHead>
                                                            <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSortIngresos('concepto')}>
                                                                <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">Concepto <SortIconIngresos field="concepto" /></div>
                                                            </TableHead>
                                                            <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSortIngresos('comentarios')}>
                                                                <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">Comentarios <SortIconIngresos field="comentarios" /></div>
                                                            </TableHead>
                                                            <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group text-right" onClick={() => requestSortIngresos('monto')}>
                                                                <div className="flex items-center justify-end gap-1 font-semibold text-foreground/70 group-hover:text-foreground">Monto <SortIconIngresos field="monto" /></div>
                                                            </TableHead>
                                                            <TableHead className="py-1 px-3 text-xs text-right">Opciones</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {paginatedIngresos.length === 0 ? (
                                                            <TableRow className="h-16"><TableCell colSpan={5} className="text-center text-xs text-muted-foreground">No hay otros ingresos para el período seleccionado.</TableCell></TableRow>
                                                        ) : paginatedIngresos.map((ingreso) => (
                                                            <TableRow key={ingreso.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                                                <TableCell className="py-1.5 px-3 text-xs">{format(ingreso.fecha.toDate(), 'dd-MM-yyyy')}</TableCell>
                                                                <TableCell className="py-1.5 px-3 text-xs font-semibold text-foreground">{ingreso.concepto}</TableCell>
                                                                <TableCell className="py-1.5 px-3 text-xs text-muted-foreground">{ingreso.comentarios || '-'}</TableCell>
                                                                <TableCell className="py-1.5 px-3 text-xs text-right font-medium text-foreground">${ingreso.monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                                <TableCell className="py-1.5 px-3 text-xs text-right">
                                                                    <DropdownMenu>
                                                                        <DropdownMenuTrigger asChild>
                                                                            <button
                                                                                type="button"
                                                                                className="text-slate-400 hover:text-white transition-colors p-1"
                                                                                title="Acciones"
                                                                            >
                                                                                <ChevronDown className="h-4 w-4" />
                                                                            </button>
                                                                        </DropdownMenuTrigger>
                                                                        <DropdownMenuContent align="end" className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1.5">
                                                                            <DropdownMenuItem onSelect={() => setTimeout(() => handleOpenEditIngreso(ingreso), 150)} className="rounded-lg cursor-pointer">
                                                                                <Pencil className="mr-2 h-4 w-4 text-slate-300" /> Editar
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem onSelect={() => setTimeout(() => handleOpenDeleteIngresoModal(ingreso), 150)} className="rounded-lg cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
                                                                                <Trash2 className="mr-2 h-4 w-4 text-red-400" /> Eliminar
                                                                            </DropdownMenuItem>
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>

                                            {/* Vista Móvil: Tarjetas compactas */}
                                            <div className="sm:hidden divide-y divide-border/60">
                                                {paginatedIngresos.length === 0 ? (
                                                    <div className="text-center py-10 text-xs text-muted-foreground">
                                                        No hay otros ingresos para el período seleccionado.
                                                    </div>
                                                ) : (
                                                    paginatedIngresos.map((ingreso) => (
                                                        <div key={ingreso.id} className="p-3.5 space-y-2 bg-card/40 hover:bg-muted/20 transition-colors">
                                                            <div className="flex items-center justify-between">
                                                                <div className="min-w-0 pr-2">
                                                                    <p className="font-bold text-sm text-foreground truncate">{ingreso.concepto}</p>
                                                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                                                        {format(ingreso.fecha.toDate(), 'dd/MM/yyyy')}
                                                                    </p>
                                                                </div>
                                                                <div className="text-right shrink-0">
                                                                    <p className="text-sm font-extrabold text-foreground">
                                                                        +${ingreso.monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            {ingreso.comentarios && (
                                                                <p className="text-xs text-muted-foreground bg-muted/20 px-2.5 py-1.5 rounded-lg">
                                                                    {ingreso.comentarios}
                                                                </p>
                                                            )}
                                                            <div className="flex items-center justify-end gap-1.5 pt-1">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => setTimeout(() => handleOpenEditIngreso(ingreso), 150)}
                                                                    className="h-7 px-2.5 text-xs text-slate-400 hover:text-white rounded-lg"
                                                                >
                                                                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => setTimeout(() => handleOpenDeleteIngresoModal(ingreso), 150)}
                                                                    className="h-7 px-2.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>

                                            {/* Paginación */}
                                            {paginatedIngresos.length > 0 && (
                                                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-border/60">
                                                    <div className="flex items-center space-x-2">
                                                        <p className="text-xs text-muted-foreground">Resultados por página</p>
                                                        <Select
                                                            value={`${itemsPerPageIngresos}`}
                                                            onValueChange={(value) => {
                                                                setItemsPerPageIngresos(Number(value))
                                                                setCurrentPageIngresos(1)
                                                            }}
                                                        >
                                                            <SelectTrigger className="h-8 w-[70px] rounded-lg text-xs border-border/60"><SelectValue placeholder={itemsPerPageIngresos} /></SelectTrigger>
                                                            <SelectContent className="border-2 border-blue-500 rounded-xl bg-[#151b2e] text-white">
                                                                <SelectItem value="10">10</SelectItem>
                                                                <SelectItem value="20">20</SelectItem>
                                                                <SelectItem value="50">50</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-xs text-muted-foreground font-medium">Página {currentPageIngresos} de {totalPagesIngresos || 1}</div>
                                                        <div className="flex items-center space-x-1.5">
                                                            <Button variant="outline" size="sm" onClick={() => setCurrentPageIngresos(p => Math.max(p - 1, 1))} disabled={currentPageIngresos === 1} className="h-8 rounded-lg border-border/60 text-xs">
                                                                <ChevronLeft className="h-3.5 w-3.5 mr-1 text-slate-400" /> Anterior
                                                            </Button>
                                                            <Button variant="outline" size="sm" onClick={() => setCurrentPageIngresos(p => Math.min(p + 1, totalPagesIngresos))} disabled={currentPageIngresos === totalPagesIngresos} className="h-8 rounded-lg border-border/60 text-xs">
                                                                Siguiente <ChevronRight className="h-3.5 w-3.5 ml-1 text-slate-400" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </TabsContent>
                                <TabsContent value="egresos" className="mt-0">
                                    {isLoading ? (
                                        <div className="flex justify-center items-center h-28"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                                    ) : (
                                        <>
                                            {/* Vista Escritorio: Tabla */}
                                            <div className="hidden sm:block overflow-x-auto">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                                            <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSortEgresos('fecha')}>
                                                                <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">Fecha <SortIconEgresos field="fecha" /></div>
                                                            </TableHead>
                                                            <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSortEgresos('local')}>
                                                                <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">Local <SortIconEgresos field="local" /></div>
                                                            </TableHead>
                                                            <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSortEgresos('concepto')}>
                                                                <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">Concepto <SortIconEgresos field="concepto" /></div>
                                                            </TableHead>
                                                            <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSortEgresos('aQuien')}>
                                                                <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">A quién se entrega <SortIconEgresos field="aQuien" /></div>
                                                            </TableHead>
                                                            <TableHead className="py-1 px-3 text-xs select-none hover:bg-muted/50 transition-colors group">
                                                                <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">Com. Servicio</div>
                                                            </TableHead>
                                                            <TableHead className="py-1 px-3 text-xs select-none hover:bg-muted/50 transition-colors group">
                                                                <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">Com. Producto</div>
                                                            </TableHead>
                                                            <TableHead className="py-1 px-3 text-xs select-none hover:bg-muted/50 transition-colors group">
                                                                <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">Propina</div>
                                                            </TableHead>
                                                            <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSortEgresos('comentarios')}>
                                                                <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">Comentarios <SortIconEgresos field="comentarios" /></div>
                                                            </TableHead>
                                                            <TableHead className="py-1 px-3 text-xs cursor-pointer select-none hover:bg-muted/50 transition-colors group text-right" onClick={() => requestSortEgresos('monto')}>
                                                                <div className="flex items-center justify-end gap-1 font-semibold text-foreground/70 group-hover:text-foreground">Total <SortIconEgresos field="monto" /></div>
                                                            </TableHead>
                                                            <TableHead className="py-1 px-3 text-xs text-right">Opciones</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {paginatedEgresos.length === 0 ? (
                                                            <TableRow className="h-16"><TableCell colSpan={10} className="text-center text-xs text-muted-foreground">No hay egresos para el período seleccionado.</TableCell></TableRow>
                                                        ) : paginatedEgresos.map((egreso) => {
                                                            let comS = egreso.comisionServicios || 0;
                                                            let comP = egreso.comisionProductos || 0;
                                                            let prop = egreso.propina || 0;
                                                            let commentClean = egreso.comentarios || '';

                                                            if (!comS && !comP && !prop && commentClean) {
                                                                const matchS = commentClean.match(/Comisión Servicios: \$([0-9.,]+)/);
                                                                const matchP = commentClean.match(/Comisión Productos: \$([0-9.,]+)/);
                                                                const matchT = commentClean.match(/Propina: \$([0-9.,]+)/);
                                                                const parseAmt = (val: string) => {
                                                                    let c = val.replace(/[^0-9.,]/g, '');
                                                                    if (c.match(/,\d{1,2}$/)) c = c.replace(/(.*),(.*)/, '$1.$2');
                                                                    return parseFloat(c.replace(/,/g, '')) || 0;
                                                                };
                                                                if (matchS) comS = parseAmt(matchS[1]);
                                                                if (matchP) comP = parseAmt(matchP[1]);
                                                                if (matchT) prop = parseAmt(matchT[1]);

                                                                if (matchS || matchP || matchT) {
                                                                    commentClean = 'Auto Pago (Sistema)';
                                                                }
                                                            }

                                                            return (
                                                                <TableRow key={egreso.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                                                    <TableCell className="py-1.5 px-3 text-xs">{egreso.fecha instanceof Timestamp ? format(egreso.fecha.toDate(), 'dd/MM/yyyy HH:mm') : format(egreso.fecha, 'dd/MM/yyyy HH:mm')}</TableCell>
                                                                    <TableCell className="py-1.5 px-3 text-xs">{localMap.get(egreso.local_id ?? '')}</TableCell>
                                                                    <TableCell className="py-1.5 px-3 text-xs font-semibold text-foreground">{egreso.concepto}</TableCell>
                                                                    <TableCell className="py-1.5 px-3 text-xs">{egreso.aQuienNombre || egreso.aQuien}</TableCell>
                                                                    <TableCell className="py-1.5 px-3 text-xs font-medium text-muted-foreground">{comS > 0 ? `$${comS.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '-'}</TableCell>
                                                                    <TableCell className="py-1.5 px-3 text-xs font-medium text-muted-foreground">{comP > 0 ? `$${comP.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '-'}</TableCell>
                                                                    <TableCell className="py-1.5 px-3 text-xs font-medium text-muted-foreground">{prop > 0 ? `$${prop.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '-'}</TableCell>
                                                                    <TableCell className="py-1.5 px-3 text-xs text-muted-foreground">{commentClean || '-'}</TableCell>
                                                                    <TableCell className="py-1.5 px-3 text-xs text-right font-extrabold text-destructive">-${egreso.monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                                    <TableCell className="py-1.5 px-3 text-xs text-right">
                                                                        <DropdownMenu>
                                                                            <DropdownMenuTrigger asChild>
                                                                                <button
                                                                                    type="button"
                                                                                    className="text-slate-400 hover:text-white transition-colors p-1"
                                                                                    title="Acciones"
                                                                                >
                                                                                    <ChevronDown className="h-4 w-4" />
                                                                                </button>
                                                                            </DropdownMenuTrigger>
                                                                            <DropdownMenuContent align="end" className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1.5">
                                                                                <DropdownMenuItem onSelect={() => setTimeout(() => handleOpenEditEgreso(egreso), 150)} className="rounded-lg cursor-pointer">
                                                                                    <Pencil className="mr-2 h-4 w-4 text-slate-300" /> Editar
                                                                                </DropdownMenuItem>

                                                                                <DropdownMenuItem onSelect={() => setTimeout(() => handleOpenDeleteEgresoModal(egreso), 150)} className="rounded-lg cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
                                                                                    <Trash2 className="mr-2 h-4 w-4 text-red-400" /> Eliminar
                                                                                </DropdownMenuItem>
                                                                            </DropdownMenuContent>
                                                                        </DropdownMenu>
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })}
                                                    </TableBody>
                                                </Table>
                                            </div>

                                            {/* Vista Móvil: Tarjetas compactas */}
                                            <div className="sm:hidden divide-y divide-border/60">
                                                {paginatedEgresos.length === 0 ? (
                                                    <div className="text-center py-10 text-xs text-muted-foreground">
                                                        No hay egresos para el período seleccionado.
                                                    </div>
                                                ) : (
                                                    paginatedEgresos.map((egreso) => {
                                                        let comS = egreso.comisionServicios || 0;
                                                        let comP = egreso.comisionProductos || 0;
                                                        let prop = egreso.propina || 0;
                                                        let commentClean = egreso.comentarios || '';

                                                        if (!comS && !comP && !prop && commentClean) {
                                                            const matchS = commentClean.match(/Comisión Servicios: \$([0-9.,]+)/);
                                                            const matchP = commentClean.match(/Comisión Productos: \$([0-9.,]+)/);
                                                            const matchT = commentClean.match(/Propina: \$([0-9.,]+)/);
                                                            const parseAmt = (val: string) => {
                                                                let c = val.replace(/[^0-9.,]/g, '');
                                                                if (c.match(/,\d{1,2}$/)) c = c.replace(/(.*),(.*)/, '$1.$2');
                                                                return parseFloat(c.replace(/,/g, '')) || 0;
                                                            };
                                                            if (matchS) comS = parseAmt(matchS[1]);
                                                            if (matchP) comP = parseAmt(matchP[1]);
                                                            if (matchT) prop = parseAmt(matchT[1]);

                                                            if (matchS || matchP || matchT) {
                                                                commentClean = 'Auto Pago (Sistema)';
                                                            }
                                                        }

                                                        const dateStr = egreso.fecha instanceof Timestamp
                                                            ? format(egreso.fecha.toDate(), 'dd/MM/yyyy HH:mm')
                                                            : format(egreso.fecha, 'dd/MM/yyyy HH:mm');

                                                        return (
                                                            <div key={egreso.id} className="p-3.5 space-y-2 bg-card/40 hover:bg-muted/20 transition-colors">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="min-w-0 pr-2">
                                                                        <p className="font-bold text-sm text-foreground truncate">{egreso.concepto}</p>
                                                                        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                                                                            <span>{dateStr}</span>
                                                                            <span>•</span>
                                                                            <span className="truncate">{localMap.get(egreso.local_id ?? '') || 'Local'}</span>
                                                                        </p>
                                                                    </div>
                                                                    <div className="text-right shrink-0">
                                                                        <p className="text-sm font-extrabold text-destructive">
                                                                            -${egreso.monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                        </p>
                                                                        <p className="text-[11px] text-muted-foreground truncate max-w-[120px]">
                                                                            {egreso.aQuienNombre || egreso.aQuien}
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                {(comS > 0 || comP > 0 || prop > 0) && (
                                                                    <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] bg-muted/20 p-2 rounded-lg">
                                                                        <div>
                                                                            <span className="text-muted-foreground block">Servicios</span>
                                                                            <span className="font-semibold text-foreground">${comS.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-muted-foreground block">Productos</span>
                                                                            <span className="font-semibold text-foreground">${comP.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-muted-foreground block">Propina</span>
                                                                            <span className="font-semibold text-foreground">${prop.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {commentClean && (
                                                                    <p className="text-xs text-muted-foreground bg-muted/20 px-2.5 py-1.5 rounded-lg">
                                                                        {commentClean}
                                                                    </p>
                                                                )}

                                                                <div className="flex items-center justify-end gap-1.5 pt-1">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => setTimeout(() => handleOpenEditEgreso(egreso), 150)}
                                                                        className="h-7 px-2.5 text-xs text-slate-400 hover:text-white rounded-lg"
                                                                    >
                                                                        <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => setTimeout(() => handleOpenDeleteEgresoModal(egreso), 150)}
                                                                        className="h-7 px-2.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>

                                            {/* Paginación */}
                                            {paginatedEgresos.length > 0 && (
                                                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-border/60">
                                                    <div className="flex items-center space-x-2">
                                                        <p className="text-xs text-muted-foreground">Resultados por página</p>
                                                        <Select
                                                            value={`${itemsPerPageEgresos}`}
                                                            onValueChange={(value) => {
                                                                setItemsPerPageEgresos(Number(value))
                                                                setCurrentPageEgresos(1)
                                                            }}
                                                        >
                                                            <SelectTrigger className="h-8 w-[70px] rounded-lg text-xs border-border/60"><SelectValue placeholder={itemsPerPageEgresos} /></SelectTrigger>
                                                            <SelectContent className="border-2 border-blue-500 rounded-xl bg-[#151b2e] text-white">
                                                                <SelectItem value="10">10</SelectItem>
                                                                <SelectItem value="20">20</SelectItem>
                                                                <SelectItem value="50">50</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-xs text-muted-foreground font-medium">Página {currentPageEgresos} de {totalPagesEgresos || 1}</div>
                                                        <div className="flex items-center space-x-1.5">
                                                            <Button variant="outline" size="sm" onClick={() => setCurrentPageEgresos(p => Math.max(p - 1, 1))} disabled={currentPageEgresos === 1} className="h-8 rounded-lg border-border/60 text-xs">
                                                                <ChevronLeft className="h-3.5 w-3.5 mr-1 text-slate-400" /> Anterior
                                                            </Button>
                                                            <Button variant="outline" size="sm" onClick={() => setCurrentPageEgresos(p => Math.min(p + 1, totalPagesEgresos))} disabled={currentPageEgresos === totalPagesEgresos} className="h-8 rounded-lg border-border/60 text-xs">
                                                                Siguiente <ChevronRight className="h-3.5 w-3.5 ml-1 text-slate-400" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </TabsContent>
                            </Tabs>
                        </Card>
                </div >
            </div >

            <AddEgresoModal
                isOpen={isEgresoModalOpen}
                onOpenChange={(open) => {
                    setIsEgresoModalOpen(open);
                    if (!open) {
                        setTimeout(() => setEditingEgreso(null), 300);
                    }
                }}
                onFormSubmit={() => {
                    setIsEgresoModalOpen(false)
                    setTimeout(() => setEditingEgreso(null), 300);
                    setTimeout(() => handleSearch(), 500);
                }}
                egreso={editingEgreso}
            />
            <AddIngresoModal
                isOpen={isIngresoModalOpen}
                onOpenChange={(open) => {
                    setIsIngresoModalOpen(open);
                    if (!open) {
                        setTimeout(() => setEditingIngreso(null), 300);
                    }
                }}
                onFormSubmit={() => {
                    setIsIngresoModalOpen(false)
                    setTimeout(() => setEditingIngreso(null), 300);
                    setTimeout(() => handleSearch(), 500);
                }}
                ingreso={editingIngreso}
                localId={selectedLocalId}
            />
            <CashBoxClosingModal
                isOpen={isClosingModalOpen}
                onOpenChange={setIsClosingModalOpen}
                onFormSubmit={() => {
                    setIsClosingModalOpen(false);
                    handleSearch();
                }}
                initialCash={liveCashInBox}
                localId={selectedLocalId}
            />
            <CommissionPaymentModal
                isOpen={isCommissionModalOpen}
                onOpenChange={setIsCommissionModalOpen}
                onFormSubmit={() => {
                    setIsCommissionModalOpen(false);
                    handleSearch();
                }}
                dateRange={activeFilters.dateRange}
                localId={activeFilters.localId}
            />
            {
                selectedSale && (
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
                    <AlertDialog open={!!saleToDelete} onOpenChange={(open) => {
                        if (!open) {
                            setSaleToDelete(null);
                            setDeleteConfirmationText('');
                        }
                    }}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center"><AlertTriangle className="h-6 w-6 mr-2 text-destructive" />¿Estás absolutamente seguro?</AlertDialogTitle>
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
                                <AlertDialogCancel disabled={isDeletingSale} onClick={() => { setSaleToDelete(null); setDeleteConfirmationText(''); }}>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleDeleteSale}
                                    disabled={deleteConfirmationText !== 'ELIMINAR' || isDeletingSale}
                                    className="bg-destructive hover:bg-destructive/90 font-bold"
                                >
                                    {isDeletingSale ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Eliminando...
                                        </>
                                    ) : (
                                        'Sí, eliminar venta'
                                    )}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )
            }

            {
                egresoToDelete && (
                    <AlertDialog open={!!egresoToDelete} onOpenChange={(open) => {
                        if (!open) {
                            setEgresoToDelete(null);
                            setEgresoDeleteConfirmationText('');
                        }
                    }}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center"><AlertTriangle className="h-6 w-6 mr-2 text-destructive" />¿Estás seguro?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción no se puede deshacer. Se eliminará permanentemente el egreso seleccionado.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="space-y-2 py-2">
                                <Label htmlFor="egreso-delete-confirm">Para confirmar, escribe <strong>ELIMINAR</strong></Label>
                                <Input
                                    id="egreso-delete-confirm"
                                    value={egresoDeleteConfirmationText}
                                    onChange={(e) => setEgresoDeleteConfirmationText(e.target.value)}
                                    placeholder="ELIMINAR"
                                />
                            </div>
                            <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => { setEgresoToDelete(null); setEgresoDeleteConfirmationText(''); }}>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleDeleteEgreso}
                                    disabled={egresoDeleteConfirmationText !== 'ELIMINAR'}
                                    className="bg-destructive hover:bg-destructive/90"
                                >
                                    Sí, eliminar
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )
            }

            {
                ingresoToDelete && (
                    <AlertDialog open={!!ingresoToDelete} onOpenChange={(open) => {
                        if (!open) {
                            setIngresoToDelete(null);
                            setIngresoDeleteConfirmationText('');
                        }
                    }}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center"><AlertTriangle className="h-6 w-6 mr-2 text-destructive" />¿Estás seguro?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Se eliminará permanentemente el ingreso por "<strong>{ingresoToDelete.concepto}</strong>".
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="space-y-2 py-2">
                                <Label htmlFor="ingreso-delete-confirm">Para confirmar, escribe <strong>ELIMINAR</strong></Label>
                                <Input
                                    id="ingreso-delete-confirm"
                                    value={ingresoDeleteConfirmationText}
                                    onChange={(e) => setIngresoDeleteConfirmationText(e.target.value)}
                                    placeholder="ELIMINAR"
                                />
                            </div>
                            <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => { setIngresoToDelete(null); setIngresoDeleteConfirmationText(''); }}>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleDeleteIngreso}
                                    disabled={ingresoDeleteConfirmationText !== 'ELIMINAR'}
                                    className="bg-destructive hover:bg-destructive/90"
                                >
                                    Sí, eliminar
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )
            }

            <AlertDialog open={isDownloadModalOpen} onOpenChange={setIsDownloadModalOpen}>
                <AlertDialogContent className="p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 sm:max-w-md">
                    <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-5 border-b border-slate-800 text-white">
                        <div className="header-light-beam" />
                        <div className="relative z-10 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <KeyRound className="h-5 w-5 text-slate-300" />
                                <div>
                                    <h3 className="text-base font-semibold text-white tracking-tight">Requiere Autorización</h3>
                                    <p className="text-xs text-slate-300">Permisos de descarga requeridos</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setIsDownloadModalOpen(false); setAuthCode(''); }}
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    <div className="p-6 space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Para descargar este archivo, es necesario un código de autorización con permisos de descarga.
                        </p>
                        <div className="space-y-2">
                            <Label htmlFor="auth-code">Código de Autorización</Label>
                            <Input
                                id="auth-code"
                                type="password"
                                placeholder="Ingrese el código"
                                value={authCode}
                                onChange={e => setAuthCode(e.target.value)}
                                className="border-border/60 focus:border-blue-500 rounded-xl"
                            />
                        </div>
                    </div>
                    <div className="p-4 bg-muted/20 border-t border-border/40 flex justify-end gap-2">
                        <Button variant="outline" onClick={() => { setIsDownloadModalOpen(false); setAuthCode(''); }} className="rounded-xl">
                            Cancelar
                        </Button>
                        <Button variant="alfa" onClick={handleDownloadRequest} className="px-5">
                            Aceptar
                        </Button>
                    </div>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={isAuthModalOpen} onOpenChange={(open) => {
                setIsAuthModalOpen(open);
                if (!open) {
                    setAuthCode('');
                    setAuthAction(null);
                }
            }}>
                <AlertDialogContent className="p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 sm:max-w-md">
                    <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-5 border-b border-slate-800 text-white">
                        <div className="header-light-beam" />
                        <div className="relative z-10 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <KeyRound className="h-5 w-5 text-slate-300" />
                                <div>
                                    <h3 className="text-base font-semibold text-white tracking-tight">Requiere Autorización</h3>
                                    <p className="text-xs text-slate-300">Permisos de caja requeridos</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setAuthCode(''); setAuthAction(null); setIsAuthModalOpen(false); }}
                                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    <div className="p-6 space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Para realizar esta acción, es necesario un código con permisos de caja.
                        </p>
                        <div className="space-y-2">
                            <Label htmlFor="auth-code-action">Código de Autorización</Label>
                            <Input
                                id="auth-code-action"
                                type="password"
                                placeholder="Ingrese el código"
                                value={authCode}
                                onChange={e => setAuthCode(e.target.value)}
                                className="border-border/60 focus:border-blue-500 rounded-xl"
                            />
                        </div>
                    </div>
                    <div className="p-4 bg-muted/20 border-t border-border/40 flex justify-end gap-2">
                        <Button variant="outline" onClick={() => { setAuthCode(''); setAuthAction(null); setIsAuthModalOpen(false); }} className="rounded-xl">
                            Cancelar
                        </Button>
                        <Button variant="alfa" onClick={handleAuthCodeSubmit} className="px-5">
                            Aceptar
                        </Button>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
