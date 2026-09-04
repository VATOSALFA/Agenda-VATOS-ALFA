
import { useMemo, useState, useEffect, useRef } from 'react';
import type { DateRange } from "react-day-picker";
import { startOfDay, endOfDay } from "date-fns";
import { where, doc, getDoc, collection, query, getDocs, documentId } from "firebase/firestore";
import { db } from "@/lib/firebase-client";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Sale, Client, Profesional, User } from "@/lib/types";

export interface InvoicedSalesFilters {
    dateRange: DateRange | undefined;
    local: string;
    paymentMethod: string;
    professional?: string;
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
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
    const { data: users, loading: usersLoading } = useFirestoreQuery<User>('usuarios');

    // 2.b Fetch ONLY needed clients to optimize loaded memory
    const fetchedClientIds = useRef<Set<string>>(new Set());
    const [clientsInSales, setClientsInSales] = useState<Client[]>([]);
    const [clientsLoading, setClientsLoading] = useState(false);

    useEffect(() => {
        if (!salesDataFromHook || salesDataFromHook.length === 0) return;

        const uniqueClientIds = Array.from(new Set(salesDataFromHook.map(s => s.cliente_id).filter(Boolean)));
        const idsToFetch = uniqueClientIds.filter(id => !fetchedClientIds.current.has(id));

        if (idsToFetch.length > 0) {
            const fetchClients = async () => {
                setClientsLoading(true);
                try {
                    // Chunk IDs into groups of 30 (Firestore limit for 'in' query)
                    const chunks = [];
                    for (let i = 0; i < idsToFetch.length; i += 30) {
                        chunks.push(idsToFetch.slice(i, i + 30));
                    }

                    const newClients: Client[] = [];
                    
                    // Fetch each chunk in parallel
                    const chunkPromises = chunks.map(async (chunk) => {
                        const q = query(
                            collection(db, 'clientes'), 
                            where(documentId(), 'in', chunk)
                        );
                        const snapshot = await getDocs(q);
                        return snapshot.docs.map(doc => {
                            fetchedClientIds.current.add(doc.id);
                            return { id: doc.id, ...doc.data() } as Client;
                        });
                    });

                    const results = await Promise.all(chunkPromises);
                    results.forEach(clients => newClients.push(...clients));

                    setClientsInSales(prev => [...prev, ...newClients]);
                } catch (err) {
                    console.error("Error fetching clients in batches", err);
                } finally {
                    setClientsLoading(false);
                }
            };
            fetchClients();
        }
    }, [salesDataFromHook]);

    const loading = salesLoading || clientsLoading || professionalsLoading || usersLoading;

    // 3. Filter in Memory (Local & Payment Method) + Sort
    const filteredSales = useMemo(() => {
        const filtered = salesDataFromHook.filter(sale => {
            const localMatch = activeFilters.local === 'todos' || sale.local_id === activeFilters.local;
            const paymentMethodMatch = activeFilters.paymentMethod === 'todos' || sale.metodo_pago === activeFilters.paymentMethod;

            // Professional Filter Logic
            let professionalMatch = true;
            if (activeFilters.professional && activeFilters.professional !== 'todos') {
                professionalMatch = sale.items?.some(item => item.barbero_id === activeFilters.professional) || false;
            }

            return localMatch && paymentMethodMatch && professionalMatch;
        });

        return filtered.sort((a, b) => {
            const dateA = a.fecha_hora_venta?.seconds ? new Date(a.fecha_hora_venta.seconds * 1000) : new Date(a.fecha_hora_venta);
            const dateB = b.fecha_hora_venta?.seconds ? new Date(b.fecha_hora_venta.seconds * 1000) : new Date(b.fecha_hora_venta);
            return dateB.getTime() - dateA.getTime();
        });
    }, [salesDataFromHook, activeFilters.local, activeFilters.paymentMethod, activeFilters.professional]);

    // 4. Populate Data (Join with Clients/Professionals)
    const clientMap = useMemo(() => {
        if (!clientsInSales) return new Map();
        return new Map(clientsInSales.map(c => [c.id, c]));
    }, [clientsInSales]);

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
            let saleTotal = sale.total || 0;

            // Use real paid amount if available (for deposits/partial)
            if (sale.pago_estado === 'deposit_paid' || (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < saleTotal)) {
                saleTotal = sale.monto_pagado_real || 0;
            }

            const computedSaleSubtotal = sale.subtotal || sale.items?.reduce((sum, it: any) => sum + (it.subtotal ?? (((it.precio || 0) * (it.cantidad || 1)))), 0) || saleTotal || 1;

            if (sale.items && Array.isArray(sale.items)) {
                sale.items.forEach(item => {
                    const type = (item as any).tipo === 'producto' ? 'Productos' : 'Servicios';
                    const itemSubtotal = (item as any).subtotal ?? (((item as any).precio || 0) * ((item as any).cantidad || 1));
                    const proportion = computedSaleSubtotal > 0 ? (itemSubtotal / computedSaleSubtotal) : 0;
                    const proportionalTotal = proportion * saleTotal;
                    acc[type] = (acc[type] || 0) + proportionalTotal;
                });
            }
            return acc;
        }, {} as Record<string, number>);

        const salesByPaymentMethod = populatedSales.reduce((acc, sale) => {
            const actualRevenue = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                ? sale.monto_pagado_real
                : (sale.total || 0);

            if (sale.metodo_pago === 'combinado') {
                const combinedEfectivo = sale.detalle_pago_combinado?.efectivo || 0;
                const combinedTarjeta = sale.detalle_pago_combinado?.tarjeta || 0;
                const combinedTransferencia = sale.detalle_pago_combinado?.transferencia || 0;
                const combinedOnline = sale.detalle_pago_combinado?.pagos_en_linea || 0;
                const combinedSum = combinedEfectivo + combinedTarjeta + combinedTransferencia + combinedOnline;

                if (combinedSum > 0 && Math.abs(combinedSum - actualRevenue) > 0.01) {
                    const factor = actualRevenue / combinedSum;
                    acc['efectivo'] = (acc['efectivo'] || 0) + (combinedEfectivo * factor);
                    acc['tarjeta'] = (acc['tarjeta'] || 0) + (combinedTarjeta * factor);
                    acc['transferencia'] = (acc['transferencia'] || 0) + (combinedTransferencia * factor);
                    if (combinedOnline > 0) {
                        acc['Pagos en Linea'] = (acc['Pagos en Linea'] || 0) + (combinedOnline * factor);
                    }
                } else {
                    acc['efectivo'] = (acc['efectivo'] || 0) + combinedEfectivo;
                    acc['tarjeta'] = (acc['tarjeta'] || 0) + combinedTarjeta;
                    acc['transferencia'] = (acc['transferencia'] || 0) + combinedTransferencia;
                    if (combinedOnline > 0) {
                        acc['Pagos en Linea'] = (acc['Pagos en Linea'] || 0) + combinedOnline;
                    }
                }
            } else {
                let method = sale.metodo_pago || 'otro';
                let amount = actualRevenue;

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
