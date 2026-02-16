
import { useMemo } from 'react';
import type { DateRange } from "react-day-picker";
import { startOfDay, endOfDay } from "date-fns";
import { where, Timestamp, type QueryConstraint } from 'firebase/firestore';
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Sale, Egreso, IngresoManual, Client, Profesional, Local } from "@/lib/types";
import { roundMoney } from '@/lib/utils';

export interface CashBoxFilters {
    dateRange: DateRange | undefined;
    localId: string;
}

export function useCashBoxData(activeFilters: CashBoxFilters, queryKey: number) {
    const { dateRange, localId } = activeFilters;

    // 1. Build Query Constraints
    const salesQueryConstraints = useMemo(() => {
        const constraints: QueryConstraint[] = [];
        if (dateRange?.from) {
            constraints.push(where('fecha_hora_venta', '>=', Timestamp.fromDate(startOfDay(dateRange.from))));
        }
        if (dateRange?.to) {
            constraints.push(where('fecha_hora_venta', '<=', Timestamp.fromDate(endOfDay(dateRange.to))));
        }
        if (localId !== 'todos') {
            constraints.push(where('local_id', '==', localId));
        }
        return constraints;
    }, [dateRange, localId]);

    const egresosQueryConstraints = useMemo(() => {
        if (!dateRange?.from) return [];
        const constraints: QueryConstraint[] = [];
        constraints.push(where('fecha', '>=', Timestamp.fromDate(startOfDay(dateRange.from))));
        if (dateRange.to) {
            constraints.push(where('fecha', '<=', Timestamp.fromDate(endOfDay(dateRange.to))));
        }
        if (localId !== 'todos') {
            constraints.push(where('local_id', '==', localId));
        }
        return constraints;
    }, [dateRange, localId]);

    const ingresosQueryConstraints = useMemo(() => {
        if (!dateRange?.from) return [];
        const constraints: QueryConstraint[] = [];
        constraints.push(where('fecha', '>=', Timestamp.fromDate(startOfDay(dateRange.from))));
        if (dateRange.to) {
            constraints.push(where('fecha', '<=', Timestamp.fromDate(endOfDay(dateRange.to))));
        }
        if (localId !== 'todos') {
            constraints.push(where('local_id', '==', localId));
        }
        return constraints;
    }, [dateRange, localId]);


    // 2. Fetch Data
    const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>(
        'ventas',
        `sales-${queryKey}`,
        ...salesQueryConstraints
    );

    const { data: allEgresos, loading: egresosLoading } = useFirestoreQuery<Egreso>(
        'egresos',
        `egresos-${queryKey}`,
        ...egresosQueryConstraints
    );

    const { data: allIngresos, loading: ingresosLoading } = useFirestoreQuery<IngresoManual>(
        'ingresos_manuales',
        `ingresos-${queryKey}`,
        ...ingresosQueryConstraints
    );

    const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales');
    const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes');
    const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales');

    const loading = salesLoading || egresosLoading || ingresosLoading || localesLoading || clientsLoading || professionalsLoading;

    // 3. Filter in Memory (Local for Egresos/Ingresos if needed - though query constraints handles some, local filtering for egresos/ingresos was partly manual in original?)
    // Original code: egresos = activeFilters.localId === 'todos' ? allEgresos : allEgresos.filter...
    // My constraints for sales included localId.
    // Original code constraints for egresos/ingresos ONLY included dates. Then filter in memory. Why? Maybe to fetch all and filter client side?
    // I will stick to original logic: Fetch by date, Filter by local in memory.

    const egresos = useMemo(() => {
        let filtered = localId === 'todos'
            ? allEgresos
            : allEgresos.filter(e => e.local_id === localId);

        return [...filtered].sort((a, b) => {
            const tA = a.fecha instanceof Timestamp ? a.fecha.toMillis() : 0;
            const tB = b.fecha instanceof Timestamp ? b.fecha.toMillis() : 0;
            return tB - tA;
        });
    }, [allEgresos, localId]);

    const ingresos = useMemo(() => {
        let filtered = localId === 'todos'
            ? allIngresos
            : allIngresos.filter(i => i.local_id === localId);

        return [...filtered].sort((a, b) => {
            const tA = a.fecha instanceof Timestamp ? a.fecha.toMillis() : 0;
            const tB = b.fecha instanceof Timestamp ? b.fecha.toMillis() : 0;
            return tB - tA;
        });
    }, [allIngresos, localId]);

    // 4. Populate Data
    const clientMap = useMemo(() => {
        if (clientsLoading) return new Map();
        return new Map(clients.map(c => [c.id, c]));
    }, [clients, clientsLoading]);

    const professionalMap = useMemo(() => {
        if (professionalsLoading) return new Map();
        return new Map(professionals.map(p => [p.id, p.name]));
    }, [professionals, professionalsLoading]);

    const localMap = useMemo(() => new Map(locales.map(l => [l.id, l.name])), [locales]);


    const salesWithClientData = useMemo(() => {
        if (salesLoading || clientsLoading) return [];
        const sortedSales = [...sales].sort((a, b) => {
            const tA = a.fecha_hora_venta instanceof Timestamp ? a.fecha_hora_venta.toMillis() : 0;
            const tB = b.fecha_hora_venta instanceof Timestamp ? b.fecha_hora_venta.toMillis() : 0;
            return tB - tA;
        });
        return sortedSales.map(sale => ({
            ...sale,
            client: clientMap.get(sale.cliente_id)
        }))
    }, [sales, clientMap, salesLoading, clientsLoading]);

    const egresosWithData = useMemo(() => {
        if (egresosLoading || professionalsLoading) return [];
        return egresos.map(egreso => ({
            ...egreso,
            aQuienNombre: professionalMap.get(egreso.aQuien) || egreso.aQuien
        }))
    }, [egresos, professionalMap, egresosLoading, professionalsLoading]);


    // 5. Calculate Totals
    const ingresosManualesTotal = useMemo(() => roundMoney(ingresos.reduce((sum, i) => sum + i.monto, 0)), [ingresos]);

    const totalVentasFacturadas = useMemo(() => roundMoney(salesWithClientData.reduce((sum, sale) => {
        const amount = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
            ? sale.monto_pagado_real
            : (sale.total || 0);
        return sum + amount;
    }, 0)), [salesWithClientData]);

    const totalEgresos = useMemo(() => roundMoney(egresos.reduce((sum, egreso) => sum + egreso.monto, 0)), [egresos]);

    return {
        sales: salesWithClientData,
        egresos: egresosWithData,
        ingresos,
        loading,
        totals: {
            ventas: totalVentasFacturadas,
            ingresosManuales: ingresosManualesTotal,
            egresos: totalEgresos,
            flujo: roundMoney(totalVentasFacturadas + ingresosManualesTotal - totalEgresos)
        },
        maps: {
            client: clientMap,
            professional: professionalMap,
            local: localMap
        },
        raw: {
            locales // needed for dropdown
        }
    };
}
