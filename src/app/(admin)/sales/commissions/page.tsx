
'use client';

import { useState, useMemo, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { startOfDay, endOfDay } from 'date-fns';
import * as XLSX from 'xlsx';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Search, Download, Briefcase, ShoppingBag, DollarSign, Loader2, Eye, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import { where, Timestamp, doc, getDocs, getDoc, collection, query as firestoreQuery } from "firebase/firestore";
import type { Local, Profesional, Service, Product, Sale, SaleItem, Client, AuthCode } from "@/lib/types";
import { CommissionDetailModal } from "@/components/sales/commission-detail-modal";
import { useAuth } from "@/contexts/firebase-auth-context";
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
import { useToast } from "@/hooks/use-toast";


interface CommissionRowData {
    professionalId: string;
    professionalName: string;
    clientName: string;
    itemName: string;
    itemType: 'servicio' | 'producto';
    saleAmount: number;
    commissionAmount: number;
    commissionPercentage: number;
}

interface ProfessionalCommissionSummary {
    professionalId: string;
    professionalName: string;
    totalSales: number;
    totalCommission: number;
    details: CommissionRowData[];
}


export default function CommissionsPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [localFilter, setLocalFilter] = useState('todos');
    const [professionalFilter, setProfessionalFilter] = useState('todos');

    const [commissionData, setCommissionData] = useState<CommissionRowData[]>([]);
    const [discountsAffectCommissions, setDiscountsAffectCommissions] = useState(true);

    const [isLoading, setIsLoading] = useState(true);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectedProfessionalSummary, setSelectedProfessionalSummary] = useState<ProfessionalCommissionSummary | null>(null);
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const [authCode, setAuthCode] = useState('');

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
    const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes', queryKey);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const d = await getDoc(doc(db, 'settings', 'commissions'));
                if (d.exists()) {
                    setDiscountsAffectCommissions(d.data().discountsAffectCommissions ?? true);
                }
            } catch (e) {
                console.error("Error loading commission settings", e);
            }
        };
        fetchSettings();
    }, []);

    useEffect(() => {
        const today = new Date();
        const initialDateRange = { from: startOfDay(today), to: endOfDay(today) };
        setDateRange(initialDateRange);

        const initialFilters = {
            dateRange: initialDateRange,
            local: user?.local_id || 'todos',
            professional: 'todos'
        };

        setActiveFilters(initialFilters);
        if (user?.local_id) {
            setLocalFilter(user.local_id);
        }

    }, [user]);

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
        const anyLoading = salesLoading || professionalsLoading || servicesLoading || productsLoading || clientsLoading;
        setIsLoading(anyLoading);

        if (anyLoading || !sales || !professionals || !services || !products || !clients) {
            setCommissionData([]);
            return;
        }

        const professionalMap = new Map(professionals.map(p => [p.id, p]));
        const serviceMap = new Map(services.map(s => [s.id, s]));
        const productMap = new Map(products.map(p => [p.id, p]));
        const clientMap = new Map(clients.map(c => [c.id, c]));

        let filteredSales = sales;
        if (activeFilters.local !== 'todos') {
            filteredSales = filteredSales.filter(s => s.local_id === activeFilters.local);
        }

        const commissionRows: CommissionRowData[] = [];

        filteredSales.forEach(sale => {
            // Strict check: Commissions are ONLY for fully paid sales
            if (sale.pago_estado === 'deposit_paid' || sale.pago_estado === 'Pago Parcial' || sale.pago_estado === 'Pendiente') {
                return;
            }

            // Secondary check: If real paid amount is significant less than total (allowing for small rounding errors), skip
            // This catches cases where status might be 'Pagado' incorrectly but amount is obviously partial
            if (sale.monto_pagado_real !== undefined && (sale.total - sale.monto_pagado_real) > 1) {
                return;
            }

            const client = clientMap.get(sale.cliente_id);
            const clientName = client ? `${client.nombre} ${client.apellido}` : 'Cliente desconocido';

            sale.items?.forEach(item => {
                // If professional filter is active, only process items from that professional
                if (activeFilters.professional !== 'todos' && item.barbero_id !== activeFilters.professional) {
                    return; // Skip this item if it doesn't match the professional filter
                }

                const professional = professionalMap.get(item.barbero_id);
                if (!professional) return;

                const itemPrice = item.subtotal || item.precio || 0;
                const itemDiscount = item.descuento?.monto || 0;
                // If discounts affect commissions (default), subtract discount. Otherwise use gross price.
                const finalItemPrice = discountsAffectCommissions ? (itemPrice - itemDiscount) : itemPrice;

                let commissionConfig = null;
                let itemName = item.nombre;

                if (item.tipo === 'servicio') {
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
                        ? finalItemPrice * (commissionConfig.value / 100)
                        : commissionConfig.value;

                    commissionRows.push({
                        professionalId: professional.id,
                        professionalName: professional.name,
                        clientName: clientName,
                        itemName: itemName,
                        itemType: item.tipo,
                        saleAmount: finalItemPrice,
                        commissionAmount: commissionAmount,
                        commissionPercentage: commissionConfig.type === '%' ? commissionConfig.value : (finalItemPrice > 0 ? (commissionAmount / finalItemPrice) * 100 : 0)
                    });
                }
            });
        });

        setCommissionData(commissionRows);

    }, [sales, professionals, services, products, clients, salesLoading, professionalsLoading, servicesLoading, productsLoading, clientsLoading, activeFilters, discountsAffectCommissions]);

    const handleSearch = () => {
        setActiveFilters({
            dateRange,
            local: localFilter,
            professional: professionalFilter
        });
    }

    const summaryByProfessional = useMemo(() => {
        const grouped = commissionData.reduce((acc, current) => {
            if (!acc[current.professionalId]) {
                acc[current.professionalId] = {
                    professionalId: current.professionalId,
                    professionalName: current.professionalName,
                    totalSales: 0,
                    totalCommission: 0,
                    details: []
                };
            }
            acc[current.professionalId].totalSales += current.saleAmount;
            acc[current.professionalId].totalCommission += current.commissionAmount;
            acc[current.professionalId].details.push(current);
            return acc;
        }, {} as Record<string, ProfessionalCommissionSummary>);

        return Object.values(grouped);
    }, [commissionData]);

    const overallSummary = useMemo(() => {
        return summaryByProfessional.reduce((acc, current) => {
            acc.totalSales += current.totalSales;
            acc.totalCommission += current.totalCommission;
            return acc;
        }, { totalSales: 0, totalCommission: 0 });
    }, [summaryByProfessional]);

    const serviceSummary = useMemo(() => {
        const serviceData = commissionData.filter(d => d.itemType === 'servicio');
        return serviceData.reduce((acc, current) => {
            acc.serviceSales += current.saleAmount;
            acc.serviceCommission += current.commissionAmount;
            return acc;
        }, { serviceSales: 0, serviceCommission: 0 });
    }, [commissionData]);

    const productSummary = useMemo(() => {
        const productData = commissionData.filter(d => d.itemType === 'producto');
        return productData.reduce((acc, current) => {
            acc.productSales += current.saleAmount;
            acc.productCommission += current.commissionAmount;
            return acc;
        }, { productSales: 0, productCommission: 0 });
    }, [commissionData]);

    const handleViewDetails = (summary: ProfessionalCommissionSummary) => {
        setSelectedProfessionalSummary(summary);
        setIsDetailModalOpen(true);
    }

    const triggerDownload = () => {
        if (summaryByProfessional.length === 0) {
            toast({ title: "No hay datos para exportar", variant: "destructive" });
            return;
        }

        const dataForExcel = summaryByProfessional.map(row => ({
            'Profesional / Staff': row.professionalName,
            'Venta total': row.totalSales,
            'Monto comisión': row.totalCommission,
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Comisiones");
        XLSX.writeFile(workbook, `Reporte_Comisiones_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

        toast({
            title: "Reporte generado",
            description: "La descarga de tu reporte de comisiones ha comenzado.",
        });
    };

    const handleDownloadRequest = async () => {
        if (!authCode) {
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

    const isLocalAdmin = user?.role !== 'Administrador general';


    return (
        <>
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
                                                    <>{format(dateRange.from, "LLL dd, y", { locale: es })} - {format(dateRange.to, "LLL dd, y", { locale: es })}</>
                                                ) : (
                                                    format(dateRange.from, "LLL dd, y", { locale: es })
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
                                <Select value={localFilter} onValueChange={setLocalFilter} disabled={isLocalAdmin || localesLoading}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={localesLoading ? "Cargando..." : "Todos"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {!isLocalAdmin && <SelectItem value="todos">Todos</SelectItem>}
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

                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Ventas de servicios</CardTitle>
                            <Briefcase className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">${serviceSummary.serviceSales.toLocaleString('es-MX')}</div>
                            <p className="text-xs text-muted-foreground">Comisión: ${serviceSummary.serviceCommission.toLocaleString('es-MX')}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Ventas de productos</CardTitle>
                            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">${productSummary.productSales.toLocaleString('es-MX')}</div>
                            <p className="text-xs text-muted-foreground">Comisión: ${productSummary.productCommission.toLocaleString('es-MX')}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Comisiones totales</CardTitle>
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">${overallSummary.totalCommission.toLocaleString('es-MX')}</div>
                            <p className="text-xs text-muted-foreground">Sobre un total de ${overallSummary.totalSales.toLocaleString('es-MX')} en ventas</p>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="flex-row items-center justify-between">
                        <div>
                            <CardTitle>Comisiones por Profesional</CardTitle>
                            <CardDescription>Resumen de comisiones generadas en el período seleccionado.</CardDescription>
                        </div>
                        <Button variant="outline" onClick={() => setIsDownloadModalOpen(true)}><Download className="mr-2 h-4 w-4" /> Descargar comisiones</Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Profesional / Staff</TableHead>
                                    <TableHead className="text-right">Venta total</TableHead>
                                    <TableHead className="text-right">Monto comisión</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={4} className="text-center h-24"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                                ) : summaryByProfessional.length === 0 ? (
                                    <TableRow><TableCell colSpan={4} className="text-center h-24">No hay datos para el período seleccionado.</TableCell></TableRow>
                                ) : summaryByProfessional.map((row) => (
                                    <TableRow key={row.professionalId}>
                                        <TableCell className="font-medium">{row.professionalName}</TableCell>
                                        <TableCell className="text-right">${row.totalSales.toLocaleString('es-MX')}</TableCell>
                                        <TableCell className="text-right text-primary font-semibold">${row.totalCommission.toLocaleString('es-MX')}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm" onClick={() => handleViewDetails(row)}>
                                                <Eye className="mr-2 h-4 w-4" /> Ver detalles
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="text-right font-bold">Totales</TableHead>
                                    <TableHead className="text-right font-bold">${overallSummary.totalSales.toLocaleString('es-MX')}</TableHead>
                                    <TableHead className="text-right font-bold text-primary">${overallSummary.totalCommission.toLocaleString('es-MX')}</TableHead>
                                    <TableHead></TableHead>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            {selectedProfessionalSummary && (
                <CommissionDetailModal
                    isOpen={isDetailModalOpen}
                    onOpenChange={setIsDetailModalOpen}
                    summary={selectedProfessionalSummary}
                    dateRangeStr={dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "dd/MM/yyyy", { locale: es })} - ${format(dateRange.to, "dd/MM/yyyy", { locale: es })}` : format(dateRange.from, "dd/MM/yyyy", { locale: es })) : "Periodo no definido"}
                />
            )}

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
