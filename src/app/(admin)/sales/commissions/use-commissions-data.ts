
import { useState, useEffect, useMemo } from 'react';
import type { DateRange } from "react-day-picker";
import { startOfDay, endOfDay, format } from "date-fns";
import { where, Timestamp, doc, onSnapshot, collection, getDocs, getDoc, query } from "firebase/firestore";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import { db } from "@/lib/firebase-client";
import type { Sale, CommissionRowData, ProfessionalCommissionSummary, Local, Profesional, Service, Product, Client } from "@/lib/types";


export interface CommissionsFilters {
    dateRange: DateRange | undefined;
    local: string;
    professional: string;
}

export function useCommissionsData(activeFilters: CommissionsFilters, queryKey: number) {
    const [discountsAffectCommissions, setDiscountsAffectCommissions] = useState(true);
    const [commissionData, setCommissionData] = useState<CommissionRowData[]>([]);
    const [isComputing, setIsComputing] = useState(true);

    // 1. Fetch Settings (Real-time listener)
    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, 'settings', 'commissions'), (docSnap) => {
            if (docSnap.exists()) {
                setDiscountsAffectCommissions(docSnap.data().discountsAffectCommissions ?? true);
            }
        }, (error) => {
            console.error("Error listening to commission settings:", error);
        });
        return () => unsubscribe();
    }, []);

    // 2. Fetch Raw Data
    const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales', queryKey);
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', queryKey, where('active', '==', true));
    const { data: services, loading: servicesLoading } = useFirestoreQuery<Service>('servicios', queryKey);
    const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos', queryKey);
    const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes', queryKey);

    const salesQueryConstraints = useMemo(() => {
        if (!activeFilters.dateRange?.from) return undefined;

        const constraints = [];
        constraints.push(where('fecha_hora_venta', '>=', Timestamp.fromDate(startOfDay(activeFilters.dateRange.from))));
        if (activeFilters.dateRange.to) {
            constraints.push(where('fecha_hora_venta', '<=', Timestamp.fromDate(endOfDay(activeFilters.dateRange.to))));
        }
        return constraints;
    }, [activeFilters.dateRange]);

    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>(
        'ventas',
        salesQueryConstraints ? `sales-${JSON.stringify(activeFilters)}-${queryKey}` : undefined,
        ...(salesQueryConstraints || [])
    );

    const dataLoading = salesLoading || professionalsLoading || servicesLoading || productsLoading || clientsLoading;

    const [combinedSales, setCombinedSales] = useState<Sale[]>([]);

    useEffect(() => {
        if (dataLoading || !sales) {
            setCombinedSales([]);
            return;
        }

        let isCancelled = false;

        const syncSales = async () => {
            if (!activeFilters.dateRange?.from) {
                setCombinedSales(sales);
                return;
            }

            const startStr = format(startOfDay(activeFilters.dateRange.from), 'yyyy-MM-dd');
            const endStr = format(endOfDay(activeFilters.dateRange.to || activeFilters.dateRange.from), 'yyyy-MM-dd');

            const salesMap = new Map<string, Sale>();
            sales.forEach(s => salesMap.set(s.id, s));

            try {
                const resConstraints = [
                    where('fecha', '>=', startStr),
                    where('fecha', '<=', endStr),
                    where('estado', '==', 'Asiste')
                ];
                if (activeFilters.local !== 'todos') {
                    resConstraints.push(where('local_id', '==', activeFilters.local));
                }
                const qRes = query(collection(db, 'reservas'), ...resConstraints);
                const resSnap = await getDocs(qRes);

                const candidateSaleIds = new Set<string>();
                resSnap.forEach(d => {
                    const r = d.data();
                    if (r.deposit_payment_id && !salesMap.has(r.deposit_payment_id)) {
                        candidateSaleIds.add(r.deposit_payment_id);
                    }
                    if (!salesMap.has(d.id)) {
                        candidateSaleIds.add(d.id);
                    }
                });

                if (candidateSaleIds.size > 0) {
                    const idsToFetch = Array.from(candidateSaleIds);
                    const docSnaps = await Promise.all(
                        idsToFetch.map(id => getDoc(doc(db, 'ventas', id)).catch(err => {
                            console.error("Error fetching candidate sale for commissions report:", id, err);
                            return null;
                        }))
                    );
                    docSnaps.forEach(sDoc => {
                        if (sDoc && sDoc.exists()) {
                            const saleData = { id: sDoc.id, ...sDoc.data() } as Sale;
                            salesMap.set(saleData.id, saleData);
                        }
                    });
                }
            } catch (err) {
                console.error("Error fetching attended reservations for commissions report:", err);
            }

            if (!isCancelled) {
                setCombinedSales(Array.from(salesMap.values()));
            }
        };

        syncSales();

        return () => {
            isCancelled = true;
        };
    }, [dataLoading, sales, activeFilters.dateRange, activeFilters.local]);

    // 3. Compute Commissions
    useEffect(() => {
        if (dataLoading || !professionals || !services || !products || !clients) {
            setCommissionData([]);
            setIsComputing(true);
            return;
        }

        const professionalMap = new Map(professionals.map(p => [p.id, p]));
        const serviceMap = new Map(services.map(s => [s.id, s]));
        const productMap = new Map(products.map(p => [p.id, p]));
        const clientMap = new Map(clients.map(c => [c.id, c]));

        let filteredSales = combinedSales;
        if (activeFilters.local !== 'todos') {
            filteredSales = filteredSales.filter(s => s.local_id === activeFilters.local);
        }

        const commissionRows: CommissionRowData[] = [];

        filteredSales.forEach(sale => {
            // Strict check: Commissions are ONLY for fully paid sales
            if (sale.pago_estado === 'deposit_paid' || sale.pago_estado === 'Pago Parcial' || sale.pago_estado === 'Pendiente') {
                return;
            }
            const totalCovered = (sale.monto_pagado_real || 0) + (sale.anticipoPagado || 0);
            if (sale.pago_estado !== 'Pagado' && (sale.total - totalCovered) > 1) {
                return;
            }

            const client = clientMap.get(sale.cliente_id);
            const clientName = client ? `${client.nombre} ${client.apellido}` : (sale.cliente_nombre || 'Cliente desconocido');

            sale.items?.forEach(item => {
                if (activeFilters.professional !== 'todos' && item.barbero_id !== activeFilters.professional) {
                    return;
                }

                const professional = professionalMap.get(item.barbero_id);
                if (!professional) return;

                const itemPrice = item.subtotal || item.precio || 0;
                const itemDiscount = item.descuento?.monto || 0;

                // 1. Real money collected (what should be shown in "Venta")
                const realSaleAmount = itemPrice - itemDiscount;

                // 2. Base for commission calculation (depends on setting)
                const commissionBaseAmount = discountsAffectCommissions ? realSaleAmount : itemPrice;

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
                    commissionConfig = professional?.comisionesPorProducto?.[product.id] || product.commission || professional.defaultCommission;
                }

                if (commissionConfig) {
                    const commissionAmount = commissionConfig.type === '%'
                        ? commissionBaseAmount * (commissionConfig.value / 100)
                        : commissionConfig.value;

                    commissionRows.push({
                        professionalId: professional.id,
                        professionalName: professional.name,
                        clientName: clientName,
                        itemName: itemName,
                        itemType: item.tipo,
                        saleAmount: realSaleAmount,
                        commissionAmount: commissionAmount,
                        commissionPercentage: commissionConfig.type === '%' ? commissionConfig.value : (realSaleAmount > 0 ? (commissionAmount / realSaleAmount) * 100 : 0),
                        discountDetails: (item.descuento && itemDiscount > 0) ? {
                            value: item.descuento.valor,
                            type: item.descuento.tipo,
                            amount: item.descuento.monto
                        } : undefined
                    });
                }
            });

            // Handle Tip
            if (sale.propina && sale.propina > 0) {
                const allSellersInSale = Array.from(new Set(sale.items?.map(i => i.barbero_id).filter(Boolean)));
                const validProfessionalsIds = allSellersInSale.filter(id => id && professionalMap.has(id));

                if (validProfessionalsIds.length > 0) {
                    const tipPerProfessional = sale.propina / validProfessionalsIds.length;

                    const methodMap: Record<string, string> = {
                        'mercadopago': 'Terminal (Mercado Pago)',
                        'tarjeta': 'Tarjeta',
                        'transferencia': 'Transferencia',
                        'efectivo': 'Efectivo',
                        'combinado': 'Combinado'
                    };

                    const mappedMethod = sale.metodo_pago ? (methodMap[sale.metodo_pago.toLowerCase()] || sale.metodo_pago) : 'Desconocido';
                    const tipItemName = `Propina (${mappedMethod})`;

                    validProfessionalsIds.forEach(profId => {
                        const professional = professionalMap.get(profId);
                        if (professional && (activeFilters.professional === 'todos' || activeFilters.professional === professional.id)) {
                            commissionRows.push({
                                professionalId: professional.id,
                                professionalName: professional.name,
                                clientName: clientName,
                                itemName: tipItemName,
                                itemType: 'propina',
                                saleAmount: tipPerProfessional,
                                commissionAmount: tipPerProfessional,
                                commissionPercentage: 100
                            });
                        }
                    });
                }
            }
        });

        setCommissionData(commissionRows);
        setIsComputing(false);

    }, [combinedSales, professionals, services, products, clients, dataLoading, activeFilters, discountsAffectCommissions]);


    // 4. Calculate Summaries
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


    const tipSummary = useMemo(() => {
        const tipData = commissionData.filter(d => d.itemType === 'propina');
        return tipData.reduce((acc, current) => {
            acc.tipAmount += current.saleAmount;
            return acc;
        }, { tipAmount: 0 });
    }, [commissionData]);


    return {
        commissionData,
        summaryByProfessional,
        overallSummary,
        serviceSummary,
        productSummary,
        tipSummary,
        loading: dataLoading || isComputing,
        raw: {
            locales,
            professionals
        }
    };
}
