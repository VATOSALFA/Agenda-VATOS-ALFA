'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Loader2, TrendingUp, DollarSign, Download, Percent } from 'lucide-react';
import { AddDepositoModal } from '@/components/finanzas/add-deposito-modal';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Sale, Egreso, Profesional, Service, Product, User } from '@/lib/types';
import { Timestamp, collection, query, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

const tooltipContentStyle = {
    backgroundColor: '#151b2e',
    borderColor: '#3B82F6',
    borderWidth: 2,
    borderRadius: '12px',
    color: '#FFFFFF',
    boxShadow: '0 10px 30px rgba(59,130,246,0.18)',
    fontSize: '12px'
};

const ResumenGeneralItem = ({ 
    label, 
    children, 
    amount, 
    isBold, 
    isPrimary, 
    className, 
    fractionDigits = 2 
}: { 
    label: string, 
    children?: React.ReactNode, 
    amount: number, 
    isBold?: boolean, 
    isPrimary?: boolean, 
    className?: string, 
    fractionDigits?: number 
}) => {
    const isNegative = amount < 0;
    return (
        <div className={cn("flex justify-between items-center text-xs sm:text-sm py-2 border-b border-border/40 last:border-0", className)}>
            <div className="flex items-center gap-2">
                <span className={cn(isBold ? 'font-semibold text-foreground' : 'text-muted-foreground', isPrimary && 'text-blue-400 font-bold')}>{label}</span>
                {children}
            </div>
            <span className={cn(
                "font-semibold text-xs sm:text-sm",
                isBold ? 'font-bold text-foreground' : 'text-foreground',
                isNegative && 'text-red-400',
                isPrimary && 'text-blue-400 font-extrabold text-sm sm:text-base'
            )}>
                {isNegative 
                    ? `-$${Math.abs(amount).toLocaleString('es-MX', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })}`
                    : `$${amount.toLocaleString('es-MX', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })}`
                }
            </span>
        </div>
    );
};

export default function FinanzasResumenPage() {
    const { toast } = useToast();
    const [isDepositoModalOpen, setIsDepositoModalOpen] = useState(false);
    const [year, setYear] = useState(new Date().getFullYear());

    // Generar array de años desde 2024
    const startYear = 2024;
    const currentYearNow = new Date().getFullYear();
    const years = Array.from({ length: (currentYearNow + 1) - startYear + 1 }, (_, i) => startYear + i);

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

    // Cargar ajustes mensuales para el año seleccionado
    useEffect(() => {
        if (!db) return;
        const fetchAdjustments = async () => {
            try {
                const q = query(collection(db, 'finanzas_mensuales'));
                const snapshot = await getDocs(q);
                const data: Record<string, any> = {};
                snapshot.forEach(doc => {
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
        if (isLoading || !sales || !egresos || !professionals || !products) return [];

        const professionalMap = new Map(professionals.map(p => [p.id, p]));
        const productMap = new Map(products.map(p => [p.id, p]));

        const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        const monthShortNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

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

        // 1. Procesar Ventas
        sales.forEach(sale => {
            const saleDate = sale.fecha_hora_venta?.toDate ? sale.fecha_hora_venta.toDate() : new Date();
            if (saleDate.getFullYear() !== year) return;

            const monthIndex = saleDate.getMonth();
            const monthName = monthNames[monthIndex];

            if (!monthlyData[monthName]) return;

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

                    // Reinversión
                    const product = productMap.get(item.id);
                    if (product && product.purchase_cost) {
                        monthlyData[monthName].reinversion += product.purchase_cost * item.cantidad;
                    }

                    // Comisión Profesional
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

        // 2. Procesar Egresos
        const allEgresos = [
            ...egresos.map(e => ({ ...e, fecha: e.fecha instanceof Timestamp ? e.fecha.toDate() : e.fecha })),
        ];

        allEgresos.forEach(egreso => {
            if (egreso.fecha.getFullYear() !== year) return;

            const concepto = egreso.concepto?.toLowerCase() || '';
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

        // 3. Calcular Utilidades y Comisiones
        const localAdmins = (users || []).filter(u => u.role === 'Administrador local');

        Object.values(monthlyData).forEach(data => {
            data.utilidadProductosSubtotal = data.ventaProductos - data.reinversion - data.comisionProfesionalesProductos;
            data.egresosServicios = data.egresosTotalDB - data.comisionProfesionalesProductos;
            data.utilidadServiciosSubtotal = data.ingresosServicios - data.egresosServicios;

            let totalAdminCommService = 0;
            let totalAdminCommProduct = 0;

            localAdmins.forEach(admin => {
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

                const productAdj = monthlyAdjustments[data.month]?.adminProductCommissions?.[admin.id];
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

            const totalRevenue = data.ingresosServicios + data.ventaProductos;
            const totalNetProfit = data.utilidadNetaServicios + data.utilidadNetaProductos;
            data.rendimiento = totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0;
        });

        return Object.values(monthlyData);
    }, [isLoading, sales, egresos, professionals, products, users, monthlyAdjustments, year]);

    // Totales Anuales
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

    const chartData = yearlyData.map(d => ({
        ...d,
        totalIngresos: d.ingresosServicios + d.ventaProductos,
        totalUtilidad: d.utilidadNetaServicios + d.utilidadNetaProductos
    }));

    const handleDownloadReport = () => {
        if (!yearlyData || yearlyData.length === 0) {
            toast({
                variant: "destructive",
                title: "Sin datos",
                description: "No hay registros anuales disponibles para exportar.",
            });
            return;
        }

        const monthlyRows = yearlyData.map(row => {
            const totalIngresos = row.ingresosServicios + row.ventaProductos;
            const totalUtilidad = row.utilidadNetaServicios + row.utilidadNetaProductos;

            return {
                'Mes': row.monthFullName,
                'Ingresos Servicios': row.ingresosServicios,
                'Venta Productos': row.ventaProductos,
                'Ingresos Totales': totalIngresos,
                'Reinversión Productos': row.reinversion,
                'Comisión Profesional Productos': row.comisionProfesionalesProductos,
                'Egresos Operativos Servicios': row.egresosServicios,
                'Subtotal Utilidad Servicios': row.utilidadServiciosSubtotal,
                'Subtotal Utilidad Productos': row.utilidadProductosSubtotal,
                'Utilidad Neta Servicios': row.utilidadNetaServicios,
                'Utilidad Neta Productos': row.utilidadNetaProductos,
                'Utilidad Neta Total': totalUtilidad,
                'Rendimiento (%)': `${row.rendimiento.toFixed(1)}%`
            };
        });

        const totalIngresosAnual = annualTotals.ingresosServicios + annualTotals.ventaProductos;
        const totalUtilidadAnual = annualTotals.utilidadNetaServicios + annualTotals.utilidadNetaProductos;
        const margenAnual = totalIngresosAnual > 0 ? (totalUtilidadAnual / totalIngresosAnual) * 100 : 0;

        const summaryRows = [
            { 'Concepto': 'Ejercicio Fiscal (Año)', 'Valor': year },
            { 'Concepto': 'Ingresos Servicios', 'Valor': annualTotals.ingresosServicios },
            { 'Concepto': 'Venta Productos', 'Valor': annualTotals.ventaProductos },
            { 'Concepto': 'Ingresos Totales', 'Valor': totalIngresosAnual },
            { 'Concepto': 'Egresos Servicios', 'Valor': annualTotals.egresosServicios },
            { 'Concepto': 'Reinversión Productos', 'Valor': annualTotals.reinversion },
            { 'Concepto': 'Comisiones Productos', 'Valor': annualTotals.comisionProfesionalesProductos },
            { 'Concepto': 'Utilidad Neta Servicios', 'Valor': annualTotals.utilidadNetaServicios },
            { 'Concepto': 'Utilidad Neta Productos', 'Valor': annualTotals.utilidadNetaProductos },
            { 'Concepto': 'Utilidad Neta Total', 'Valor': totalUtilidadAnual },
            { 'Concepto': 'Margen Promedio Anual', 'Valor': `${margenAnual.toFixed(1)}%` },
        ];

        const rendimientoRows = yearlyData.map(d => ({
            'Mes': d.monthFullName,
            'Rendimiento': `${d.rendimiento.toFixed(1)}%`,
            'Ingresos': d.ingresosServicios + d.ventaProductos,
            'Utilidad Neta': d.utilidadNetaServicios + d.utilidadNetaProductos
        }));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyRows), "Desglose Mensual");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Resumen Anual");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rendimientoRows), "Rendimiento");

        XLSX.writeFile(wb, `Resumen_Anual_${year}.xlsx`);

        toast({
            title: "Reporte generado",
            description: `Se descargó el reporte financiero anual ${year} en formato Excel.`,
        });
    };

    return (
        <>
            <div className="flex-1 space-y-4 sm:space-y-6 p-3 sm:p-6 md:p-8 pt-4 sm:pt-6">
                {/* Header Oficial con Bare Icon de Descarga */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                            Resumen anual
                        </h1>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 hidden sm:block">
                            Desglose financiero consolidado de ingresos, egresos y utilidad por ejercicio fiscal.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <Select value={String(year)} onValueChange={(val) => setYear(Number(val))}>
                            <SelectTrigger className="w-[105px] h-9 rounded-xl border-border/60 text-xs font-semibold bg-card">
                                <SelectValue placeholder="Año" />
                            </SelectTrigger>
                            <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1">
                                {years.map((y) => (
                                    <SelectItem key={y} value={String(y)} className="text-xs rounded-lg text-white hover:text-white focus:text-white focus:bg-white/10 cursor-pointer">
                                        {y}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <button 
                            type="button"
                            className="text-slate-400 hover:text-foreground transition-colors p-1" 
                            onClick={handleDownloadReport}
                            title="Descargar reporte anual en Excel"
                        >
                            <Download className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* KPI Cards Corporativas */}
                <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                    {/* Ingresos Totales */}
                    <Card className="rounded-2xl border border-border/60 shadow-sm bg-gradient-to-br from-[#10172b] via-[#18223c] to-[#0f1627] text-white overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 border-b border-slate-800/80">
                            <CardTitle className="text-xs sm:text-sm font-medium text-slate-300">Ingresos Totales (Año)</CardTitle>
                            <DollarSign className="h-4 w-4 text-[#C5A880]" />
                        </CardHeader>
                        <CardContent className="p-4 pt-3">
                            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                                ${(annualTotals.ingresosServicios + annualTotals.ventaProductos).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <p className="text-xs text-slate-400 mt-1">Productos + Servicios</p>
                        </CardContent>
                    </Card>

                    {/* Utilidad Neta Total */}
                    <Card className="rounded-2xl border border-border/60 shadow-sm bg-gradient-to-br from-[#10172b] via-[#1c2847] to-[#12192d] text-white overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 border-b border-slate-800/80">
                            <CardTitle className="text-xs sm:text-sm font-medium text-slate-300">Utilidad Neta Total</CardTitle>
                            <TrendingUp className="h-4 w-4 text-blue-400" />
                        </CardHeader>
                        <CardContent className="p-4 pt-3">
                            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-blue-400">
                                ${(annualTotals.utilidadNetaServicios + annualTotals.utilidadNetaProductos).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <p className="text-xs text-slate-400 mt-1">Después de todos los gastos</p>
                        </CardContent>
                    </Card>

                    {/* Margen Promedio */}
                    <Card className="rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 border-b border-border/40">
                            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Margen Promedio</CardTitle>
                            <Percent className="h-4 w-4 text-slate-400" />
                        </CardHeader>
                        <CardContent className="p-4 pt-3">
                            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                                {((annualTotals.utilidadNetaServicios + annualTotals.utilidadNetaProductos) / (annualTotals.ingresosServicios + annualTotals.ventaProductos || 1) * 100).toFixed(1)}%
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Rendimiento anual</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Resúmenes Detallados y Rendimiento Mensual */}
                <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-12">
                    {/* Resumen de servicios */}
                    <Card className="lg:col-span-4 rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                        <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/40">
                            <CardTitle className="text-base font-semibold">Resumen de servicios</CardTitle>
                            <CardDescription className="text-xs">Consolidado operativo de citas y servicios.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 sm:p-5 pt-2">
                            {isLoading ? (
                                <div className="h-48 flex items-center justify-center">
                                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                                </div>
                            ) : (
                                <div className="space-y-0.5">
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

                                    <ResumenGeneralItem 
                                        label="Utilidad neta" 
                                        amount={annualTotals.utilidadNetaServicios} 
                                        isPrimary 
                                        isBold 
                                        className="pt-3 mt-2 border-t border-border/60" 
                                        fractionDigits={2} 
                                    />
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Resumen de productos */}
                    <Card className="lg:col-span-4 rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                        <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/40">
                            <CardTitle className="text-base font-semibold">Resumen de productos</CardTitle>
                            <CardDescription className="text-xs">Ventas en mostrador, costos y comisiones.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 sm:p-5 pt-2">
                            {isLoading ? (
                                <div className="h-48 flex items-center justify-center">
                                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                                </div>
                            ) : (
                                <div className="space-y-0.5">
                                    <ResumenGeneralItem label="Ingreso total" amount={annualTotals.ventaProductos} fractionDigits={2} />
                                    <ResumenGeneralItem label="Reinversión" amount={-annualTotals.reinversion} fractionDigits={2} />
                                    <ResumenGeneralItem label="Comisión de profesionales" amount={-annualTotals.comisionProfesionalesProductos} fractionDigits={2} />
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

                                    <ResumenGeneralItem 
                                        label="Utilidad neta" 
                                        amount={annualTotals.utilidadNetaProductos} 
                                        isPrimary 
                                        isBold 
                                        className="pt-3 mt-2 border-t border-border/60" 
                                        fractionDigits={2} 
                                    />
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Rendimiento mensual (Tabla Compacta Alta Densidad) */}
                    <Card className="lg:col-span-4 rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                        <CardHeader className="p-4 sm:p-5 pb-3 border-b border-border/40">
                            <CardTitle className="text-base font-semibold">Rendimiento mensual</CardTitle>
                            <CardDescription className="text-xs">Margen de utilidad neto por mes.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
                                        <TableHead className="py-1 px-3 text-xs font-semibold">Mes</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-right">%</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold">Mes</TableHead>
                                        <TableHead className="py-1 px-3 text-xs font-semibold text-right">%</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center h-24">
                                                <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        firstHalfYear.map((data, index) => (
                                            <TableRow key={data.month} className="h-8 hover:bg-muted/30 transition-colors border-b border-border/40">
                                                <TableCell className="capitalize py-1 px-3 text-xs font-medium text-foreground">{data.monthShort}</TableCell>
                                                <TableCell className="text-right py-1 px-3 text-xs font-bold text-blue-400">{data.rendimiento.toFixed(1)}%</TableCell>
                                                <TableCell className="capitalize py-1 px-3 text-xs font-medium text-foreground">{secondHalfYear[index]?.monthShort}</TableCell>
                                                <TableCell className="text-right py-1 px-3 text-xs font-bold text-blue-400">{secondHalfYear[index]?.rendimiento.toFixed(1)}%</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                {/* Área de Gráficas Corporativas */}
                <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-7">
                    {/* Tendencia Anual: Ingresos vs Utilidad Total */}
                    <Card className="lg:col-span-4 rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                        <CardHeader className="p-4 sm:p-5 pb-2 border-b border-border/40">
                            <CardTitle className="text-base font-semibold text-foreground">Tendencia anual: Ingresos vs Utilidad Total</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[320px] sm:h-[350px] w-full p-2 sm:p-4">
                            {isLoading ? (
                                <div className="flex justify-center items-center h-full">
                                    <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.08)" />
                                        <XAxis dataKey="monthShort" tick={{ fontSize: 12, fill: '#94a3b8' }} stroke="rgba(255,255,255,0.1)" />
                                        <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: '#94a3b8' }} stroke="rgba(255,255,255,0.1)" />
                                        <Tooltip
                                            contentStyle={tooltipContentStyle}
                                            itemStyle={{ color: '#ffffff' }}
                                            labelStyle={{ color: '#94a3b8', fontWeight: 600 }}
                                            formatter={(value: number) => [`$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, '']}
                                        />
                                        <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                                        <Line type="monotone" dataKey="totalIngresos" name="Ingresos Totales" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 3, fill: '#3B82F6' }} activeDot={{ r: 5 }} />
                                        <Line type="monotone" dataKey="totalUtilidad" name="Utilidad Neta" stroke="#C5A880" strokeWidth={2.5} dot={{ r: 3, fill: '#C5A880' }} activeDot={{ r: 5 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>

                    {/* Composición de Ingresos */}
                    <Card className="lg:col-span-3 rounded-2xl border border-border/60 shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                        <CardHeader className="p-4 sm:p-5 pb-2 border-b border-border/40">
                            <CardTitle className="text-base font-semibold text-foreground">Composición de Ingresos</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[320px] sm:h-[350px] w-full p-2 sm:p-4">
                            {isLoading ? (
                                <div className="flex justify-center items-center h-full">
                                    <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.08)" />
                                        <XAxis dataKey="monthShort" tick={{ fontSize: 12, fill: '#94a3b8' }} stroke="rgba(255,255,255,0.1)" />
                                        <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 12, fill: '#94a3b8' }} stroke="rgba(255,255,255,0.1)" />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                            contentStyle={tooltipContentStyle}
                                            itemStyle={{ color: '#ffffff' }}
                                            labelStyle={{ color: '#94a3b8', fontWeight: 600 }}
                                            formatter={(value: number) => [`$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, '']}
                                        />
                                        <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                                        <Bar dataKey="ingresosServicios" name="Servicios" stackId="a" fill="#202A49" stroke="#3B82F6" strokeWidth={1} radius={[0, 0, 0, 0]} />
                                        <Bar dataKey="ventaProductos" name="Productos" stackId="a" fill="#3B82F6" radius={[4, 4, 0, 0]} />
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
