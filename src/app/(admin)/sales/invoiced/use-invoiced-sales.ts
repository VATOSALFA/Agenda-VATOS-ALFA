
import { useMemo } from 'react';
import type { DateRange } from "react-day-picker";
import { startOfDay, endOfDay } from "date-fns";
import { where } from "firebase/firestore";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Sale, Client, Profesional, User } from "@/lib/types";

export interface InvoicedSalesFilters {
    dateRange: DateRange | undefined;
    local: string;
    paymentMethod: string;
}

export function useInvoicedSales(activeFilters: InvoicedSalesFilters, queryKey: number) {

    // 1. Build Query Constraints
    const salesQueryConstraints = useMemo(() => {
        const constraints = [];
        const fromDate = activeFilters.dateRange?.from;

        if (fromDate) {
            constraints.push(where('fecha_hora_venta', '>=', startOfDay(fromDate)));
        }
        if (activeFilters.dateRange?.to) {
            constraints.push(where('fecha_hora_venta', '<=', endOfDay(activeFilters.dateRange.to)));
        }
        return constraints;
    }, [activeFilters.dateRange]);

    // 2. Fetch Data
    const { data: salesDataFromHook, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', queryKey, ...salesQueryConstraints);
    const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes');
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
    const { data: users, loading: usersLoading } = useFirestoreQuery<User>('usuarios');

    const loading = salesLoading || clientsLoading || professionalsLoading || usersLoading;

    // 3. Filter in Memory (Local & Payment Method) + Sort
    const filteredSales = useMemo(() => {
        const filtered = salesDataFromHook.filter(sale => {
            const localMatch = activeFilters.local === 'todos' || sale.local_id === activeFilters.local;
            const paymentMethodMatch = activeFilters.paymentMethod === 'todos' || sale.metodo_pago === activeFilters.paymentMethod;
            return localMatch && paymentMethodMatch;
        });

        return filtered.sort((a, b) => {
            const dateA = a.fecha_hora_venta?.seconds ? new Date(a.fecha_hora_venta.seconds * 1000) : new Date(a.fecha_hora_venta);
            const dateB = b.fecha_hora_venta?.seconds ? new Date(b.fecha_hora_venta.seconds * 1000) : new Date(b.fecha_hora_venta);
            return dateB.getTime() - dateA.getTime();
        });
    }, [salesDataFromHook, activeFilters.local, activeFilters.paymentMethod]);

    // 4. Populate Data (Join with Clients/Professionals)
    const clientMap = useMemo(() => {
        if (!clients) return new Map();
        return new Map(clients.map(c => [c.id, c]));
    }, [clients]);

    const sellerMap = useMemo(() => {
        const map = new Map<string, string>();
        if (professionals) {
            professionals.forEach(p => map.set(p.id, p.name));
        }
        if (users) {
            users.forEach(u => map.set(u.id, u.name));
        }
        return map;
    }, [professionals, users]);

    const populatedSales = useMemo(() => {
        if (!filteredSales || !clientMap.size || !sellerMap.size) return [];
        return filteredSales.map(sale => ({
            ...sale,
            client: clientMap.get(sale.cliente_id),
            professionalNames: sale.items?.map(item => sellerMap.get(item.barbero_id)).filter(Boolean).join(', ') || 'N/A'
        }));
    }, [filteredSales, clientMap, sellerMap]);

    // 5. Calculate Totals (Chart Data)
    const salesData = useMemo(() => {
        if (!populatedSales) {
            return {
                totalSales: { data: [], total: 0, dataLabels: ['Servicios', 'Productos'] },
                paymentMethods: { data: [], total: 0, dataLabels: ['Efectivo', 'Tarjeta', 'Transferencia'] }
            };
        }

        const salesByType = populatedSales.reduce((acc, sale) => {
            const saleSubtotal = sale.subtotal || 1; // Avoid division by zero
            let saleTotal = sale.total || 0;

            // Use real paid amount if available (for deposits/partial)
            if (sale.pago_estado === 'deposit_paid' || (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < saleTotal)) {
                saleTotal = sale.monto_pagado_real || 0;
            }

            if (sale.items && Array.isArray(sale.items)) {
                sale.items.forEach(item => {
                    const type = (item as any).tipo === 'producto' ? 'Productos' : 'Servicios';
                    const itemSubtotal = (item as any).subtotal || 0;
                    const proportion = itemSubtotal / saleSubtotal;
                    const proportionalTotal = proportion * saleTotal;
                    acc[type] = (acc[type] || 0) + proportionalTotal;
                });
            }
            return acc;
        }, {} as Record<string, number>);

        const salesByPaymentMethod = populatedSales.reduce((acc, sale) => {
            if (sale.metodo_pago === 'combinado') {
                acc['efectivo'] = (acc['efectivo'] || 0) + (sale.detalle_pago_combinado?.efectivo || 0);
                acc['tarjeta'] = (acc['tarjeta'] || 0) + (sale.detalle_pago_combinado?.tarjeta || 0);

                // Add online payments if present in combined
                const onlineAmount = sale.detalle_pago_combinado?.pagos_en_linea || 0;
                if (onlineAmount > 0) {
                    acc['Pagos en Linea'] = (acc['Pagos en Linea'] || 0) + onlineAmount;
                }
            } else {
                let method = sale.metodo_pago || 'otro';
                let amount = sale.total || 0;

                if (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total) { // Updated safegaurd
                    amount = sale.monto_pagado_real;
                }

                if (method === 'mercadopago') method = 'Pagos en Linea';

                acc[method] = (acc[method] || 0) + amount;
            }
            return acc;
        }, {} as Record<string, number>);

        const totalSales = populatedSales.reduce((acc, sale) => {
            // Use real paid amount if available (for deposits/partial), otherwise total
            // This handles cases where status might be 'deposit_paid' OR if we just want to track actual inflow
            const actualRevenue = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                ? sale.monto_pagado_real
                : (sale.total || 0);
            return acc + actualRevenue;
        }, 0);

        return {
            totalSales: {
                data: Object.entries(salesByType).map(([name, value]) => ({ name, value })),
                total: totalSales,
                dataLabels: ['Servicios', 'Productos'],
            },
            paymentMethods: {
                data: Object.entries(salesByPaymentMethod).map(([name, value]) => ({ name, value })),
                total: totalSales, // Ensure totals match
                dataLabels: ['Efectivo', 'Tarjeta', 'Transferencia', 'Pagos en Linea']
            },
        };
    }, [populatedSales]);

    return {
        sales: populatedSales,
        loading,
        salesData
    };
}
