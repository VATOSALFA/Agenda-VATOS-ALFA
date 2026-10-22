'use client';

import { useState, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import * as XLSX from 'xlsx';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { 
    Calendar as CalendarIcon, 
    Search, 
    Download, 
    Briefcase, 
    ShoppingBag, 
    DollarSign, 
    Loader2, 
    Eye, 
    SlidersHorizontal,
    ShieldAlert,
    X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import { where, getDocs, collection, query as firestoreQuery } from "firebase/firestore";
import type { Role, ProfessionalCommissionSummary } from "@/lib/types";
import { CommissionDetailModal } from "@/components/sales/commission-detail-modal";
import { useAuth } from "@/contexts/firebase-auth-context";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/firebase-client";
import { useToast } from "@/hooks/use-toast";
import { useCommissionsData } from './use-commissions-data';
import { logAuditAction } from '@/lib/audit-logger';

export default function CommissionsPage() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: new Date(),
        to: new Date()
    });
    const [localFilter, setLocalFilter] = useState('todos');
    const [professionalFilter, setProfessionalFilter] = useState('todos');
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const [isMobilePopoverOpen, setIsMobilePopoverOpen] = useState(false);
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    useEffect(() => {
        if (user && user.role !== 'Administrador general') {
            const userLocalId = user.local_id || 'todos';
            setLocalFilter(userLocalId);
            setActiveFilters(prev => ({ ...prev, local: userLocalId }));
        }
    }, [user]);

    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectedProfessionalSummary, setSelectedProfessionalSummary] = useState<ProfessionalCommissionSummary | null>(null);
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const [authCode, setAuthCode] = useState('');

    const [activeFilters, setActiveFilters] = useState<{
        dateRange: DateRange | undefined;
        local: string;
        professional: string;
    }>({
        dateRange: {
            from: new Date(),
            to: new Date()
        },
        local: 'todos',
        professional: 'todos'
    });

    const [queryKey, setQueryKey] = useState(0);

    const {
        summaryByProfessional,
        overallSummary,
        serviceSummary,
        productSummary,
        tipSummary,
        loading: isLoading,
        raw: { locales, professionals }
    } = useCommissionsData(activeFilters, queryKey);

    const breakdownParts = [];
    if (serviceSummary.serviceSales > 0) {
        breakdownParts.push(`$${serviceSummary.serviceSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} por venta de servicios`);
    }
    if (productSummary.productSales > 0) {
        breakdownParts.push(`$${productSummary.productSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} por venta de productos`);
    }
    if (tipSummary && tipSummary.tipAmount > 0) {
        breakdownParts.push(`$${tipSummary.tipAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} de propinas`);
    }

    const breakdownText = breakdownParts.length > 0 
        ? breakdownParts.join(' + ') 
        : `$${overallSummary.totalSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} en ventas`;

    const localesLoading = isLoading;
    const professionalsLoading = isLoading;

    const handleSearch = () => {
        const normalizedRange = dateRange?.from ? {
            from: dateRange.from,
            to: dateRange.to || dateRange.from
        } : undefined;
        setDateRange(normalizedRange);
        setActiveFilters({
            dateRange: normalizedRange,
            local: localFilter,
            professional: professionalFilter
        });
    };

    const handleDateSelect = (range: DateRange | undefined) => {
        setDateRange(range);
        if (range?.from && range?.to) {
            setIsPopoverOpen(false);
            setIsMobilePopoverOpen(false);
        }
    };

    const handleViewDetails = (summary: ProfessionalCommissionSummary) => {
        setSelectedProfessionalSummary(summary);
        setIsDetailModalOpen(true);
    };

    const periodString = dateRange?.from 
        ? (dateRange.to 
            ? `${format(dateRange.from, "dd/MM/yyyy", { locale: es })} - ${format(dateRange.to, "dd/MM/yyyy", { locale: es })}` 
            : format(dateRange.from, "dd/MM/yyyy", { locale: es })) 
        : "Periodo no definido";

    const triggerDownload = () => {
        if (summaryByProfessional.length === 0) {
            toast({ title: "No hay datos para exportar", variant: "destructive" });
            return;
        }

        const dataForExcel = summaryByProfessional.map(row => ({
            'Periodo': periodString,
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

            await logAuditAction({
                action: 'Autorización por Código',
                details: 'Acción autorizada: Descargar reporte de comisiones filtrado.',
                userId: user?.uid || 'unknown',
                userName: user?.displayName || user?.email || 'Unknown',
                userRole: user?.role,
                authCode: authCode,
                severity: 'info',
                localId: localFilter !== 'todos' ? localFilter : 'unknown'
            });
            setAuthCode('');
        }
    };

    const isLocalAdmin = user?.role !== 'Administrador general';

    const { data: roles } = useFirestoreQuery<Role>('roles');
    const userRole = roles.find(r => r.title === user?.role);
    const historyLimit = userRole?.historyRestrictionDays;

    const hasActiveSecondaryFilters = localFilter !== 'todos' || professionalFilter !== 'todos';

    return (
        <>
            <div className="flex-1 space-y-4 p-3 sm:p-6 md:p-8 pt-4 sm:pt-6 pb-28 sm:pb-36 min-h-full">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                            Reporte de comisiones
                        </h1>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 hidden sm:block">
                            Resumen y cálculo detallado de comisiones por profesional, servicios y productos.
                        </p>
                    </div>
                </div>

                {/* FILTROS ESCRITORIO (hidden sm:block) */}
                <Card className="hidden sm:block rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                    <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/40">
                        <CardTitle className="text-base font-semibold">Filtros de búsqueda</CardTitle>
                        <CardDescription className="text-xs">Selecciona el periodo, local y profesional para calcular comisiones.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-5">
                        <div className="flex flex-col lg:flex-row lg:items-end gap-3 sm:gap-4">
                            {/* Periodo de tiempo */}
                            <div className="flex-1 min-w-[200px] space-y-1.5">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Periodo de tiempo</label>
                                <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
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

                            {/* Local */}
                            <div className="flex-1 min-w-[170px] space-y-1.5">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Local / Sucursal</label>
                                <Select value={localFilter} onValueChange={setLocalFilter} disabled={isLocalAdmin || localesLoading}>
                                    <SelectTrigger className="w-full rounded-xl h-10 border-border/60 text-xs sm:text-sm">
                                        <SelectValue placeholder={localesLoading ? "Cargando..." : "Todos"} />
                                    </SelectTrigger>
                                    <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                        {!isLocalAdmin && <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">Todos los locales</SelectItem>}
                                        {locales.map(local => (
                                            <SelectItem key={local.id} value={local.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">{local.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Profesionales */}
                            <div className="flex-1 min-w-[170px] space-y-1.5">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Profesionales</label>
                                <Select value={professionalFilter} onValueChange={setProfessionalFilter} disabled={professionalsLoading}>
                                    <SelectTrigger className="w-full rounded-xl h-10 border-border/60 text-xs sm:text-sm">
                                        <SelectValue placeholder={professionalsLoading ? "Cargando..." : "Todos"} />
                                    </SelectTrigger>
                                    <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1 max-h-64">
                                        <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">Todos los profesionales</SelectItem>
                                        {professionals.map(prof => (
                                            <SelectItem key={prof.id} value={prof.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">
                                                {prof.name}{prof.deleted ? ' (Eliminado)' : ''}
                                            </SelectItem>
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
                            <Popover open={isMobilePopoverOpen} onOpenChange={setIsMobilePopoverOpen}>
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
                                                'Fecha'
                                            )}
                                        </span>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]" align="start">
                                    <Calendar
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
                            <Button variant="alfa" className="h-9 rounded-xl px-3 text-xs font-bold text-white shadow-md shrink-0 w-auto" onClick={handleSearch} disabled={isLoading}>
                                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1" />}
                                Buscar
                            </Button>
                        </div>

                        {/* Desplegable de filtros secundarios en móvil */}
                        {showMobileFilters && (
                            <div className="pt-2 border-t border-border/40 grid grid-cols-1 gap-2 animate-in fade-in-50 duration-200">
                                <div className="space-y-1">
                                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Local / Sucursal</span>
                                    <Select value={localFilter} onValueChange={setLocalFilter} disabled={isLocalAdmin || localesLoading}>
                                        <SelectTrigger className="rounded-xl h-9 text-xs border-border/60">
                                            <SelectValue placeholder={localesLoading ? "Cargando..." : "Todos los locales"} />
                                        </SelectTrigger>
                                        <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                            {!isLocalAdmin && <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">Todos los locales</SelectItem>}
                                            {locales.map(local => (
                                                <SelectItem key={local.id} value={local.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">{local.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Profesionales</span>
                                    <Select value={professionalFilter} onValueChange={setProfessionalFilter} disabled={professionalsLoading}>
                                        <SelectTrigger className="rounded-xl h-9 text-xs border-border/60">
                                            <SelectValue placeholder={professionalsLoading ? "Cargando..." : "Todos los profesionales"} />
                                        </SelectTrigger>
                                        <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1 max-h-64">
                                            <SelectItem value="todos" className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">Todos los profesionales</SelectItem>
                                            {professionals.map(prof => (
                                                <SelectItem key={prof.id} value={prof.id} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 hover:bg-white/10 data-[highlighted]:bg-white/10 data-[highlighted]:text-white cursor-pointer">
                                                    {prof.name}{prof.deleted ? ' (Eliminado)' : ''}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* MÉTRICAS MÓVIL COMPACTA (sm:hidden) */}
                <Card className="sm:hidden rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-3 space-y-2.5">
                    {/* Comisiones totales (Destacado) */}
                    <div className="flex items-center justify-between">
                        <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-1.5">
                                <DollarSign className="h-4 w-4 text-[#C5A880] shrink-0" />
                                <span className="text-xs font-semibold text-foreground">Comisiones totales</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight truncate">
                                {breakdownText}
                            </p>
                        </div>
                        <div className="text-lg font-bold tracking-tight text-blue-500 dark:text-blue-400 shrink-0">
                            ${overallSummary.totalCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>

                    <div className="border-t border-border/50" />

                    {/* Desglose 2 Columnas (Servicios vs Productos) */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-medium">
                                <Briefcase className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="truncate">Venta servicios</span>
                            </div>
                            <div className="font-semibold text-foreground text-xs">
                                ${serviceSummary.serviceSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                                Comisión: <span className="font-semibold text-foreground">${serviceSummary.serviceCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                        </div>

                        <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-medium">
                                <ShoppingBag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="truncate">Venta productos</span>
                            </div>
                            <div className="font-semibold text-foreground text-xs">
                                ${productSummary.productSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                                Comisión: <span className="font-semibold text-foreground">${productSummary.productCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* MÉTRICAS ESCRITORIO (hidden sm:grid) */}
                <div className="hidden sm:grid sm:grid-cols-3 gap-3 sm:gap-4">
                    {/* Ventas de servicios */}
                    <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-4 sm:p-5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs sm:text-sm font-medium text-muted-foreground">Ventas de servicios</span>
                            <Briefcase className="h-4 w-4 text-slate-400" />
                        </div>
                        <div className="mt-2">
                            <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                                ${serviceSummary.serviceSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Comisión: <span className="font-semibold text-foreground">${serviceSummary.serviceCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </p>
                        </div>
                    </Card>

                    {/* Ventas de productos */}
                    <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-4 sm:p-5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs sm:text-sm font-medium text-muted-foreground">Ventas de productos</span>
                            <ShoppingBag className="h-4 w-4 text-slate-400" />
                        </div>
                        <div className="mt-2">
                            <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                                ${productSummary.productSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Comisión: <span className="font-semibold text-foreground">${productSummary.productCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </p>
                        </div>
                    </Card>

                    {/* Comisiones totales */}
                    <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm p-4 sm:p-5 relative">
                        <div className="flex items-center justify-between">
                            <span className="text-xs sm:text-sm font-semibold text-foreground">Comisiones totales</span>
                            <DollarSign className="h-4 w-4 text-[#C5A880]" />
                        </div>
                        <div className="mt-2">
                            <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                                ${overallSummary.totalCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 leading-snug line-clamp-2">
                                Sobre un total de {breakdownText}
                            </p>
                        </div>
                    </Card>
                </div>

                {/* TABLA / LISTADO: COMISIONES POR PROFESIONAL */}
                <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm">
                    <CardHeader className="flex-row items-center justify-between p-3.5 sm:p-5 border-b border-border/60">
                        <div>
                            <CardTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                                Comisiones por profesional
                                <Badge variant="secondary" className="font-normal text-xs">
                                    {summaryByProfessional.length} {summaryByProfessional.length === 1 ? 'profesional' : 'profesionales'}
                                </Badge>
                            </CardTitle>
                            <CardDescription className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                                Resumen de comisiones generadas en el período seleccionado.
                            </CardDescription>
                        </div>
                        <button 
                            type="button"
                            className="text-slate-400 hover:text-foreground transition-colors p-1" 
                            onClick={() => setIsDownloadModalOpen(true)}
                            title="Descargar comisiones en Excel"
                        >
                            <Download className="h-4 w-4" />
                        </button>
                    </CardHeader>
                    <CardContent className="p-0">
                        {/* VISTA ESCRITORIO: TABLA */}
                        <div className="hidden sm:block overflow-x-auto touch-pan-y scrollbar-thin">
                            <Table>
                                <TableHeader>
                                    <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                        <TableHead className="py-1 px-3 text-xs font-semibold">Profesional / Staff</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold">Periodo</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-right">Venta total</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-right">Monto comisión</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center h-28">
                                                <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
                                                <span className="text-xs text-muted-foreground mt-2 block">Calculando comisiones...</span>
                                            </TableCell>
                                        </TableRow>
                                    ) : summaryByProfessional.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center h-28 text-xs text-muted-foreground">
                                                No hay datos de comisiones para el período seleccionado.
                                            </TableCell>
                                        </TableRow>
                                    ) : summaryByProfessional.map((row) => (
                                        <TableRow key={row.professionalId} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
                                            <TableCell className="py-1.5 px-3 font-semibold text-xs text-foreground">
                                                {row.professionalName}
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-xs text-muted-foreground">
                                                {periodString}
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-right text-xs font-medium">
                                                ${row.totalSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-right text-xs font-bold text-blue-500 dark:text-blue-400">
                                                ${row.totalCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="py-1.5 px-3 text-right">
                                                <button 
                                                    type="button" 
                                                    className="text-slate-400 hover:text-white transition-colors p-1" 
                                                    onClick={() => handleViewDetails(row)}
                                                    title="Ver detalles"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter className="bg-muted/30 border-t border-border/60 font-bold">
                                    <TableRow className="h-9 hover:bg-transparent">
                                        <TableCell className="py-1.5 px-3 font-bold text-xs">Totales</TableCell>
                                        <TableCell className="py-1.5 px-3"></TableCell>
                                        <TableCell className="py-1.5 px-3 text-right font-bold text-xs">
                                            ${overallSummary.totalSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="py-1.5 px-3 text-right font-bold text-xs text-blue-500 dark:text-blue-400">
                                            ${overallSummary.totalCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="py-1.5 px-3"></TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </div>

                        {/* VISTA MÓVIL: TARJETAS COMPACTAS (sm:hidden) */}
                        <div className="sm:hidden">
                            {isLoading ? (
                                <div className="text-center py-10 space-y-2">
                                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
                                    <span className="text-xs text-muted-foreground">Calculando comisiones...</span>
                                </div>
                            ) : summaryByProfessional.length === 0 ? (
                                <div className="text-center py-10 text-xs text-muted-foreground">
                                    No hay datos de comisiones para el período seleccionado.
                                </div>
                            ) : (
                                <div className="divide-y divide-border/60">
                                    {summaryByProfessional.map((row) => (
                                        <div key={row.professionalId} className="p-3 space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 min-w-0 pr-2">
                                                    <span className="font-bold text-sm text-foreground truncate">{row.professionalName}</span>
                                                    <span className="text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded border border-border/40 shrink-0">
                                                        {periodString}
                                                    </span>
                                                </div>
                                                <button 
                                                    type="button" 
                                                    className="text-slate-400 hover:text-foreground transition-colors p-1 shrink-0" 
                                                    onClick={() => handleViewDetails(row)}
                                                    title="Ver detalles"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </button>
                                            </div>

                                            <div className="flex items-center justify-between text-xs pt-0.5">
                                                <div>
                                                    <span className="text-[11px] text-muted-foreground mr-1.5">Venta:</span>
                                                    <span className="font-medium text-foreground text-xs">
                                                        ${row.totalSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-[11px] text-muted-foreground mr-1.5">Comisión:</span>
                                                    <span className="font-bold text-sm text-blue-500 dark:text-blue-400">
                                                        ${row.totalCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Barra de Totales en Móvil */}
                                    <div className="p-3 bg-muted/20 border-t border-border/60 flex items-center justify-between text-xs">
                                        <span className="font-semibold text-muted-foreground">Totales del período</span>
                                        <div className="text-right space-y-0.5">
                                            <div className="text-[11px] text-muted-foreground">
                                                Ventas: <strong className="text-foreground">${overallSummary.totalSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                            </div>
                                            <div className="font-bold text-sm text-blue-500 dark:text-blue-400">
                                                Comisión: ${overallSummary.totalCommission.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Modal de Detalle */}
            {selectedProfessionalSummary && (
                <CommissionDetailModal
                    isOpen={isDetailModalOpen}
                    onOpenChange={(open) => {
                        setIsDetailModalOpen(open);
                        if (!open) setSelectedProfessionalSummary(null);
                    }}
                    summary={selectedProfessionalSummary}
                    dateRangeStr={periodString}
                />
            )}

            {/* Modal Institucional de Autorización para Descarga */}
            <Dialog open={isDownloadModalOpen} onOpenChange={setIsDownloadModalOpen}>
                <DialogContent hideCloseButton={true} className="p-0 overflow-hidden rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] border-2 border-blue-500 bg-background max-w-md">
                    {/* Header Institucional Vatos Alfa */}
                    <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] p-4 text-white border-b border-blue-900/40">
                        <div className="header-light-beam" />
                        <div className="relative z-10 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <ShieldAlert className="h-5 w-5 text-slate-300" />
                                <div>
                                    <DialogTitle className="font-bold text-base text-white leading-tight">
                                        Requiere Autorización
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-slate-300">
                                        Permiso para descargar reporte
                                    </DialogDescription>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => { setAuthCode(''); setIsDownloadModalOpen(false); }}
                                className="h-7 w-7 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="p-4 sm:p-5 space-y-4">
                        <p className="text-xs sm:text-sm text-muted-foreground">
                            Para descargar este archivo es necesario ingresar un código de autorización activo con permisos de exportación.
                        </p>
                        <div className="space-y-1.5">
                            <Label htmlFor="auth-code" className="text-xs font-semibold">Código de Autorización</Label>
                            <Input 
                                id="auth-code" 
                                type="password" 
                                placeholder="••••••••" 
                                value={authCode} 
                                onChange={e => setAuthCode(e.target.value)} 
                                className="rounded-xl h-10 border-border/60 text-center tracking-widest font-mono text-sm"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleDownloadRequest();
                                }}
                            />
                        </div>
                    </div>

                    <div className="p-3 sm:p-4 border-t border-border/60 bg-muted/10 flex justify-end gap-2">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="rounded-xl border-border/60 hover:bg-white/5 font-medium text-xs h-9" 
                            onClick={() => { setAuthCode(''); setIsDownloadModalOpen(false); }}
                        >
                            Cancelar
                        </Button>
                        <Button 
                            variant="alfa" 
                            size="sm" 
                            className="h-9 rounded-xl px-4 text-xs font-bold text-white shadow-md" 
                            onClick={handleDownloadRequest}
                        >
                            Aceptar y Descargar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
