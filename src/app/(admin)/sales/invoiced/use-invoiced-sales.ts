
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
        const toDate = activeFilters.dateRange?.to || fromDate;

        if (fromDate) {
            constraints.push(where('fecha_hora_venta', '>=', startOfDay(fromDate)));
        }
        if (toDate) {
            constraints.push(where('fecha_hora_venta', '<=', endOfDay(toDate)));
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
            // Excluir intentos inconclusos de terminal en estado Pendiente
            if (sale.pago_estado === 'Pendiente' || (sale.pago_estado as string) === 'pendiente') {
                return false;
            }
            const localMatch = activeFilters.local === 'todos' || sale.local_id === activeFilters.local;
            const paymentMethodMatch = activeFilters.paymentMethod === 'todos' || (() => {
                const filter = activeFilters.paymentMethod;
                if (filter === 'tarjeta') {
                    return sale.metodo_pago === 'tarjeta' || sale.metodo_pago === 'terminal' || sale.metodo_pago === 'terminal_point' || (sale.metodo_pago === 'combinado' && (sale.detalle_pago_combinado?.tarjeta || 0) > 0);
                }
                if (filter === 'efectivo') {
                    return sale.metodo_pago === 'efectivo' || (sale.metodo_pago === 'combinado' && (sale.detalle_pago_combinado?.efectivo || 0) > 0);
                }
                if (filter === 'transferencia') {
                    return sale.metodo_pago === 'transferencia' || (sale.metodo_pago === 'combinado' && (sale.detalle_pago_combinado?.transferencia || 0) > 0);
                }
                if (filter === 'Pagos en linea' || filter === 'pagos_en_linea' || filter === 'Pagos en Línea') {
                    return sale.metodo_pago === 'mercadopago' || sale.metodo_pago === 'Pagos en linea' || sale.metodo_pago === 'pagos_en_linea' || sale.metodo_pago === 'en_linea' || (sale.metodo_pago === 'combinado' && (sale.detalle_pago_combinado?.pagos_en_linea || 0) > 0) || (!sale.metodo_pago && sale.pago_estado === 'deposit_paid');
                }
                return sale.metodo_pago === filter;
            })();

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
                paymentMethods: { data: [], total: 0, dataLabels: ['Efectivo', 'Terminal Point', 'Transferencia', 'Pagos en Línea'] }
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
                    const propinaVal = Number(sale.propina) || 0;
                    const pMetodo = (sale as any).propina_metodo;
                    if (propinaVal > 0 && pMetodo && Math.abs(combinedSum - (actualRevenue + propinaVal)) < 0.05) {
                        let adjE = combinedEfectivo;
                        let adjT = combinedTarjeta;
                        let adjTr = combinedTransferencia;
                        let adjO = combinedOnline;
                        if (pMetodo === 'tarjeta') adjT = Math.max(0, adjT - propinaVal);
                        else if (pMetodo === 'efectivo') adjE = Math.max(0, adjE - propinaVal);
                        else if (pMetodo === 'transferencia') adjTr = Math.max(0, adjTr - propinaVal);
                        else if (pMetodo === 'mercadopago' || pMetodo === 'en_linea') adjO = Math.max(0, adjO - propinaVal);

                        acc['Efectivo'] = (acc['Efectivo'] || 0) + adjE;
                        acc['Terminal Point'] = (acc['Terminal Point'] || 0) + adjT;
                        acc['Transferencia'] = (acc['Transferencia'] || 0) + adjTr;
                        if (adjO > 0) acc['Pagos en Línea'] = (acc['Pagos en Línea'] || 0) + adjO;
                    } else {
                        const factor = actualRevenue / combinedSum;
                        acc['Efectivo'] = (acc['Efectivo'] || 0) + (combinedEfectivo * factor);
                        acc['Terminal Point'] = (acc['Terminal Point'] || 0) + (combinedTarjeta * factor);
                        acc['Transferencia'] = (acc['Transferencia'] || 0) + (combinedTransferencia * factor);
                        if (combinedOnline > 0) {
                            acc['Pagos en Línea'] = (acc['Pagos en Línea'] || 0) + (combinedOnline * factor);
                        }
                    }
                } else {
                    acc['Efectivo'] = (acc['Efectivo'] || 0) + combinedEfectivo;
                    acc['Terminal Point'] = (acc['Terminal Point'] || 0) + combinedTarjeta;
                    acc['Transferencia'] = (acc['Transferencia'] || 0) + combinedTransferencia;
                    if (combinedOnline > 0) {
                        acc['Pagos en Línea'] = (acc['Pagos en Línea'] || 0) + combinedOnline;
                    }
                }
            } else {
                let method = sale.metodo_pago;
                let amount = actualRevenue;

                // Map payment methods into standard buckets
                let bucket = 'Efectivo';
                const lower = (method || '').toLowerCase().trim();
                if (lower === 'tarjeta' || lower === 'terminal' || lower === 'terminal_point' || lower === 'terminal point') {
                    bucket = 'Terminal Point';
                } else if (lower === 'transferencia' || lower === 'spei') {
                    bucket = 'Transferencia';
                } else if (lower === 'mercadopago' || lower === 'mercado_pago' || lower === 'pagos en linea' || lower === 'pagos_en_linea' || lower === 'en_linea' || lower === 'online' || (!method && sale.pago_estado === 'deposit_paid')) {
                    bucket = 'Pagos en Línea';
                } else if (lower === 'efectivo') {
                    bucket = 'Efectivo';
                } else {
                    bucket = lower ? (lower.charAt(0).toUpperCase() + lower.slice(1)) : 'Otro';
                }

                acc[bucket] = (acc[bucket] || 0) + amount;
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
                dataLabels: ['Efectivo', 'Terminal Point', 'Transferencia', 'Pagos en Línea']
            },
        };
    }, [populatedSales]);

    return {
        sales: populatedSales,
        loading,
        salesData
    };
}
