

'use client';

import { useState, useMemo, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { startOfDay, endOfDay } from 'date-fns';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Search, Download, Briefcase, ShoppingBag, DollarSign, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import { where, Timestamp } from "firebase/firestore";
import type { Local, Profesional, Service, Product, Sale, SaleItem } from "@/lib/types";

interface CommissionRowData {
    professionalId: string;
    professionalName: string;
    itemName: string;
    itemType: 'servicio' | 'producto';
    saleAmount: number;
    commissionAmount: number;
    commissionPercentage: number;
}

export default function CommissionsPage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [localFilter, setLocalFilter] = useState('todos');
    const [professionalFilter, setProfessionalFilter] = useState('todos');
    const [commissionData, setCommissionData] = useState<CommissionRowData[]>([]);
    
    const [isLoading, setIsLoading] = useState(true);
    
    const [activeFilters, setActiveFilters] = useState<{
        dateRange: DateRange | undefined;
        local: string;
        professional: string;
    }>({
        dateRange: undefined,
        local: 'todos',
        professional: 'todos'
    });

    const [queryKey, setQueryKey] = useState(0);

    const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales', queryKey);
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', queryKey);
    const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios', queryKey);
    const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos', queryKey);
    
    useEffect(() => {
        const today = new Date();
        const initialDateRange = { from: startOfDay(today), to: endOfDay(today) };
        setDateRange(initialDateRange);
        setActiveFilters({
            dateRange: initialDateRange,
            local: 'todos',
            professional: 'todos'
        });
    }, []);

    const salesQueryConstraints = useMemo(() => {
        if (!activeFilters.dateRange?.from) return undefined;
        
        const constraints = [];
        constraints.push(where('fecha_hora_venta', '>=', startOfDay(activeFilters.dateRange.from)));
        if (activeFilters.dateRange.to) {
            constraints.push(where('fecha_hora_venta', '<=', endOfDay(activeFilters.dateRange.to)));
        }
        return constraints;
    }, [activeFilters.dateRange]);
    
    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>(
        'ventas',
        salesQueryConstraints ? `sales-${JSON.stringify(activeFilters)}` : undefined,
        ...(salesQueryConstraints || [])
    );
    
     useEffect(() => {
        const anyLoading = salesLoading || professionalsLoading || servicesLoading || productsLoading;
        setIsLoading(anyLoading);
        
        if (anyLoading || !sales || !professionals || !services || !products) {
             setCommissionData([]);
             return;
        }

        const professionalMap = new Map(professionals.map(p => [p.id, p]));
        const serviceMap = new Map(services.map(s => [s.id, s]));
        const productMap = new Map(products.map(p => [p.id, p]));

        let filteredSales = sales;
        if (activeFilters.local !== 'todos') {
            filteredSales = filteredSales.filter(s => s.local_id === activeFilters.local);
        }
        
        const commissionRows: CommissionRowData[] = [];

        filteredSales.forEach(sale => {
            sale.items?.forEach(item => {
                // If professional filter is active, only process items from that professional
                if (activeFilters.professional !== 'todos' && item.barbero_id !== activeFilters.professional) {
                    return; // Skip this item if it doesn't match the professional filter
                }

                const professional = professionalMap.get(item.barbero_id);
                if (!professional) return;
                
                const itemPrice = item.subtotal || item.precio || 0;
                let commissionConfig = null;
                let itemName = item.nombre;

                if(item.tipo === 'servicio') {
                    const service = serviceMap.get(item.id);
                    if (!service) return;
                    itemName = service.name;
                    commissionConfig = professional?.comisionesPorServicio?.[service.id] || service.defaultCommission || professional.defaultCommission;

                } else if (item.tipo === 'producto') {
                    const product = productMap.get(item.id);
                    if (!product) return;
                    itemName = product.nombre;
                    // Corrected Logic: Professional's specific commission -> Product's default -> Professional's default
                    commissionConfig = professional?.comisionesPorProducto?.[product.id] || product.commission || professional.defaultCommission;
                }
                
                if (commissionConfig) {
                    const commissionAmount = commissionConfig.type === '%'
                        ? itemPrice * (commissionConfig.value / 100)
                        : commissionConfig.value;

                    commissionRows.push({
                        professionalId: professional.id,
                        professionalName: professional.name,
                        itemName: itemName,
                        itemType: item.tipo,
                        saleAmount: itemPrice,
                        commissionAmount: commissionAmount,
                        commissionPercentage: commissionConfig.type === '%' ? commissionConfig.value : (itemPrice > 0 ? (commissionAmount / itemPrice) * 100 : 0)
                    });
                }
            });
        });
        
        setCommissionData(commissionRows);

    }, [sales, professionals, services, products, salesLoading, professionalsLoading, servicesLoading, productsLoading, activeFilters]);

    const handleSearch = () => {
        setActiveFilters({
            dateRange,
            local: localFilter,
            professional: professionalFilter
        });
    }

    const summary = useMemo(() => {
        return commissionData.reduce((acc, current) => {
            acc.totalSales += current.saleAmount;
            acc.totalCommission += current.commissionAmount;
            if (current.itemType === 'servicio') {
                acc.serviceSales += current.saleAmount;
                acc.serviceCommission += current.commissionAmount;
            } else {
                acc.productSales += current.saleAmount;
                acc.productCommission += current.commissionAmount;
            }
            return acc;
        }, { totalSales: 0, totalCommission: 0, serviceSales: 0, serviceCommission: 0, productSales: 0, productCommission: 0 });
    }, [commissionData]);

    const overallAvgCommission = summary.totalSales > 0 ? (summary.totalCommission / summary.totalSales) * 100 : 0;

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">Reporte de Comisiones</h2>
        </div>
        
        <Card>
            <CardHeader>
                <CardTitle>Filtros</CardTitle>
                <CardDescription>Selecciona los filtros para generar el reporte de comisiones.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Periodo de tiempo</label>
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
                                        <span>Seleccionar rango</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={es} />
                            </PopoverContent>
                        </Popover>
                    </div>
                    <div className="space-y-2">
                         <label className="text-sm font-medium">Locales</label>
                        <Select value={localFilter} onValueChange={setLocalFilter} disabled={localesLoading}>
                            <SelectTrigger>
                                <SelectValue placeholder={localesLoading ? "Cargando..." : "Todos"} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos</SelectItem>
                                {locales.map(local => (
                                    <SelectItem key={local.id} value={local.id}>{local.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Profesionales</label>
                        <Select value={professionalFilter} onValueChange={setProfessionalFilter} disabled={professionalsLoading}>
                            <SelectTrigger>
                                <SelectValue placeholder={professionalsLoading ? "Cargando..." : "Todos"} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos</SelectItem>
                                {professionals.map(prof => (
                                    <SelectItem key={prof.id} value={prof.id}>{prof.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button className="w-full lg:w-auto" onClick={handleSearch} disabled={isLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />} Buscar
                    </Button>
                </div>
            </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Ventas de servicios</CardTitle>
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">${summary.serviceSales.toLocaleString('es-CL')}</div>
                    <p className="text-xs text-muted-foreground">Comisión: ${summary.serviceCommission.toLocaleString('es-CL')}</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Ventas de productos</CardTitle>
                    <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">${summary.productSales.toLocaleString('es-CL')}</div>
                    <p className="text-xs text-muted-foreground">Comisión: ${summary.productCommission.toLocaleString('es-CL')}</p>
                </CardContent>
            </Card>
        </div>

        <Card>
             <CardHeader className="flex-row items-center justify-between">
                <div>
                    <CardTitle>Comisiones por Profesional</CardTitle>
                    <CardDescription>Detalle de las comisiones generadas en el período seleccionado.</CardDescription>
                </div>
                <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Exportar</Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Profesional / Staff</TableHead>
                            <TableHead>Concepto</TableHead>
                            <TableHead className="text-right">Venta total</TableHead>
                            <TableHead className="text-right">% de comisión</TableHead>
                            <TableHead className="text-right">Monto comisión</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={5} className="text-center h-24"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                        ) : commissionData.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center h-24">No hay datos para el período seleccionado.</TableCell></TableRow>
                        ) : commissionData.map((row, index) => (
                            <TableRow key={index}>
                                <TableCell className="font-medium">{row.professionalName}</TableCell>
                                <TableCell>{row.itemName}</TableCell>
                                <TableCell className="text-right">${row.saleAmount.toLocaleString('es-CL')}</TableCell>
                                <TableCell className="text-right">{row.commissionPercentage.toFixed(2)}%</TableCell>
                                <TableCell className="text-right text-primary font-semibold">${row.commissionAmount.toLocaleString('es-CL')}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter>
                        <TableRow className="bg-muted/50">
                            <TableHead colSpan={2} className="text-right font-bold">Totales</TableHead>
                            <TableHead className="text-right font-bold">${summary.totalSales.toLocaleString('es-CL')}</TableHead>
                            <TableHead className="text-right font-bold">{overallAvgCommission.toFixed(2)}%</TableHead>
                            <TableHead className="text-right font-bold text-primary">${summary.totalCommission.toLocaleString('es-CL')}</TableHead>
                        </TableRow>
                    </TableFooter>
                </Table>
            </CardContent>
        </Card>
    </div>
  );
}

