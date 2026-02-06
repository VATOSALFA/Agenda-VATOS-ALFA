'use client';

import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import { format, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRight, Calendar as CalendarIcon, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Timestamp, where } from "firebase/firestore";
import type { StockMovement, Product, ProductCategory } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { useAuth } from "@/contexts/firebase-auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function StockMovementPage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState('todos');
    const [categoryFilter, setCategoryFilter] = useState('todos');
    const [productFilter, setProductFilter] = useState('todos');
    const [queryKey, setQueryKey] = useState(0);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!authLoading && user) {
            const hasPermission = user.role === 'Administrador general' || user.permissions?.includes('ver_movimiento_stock');
            if (!hasPermission) {
                router.push('/dashboard'); // Or some fallback
            }
        }
    }, [user, authLoading, router]);

    if (authLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="w-8 h-8 animate-spin" /></div>;

    // Queries
    const { data: movements, loading: movementsLoading } = useFirestoreQuery<StockMovement>(
        'movimientos_inventario',
        `movements-${queryKey}`,
        ...(dateRange?.from ? [where('date', '>=', Timestamp.fromDate(startOfDay(dateRange.from)))] : []),
        ...(dateRange?.to ? [where('date', '<=', Timestamp.fromDate(endOfDay(dateRange.to)))] : [])
    );
    const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');
    const { data: categories, loading: categoriesLoading } = useFirestoreQuery<ProductCategory>('categorias_productos');

    const loading = movementsLoading || productsLoading || categoriesLoading;

    // Filter Logic
    const filteredMovements = useMemo(() => {
        if (!movements || !products) return [];

        let filtered = [...movements];

        // Create lookups
        const productMap = new Map(products.map(p => [p.id, p]));

        // 1. Filter by Product Status
        if (statusFilter !== 'todos') {
            const isActive = statusFilter === 'active';
            filtered = filtered.filter(m => {
                const prod = productMap.get(m.product_id);
                // If product not found (deleted?), we can't filter by status effectively, maybe keep or exclude
                // Defaulting to exclude if we are strict, or keep if lax. 
                // Let's exclude if product info is missing when filtering by property of product.
                return prod ? prod.active === isActive : false;
            });
        }

        // 2. Filter by Category
        if (categoryFilter !== 'todos') {
            filtered = filtered.filter(m => {
                const prod = productMap.get(m.product_id);
                return prod ? prod.category_id === categoryFilter : false;
            });
        }

        // 3. Filter by Product
        if (productFilter !== 'todos') {
            filtered = filtered.filter(m => m.product_id === productFilter);
        }

        // Sort by date desc
        return filtered.sort((a, b) => {
            const dateA = a.date instanceof Timestamp ? a.date.toMillis() : new Date(a.date).getTime();
            const dateB = b.date instanceof Timestamp ? b.date.toMillis() : new Date(b.date).getTime();
            return dateB - dateA;
        });
    }, [movements, products, statusFilter, categoryFilter, productFilter]);

    // Pagination Logic
    useEffect(() => {
        setCurrentPage(1);
    }, [dateRange, statusFilter, categoryFilter, productFilter, queryKey]);

    const totalPages = Math.ceil(filteredMovements.length / itemsPerPage);
    const paginatedMovements = filteredMovements.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );


    const handleSearch = () => {
        setQueryKey(prev => prev + 1);
    }

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Movimientos de stock</h2>
                    <p className="text-muted-foreground">
                        Historial de cambios y ajustes en el inventario.
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Filtros</CardTitle>
                    <CardDescription>Filtra por fecha, estado, categoría o producto específico.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                    {/* Date Range */}
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
                            />
                        </PopoverContent>
                    </Popover>

                    {/* Status Filter */}
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger><SelectValue placeholder="Estado del producto" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="todos">Todos los estados</SelectItem>
                            <SelectItem value="active">Activo</SelectItem>
                            <SelectItem value="inactive">Inactivo</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Category Filter */}
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                        <SelectTrigger><SelectValue placeholder="Categoría" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="todos">Todas las categorías</SelectItem>
                            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>

                    {/* Product Filter */}
                    <Select value={productFilter} onValueChange={setProductFilter}>
                        <SelectTrigger><SelectValue placeholder="Producto" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="todos">Todos los productos</SelectItem>
                            {products.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                        </SelectContent>
                    </Select>

                    <Button onClick={handleSearch} disabled={loading}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                        Buscar
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Historial de movimientos</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>FECHA</TableHead>
                                <TableHead>LOCAL</TableHead>
                                <TableHead>PRODUCTO</TableHead>
                                <TableHead>AJUSTE</TableHead>
                                <TableHead>CONCEPTO</TableHead>
                                <TableHead>STAFF</TableHead>
                                <TableHead>COMENTARIOS</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-10">
                                        <div className="flex justify-center items-center">
                                            <Loader2 className="h-6 w-6 animate-spin mr-2" />
                                            Cargando movimientos...
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filteredMovements.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                                        No hay movimientos registrados con estos filtros.
                                    </TableCell>
                                </TableRow>
                            ) : paginatedMovements.map((movement) => {
                                const date = movement.date instanceof Timestamp ? movement.date.toDate() : new Date(movement.date);
                                const diff = (movement.to || 0) - (movement.from || 0);
                                const isPositive = diff > 0;

                                return (
                                    <TableRow key={movement.id}>
                                        <TableCell className="font-medium whitespace-nowrap">
                                            {format(date, "dd/MM/yyyy HH:mm", { locale: es })}
                                        </TableCell>
                                        <TableCell>{movement.local_name || movement.local_id}</TableCell>
                                        <TableCell>{movement.product_name || 'Producto desconocido'}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <span className="text-muted-foreground">{movement.from}</span>
                                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                                <span className="font-semibold">{movement.to}</span>
                                                <Badge variant={isPositive ? "default" : "destructive"} className="ml-1 h-5 px-1.5 min-w-[30px] justify-center">
                                                    {isPositive ? '+' : ''}{diff}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="font-normal">
                                                {movement.concepto || movement.cause || 'N/A'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm">{movement.staff_name || 'Sistema'}</TableCell>
                                        <TableCell className="max-w-[200px] truncate" title={movement.comment}>
                                            {movement.comment || '-'}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Pagination Controls */}
            {filteredMovements.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-end gap-4 sm:gap-6 p-4">
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
    );
}