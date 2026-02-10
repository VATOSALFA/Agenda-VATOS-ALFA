
import { useMemo } from 'react';
import type { DateRange } from "react-day-picker";
import { format, startOfDay, endOfDay, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { where, Timestamp } from "firebase/firestore";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Sale, Product, Profesional, ProductPresentation, SaleItem, Client, User, AggregatedProductSale, AggregatedSellerSale } from "@/lib/types";

export interface ProductSalesFilters {
    dateRange: DateRange | undefined;
    productStatus: string;
    product: string;
}

export function useProductSalesData(activeFilters: ProductSalesFilters, queryKey: number) {

    // 1. Fetch Data
    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>(
        'ventas',
        `sales-${queryKey}`,
        ...(activeFilters.dateRange?.from ? [where('fecha_hora_venta', '>=', Timestamp.fromDate(startOfDay(activeFilters.dateRange.from)))] : []),
        ...(activeFilters.dateRange?.to ? [where('fecha_hora_venta', '<=', Timestamp.fromDate(endOfDay(activeFilters.dateRange.to)))] : [])
    );
    const { data: products, loading: productsLoading } = useFirestoreQuery<Product>('productos');
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');
    const { data: presentations, loading: presentationsLoading } = useFirestoreQuery<ProductPresentation>('formatos_productos');
    const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes');
    const { data: users, loading: usersLoading } = useFirestoreQuery<User>('usuarios');

    const loading = salesLoading || productsLoading || professionalsLoading || presentationsLoading || clientsLoading || usersLoading;

    // Helper: Format Date
    const formatDate = (date: any, formatString: string = 'PP') => {
        if (!date) return 'N/A';
        let dateObj: Date;
        if (date.seconds) { // Firestore Timestamp
            dateObj = new Date(date.seconds * 1000);
        } else if (typeof date === 'string') { // ISO String
            dateObj = parseISO(date);
        } else {
            return 'Fecha inválida';
        }
        if (isNaN(dateObj.getTime())) return 'Fecha inválida';
        return format(dateObj, formatString, { locale: es });
    };

    // 2. Filter Product Items
    const filteredProductItems = useMemo(() => {
        if (loading) return [];

        const activeProductIds = new Set(products.filter(p => activeFilters.productStatus === 'todos' || p.active === (activeFilters.productStatus === 'active')).map(p => p.id));

        const allItems: (SaleItem & { saleId: string; cliente_id: string; fecha_hora_venta: any })[] = [];
        sales.forEach(sale => {
            sale.items?.forEach(item => {
                if (item.tipo === 'producto' && activeProductIds.has(item.id)) {
                    if (activeFilters.product === 'todos' || item.id === activeFilters.product) {
                        allItems.push({ ...item, saleId: sale.id, cliente_id: sale.cliente_id, fecha_hora_venta: sale.fecha_hora_venta });
                    }
                }
            });
        });
        return allItems;
    }, [sales, products, activeFilters, loading]);

    // 3. Sales Summary (Aggregated by Product)
    const salesSummary = useMemo(() => {
        if (filteredProductItems.length === 0) {
            return {
                aggregatedData: [],
                totalRevenue: 0,
                totalUnitsSold: 0,
                highestRevenueProduct: null,
                lowestRevenueProduct: null
            };
        }

        const productMap = new Map(products.map(p => [p.id, p]));
        const presentationMap = new Map(presentations.map(p => [p.id, p.name]));
        const professionalMap = new Map(professionals.map(p => [p.id, p.name]));
        const userMap = new Map(users.map(u => [u.id, u.name]));
        const clientMap = new Map(clients.map(c => [c.id, c.nombre + ' ' + c.apellido]));

        const aggregated: Record<string, AggregatedProductSale> = {};
        let totalRevenue = 0;

        filteredProductItems.forEach(item => {
            const product = productMap.get(item.id);
            if (!product) return;

            const quantity = Number(item.cantidad) || 0;
            const price = Number(item.precio) || 0;
            const itemRevenue = Number(item.subtotal) || (price * quantity) || 0;

            if (!aggregated[item.id]) {
                aggregated[item.id] = {
                    id: item.id,
                    nombre: product.nombre,
                    presentation: presentationMap.get(product.presentation_id) || 'N/A',
                    unitsSold: 0,
                    revenue: 0,
                    sellers: {},
                    details: []
                };
            }

            totalRevenue += itemRevenue;
            aggregated[item.id].unitsSold += quantity;
            aggregated[item.id].revenue += itemRevenue;

            let sellerName = 'Desconocido';
            if (item.barbero_id) {
                if (professionalMap.has(item.barbero_id)) {
                    sellerName = professionalMap.get(item.barbero_id)!;
                } else if (userMap.has(item.barbero_id)) {
                    sellerName = userMap.get(item.barbero_id)!;
                }
            }

            aggregated[item.id].details.push({
                saleId: item.saleId,
                clientName: clientMap.get(item.cliente_id) || 'Desconocido',
                sellerName,
                unitsSold: quantity,
                revenue: itemRevenue,
                date: formatDate(item.fecha_hora_venta)
            });

            if (item.barbero_id) {
                aggregated[item.id].sellers[sellerName] = (aggregated[item.id].sellers[sellerName] || 0) + itemRevenue;
            }
        });

        const aggregatedData = Object.values(aggregated).sort((a, b) => b.revenue - a.revenue);
        const totalUnitsSold = aggregatedData.reduce((acc, item) => acc + item.unitsSold, 0);

        let highestRevenueProduct = null;
        let lowestRevenueProduct = null;
        if (aggregatedData.length > 0) {
            const getTopSeller = (sellers: { [key: string]: number; }) => Object.keys(sellers).length > 0 ? Object.keys(sellers).reduce((a, b) => sellers[a] > sellers[b] ? a : b, '') : 'N/A';
            const highest = aggregatedData[0];
            highestRevenueProduct = { name: highest.nombre, seller: getTopSeller(highest.sellers), amount: highest.revenue };
            const lowest = aggregatedData[aggregatedData.length - 1];
            lowestRevenueProduct = { name: lowest.nombre, seller: getTopSeller(lowest.sellers), amount: lowest.revenue };
        }

        return { aggregatedData, totalRevenue, totalUnitsSold, highestRevenueProduct, lowestRevenueProduct };
    }, [filteredProductItems, products, presentations, professionals, clients, users]);


    // 4. Seller Summary (Aggregated by Seller)
    const sellerSummary = useMemo(() => {
        if (loading || filteredProductItems.length === 0) return [];

        const professionalMap = new Map(professionals.map(p => [p.id, p.name]));
        const userMap = new Map(users.map(u => [u.id, u]));
        const productMap = new Map(products.map(p => [p.id, p.nombre]));
        const clientMap = new Map(clients.map(c => [c.id, c.nombre + ' ' + c.apellido]));

        const aggregated: Record<string, AggregatedSellerSale> = {};

        filteredProductItems.forEach(item => {
            if (!item.barbero_id) return;

            if (!aggregated[item.barbero_id]) {
                let sellerName = 'Desconocido';
                let userType = 'Desconocido';

                if (professionalMap.has(item.barbero_id)) {
                    sellerName = professionalMap.get(item.barbero_id)!;
                    userType = 'Profesional';
                } else if (userMap.has(item.barbero_id)) {
                    const user = userMap.get(item.barbero_id)!;
                    sellerName = user.name || 'Usuario';
                    userType = user.role || 'Usuario';
                }

                aggregated[item.barbero_id] = {
                    sellerId: item.barbero_id,
                    sellerName,
                    unitsSold: 0,
                    revenue: 0,
                    userType,
                    details: []
                };
            }

            const quantity = Number(item.cantidad) || 0;
            const price = Number(item.precio) || 0;
            const itemRevenue = Number(item.subtotal) || (price * quantity) || 0;

            aggregated[item.barbero_id].unitsSold += quantity;
            aggregated[item.barbero_id].revenue += itemRevenue;

            aggregated[item.barbero_id].details.push({
                saleId: item.saleId,
                clientName: clientMap.get(item.cliente_id) || 'Desconocido',
                productName: productMap.get(item.id) || 'Desconocido',
                unitsSold: quantity,
                revenue: itemRevenue,
                date: formatDate(item.fecha_hora_venta),
            });
        });

        return Object.values(aggregated).sort((a, b) => b.revenue - a.revenue);
    }, [filteredProductItems, professionals, products, clients, users, loading]);


    return {
        salesSummary,
        sellerSummary,
        filteredProductItems,
        loading,
        raw: {
            products,
            professionals,
            clients,
            presentations
        },
        formatDate
    };
}
