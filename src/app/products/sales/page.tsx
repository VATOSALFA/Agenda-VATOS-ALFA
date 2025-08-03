
'use client';

import { useState, useMemo, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { format, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar as CalendarIcon, Download, TrendingUp, TrendingDown, Package, DollarSign, Eye, Loader2, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Sale, Product, Profesional, ProductPresentation, SaleItem } from "@/lib/types";
import { where, Timestamp } from "firebase/firestore";

interface AggregatedProductSale {
    id: string;
    nombre: string;
    presentation: string;
    unitsSold: number;
    revenue: number;
    sellers: { [key: string]: number };
}

interface AggregatedSellerSale {
    sellerId: string;
    sellerName: string;
    unitsSold: number;
    revenue: number;
    userType: string;
}


export default function ProductSalesPage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [productStatusFilter, setProductStatusFilter] = useState('active');
    const [productFilter, setProductFilter] = useState('todos');

    const [activeFilters, setActiveFilters] = useState({
        dateRange,
        productStatus: 'active',
        product: 'todos'
    });
    
    const [queryKey, setQueryKey] = useState(0);

    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>(
      'ventas',
      `sales-${queryKey}`,
      ...(activeFilters.dateRange?.from ? [where('fecha_hora_venta', '>=', Timestamp.fromDate(startOfDay(activeFilters.dateRange.from)))] : []),
      ...(activeFilters.dateRange?.to ? [where('fecha_hora_venta', '<=', Timestamp.fromDate(endOfDay(activeFilters.dateRange.to)))] : [])
    );
    const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
    const { data: presentations, loading: presentationsLoading } = useFirestoreQuery<ProductPresentation>('formatos_productos');
    
    const isLoading = salesLoading || productsLoading || professionalsLoading || presentationsLoading;

    const filteredProductItems = useMemo(() => {
        if (isLoading) return [];
        
        const activeProductIds = new Set(products.filter(p => activeFilters.productStatus === 'todos' || p.active === (activeFilters.productStatus === 'active')).map(p => p.id));
        
        const allItems: (SaleItem & { saleId: string })[] = [];
        sales.forEach(sale => {
            sale.items?.forEach(item => {
                if (item.tipo === 'producto' && activeProductIds.has(item.id)) {
                    if (activeFilters.product === 'todos' || item.id === activeFilters.product) {
                        allItems.push({ ...item, saleId: sale.id });
                    }
                }
            });
        });
        return allItems;
    }, [sales, products, activeFilters, isLoading]);
    
    const salesSummary = useMemo(() => {
        if (filteredProductItems.length === 0) {
            return {
                aggregatedData: [],
                totalRevenue: 0,
                totalUnitsSold: 0,
                highestRevenueProduct: null,
                lowestRevenueProduct: null
            };
        }

        const productMap = new Map(products.map(p => [p.id, p]));
        const presentationMap = new Map(presentations.map(p => [p.id, p.name]));
        const professionalMap = new Map(professionals.map(p => [p.id, p.name]));

        const aggregated: Record<string, AggregatedProductSale> = {};

        let totalRevenue = 0;

        filteredProductItems.forEach(item => {
            const product = productMap.get(item.id);
            if (!product) return;
            
            const itemRevenue = item.subtotal || ((item.precio || 0) * item.cantidad) || 0;
            if (!aggregated[item.id]) {
                aggregated[item.id] = {
                    id: item.id,
                    nombre: product.nombre,
                    presentation: presentationMap.get(product.presentation_id) || 'N/A',
                    unitsSold: 0,
                    revenue: 0,
                    sellers: {}
                };
            }
            
            totalRevenue += itemRevenue;

            aggregated[item.id].unitsSold += item.cantidad;
            aggregated[item.id].revenue += itemRevenue;

            if (item.barbero_id) {
                const sellerName = professionalMap.get(item.barbero_id) || 'Desconocido';
                aggregated[item.id].sellers[sellerName] = (aggregated[item.id].sellers[sellerName] || 0) + itemRevenue;
            }
        });

        const aggregatedData = Object.values(aggregated).sort((a,b) => b.revenue - a.revenue);
        const totalUnitsSold = aggregatedData.reduce((acc, item) => acc + item.unitsSold, 0);
        
        let highestRevenueProduct = null;
        let lowestRevenueProduct = null;
        
        if(aggregatedData.length > 0) {
            const getTopSeller = (sellers: { [key: string]: number; }) => Object.keys(sellers).length > 0 ? Object.keys(sellers).reduce((a, b) => sellers[a] > sellers[b] ? a : b, '') : 'N/A';
            
            const highest = aggregatedData[0];
            highestRevenueProduct = { name: highest.nombre, seller: getTopSeller(highest.sellers), amount: highest.revenue };
            
            const lowest = aggregatedData[aggregatedData.length - 1];
            lowestRevenueProduct = { name: lowest.nombre, seller: getTopSeller(lowest.sellers), amount: lowest.revenue };
        }

        return { aggregatedData, totalRevenue, totalUnitsSold, highestRevenueProduct, lowestRevenueProduct };
    }, [filteredProductItems, products, presentations, professionals]);
    
    const sellerSummary = useMemo(() => {
        if (isLoading || filteredProductItems.length === 0) {
            return [];
        }

        const professionalMap = new Map(professionals.map(p => [p.id, p.name]));
        const aggregated: Record<string, AggregatedSellerSale> = {};

        filteredProductItems.forEach(item => {
            if (!item.barbero_id) return;

            if (!aggregated[item.barbero_id]) {
                aggregated[item.barbero_id] = {
                    sellerId: item.barbero_id,
                    sellerName: professionalMap.get(item.barbero_id) || 'Desconocido',
                    unitsSold: 0,
                    revenue: 0,
                    userType: 'Profesional' // Asumiendo que todos son profesionales por ahora
                };
            }
            
            const itemRevenue = item.subtotal || (item.precio * item.cantidad) || 0;
            
            aggregated[item.barbero_id].unitsSold += item.cantidad;
            aggregated[item.barbero_id].revenue += itemRevenue;
        });

        return Object.values(aggregated).sort((a,b) => b.revenue - a.revenue);
    }, [filteredProductItems, professionals, isLoading]);

    const handleSearch = () => {
        setActiveFilters({
            dateRange,
            productStatus: productStatusFilter,
            product: productFilter
        })
        setQueryKey(prev => prev + 1);
    }
    
    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <h2 className="text-3xl font-bold tracking-tight">Venta de Productos</h2>
            
            <Card>
                <CardHeader>
                    <CardTitle>Filtros</CardTitle>
                    <CardDescription>Filtra las ventas por diferentes criterios.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                     <Popover>
                        <PopoverTrigger asChild>
                            <Button id="date" variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (
                                    dateRange.to ? (
                                        <>{format(dateRange.from, "LLL dd, y", {locale: es})} - {format(dateRange.to, "LLL dd, y", {locale: es})}</>
                                    ) : (
                                        format(dateRange.from, "LLL dd, y", {locale: es})
                                    )
                                ) : (
                                    <span>Periodo de tiempo</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} />
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
                    <Select value={productFilter} onValueChange={setProductFilter} disabled={productsLoading}>
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
                        <CardTitle className="text-sm font-medium">RECAUDACIÓN TOTAL</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${salesSummary.totalRevenue.toLocaleString('es-CL')}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">UNIDADES VENDIDAS</CardTitle>
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
                    <div className="flex items-center gap-2"><Button variant="outline"><Download className="mr-2 h-4 w-4" /> Descargar reporte</Button></div>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="por-productos">
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
                                    ) : salesSummary.aggregatedData.map((sale) => (
                                        <TableRow key={sale.id}>
                                            <TableCell className="font-medium">{sale.nombre}</TableCell>
                                            <TableCell>{sale.presentation}</TableCell>
                                            <TableCell className="text-right">{sale.unitsSold}</TableCell>
                                            <TableCell className="text-right font-semibold text-primary">${sale.revenue.toLocaleString('es-CL')}</TableCell>
                                            <TableCell className="text-right"><Button variant="outline" size="sm"><Eye className="mr-2 h-4 w-4" />Ver detalles</Button></TableCell>
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
                                    ) : sellerSummary.map((seller) => (
                                        <TableRow key={seller.sellerId}>
                                            <TableCell className="font-medium">{seller.sellerName}</TableCell>
                                            <TableCell>{seller.userType}</TableCell>
                                            <TableCell className="text-right">{seller.unitsSold}</TableCell>
                                            <TableCell className="text-right font-semibold text-primary">${seller.revenue.toLocaleString('es-CL')}</TableCell>
                                            <TableCell className="text-right"><Button variant="outline" size="sm"><Eye className="mr-2 h-4 w-4" />Ver detalles</Button></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

        </div>
    );
}
