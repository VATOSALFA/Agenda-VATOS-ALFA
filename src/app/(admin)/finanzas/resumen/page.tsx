

'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Edit, Save, Loader2, TrendingDown, Mail } from 'lucide-react';
import { AddDepositoModal } from '@/components/finanzas/add-deposito-modal';
import { cn } from "@/lib/utils";
import { useFirestoreQuery } from '@/hooks/use-firestore';
import type { Sale, Egreso, Profesional, Service, Product, User } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Timestamp, where, getDocs, collection, query, orderBy, limit } from 'firebase/firestore';
import { db, functions, httpsCallable } from '@/lib/firebase-client';
import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

const ResumenGeneralItem = ({ label, children, amount, isBold, isPrimary, className, fractionDigits = 2 }: { label: string, children?: React.ReactNode, amount: number, isBold?: boolean, isPrimary?: boolean, className?: string, fractionDigits?: number }) => (
    <div className={cn("flex justify-between items-center text-lg py-2 border-b last:border-0", className)}>
        <div className="flex items-center gap-2">
            <span className={cn(isBold && 'font-semibold', isPrimary && 'text-primary')}>{label}</span>
            {children}
        </div>
        <span className={cn(isBold && 'font-bold', isPrimary && 'text-primary font-extrabold')}>{`$${amount.toLocaleString('es-MX', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })}`}</span>
    </div>
);


export default function FinanzasResumenPage() {
    const [isDepositoModalOpen, setIsDepositoModalOpen] = useState(false);
    const [monthlyAdjustments, setMonthlyAdjustments] = useState<Record<string, { adminCommissions?: Record<string, { type: 'fixed' | 'percentage', value: number }> }>>({});
    const [isResending, setIsResending] = useState(false);
    const { toast } = useToast();
    const currentYear = new Date().getFullYear();


    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas');
    const { data: egresos, loading: egresosLoading } = useFirestoreQuery<Egreso>('egresos');
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
    const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios');
    const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');
    const { data: users, loading: usersLoading } = useFirestoreQuery<User>('usuarios');



    // Fetch monthly adjustments for the year
    useEffect(() => {
        if (!db) return;
        const fetchAdjustments = async () => {
            // We can't query by field easily since we didn't add 'year' field explicitly, 
            // but we can query by ID range or just fetch all since it's small.
            // Best to just fetch all for now, the collection won't be huge yet.
            // Or construct IDs.
            const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
            const adjustments: Record<string, any> = {};

            for (const m of monthNames) {
                const docId = `${m}_${currentYear}`;
                // We could do a Promise.all getDoc but let's see. 
                // Actually onSnapshot is nice for realtime but maybe overkill for annual summary? 
                // User wants accuracy. Let's do getDocs(collection) and filter client side for matches.
                // Actually better:
            }

            try {
                const q = query(collection(db, 'finanzas_mensuales')); // Fetch all for now
                const snapshot = await getDocs(q);
                const data: Record<string, any> = {};
                snapshot.forEach(doc => {
                    if (doc.id.includes(String(currentYear))) {
                        // Map 'enero_2026' -> 'enero'? No, we need to key by month name.
                        // doc.id is like 'enero_2026'
                        // Extract month name part
                        const [mName] = doc.id.split('_');
                        // Map to Index? Or just keep key 'enero'.
                        data[mName] = doc.data();
                    }
                });
                setMonthlyAdjustments(data);
            } catch (e) {
                console.error("Error fetching adjustments", e);
            }
        };
        fetchAdjustments();
    }, [currentYear]);

    const handleResendSummary = async () => {
        setIsResending(true);
        try {
            const triggerSummary = httpsCallable(functions, 'triggerDailyAgendaSummary');

            // Calculate date for TODAY (Production behavior)
            const today = new Date();
            const options: Intl.DateTimeFormatOptions = { timeZone: "America/Mexico_City", year: 'numeric', month: '2-digit', day: '2-digit' };
            const parts = new Intl.DateTimeFormat('es-MX', options).formatToParts(today);
            const day = parts.find(p => p.type === 'day')?.value || '';
            const month = parts.find(p => p.type === 'month')?.value || '';
            const year = parts.find(p => p.type === 'year')?.value || '';
            const todayStr = `${year}-${month}-${day}`; // YYYY-MM-DD

            console.log("Requesting summary for:", todayStr);

            // Pass the date explicitly
            const result: any = await triggerSummary({ date: todayStr });
            console.log("Summary Result:", result.data);

            toast({
                title: "Resumen enviado (HOY)",
                description: `Reservas: ${result.data?.results?.reservationsFound || 0}. Detalles: ${JSON.stringify(result.data?.results?.details || [])}`
            });

        } catch (error: any) {
            console.error("Error triggering summary:", error);
            toast({
                variant: 'destructive',
                title: "Error al enviar",
                description: error.message || "No se pudo enviar el resumen."
            });
        } finally {
            setIsResending(false);
        }
    };

    const isLoading = salesLoading || egresosLoading || professionalsLoading || servicesLoading || productsLoading || usersLoading;

    const yearlyData = useMemo(() => {
        if (isLoading) return [];

        const professionalMap = new Map(professionals.map(p => [p.id, p]));
        const serviceMap = new Map(services.map(s => [s.id, s]));
        const productMap = new Map(products.map(p => [p.id, p]));

        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        // Enhanced type to track admin commissions per month
        const monthlyData: Record<string, {
            month: string,
            monthFullName: string,
            ingresos: number,
            egresos: number,
            utilidad: number,
            subtotalUtilidad: number,
            rendimiento: number,
            adminCommissions: Record<string, { name: string, amount: number, type: string, value: number }>
        }> = {};

        monthNames.forEach((name, index) => {
            monthlyData[name] = {
                month: name,
                monthFullName: new Date(2000, index, 1).toLocaleString('es-CL', { month: 'long' }),
                ingresos: 0,
                egresos: 0,
                utilidad: 0,
                subtotalUtilidad: 0,
                rendimiento: 0,
                adminCommissions: {}
            };
        });

        sales.forEach(sale => {
            const saleDate = sale.fecha_hora_venta.toDate();
            const monthName = monthNames[saleDate.getMonth()];
            const actualRevenue = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                ? sale.monto_pagado_real
                : (sale.total || 0);
            monthlyData[monthName].ingresos += actualRevenue;
        });

        const allEgresos: { fecha: Date; monto: number }[] = [
            ...egresos.map(e => ({ ...e, fecha: e.fecha instanceof Timestamp ? e.fecha.toDate() : e.fecha })),
            // Removed automatic commission calculation here to rely purely on recorded 'egresos' (payouts)
        ];

        allEgresos.forEach(egreso => {
            const monthName = monthNames[egreso.fecha.getMonth()];
            monthlyData[monthName].egresos += egreso.monto;
        });

        // Calculate Utility and Rendimiento per month
        Object.values(monthlyData).forEach(data => {
            const monthIndex = monthNames.indexOf(data.month);
            const monthlySales = sales.filter(s => s.fecha_hora_venta.toDate().getMonth() === monthIndex);

            const ventaProductos = monthlySales.reduce((sum, sale) => {
                const saleTotal = sale.total || 1;
                const realPaid = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                    ? sale.monto_pagado_real
                    : (sale.total || 0);
                const ratio = realPaid / saleTotal;

                return sum + (sale.items || [])
                    .filter(i => i.tipo === 'producto')
                    .reduce((itemSum, i) => {
                        const itemSubtotal = i.subtotal || i.precio || 0;
                        const itemDiscount = i.descuento?.monto || 0;
                        return itemSum + ((itemSubtotal - itemDiscount) * ratio);
                    }, 0);
            }, 0);

            const subtotalUtilidad = data.ingresos - data.egresos - ventaProductos;


            // Calculate admin commissions for this month
            // Calculate admin commissions for this month
            // We need to use ALL "Local Admins" not just those with config, because an override might exist.
            const admins = users.filter(u => u.role === 'Administrador local');
            let monthlyAdminCommissionsTotal = 0;

            admins.forEach(admin => {
                // Check overrides
                const monthKey = data.month.toLowerCase(); // 'enero', etc
                const adjustment = monthlyAdjustments[monthKey]?.adminCommissions?.[admin.id];

                const baseType = admin.commissionType || 'none';
                const baseValue = admin.commissionValue || 0;

                const type = adjustment ? adjustment.type : baseType;
                const value = adjustment ? adjustment.value : baseValue;

                let amount = 0;
                if (!type || type === 'none') {
                    amount = 0;
                } else if (type === 'fixed') {
                    amount = value || 0;
                } else if (type === 'percentage') {
                    amount = subtotalUtilidad * ((value || 0) / 100);
                }

                if (type && type !== 'none') {
                    data.adminCommissions[admin.id] = {
                        name: admin.name,
                        amount,
                        type,
                        value
                    };
                    monthlyAdminCommissionsTotal += amount;
                }
            });

            data.subtotalUtilidad = subtotalUtilidad;
            data.utilidad = subtotalUtilidad - monthlyAdminCommissionsTotal;
            data.rendimiento = data.ingresos > 0 ? (subtotalUtilidad / data.ingresos) * 100 : 0;
        });

        return Object.values(monthlyData);
    }, [isLoading, sales, egresos, professionals, services, products, users, monthlyAdjustments]);

    const { totalIngresosAnual, totalEgresosAnual } = useMemo(() => {
        return yearlyData.reduce((acc, month) => {
            acc.totalIngresosAnual += month.ingresos;
            acc.totalEgresosAnual += month.egresos;
            return acc;
        }, { totalIngresosAnual: 0, totalEgresosAnual: 0 });
    }, [yearlyData]);

    const { ventaProductosAnual, reinversionAnual, comisionProfesionalesAnual, utilidadVatosAlfaAnual } = useMemo(() => {
        if (isLoading) return { ventaProductosAnual: 0, reinversionAnual: 0, comisionProfesionalesAnual: 0, utilidadVatosAlfaAnual: 0 };

        const productMap = new Map(products.map(p => [p.id, p]));
        const professionalMap = new Map(professionals.map(p => [p.id, p]));

        let ventaProductos = 0;
        let reinversion = 0;
        let comisionProfesionales = 0;

        sales.forEach(sale => {
            const saleTotal = sale.total || 1;
            const realPaid = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                ? sale.monto_pagado_real
                : (sale.total || 0);
            const ratio = realPaid / saleTotal;

            sale.items?.forEach(item => {
                if (item.tipo === 'producto') {
                    const itemSubtotal = item.subtotal || ((item.precio || 0) * item.cantidad) || 0;
                    const itemDiscount = item.descuento?.monto || 0;
                    const finalItemPrice = (itemSubtotal - itemDiscount) * ratio;

                    ventaProductos += finalItemPrice;

                    const product = productMap.get(item.id);
                    if (product && product.purchase_cost) {
                        reinversion += product.purchase_cost * item.cantidad;
                    }

                    if (product && item.barbero_id) {
                        const professional = professionalMap.get(item.barbero_id);
                        if (professional) {
                            const commissionConfig = professional?.comisionesPorProducto?.[product.id] || product.commission || professional.defaultCommission;
                            if (commissionConfig) {
                                comisionProfesionales += commissionConfig.type === '%'
                                    ? finalItemPrice * (commissionConfig.value / 100)
                                    : commissionConfig.value;
                            }
                        }
                    }
                }
            })
        });

        const utilidadVatosAlfa = ventaProductos - reinversion - comisionProfesionales;
        return { ventaProductosAnual: ventaProductos, reinversionAnual: reinversion, comisionProfesionalesAnual: comisionProfesionales, utilidadVatosAlfaAnual: utilidadVatosAlfa };

    }, [isLoading, sales, products, professionals]);

    const subtotalUtilidadAnual = totalIngresosAnual - totalEgresosAnual - ventaProductosAnual;

    // Calculate total annual admin commissions by aggregation
    const annualAdminCommissions = useMemo(() => {
        const totals: Record<string, { name: string, amount: number, type: string, value: number }> = {};
        yearlyData.forEach(month => {
            Object.values(month.adminCommissions).forEach(comm => {
                // Use Name as key? Or ID? Better ID but we don't have it easily accessible in the loop below if we don't store it.
                // We stored it in adminCommissions keyed by ID.
                // Actually we can just iterate the users and sum up from yearlyData.
            });
        });

        // Re-calculate based on calculated monthly data (which includes overrides)
        if (!users) return [];
        return users
            .filter(u => u.role === 'Administrador local')
            .map(u => {
                const totalAmount = yearlyData.reduce((sum, month) => {
                    return sum + (month.adminCommissions[u.id]?.amount || 0);
                }, 0);

                if (totalAmount === 0 && (!u.commissionType || u.commissionType === 'none')) return null;

                // Calculate effective annual percentage
                // If subtotalUtilidadAnual is 0, percentage is 0 to avoid NaN
                const effectivePercentage = subtotalUtilidadAnual !== 0
                    ? (totalAmount / subtotalUtilidadAnual) * 100
                    : 0;

                return {
                    id: u.id,
                    name: u.name,
                    amount: totalAmount,
                    type: u.commissionType,
                    value: effectivePercentage // Use effective percentage for display
                };
            })
            .filter((u): u is NonNullable<typeof u> => u !== null);
    }, [yearlyData, users, subtotalUtilidadAnual]);

    const totalAnnualAdminCommissions = annualAdminCommissions.reduce((acc, curr) => acc + curr.amount, 0);

    const utilidadNetaAnual = subtotalUtilidadAnual - totalAnnualAdminCommissions;

    const firstHalfYear = yearlyData.slice(0, 6);
    const secondHalfYear = yearlyData.slice(6, 12);

    return (
        <>
            <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-bold tracking-tight">Resumen anual</h2>
                    <Button variant="outline" onClick={handleResendSummary} disabled={isResending}>
                        {isResending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                        Reenviar Resumen Diario
                    </Button>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    <Card className="lg:col-span-1">
                        <CardHeader>
                            <CardTitle>Resumen</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1 text-sm">
                            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                                <>
                                    <ResumenGeneralItem label="Ingreso total" amount={totalIngresosAnual} fractionDigits={2} />
                                    <ResumenGeneralItem label="Egreso total" amount={totalEgresosAnual} fractionDigits={2} />
                                    <ResumenGeneralItem label="Subtotal de utilidad" amount={subtotalUtilidadAnual} isBold fractionDigits={2} />

                                    {annualAdminCommissions.map(admin => (
                                        <ResumenGeneralItem
                                            key={admin.id}
                                            label={`Comisión ${admin.name}(${admin.value.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %)`}
                                            amount={admin.amount}
                                            fractionDigits={2}
                                        />
                                    ))}

                                    <ResumenGeneralItem label="Utilidad neta" amount={utilidadNetaAnual} isPrimary isBold className="text-xl" fractionDigits={2} />
                                </>
                            )}
                        </CardContent>
                    </Card>
                    <Card className="lg:col-span-1">
                        <CardHeader>
                            <CardTitle>Productos</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                                <>
                                    <div className="flex justify-between items-center text-base">
                                        <span className="text-muted-foreground">Venta de productos</span>
                                        <span className="font-semibold">${ventaProductosAnual.toLocaleString('es-MX')}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-base">
                                        <span className="text-muted-foreground">Reinversión</span>
                                        <span className="font-semibold text-muted-foreground">-${reinversionAnual.toLocaleString('es-MX')}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-base">
                                        <span className="text-muted-foreground">Comisión de profesionales</span>
                                        <span className="font-semibold text-muted-foreground">-${comisionProfesionalesAnual.toLocaleString('es-MX')}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-lg pt-2 border-t mt-2">
                                        <span className="font-bold text-primary flex items-center"><TrendingDown className="mr-2 h-5 w-5" />Utilidad Vatos Alfa</span>
                                        <span className="font-extrabold text-primary">${utilidadVatosAlfaAnual.toLocaleString('es-MX')}</span>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                    <Card className="lg:col-span-1">
                        <CardHeader>
                            <CardTitle>Rendimiento mensual</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Mes</TableHead>
                                        <TableHead className="text-right">Rendimiento</TableHead>
                                        <TableHead>Mes</TableHead>
                                        <TableHead className="text-right">Rendimiento</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={4} className="text-center h-24"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                                    ) : (
                                        firstHalfYear.map((data, index) => (
                                            <TableRow key={data.monthFullName}>
                                                <TableCell className="capitalize">{data.monthFullName}</TableCell>
                                                <TableCell className="text-right font-semibold text-primary">{data.rendimiento.toFixed(2)}%</TableCell>
                                                <TableCell className="capitalize">{secondHalfYear[index]?.monthFullName}</TableCell>
                                                <TableCell className="text-right font-semibold text-primary">{secondHalfYear[index]?.rendimiento.toFixed(2)}%</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Tendencia mensual: Ingresos, egresos y utilidad</CardTitle>
                    </CardHeader>
                    <CardContent className="h-96">
                        {isLoading ? <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={yearlyData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="month" />
                                    <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                                    <Tooltip formatter={(value: number) => `$${value.toLocaleString('es-MX')} `} />
                                    <Legend />
                                    <Line type="monotone" dataKey="ingresos" stroke="hsl(var(--chart-1))" name="Ingresos" />
                                    <Line type="monotone" dataKey="egresos" stroke="hsl(var(--chart-2))" name="Egresos" />
                                    <Line type="monotone" dataKey="utilidad" stroke="hsl(var(--primary))" name="Utilidad neta" strokeWidth={2} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            </div>
            <AddDepositoModal
                isOpen={isDepositoModalOpen}
                onOpenChange={setIsDepositoModalOpen}
            />
        </>
    );
}
