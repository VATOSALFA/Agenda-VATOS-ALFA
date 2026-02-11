
'use client';

import { useState, useMemo, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { startOfDay, endOfDay, subDays } from 'date-fns';
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
import type { Local, Profesional, Service, Product, Sale, SaleItem, Client, AuthCode, Role } from "@/lib/types";
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


import { useCommissionsData } from './use-commissions-data';
import type { ProfessionalCommissionSummary } from "@/lib/types";


export default function CommissionsPage() {
    const { user } = useAuth();



    const { toast } = useToast();
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [localFilter, setLocalFilter] = useState('todos');
    const [professionalFilter, setProfessionalFilter] = useState('todos');

    const [commissionData, setCommissionData] = useState<any[]>([]); // Keep it as empty array or remove it if not used. 
    // Actually, commissionData was state, now it's internal to hook. Detailed modal uses summary.details.
    // So distinct state commissionData is NOT needed in page.
    const [discountsAffectCommissions, setDiscountsAffectCommissions] = useState(true); // Needed? Hook handles it internally.
    // Hook does NOT expose discountsAffectCommissions. If UI doesn't show it, we can remove it.
    // UI doesn't seem to show 'discountsAffectCommissions'.

    // We can remove these states.
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

    const {
        summaryByProfessional,
        overallSummary,
        serviceSummary,
        productSummary,
        loading: isLoading,
        raw: { locales, professionals }
    } = useCommissionsData(activeFilters, queryKey);

    // Derived loading states for UI compatibility (though isLoading covers all)
    const localesLoading = isLoading;
    const professionalsLoading = isLoading;

    const handleSearch = () => {
        setActiveFilters({
            dateRange,
            local: localFilter,
            professional: professionalFilter
        });
    }

    const [isPopoverOpen, setIsPopoverOpen] = useState(false);

    const handleDateSelect = (range: DateRange | undefined) => {
        setDateRange(range);
        if (range?.from && range?.to) {
            setIsPopoverOpen(false);
        }
    };

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





    const { data: roles } = useFirestoreQuery<Role>('roles');
    const userRole = roles.find(r => r.title === user?.role);
    const historyLimit = userRole?.historyRestrictionDays;

    return (
        <>
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between space-y-2">
                    <h2 className="text-3xl font-bold tracking-tight">Reporte de comisiones</h2>
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
                                <Popover open={isPopoverOpen} onOpenChange={(open) => {
                                    setIsPopoverOpen(open);
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
                                                <span>Seleccionar rango</span>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
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
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Local</label>
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
                                            <SelectItem key={prof.id} value={prof.id}>
                                                {prof.name}{prof.deleted ? ' (Eliminado)' : ''}
                                            </SelectItem>
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
                            <CardTitle>Comisiones por profesional</CardTitle>
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
