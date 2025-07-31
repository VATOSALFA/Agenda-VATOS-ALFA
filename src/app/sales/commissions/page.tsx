
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
import { where } from "firebase/firestore";
import type { Local, Profesional, Service, Product, Sale } from "@/lib/types";

interface CommissionData {
    professionalId: string;
    professionalName: string;
    totalSales: number;
    totalCommission: number;
    serviceSales: number;
    productSales: number;
    serviceCommission: number;
    productCommission: number;
}

export default function CommissionsPage() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [localFilter, setLocalFilter] = useState('todos');
    const [professionalFilter, setProfessionalFilter] = useState('todos');
    const [isLoading, setIsLoading] = useState(false);
    const [commissionData, setCommissionData] = useState<CommissionData[]>([]);
    const [isClientMounted, setIsClientMounted] = useState(false);

    const [activeFilters, setActiveFilters] = useState<{
        dateRange: DateRange | undefined;
        local: string;
        professional: string;
    }>({
        dateRange: undefined,
        local: 'todos',
        professional: 'todos',
    });
    
    useEffect(() => {
        setIsClientMounted(true);
        const today = new Date();
        const initialDateRange = { from: startOfDay(today), to: endOfDay(today) };
        setDateRange(initialDateRange);
        setActiveFilters({ dateRange: initialDateRange, local: 'todos', professional: 'todos' });
    }, []);

    const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
    const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');

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
    
    const salesQueryKey = `sales-${JSON.stringify(activeFilters.dateRange)}`;

    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>(
        'ventas',
        salesQueryKey, 
        ...(salesQueryConstraints)
    );
    
    const handleSearch = () => {
        setIsLoading(true);
        setActiveFilters({
            dateRange: dateRange,
            local: localFilter,
            professional: professionalFilter
        })
    };

    useEffect(() => {
        if (salesLoading || professionalsLoading || servicesLoading || productsLoading) {
          return;
        }

        const calculateCommissions = () => {
            if (!sales || !professionals || !services || !products) return;
            
            const professionalMap = new Map(professionals.map(p => [p.id, p]));
            const serviceMap = new Map(services.map(s => [s.id, s]));
            const productMap = new Map(products.map(p => [p.id, p]));

            let filteredSales = sales;
            if (activeFilters.local !== 'todos') {
                filteredSales = filteredSales.filter(s => s.local_id === activeFilters.local);
            }
            
            const commissionMap = new Map<string, CommissionData>();

            professionals.forEach(prof => {
                if (activeFilters.professional === 'todos' || activeFilters.professional === prof.id) {
                    commissionMap.set(prof.id, {
                        professionalId: prof.id,
                        professionalName: prof.name,
                        totalSales: 0,
                        totalCommission: 0,
                        serviceSales: 0,
                        productSales: 0,
                        serviceCommission: 0,
                        productCommission: 0,
                    });
                }
            });

            filteredSales.forEach(sale => {
                sale.items?.forEach(item => {
                    const professionalId = item.barbero_id;
                    if (!professionalId || !commissionMap.has(professionalId)) return;
                    
                    const data = commissionMap.get(professionalId)!;
                    const professional = professionalMap.get(professionalId);
                    
                    if(!professional) return;
                    
                    const itemName = item.nombre || item.servicio;
                    if(!itemName) return;

                    if(item.tipo === 'servicio') {
                        const service = services.find(s => s.name === itemName);
                        if (!service) return;

                        data.serviceSales += item.precio || 0;
                        const commissionConfig = professional?.comisionesPorServicio?.[service.name] || service.defaultCommission;
                        if (commissionConfig) {
                            const commissionAmount = commissionConfig.type === '%'
                                ? (item.precio || 0) * (commissionConfig.value / 100)
                                : commissionConfig.value;
                            data.serviceCommission += commissionAmount;
                        }

                    } else if (item.tipo === 'producto') {
                        const product = products.find(p => p.nombre === itemName);
                        if (!product) return;
                        
                        data.productSales += item.precio || 0;
                        const commissionConfig = professional?.comisionesPorProducto?.[product.id] || product.commission;
                         if (commissionConfig) {
                            const commissionAmount = commissionConfig.type === '%'
                                ? (item.precio || 0) * (commissionConfig.value / 100)
                                : commissionConfig.value;
                            data.productCommission += commissionAmount;
                        }
                    }
                });
            });
            
            const finalData = Array.from(commissionMap.values()).map(data => ({
                ...data,
                totalSales: data.serviceSales + data.productSales,
                totalCommission: data.serviceCommission + data.productCommission,
            })).filter(d => d.totalSales > 0);

            setCommissionData(finalData);
            setIsLoading(false);
        };

        calculateCommissions();

    }, [sales, professionals, services, products, salesLoading, professionalsLoading, servicesLoading, productsLoading, activeFilters]);

    const summary = useMemo(() => {
        return commissionData.reduce((acc, current) => {
            acc.totalSales += current.totalSales;
            acc.totalCommission += current.totalCommission;
            acc.serviceSales += current.serviceSales;
            acc.serviceCommission += current.serviceCommission;
            acc.productSales += current.productSales;
            acc.productCommission += current.productCommission;
            return acc;
        }, { totalSales: 0, totalCommission: 0, serviceSales: 0, serviceCommission: 0, productSales: 0, productCommission: 0 });
    }, [commissionData]);

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
                                    {isClientMounted && dateRange?.from ? (
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
                    <Button className="w-full lg:w-auto" onClick={handleSearch} disabled={isLoading || salesLoading}>
                        {(isLoading || salesLoading) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />} Buscar
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
                            <TableHead className="text-right">Ventas totales</TableHead>
                            <TableHead className="text-right">Monto comisión</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {(isLoading || salesLoading) ? (
                            <TableRow><TableCell colSpan={3} className="text-center h-24"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                        ) : commissionData.length === 0 ? (
                            <TableRow><TableCell colSpan={3} className="text-center h-24">No hay datos para el período seleccionado.</TableCell></TableRow>
                        ) : commissionData.map((commission) => (
                            <TableRow key={commission.professionalId}>
                                <TableCell className="font-medium">{commission.professionalName}</TableCell>
                                <TableCell className="text-right">${commission.totalSales.toLocaleString('es-CL')}</TableCell>
                                <TableCell className="text-right text-primary font-semibold">${commission.totalCommission.toLocaleString('es-CL')}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter>
                        <TableRow className="bg-muted/50">
                            <TableHead className="text-right font-bold">Totales</TableHead>
                            <TableHead className="text-right font-bold">${summary.totalSales.toLocaleString('es-CL')}</TableHead>
                            <TableHead className="text-right font-bold text-primary">${summary.totalCommission.toLocaleString('es-CL')}</TableHead>
                        </TableRow>
                    </TableFooter>
                </Table>
            </CardContent>
        </Card>
    </div>
  );
}
