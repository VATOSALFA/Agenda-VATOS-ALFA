'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Loader2, TrendingUp, TrendingDown, DollarSign, Download } from 'lucide-react';
import { AddDepositoModal } from '@/components/finanzas/add-deposito-modal';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Sale, Egreso, Profesional, Service, Product, User } from '@/lib/types';
import { Timestamp, collection, query, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Define brand colors based on user customization
const COLORS = {
    primary: '#202A49',
    secondary: '#314177',
    accent: '#C9C9C9'
};

const ResumenGeneralItem = ({ label, children, amount, isBold, isPrimary, className, fractionDigits = 2 }: { label: string, children?: React.ReactNode, amount: number, isBold?: boolean, isPrimary?: boolean, className?: string, fractionDigits?: number }) => (
    <div className={cn("flex justify-between items-center text-base py-2 border-b last:border-0", className)}>
        <div className="flex items-center gap-2">
            <span className={cn(isBold && 'font-semibold', isPrimary && 'text-primary')}>{label}</span>
            {children}
        </div>
        <span className={cn(isBold && 'font-bold', isPrimary && 'text-primary font-extrabold')}>{`$${amount.toLocaleString('es-MX', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })}`}</span>
    </div>
);


export default function FinanzasResumenPage() {
    const [isDepositoModalOpen, setIsDepositoModalOpen] = useState(false);
    const [year, setYear] = useState(new Date().getFullYear()); // Dynamic year state

    // Generate array of years starting from 2025 + 10 years
    const startYear = 2025;
    const years = Array.from({ length: 11 }, (_, i) => startYear + i);

    const [monthlyAdjustments, setMonthlyAdjustments] = useState<Record<string, {
        adminCommissions?: Record<string, { type: 'fixed' | 'percentage', value: number }>,
        adminProductCommissions?: Record<string, { type: 'fixed' | 'percentage', value: number }>
    }>>({});

    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas');
    const { data: egresos, loading: egresosLoading } = useFirestoreQuery<Egreso>('egresos');
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
    const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');
    const { data: users, loading: usersLoading } = useFirestoreQuery<User>('usuarios');

    // Fetch monthly adjustments for the selected year
    useEffect(() => {
        if (!db) return;
        const fetchAdjustments = async () => {
            try {
                const q = query(collection(db, 'finanzas_mensuales'));
                const snapshot = await getDocs(q);
                const data: Record<string, any> = {};
                snapshot.forEach(doc => {
                    // Filter by selected year in ID (e.g., 'enero_2026')
                    if (doc.id.includes(String(year))) {
                        const [mName] = doc.id.split('_');
                        data[mName] = doc.data();
                    }
                });
                setMonthlyAdjustments(data);
            } catch (e) {
                console.error("Error fetching adjustments", e);
            }
        };
        fetchAdjustments();
    }, [year]);

    const isLoading = salesLoading || egresosLoading || professionalsLoading || servicesLoading || productsLoading || usersLoading;

    const yearlyData = useMemo(() => {
        if (isLoading) return [];

        const professionalMap = new Map(professionals.map(p => [p.id, p]));
        const productMap = new Map(products.map(p => [p.id, p]));

        const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        const monthShortNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

        // Initialize monthly data structure
        const monthlyData: Record<string, {
            month: string,
            monthShort: string,
            monthFullName: string,
            ingresosServicios: number,
            ventaProductos: number,
            reinversion: number,
            comisionProfesionalesProductos: number,
            egresosTotalDB: number,
            egresosServicios: number,
            utilidadServiciosSubtotal: number,
            utilidadProductosSubtotal: number,
            adminCommissionsService: Record<string, number>,
            adminCommissionsProduct: Record<string, number>,
            utilidadNetaServicios: number,
            utilidadNetaProductos: number,
            rendimiento: number,
        }> = {};

        monthNames.forEach((name, index) => {
            monthlyData[name] = {
                month: name,
                monthShort: monthShortNames[index],
                monthFullName: name.charAt(0).toUpperCase() + name.slice(1),
                ingresosServicios: 0,
                ventaProductos: 0,
                reinversion: 0,
                comisionProfesionalesProductos: 0,
                egresosTotalDB: 0,
                egresosServicios: 0,
                utilidadServiciosSubtotal: 0,
                utilidadProductosSubtotal: 0,
                adminCommissionsService: {},
                adminCommissionsProduct: {},
                utilidadNetaServicios: 0,
                utilidadNetaProductos: 0,
                rendimiento: 0,
            };
        });

        // 1. Process Sales (Servicios & Productos)
        sales.forEach(sale => {
            const saleDate = sale.fecha_hora_venta.toDate();
            // Filter by selected year
            if (saleDate.getFullYear() !== year) return;

            const monthIndex = saleDate.getMonth();
            const monthName = monthNames[monthIndex];

            if (!monthlyData[monthName]) return; // Safety check

            const saleTotal = sale.total || 1;
            const realPaid = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                ? sale.monto_pagado_real
                : (sale.total || 0);
            const ratio = realPaid / saleTotal;

            sale.items?.forEach(item => {
                const itemSubtotal = item.subtotal || ((item.precio || 0) * item.cantidad) || 0;
                const itemDiscount = item.descuento?.monto || 0;
                const finalItemPrice = (itemSubtotal - itemDiscount) * ratio;

                if (item.tipo === 'servicio') {
                    monthlyData[monthName].ingresosServicios += finalItemPrice;
                } else if (item.tipo === 'producto') {
                    monthlyData[monthName].ventaProductos += finalItemPrice;

                    // Reinversion
                    const product = productMap.get(item.id);
                    if (product && product.purchase_cost) {
                        monthlyData[monthName].reinversion += product.purchase_cost * item.cantidad;
                    }

                    // Comision Profesional
                    if (item.barbero_id && product) {
                        const professional = professionalMap.get(item.barbero_id);
                        if (professional) {
                            const commissionConfig = professional.comisionesPorProducto?.[product.id] || product.commission || professional.defaultCommission;
                            if (commissionConfig) {
                                monthlyData[monthName].comisionProfesionalesProductos += commissionConfig.type === '%'
                                    ? finalItemPrice * (commissionConfig.value / 100)
                                    : commissionConfig.value;
                            }
                        }
                    }
                }
            });
        });

        // 2. Process Egresos
        const allEgresos = [
            ...egresos.map(e => ({ ...e, fecha: e.fecha instanceof Timestamp ? e.fecha.toDate() : e.fecha })),
        ];

        allEgresos.forEach(egreso => {
            // Filter by selected year
            if (egreso.fecha.getFullYear() !== year) return;

            // Exclude cash management entries that are not actual expenses
            const concepto = egreso.concepto?.toLowerCase() || '';
            const comentarios = egreso.comentarios?.toLowerCase() || '';

            if (concepto.includes('entrega de efectivo') ||
                concepto.includes('cierre de caja') ||
                concepto.includes('retiro de efectivo')) {
                return;
            }

            const monthIndex = egreso.fecha.getMonth();
            const monthName = monthNames[monthIndex];
            if (monthlyData[monthName]) {
                monthlyData[monthName].egresosTotalDB += egreso.monto;
            }
        });

        // 3. Calculate Utilities and Admin Commissions per month
        const localAdmins = users.filter(u => u.role === 'Administrador local');

        Object.values(monthlyData).forEach(data => {
            // Product Calculations
            data.utilidadProductosSubtotal = data.ventaProductos - data.reinversion - data.comisionProfesionalesProductos;

            // Service Calculations
            // Egresos 'Servicios' excludes product commissions (assuming they were paid out and recorded in egresos)
            data.egresosServicios = data.egresosTotalDB - data.comisionProfesionalesProductos;
            data.utilidadServiciosSubtotal = data.ingresosServicios - data.egresosServicios;

            // Admin Commissions
            let totalAdminCommService = 0;
            let totalAdminCommProduct = 0;

            localAdmins.forEach(admin => {
                // --- Service Commission ---
                const serviceAdj = monthlyAdjustments[data.month]?.adminCommissions?.[admin.id];
                const serviceType = serviceAdj ? serviceAdj.type : (admin.commissionType || 'none');
                const serviceValue = serviceAdj ? serviceAdj.value : (admin.commissionValue || 0);

                let commService = 0;
                if (serviceType === 'fixed') commService = serviceValue;
                else if (serviceType === 'percentage') commService = data.utilidadServiciosSubtotal * (serviceValue / 100);

                if (commService > 0) {
                    data.adminCommissionsService[admin.id] = commService;
                    totalAdminCommService += commService;
                }

                // --- Product Commission ---
                const productAdj = monthlyAdjustments[data.month]?.adminProductCommissions?.[admin.id];
                // Products usually don't have default commission in User object yet, but we check adjustments mostly
                const productType = productAdj ? productAdj.type : 'none';
                const productValue = productAdj ? productAdj.value : 0;

                let commProduct = 0;
                if (productType === 'fixed') commProduct = productValue;
                else if (productType === 'percentage') commProduct = data.utilidadProductosSubtotal * (productValue / 100);

                if (commProduct > 0) {
                    data.adminCommissionsProduct[admin.id] = commProduct;
                    totalAdminCommProduct += commProduct;
                }
            });

            data.utilidadNetaServicios = data.utilidadServiciosSubtotal - totalAdminCommService;
            data.utilidadNetaProductos = data.utilidadProductosSubtotal - totalAdminCommProduct;

            // Rendimiento (based on Total Revenue)
            const totalRevenue = data.ingresosServicios + data.ventaProductos;
            // Operating Margin = (Total Revenue - Total Cost) / Total Revenue
            // Total Cost = EgresosServicios + Reinversion + ComisionProfProductos + AdminCommissions
            // Net Profit = UtilidadNetaServicios + UtilidadNetaProductos

            const totalNetProfit = data.utilidadNetaServicios + data.utilidadNetaProductos;

            data.rendimiento = totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0;
        });

        return Object.values(monthlyData);
    }, [isLoading, sales, egresos, professionals, products, users, monthlyAdjustments, year]);

    // Aggregate Annual Data
    const annualTotals = useMemo(() => {
        const totals = {
            ingresosServicios: 0,
            egresosServicios: 0,
            utilidadServiciosSubtotal: 0,
            utilidadNetaServicios: 0,

            ventaProductos: 0,
            reinversion: 0,
            comisionProfesionalesProductos: 0,
            utilidadProductosSubtotal: 0,
            utilidadNetaProductos: 0,

            adminCommissionsService: {} as Record<string, number>,
            adminCommissionsProduct: {} as Record<string, number>,
        };

        yearlyData.forEach(month => {
            totals.ingresosServicios += month.ingresosServicios;
            totals.egresosServicios += month.egresosServicios;
            totals.utilidadServiciosSubtotal += month.utilidadServiciosSubtotal;
            totals.utilidadNetaServicios += month.utilidadNetaServicios;

            totals.ventaProductos += month.ventaProductos;
            totals.reinversion += month.reinversion;
            totals.comisionProfesionalesProductos += month.comisionProfesionalesProductos;
            totals.utilidadProductosSubtotal += month.utilidadProductosSubtotal;
            totals.utilidadNetaProductos += month.utilidadNetaProductos;

            // Aggregate Admin Commissions
            Object.entries(month.adminCommissionsService).forEach(([id, amount]) => {
                totals.adminCommissionsService[id] = (totals.adminCommissionsService[id] || 0) + amount;
            });
            Object.entries(month.adminCommissionsProduct).forEach(([id, amount]) => {
                totals.adminCommissionsProduct[id] = (totals.adminCommissionsProduct[id] || 0) + amount;
            });
        });

        return totals;
    }, [yearlyData]);

    const firstHalfYear = yearlyData.slice(0, 6);
    const secondHalfYear = yearlyData.slice(6, 12);

    // Chart Data Preparation
    const chartData = yearlyData.map(d => ({
        ...d,
        totalIngresos: d.ingresosServicios + d.ventaProductos,
        totalUtilidad: d.utilidadNetaServicios + d.utilidadNetaProductos
    }));

    const handleDownloadReport = () => {
        const headers = [
            "Mes",
            "Ingresos Servicios",
            "Venta Productos",
            "Reinversión",
            "Comisión Productos",
            "Egresos Operativos",
            "Utilidad Servicios",
            "Utilidad Productos",
            "Utilidad Neta Total",
            "Rendimiento %"
        ];

        const csvRows = [
            headers.join(','),
            ...yearlyData.map(row => [
                row.monthFullName,
                row.ingresosServicios.toFixed(2),
                row.ventaProductos.toFixed(2),
                row.reinversion.toFixed(2),
                row.comisionProfesionalesProductos.toFixed(2),
                row.egresosServicios.toFixed(2),
                row.utilidadNetaServicios.toFixed(2),
                row.utilidadNetaProductos.toFixed(2),
                (row.utilidadNetaServicios + row.utilidadNetaProductos).toFixed(2),
                row.rendimiento.toFixed(2)
            ].join(','))
        ];

        const csvContent = "data:text/csv;charset=utf-8," + csvRows.join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `resumen_anual_${year}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <>
            <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-bold tracking-tight">Resumen anual</h2>
                    <div className="flex items-center gap-2">
                        <Select value={String(year)} onValueChange={(val) => setYear(Number(val))}>
                            <SelectTrigger className="w-[100px]">
                                <SelectValue placeholder="Año" />
                            </SelectTrigger>
                            <SelectContent>
                                {years.map((y) => (
                                    <SelectItem key={y} value={String(y)}>
                                        {y}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button variant="outline" size="icon" onClick={handleDownloadReport} title="Descargar reporte anual">
                            <Download className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {/* Primary Color Card */}
                    <Card style={{ backgroundColor: COLORS.primary }} className="text-white border-none shadow-lg">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-white/90">Ingresos Totales (Año)</CardTitle>
                            <DollarSign className="h-4 w-4 text-white/80" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">${(annualTotals.ingresosServicios + annualTotals.ventaProductos).toLocaleString('es-MX')}</div>
                            <p className="text-xs text-white/70">Productos + Servicios</p>
                        </CardContent>
                    </Card>

                    {/* Secondary Color Card */}
                    <Card style={{ backgroundColor: COLORS.secondary }} className="text-white border-none shadow-lg">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-white/90">Utilidad Neta Total</CardTitle>
                            <TrendingUp className="h-4 w-4 text-white/80" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">${(annualTotals.utilidadNetaServicios + annualTotals.utilidadNetaProductos).toLocaleString('es-MX')}</div>
                            <p className="text-xs text-white/70">Después de todos los gastos</p>
                        </CardContent>
                    </Card>

                    {/* Accent Color Card */}
                    <Card style={{ backgroundColor: COLORS.accent }} className="text-slate-900 border-none shadow-lg">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-slate-800">Margen Promedio</CardTitle>
                            <TrendingUp className="h-4 w-4 text-slate-700" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-slate-900">
                                {((annualTotals.utilidadNetaServicios + annualTotals.utilidadNetaProductos) / (annualTotals.ingresosServicios + annualTotals.ventaProductos || 1) * 100).toFixed(1)}%
                            </div>
                            <p className="text-xs text-slate-700">Rendimiento anual</p>
                        </CardContent>
                    </Card>
                </div>


                {/* Detailed Summaries */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-12">
                    {/* Services Summary */}
                    <Card className="lg:col-span-4 shadow-md bg-card/50">
                        <CardHeader className="pb-2">
                            <CardTitle>Resumen de servicios</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1 text-sm">
                            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                                <>
                                    <ResumenGeneralItem label="Ingreso total" amount={annualTotals.ingresosServicios} fractionDigits={2} />
                                    <ResumenGeneralItem label="Egreso total" amount={annualTotals.egresosServicios} fractionDigits={2} />
                                    <ResumenGeneralItem label="Subtotal de utilidad" amount={annualTotals.utilidadServiciosSubtotal} isBold fractionDigits={2} />

                                    {users?.filter(u => u.role === 'Administrador local').map(admin => {
                                        const amount = annualTotals.adminCommissionsService[admin.id] || 0;
                                        const pct = annualTotals.utilidadServiciosSubtotal > 0 ? (amount / annualTotals.utilidadServiciosSubtotal) * 100 : 0;
                                        return (
                                            <ResumenGeneralItem
                                                key={admin.id}
                                                label={`Comisión ${admin.name} (Avg ${pct.toFixed(1)}%)`}
                                                amount={amount}
                                                fractionDigits={2}
                                                className="text-muted-foreground"
                                            />
                                        );
                                    })}

                                    <ResumenGeneralItem label="Utilidad neta" amount={annualTotals.utilidadNetaServicios} isPrimary isBold className="text-xl pt-4 mt-2 border-t" fractionDigits={2} />
                                </>
                            )}
                        </CardContent>
                    </Card>

                    {/* Products Summary */}
                    <Card className="lg:col-span-4 shadow-md bg-card/50">
                        <CardHeader className="pb-2">
                            <CardTitle>Resumen de productos</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1 text-sm">
                            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                                <>
                                    <ResumenGeneralItem label="Ingreso total" amount={annualTotals.ventaProductos} fractionDigits={2} />
                                    <ResumenGeneralItem label="Reinversión" amount={-annualTotals.reinversion} className="text-muted-foreground" fractionDigits={2} />
                                    <ResumenGeneralItem label="Comisión de profesionales" amount={-annualTotals.comisionProfesionalesProductos} className="text-muted-foreground" fractionDigits={2} />
                                    <ResumenGeneralItem label="Subtotal de utilidad" amount={annualTotals.utilidadProductosSubtotal} isBold fractionDigits={2} />

                                    {users?.filter(u => u.role === 'Administrador local').map(admin => {
                                        const amount = annualTotals.adminCommissionsProduct[admin.id] || 0;
                                        const pct = annualTotals.utilidadProductosSubtotal > 0 ? (amount / annualTotals.utilidadProductosSubtotal) * 100 : 0;
                                        return (
                                            <ResumenGeneralItem
                                                key={admin.id}
                                                label={`Comisión ${admin.name} (Avg ${pct.toFixed(1)}%)`}
                                                amount={amount}
                                                fractionDigits={2}
                                                className="text-muted-foreground"
                                            />
                                        );
                                    })}

                                    <ResumenGeneralItem label="Utilidad neta" amount={annualTotals.utilidadNetaProductos} isPrimary isBold className="text-xl pt-4 mt-2 border-t" fractionDigits={2} />
                                </>
                            )}
                        </CardContent>
                    </Card>

                    {/* Annual Yield Table */}
                    <Card className="lg:col-span-4 shadow-md bg-card/50">
                        <CardHeader className="pb-2">
                            <CardTitle>Rendimiento mensual</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="py-2 h-8">Mes</TableHead>
                                        <TableHead className="text-right py-2 h-8">%</TableHead>
                                        <TableHead className="py-2 h-8">Mes</TableHead>
                                        <TableHead className="text-right py-2 h-8">%</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={4} className="text-center h-24"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                                    ) : (
                                        firstHalfYear.map((data, index) => (
                                            <TableRow key={data.month} className="hover:bg-muted/50">
                                                <TableCell className="capitalize py-2 font-medium">{data.monthShort}</TableCell>
                                                <TableCell className="text-right py-2 font-bold text-primary">{data.rendimiento.toFixed(1)}%</TableCell>
                                                <TableCell className="capitalize py-2 font-medium">{secondHalfYear[index]?.monthShort}</TableCell>
                                                <TableCell className="text-right py-2 font-bold text-primary">{secondHalfYear[index]?.rendimiento.toFixed(1)}%</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                {/* Charts Area */}
                <div className="grid gap-6 md:grid-cols-7">
                    {/* Tendencia Annual - Accent Background */}
                    <Card className="col-span-4 shadow-lg border-none" style={{ backgroundColor: COLORS.accent }}>
                        <CardHeader>
                            <CardTitle style={{ color: COLORS.primary }}>Tendencia anual: Ingresos vs Utilidad Total</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[350px] w-full pl-0">
                            {isLoading ? <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} stroke="#555" />
                                        <XAxis dataKey="monthShort" tick={{ fontSize: 12, fill: '#333' }} />
                                        <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: '#333' }} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                                            formatter={(value: number) => [`$${value.toLocaleString('es-MX')}`, '']}
                                        />
                                        <Legend wrapperStyle={{ paddingTop: '10px' }} />
                                        <Line type="monotone" dataKey="totalIngresos" name="Ingresos Totales" stroke={COLORS.primary} strokeWidth={3} dot={{ r: 4, fill: COLORS.primary }} activeDot={{ r: 6 }} />
                                        <Line type="monotone" dataKey="totalUtilidad" name="Utilidad Neta" stroke={COLORS.secondary} strokeWidth={3} dot={{ r: 4, fill: COLORS.secondary }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>

                    {/* Composition - Accent Background */}
                    <Card className="col-span-3 shadow-lg border-none" style={{ backgroundColor: COLORS.accent }}>
                        <CardHeader>
                            <CardTitle style={{ color: COLORS.primary }}>Composición de Ingresos</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[350px] w-full pl-0">
                            {isLoading ? <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} stroke="#555" vertical={false} />
                                        <XAxis dataKey="monthShort" tick={{ fontSize: 12, fill: '#333' }} />
                                        <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: '#333' }} />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(0,0,0,0.1)' }}
                                            contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                                            formatter={(value: number) => [`$${value.toLocaleString('es-MX')}`, '']}
                                        />
                                        <Legend wrapperStyle={{ paddingTop: '10px' }} />
                                        <Bar dataKey="ingresosServicios" name="Servicios" stackId="a" fill={COLORS.primary} radius={[0, 0, 0, 0]} />
                                        <Bar dataKey="ventaProductos" name="Productos" stackId="a" fill={COLORS.secondary} radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
            <AddDepositoModal
                isOpen={isDepositoModalOpen}
                onOpenChange={setIsDepositoModalOpen}
            />
        </>
    );
}
