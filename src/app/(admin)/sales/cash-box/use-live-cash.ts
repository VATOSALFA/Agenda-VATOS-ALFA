
import { useMemo } from 'react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { where, orderBy, limit, Timestamp, type QueryConstraint } from 'firebase/firestore';
import { startOfDay } from "date-fns";
import type { Sale, Egreso, IngresoManual, CashClosing } from '@/lib/types';
import { roundMoney } from '@/lib/utils';

export function useLiveCash(selectedLocalId: string, queryKey: number) {
    // 1. Get Last Cut
    const lastCutConstraints = useMemo(() => {
        if (selectedLocalId === 'todos') return [orderBy('fecha_corte', 'desc'), limit(1)];
        return [where('local_id', '==', selectedLocalId), orderBy('fecha_corte', 'desc'), limit(1)];
    }, [selectedLocalId]);

    const { data: lastCuts, loading: cutsLoading } = useFirestoreQuery<CashClosing>(
        'cortes_caja',
        `last-cut-${selectedLocalId}-${queryKey}`,
        ...lastCutConstraints
    );
    const lastCut = lastCuts?.[0];

    const liveStartDate = useMemo(() => {
        if (lastCut) return lastCut.fecha_corte.toDate();
        return new Date(0); // If no cut ever, start from beginning
    }, [lastCut]);

    const baseCash = useMemo(() => {
        if (!lastCut) return 0;

        // Use total_sistema as the base for the next period to maintain continuity
        // and ignore manual counts/inputs from the modal ("No impact").
        // This effectively treats the cash cut as a snapshot/audit rather than a reset.
        if (lastCut.total_sistema !== undefined) {
            return lastCut.total_sistema;
        }

        // Fallback for legacy data
        if (lastCut.monto_entregado < 0 && lastCut.total_calculado !== undefined) {
            return lastCut.total_calculado;
        }
        return lastCut.fondo_base || 0;
    }, [lastCut]);

    // 2. Fetch Live Data (Transactions SINCE last cut)
    // We use a safe query (StartOfDay) to ensure we fetch all relevant docs even if timestamp index is slightly off slightly,
    // then filter strictly in memory.
    const liveQueryKey = `live-${selectedLocalId}-${liveStartDate.getTime()}-${queryKey}`;

    const { data: liveSales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', `sales-${liveQueryKey}`, ...useMemo(() => {
        const c: QueryConstraint[] = [];
        if (selectedLocalId !== 'todos') c.push(where('local_id', '==', selectedLocalId));
        // Safe fetch: Get everything from the start of the day of the last cut
        c.push(where('fecha_hora_venta', '>=', Timestamp.fromDate(startOfDay(liveStartDate))));
        return c;
    }, [selectedLocalId, liveStartDate, queryKey]));

    const { data: liveIngresos, loading: ingresosLoading } = useFirestoreQuery<IngresoManual>('ingresos_manuales', `ingresos-${liveQueryKey}`, ...useMemo(() => {
        const c: QueryConstraint[] = [];
        if (selectedLocalId !== 'todos') c.push(where('local_id', '==', selectedLocalId));
        c.push(where('fecha', '>=', Timestamp.fromDate(startOfDay(liveStartDate))));
        return c;
    }, [selectedLocalId, liveStartDate, queryKey]));

    const { data: liveEgresos, loading: egresosLoading } = useFirestoreQuery<Egreso>('egresos', `egresos-${liveQueryKey}`, ...useMemo(() => {
        const c: QueryConstraint[] = [];
        if (selectedLocalId !== 'todos') c.push(where('local_id', '==', selectedLocalId));
        c.push(where('fecha', '>=', Timestamp.fromDate(startOfDay(liveStartDate))));
        return c;
    }, [selectedLocalId, liveStartDate, queryKey]));

    // 3. Calculate Live Cash
    const liveCashInBox = useMemo(() => {
        const isAfterCut = (date: Date | Timestamp) => {
            const d = date instanceof Timestamp ? date.toDate() : date;
            return d > liveStartDate;
        };

        const salesCash = liveSales
            .filter(s => isAfterCut(s.fecha_hora_venta))
            .filter(s => s.metodo_pago === 'efectivo' || s.metodo_pago === 'combinado')
            .reduce((sum, sale) => {
                if (sale.metodo_pago === 'efectivo') {
                    const amount = (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < sale.total)
                        ? sale.monto_pagado_real
                        : (sale.total || 0);
                    return sum + amount;
                }
                return sum + (sale.detalle_pago_combinado?.efectivo || 0);
            }, 0);

        const ingresosCash = liveIngresos
            .filter(i => isAfterCut(i.fecha))
            .reduce((sum, i) => sum + i.monto, 0);

        const egresosCash = liveEgresos
            .filter(e => isAfterCut(e.fecha))
            .reduce((sum, e) => sum + e.monto, 0);

        return roundMoney(baseCash + salesCash + ingresosCash - egresosCash);
    }, [baseCash, liveSales, liveIngresos, liveEgresos, liveStartDate]);

    return {
        liveCashInBox,
        loading: cutsLoading || salesLoading || ingresosLoading || egresosLoading,
        lastCutDate: liveStartDate
    };
}
