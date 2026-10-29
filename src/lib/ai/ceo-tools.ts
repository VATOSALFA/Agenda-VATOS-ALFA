import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { getDb } from '@/lib/firebase-server';
import { isClientWithApp } from '@/lib/client-app-helper';
import { sanitizeExternalUntrustedText } from './ceo-security';

const MONTH_NAMES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function toDateSafe(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts._seconds === 'number') return new Date(ts._seconds * 1000);
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateMx(d: Date | null): string {
  if (!d) return 'Sin fecha';
  return d.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Helper interno reutilizable para calcular el Estado de Resultados (P&L) de cualquier rango de fechas.
 */
export async function computeFinancialStatementForRange(
  startDate: Date,
  endDate: Date,
  monthKey?: string // ej. "octubre_2026"
) {
  const db = getDb();

  const [salesSnap, egresosSnap, profSnap, prodSnap, usersSnap] = await Promise.all([
    db
      .collection('ventas')
      .where('fecha_hora_venta', '>=', admin.firestore.Timestamp.fromDate(startDate))
      .where('fecha_hora_venta', '<=', admin.firestore.Timestamp.fromDate(endDate))
      .get(),
    db
      .collection('egresos')
      .where('fecha', '>=', admin.firestore.Timestamp.fromDate(startDate))
      .where('fecha', '<=', admin.firestore.Timestamp.fromDate(endDate))
      .get(),
    db.collection('profesionales').get(),
    db.collection('productos').get(),
    db.collection('usuarios').get(),
  ]);

  const profMap = new Map<string, any>();
  profSnap.forEach((d) => profMap.set(d.id, { id: d.id, ...d.data() }));

  const prodMap = new Map<string, any>();
  prodSnap.forEach((d) => prodMap.set(d.id, { id: d.id, ...d.data() }));

  let ingresoServiciosTotal = 0;
  let ventaProductosTotal = 0;
  let reinversionProductos = 0;
  let totalTickets = 0;

  const ingresosPorMetodo: Record<string, number> = {
    efectivo: 0,
    tarjeta: 0,
    transferencia: 0,
    en_linea: 0,
  };

  const barberMetrics: Record<
    string,
    {
      id: string;
      nombre: string;
      serviciosRealizados: number;
      ingresosGenerados: number;
      comisionEstimada50: number;
      propinasRecibidas: number;
    }
  > = {};

  profSnap.forEach((d) => {
    const p = d.data();
    barberMetrics[d.id] = {
      id: d.id,
      nombre: p.name || p.publicName || p.nombre || d.id,
      serviciosRealizados: 0,
      ingresosGenerados: 0,
      comisionEstimada50: 0,
      propinasRecibidas: 0,
    };
  });

  salesSnap.forEach((doc) => {
    const sale = doc.data();
    totalTickets++;
    const saleTotal = Number(sale.total || 0);
    const realPaid =
      sale.pago_estado === 'deposit_paid' ||
      (sale.monto_pagado_real !== undefined && sale.monto_pagado_real < saleTotal)
        ? Number(sale.monto_pagado_real || 0)
        : saleTotal;

    const metodo = String(sale.metodo_pago || sale.payment_method || 'efectivo').toLowerCase();
    if (metodo.includes('tarjeta') || metodo.includes('terminal') || metodo.includes('point')) {
      ingresosPorMetodo.tarjeta += realPaid;
    } else if (metodo.includes('transfer')) {
      ingresosPorMetodo.transferencia += realPaid;
    } else if (metodo.includes('linea') || metodo.includes('mercado')) {
      ingresosPorMetodo.en_linea += realPaid;
    } else if (metodo.includes('combinado') && sale.detalle_pago_combinado) {
      ingresosPorMetodo.efectivo += Number(sale.detalle_pago_combinado.efectivo || 0);
      ingresosPorMetodo.tarjeta += Number(sale.detalle_pago_combinado.tarjeta || 0);
      ingresosPorMetodo.transferencia += Number(sale.detalle_pago_combinado.transferencia || 0);
      ingresosPorMetodo.en_linea += Number(sale.detalle_pago_combinado.pagos_en_linea || 0);
    } else {
      ingresosPorMetodo.efectivo += realPaid;
    }

    const computedSubtotal =
      Number(sale.subtotal || 0) ||
      (Array.isArray(sale.items)
        ? sale.items.reduce(
            (sum: number, it: any) =>
              sum + Number(it.subtotal ?? Number(it.precio || it.precio_unitario || 0) * Number(it.cantidad || 1)),
            0
          )
        : 0) ||
      realPaid ||
      1;

    if (Array.isArray(sale.items)) {
      sale.items.forEach((item: any) => {
        const qty = Number(item.cantidad || 1);
        const itemSub = Number(item.subtotal ?? Number(item.precio || item.precio_unitario || 0) * qty);
        const proportion = computedSubtotal > 0 ? itemSub / computedSubtotal : 0;
        const finalItemPrice = proportion * realPaid;

        if (item.tipo === 'producto') {
          ventaProductosTotal += finalItemPrice;
          const prod = prodMap.get(item.id);
          const costoCompra = Number(prod?.precio_compra || prod?.costo || item.costo || finalItemPrice * 0.55);
          reinversionProductos += costoCompra * qty;
        } else {
          ingresoServiciosTotal += finalItemPrice;
          const bId = item.barbero_id || item.profesional_id;
          if (bId) {
            if (!barberMetrics[bId]) {
              const pData = profMap.get(bId);
              barberMetrics[bId] = {
                id: bId,
                nombre: pData?.name || pData?.nombre || bId,
                serviciosRealizados: 0,
                ingresosGenerados: 0,
                comisionEstimada50: 0,
                propinasRecibidas: 0,
              };
            }
            barberMetrics[bId].serviciosRealizados += qty;
            barberMetrics[bId].ingresosGenerados += finalItemPrice;
            const profObj = profMap.get(bId);
            const commPct = Number(profObj?.defaultCommission?.value || 50);
            barberMetrics[bId].comisionEstimada50 += finalItemPrice * (commPct / 100);
          }
        }
      });
    }

    if (Array.isArray(sale.propina_detalles)) {
      sale.propina_detalles.forEach((p: any) => {
        if (p.barbero_id && barberMetrics[p.barbero_id]) {
          barberMetrics[p.barbero_id].propinasRecibidas += Number(p.monto || 0);
        }
      });
    }
  });

  // Procesar Egresos reales (Cash basis idéntico a /finanzas/[month])
  let totalComisionesServicios = 0;
  let totalComisionesProductos = 0;
  let totalPropinasPagadas = 0;
  let nominaTotal = 0;
  let insumosTotal = 0;
  let costosFijosTotal = 0;
  let otrosEgresosTotal = 0;

  const parseCommentAmt = (val: string) => {
    let c = val.replace(/[^0-9.,]/g, '');
    if (c.match(/,\d{1,2}$/)) c = c.replace(/(.*),(.*)/, '$1.$2');
    return parseFloat(c.replace(/,/g, '')) || 0;
  };

  egresosSnap.forEach((doc) => {
    const egreso = doc.data();
    const concepto = String(egreso.concepto || '').toLowerCase();
    const aQuien = String(egreso.aQuien || '');
    const monto = Number(egreso.monto || 0);

    if (concepto === 'nómina' || concepto === 'nomina') {
      nominaTotal += monto;
      return;
    }
    if (aQuien === 'Insumos') {
      insumosTotal += monto;
      return;
    }
    if (aQuien === 'Costos fijos') {
      costosFijosTotal += monto;
      return;
    }

    const comentarios = String(egreso.comentarios || '');
    const sMatch = comentarios.match(/Comisión Servicios: \$([0-9.,]+)/);
    const pMatch = comentarios.match(/Comisión Productos: \$([0-9.,]+)/);
    const tMatch = comentarios.match(/Propina: \$([0-9.,]+)/);

    if (sMatch || pMatch || tMatch) {
      totalComisionesServicios += sMatch ? parseCommentAmt(sMatch[1]) : 0;
      totalComisionesProductos += pMatch ? parseCommentAmt(pMatch[1]) : 0;
      totalPropinasPagadas += tMatch ? parseCommentAmt(tMatch[1]) : 0;
    } else if (concepto.includes('comisi') || concepto.includes('pago')) {
      totalComisionesServicios += monto;
    } else if (concepto.includes('propina')) {
      totalPropinasPagadas += monto;
    } else {
      otrosEgresosTotal += monto;
    }
  });

  const egresoOperativoServicios =
    totalComisionesServicios + nominaTotal + insumosTotal + costosFijosTotal + otrosEgresosTotal;
  const subtotalUtilidadServicios = ingresoServiciosTotal - egresoOperativoServicios;

  // Buscar ajuste mensual o comisión de Administrador Local (Beatriz)
  let monthlyDocData: any = null;
  if (monthKey) {
    const mDoc = await db.collection('finanzas_mensuales').doc(monthKey).get();
    if (mDoc.exists) monthlyDocData = mDoc.data();
  }

  let comisionGerenciaTotal = 0;
  const desgloseGerencia: Array<{ id: string; nombre: string; porcentaje: number; monto: number }> = [];

  usersSnap.forEach((uDoc) => {
    const u = uDoc.data();
    const role = u.rol || u.role;
    if (role === 'Administrador local') {
      const override = monthlyDocData?.adminCommissions?.[uDoc.id];
      const pct = Number(override?.value ?? u.commissionValue ?? u.comision ?? 20);
      const monto = subtotalUtilidadServicios > 0 ? subtotalUtilidadServicios * (pct / 100) : 0;
      comisionGerenciaTotal += monto;
      desgloseGerencia.push({
        id: uDoc.id,
        nombre: u.nombre || u.name || u.displayName || 'Administrador Local',
        porcentaje: pct,
        monto: round2(monto),
      });
    }
  });

  const utilidadNetaServicios = subtotalUtilidadServicios - comisionGerenciaTotal;
  const utilidadNetaProductos = ventaProductosTotal - reinversionProductos - totalComisionesProductos;
  const ingresosTotalesConsolidados = ingresoServiciosTotal + ventaProductosTotal;
  const utilidadNetaTotalConsolidada = utilidadNetaServicios + utilidadNetaProductos;
  const margenNetoPorcentaje =
    ingresosTotalesConsolidados > 0
      ? (utilidadNetaTotalConsolidada / ingresosTotalesConsolidados) * 100
      : 0;

  return {
    ingresosTotalesConsolidados: round2(ingresosTotalesConsolidados),
    ingresoServiciosTotal: round2(ingresoServiciosTotal),
    ventaProductosTotal: round2(ventaProductosTotal),
    totalTickets,
    ticketPromedio: totalTickets > 0 ? round2(ingresosTotalesConsolidados / totalTickets) : 0,
    ingresosPorMetodo: {
      efectivo: round2(ingresosPorMetodo.efectivo),
      tarjeta: round2(ingresosPorMetodo.tarjeta),
      transferencia: round2(ingresosPorMetodo.transferencia),
      en_linea: round2(ingresosPorMetodo.en_linea),
    },
    egresosDesglose: {
      egresoOperativoServiciosTotal: round2(egresoOperativoServicios),
      comisionesServiciosPagadas: round2(totalComisionesServicios),
      comisionesProductosPagadas: round2(totalComisionesProductos),
      nominaFija: round2(nominaTotal),
      insumosBarberia: round2(insumosTotal),
      costosFijos: round2(costosFijosTotal),
      otrosEgresos: round2(otrosEgresosTotal),
      reinversionProductos: round2(reinversionProductos),
    },
    utilidades: {
      subtotalUtilidadServicios: round2(subtotalUtilidadServicios),
      comisionGerenciaTotal: round2(comisionGerenciaTotal),
      desgloseGerencia,
      utilidadNetaServicios: round2(utilidadNetaServicios),
      utilidadNetaProductos: round2(utilidadNetaProductos),
      utilidadNetaTotalConsolidada: round2(utilidadNetaTotalConsolidada),
      margenNetoPorcentaje: round2(margenNetoPorcentaje),
    },
    declaracionFiscalResico: monthlyDocData?.declaracion_fiscal || null,
    rendimientoPorBarbero: Object.values(barberMetrics)
      .filter((b) => b.serviciosRealizados > 0 || b.propinasRecibidas > 0)
      .map((b) => ({
        ...b,
        ingresosGenerados: round2(b.ingresosGenerados),
        comisionEstimada50: round2(b.comisionEstimada50),
        propinasRecibidas: round2(b.propinasRecibidas),
        margenBrutoParaBarberia: round2(b.ingresosGenerados - b.comisionEstimada50),
      }))
      .sort((a, b) => b.ingresosGenerados - a.ingresosGenerados),
  };
}

// ============================================================================
// 1. SUBAGENTE CFO: ESTADO DE RESULTADOS (P&L) Y FINANZAS
// ============================================================================
export const subagenteCfoEstadoResultadosTool = ai.defineTool(
  {
    name: 'subagente_cfo_estado_resultados',
    description:
      'Subagente CFO experto en Finanzas y Contabilidad de VATOS ALFA. Calcula el Estado de Resultados (P&L) real y exacto de cualquier mes o rango de fechas: ingresos por servicios y productos, desglose por método de pago, egresos (comisiones, nómina, insumos, costos fijos), subtotal de utilidad, comisión de gerencia (Beatriz), utilidad neta final del dueño, margen %, impuestos RESICO y rendimiento financiero por cada barbero.',
    inputSchema: z.object({
      anio: z.number().optional().describe('Año a consultar (ej. 2026). Por defecto 2026.'),
      mesNumero: z
        .number()
        .optional()
        .describe('Mes a consultar del 1 al 12 (1=Enero, 9=Septiembre, 10=Octubre). Por defecto el mes actual.'),
      compararConMesAnterior: z
        .boolean()
        .optional()
        .describe('Si es true, calcula también el mes inmediato anterior para entregar comparativa de crecimiento.'),
    }),
  },
  async ({ anio, mesNumero, compararConMesAnterior = true }) => {
    const now = new Date();
    const targetYear = anio || now.getFullYear();
    const targetMonthIndex = mesNumero ? Math.max(0, Math.min(11, mesNumero - 1)) : now.getMonth();

    const startCurrent = new Date(targetYear, targetMonthIndex, 1, 0, 0, 0, 0);
    const endCurrent = new Date(targetYear, targetMonthIndex + 1, 0, 23, 59, 59, 999);
    const monthKeyCurrent = `${MONTH_NAMES_ES[targetMonthIndex]}_${targetYear}`;

    const estadoActual = await computeFinancialStatementForRange(startCurrent, endCurrent, monthKeyCurrent);

    let estadoMesAnterior = null;
    if (compararConMesAnterior) {
      const prevDate = new Date(targetYear, targetMonthIndex - 1, 1);
      const prevYear = prevDate.getFullYear();
      const prevMonthIdx = prevDate.getMonth();
      const startPrev = new Date(prevYear, prevMonthIdx, 1, 0, 0, 0, 0);
      const endPrev = new Date(prevYear, prevMonthIdx + 1, 0, 23, 59, 59, 999);
      const monthKeyPrev = `${MONTH_NAMES_ES[prevMonthIdx]}_${prevYear}`;
      estadoMesAnterior = await computeFinancialStatementForRange(startPrev, endPrev, monthKeyPrev);
    }

    return {
      periodoConsultado: `${MONTH_NAMES_ES[targetMonthIndex].toUpperCase()} ${targetYear}`,
      estadoResultadosActual: estadoActual,
      estadoResultadosMesAnterior: estadoMesAnterior,
    };
  }
);

// ============================================================================
// 2. SUBAGENTE CFO: SIMULADOR FINANCIERO Y ESTRATÉGICO
// ============================================================================
export const subagenteCfoSimuladorFinancieroTool = ai.defineTool(
  {
    name: 'subagente_cfo_simulador_financiero',
    description:
      'Simula escenarios financieros sobre datos reales de VATOS ALFA: qué pasa con la Utilidad Neta del dueño si se modifica el % de utilidad de gerencia (Beatriz), el % de comisión de un barbero, si se sube o baja el precio de los servicios o si cambian los costos fijos.',
    inputSchema: z.object({
      mesBase: z.number().optional().describe('Mes base para la simulación (1-12, ej. 9=Septiembre, 10=Octubre).'),
      anioBase: z.number().optional().describe('Año base (ej. 2026).'),
      nuevoPorcentajeUtilidadGerencia: z
        .number()
        .optional()
        .describe('Nuevo porcentaje de utilidad para Gerencia/Administrador Local (ej. 23, 25, 27).'),
      barberoNombreOSimulacion: z
        .string()
        .optional()
        .describe('Nombre del barbero a simular cambio de comisión (ej. "Beatriz", "Eduardo", o "todos").'),
      nuevoPorcentajeComisionBarbero: z
        .number()
        .optional()
        .describe('Nuevo porcentaje de comisión de servicios para ese barbero (ej. 55, 60, 65).'),
      incrementoPrecioPorServicioMxn: z
        .number()
        .optional()
        .describe('Incremento en pesos MXN por cada servicio realizado (ej. 10, 15, 20).'),
      ajusteCostosFijosMxn: z
        .number()
        .optional()
        .describe('Cambio en costos fijos mensuales en MXN (positivo = aumento de gasto, negativo = ahorro).'),
    }),
  },
  async ({
    mesBase,
    anioBase,
    nuevoPorcentajeUtilidadGerencia,
    barberoNombreOSimulacion,
    nuevoPorcentajeComisionBarbero,
    incrementoPrecioPorServicioMxn = 0,
    ajusteCostosFijosMxn = 0,
  }) => {
    const now = new Date();
    const y = anioBase || now.getFullYear();
    const mIdx = mesBase ? Math.max(0, Math.min(11, mesBase - 1)) : now.getMonth();
    const start = new Date(y, mIdx, 1, 0, 0, 0, 0);
    const end = new Date(y, mIdx + 1, 0, 23, 59, 59, 999);
    const key = `${MONTH_NAMES_ES[mIdx]}_${y}`;

    const base = await computeFinancialStatementForRange(start, end, key);

    const totalServiciosMes = base.rendimientoPorBarbero.reduce((acc, b) => acc + b.serviciosRealizados, 0);
    const ingresoExtraPorPrecio = totalServiciosMes * incrementoPrecioPorServicioMxn;

    let diferenciaComisionBarbero = 0;
    let detalleBarberoSimulado = null;

    if (barberoNombreOSimulacion && nuevoPorcentajeComisionBarbero !== undefined) {
      const q = barberoNombreOSimulacion.toLowerCase().trim();
      const targets =
        q === 'todos'
          ? base.rendimientoPorBarbero
          : base.rendimientoPorBarbero.filter(
              (b) => b.nombre.toLowerCase().includes(q) || (q.includes('bety') && b.nombre.toLowerCase().includes('beatriz'))
            );

      targets.forEach((b) => {
        const comActual = b.comisionEstimada50;
        const comNueva = b.ingresosGenerados * (nuevoPorcentajeComisionBarbero / 100);
        diferenciaComisionBarbero += comNueva - comActual;
      });

      if (targets.length === 1) {
        const t = targets[0];
        detalleBarberoSimulado = {
          barbero: t.nombre,
          serviciosRealizados: t.serviciosRealizados,
          ingresosGenerados: t.ingresosGenerados,
          comisionActual50: t.comisionEstimada50,
          comisionSimulada: round2(t.ingresosGenerados * (nuevoPorcentajeComisionBarbero / 100)),
          diferenciaMensual: round2(diferenciaComisionBarbero),
        };
      }
    }

    const nuevoIngresoServicios = base.ingresoServiciosTotal + ingresoExtraPorPrecio;
    const nuevoEgresoServicios =
      base.egresosDesglose.egresoOperativoServiciosTotal + diferenciaComisionBarbero + ajusteCostosFijosMxn;
    const nuevoSubtotalUtilidad = nuevoIngresoServicios - nuevoEgresoServicios;

    const pctGerenciaActual = base.utilidades.desgloseGerencia[0]?.porcentaje ?? 20;
    const pctGerenciaSimulado =
      nuevoPorcentajeUtilidadGerencia !== undefined ? nuevoPorcentajeUtilidadGerencia : pctGerenciaActual;

    const nuevaComisionGerencia = nuevoSubtotalUtilidad > 0 ? nuevoSubtotalUtilidad * (pctGerenciaSimulado / 100) : 0;
    const nuevaUtilidadNetaServicios = nuevoSubtotalUtilidad - nuevaComisionGerencia;
    const nuevaUtilidadNetaTotal = nuevaUtilidadNetaServicios + base.utilidades.utilidadNetaProductos;

    const diferenciaParaElDueno = nuevaUtilidadNetaTotal - base.utilidades.utilidadNetaTotalConsolidada;

    return {
      periodoBase: `${MONTH_NAMES_ES[mIdx].toUpperCase()} ${y}`,
      escenarioActual: {
        ingresoServicios: base.ingresoServiciosTotal,
        subtotalUtilidadServicios: base.utilidades.subtotalUtilidadServicios,
        porcentajeGerencia: pctGerenciaActual,
        pagoGerencia: base.utilidades.comisionGerenciaTotal,
        utilidadNetaDueno: base.utilidades.utilidadNetaTotalConsolidada,
      },
      escenarioSimulado: {
        ingresoServicios: round2(nuevoIngresoServicios),
        subtotalUtilidadServicios: round2(nuevoSubtotalUtilidad),
        porcentajeGerencia: pctGerenciaSimulado,
        pagoGerencia: round2(nuevaComisionGerencia),
        detalleBarberoSimulado,
        utilidadNetaDueno: round2(nuevaUtilidadNetaTotal),
      },
      impactoParaElDueno: {
        diferenciaMensualMxn: round2(diferenciaParaElDueno),
        diferenciaAnualizadaMxn: round2(diferenciaParaElDueno * 12),
        interpretacion:
          diferenciaParaElDueno >= 0
            ? `Ganarías $${round2(diferenciaParaElDueno).toFixed(2)} MXN adicionales al mes.`
            : `Te costaría $${Math.abs(round2(diferenciaParaElDueno)).toFixed(2)} MXN adicionales al mes.`,
      },
    };
  }
);

// ============================================================================
// 3. SUBAGENTE AUDITOR FORENSE: PREVENCIÓN DE PÉRDIDAS Y ANTI-ROBO
// ============================================================================
export const subagenteAuditorForenseAntiroboTool = ai.defineTool(
  {
    name: 'subagente_auditor_forense_antirobo',
    description:
      'Subagente Auditor Forense de VATOS ALFA. Escanea ventas eliminadas (ventas_canceladas), bitácora de auditoría (audit_logs), uso de códigos 1234, cortes de caja, anticipos modificados y reservas atendidas sin pago para detectar posibles robos, fugas de efectivo o anomalías del personal.',
    inputSchema: z.object({
      diasAtras: z
        .number()
        .optional()
        .describe('Número de días hacia atrás para auditar (por defecto 15 días, máximo 90).'),
      filtrarPorUsuario: z
        .string()
        .optional()
        .describe('Nombre opcional de un miembro del personal para auditar con lupa (ej. "Beatriz", "Erika", "Zeus").'),
    }),
  },
  async ({ diasAtras = 15, filtrarPorUsuario }) => {
    const db = getDb();
    const days = Math.min(90, Math.max(1, diasAtras));
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [canceladasSnap, auditSnap, salesSnap, cortesSnap] = await Promise.all([
      db.collection('ventas_canceladas').get(),
      db.collection('audit_logs').get(),
      db
        .collection('ventas')
        .where('fecha_hora_venta', '>=', admin.firestore.Timestamp.fromDate(cutoffDate))
        .get(),
      db.collection('cortes_caja').get(),
    ]);

    const activeSalesByClient = new Map<string, any[]>();
    const activeSalesByReservation = new Map<string, any[]>();

    salesSnap.forEach((doc) => {
      const s = { id: doc.id, ...doc.data() } as any;
      const cId = s.cliente_id || s.client?.id;
      const rId = s.reservationId || s.reservation_id;
      if (cId) {
        if (!activeSalesByClient.has(cId)) activeSalesByClient.set(cId, []);
        activeSalesByClient.get(cId)!.push(s);
      }
      if (rId) {
        if (!activeSalesByReservation.has(rId)) activeSalesByReservation.set(rId, []);
        activeSalesByReservation.get(rId)!.push(s);
      }
    });

    // 1. Analizar cada venta eliminada en el rango
    const analisisVentasEliminadas: any[] = [];
    canceladasSnap.forEach((doc) => {
      const data = doc.data();
      const delDate = toDateSafe(data.eliminada_el);
      if (!delDate || delDate < cutoffDate) return;

      const userFilter = filtrarPorUsuario?.toLowerCase().trim();
      const elimPor = String(data.eliminada_por_nombre || '').toLowerCase();
      const creadoPor = String(data.creado_por_nombre || '').toLowerCase();
      if (userFilter && !elimPor.includes(userFilter) && !creadoPor.includes(userFilter)) return;

      const cId = data.cliente_id || data.client?.id;
      const rId = data.reservationId || data.reservation_id;

      const candidateReplacements = [
        ...(rId && activeSalesByReservation.get(rId) ? activeSalesByReservation.get(rId)! : []),
        ...(cId && activeSalesByClient.get(cId) ? activeSalesByClient.get(cId)! : []),
      ];

      // Deduplicar por id
      const uniqueReplacements = Array.from(new Map(candidateReplacements.map((item) => [item.id, item])).values());

      let veredicto = 'ALERTA_SIN_REINGRESO';
      let explicacionForense =
        'Se eliminó esta venta y NO se encontró un cobro activo posterior para la misma reserva o cliente en el periodo.';

      if (uniqueReplacements.length > 0) {
        const rep = uniqueReplacements[0];
        const diffMonto = Number(rep.total || 0) - Number(data.total || 0);
        if (diffMonto === 0) {
          veredicto = 'CORRECCION_LEGITIMA_MISMO_MONTO';
          explicacionForense = `Se reingresó la venta activa [${rep.id}] por el mismo monto ($${Number(rep.total).toFixed(2)}) con método ${rep.metodo_pago}.`;
        } else {
          veredicto = 'REINGRESO_CON_AJUSTE_DE_MONTO';
          explicacionForense = `Se eliminó por $${Number(data.total).toFixed(2)} (${data.metodo_pago}) y la venta activa final [${rep.id}] quedó en $${Number(rep.total).toFixed(2)} (${rep.metodo_pago}).`;
        }
      }

      analisisVentasEliminadas.push({
        ventaEliminadaId: doc.id,
        fechaEliminacion: formatDateMx(delDate),
        eliminadaPor: data.eliminada_por_nombre || 'Desconocido',
        creadaOriginalmentePor: data.creado_por_nombre || data.creado_por || 'Desconocido',
        cliente: data.cliente_nombre || data.client?.nombre || cId || 'Desconocido',
        montoEliminado: round2(data.total || 0),
        metodoPagoOriginal: data.metodo_pago || 'efectivo',
        serviciosOriginales: Array.isArray(data.items)
          ? data.items.map((i: any) => `${i.nombre} ($${i.precio_unitario || i.precio})`).join(', ')
          : 'Sin detalle',
        veredictoForense: veredicto,
        explicacionForense,
      });
    });

    // 2. Analizar bitácora de auditoría (audit_logs)
    const eventosCriticosAuditoria: any[] = [];
    const conteoPorUsuario: Record<string, { eliminaciones: number; autorizacionesCodigo: number; cancelacionesCita: number }> = {};

    auditSnap.forEach((doc) => {
      const a = doc.data();
      const t = toDateSafe(a.timestamp);
      if (!t || t < cutoffDate) return;

      const uName = a.userName || 'Desconocido';
      if (filtrarPorUsuario && !uName.toLowerCase().includes(filtrarPorUsuario.toLowerCase())) return;

      if (!conteoPorUsuario[uName]) {
        conteoPorUsuario[uName] = { eliminaciones: 0, autorizacionesCodigo: 0, cancelacionesCita: 0 };
      }

      const act = String(a.action || '').toLowerCase();
      if (act.includes('eliminar')) conteoPorUsuario[uName].eliminaciones++;
      if (act.includes('autorizaci') || a.authCode) conteoPorUsuario[uName].autorizacionesCodigo++;
      if (act.includes('cancelar')) conteoPorUsuario[uName].cancelacionesCita++;

      eventosCriticosAuditoria.push({
        fecha: formatDateMx(t),
        timestampMs: t.getTime(),
        usuario: uName,
        rol: a.userRole || 'Staff',
        accion: sanitizeExternalUntrustedText(a.action, 80),
        detalles: sanitizeExternalUntrustedText(a.details, 220),
        codigoUsado: a.authCode || null,
        severidad: a.severity || 'info',
      });
    });

    eventosCriticosAuditoria.sort((a, b) => b.timestampMs - a.timestampMs);

    // 3. Analizar cortes de caja recientes con diferencias
    const cortesConDiferencia: any[] = [];
    cortesSnap.forEach((doc) => {
      const c = doc.data();
      const d = toDateSafe(c.fecha) || toDateSafe(c.creado_el) || toDateSafe(c.timestamp);
      if (!d || d < cutoffDate) return;
      const diff = Number(c.diferencia_efectivo ?? c.diferencia ?? 0);
      if (Math.abs(diff) > 0.5) {
        cortesConDiferencia.push({
          id: doc.id,
          fecha: formatDateMx(d),
          responsable: c.usuario_nombre || c.cerrado_por_nombre || c.cajero_nombre || 'Recepción',
          diferenciaEfectivoMxn: round2(diff),
          observaciones: sanitizeExternalUntrustedText(c.observaciones || c.notas || '', 150),
        });
      }
    });

    const alertasSinReingreso = analisisVentasEliminadas.filter((v) => v.veredictoForense === 'ALERTA_SIN_REINGRESO');

    return {
      periodoAuditado: `Últimos ${days} días`,
      nivelRiesgoDetectado: alertasSinReingreso.length > 0 || cortesConDiferencia.length > 0 ? 'ATENCION_REQUERIDA' : 'LIMPIO_SIN_ROBO_DETECTADO',
      resumenEjecutivo: {
        totalVentasEliminadas: analisisVentasEliminadas.length,
        ventasEliminadasSinReingreso: alertasSinReingreso.length,
        cortesDeCajaConDescuadre: cortesConDiferencia.length,
        resumenAccionesPorPersonal: conteoPorUsuario,
      },
      analisisForenseVentasEliminadas: analisisVentasEliminadas,
      cortesDeCajaConDiferencia: cortesConDiferencia,
      ultimosEventosBitacora: eventosCriticosAuditoria.slice(0, 35),
    };
  }
);

// ============================================================================
// 4. SUBAGENTE VOZ DEL CLIENTE: QUEJAS, OPINIONES Y CHATS WHATSAPP
// ============================================================================
export const subagenteVozClienteYChatsTool = ai.defineTool(
  {
    name: 'subagente_voz_cliente_y_chats',
    description:
      'Subagente de Experiencia del Cliente (CX). Escucha y analiza todas las quejas, opiniones y calificaciones del Buzón de la App Móvil, así como las conversaciones recientes de WhatsApp para detectar inconformidades, tiempos lentos de respuesta o oportunidades de mejora.',
    inputSchema: z.object({
      limiteConversaciones: z.number().optional().describe('Número de conversaciones recientes a inspeccionar (por defecto 20).'),
    }),
  },
  async ({ limiteConversaciones = 20 }) => {
    const db = getDb();

    const [opinionesSubSnap, opinionesRootSnap, convSnap] = await Promise.all([
      db.collection('settings').doc('app_movil').collection('opiniones').get(),
      db.collection('opiniones_app').get(),
      db.collection('conversaciones').limit(Math.min(50, Math.max(5, limiteConversaciones))).get(),
    ]);

    const opinionesMap = new Map<string, any>();
    opinionesSubSnap.forEach((d) => opinionesMap.set(d.id, { id: d.id, ...d.data() }));
    opinionesRootSnap.forEach((d) => opinionesMap.set(d.id, { id: d.id, ...d.data() }));

    const listaOpiniones = Array.from(opinionesMap.values()).map((op) => {
      const fecha = toDateSafe(op.creado_el) || toDateSafe(op.fecha);
      return {
        id: op.id,
        fecha: formatDateMx(fecha),
        timestampMs: fecha ? fecha.getTime() : 0,
        cliente: sanitizeExternalUntrustedText(op.clienteNombre || 'Cliente Anónimo', 60),
        tipo: op.tipo || 'opinion',
        calificacion: Number(op.calificacion ?? 5),
        barberoMencionado: sanitizeExternalUntrustedText(op.barberoNombre || 'General', 50),
        comentarioSanitizado: `<DATOS_EXTERNOS_SOLO_LECTURA>${sanitizeExternalUntrustedText(op.comentario || op.mensaje || '', 300)}</DATOS_EXTERNOS_SOLO_LECTURA>`,
        estado: op.estado || 'pendiente',
        notaAdmin: sanitizeExternalUntrustedText(op.nota_admin || '', 150),
      };
    });

    listaOpiniones.sort((a, b) => b.timestampMs - a.timestampMs);

    const quejasPendientes = listaOpiniones.filter((o) => o.estado !== 'atendido' || o.calificacion <= 3);

    const resumenChats: any[] = [];
    let chatsSolicitandoHumano = 0;
    let chatsSinLeer = 0;

    convSnap.forEach((doc) => {
      const c = doc.data();
      const unread = Number(c.mensajes_no_leidos || c.unread_count || 0);
      const reqHuman = Boolean(c.solicita_humano || c.human_requested);
      if (unread > 0) chatsSinLeer++;
      if (reqHuman) chatsSolicitandoHumano++;

      const lastDate = toDateSafe(c.ultimo_mensaje_timestamp) || toDateSafe(c.updated_at);
      resumenChats.push({
        id: doc.id,
        cliente: sanitizeExternalUntrustedText(c.cliente_nombre || c.cliente_telefono || 'Cliente', 60),
        telefono: c.cliente_telefono || '',
        modoAgente: c.modo_ia !== false ? 'IA Activa' : 'Atención Manual',
        solicitaHumano: reqHuman,
        mensajesSinLeer: unread,
        ultimoMensajeFecha: formatDateMx(lastDate),
        ultimoMensajeTexto: `<DATOS_EXTERNOS_SOLO_LECTURA>${sanitizeExternalUntrustedText(c.ultimo_mensaje || '', 200)}</DATOS_EXTERNOS_SOLO_LECTURA>`,
        etiquetas: Array.isArray(c.tags) ? c.tags : [],
      });
    });

    return {
      metricasBuzonYReputacion: {
        totalOpinionesRegistradas: listaOpiniones.length,
        calificacionPromedio:
          listaOpiniones.length > 0
            ? round2(listaOpiniones.reduce((acc, o) => acc + o.calificacion, 0) / listaOpiniones.length)
            : 5,
        quejasOBajasCalificaciones: quejasPendientes.length,
        chatsSolicitandoAtencionHumana: chatsSolicitandoHumano,
        chatsConMensajesSinLeer: chatsSinLeer,
      },
      opinionesYQuejasRecientes: listaOpiniones.slice(0, 20),
      conversacionesRecientesWhatsApp: resumenChats.slice(0, 20),
    };
  }
);

// ============================================================================
// 5. SUBAGENTE COO: OPERACIONES, RENDIMIENTO DE AGENDA E INVENTARIO
// ============================================================================
export const subagenteCooOperacionesEquipoInventarioTool = ai.defineTool(
  {
    name: 'subagente_coo_operaciones_agenda_inventario',
    description:
      'Subagente COO de Operaciones. Analiza la ocupación de la agenda por día de la semana y por hora (detectando horas muertas y horas pico), la tasa de asistencia vs. cancelación/no-show por barbero, y audita el stock de productos de inventario.',
    inputSchema: z.object({
      diasAnalisisAgenda: z.number().optional().describe('Días hacia atrás para analizar agenda (por defecto 30 días).'),
    }),
  },
  async ({ diasAnalisisAgenda = 30 }) => {
    const db = getDb();
    const cutoff = new Date(Date.now() - Math.min(90, Math.max(7, diasAnalisisAgenda)) * 24 * 60 * 60 * 1000);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const [reservasSnap, productosSnap, profSnap] = await Promise.all([
      db.collection('reservas').where('fecha', '>=', cutoffStr).get(),
      db.collection('productos').get(),
      db.collection('profesionales').get(),
    ]);

    const profNames = new Map<string, string>();
    profSnap.forEach((d) => {
      const p = d.data();
      profNames.set(d.id, p.name || p.publicName || p.nombre || d.id);
    });

    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const citasPorDiaSemana: Record<string, number> = {
      Domingo: 0,
      Lunes: 0,
      Martes: 0,
      Miércoles: 0,
      Jueves: 0,
      Viernes: 0,
      Sábado: 0,
    };
    const citasPorHora: Record<string, number> = {};
    const desempenoBarberos: Record<
      string,
      { nombre: string; totalCitas: number; asistidas: number; canceladas: number; noAsistio: number }
    > = {};

    reservasSnap.forEach((doc) => {
      const r = doc.data();
      const estado = String(r.estado || '');
      const bId = r.barbero_id || 'sin_asignar';
      const bNombre = profNames.get(bId) || r.barbero_nombre || bId;

      if (!desempenoBarberos[bNombre]) {
        desempenoBarberos[bNombre] = { nombre: bNombre, totalCitas: 0, asistidas: 0, canceladas: 0, noAsistio: 0 };
      }
      desempenoBarberos[bNombre].totalCitas++;

      if (estado === 'Asiste' || estado === 'Pagado') {
        desempenoBarberos[bNombre].asistidas++;
        if (r.fecha) {
          const [yy, mm, dd] = String(r.fecha).split('-').map(Number);
          if (yy && mm && dd) {
            const dayName = diasSemana[new Date(yy, mm - 1, dd).getDay()];
            if (dayName) citasPorDiaSemana[dayName] = (citasPorDiaSemana[dayName] || 0) + 1;
          }
        }
        const horaBase = String(r.hora_inicio || r.hora || '').slice(0, 2) + ':00';
        if (horaBase.length === 5) {
          citasPorHora[horaBase] = (citasPorHora[horaBase] || 0) + 1;
        }
      } else if (estado === 'Cancelado') {
        desempenoBarberos[bNombre].canceladas++;
      } else if (estado === 'No asiste') {
        desempenoBarberos[bNombre].noAsistio++;
      }
    });

    // Analizar inventario de productos
    const alertasStock: any[] = [];
    let valorInventarioCosto = 0;
    let valorInventarioVenta = 0;

    productosSnap.forEach((doc) => {
      const p = doc.data();
      if (p.activo === false) return;
      const stock = Number(p.stock ?? p.cantidad ?? 0);
      const minStock = Number(p.stock_minimo ?? 3);
      const costo = Number(p.precio_compra ?? p.costo ?? 0);
      const precioVenta = Number(p.precio_publico ?? p.precio ?? 0);

      if (stock > 0) {
        valorInventarioCosto += stock * costo;
        valorInventarioVenta += stock * precioVenta;
      }

      if (stock <= minStock) {
        alertasStock.push({
          id: doc.id,
          producto: p.nombre || p.name || 'Producto',
          stockActual: stock,
          stockMinimo: minStock,
          precioVenta: round2(precioVenta),
          estado: stock <= 0 ? 'AGOTADO' : 'STOCK_BAJO',
        });
      }
    });

    return {
      periodoAnalizado: `Desde ${cutoffStr} hasta hoy`,
      demandaPorDiaSemana: citasPorDiaSemana,
      demandaPorHora: citasPorHora,
      productividadAgendaPorBarbero: Object.values(desempenoBarberos).map((b) => ({
        ...b,
        tasaEfectividadPct: b.totalCitas > 0 ? round2((b.asistidas / b.totalCitas) * 100) : 0,
      })),
      resumenInventario: {
        valorInventarioACostoMxn: round2(valorInventarioCosto),
        valorInventarioAVentaMxn: round2(valorInventarioVenta),
        utilidadPotencialEnAnaquelMxn: round2(valorInventarioVenta - valorInventarioCosto),
        productosAgotadosOBajos: alertasStock,
      },
    };
  }
);

// ============================================================================
// 6. SUBAGENTE CMO: ESTRATEGIA DE CLIENTES, RETENCIÓN VIP Y PASE ALFA
// ============================================================================
export const subagenteCmoClientesYLealtadTool = ai.defineTool(
  {
    name: 'subagente_cmo_clientes_y_lealtad',
    description:
      'Subagente CMO de Marketing y Retención. Analiza la base de datos de clientes, adopción de la App Móvil, pasivo de AlfaCoins y detecta clientes frecuentes o VIP en riesgo de abandono (que no han vuelto en más de 35 días) para lanzar estrategias.',
    inputSchema: z.object({
      diasInactividadRiesgo: z
        .number()
        .optional()
        .describe('Días sin visita para considerar a un cliente frecuente en riesgo de fuga (por defecto 35 días).'),
    }),
  },
  async ({ diasInactividadRiesgo = 35 }) => {
    const db = getDb();
    const clientsSnap = await db.collection('clientes').get();

    let totalClientes = 0;
    let clientesConApp = 0;
    let totalAlfaCoinsEnCirculacion = 0;
    let cortesGratisDisponibles = 0;
    const distribucionNiveles: Record<string, number> = {
      'Sin Nivel (Sin App)': 0,
      'Alfa Member': 0,
      'Alfa Gold': 0,
      'Alfa Black VIP': 0,
    };

    const clientesFrecuentesEnRiesgo: any[] = [];
    const nowMs = Date.now();
    const riskThresholdMs = diasInactividadRiesgo * 24 * 60 * 60 * 1000;

    clientsSnap.forEach((doc) => {
      const c = { id: doc.id, ...doc.data() } as any;
      if (c.activo === false) return;
      totalClientes++;

      const hasApp = isClientWithApp(c);
      if (hasApp) {
        clientesConApp++;
        const coins = Number(c.alfaCoins ?? c.alfa_coins ?? c.puntosLealtad ?? 0);
        totalAlfaCoinsEnCirculacion += Math.max(0, coins);
        const stamps = Number(c.cortes_acumulados ?? c.cortesAcumulados ?? 0);
        if (c.corte_gratis_disponible || stamps >= 9) cortesGratisDisponibles++;

        const nivel = c.nivel || (stamps >= 8 ? 'Alfa Black VIP' : stamps >= 4 ? 'Alfa Gold' : 'Alfa Member');
        distribucionNiveles[nivel] = (distribucionNiveles[nivel] || 0) + 1;
      } else {
        distribucionNiveles['Sin Nivel (Sin App)']++;
      }

      const visitas = Number(c.citas_asistidas ?? c.cortes_acumulados ?? 0);
      const gasto = Number(c.gasto_total ?? c.consumo_total ?? 0);
      const ultimaVisita = toDateSafe(c.ultima_visita) || toDateSafe(c.ultimo_corte);

      if ((visitas >= 4 || gasto >= 1000) && ultimaVisita) {
        const diffMs = nowMs - ultimaVisita.getTime();
        if (diffMs >= riskThresholdMs) {
          clientesFrecuentesEnRiesgo.push({
            id: doc.id,
            nombre: `${c.nombre || ''} ${c.apellido || ''}`.trim() || 'Cliente',
            telefono: c.telefono || '',
            visitasHistoricas: visitas,
            gastoHistoricoMxn: round2(gasto),
            diasSinVenir: Math.floor(diffMs / (24 * 60 * 60 * 1000)),
            tieneApp: hasApp,
          });
        }
      }
    });

    clientesFrecuentesEnRiesgo.sort((a, b) => b.gastoHistoricoMxn - a.gastoHistoricoMxn);

    return {
      resumenBaseClientes: {
        totalClientesActivos: totalClientes,
        clientesConAppMovil: clientesConApp,
        tasaAdopcionAppPct: totalClientes > 0 ? round2((clientesConApp / totalClientes) * 100) : 0,
        distribucionNiveles,
        totalAlfaCoinsEnCirculacion,
        cortesGratisListosParaCanje: cortesGratisDisponibles,
      },
      clientesValiososEnRiesgoDeAbandono: clientesFrecuentesEnRiesgo.slice(0, 25),
    };
  }
);

// ============================================================================
// 7. HERRAMIENTAS EJECUTIVAS: MEMORIA ESTRATÉGICA Y PROPUESTAS DE ACCIÓN
// ============================================================================
export const guardarMemoriaEstrategicaCeoTool = ai.defineTool(
  {
    name: 'guardar_memoria_estrategica_ceo',
    description:
      'Guarda una decisión estratégica, meta financiera, acuerdo de comisiones o nota importante del Administrador General en la memoria permanente de Janet CEO para darle seguimiento en futuras conversaciones.',
    inputSchema: z.object({
      titulo: z.string().describe('Título breve del acuerdo, meta o decisión estratégica.'),
      categoria: z
        .enum(['finanzas', 'personal_y_comisiones', 'estrategia_crecimiento', 'auditoria_seguridad', 'operaciones'])
        .describe('Categoría estratégica.'),
      detalle: z.string().describe('Descripción completa de la decisión, meta o instrucción a recordar.'),
      metaNumericaMxn: z.number().optional().describe('Monto meta opcional en MXN si aplica.'),
    }),
  },
  async ({ titulo, categoria, detalle, metaNumericaMxn }) => {
    const db = getDb();
    const docRef = await db.collection('ceo_memoria').add({
      titulo,
      categoria,
      detalle,
      metaNumericaMxn: metaNumericaMxn ?? null,
      activa: true,
      creado_en: FieldValue.serverTimestamp(),
    });

    return {
      exito: true,
      memoriaId: docRef.id,
      mensaje: `Decisión "${titulo}" guardada en la Bóveda de Memoria Estratégica de Janet CEO.`,
    };
  }
);

export const proponerAccionEjecutivaCeoTool = ai.defineTool(
  {
    name: 'proponer_accion_ejecutiva_ceo',
    description:
      'Genera una Tarjeta de Propuesta Ejecutiva lista para que el Administrador General la autorice y ejecute con su PIN Maestro (ej. crear una promoción, actualizar el precio de un servicio, cambiar el porcentaje de utilidad/comisión de gerencia o publicar un aviso oficial en la App Móvil).',
    inputSchema: z.object({
      tipoAccion: z
        .enum([
          'crear_promocion',
          'actualizar_precio_servicio',
          'ajustar_utilidad_gerencia',
          'publicar_aviso_app',
        ])
        .describe('Tipo de acción ejecutiva que se ejecutará en la plataforma al ser aprobada.'),
      tituloPropuesta: z.string().describe('Título ejecutivo claro de la acción propuesta.'),
      justificacionEstrategica: z
        .string()
        .describe('Por qué conviene ejecutar esta acción y qué impacto financiero/operativo tendrá.'),
      resumenAntes: z.string().describe('Estado actual antes del cambio (ej. "Utilidad Gerencia: 20%").'),
      resumenDespues: z.string().describe('Estado nuevo tras aplicar el cambio (ej. "Utilidad Gerencia: 26%").'),
      parametrosEjecucion: z
        .record(z.any())
        .describe(
          'Objeto JSON con los datos técnicos para ejecutar la acción: para actualizar_precio_servicio usar { servicioId, servicioNombre, nuevoPrecio }; para ajustar_utilidad_gerencia usar { nuevoPorcentaje }; para crear_promocion usar { nombre, descripcion, tipoDescuento, valorDescuento, codigo }; para publicar_aviso_app usar { titulo, mensaje }.'
        ),
    }),
  },
  async ({
    tipoAccion,
    tituloPropuesta,
    justificacionEstrategica,
    resumenAntes,
    resumenDespues,
    parametrosEjecucion,
  }) => {
    const db = getDb();
    const docRef = await db.collection('ceo_propuestas').add({
      tipoAccion,
      tituloPropuesta,
      justificacionEstrategica,
      resumenAntes,
      resumenDespues,
      parametrosEjecucion,
      estado: 'pendiente_aprobacion',
      creado_en: FieldValue.serverTimestamp(),
    });

    return {
      propuestaId: docRef.id,
      tipoAccion,
      tituloPropuesta,
      justificacionEstrategica,
      resumenAntes,
      resumenDespues,
      parametrosEjecucion,
      estado: 'pendiente_aprobacion',
      instruccion:
        'La tarjeta de aprobación ejecutiva ha sido generada y presentada en pantalla para que el Administrador General la autorice con su PIN Maestro.',
    };
  }
);

export const enviarConsignaAGerenciaSucursalTool = ai.defineTool(
  {
    name: 'enviar_consigna_a_gerencia_sucursal',
    description:
      'Envía un recordatorio, tarea operativa o consigna directa desde Dirección General (Janet CEO) hacia el panel de Janet Gerencia (Beatriz / Administradora Local), como recordar hacer conteo de inventario, comprar insumos o revisar un pendiente en sucursal.',
    inputSchema: z.object({
      categoria: z
        .enum(['inventario', 'insumos', 'equipo', 'operacion_general'])
        .describe('Categoría de la tarea o recordatorio para la administradora de sucursal.'),
      prioridad: z.enum(['alta', 'normal']).describe('Prioridad del recordatorio.'),
      titulo: z.string().describe('Título claro de la tarea para Beatriz (ej. "Conteo físico de pomadas y ceras").'),
      detalle: z.string().describe('Instrucción detallada que Janet Gerencia le mostrará y recordará a Beatriz.'),
      fechaLimite: z.string().optional().describe('Fecha sugerida en formato YYYY-MM-DD (opcional).'),
    }),
  },
  async ({ categoria, prioridad, titulo, detalle, fechaLimite }) => {
    const db = getDb();
    const docRef = await db.collection('gerencia_recordatorios').add({
      categoria,
      prioridad,
      titulo,
      detalle,
      fechaLimite: fechaLimite || null,
      origen: 'Dirección General (Janet CEO)',
      completado: false,
      creado_en: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      recordatorioId: docRef.id,
      mensaje: `Consigna enviada a Janet Gerencia para Beatriz: "${titulo}". Aparecerá de inmediato en su asistente flotante y panel de gerencia.`,
    };
  }
);

export function getCeoAgentTools() {
  return [
    subagenteCfoEstadoResultadosTool,
    subagenteCfoSimuladorFinancieroTool,
    subagenteAuditorForenseAntiroboTool,
    subagenteVozClienteYChatsTool,
    subagenteCooOperacionesEquipoInventarioTool,
    subagenteCmoClientesYLealtadTool,
    guardarMemoriaEstrategicaCeoTool,
    proponerAccionEjecutivaCeoTool,
    enviarConsignaAGerenciaSucursalTool,
  ];
}
