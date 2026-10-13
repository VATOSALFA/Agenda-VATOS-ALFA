'use client';

import { useState, useMemo, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import { es } from "date-fns/locale";
import * as XLSX from 'xlsx';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
    Calendar as CalendarIcon, 
    Download, 
    TrendingUp, 
    TrendingDown, 
    Package, 
    DollarSign, 
    Eye, 
    Loader2, 
    Search, 
    ChevronLeft, 
    ChevronRight,
    Filter,
    KeyRound,
    X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Role } from "@/lib/types";
import { where, collection, query, getDocs } from "firebase/firestore";
import { SellerSaleDetailModal } from "@/components/products/sales/seller-sale-detail-modal";
import { ProductSaleDetailModal } from "@/components/products/sales/product-sale-detail-modal";
import { useToast } from "@/hooks/use-toast";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/firebase-client";
import { useAuth } from "@/contexts/firebase-auth-context";
import { useProductSalesData } from './use-product-sales-data';
import type { AggregatedProductSale, AggregatedSellerSale } from "@/lib/types";
import { logAuditAction } from '@/lib/audit-logger';

export default function ProductSalesPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfDay(new Date()),
        to: endOfDay(new Date())
    });
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [productStatusFilter, setProductStatusFilter] = useState('active');
    const [productFilter, setProductFilter] = useState('todos');
    const [isSellerDetailModalOpen, setIsSellerDetailModalOpen] = useState(false);
    const [isProductDetailModalOpen, setIsProductDetailModalOpen] = useState(false);
    const [selectedSellerSummary, setSelectedSellerSummary] = useState<AggregatedSellerSale | null>(null);
    const [selectedProductSummary, setSelectedProductSummary] = useState<AggregatedProductSale | null>(null);
    const [activeTab, setActiveTab] = useState('por-productos');
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const [authCode, setAuthCode] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const [activeFilters, setActiveFilters] = useState({
        dateRange,
        productStatus: 'active',
        product: 'todos'
    });

    const [queryKey, setQueryKey] = useState(0);

    const {
        salesSummary,
        sellerSummary,
        filteredProductItems,
        loading: isLoading,
        raw: { products, professionals, presentations, clients },
        formatDate
    } = useProductSalesData(activeFilters, queryKey);

    useEffect(() => {
        setCurrentPage(1);
    }, [activeFilters, activeTab]);

    const totalPagesProducts = Math.ceil(salesSummary.aggregatedData.length / itemsPerPage) || 1;
    const paginatedProducts = salesSummary.aggregatedData.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const totalPagesSellers = Math.ceil(sellerSummary.length / itemsPerPage) || 1;
    const paginatedSellers = sellerSummary.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handleSearch = () => {
        setActiveFilters({
            dateRange,
            productStatus: productStatusFilter,
            product: productFilter
        });
        setQueryKey(prev => prev + 1);
        setCurrentPage(1);
    };

    const handleViewSellerDetails = (summary: AggregatedSellerSale) => {
        setSelectedSellerSummary(summary);
        setIsSellerDetailModalOpen(true);
    };

    const handleViewProductDetails = (summary: AggregatedProductSale) => {
        setSelectedProductSummary(summary);
        setIsProductDetailModalOpen(true);
    };

    const triggerDownload = () => {
        if (filteredProductItems.length === 0) {
            toast({ title: "No hay datos para exportar", variant: "destructive" });
            return;
        }

        const productMap = new Map(products.map(p => [p.id, p]));
        const presentationMap = new Map(presentations.map(p => [p.id, p.name]));
        const professionalMap = new Map(professionals.map(p => [p.id, p]));
        const clientMap = new Map(clients.map(c => [c.id, `${c.nombre} ${c.apellido}`]));

        const dataForExcel = filteredProductItems.map(item => {
            const product = productMap.get(item.id);
            const presentation = product ? presentationMap.get(product.presentation_id) : 'N/A';
            const professional = item.barbero_id ? professionalMap.get(item.barbero_id) : null;
            const seller = professional?.name || 'N/A';
            const client = clientMap.get(item.cliente_id) || 'Desconocido';
            const salePrice = item.subtotal || (item.precio * item.cantidad);
            const purchaseCost = product?.purchase_cost || 0;

            let commissionAmount = 0;
            if (product && professional) {
                const commissionConfig = professional?.comisionesPorProducto?.[product.id] || product.commission || professional.defaultCommission;
                if (commissionConfig) {
                    commissionAmount = commissionConfig.type === '%'
                        ? salePrice * (commissionConfig.value / 100)
                        : commissionConfig.value;
                }
            }

            const utility = salePrice - purchaseCost - commissionAmount;

            return {
                'Producto': item.nombre,
                'Formato/Presentación': presentation,
                'Unidades Vendidas': item.cantidad,
                'Fecha de Venta': formatDate(item.fecha_hora_venta, 'dd/MM/yyyy'),
                'Vendedor': seller,
                'Cliente': client,
                'Precio de Venta': salePrice,
                'Costo de Compra': purchaseCost,
                'Comisión': commissionAmount,
                'Utilidad': utility,
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Detalle de Ventas');

        XLSX.writeFile(workbook, `Reporte_Detallado_Ventas_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

        toast({
            title: "Descarga iniciada",
            description: "Tu archivo de Excel se está descargando.",
        });
    };

    const handleDownloadClick = () => {
        if (user?.role === 'Administrador general') {
            triggerDownload();
        } else {
            setIsDownloadModalOpen(true);
        }
    };

    const handleDownloadRequest = async () => {
        if (!authCode) {
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
            await logAuditAction({
                action: 'Autorización por Código',
                details: 'Acción autorizada: Descargar reporte detallado de ventas de productos.',
                userId: user?.uid || 'unknown',
                userName: user?.displayName || user?.email || 'Unknown',
                userRole: user?.role,
                authCode: authCode,
                severity: 'info',
                localId: 'unknown'
            });
            setAuthCode('');
        }
    };

    const { data: roles } = useFirestoreQuery<Role>('roles');
    const userRole = roles?.find(r => r.title === user?.role);
    const historyLimit = userRole?.historyRestrictionDays;

    return (
        <>
            <div className="flex-1 space-y-4 p-3 sm:p-6 md:p-8 pt-4 sm:pt-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                            Venta de productos
                        </h1>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 hidden sm:block">
                            Reporte y métricas de rendimiento en venta de productos por artículo y vendedor.
                        </p>
                    </div>
                </div>

                {/* FILTROS ESCRITORIO (hidden sm:block) */}
                <Card className="hidden sm:block rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                    <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/40">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <Filter className="h-4 w-4 text-slate-400" /> Filtros de búsqueda
                        </CardTitle>
                        <CardDescription className="text-xs">Filtra las ventas por periodo, estado o producto específico.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-5">
                        <div className="flex flex-col lg:flex-row lg:items-end gap-3 sm:gap-4">
                            {/* Periodo de tiempo */}
                            <div className="flex-1 min-w-[180px] space-y-1.5">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Periodo de tiempo</label>
                                <Popover open={isCalendarOpen} onOpenChange={(open) => {
                                    setIsCalendarOpen(open);
                                    if (open) setDateRange(undefined);
                                }}>
                                    <PopoverTrigger asChild>
                                        <Button id="date" variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl h-10 border-border/60 text-xs sm:text-sm", !dateRange && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4 text-slate-400 shrink-0" />
                                            {dateRange?.from ? (
                                                dateRange.to ? (
                                                    <>{format(dateRange.from, "dd MMM, y", { locale: es })} - {format(dateRange.to, "dd MMM, y", { locale: es })}</>
                                                ) : (
                                                    format(dateRange.from, "dd MMM, y", { locale: es })
                                                )
                                            ) : (
                                                <span>Periodo de tiempo</span>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]" align="start">
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
                                            disabled={historyLimit !== undefined && historyLimit !== null ? (date) => date > new Date() || date < subDays(new Date(), historyLimit) : undefined}
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Estado del producto */}
                            <div className="flex-1 min-w-[150px] space-y-1.5">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado</label>
                                <Select value={productStatusFilter} onValueChange={setProductStatusFilter}>
                                    <SelectTrigger className="w-full rounded-xl h-10 border-border/60 text-xs sm:text-sm">
                                        <SelectValue placeholder="Estado del producto" />
                                    </SelectTrigger>
                                    <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                        <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos los estados</SelectItem>
                                        <SelectItem value="active" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Activo</SelectItem>
                                        <SelectItem value="inactive" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Inactivo</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Productos */}
                            <div className="flex-1 min-w-[180px] space-y-1.5">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Productos</label>
                                <Select value={productFilter} onValueChange={setProductFilter} disabled={isLoading}>
                                    <SelectTrigger className="w-full rounded-xl h-10 border-border/60 text-xs sm:text-sm">
                                        <SelectValue placeholder="Productos" />
                                    </SelectTrigger>
                                    <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1 max-h-64">
                                        <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos los productos</SelectItem>
                                        {products.map(p => (
                                            <SelectItem key={p.id} value={p.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">{p.nombre}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Botón Buscar Vatos Alfa (Ajustado al tamaño del texto) */}
                            <div className="shrink-0">
                                <Button 
                                    variant="alfa" 
                                    className="h-10 rounded-xl px-4 text-xs sm:text-sm font-bold text-white shadow-md w-auto" 
                                    onClick={handleSearch} 
                                    disabled={isLoading}
                                >
                                    {isLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
                                    Buscar
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* FILTROS MÓVIL COMPACTO (sm:hidden) */}
                <Card className="sm:hidden rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm">
                    <CardContent className="p-2.5 space-y-2">
                        <div className="flex items-center gap-1.5">
                            {/* Selector de Rango de Fecha */}
                            <Popover open={isCalendarOpen} onOpenChange={(open) => {
                                setIsCalendarOpen(open);
                                if (open) setDateRange(undefined);
                            }}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="flex-1 justify-start text-left font-normal rounded-xl h-9 text-xs border-border/60 px-2.5 truncate">
                                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
                                        <span className="truncate">
                                            {dateRange?.from ? (
                                                dateRange.to ? (
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

                            {/* Botón Buscar */}
                            <Button 
                                variant="alfa" 
                                size="sm" 
                                className="h-9 px-3 rounded-xl text-xs font-bold text-white shadow-sm shrink-0" 
                                onClick={handleSearch} 
                                disabled={isLoading}
                            >
                                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1" />}
                                Buscar
                            </Button>
                        </div>

                        {/* Fila 2: Estado y Productos */}
                        <div className="grid grid-cols-2 gap-1.5">
                            <Select value={productStatusFilter} onValueChange={setProductStatusFilter}>
                                <SelectTrigger className="rounded-xl h-9 text-xs border-border/60">
                                    <SelectValue placeholder="Estado" />
                                </SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                    <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos</SelectItem>
                                    <SelectItem value="active" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Activo</SelectItem>
                                    <SelectItem value="inactive" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Inactivo</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={productFilter} onValueChange={setProductFilter} disabled={isLoading}>
                                <SelectTrigger className="rounded-xl h-9 text-xs border-border/60">
                                    <SelectValue placeholder="Producto" />
                                </SelectTrigger>
                                <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1 max-h-64">
                                    <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">Todos</SelectItem>
                                    {products.map(p => (
                                        <SelectItem key={p.id} value={p.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">{p.nombre}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* TARJETAS DE MÉTRICAS ESCRITORIO (hidden sm:grid) */}
                <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Recaudación total */}
                    <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3.5 sm:p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">Recaudación total</span>
                            <DollarSign className="h-4 w-4 text-[#C5A880]" />
                        </div>
                        <div className="mt-1.5">
                            <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                                ${salesSummary.totalRevenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                Ventas de productos
                            </p>
                        </div>
                    </Card>

                    {/* Unidades vendidas */}
                    <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3.5 sm:p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">Unidades vendidas</span>
                            <Package className="h-4 w-4 text-slate-400" />
                        </div>
                        <div className="mt-1.5">
                            <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                                {salesSummary.totalUnitsSold}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                Piezas entregadas
                            </p>
                        </div>
                    </Card>

                    {/* Mayor ingreso */}
                    <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3.5 sm:p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">Mayor ingreso</span>
                            <TrendingUp className="h-4 w-4 text-blue-400" />
                        </div>
                        <div className="mt-1.5">
                            <div className="text-base sm:text-lg font-bold truncate text-foreground">
                                {salesSummary.highestRevenueProduct?.name || '-'}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">
                                Vendedor: {salesSummary.highestRevenueProduct?.seller || '-'}
                            </p>
                            <p className="text-xs font-semibold text-blue-400 mt-0.5">
                                ${(salesSummary.highestRevenueProduct?.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                    </Card>

                    {/* Menor ingreso */}
                    <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3.5 sm:p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">Menor ingreso</span>
                            <TrendingDown className="h-4 w-4 text-red-400" />
                        </div>
                        <div className="mt-1.5">
                            <div className="text-base sm:text-lg font-bold truncate text-foreground">
                                {salesSummary.lowestRevenueProduct?.name || '-'}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">
                                Vendedor: {salesSummary.lowestRevenueProduct?.seller || '-'}
                            </p>
                            <p className="text-xs font-semibold text-red-400 mt-0.5">
                                ${(salesSummary.lowestRevenueProduct?.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                    </Card>
                </div>

                {/* TARJETA MÉTRICAS MÓVIL COMPACTA (sm:hidden) */}
                <Card className="sm:hidden rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3 space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-1.5">
                                <DollarSign className="h-4 w-4 text-[#C5A880] shrink-0" />
                                <span className="text-xs font-semibold text-foreground">Recaudación total</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                {salesSummary.totalUnitsSold} {salesSummary.totalUnitsSold === 1 ? 'unidad vendida' : 'unidades vendidas'}
                            </p>
                        </div>
                        <div className="text-lg font-bold tracking-tight text-foreground shrink-0">
                            ${salesSummary.totalRevenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                    {salesSummary.highestRevenueProduct && (
                        <div className="text-[11px] text-muted-foreground bg-muted/30 px-2 py-1 rounded-lg flex items-center justify-between">
                            <span className="truncate pr-1">Top: <strong className="text-foreground">{salesSummary.highestRevenueProduct.name}</strong></span>
                            <span className="text-blue-400 font-bold shrink-0">${(salesSummary.highestRevenueProduct.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    )}
                </Card>

                {/* TABLA PRINCIPAL */}
                <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm">
                    <CardHeader className="flex-row items-center justify-between p-3.5 sm:p-5 border-b border-border/60">
                        <div>
                            <CardTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                                Detalle de la venta
                                <Badge variant="secondary" className="font-normal text-xs">
                                    {activeTab === 'por-productos' ? salesSummary.aggregatedData.length : sellerSummary.length} {activeTab === 'por-productos' ? (salesSummary.aggregatedData.length === 1 ? 'producto' : 'productos') : (sellerSummary.length === 1 ? 'vendedor' : 'vendedores')}
                                </Badge>
                            </CardTitle>
                            <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                                Desglose de ingresos por producto y profesional comisionista.
                            </CardDescription>
                        </div>
                        <button 
                            type="button"
                            className="text-slate-400 hover:text-white transition-colors p-1" 
                            onClick={handleDownloadClick}
                            title="Descargar reporte en Excel"
                        >
                            <Download className="h-4 w-4" />
                        </button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Tabs defaultValue="por-productos" onValueChange={setActiveTab} className="w-full">
                            <div className="p-3 sm:p-4 border-b border-border/40 bg-muted/10">
                                <TabsList className="h-8 bg-muted/40 p-0.5 rounded-lg border border-border/40">
                                    <TabsTrigger value="por-productos" className="h-7 text-xs rounded-md data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs">
                                        Por productos
                                    </TabsTrigger>
                                    <TabsTrigger value="por-vendedor" className="h-7 text-xs rounded-md data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs">
                                        Por vendedor
                                    </TabsTrigger>
                                </TabsList>
                            </div>

                            {/* TAB: POR PRODUCTOS */}
                            <TabsContent value="por-productos" className="mt-0">
                                {/* Vista Escritorio */}
                                <div className="hidden sm:block overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                                <TableHead className="py-1 px-3 text-xs font-semibold">Producto</TableHead>
                                                <TableHead className="py-1 px-3 text-xs font-semibold">Formato/Presentación</TableHead>
                                                <TableHead className="py-1 px-3 text-xs font-semibold text-right">Unidades vendidas</TableHead>
                                                <TableHead className="py-1 px-3 text-xs font-semibold text-right">Recaudación</TableHead>
                                                <TableHead className="py-1 px-3 text-xs text-right">Opciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isLoading ? (
                                                <TableRow className="h-16">
                                                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground">
                                                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400 mb-1" />
                                                        Cargando ventas...
                                                    </TableCell>
                                                </TableRow>
                                            ) : salesSummary.aggregatedData.length === 0 ? (
                                                <TableRow className="h-16">
                                                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground">
                                                        No hay ventas de productos para los filtros seleccionados.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                paginatedProducts.map((sale) => (
                                                    <TableRow key={sale.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                                        <TableCell className="py-1.5 px-3 text-xs font-medium text-foreground">{sale.nombre}</TableCell>
                                                        <TableCell className="py-1.5 px-3 text-xs text-muted-foreground">{sale.presentation}</TableCell>
                                                        <TableCell className="py-1.5 px-3 text-xs text-right font-mono">{sale.unitsSold}</TableCell>
                                                        <TableCell className="py-1.5 px-3 text-xs text-right font-bold text-foreground">
                                                            ${sale.revenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </TableCell>
                                                        <TableCell className="py-1.5 px-3 text-xs text-right">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleViewProductDetails(sale)}
                                                                className="text-slate-400 hover:text-white transition-colors p-1"
                                                                title="Ver detalles"
                                                            >
                                                                <Eye className="h-4 w-4" />
                                                            </button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>

                                {/* Vista Móvil */}
                                <div className="sm:hidden divide-y divide-border/60">
                                    {isLoading ? (
                                        <div className="text-center py-10 space-y-2">
                                            <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
                                            <span className="text-xs text-muted-foreground">Cargando ventas...</span>
                                        </div>
                                    ) : salesSummary.aggregatedData.length === 0 ? (
                                        <div className="text-center py-10 text-xs text-muted-foreground">
                                            No hay ventas de productos para los filtros seleccionados.
                                        </div>
                                    ) : (
                                        paginatedProducts.map((sale) => (
                                            <div key={sale.id} className="p-3 space-y-1.5 bg-card/40 hover:bg-muted/20 transition-colors">
                                                <div className="flex items-center justify-between">
                                                    <div className="min-w-0 pr-2">
                                                        <p className="font-bold text-sm text-foreground truncate">{sale.nombre}</p>
                                                        <p className="text-[11px] text-muted-foreground">{sale.presentation}</p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-sm font-extrabold text-foreground">
                                                            ${sale.revenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground font-mono">{sale.unitsSold} {sale.unitsSold === 1 ? 'unidad' : 'unidades'}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-end pt-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleViewProductDetails(sale)}
                                                        className="text-slate-400 hover:text-white transition-colors p-1 flex items-center gap-1 text-xs"
                                                    >
                                                        <Eye className="h-3.5 w-3.5" />
                                                        <span>Detalles</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </TabsContent>

                            {/* TAB: POR VENDEDOR */}
                            <TabsContent value="por-vendedor" className="mt-0">
                                {/* Vista Escritorio */}
                                <div className="hidden sm:block overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                                <TableHead className="py-1 px-3 text-xs font-semibold">Vendedor</TableHead>
                                                <TableHead className="py-1 px-3 text-xs font-semibold">Tipo de usuario</TableHead>
                                                <TableHead className="py-1 px-3 text-xs font-semibold text-right">Unidades vendidas</TableHead>
                                                <TableHead className="py-1 px-3 text-xs font-semibold text-right">Recaudación</TableHead>
                                                <TableHead className="py-1 px-3 text-xs text-right">Opciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isLoading ? (
                                                <TableRow className="h-16">
                                                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground">
                                                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400 mb-1" />
                                                        Cargando ventas...
                                                    </TableCell>
                                                </TableRow>
                                            ) : sellerSummary.length === 0 ? (
                                                <TableRow className="h-16">
                                                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground">
                                                        No hay ventas para los filtros seleccionados.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                paginatedSellers.map((seller) => (
                                                    <TableRow key={seller.sellerId} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                                        <TableCell className="py-1.5 px-3 text-xs font-medium text-foreground">{seller.sellerName}</TableCell>
                                                        <TableCell className="py-1.5 px-3 text-xs text-muted-foreground">{seller.userType}</TableCell>
                                                        <TableCell className="py-1.5 px-3 text-xs text-right font-mono">{seller.unitsSold}</TableCell>
                                                        <TableCell className="py-1.5 px-3 text-xs text-right font-bold text-foreground">
                                                            ${seller.revenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </TableCell>
                                                        <TableCell className="py-1.5 px-3 text-xs text-right">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleViewSellerDetails(seller)}
                                                                className="text-slate-400 hover:text-white transition-colors p-1"
                                                                title="Ver detalles"
                                                            >
                                                                <Eye className="h-4 w-4" />
                                                            </button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>

                                {/* Vista Móvil */}
                                <div className="sm:hidden divide-y divide-border/60">
                                    {isLoading ? (
                                        <div className="text-center py-10 space-y-2">
                                            <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
                                            <span className="text-xs text-muted-foreground">Cargando ventas...</span>
                                        </div>
                                    ) : sellerSummary.length === 0 ? (
                                        <div className="text-center py-10 text-xs text-muted-foreground">
                                            No hay ventas para los filtros seleccionados.
                                        </div>
                                    ) : (
                                        paginatedSellers.map((seller) => (
                                            <div key={seller.sellerId} className="p-3 space-y-1.5 bg-card/40 hover:bg-muted/20 transition-colors">
                                                <div className="flex items-center justify-between">
                                                    <div className="min-w-0 pr-2">
                                                        <p className="font-bold text-sm text-foreground truncate">{seller.sellerName}</p>
                                                        <p className="text-[11px] text-muted-foreground">{seller.userType}</p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-sm font-extrabold text-foreground">
                                                            ${seller.revenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground font-mono">{seller.unitsSold} {seller.unitsSold === 1 ? 'unidad' : 'unidades'}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-end pt-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleViewSellerDetails(seller)}
                                                        className="text-slate-400 hover:text-white transition-colors p-1 flex items-center gap-1 text-xs"
                                                    >
                                                        <Eye className="h-3.5 w-3.5" />
                                                        <span>Detalles</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </TabsContent>
                        </Tabs>

                        {/* PAGINACIÓN */}
                        {!isLoading && (activeTab === 'por-productos' ? salesSummary.aggregatedData.length > 0 : sellerSummary.length > 0) && (
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 sm:p-4 border-t border-border/60">
                                <div className="flex items-center space-x-2">
                                    <p className="text-xs text-muted-foreground">Resultados por página</p>
                                    <Select
                                        value={`${itemsPerPage}`}
                                        onValueChange={(value) => {
                                            setItemsPerPage(Number(value));
                                            setCurrentPage(1);
                                        }}
                                    >
                                        <SelectTrigger className="h-8 w-[70px] rounded-lg text-xs border-border/60">
                                            <SelectValue placeholder={itemsPerPage} />
                                        </SelectTrigger>
                                        <SelectContent className="border-2 border-blue-500 rounded-xl bg-[#151b2e] text-white">
                                            <SelectItem value="10">10</SelectItem>
                                            <SelectItem value="20">20</SelectItem>
                                            <SelectItem value="50">50</SelectItem>
                                            <SelectItem value="100">100</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-xs text-muted-foreground font-medium">
                                        Página {currentPage} de {activeTab === 'por-productos' ? totalPagesProducts : totalPagesSellers}
                                    </div>
                                    <div className="flex items-center space-x-1.5">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                            disabled={currentPage === 1}
                                            className="h-8 rounded-lg border-border/60 text-xs"
                                        >
                                            <ChevronLeft className="h-3.5 w-3.5 mr-1 text-slate-400" /> Anterior
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, activeTab === 'por-productos' ? totalPagesProducts : totalPagesSellers))}
                                            disabled={currentPage === (activeTab === 'por-productos' ? totalPagesProducts : totalPagesSellers)}
                                            className="h-8 rounded-lg border-border/60 text-xs"
                                        >
                                            Siguiente <ChevronRight className="h-3.5 w-3.5 ml-1 text-slate-400" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <SellerSaleDetailModal
                isOpen={isSellerDetailModalOpen}
                onOpenChange={setIsSellerDetailModalOpen}
                summary={selectedSellerSummary}
            />

            <ProductSaleDetailModal
                isOpen={isProductDetailModalOpen}
                onOpenChange={setIsProductDetailModalOpen}
                summary={selectedProductSummary}
            />

            {/* Modal Institucional de Autorización de Descarga */}
            <Dialog open={isDownloadModalOpen} onOpenChange={setIsDownloadModalOpen}>
                <DialogContent 
                    hideCloseButton={true}
                    className="sm:max-w-md p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 bg-background flex flex-col"
                >
                    <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
                        <div className="header-light-beam" aria-hidden="true" />
                        <div className="relative z-10 flex items-center justify-between w-full">
                            <div className="flex items-center gap-3">
                                <KeyRound className="h-5 w-5 text-slate-300 shrink-0" />
                                <div>
                                    <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                                        Requiere Autorización
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-slate-300 mt-0.5">
                                        Ingresa un código con permisos para descargar este reporte.
                                    </DialogDescription>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setIsDownloadModalOpen(false); setAuthCode(''); }}
                                className="p-1 text-slate-300 hover:text-white transition-colors"
                                aria-label="Cerrar modal"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    <div className="p-5 space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="auth-code" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Código de Autorización
                            </Label>
                            <Input
                                id="auth-code"
                                type="password"
                                placeholder="Ingresa el código"
                                value={authCode}
                                onChange={e => setAuthCode(e.target.value)}
                                className="rounded-xl border-border/60 text-sm"
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => { setIsDownloadModalOpen(false); setAuthCode(''); }}
                                className="rounded-xl border-border/60 text-xs"
                            >
                                Cancelar
                            </Button>
                            <Button 
                                variant="alfa" 
                                size="sm" 
                                onClick={handleDownloadRequest}
                                className="rounded-xl px-4 text-xs font-bold text-white shadow-md"
                            >
                                Autorizar y Descargar
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
