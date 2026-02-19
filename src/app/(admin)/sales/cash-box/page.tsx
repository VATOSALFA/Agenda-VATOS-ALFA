
'use client';

import { useState, useMemo, useEffect } from 'react';
import type { DateRange } from 'react-day-picker';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
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
    ArrowDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Sale, Local, Client, Egreso, Profesional, User, IngresoManual, CashClosing, Role } from '@/lib/types';
import { where, Timestamp, QueryConstraint, doc, deleteDoc, getDocs, collection, query, getDoc, orderBy, limit, writeBatch, increment } from 'firebase/firestore';
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
import { useCashBoxData } from './use-cash-box-data';
import { useLiveCash } from './use-live-cash';
import { useLocal } from '@/contexts/local-context';


const SummaryCard = ({
    title,
    amount,
    className
}: {
    title: string;
    amount: number;
    className?: string;
}) => (
    <Card className={cn("flex flex-col justify-center", className)}>
        <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold text-primary">
                ${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
        </CardContent>
    </Card>
);

const IconSeparator = ({ icon: Icon }: { icon: React.ElementType }) => (
    <div className="flex items-center justify-center">
        <Icon className="h-6 w-6 text-muted-foreground" />
    </div>
);


export default function CashBoxPage() {
    const { user } = useAuth();
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);

    const handleDateSelect = (range: DateRange | undefined) => {
        setDateRange(range);
        if (range?.from && range?.to) {
            setIsPopoverOpen(false);
        }
    };

    const [selectedLocalId, setSelectedLocalId] = useState<string>('todos');
    const [activeFilters, setActiveFilters] = useState<{
        dateRange: DateRange | undefined;
        localId: string;
    }>({
        dateRange: undefined,
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
    const [authAction, setAuthAction] = useState<(() => void) | null>(null);
    const [currentPageSales, setCurrentPageSales] = useState(1);
    const [itemsPerPageSales, setItemsPerPageSales] = useState(10);
    const [currentPageEgresos, setCurrentPageEgresos] = useState(1);
    const [itemsPerPageEgresos, setItemsPerPageEgresos] = useState(10);
    const [currentPageIngresos, setCurrentPageIngresos] = useState(1);
    const [itemsPerPageIngresos, setItemsPerPageIngresos] = useState(10);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

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
        setActiveFilters({ dateRange, localId: selectedLocalId });
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

            // Eliminar Venta
            batch.delete(saleRef);

            await batch.commit();

            toast({
                title: "Venta Eliminada",
                description: "La venta ha sido eliminada y el stock revertido.",
            });
            setQueryKey(prevKey => prevKey + 1);
        } catch (error) {
            console.error("Error deleting sale: ", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "No se pudo eliminar la venta completemente.",
            });
        } finally {
            setSaleToDelete(null);
            setDeleteConfirmationText('');
        }
    };

    const handleOpenEditEgreso = (egreso: Egreso) => {
        const action = () => {
            setEditingEgreso(egreso);
            setIsEgresoModalOpen(true);
        };
        setAuthAction(() => action);
        setTimeout(() => setIsAuthModalOpen(true), 0);
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
                            if (changes.unpayTip) updateData.tipPaid = false;

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
                        // Use heuristic: if professional is in the sale items item.barbero_id, assume they were part of the tip payout
                        if (sale.tipPaid) {
                            const isProfessionalInvolved = sale.items?.some(i => i.barbero_id === professionalId);
                            if (isProfessionalInvolved) {
                                updateData.tipPaid = false;
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
        setAuthAction(() => action);
        setTimeout(() => setIsAuthModalOpen(true), 0);
    }

    const handleOpenEditIngreso = (ingreso: IngresoManual) => {
        const action = () => {
            setEditingIngreso(ingreso);
            setIsIngresoModalOpen(true);
        };
        setAuthAction(() => action);
        setTimeout(() => setIsAuthModalOpen(true), 0);
    };

    const handleOpenDeleteIngresoModal = (ingreso: IngresoManual) => {
        const action = () => setIngresoToDelete(ingreso);
        setAuthAction(() => action);
        setTimeout(() => setIsAuthModalOpen(true), 0);
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
            authAction?.(); // Execute the stored action
            setIsAuthModalOpen(false);
        }
        setAuthCode('');
        setAuthAction(null);
    };


    const handleOpenDeleteSaleModal = (sale: Sale) => {
        const action = () => setSaleToDelete(sale);
        if (user?.role === 'Administrador general' || user?.role === 'Administrador local') {
            action();
        } else {
            setAuthAction(() => action);
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

    const totalPagesEgresos = Math.ceil(egresosWithData.length / itemsPerPageEgresos);
    const paginatedEgresos = egresosWithData.slice(
        (currentPageEgresos - 1) * itemsPerPageEgresos,
        currentPageEgresos * itemsPerPageEgresos
    );

    const totalPagesIngresos = Math.ceil(ingresos.length / itemsPerPageIngresos);
    const paginatedIngresos = ingresos.slice(
        (currentPageIngresos - 1) * itemsPerPageIngresos,
        currentPageIngresos * itemsPerPageIngresos
    );

    const { data: roles } = useFirestoreQuery<Role>('roles');
    const userRole = roles.find(r => r.title === user?.role);
    const historyLimit = userRole?.historyRestrictionDays;

    return (
        <>
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
                    <h2 className="text-3xl font-bold tracking-tight">Caja</h2>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => setIsCommissionModalOpen(true)}><Percent className="mr-2 h-4 w-4" />Pago de Comisiones</Button>
                        <Button variant="outline" onClick={() => setIsClosingModalOpen(true)}><LogOut className="mr-2 h-4 w-4" />Realizar corte de caja</Button>
                        <Button variant="outline" onClick={() => { setEditingIngreso(null); setIsIngresoModalOpen(true); }}>Agregar Ingreso</Button>
                        <Button variant="outline" onClick={() => { setEditingEgreso(null); setIsEgresoModalOpen(true); }}>Agregar Egreso</Button>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-stretch">
                        <Card className="h-full">
                            <CardContent className="pt-6 flex flex-wrap items-end gap-4 h-full">
                                <div className="space-y-2 flex-grow min-w-[200px]">
                                    <label className="text-sm font-medium">Periodo de tiempo</label>
                                    <Popover open={isPopoverOpen} onOpenChange={(open) => {
                                        setIsPopoverOpen(open);
                                        if (open) setDateRange(undefined);
                                    }}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                id="date"
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
                                                    <span>Seleccionar rango</span>
                                                )}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
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
                                <div className="space-y-2 flex-grow min-w-[200px]">
                                    <label className="text-sm font-medium">Local</label>
                                    <Select value={selectedLocalId} onValueChange={setSelectedLocalId} disabled={isLocalAdmin || localesLoading}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={localesLoading ? "Cargando..." : "Seleccionar local"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {!isLocalAdmin && <SelectItem value="todos">Todos los locales</SelectItem>}
                                            {locales.map(local => (
                                                <SelectItem key={local.id} value={local.id}>
                                                    {local.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button className="w-full sm:w-auto" onClick={handleSearch} disabled={isLoading}>
                                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="mr-2 h-4 w-4" />}
                                    Buscar
                                </Button>
                            </CardContent>
                        </Card>

                        <Card className="flex-shrink-0 w-full md:w-auto h-full">
                            <CardContent className="p-4 flex flex-col items-center justify-center h-full text-center">
                                <p className="text-sm text-muted-foreground">Efectivo en caja</p>
                                {selectedLocalId === 'todos' ? (
                                    <p className="text-lg font-semibold text-muted-foreground">Seleccione sucursal</p>
                                ) : liveCashLoading ? (
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                ) : (
                                    <p className="text-3xl font-extrabold text-primary">${liveCashInBox.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="flex justify-between items-center">
                        <Button variant="ghost" size="sm" onClick={() => setIsDownloadModalOpen(true)}>
                            <Download className="mr-2 h-4 w-4" />
                            Descargar reporte
                        </Button>
                    </div>

                    {/* Detailed Summary */}
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] gap-4 items-center">
                        <SummaryCard title="Ventas Facturadas" amount={totalVentasFacturadas} />
                        <IconSeparator icon={Plus} />
                        <SummaryCard title="Otros Ingresos" amount={ingresosManuales} />
                        <IconSeparator icon={Minus} />
                        <SummaryCard title="Egresos" amount={totalEgresos} />
                        <IconSeparator icon={Equal} />
                        <SummaryCard title="Resultado de Flujo del Periodo" amount={totalVentasFacturadas + ingresosManuales - totalEgresos} />
                    </div>

                    {/* Main Table */}
                    <Card>
                        <CardContent className="pt-6">
                            <Tabs defaultValue="ventas-facturadas">
                                <TabsList className="w-full h-auto flex flex-wrap justify-start bg-muted p-1">
                                    <TabsTrigger value="ventas-facturadas" className="flex-grow sm:flex-grow-0">Flujo de Ventas Facturadas</TabsTrigger>
                                    <TabsTrigger value="otros-ingresos" className="flex-grow sm:flex-grow-0">Otros Ingresos</TabsTrigger>
                                    <TabsTrigger value="egresos" className="flex-grow sm:flex-grow-0">Egresos</TabsTrigger>
                                </TabsList>
                                <TabsContent value="ventas-facturadas" className="mt-4">
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('id')}>
                                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                            ID
                                                            <SortIcon field="id" />
                                                        </div>
                                                    </TableHead>
                                                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('fecha_hora_venta')}>
                                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                            Fecha De Pago
                                                            <SortIcon field="fecha_hora_venta" />
                                                        </div>
                                                    </TableHead>
                                                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('local')}>
                                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                            Local
                                                            <SortIcon field="local" />
                                                        </div>
                                                    </TableHead>
                                                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('client')}>
                                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                            Cliente
                                                            <SortIcon field="client" />
                                                        </div>
                                                    </TableHead>
                                                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('professional')}>
                                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                            Profesional
                                                            <SortIcon field="professional" />
                                                        </div>
                                                    </TableHead>
                                                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group" onClick={() => requestSort('items')}>
                                                        <div className="flex items-center gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                            Detalle
                                                            <SortIcon field="items" />
                                                        </div>
                                                    </TableHead>
                                                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group text-right" onClick={() => requestSort('total')}>
                                                        <div className="flex items-center justify-end gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                            Monto Facturado
                                                            <SortIcon field="total" />
                                                        </div>
                                                    </TableHead>
                                                    <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors group text-right" onClick={() => requestSort('total')}>
                                                        <div className="flex items-center justify-end gap-1 font-semibold text-foreground/70 group-hover:text-foreground">
                                                            Flujo Del Periodo
                                                            <SortIcon field="total" />
                                                        </div>
                                                    </TableHead>
                                                    <TableHead className="text-right">Opciones</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {isLoading ? (
                                                    Array.from({ length: 3 }).map((_, i) => (
                                                        <TableRow key={i}>
                                                            <TableCell colSpan={9}><div className="h-8 w-full bg-muted animate-pulse rounded-md" /></TableCell>
                                                        </TableRow>
                                                    ))
                                                ) : paginatedSales.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={9} className="text-center h-24">No hay ventas para el período seleccionado.</TableCell>
                                                    </TableRow>
                                                ) : (
                                                    paginatedSales.map((sale) => (
                                                        <TableRow key={sale.id} onClick={() => setSelectedSale(sale)} className={cn("cursor-pointer", selectedSale?.id === sale.id && "bg-muted")}>
                                                            <TableCell className="font-mono text-xs">{sale.id.slice(0, 8)}...</TableCell>
                                                            <TableCell>{sale.fecha_hora_venta ? format(sale.fecha_hora_venta.toDate(), 'dd-MM-yyyy HH:mm') : 'N/A'}</TableCell>
                                                            <TableCell>{localMap.get(sale.local_id ?? '') || sale.local_id}</TableCell>
                                                            <TableCell>{sale.client?.nombre} {sale.client?.apellido}</TableCell>
                                                            <TableCell>{Array.from(new Set(sale.items?.map(i => professionalMap.get(i.barbero_id) || 'N/A').filter(Boolean))).join(', ')}</TableCell>
                                                            <TableCell>{sale.items?.map(i => i.nombre).join(', ')}</TableCell>
                                                            <TableCell className="text-right font-medium">${((sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total) ? sale.monto_pagado_real : sale.total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                            <TableCell className="text-right font-medium text-primary">${((sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total) ? sale.monto_pagado_real : sale.total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
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
                                                                            <DropdownMenuItem onSelect={() => toast({ title: "Funcionalidad no implementada" })}>
                                                                                <Mail className="mr-2 h-4 w-4 text-primary" />
                                                                                <span className="text-primary">Enviar Comprobante</span>
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem onSelect={() => window.print()}>
                                                                                <Printer className="mr-2 h-4 w-4 text-secondary" />
                                                                                <span className="text-secondary">Imprimir</span>
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem onSelect={() => handleOpenDeleteSaleModal(sale)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                                                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
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
                                    {paginatedSales.length > 0 && (
                                        <div className="flex flex-col sm:flex-row items-center justify-end gap-4 sm:gap-6 pt-4">
                                            <div className="flex items-center space-x-2">
                                                <p className="text-sm font-medium">Resultados por página</p>
                                                <Select
                                                    value={`${itemsPerPageSales}`}
                                                    onValueChange={(value) => {
                                                        setItemsPerPageSales(Number(value))
                                                        setCurrentPageSales(1)
                                                    }}
                                                >
                                                    <SelectTrigger className="h-8 w-[70px]"><SelectValue placeholder={itemsPerPageSales} /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="10">10</SelectItem>
                                                        <SelectItem value="20">20</SelectItem>
                                                        <SelectItem value="50">50</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="text-sm font-medium">Página {currentPageSales} de {totalPagesSales}</div>
                                            <div className="flex items-center space-x-2">
                                                <Button variant="outline" size="sm" onClick={() => setCurrentPageSales(p => Math.max(p - 1, 1))} disabled={currentPageSales === 1}><ChevronLeft className="h-4 w-4 mr-1" /> Anterior</Button>
                                                <Button variant="outline" size="sm" onClick={() => setCurrentPageSales(p => Math.min(p + 1, totalPagesSales))} disabled={currentPageSales === totalPagesSales}>Siguiente <ChevronRight className="h-4 w-4 ml-1" /></Button>
                                            </div>
                                        </div>
                                    )}
                                </TabsContent>
                                <TabsContent value="otros-ingresos" className="mt-4">
                                    {isLoading ? (
                                        <div className="flex justify-center items-center h-24"><Loader2 className="h-6 w-6 animate-spin" /></div>
                                    ) : (
                                        <>
                                            <div className="overflow-x-auto">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Fecha</TableHead>
                                                            <TableHead>Concepto</TableHead>
                                                            <TableHead>Comentarios</TableHead>
                                                            <TableHead className="text-right">Monto</TableHead>
                                                            <TableHead className="text-right">Opciones</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {paginatedIngresos.length === 0 ? (
                                                            <TableRow><TableCell colSpan={5} className="text-center h-24">No hay otros ingresos para el período seleccionado.</TableCell></TableRow>
                                                        ) : paginatedIngresos.map((ingreso) => (
                                                            <TableRow key={ingreso.id}>
                                                                <TableCell>{format(ingreso.fecha.toDate(), 'dd-MM-yyyy')}</TableCell>
                                                                <TableCell>{ingreso.concepto}</TableCell>
                                                                <TableCell>{ingreso.comentarios}</TableCell>
                                                                <TableCell className="text-right font-medium">${ingreso.monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                                <TableCell className="text-right">
                                                                    <DropdownMenu>
                                                                        <DropdownMenuTrigger asChild>
                                                                            <Button variant="outline" size="sm">
                                                                                Acciones <ChevronDown className="ml-2 h-4 w-4" />
                                                                            </Button>
                                                                        </DropdownMenuTrigger>
                                                                        <DropdownMenuContent>
                                                                            <DropdownMenuItem onSelect={() => handleOpenEditIngreso(ingreso)}>
                                                                                <Pencil className="mr-2 h-4 w-4" /> Editar
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem onSelect={() => handleOpenDeleteIngresoModal(ingreso)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                                                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                                                            </DropdownMenuItem>
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                            {paginatedIngresos.length > 0 && (
                                                <div className="flex flex-col sm:flex-row items-center justify-end gap-4 sm:gap-6 pt-4">
                                                    <div className="flex items-center space-x-2">
                                                        <p className="text-sm font-medium">Resultados por página</p>
                                                        <Select
                                                            value={`${itemsPerPageIngresos}`}
                                                            onValueChange={(value) => {
                                                                setItemsPerPageIngresos(Number(value))
                                                                setCurrentPageIngresos(1)
                                                            }}
                                                        >
                                                            <SelectTrigger className="h-8 w-[70px]"><SelectValue placeholder={itemsPerPageIngresos} /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="10">10</SelectItem>
                                                                <SelectItem value="20">20</SelectItem>
                                                                <SelectItem value="50">50</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="text-sm font-medium">Página {currentPageIngresos} de {totalPagesIngresos}</div>
                                                    <div className="flex items-center space-x-2">
                                                        <Button variant="outline" size="sm" onClick={() => setCurrentPageIngresos(p => Math.max(p - 1, 1))} disabled={currentPageIngresos === 1}><ChevronLeft className="h-4 w-4 mr-1" /> Anterior</Button>
                                                        <Button variant="outline" size="sm" onClick={() => setCurrentPageIngresos(p => Math.min(p + 1, totalPagesIngresos))} disabled={currentPageIngresos === totalPagesIngresos}>Siguiente <ChevronRight className="h-4 w-4 ml-1" /></Button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </TabsContent>
                                <TabsContent value="egresos" className="mt-4">
                                    {isLoading ? (
                                        <div className="flex justify-center items-center h-24"><Loader2 className="h-6 w-6 animate-spin" /></div>
                                    ) : (
                                        <>
                                            <div className="overflow-x-auto">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Fecha</TableHead>
                                                            <TableHead>Local</TableHead>
                                                            <TableHead>Concepto</TableHead>
                                                            <TableHead>A quién se entrega</TableHead>
                                                            <TableHead>Comentarios</TableHead>
                                                            <TableHead className="text-right">Monto</TableHead>
                                                            <TableHead className="text-right">Opciones</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {paginatedEgresos.length === 0 ? (
                                                            <TableRow><TableCell colSpan={7} className="text-center h-24">No hay egresos para el período seleccionado.</TableCell></TableRow>
                                                        ) : paginatedEgresos.map((egreso) => (
                                                            <TableRow key={egreso.id}>
                                                                <TableCell>{egreso.fecha instanceof Timestamp ? format(egreso.fecha.toDate(), 'dd-MM-yyyy') : format(egreso.fecha, 'dd-MM-yyyy')}</TableCell>
                                                                <TableCell>{localMap.get(egreso.local_id ?? '')}</TableCell>
                                                                <TableCell>{egreso.concepto}</TableCell>
                                                                <TableCell>{egreso.aQuienNombre || egreso.aQuien}</TableCell>
                                                                <TableCell>{egreso.comentarios}</TableCell>
                                                                <TableCell className="text-right font-medium">${egreso.monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                                                <TableCell className="text-right">
                                                                    <DropdownMenu>
                                                                        <DropdownMenuTrigger asChild>
                                                                            <Button variant="outline" size="sm">
                                                                                Acciones <ChevronDown className="ml-2 h-4 w-4" />
                                                                            </Button>
                                                                        </DropdownMenuTrigger>
                                                                        <DropdownMenuContent align="end">
                                                                            <DropdownMenuItem onSelect={() => handleOpenEditEgreso(egreso)}>
                                                                                <Pencil className="mr-2 h-4 w-4" /> Editar
                                                                            </DropdownMenuItem>

                                                                            <DropdownMenuItem onSelect={() => handleOpenDeleteEgresoModal(egreso)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                                                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                                                            </DropdownMenuItem>
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                            {paginatedEgresos.length > 0 && (
                                                <div className="flex flex-col sm:flex-row items-center justify-end gap-4 sm:gap-6 pt-4">
                                                    <div className="flex items-center space-x-2">
                                                        <p className="text-sm font-medium">Resultados por página</p>
                                                        <Select
                                                            value={`${itemsPerPageEgresos}`}
                                                            onValueChange={(value) => {
                                                                setItemsPerPageEgresos(Number(value))
                                                                setCurrentPageEgresos(1)
                                                            }}
                                                        >
                                                            <SelectTrigger className="h-8 w-[70px]"><SelectValue placeholder={itemsPerPageEgresos} /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="10">10</SelectItem>
                                                                <SelectItem value="20">20</SelectItem>
                                                                <SelectItem value="50">50</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="text-sm font-medium">Página {currentPageEgresos} de {totalPagesEgresos}</div>
                                                    <div className="flex items-center space-x-2">
                                                        <Button variant="outline" size="sm" onClick={() => setCurrentPageEgresos(p => Math.max(p - 1, 1))} disabled={currentPageEgresos === 1}><ChevronLeft className="h-4 w-4 mr-1" /> Anterior</Button>
                                                        <Button variant="outline" size="sm" onClick={() => setCurrentPageEgresos(p => Math.min(p + 1, totalPagesEgresos))} disabled={currentPageEgresos === totalPagesEgresos}>Siguiente <ChevronRight className="h-4 w-4 ml-1" /></Button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card >
                </div >
            </div >

            <AddEgresoModal
                isOpen={isEgresoModalOpen}
                onOpenChange={(open) => {
                    setIsEgresoModalOpen(open);
                    if (!open) setEditingEgreso(null);
                }}
                onFormSubmit={() => {
                    setIsEgresoModalOpen(false)
                    setEditingEgreso(null);
                    setTimeout(() => handleSearch(), 500);
                }}
                egreso={editingEgreso}
            />
            <AddIngresoModal
                isOpen={isIngresoModalOpen}
                onOpenChange={(open) => {
                    setIsIngresoModalOpen(open);
                    if (!open) setEditingIngreso(null);
                }}
                onFormSubmit={() => {
                    setIsIngresoModalOpen(false)
                    setEditingIngreso(null);
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

            <AlertDialog open={isAuthModalOpen} onOpenChange={(open) => {
                setIsAuthModalOpen(open);
                if (!open) {
                    setAuthCode('');
                    setAuthAction(null);
                }
            }}>
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
                        <AlertDialogCancel onClick={() => { setAuthCode(''); setAuthAction(null); setIsAuthModalOpen(false); }}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleAuthCodeSubmit}>Aceptar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
