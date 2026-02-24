

'use client';

import { useState, useMemo, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { format, startOfDay, endOfDay, parseISO, subDays } from "date-fns";
import { es } from "date-fns/locale";
import * as XLSX from 'xlsx';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar as CalendarIcon, Download, TrendingUp, TrendingDown, Package, DollarSign, Eye, Loader2, Search, User, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Sale, Product, Profesional, ProductPresentation, SaleItem, Client, AuthCode, User as AppUser, Role } from "@/lib/types";
import { where, Timestamp, collection, query, getDocs } from "firebase/firestore";
import { SellerSaleDetailModal } from "@/components/products/sales/seller-sale-detail-modal";
import { ProductSaleDetailModal } from "@/components/products/sales/product-sale-detail-modal";
import { useToast } from "@/hooks/use-toast";
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
import { db } from "@/lib/firebase-client";
import { useAuth } from "@/contexts/firebase-auth-context";
import { useProductSalesData } from './use-product-sales-data';
import type { AggregatedProductSale, AggregatedSellerSale } from "@/lib/types";
import { logAuditAction } from '@/lib/audit-logger';





export default function ProductSalesPage() {
    const { user } = useAuth();
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [productStatusFilter, setProductStatusFilter] = useState('active');
    const [productFilter, setProductFilter] = useState('todos');
    const [isSellerDetailModalOpen, setIsSellerDetailModalOpen] = useState(false);
    const [isProductDetailModalOpen, setIsProductDetailModalOpen] = useState(false);
    const [selectedSellerSummary, setSelectedSellerSummary] = useState<AggregatedSellerSale | null>(null);
    const [selectedProductSummary, setSelectedProductSummary] = useState<AggregatedProductSale | null>(null);
    const [activeTab, setActiveTab] = useState('por-productos');
    const { toast } = useToast();
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
        })
        setQueryKey(prev => prev + 1);
    }

    const handleViewSellerDetails = (summary: AggregatedSellerSale) => {
        setSelectedSellerSummary(summary);
        setIsSellerDetailModalOpen(true);
    }

    const handleViewProductDetails = (summary: AggregatedProductSale) => {
        setSelectedProductSummary(summary);
        setIsProductDetailModalOpen(true);
    }

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
    const userRole = roles.find(r => r.title === user?.role);
    const historyLimit = userRole?.historyRestrictionDays;

    return (
        <>
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <h2 className="text-3xl font-bold tracking-tight">Venta de productos</h2>

                <Card>
                    <CardHeader>
                        <CardTitle>Filtros</CardTitle>
                        <CardDescription>Filtra las ventas por diferentes criterios.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
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

                                    disabled={historyLimit !== undefined && historyLimit !== null ? (date) => date > new Date() || date < subDays(new Date(), historyLimit) : undefined}
                                />
                            </PopoverContent>
                        </Popover>
                        <Select value={productStatusFilter} onValueChange={setProductStatusFilter}>
                            <SelectTrigger><SelectValue placeholder="Estado del producto" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos los estados</SelectItem>
                                <SelectItem value="active">Activo</SelectItem>
                                <SelectItem value="inactive">Inactivo</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={productFilter} onValueChange={setProductFilter} disabled={isLoading}>
                            <SelectTrigger><SelectValue placeholder="Productos" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos los productos</SelectItem>
                                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Button onClick={handleSearch} disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                            Buscar
                        </Button>
                    </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Recaudación total</CardTitle>
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">${salesSummary.totalRevenue.toLocaleString('es-CL')}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Unidades vendidas</CardTitle>
                            <Package className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{salesSummary.totalUnitsSold}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Mayor ingreso</CardTitle>
                            <TrendingUp className="h-4 w-4 text-green-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-lg font-bold truncate">{salesSummary.highestRevenueProduct?.name || '-'}</div>
                            <p className="text-xs text-muted-foreground">Vendedor: {salesSummary.highestRevenueProduct?.seller || '-'}</p>
                            <p className="text-sm font-semibold text-primary">${(salesSummary.highestRevenueProduct?.amount || 0).toLocaleString('es-CL')}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Menor ingreso</CardTitle>
                            <TrendingDown className="h-4 w-4 text-red-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-lg font-bold truncate">{salesSummary.lowestRevenueProduct?.name || '-'}</div>
                            <p className="text-xs text-muted-foreground">Vendedor: {salesSummary.lowestRevenueProduct?.seller || '-'}</p>
                            <p className="text-sm font-semibold text-primary">${(salesSummary.lowestRevenueProduct?.amount || 0).toLocaleString('es-CL')}</p>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="flex-row items-center justify-between">
                        <div><CardTitle>Detalle de la venta</CardTitle></div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={() => setIsDownloadModalOpen(true)}>
                                <Download className="mr-2 h-4 w-4" /> Descargar reporte
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="por-productos" onValueChange={setActiveTab}>
                            <TabsList className="mb-4">
                                <TabsTrigger value="por-productos">Por productos</TabsTrigger>
                                <TabsTrigger value="por-vendedor">Por vendedor</TabsTrigger>
                            </TabsList>
                            <TabsContent value="por-productos">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Producto</TableHead>
                                            <TableHead>Formato/Presentación</TableHead>
                                            <TableHead className="text-right">Unidades vendidas</TableHead>
                                            <TableHead className="text-right">Recaudación</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow><TableCell colSpan={5} className="text-center h-24"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                                        ) : salesSummary.aggregatedData.length === 0 ? (
                                            <TableRow><TableCell colSpan={5} className="text-center h-24">No hay ventas de productos para los filtros seleccionados.</TableCell></TableRow>
                                        ) : paginatedProducts.map((sale) => (
                                            <TableRow key={sale.id}>
                                                <TableCell className="font-medium">{sale.nombre}</TableCell>
                                                <TableCell>{sale.presentation}</TableCell>
                                                <TableCell className="text-right">{sale.unitsSold}</TableCell>
                                                <TableCell className="text-right font-semibold text-primary">${sale.revenue.toLocaleString('es-CL')}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="outline" size="sm" onClick={() => handleViewProductDetails(sale)}>
                                                        <Eye className="mr-2 h-4 w-4" />Ver detalles
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TabsContent>
                            <TabsContent value="por-vendedor">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Vendedor</TableHead>
                                            <TableHead>Tipo de usuario</TableHead>
                                            <TableHead className="text-right">Unidades vendidas</TableHead>
                                            <TableHead className="text-right">Recaudación</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow><TableCell colSpan={5} className="text-center h-24"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                                        ) : sellerSummary.length === 0 ? (
                                            <TableRow><TableCell colSpan={5} className="text-center h-24">No hay ventas para los filtros seleccionados.</TableCell></TableRow>
                                        ) : paginatedSellers.map((seller) => (
                                            <TableRow key={seller.sellerId}>
                                                <TableCell className="font-medium">{seller.sellerName}</TableCell>
                                                <TableCell>{seller.userType}</TableCell>
                                                <TableCell className="text-right">{seller.unitsSold}</TableCell>
                                                <TableCell className="text-right font-semibold text-primary">${seller.revenue.toLocaleString('es-CL')}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="outline" size="sm" onClick={() => handleViewSellerDetails(seller)}>
                                                        <Eye className="mr-2 h-4 w-4" />Ver detalles
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TabsContent>
                        </Tabs>

                        {!isLoading && (activeTab === 'por-productos' ? salesSummary.aggregatedData.length > 0 : sellerSummary.length > 0) && (
                            <div className="flex flex-col sm:flex-row items-center justify-end gap-4 sm:gap-6 pt-4 border-t mt-4">
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
                                    Página {currentPage} de {activeTab === 'por-productos' ? totalPagesProducts : totalPagesSellers}
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
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, activeTab === 'por-productos' ? totalPagesProducts : totalPagesSellers))}
                                        disabled={currentPage === (activeTab === 'por-productos' ? totalPagesProducts : totalPagesSellers)}
                                    >
                                        Siguiente <ChevronRight className="h-4 w-4 ml-1" />
                                    </Button>
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
        </>
    );
}



