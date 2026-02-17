
import { useState, useEffect, useMemo } from 'react';
import type { DateRange } from "react-day-picker";
import { startOfDay, endOfDay } from "date-fns";
import { where, Timestamp, doc, getDoc } from "firebase/firestore";
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

    // 1. Fetch Settings
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const d = await getDoc(doc(db, 'settings', 'commissions'));
                if (d.exists()) {
                    setDiscountsAffectCommissions(d.data().discountsAffectCommissions ?? true);
                }
            } catch (e) {
                console.error("Error loading commission settings", e);
            }
        };
        fetchSettings();
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

    // 3. Compute Commissions
    useEffect(() => {
        if (dataLoading || !sales || !professionals || !services || !products || !clients) {
            setCommissionData([]);
            setIsComputing(true);
            return;
        }

        const professionalMap = new Map(professionals.map(p => [p.id, p]));
        const serviceMap = new Map(services.map(s => [s.id, s]));
        const productMap = new Map(products.map(p => [p.id, p]));
        const clientMap = new Map(clients.map(c => [c.id, c]));

        let filteredSales = sales;
        if (activeFilters.local !== 'todos') {
            filteredSales = filteredSales.filter(s => s.local_id === activeFilters.local);
        }

        const commissionRows: CommissionRowData[] = [];

        filteredSales.forEach(sale => {
            // Strict check: Commissions are ONLY for fully paid sales
            if (sale.pago_estado === 'deposit_paid' || sale.pago_estado === 'Pago Parcial' || sale.pago_estado === 'Pendiente') {
                return;
            }
            if (sale.monto_pagado_real !== undefined && (sale.total - sale.monto_pagado_real) > 1) {
                return;
            }

            const client = clientMap.get(sale.cliente_id);
            const clientName = client ? `${client.nombre} ${client.apellido}` : 'Cliente desconocido';

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

            // Handle Transfer Tip
            if (sale.propina && sale.propina > 0) {
                const professionalsInSale = new Map<string, number>();
                sale.items.forEach(i => {
                    const pid = i.barbero_id;
                    if (pid) {
                        professionalsInSale.set(pid, (professionalsInSale.get(pid) || 0) + (i.subtotal || 0));
                    }
                });

                let topProfId = '';
                let maxRev = -1;
                professionalsInSale.forEach((rev, pid) => {
                    if (rev > maxRev) {
                        maxRev = rev;
                        topProfId = pid;
                    }
                });

                const professional = professionalMap.get(topProfId);
                if (professional && (activeFilters.professional === 'todos' || activeFilters.professional === professional.id)) {
                    commissionRows.push({
                        professionalId: professional.id,
                        professionalName: professional.name,
                        clientName: clientName,
                        itemName: 'Propina (Transferencia)',
                        itemType: 'propina',
                        saleAmount: sale.propina,
                        commissionAmount: sale.propina,
                        commissionPercentage: 100
                    });
                }
            }
        });

        setCommissionData(commissionRows);
        setIsComputing(false);

    }, [sales, professionals, services, products, clients, dataLoading, activeFilters, discountsAffectCommissions]);


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


    return {
        commissionData,
        summaryByProfessional,
        overallSummary,
        serviceSummary,
        productSummary,
        loading: dataLoading || isComputing,
        raw: {
            locales,
            professionals
        }
    };
}
