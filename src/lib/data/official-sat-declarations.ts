export interface DeclaracionFiscalData {
  estado: 'pendiente' | 'presentada';
  estrategia: 'bancarizado' | 'bancarizado_mas_efectivo' | 'total' | 'personalizado' | 'meta_impuesto';
  metaImpuestoSAT?: number;
  montoPersonalizado?: number;
  porcentajeEfectivo?: number;
  comisionMercadoPagoFacturada?: number;
  ivaComisionesAcreditable?: number;
  ivaDevolucionesGastos?: number;
  otrosGastosConFactura?: number;
  ivaOtrosGastosAcreditable?: number;
  folioOperacionSAT?: string;
  lineaCaptura?: string;
  fechaPago?: string;
  notas?: string;
  montoDeclaradoFinal?: number;
  isrPagadoFinal?: number;
  ivaPagadoFinal?: number;
  totalPagadoFinal?: number;
  facturaGlobalSellada?: boolean;
  folioFacturaGlobal?: string;
  fechaFacturaGlobal?: string;
  montoFacturaGlobal?: number;
  pasoActivo?: 'paso1' | 'paso2' | 'paso3' | 'historial';
}

// Registros oficiales de Declaraciones y Acuses SAT 2026 (solo servidor)
export const OFFICIAL_SAT_DECLARATIONS_2026: Record<string, DeclaracionFiscalData> = {
  marzo: {
    estado: 'presentada',
    estrategia: 'personalizado',
    montoPersonalizado: 0,
    porcentajeEfectivo: 20,
    comisionMercadoPagoFacturada: 89,
    ivaComisionesAcreditable: 0,
    ivaDevolucionesGastos: 0,
    otrosGastosConFactura: 0,
    ivaOtrosGastosAcreditable: 0,
    folioOperacionSAT: '262050097927',
    lineaCaptura: 'Sin línea de captura (Declaración en $0)',
    fechaPago: '2026-04-13',
    notas: 'Declaración Marzo 2026 presentada en ceros el 13/04/2026 (Operación 262050097927). Ingresos: $0 | ISR: $0 | IVA: $0 (1 factura recibida PUE con IVA $14 no acreditado) | Total Pagado: $0.',
    montoDeclaradoFinal: 0,
    isrPagadoFinal: 0,
    ivaPagadoFinal: 0,
    totalPagadoFinal: 0,
  },
  abril: {
    estado: 'presentada',
    estrategia: 'personalizado',
    montoPersonalizado: 0,
    porcentajeEfectivo: 20,
    comisionMercadoPagoFacturada: 146,
    ivaComisionesAcreditable: 0,
    ivaDevolucionesGastos: 0,
    otrosGastosConFactura: 0,
    ivaOtrosGastosAcreditable: 0,
    folioOperacionSAT: '263240154099',
    lineaCaptura: 'Sin línea de captura (Declaración en $0)',
    fechaPago: '2026-05-19',
    notas: 'Declaración Abril 2026 presentada en ceros el 19/05/2026 (Operación 263240154099). Ingresos: $0 | ISR: $0 | IVA: $0 (1 factura recibida PUE con IVA $23 no acreditado) | Total Pagado: $0.',
    montoDeclaradoFinal: 0,
    isrPagadoFinal: 0,
    ivaPagadoFinal: 0,
    totalPagadoFinal: 0,
  },
  mayo: {
    estado: 'presentada',
    estrategia: 'personalizado',
    montoPersonalizado: 2192.40,
    porcentajeEfectivo: 20,
    comisionMercadoPagoFacturada: 128,
    ivaComisionesAcreditable: 20,
    ivaDevolucionesGastos: 0,
    otrosGastosConFactura: 0,
    ivaOtrosGastosAcreditable: 0,
    folioOperacionSAT: '261780178246',
    lineaCaptura: 'Pagada según Acuse SAT (Operación 261780178246)',
    fechaPago: '2026-06-17',
    notas: 'Declaración Mayo 2026 presentada el 17/06/2026 (Operación 261780178246). CFDI Global PUE Subtotal: $1,890 ($2,192.40 con IVA) | ISR (1%): $19 | IVA Causado: $302 - IVA Acreditable Facturas Ingreso ($20) = $282 | Total Pagado: $301.',
    montoDeclaradoFinal: 2192.40,
    isrPagadoFinal: 19,
    ivaPagadoFinal: 282,
    totalPagadoFinal: 301,
  },
  junio: {
    estado: 'presentada',
    estrategia: 'personalizado',
    montoPersonalizado: 2263.16,
    porcentajeEfectivo: 20,
    comisionMercadoPagoFacturada: 121,
    ivaComisionesAcreditable: 19,
    ivaDevolucionesGastos: 0,
    otrosGastosConFactura: 0,
    ivaOtrosGastosAcreditable: 0,
    folioOperacionSAT: '261090202577',
    lineaCaptura: '0426 57AD 5900 5048 7270',
    fechaPago: '2026-07-20',
    notas: 'Declaración Junio 2026 presentada el 20/07/2026 (Operación 261090202577). Ingreso Base sin IVA: $1,951 ($2,263.16 con IVA) | ISR (1%): $20 | IVA Causado: $312 - IVA Acreditable Facturas Ingreso ($19) = $293 | Total Pagado: $313.',
    montoDeclaradoFinal: 2263.16,
    isrPagadoFinal: 20,
    ivaPagadoFinal: 293,
    totalPagadoFinal: 313,
  },
  julio: {
    estado: 'presentada',
    estrategia: 'personalizado',
    montoPersonalizado: 3365.16,
    porcentajeEfectivo: 20,
    comisionMercadoPagoFacturada: 1111,
    ivaComisionesAcreditable: 178,
    ivaDevolucionesGastos: 0,
    otrosGastosConFactura: 0,
    ivaOtrosGastosAcreditable: 0,
    folioOperacionSAT: '261820227117',
    lineaCaptura: '0426 5YR8 7700 5076 1224',
    fechaPago: '2026-08-18',
    notas: 'Declaración Julio 2026 presentada el 18/08/2026 (Operación 261820227117). CFDI Global PUE Subtotal: $2,901 ($3,365.16 con IVA) | ISR (1%): $29 | IVA Causado: $464 - IVA Acreditable Facturas Ingreso ($178) = $286 | Total Pagado: $315.',
    montoDeclaradoFinal: 3365.16,
    isrPagadoFinal: 29,
    ivaPagadoFinal: 286,
    totalPagadoFinal: 315,
  },
  agosto: {
    estado: 'presentada',
    estrategia: 'personalizado',
    montoPersonalizado: 4159.76,
    porcentajeEfectivo: 20,
    comisionMercadoPagoFacturada: 3153,
    ivaComisionesAcreditable: 325,
    ivaDevolucionesGastos: 11,
    otrosGastosConFactura: 0,
    ivaOtrosGastosAcreditable: 0,
    folioOperacionSAT: '262110250682',
    lineaCaptura: 'Pagada según Acuse SAT (Operación 262110250682)',
    fechaPago: '2026-09-18',
    notas: 'Declaración Agosto 2026 presentada el 18/09/2026 (Operación 262110250682). CFDI Global PUE Subtotal: $3,586 ($4,159.76 con IVA) | ISR (1%): $36 | IVA Causado: $574 - IVA Acreditable del periodo ($325 de $504 en facturas ingreso) + IVA Notas Egreso ($11) = $260 | Total Pagado: $296.',
    montoDeclaradoFinal: 4159.76,
    isrPagadoFinal: 36,
    ivaPagadoFinal: 260,
    totalPagadoFinal: 296,
  },
  septiembre: {
    estado: 'presentada',
    estrategia: 'personalizado',
    montoPersonalizado: 4236.32,
    porcentajeEfectivo: 20,
    comisionMercadoPagoFacturada: 4306,
    ivaComisionesAcreditable: 689,
    ivaDevolucionesGastos: 442,
    otrosGastosConFactura: 0,
    ivaOtrosGastosAcreditable: 0,
    folioOperacionSAT: '262180275773',
    lineaCaptura: '0426 7KXA 6400 5140 2218',
    fechaPago: '2026-10-20',
    notas: 'Declaración Septiembre 2026 presentada el 20/10/2026 (Operación 262180275773). CFDI Global PUE Subtotal: $3,652 ($4,236.32 con IVA) | ISR (1%): $37 | IVA Causado: $584 - IVA Acreditable Facturas Ingreso ($689) + IVA Notas Egreso ($442) = $337 | Total Pagado: $374.',
    montoDeclaradoFinal: 4236.32,
    isrPagadoFinal: 37,
    ivaPagadoFinal: 337,
    totalPagadoFinal: 374,
  },
  octubre: {
    estado: 'presentada',
    estrategia: 'personalizado',
    montoPersonalizado: 4255,
    porcentajeEfectivo: 20,
    comisionMercadoPagoFacturada: 268,
    ivaComisionesAcreditable: 43,
    ivaDevolucionesGastos: 5,
    otrosGastosConFactura: 0,
    ivaOtrosGastosAcreditable: 0,
    folioOperacionSAT: '261510299924',
    lineaCaptura: '0426 8CJ8 8500 5168 3200',
    fechaPago: '2026-11-19',
    notas: 'El pago lo hice con mercado pago el 19/11 (Operación 261510299924). CFDI Global PUE: $4,255 | ISR: $43 | IVA Causado: $681 - Retención IVA ($63) + IVA Devoluciones ($5) - IVA Acreditable Gastos ($43) = $580 | Total Pagado: $623.',
    montoDeclaradoFinal: 4255,
    isrPagadoFinal: 43,
    ivaPagadoFinal: 580,
    totalPagadoFinal: 623,
  },
};
