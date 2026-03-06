'use client';

import { useState, useMemo, useEffect } from "react";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

import { useAuth } from "@/contexts/firebase-auth-context";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Profesional, Local } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useInvoicedSales } from "../invoiced/use-invoiced-sales";
import { useCommissionsData } from "../commissions/use-commissions-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Pie, PieChart as RechartsPieChart, ResponsiveContainer, Cell, Tooltip
} from 'recharts';

export default function MyPerformancePage() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState<{
        dateRange: DateRange | undefined;
        local: string;
        paymentMethod: string;
        professional: string;
    }>({
        dateRange: undefined,
        local: 'todos',
        paymentMethod: 'todos',
        professional: 'none'
    });

    const [queryKey, setQueryKey] = useState(0);

    const { data: professionals, loading: profLoading } = useFirestoreQuery<Profesional>('profesionales');
    const myProfessionalId = professionals?.find(p => p.userId === user?.uid || p.email === user?.email)?.id;

    useEffect(() => {
        const today = new Date();
        const initialDateRange = { from: startOfDay(today), to: endOfDay(today) };
        setDateRange(initialDateRange);

        setActiveFilters({
            dateRange: initialDateRange,
            local: 'todos',
            paymentMethod: 'todos',
            professional: myProfessionalId || 'none'
        });
    }, [user, myProfessionalId]);

    const handleSearch = () => {
        if (!myProfessionalId) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se encontró tu perfil de profesional.' });
            return;
        }

        setActiveFilters({
            dateRange,
            local: 'todos',
            paymentMethod: 'todos',
            professional: myProfessionalId
        });
        setQueryKey(prev => prev + 1);
    };

    const handleDateSelect = (range: DateRange | undefined) => {
        setDateRange(range);
        if (range?.from && range?.to) {
            setIsPopoverOpen(false);
        }
    };

    const periodString = dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "dd/MM/yyyy", { locale: es })} - ${format(dateRange.to, "dd/MM/yyyy", { locale: es })}` : format(dateRange.from, "dd/MM/yyyy", { locale: es })) : "Periodo no definido";

    // Hooks for data
    const canSeeVentas = user?.permissions?.includes('ver_mis_ventas') || user?.role === 'Administrador general';
    const canSeeComisiones = user?.permissions?.includes('ver_mis_comisiones') || user?.role === 'Administrador general';
    const canSeePropinas = user?.permissions?.includes('ver_mis_propinas') || user?.role === 'Administrador general';

    const { sales: mySales, loading: loadingSales, salesData } = useInvoicedSales(activeFilters, queryKey);
    const {
        summaryByProfessional: myCommissionsList,
        overallSummary,
        loading: loadingCommissions
    } = useCommissionsData(activeFilters, queryKey);

    const myCommissionSummary = myCommissionsList.find(s => s.professionalId === myProfessionalId);

    // Calculate tips from sales just for this professional
    const myTips = mySales.flatMap(sale => sale.propina && Number(sale.propina) > 0 ? [{
        id: sale.id,
        fecha: sale.fecha_hora_venta?.seconds ? new Date(sale.fecha_hora_venta.seconds * 1000) : new Date(sale.fecha_hora_venta),
        monto: Number(sale.propina) / sale.items.filter(i => professionals.some(p => p.id === i.barbero_id)).length,
        cliente: sale.client ? `${sale.client.nombre} ${sale.client.apellido || ''}` : 'Cliente General',
        metodo: sale.metodo_pago
    }] : []).filter(item => {
        // filter logic is simplified: actually if the sale is linked to the professional, they get an even split
        // wait, useCommissionsData already calculates tipSummary!
        return true;
    });

    const tipSummary = myCommissionSummary ? myCommissionSummary.details.filter(d => d.itemType === 'propina').reduce((acc, curr) => acc + curr.commissionAmount, 0) : 0;

    const isLoading = loadingSales || loadingCommissions || profLoading;

    if (!user) return null;

    if (!profLoading && !myProfessionalId) {
        return (
            <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between space-y-2">
                    <h2 className="text-3xl font-bold tracking-tight">Mi Rendimiento</h2>
                </div>
                <div className="flex flex-col justify-center items-center h-[50vh] text-center space-y-4 border rounded-xl bg-muted/20">
                    <h2 className="text-2xl font-bold">Perfil de Profesional no encontrado</h2>
                    <p className="text-muted-foreground max-w-md">
                        Para ver tu rendimiento necesitas tener un perfil de profesional asociado a este usuario en el sistema.
                        Pide a un Administrador que te vincule en la sección de Ajustes {">"} Profesionales.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Mi Rendimiento</h2>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Filtros</CardTitle>
                    <CardDescription>Selecciona el periodo para visualizar tu desempeño.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="space-y-2 flex-grow max-w-sm">
                            <label className="text-sm font-medium">Periodo de tiempo</label>
                            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
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
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <Button onClick={handleSearch} disabled={isLoading || !myProfessionalId}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />} Buscar
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue={canSeeVentas ? "ventas" : canSeeComisiones ? "comisiones" : "propinas"} className="space-y-4">
                <TabsList>
                    {canSeeVentas && <TabsTrigger value="ventas">Mis Ventas</TabsTrigger>}
                    {canSeeComisiones && <TabsTrigger value="comisiones">Mis Comisiones</TabsTrigger>}
                    {canSeePropinas && <TabsTrigger value="propinas">Mis Propinas</TabsTrigger>}
                </TabsList>

                {canSeeVentas && (
                    <TabsContent value="ventas" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Tus Ventas Facturadas</CardTitle>
                                <CardDescription>Ventas donde has participado en el periodo: {periodString}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isLoading ? (
                                    <div className="py-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
                                ) : (
                                    <>
                                        {mySales.length === 0 ? (
                                            <p className="text-center py-6 text-muted-foreground">No tienes ventas registradas en este periodo.</p>
                                        ) : (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Fecha</TableHead>
                                                        <TableHead>Cliente</TableHead>
                                                        <TableHead>Concepto</TableHead>
                                                        <TableHead className="text-right">Total</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {mySales.map(sale => {
                                                        const dateObj = sale.fecha_hora_venta?.seconds ? new Date(sale.fecha_hora_venta.seconds * 1000) : new Date(sale.fecha_hora_venta);
                                                        const myItems = sale.items.filter(i => i.barbero_id === myProfessionalId);
                                                        const concepts = myItems.map(i => i.nombre).join(', ');

                                                        return (
                                                            <TableRow key={sale.id}>
                                                                <TableCell>{format(dateObj, 'PP p', { locale: es })}</TableCell>
                                                                <TableCell>{sale.client ? `${sale.client.nombre} ${sale.client.apellido || ''}` : 'Cliente'}</TableCell>
                                                                <TableCell>{concepts}</TableCell>
                                                                <TableCell className="text-right text-green-600 font-medium">${(sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total) ? sale.monto_pagado_real.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : sale.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</TableCell>
                                                            </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        )}
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {canSeeComisiones && (
                    <TabsContent value="comisiones" className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-lg">Tus Ventas Acumuladas</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold">${(myCommissionSummary?.totalSales || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                                    <p className="text-sm text-muted-foreground mt-1">Este es el total de la venta de tus servicios/productos.</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-lg text-primary">Tus Comisiones Generadas</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-3xl font-bold text-primary">${(myCommissionSummary?.totalCommission || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                                    <p className="text-sm text-muted-foreground mt-1">Este es el monto que te corresponde de comisión (incluyendo propinas).</p>
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle>Detalle de Comisiones</CardTitle>
                                <CardDescription>Desglose de los cobros en el periodo: {periodString}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isLoading ? (
                                    <div className="py-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
                                ) : (
                                    <>
                                        {!myCommissionSummary || myCommissionSummary.details.length === 0 ? (
                                            <p className="text-center py-6 text-muted-foreground">No generaste comisiones en este periodo.</p>
                                        ) : (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Concepto</TableHead>
                                                        <TableHead>Tipo</TableHead>
                                                        <TableHead className="text-right">Monto Venta</TableHead>
                                                        <TableHead className="text-right">Comisión</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {myCommissionSummary.details.map((detail, index) => (
                                                        <TableRow key={index}>
                                                            <TableCell className="font-medium">{detail.itemName}</TableCell>
                                                            <TableCell className="capitalize">{detail.itemType}</TableCell>
                                                            <TableCell className="text-right">${detail.saleAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</TableCell>
                                                            <TableCell className="text-right text-primary font-bold">${detail.commissionAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        )}
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {canSeePropinas && (
                    <TabsContent value="propinas" className="space-y-4">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg text-primary">Total Propinas</CardTitle>
                                <CardDescription>Acumulado de propinas que te dejaron tus clientes en este periodo.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-4xl font-bold text-primary">${tipSummary.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Desglose de Propinas</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {isLoading ? (
                                    <div className="py-12 flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
                                ) : (
                                    <>
                                        {!myCommissionSummary || myCommissionSummary.details.filter(d => d.itemType === 'propina').length === 0 ? (
                                            <p className="text-center py-6 text-muted-foreground">No recibiste propinas en este periodo.</p>
                                        ) : (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Cliente</TableHead>
                                                        <TableHead>Concepto</TableHead>
                                                        <TableHead className="text-right">Monto Propina</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {myCommissionSummary.details.filter(d => d.itemType === 'propina').map((prop, idx) => (
                                                        <TableRow key={idx}>
                                                            <TableCell>{prop.clientName || 'Cliente'}</TableCell>
                                                            <TableCell>{prop.itemName}</TableCell>
                                                            <TableCell className="text-right font-bold text-green-600">+${prop.commissionAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        )}
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}
