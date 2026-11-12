import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  Timestamp,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { isClientWithApp } from './client-app-helper';

export const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const VATOS_BENEFIT_SIGN_SALT = 'VA_SECURE_TOKEN_SALT_2026_VATOS_ALFA_SECURITY_KEY';

/**
 * Requisito mínimo de antigüedad para desbloquear el Regalo de Cumpleaños:
 * Al menos 5 visitas válidas pagadas cuyo consumo individual en servicio sea igual o mayor
 * a la tarifa vigente del corte de cabello en ese momento.
 */
export const MIN_BIRTHDAY_ELIGIBLE_VISITS = 5;

export interface BirthdayValidationResult {
  hasBirthday: boolean;
  isBirthdayMonth: boolean;
  birthMonthNum?: number;
  birthMonthName?: string;
  currentMonthNum: number;
  currentMonthName: string;
  birthDateFormatted?: string;
  isoDate?: string;
  isEligible: boolean;
  rejectionReason?: string;
}

export function parseBirthMonthAndDay(
  birthVal: any
): { month: number; day: number; year?: number; formatted: string; iso?: string } | null {
  if (!birthVal) return null;

  // If Firestore Timestamp or Date object
  if (typeof birthVal === 'object') {
    const d = birthVal.toDate
      ? birthVal.toDate()
      : birthVal._seconds
      ? new Date(birthVal._seconds * 1000)
      : birthVal.seconds
      ? new Date(birthVal.seconds * 1000)
      : birthVal instanceof Date
      ? birthVal
      : null;
    if (d && !isNaN(d.getTime())) {
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const year = d.getFullYear();
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return {
        month,
        day,
        year,
        formatted: `${day} de ${MONTH_NAMES_ES[month - 1]}${year ? ` de ${year}` : ''}`,
        iso,
      };
    }
  }

  if (typeof birthVal !== 'string') return null;
  const trimmed = birthVal.trim();
  if (!trimmed) return null;

  // Format: "7 de Febrero de 1985" or "15 de Mayo"
  if (trimmed.toLowerCase().includes(' de ')) {
    const parts = trimmed.split(/\s+de\s+/i);
    const day = parseInt(parts[0], 10);
    const monthStr = (parts[1] || '').trim().toLowerCase();
    const monthIndex = MONTH_NAMES_ES.findIndex(m => m.toLowerCase() === monthStr);
    const year = parts[2] ? parseInt(parts[2], 10) : undefined;
    if (monthIndex >= 0 && !isNaN(day) && day >= 1 && day <= 31) {
      const month = monthIndex + 1;
      const iso = year
        ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        : undefined;
      return {
        month,
        day,
        year,
        formatted: `${day} de ${MONTH_NAMES_ES[month - 1]}${year ? ` de ${year}` : ''}`,
        iso,
      };
    }
  }

  // Format: YYYY-MM-DD (ISO canónico) or DD/MM/YYYY or DD-MM-YYYY
  const cleanDatePart = trimmed.includes('T') ? trimmed.split('T')[0] : trimmed;
  const parts = cleanDatePart.split(/[-/]/);
  if (parts.length >= 2) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2] || '1', 10);
      if (month >= 1 && month <= 12 && !isNaN(day) && day >= 1 && day <= 31) {
        const iso = !isNaN(year)
          ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          : undefined;
        return {
          month,
          day,
          year: isNaN(year) ? undefined : year,
          formatted: `${day} de ${MONTH_NAMES_ES[month - 1]}${!isNaN(year) ? ` de ${year}` : ''}`,
          iso,
        };
      }
    } else {
      // DD/MM/YYYY or DD-MM-YYYY (con respaldo si p1 > 12 en formato MM/DD/YYYY)
      const p0 = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);
      const year = parts[2] ? parseInt(parts[2], 10) : undefined;

      let day = p0;
      let month = p1;
      if (p1 > 12 && p0 >= 1 && p0 <= 12) {
        month = p0;
        day = p1;
      }

      if (month >= 1 && month <= 12 && !isNaN(day) && day >= 1 && day <= 31) {
        const iso =
          year && !isNaN(year)
            ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            : undefined;
        return {
          month,
          day,
          year: year && !isNaN(year) ? year : undefined,
          formatted: `${day} de ${MONTH_NAMES_ES[month - 1]}${year && !isNaN(year) ? ` de ${year}` : ''}`,
          iso,
        };
      }
    }
  }

  return null;
}

/**
 * Normaliza cualquier fecha válida a formato ISO canónico 'YYYY-MM-DD' para sincronizar App y Agenda Web.
 */
export function normalizeBirthdayToISO(birthVal: any): string | null {
  const parsed = parseBirthMonthAndDay(birthVal);
  if (!parsed || !parsed.year) return null;
  return `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`;
}

/**
 * Devuelve la fecha en español claro e inequívoco (ej. "7 de febrero de 1985").
 */
export function formatBirthdaySpanish(birthVal: any): string {
  const parsed = parseBirthMonthAndDay(birthVal);
  if (!parsed) return '';
  const monthLower = MONTH_NAMES_ES[parsed.month - 1].toLowerCase();
  return `${parsed.day} de ${monthLower}${parsed.year ? ` de ${parsed.year}` : ''}`;
}

/**
 * Convierte cualquier valor de fecha/Timestamp de Firestore o ISO a milisegundos epoch.
 */
export function extractTimestampMs(val: any): number | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val.getTime();
  }
  if (typeof val.toDate === 'function') {
    const d = val.toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d.getTime() : null;
  }
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    return val.seconds * 1000 + Math.floor((Number(val.nanoseconds) || 0) / 1e6);
  }
  if (typeof val === 'string') {
    const parsed = new Date(val).getTime();
    return isNaN(parsed) ? null : parsed;
  }
  if (typeof val === 'number' && val > 0) {
    return val < 1e12 ? val * 1000 : val;
  }
  return null;
}

/**
 * Obtiene el timestamp exacto (ms) en que el cliente descargó y se registró/vinculó en la App Móvil.
 * - Si tiene `fecha_registro_app` o `fecha_registro_app_iso`, usa esa fecha exacta.
 * - Si su cuenta nació directamente en la app (`origen` contiene `app_movil` o `app_store_reviewer`),
 *   usa `creado_en` o `cliente_desde`.
 * - Si era cliente previo de la barbería (`migracion_excel`, `web_publica`, `agenda`, etc.) y no tiene
 *   `fecha_registro_app`, devuelve `null` (solo contarán ventas con `lealtad_aplicada.aplicado === true`).
 */
export function getClientAppRegistrationMs(clientData: any): number | null {
  if (!clientData) return null;
  const explicitReg =
    extractTimestampMs(clientData.fecha_registro_app) ??
    extractTimestampMs(clientData.fecha_registro_app_iso);
  if (explicitReg) return explicitReg;

  const origen = String(clientData.origen || '').toLowerCase();
  if (origen.includes('app_movil') || origen.includes('app_store_reviewer')) {
    return (
      extractTimestampMs(clientData.creado_en) ??
      extractTimestampMs(clientData.cliente_desde) ??
      null
    );
  }
  return null;
}

/**
 * Determina si una venta pagada cuenta para el Pase Alfa (niveles, sellos y visitas elegibles).
 * Regla oficial: Todas las compras y visitas realizadas ANTES de que el cliente se registrara en la app
 * forman parte de su historial general de la barbería, pero NO cuentan para el Pase Alfa.
 */
export function isSaleCountedForPaseAlfa(saleData: any, clientData: any): boolean {
  if (!saleData) return false;
  const st = String(saleData.pago_estado || '').toLowerCase();
  if (
    st === 'cancelado' ||
    st === 'anulado' ||
    st === 'pendiente' ||
    st === 'pending_payment' ||
    st === 'pendiente_anticipo'
  ) {
    return false;
  }
  if (saleData.absorbed_in_sale_id || saleData.tipo_venta === 'anticipo') {
    return false;
  }

  // Si la venta fue procesada en Caja con lealtad Pase Alfa activa (y no revertida), cuenta siempre
  if (saleData.lealtad_aplicada?.aplicado === true && !saleData.lealtad_aplicada?.revertido) {
    return true;
  }

  if (!clientData) return false;

  const appRegMs = getClientAppRegistrationMs(clientData);
  if (!appRegMs) {
    // Cliente previo de la barbería sin fecha_registro_app y venta antigua sin lealtad_aplicada
    return false;
  }

  const saleMs =
    extractTimestampMs(saleData.fecha_hora_venta) ??
    extractTimestampMs(saleData.creado_en) ??
    extractTimestampMs(saleData.fecha_pago);

  if (!saleMs) return false;

  // Tolerancia de 60 segundos por desfase de reloj al momento de vincular en recepción
  return saleMs >= appRegMs - 60000;
}

/**
 * Calcula las visitas con servicio pagado y el consumo real ($ MXN) acumulados
 * EXCLUSIVAMENTE a partir de que el cliente se registró en la App Móvil (para Niveles Pase Alfa).
 */
export function calculatePaseAlfaStatsFromSales(
  salesDataList: any[],
  clientData: any
): { visits: number; spend: number } {
  let spend = 0;
  const visitDays = new Set<string>();

  for (let idx = 0; idx < (salesDataList || []).length; idx++) {
    const s = salesDataList[idx];
    if (!isSaleCountedForPaseAlfa(s, clientData)) continue;

    const saleTotal = Number(s.total ?? s.monto_pagado_real ?? 0);
    const coinsDisc = Number(s.descuento_alfacoins ?? 0);
    const realPaid = Math.max(0, saleTotal - coinsDisc);
    spend += realPaid;

    const items = Array.isArray(s.items) ? s.items : [];
    const hasService =
      items.length === 0 || items.some((it: any) => it.tipo === 'servicio' || !it.tipo);
    if (hasService && s.tipo_venta !== 'anticipo' && !String(s.id || '').startsWith('deposit_')) {
      const ms =
        extractTimestampMs(s.fecha_hora_venta) ??
        extractTimestampMs(s.creado_en);
      const dt = ms ? new Date(ms) : null;
      const dayKey =
        dt && !isNaN(dt.getTime())
          ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
          : `sale_${s.id || idx}`;
      visitDays.add(dayKey);
    }
  }

  return {
    visits: visitDays.size,
    spend: Math.round(spend * 100) / 100,
  };
}

/**
 * Calcula cuántas visitas elegibles pagadas acumula un cliente para desbloquear el Regalo de Cumpleaños:
 * - Solo ventas pagadas (no canceladas ni pendientes ni anticipos) posteriores a su registro en la App.
 * - Deben incluir al menos un servicio (excluye compras de puros productos como ceras o lociones).
 * - El importe real pagado en servicios debe ser >= al costo del corte de cabello en ese momento
 *   (`sale.tarifa_corte_aplicada` si existe; para ventas históricas previas a ajustes tarifarios se respeta $140 MXN).
 * - Se contabiliza máximo 1 visita elegible por día calendario.
 */
export function countEligibleHaircutVisitsFromSales(
  salesDataList: any[],
  currentHaircutPrice: number = 140,
  clientData?: any
): number {
  const eligibleDays = new Set<string>();
  const activePrice = currentHaircutPrice > 0 ? currentHaircutPrice : 140;

  for (let idx = 0; idx < (salesDataList || []).length; idx++) {
    const s = salesDataList[idx];
    if (!s) continue;
    const st = String(s.pago_estado || '').toLowerCase();
    if (
      st === 'cancelado' ||
      st === 'anulado' ||
      st === 'pendiente' ||
      st === 'pending_payment' ||
      st === 'pendiente_anticipo'
    ) {
      continue;
    }
    if (s.absorbed_in_sale_id || s.tipo_venta === 'anticipo') {
      continue;
    }
    if (clientData && !isSaleCountedForPaseAlfa(s, clientData)) {
      continue;
    }

    const recordedTariff = Number(s.tarifa_corte_aplicada || 0);
    const requiredMinAtMoment =
      recordedTariff > 0 ? recordedTariff : Math.min(activePrice, 140);

    const saleTotal = Number(s.total ?? s.monto_pagado_real ?? 0);
    const coinsDisc = Number(s.descuento_alfacoins ?? 0);
    const realPaidTotal = Math.max(0, saleTotal - coinsDisc);
    if (realPaidTotal + 0.01 < requiredMinAtMoment) {
      continue;
    }

    const items = Array.isArray(s.items) ? s.items : [];
    let hasEligibleService = false;

    if (items.length === 0) {
      hasEligibleService = realPaidTotal + 0.01 >= requiredMinAtMoment;
    } else {
      for (const it of items) {
        const tipo = String(it?.tipo || 'servicio').toLowerCase();
        const nombreLower = String(it?.nombre || '').toLowerCase();
        const isProduct =
          tipo === 'producto' ||
          /\b(cera|pomada|shampoo|aceite|b[aá]lsamo|locion|loci[oó]n|after\s*shave|gel|polvo|peine|cepillo)\b/i.test(
            nombreLower
          );
        if (isProduct) continue;

        const qty = Math.max(1, Number(it?.cantidad || 1));
        const unitGross = Number(it?.precio_unitario ?? it?.precio ?? 0);
        let totalItemDiscount = 0;
        if (it?.descuento && typeof it.descuento === 'object') {
          totalItemDiscount = Number(it.descuento.monto || 0);
        }
        const netUnit = Math.max(0, (unitGross * qty - totalItemDiscount) / qty);
        if (netUnit + 0.01 >= requiredMinAtMoment) {
          hasEligibleService = true;
          break;
        }
      }
    }

    if (!hasEligibleService) continue;

    const dt = s.fecha_hora_venta?.toDate
      ? s.fecha_hora_venta.toDate()
      : s.fecha_hora_venta?.seconds
      ? new Date(s.fecha_hora_venta.seconds * 1000)
      : s.creado_en?.toDate
      ? s.creado_en.toDate()
      : s.creado_en?.seconds
      ? new Date(s.creado_en.seconds * 1000)
      : typeof s.fecha_hora_venta === 'string'
      ? new Date(s.fecha_hora_venta)
      : null;

    const dayKey =
      dt && !isNaN(dt.getTime())
        ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
        : `sale_${s.id || idx}`;

    eligibleDays.add(dayKey);
  }

  const fromSales = eligibleDays.size;
  const fromHistoricalField = Number(
    clientData?.visitas_elegibles_historicas ?? clientData?.visitasElegiblesHistoricas ?? 0
  );
  const fromCurrentStamps = Number(
    clientData?.cortes_acumulados ?? clientData?.cortesAcumulados ?? 0
  );

  return Math.max(fromSales, fromHistoricalField, fromCurrentStamps);
}

export function validateClientBirthdayForBenefit(clientData: any): BirthdayValidationResult {
  const currentMonthNum = new Date().getMonth() + 1;
  const currentMonthName = MONTH_NAMES_ES[currentMonthNum - 1];

  const rawBirth =
    clientData?.fecha_nacimiento ||
    clientData?.cumpleanos ||
    clientData?.fechaNacimiento ||
    clientData?.dob;

  const parsed = parseBirthMonthAndDay(rawBirth);

  if (!parsed) {
    return {
      hasBirthday: false,
      isBirthdayMonth: false,
      currentMonthNum,
      currentMonthName,
      isEligible: false,
      rejectionReason:
        'El cliente no tiene fecha de nacimiento registrada en el sistema. Debe presentar su identificación oficial (INE) en recepción para registrarla antes de canjear su regalo de cumpleaños.',
    };
  }

  const isBirthdayMonth = parsed.month === currentMonthNum;
  const birthMonthName = MONTH_NAMES_ES[parsed.month - 1];

  if (!isBirthdayMonth) {
    return {
      hasBirthday: true,
      isBirthdayMonth: false,
      birthMonthNum: parsed.month,
      birthMonthName,
      currentMonthNum,
      currentMonthName,
      birthDateFormatted: parsed.formatted,
      isEligible: false,
      rejectionReason: `El mes de cumpleaños registrado del cliente es ${birthMonthName} (fecha: ${parsed.formatted}). No corresponde al mes actual (${currentMonthName}). Beneficio denegado.`,
    };
  }

  return {
    hasBirthday: true,
    isBirthdayMonth: true,
    birthMonthNum: parsed.month,
    birthMonthName,
    currentMonthNum,
    currentMonthName,
    birthDateFormatted: parsed.formatted,
    isEligible: true,
  };
}

/**
 * Verifica la firma criptográfica del código QR para prevenir folios falsificados
 */
export async function verifyBenefitSignature(
  clientId: string,
  folio: string,
  benefitId: string,
  year: number,
  signature?: string,
  fallbackBenefitId?: string
): Promise<boolean> {
  if (!signature) return false;

  const candidates = Array.from(
    new Set(
      [
        benefitId,
        fallbackBenefitId,
        'regalo_cumpleanos',
        'decimo_corte',
        'juntos_es_mejor',
        'invita_amigo',
        'beneficio_alfa',
      ].filter(Boolean)
    )
  ) as string[];

  for (const candidateId of candidates) {
    try {
      const rawString = `${clientId}:${folio}:${candidateId}:${year}:${VATOS_BENEFIT_SIGN_SALT}`;
      if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
        const msgBuffer = new TextEncoder().encode(rawString);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        const expectedToken = hashHex.slice(0, 16);
        if (expectedToken === signature.toUpperCase()) return true;
      }
    } catch (_) {}

    // Fallback determinista
    let hash = 0;
    const str = `${clientId}:${folio}:${candidateId}:${year}:${VATOS_BENEFIT_SIGN_SALT}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const fallbackToken = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
    if (fallbackToken === signature.toUpperCase()) return true;
  }

  return false;
}

export const REFERRAL_DISCOUNT_PERCENT = 20;
export const REFERRAL_HOST_REWARD_COINS = 500;
/** @deprecated Usa calculateReferralMinNetPurchase(currentHaircutPrice) para cálculo dinámico */
export const REFERRAL_MIN_PURCHASE_MXN = 112;

/**
 * Calcula el pago neto mínimo esperado (tras aplicar el 20% de descuento de bienvenida)
 * equivalente al consumo de un Corte de cabello vigente.
 * Ej: Corte $140 -> $112 MXN netos; Corte $160 -> $128 MXN netos.
 */
export function calculateReferralMinNetPurchase(haircutPrice: number = 140): number {
  const safePrice = haircutPrice > 0 ? haircutPrice : 140;
  return Math.round(safePrice * (1 - REFERRAL_DISCOUNT_PERCENT / 100) * 100) / 100;
}

export interface ReferralPurchaseEligibilityResult {
  isEligible: boolean;
  requiredGrossService: number;
  requiredNetPaid: number;
  grossServicesInCart: number;
}

/**
 * Evalúa dinámicamente si la compra del amigo invitado acredita los +500 Alfa Coins al anfitrión:
 * 1. El valor regular (antes del descuento) de los servicios consumidos debe ser >= al precio vigente de 1 Corte de cabello.
 * 2. El dinero real efectivamente pagado (total en caja + anticipo pagado) debe ser >= al corte con el 20% de descuento aplicado.
 */
export function evaluateReferralPurchaseEligibility(params: {
  subtotal: number;
  realMoneyPaid: number;
  currentHaircutPrice?: number;
  cart?: Array<{ tipo?: string; precio?: number; cantidad?: number }>;
}): ReferralPurchaseEligibilityResult {
  const requiredGrossService = Number(params.currentHaircutPrice) > 0 ? Number(params.currentHaircutPrice) : 140;
  const requiredNetPaid = calculateReferralMinNetPurchase(requiredGrossService);

  const grossServicesInCart = Array.isArray(params.cart) && params.cart.length > 0
    ? params.cart.reduce((acc, it) => {
        if (it?.tipo && it.tipo !== 'servicio') return acc;
        return acc + Number(it?.precio || 0) * Math.max(1, Number(it?.cantidad || 1));
      }, 0)
    : Number(params.subtotal || 0);

  const effectiveGross = Math.max(grossServicesInCart, Array.isArray(params.cart) ? 0 : Number(params.subtotal || 0));
  const isGrossMet = effectiveGross + 0.01 >= requiredGrossService;
  const isNetMet = Number(params.realMoneyPaid || 0) + 0.01 >= requiredNetPaid;

  return {
    isEligible: isGrossMet && isNetMet,
    requiredGrossService,
    requiredNetPaid,
    grossServicesInCart: Math.round(effectiveGross * 100) / 100,
  };
}

export const JUNTOS_REWARD_COINS_PER_PERSON = 400;

/**
 * Valida si la fecha/hora actual (o la hora de inicio de la cita de hoy) corresponde a los días y horario
 * permitidos para "Juntos es Mejor": Lunes (1), Martes (2), Miércoles (3) de 10:00 a 14:00 hrs
 * (con tolerancia de salida en caja hasta las 14:30 hrs para citas de las 13:30-14:00).
 */
export function validateJuntosSchedule(
  date: Date = new Date(),
  reservationStartTime?: string
): {
  isValid: boolean;
  isDayValid: boolean;
  isTimeValid: boolean;
  reason?: string;
} {
  const day = date.getDay(); // 0 = Domingo, 1 = Lunes, 2 = Martes, 3 = Miércoles...
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  const isDayValid = day === 1 || day === 2 || day === 3;

  // Verificar si la cita de hoy del cliente inició entre 10:00 (600) y 14:00 (840)
  let isReservationTimeValid = false;
  if (reservationStartTime && /^\d{1,2}:\d{2}/.test(reservationStartTime.trim())) {
    const [rH, rM] = reservationStartTime.trim().split(':').map(Number);
    if (!isNaN(rH) && !isNaN(rM)) {
      const resMins = rH * 60 + rM;
      isReservationTimeValid = resMins >= 600 && resMins <= 840;
    }
  }

  // 10:00 am (600 mins) a 2:30 pm (870 mins tolerancia de cobro) o cita agendada en horario
  const isTimeValid = (timeInMinutes >= 600 && timeInMinutes <= 870) || isReservationTimeValid;

  if (!isDayValid) {
    const daysEs = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return {
      isValid: false,
      isDayValid: false,
      isTimeValid,
      reason: `⛔ DÍA NO VÁLIDO: La promoción "Juntos es Mejor" aplica únicamente Lunes, Martes y Miércoles. Hoy es ${daysEs[day]}.`,
    };
  }

  if (!isTimeValid) {
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    return {
      isValid: false,
      isDayValid: true,
      isTimeValid: false,
      reason: `⛔ HORARIO NO VÁLIDO: La promoción "Juntos es Mejor" aplica exclusivamente de 10:00 a. m. a 2:00 p. m. (Hora actual: ${timeStr} hrs).`,
    };
  }

  return { isValid: true, isDayValid: true, isTimeValid: true };
}

/**
 * Obtiene dinámicamente el precio vigente del corte de cabello regular desde la lista de servicios.
 * No hardcodea precios para adaptarse automáticamente a cambios de tarifas (ej. diciembre 2026).
 */
export function getCurrentHaircutPrice(services?: any[]): number {
  if (!services || !Array.isArray(services) || services.length === 0) return 140;

  // 1. Coincidencia exacta o prioritaria con "Corte de cabello" regular
  const exact = services.find(s => {
    const n = (s?.nombre || s?.name || '').trim().toLowerCase();
    return n === 'corte de cabello' || n === 'corte caballero' || n === 'corte regular';
  });
  if (exact && Number(exact.precio ?? exact.price) > 0) {
    return Number(exact.precio ?? exact.price);
  }

  // 2. Fallback a servicios de corte que no sean barba, grecas ni dama
  const fallback = services.find(s => {
    const n = (s?.nombre || s?.name || '').trim().toLowerCase();
    return n.includes('corte') && !n.includes('dama') && !n.includes('greca') && !n.includes('barba');
  });

  if (fallback && Number(fallback.precio ?? fallback.price) > 0) {
    return Number(fallback.precio ?? fallback.price);
  }

  return 140;
}

/**
 * Calcula el consumo mínimo total requerido para "Juntos es Mejor":
 * (1 titular + N menores de edad sin app) * precio vigente del corte
 */
export function calculateJuntosMinPurchase(haircutPrice: number, minorsCount: number = 0): number {
  const safeCount = Math.max(0, minorsCount);
  return haircutPrice * (1 + safeCount);
}

/**
 * Calcula las Alfa Coins totales a acreditar al titular:
 * 400 por el titular + (N * 400) por cada menor de edad acompañado
 */
export function calculateJuntosRewardCoins(minorsCount: number = 0): number {
  const safeCount = Math.max(0, minorsCount);
  return JUNTOS_REWARD_COINS_PER_PERSON * (1 + safeCount);
}

export function normalizeReferralNamePrefix(rawName?: string): string {
  if (!rawName) return 'VIP';
  const cleaned = rawName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 5);
  return cleaned || 'VIP';
}

export interface ParsedReferralCode {
  isValidFormat: boolean;
  fullCode: string;
  namePrefix: string;
  suffix: string;
  rejectionReason?: string;
}

/**
 * Valida la estructura del código ALFA-NOMBRE-XXXX y bloquea códigos genéricos o de invitado.
 */
export function parseAndValidateReferralCode(rawCode: string): ParsedReferralCode {
  const clean = (rawCode || '').trim().toUpperCase();
  const parts = clean.split('-');

  if (parts.length !== 3 || parts[0] !== 'ALFA') {
    return {
      isValidFormat: false,
      fullCode: clean,
      namePrefix: '',
      suffix: '',
      rejectionReason: '⛔ FORMATO DE CÓDIGO INVÁLIDO: El código de invitación debe tener el formato oficial ALFA-NOMBRE-XXXX.',
    };
  }

  const namePrefix = parts[1] || '';
  const suffix = parts[2] || '';

  // Bloquear códigos genéricos de cuentas invitado o manipulados
  const blockedGenericCodes = ['ALFA-VIP-2025', 'ALFA-VIP-CLUB', 'ALFA-GUEST-0000', 'ALFA-INVIT-CLUB'];
  const blockedSuffixes = ['CLUB', '2025', '2026', '0000'];

  if (
    blockedGenericCodes.includes(clean) ||
    blockedSuffixes.includes(suffix) ||
    namePrefix === 'GUEST' ||
    namePrefix === 'INVIT' ||
    namePrefix.length < 2 ||
    namePrefix.length > 5 ||
    !/^[A-Z]{2,5}$/.test(namePrefix) ||
    !/^[A-Z0-9]{4}$/.test(suffix)
  ) {
    return {
      isValidFormat: false,
      fullCode: clean,
      namePrefix,
      suffix,
      rejectionReason: '⛔ CÓDIGO NO AUTORIZADO: Este código corresponde a una sesión de invitado sin cuenta vinculada o fue generado artificialmente.',
    };
  }

  return {
    isValidFormat: true,
    fullCode: clean,
    namePrefix,
    suffix,
  };
}

/**
 * Busca de forma estricta (Doble Factor: Prefijo de Nombre + Últimos 4 dígitos de Teléfono/ID)
 * al cliente anfitrión en la base de datos oficial. Impide adivinar códigos al azar.
 */
export function findMatchingReferrerClient<T extends { id?: string; nombre?: string; telefono?: string }>(
  clients: T[],
  rawCode: string
): { hostClient: T | null; parsed: ParsedReferralCode; error?: string } {
  const parsed = parseAndValidateReferralCode(rawCode);
  if (!parsed.isValidFormat) {
    return { hostClient: null, parsed, error: parsed.rejectionReason };
  }

  const matched = clients.find(c => {
    const clientNamePrefix = normalizeReferralNamePrefix(c.nombre);
    const cleanPhone = (c.telefono || '').replace(/\D/g, '');
    const phoneSuffix = cleanPhone.length >= 4 ? cleanPhone.slice(-4) : '';
    const cleanId = (c.id || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const idSuffix = cleanId.length >= 4 ? cleanId.slice(-4) : '';

    // Doble factor obligatorio: DEBE coincidir el prefijo del nombre Y los 4 dígitos finales
    const nameMatches = clientNamePrefix === parsed.namePrefix;
    const suffixMatches =
      (phoneSuffix && phoneSuffix === parsed.suffix) ||
      (!phoneSuffix && idSuffix && idSuffix === parsed.suffix);

    return nameMatches && suffixMatches;
  });

  if (!matched) {
    return {
      hostClient: null,
      parsed,
      error: `⛔ CÓDIGO DE INVITACIÓN INVÁLIDO: El código "${parsed.fullCode}" no coincide con ningún miembro registrado en el sistema oficial de VATOS ALFA. Verifica que esté bien escrito.`,
    };
  }

  return { hostClient: matched, parsed };
}

export interface InvitedClientEligibilityResult {
  isEligible: boolean;
  rejectionReason?: string;
}

/**
 * Verifica bajo política Zero-Trust que el cliente invitado sea elegible:
 * 1. No sea el mismo cliente anfitrión (Anti Auto-Invitación).
 * 2. No haya usado ya un código de referido antes.
 * 3. Sea un cliente 100% nuevo sin historial de visitas, cortes ni compras previas.
 */
export function validateInvitedClientEligibility(
  invitedClient: any,
  hostClient: { id?: string; nombre?: string; telefono?: string } | null | undefined,
  previousCompletedSalesCount = 0
): InvitedClientEligibilityResult {
  if (!invitedClient) {
    return { isEligible: true }; // Aún no seleccionado en caja; se validará al seleccionarlo
  }

  const invPhone = (invitedClient.telefono || '').replace(/\D/g, '').slice(-10);
  const hostPhone = (hostClient?.telefono || '').replace(/\D/g, '').slice(-10);

  // 1. Bloqueo de Auto-Invitación
  if (
    (hostClient?.id && invitedClient.id === hostClient.id) ||
    (invPhone && hostPhone && invPhone.length >= 8 && invPhone === hostPhone)
  ) {
    return {
      isEligible: false,
      rejectionReason: '⛔ AUTO-INVITACIÓN DETECTADA: El titular del código de invitación no puede canjear su propio código ni referirse a sí mismo.',
    };
  }

  // 2. Bloqueo de Doble Canje de Referido
  if (invitedClient.beneficio_referido_usado === true || Boolean(invitedClient.referido_por_id)) {
    return {
      isEligible: false,
      rejectionReason: `⛔ BENEFICIO YA UTILIZADO: El cliente "${invitedClient.nombre || ''}" ya utilizó un código de invitación previamente. Solo se permite un canje por cliente nuevo.`,
    };
  }

  // 3. Bloqueo a Clientes con Historial Previo (Exclusivo Clientes Nuevos)
  const cortesAcumulados = Number(invitedClient.cortes_acumulados ?? invitedClient.cortesAcumulados ?? 0);
  const visitasPrevias = Number(invitedClient.visitas ?? invitedClient.total_visitas ?? 0);
  const gastoPrevio = Number(invitedClient.gasto_total ?? invitedClient.consumo_total ?? 0);

  if (cortesAcumulados > 0 || visitasPrevias > 0 || gastoPrevio > 0 || previousCompletedSalesCount > 0) {
    return {
      isEligible: false,
      rejectionReason: `⛔ CLIENTE NO ELEGIBLE: "${invitedClient.nombre || 'Este cliente'}" ya cuenta con historial previo en VATOS ALFA (${Math.max(cortesAcumulados, visitasPrevias, previousCompletedSalesCount)} visita(s) / compras registradas). La promoción "Invita a un Amigo" (20% de descuento) es exclusiva para clientes nuevos en su primera visita.`,
    };
  }

  return { isEligible: true };
}

// ============================================================================
// MOTOR DE NIVELES Y RANGOS PASE ALFA CLUB (EVALUACIÓN DINÁMICA Y PRIVILEGIOS)
// ============================================================================

export interface EvaluatedClientTier {
  activo: boolean;
  tierId: 'member' | 'gold' | 'vip' | 'none';
  tierName: string;
  hasApp?: boolean;
  cashbackPct: number;
  coinValue: number;
  color: string;
  colorTexto: string;
  visitasHistoricas: number;
  consumoHistorico: number;
  beneficios: string[];
  productDiscountPct: number;
  productDiscountLabel: string | null;
  birthdayBenefitText: string | null;
  nextTierName: string | null;
  faltanVisitas: number;
  faltaGasto: number;
}

export function extractProductDiscountFromBenefits(beneficios: string[]): {
  pct: number;
  label: string | null;
} {
  if (!Array.isArray(beneficios)) return { pct: 0, label: null };
  let bestPct = 0;
  let bestLabel: string | null = null;

  for (const raw of beneficios) {
    const text = String(raw || '').trim();
    if (!text) continue;
    const match = text.match(
      /(\d+(?:\.\d+)?)\s*%\s*(?:de\s*)?(?:descuento|desc\.?|off).*?(?:producto|productos|cera|pomada|aceite|tienda|cuidado|peinado|barba|shampoo|locion|loci[oó]n|gel)/i
    );
    if (match) {
      const val = Number(match[1]);
      if (!isNaN(val) && val > bestPct && val <= 100) {
        bestPct = val;
        bestLabel = text;
      }
    }
  }

  return { pct: bestPct, label: bestLabel };
}

export function evaluateClientAlfaTier(
  client: any | null | undefined,
  nivelesConfig: any | null | undefined,
  options?: {
    extraVisits?: number;
    extraSpend?: number;
    overrideVisits?: number;
    overrideSpend?: number;
    forceEvaluateWhenPaused?: boolean;
    appReservationClientIds?: Set<string>;
  }
): EvaluatedClientTier {
  const defaultTiers = {
    member: {
      id: 'member' as const,
      nombre: 'Alfa Member',
      cashbackPct: 3,
      visitasMin: 0,
      gastoMin: 0,
      color: '#2563EB',
      colorTexto: '#FFFFFF',
      beneficios: [
        '1 AlfaCoin por cada $1 MXN gastado (Retorno del 3% en monedero)',
        'Tarjeta digital Pase Alfa (10.° corte de cabello gratis)',
      ],
    },
    gold: {
      id: 'gold' as const,
      nombre: 'Alfa Gold',
      cashbackPct: 5,
      visitasMin: 12,
      gastoMin: 2400,
      color: '#C5A880',
      colorTexto: '#0F172A',
      beneficios: [
        '1 AlfaCoin por cada $1 MXN gastado con valor preferencial (Retorno del 5% en monedero)',
        '10% de descuento en ceras, pomadas y aceites para barba',
      ],
    },
    vip: {
      id: 'vip' as const,
      nombre: 'Alfa Black VIP',
      cashbackPct: 7,
      visitasMin: 24,
      gastoMin: 4800,
      color: '#0F172A',
      colorTexto: '#F8FAFC',
      beneficios: [
        '1 AlfaCoin por cada $1 MXN gastado con valor VIP exclusivo (Retorno del 7% en monedero)',
        '15% de descuento en todos los productos para cuidado y peinado',
      ],
    },
  };

  const isProgramActive = nivelesConfig ? nivelesConfig.activo !== false : true;
  const member = { ...defaultTiers.member, ...(nivelesConfig?.member || {}) };
  const gold = { ...defaultTiers.gold, ...(nivelesConfig?.gold || {}) };
  const vip = { ...defaultTiers.vip, ...(nivelesConfig?.vip || {}) };
  const criterio: 'visitas' | 'gasto' | 'ambos_opcional' =
    nivelesConfig?.criterio || 'ambos_opcional';

  // Regla oficial Pase Alfa: Las compras y visitas previas al registro en la App Móvil NO cuentan
  // para subir de nivel. Solo cuentan visitas_pase_alfa / cortes_acumulados y consumo_pase_alfa.
  const isNativeAppOrigin = Boolean(
    client &&
      (String(client.origen || '').toLowerCase().includes('app_movil') ||
        String(client.origen || '').toLowerCase().includes('app_store_reviewer'))
  );

  const baseVisits = client
    ? client.visitas_pase_alfa !== undefined
      ? Math.max(
          Number(client.visitas_pase_alfa ?? 0),
          Number(client.cortes_acumulados ?? client.cortesAcumulados ?? 0)
        )
      : isNativeAppOrigin
      ? Math.max(
          Number(client.citas_asistidas ?? 0),
          Number(client.visitas_totales ?? 0),
          Number(client.cortes_acumulados ?? client.cortesAcumulados ?? 0)
        )
      : Number(client.cortes_acumulados ?? client.cortesAcumulados ?? 0)
    : 0;

  const baseSpend = client
    ? client.consumo_pase_alfa !== undefined
      ? Number(client.consumo_pase_alfa ?? 0)
      : isNativeAppOrigin
      ? Math.max(
          Number(client.consumo_total ?? 0),
          Number(client.gasto_total ?? 0),
          Number(client.consumoTotal ?? 0)
        )
      : 0
    : 0;

  const v = Math.max(
    0,
    options?.overrideVisits !== undefined
      ? options.overrideVisits
      : baseVisits + (options?.extraVisits || 0)
  );
  const g = Math.max(
    0,
    Math.round(
      ((options?.overrideSpend !== undefined
        ? options.overrideSpend
        : baseSpend) +
        (options?.extraSpend || 0)) *
        100
    ) / 100
  );

  const hasApp = isClientWithApp(client, options?.appReservationClientIds);

  // Si no hay cliente seleccionado o el cliente NO tiene la app móvil instalada y usada:
  // Los clientes sin app NO tienen nivel ni beneficios del Pase Alfa.
  if (!client || !hasApp) {
    return {
      activo: false,
      tierId: 'none',
      tierName: 'Sin Nivel',
      hasApp: false,
      cashbackPct: 0,
      coinValue: 0,
      color: '#64748B',
      colorTexto: '#FFFFFF',
      visitasHistoricas: 0,
      consumoHistorico: 0,
      beneficios: [],
      productDiscountPct: 0,
      productDiscountLabel: null,
      birthdayBenefitText: null,
      nextTierName: null,
      faltanVisitas: 0,
      faltaGasto: 0,
    };
  }

  // Si el programa de niveles está en pausa (y no se fuerza evaluación)
  if (!isProgramActive && !options?.forceEvaluateWhenPaused) {
    const basePct = Number(member.cashbackPct ?? 3);
    return {
      activo: isProgramActive,
      tierId: 'member',
      tierName: member.nombre || 'Alfa Member',
      hasApp: true,
      cashbackPct: basePct,
      coinValue: basePct / 100,
      color: member.color || '#2563EB',
      colorTexto: member.colorTexto || '#FFFFFF',
      visitasHistoricas: v,
      consumoHistorico: g,
      beneficios: [],
      productDiscountPct: 0,
      productDiscountLabel: null,
      birthdayBenefitText: null,
      nextTierName: null,
      faltanVisitas: 0,
      faltaGasto: 0,
    };
  }

  const vipVisitasMin = Number(vip.visitasMin ?? 24);
  const vipGastoMin = Number(vip.gastoMin ?? 4800);
  const goldVisitasMin = Number(gold.visitasMin ?? 12);
  const goldGastoMin = Number(gold.gastoMin ?? 2400);

  let isVip = false;
  let isGold = false;

  if (criterio === 'visitas') {
    isVip = v >= vipVisitasMin;
    isGold = v >= goldVisitasMin;
  } else if (criterio === 'gasto') {
    isVip = g >= vipGastoMin;
    isGold = g >= goldGastoMin;
  } else {
    isVip = v >= vipVisitasMin || g >= vipGastoMin;
    isGold = v >= goldVisitasMin || g >= goldGastoMin;
  }

  const selectedTier = isVip ? vip : isGold ? gold : member;
  const tierId: 'member' | 'gold' | 'vip' = isVip ? 'vip' : isGold ? 'gold' : 'member';
  const pct = Number(
    selectedTier.cashbackPct ?? (isVip ? 7 : isGold ? 5 : 3)
  );
  const tierBenefits: string[] = Array.isArray(selectedTier.beneficios)
    ? selectedTier.beneficios.filter((b: any) => typeof b === 'string' && b.trim().length > 0)
    : [];

  const prodDisc = extractProductDiscountFromBenefits(tierBenefits);
  const birthdayBenefitText =
    tierBenefits.find((b: string) => /cumplea[ñn]os/i.test(b)) || null;

  let nextTierName: string | null = null;
  let faltanVisitas = 0;
  let faltaGasto = 0;

  if (tierId === 'member') {
    nextTierName = gold.nombre || 'Alfa Gold';
    faltanVisitas = Math.max(0, goldVisitasMin - v);
    faltaGasto = Math.max(0, Math.round((goldGastoMin - g) * 100) / 100);
  } else if (tierId === 'gold') {
    nextTierName = vip.nombre || 'Alfa Black VIP';
    faltanVisitas = Math.max(0, vipVisitasMin - v);
    faltaGasto = Math.max(0, Math.round((vipGastoMin - g) * 100) / 100);
  }

  return {
    activo: isProgramActive,
    tierId,
    tierName: selectedTier.nombre || (isVip ? 'Alfa Black VIP' : isGold ? 'Alfa Gold' : 'Alfa Member'),
    hasApp: true,
    cashbackPct: pct,
    coinValue: pct / 100,
    color: selectedTier.color || (isVip ? '#0F172A' : isGold ? '#C5A880' : '#2563EB'),
    colorTexto: selectedTier.colorTexto || (isGold ? '#0F172A' : '#FFFFFF'),
    visitasHistoricas: v,
    consumoHistorico: g,
    beneficios: tierBenefits,
    productDiscountPct: prodDisc.pct,
    productDiscountLabel: prodDisc.label,
    birthdayBenefitText,
    nextTierName,
    faltanVisitas,
    faltaGasto,
  };
}

// ============================================================================
// REGLAS AUTOMÁTICAS DE ACREDITACIÓN DE SELLOS — "LA DÉCIMA VA POR LA CASA"
// ============================================================================

export const MAX_PASE_ALFA_STAMPS_PER_TICKET = 2;

export interface PaseAlfaStampCartItem {
  tipo?: 'producto' | 'servicio' | string;
  precio?: number;
  cantidad?: number;
  discountValue?: string | number;
  discountType?: 'fixed' | 'percentage';
}

export interface PaseAlfaStampEvaluation {
  stampsToAward: number;
  qualifyingServiceUnits: number;
  minServicePrice: number;
  alreadyStampedToday: boolean;
  isFreeCutRedemption: boolean;
  cappedByTicketLimit: boolean;
  cappedByGoalLimit: boolean;
  statusLabel: string;
  reason: string;
}

/**
 * Calcula de forma 100% determinista cuántos sellos de "La Décima va por la Casa"
 * corresponden a una venta en Caja bajo las reglas oficiales blindadas (Opción B):
 * 1. Exclusivo para clientes con la App Móvil instalada (`hasAppDownloaded`).
 * 2. Tarifa mínima dinámica por servicio individual igual o superior al precio regular
 *    vigente del "Corte de cabello" (`currentHaircutPrice`, p. ej. $140 MXN; se ajusta solo al subir precios).
 *    - Servicios menores (ej. ceja $30) o sumas de servicios menores NO generan sello.
 *    - Productos de tienda (ceras, pomadas, etc.) NUNCA generan sello.
 * 3. Respaldo en dinero real efectivamente pagado (`realMoneySpent`, excluyendo AlfaCoins).
 * 4. Tope familiar/acompañante de máximo 2 sellos por ticket cuando se liquidan 2 o más servicios elegibles.
 * 5. Máximo 1 acreditación de sellos por día hábil operativo de la barbería (`ultimo_sello_fecha === todayStr`).
 */
export function evaluatePaseAlfaStampsForSale(params: {
  client: any | null | undefined;
  hasAppDownloaded: boolean;
  cart: PaseAlfaStampCartItem[];
  realMoneySpent: number;
  currentHaircutPrice: number;
  targetStamps?: number;
  todayStr: string;
  appliedBenefit?: any | null;
}): PaseAlfaStampEvaluation {
  const {
    client,
    hasAppDownloaded,
    cart,
    realMoneySpent,
    currentHaircutPrice,
    targetStamps = 9,
    todayStr,
    appliedBenefit,
  } = params;

  const minServicePrice =
    Number(currentHaircutPrice) > 0 ? Math.round(Number(currentHaircutPrice) * 100) / 100 : 140;

  const isFreeCutRedemption = Boolean(
    appliedBenefit?.benefitId === 'decimo_corte' ||
      appliedBenefit?.benefitId === 'corte_gratis' ||
      appliedBenefit?.folio?.startsWith('VA-CORTE')
  );

  if (!hasAppDownloaded) {
    return {
      stampsToAward: 0,
      qualifyingServiceUnits: 0,
      minServicePrice,
      alreadyStampedToday: false,
      isFreeCutRedemption,
      cappedByTicketLimit: false,
      cappedByGoalLimit: false,
      statusLabel: '0 SELLOS',
      reason: 'Exclusivo para clientes con la App oficial instalada.',
    };
  }

  if (isFreeCutRedemption) {
    return {
      stampsToAward: 0,
      qualifyingServiceUnits: 0,
      minServicePrice,
      alreadyStampedToday: false,
      isFreeCutRedemption: true,
      cappedByTicketLimit: false,
      cappedByGoalLimit: false,
      statusLabel: 'CANJE 10.° CORTE',
      reason: 'Canje de corte de cortesía activo (reinicia tarjeta a 0 sellos).',
    };
  }

  const currStamps = Number(client?.cortes_acumulados ?? client?.cortesAcumulados ?? 0);
  const goalStamps = Math.max(1, Number(targetStamps) || 9);

  if (currStamps >= goalStamps) {
    return {
      stampsToAward: 0,
      qualifyingServiceUnits: 0,
      minServicePrice,
      alreadyStampedToday: false,
      isFreeCutRedemption: false,
      cappedByTicketLimit: false,
      cappedByGoalLimit: true,
      statusLabel: 'META COMPLETA (9/9)',
      reason: 'El cliente ya tiene su corte gratis desbloqueado pendiente de canjear.',
    };
  }

  // Verificar candado de 1 acreditación por día hábil operativo.
  // Si `ultimo_sello_fecha` existe (incluso vacío ''), usamos ese campo exacto para no bloquear
  // a quien solo compró un producto o ceja ($30) temprano y regresa más tarde por su corte.
  const hasExplicitStampDateField =
    client && typeof client.ultimo_sello_fecha === 'string';
  const alreadyStampedToday = hasExplicitStampDateField
    ? client.ultimo_sello_fecha === todayStr
    : Boolean(client?.ultima_visita_fecha === todayStr && currStamps > 0);

  if (alreadyStampedToday) {
    return {
      stampsToAward: 0,
      qualifyingServiceUnits: 0,
      minServicePrice,
      alreadyStampedToday: true,
      isFreeCutRedemption: false,
      cappedByTicketLimit: false,
      cappedByGoalLimit: false,
      statusLabel: '0 SELLOS (YA ABONADO HOY)',
      reason: 'Ya recibió sello(s) en la jornada hábil de hoy. Próximo sello disponible mañana.',
    };
  }

  const serviceItems = (Array.isArray(cart) ? cart : []).filter(
    (it) => it && it.tipo === 'servicio' && (Number(it.cantidad) || 0) > 0
  );

  if (serviceItems.length === 0) {
    return {
      stampsToAward: 0,
      qualifyingServiceUnits: 0,
      minServicePrice,
      alreadyStampedToday: false,
      isFreeCutRedemption: false,
      cappedByTicketLimit: false,
      cappedByGoalLimit: false,
      statusLabel: '0 SELLOS (SOLO PRODUCTOS)',
      reason: 'La compra de productos no genera sellos de visita (sí suma AlfaCoins).',
    };
  }

  let qualifyingServiceUnits = 0;
  for (const item of serviceItems) {
    const qty = Math.max(0, Math.floor(Number(item.cantidad) || 0));
    if (qty <= 0) continue;
    const grossLine = (Number(item.precio) || 0) * qty;
    const discVal = Number(item.discountValue) || 0;
    const lineDiscount =
      item.discountType === 'percentage' ? (grossLine * discVal) / 100 : discVal;
    const netLine = Math.max(0, Math.round((grossLine - lineDiscount) * 100) / 100);
    const netUnitPrice = netLine / qty;

    if (netUnitPrice + 0.005 >= minServicePrice) {
      qualifyingServiceUnits += qty;
    }
  }

  if (qualifyingServiceUnits <= 0) {
    return {
      stampsToAward: 0,
      qualifyingServiceUnits: 0,
      minServicePrice,
      alreadyStampedToday: false,
      isFreeCutRedemption: false,
      cappedByTicketLimit: false,
      cappedByGoalLimit: false,
      statusLabel: `0 SELLOS (MÍN. $${minServicePrice} POR SERVICIO)`,
      reason: `Ningún servicio individual alcanza la tarifa mínima de corte ($${minServicePrice} MXN). Servicios menores no son acumulables para sello.`,
    };
  }

  const unitsBackedByRealMoney = Math.floor(
    (Math.max(0, Number(realMoneySpent) || 0) + 0.005) / minServicePrice
  );

  if (unitsBackedByRealMoney <= 0) {
    return {
      stampsToAward: 0,
      qualifyingServiceUnits,
      minServicePrice,
      alreadyStampedToday: false,
      isFreeCutRedemption: false,
      cappedByTicketLimit: false,
      cappedByGoalLimit: false,
      statusLabel: '0 SELLOS (PAGO CON MONEDERO)',
      reason: `Para acreditar sello se requiere cubrir al menos $${minServicePrice} MXN con dinero real (efectivo, tarjeta o transferencia).`,
    };
  }

  const eligibleBeforeCaps = Math.min(qualifyingServiceUnits, unitsBackedByRealMoney);
  const afterTicketCap = Math.min(MAX_PASE_ALFA_STAMPS_PER_TICKET, eligibleBeforeCaps);
  const remainingToGoal = Math.max(0, goalStamps - currStamps);
  const stampsToAward = Math.min(afterTicketCap, remainingToGoal);

  const cappedByTicketLimit = eligibleBeforeCaps > MAX_PASE_ALFA_STAMPS_PER_TICKET;
  const cappedByGoalLimit = afterTicketCap > remainingToGoal;

  return {
    stampsToAward,
    qualifyingServiceUnits,
    minServicePrice,
    alreadyStampedToday: false,
    isFreeCutRedemption: false,
    cappedByTicketLimit,
    cappedByGoalLimit,
    statusLabel: stampsToAward === 1 ? '+1 SELLO PASE ALFA' : `+${stampsToAward} SELLOS PASE ALFA`,
    reason:
      stampsToAward === 2
        ? `2 servicios elegibles (>= $${minServicePrice} MXN c/u) en la misma visita familiar (máx. 2 por día hábil).`
        : cappedByGoalLimit
        ? `Completa su meta de ${goalStamps}/${goalStamps} sellos y desbloquea su 10.° corte gratis.`
        : `1 servicio elegible (>= $${minServicePrice} MXN) acreditado automáticamente hoy.`,
  };
}

// ============================================================================
// MULTIPLICADOR DE ALFA COINS (DÍAS DOBLES 2x / TRIPLES 3x)
// ============================================================================

export interface MultiplicadorCoinsConfig {
  activo: boolean;
  multiplicador: 2 | 3;
  dias_semana: number[]; // 0 = Domingo, 1 = Lunes, 2 = Martes, 3 = Miércoles, 4 = Jueves, 5 = Viernes, 6 = Sábado
  fechas_especificas?: string[]; // ['yyyy-MM-dd'] opcional
  mensaje_app?: string;
  mensaje_promo?: string;
}

export const DAY_NAMES_ES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

export const DEFAULT_MULTIPLICADOR_COINS_CONFIG: MultiplicadorCoinsConfig = {
  activo: false,
  multiplicador: 2,
  dias_semana: [],
  fechas_especificas: [],
  mensaje_app: '¡Hoy tus compras generan el DOBLE de Alfa Coins en cualquier sucursal de VATOS ALFA Barber Shop!',
  mensaje_promo: '¡Hoy tus compras generan el DOBLE de Alfa Coins en cualquier sucursal de VATOS ALFA Barber Shop!',
};

export interface EvaluatedCoinsMultiplier {
  isActive: boolean;
  isActiveToday: boolean;
  configEnabled: boolean;
  multiplier: 1 | 2 | 3;
  configuredMultiplier: 2 | 3;
  activeDaysNames: string[];
  label: string;
  shortBadge: string;
  promoMessage: string;
}

export function evaluateActiveCoinsMultiplier(
  rawConfig?: Partial<MultiplicadorCoinsConfig> | null,
  referenceDate: Date = new Date()
): EvaluatedCoinsMultiplier {
  const cfg: MultiplicadorCoinsConfig = {
    ...DEFAULT_MULTIPLICADOR_COINS_CONFIG,
    ...(rawConfig || {}),
    multiplicador: Number(rawConfig?.multiplicador) === 3 ? 3 : 2,
    dias_semana: Array.isArray(rawConfig?.dias_semana)
      ? rawConfig!.dias_semana.map(Number).filter((n) => !isNaN(n) && n >= 0 && n <= 6)
      : [],
    fechas_especificas: Array.isArray(rawConfig?.fechas_especificas)
      ? rawConfig!.fechas_especificas.map(String)
      : [],
  };

  const activeDaysNames = cfg.dias_semana.map((d) => DAY_NAMES_ES[d]).filter(Boolean);
  const multWord = cfg.multiplicador === 3 ? 'TRIPLE (3x)' : 'DOBLE (2x)';
  const todayDayOfWeek = referenceDate.getDay();
  const todayStr = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}-${String(referenceDate.getDate()).padStart(2, '0')}`;

  const matchesDayOfWeek = cfg.dias_semana.includes(todayDayOfWeek);
  const matchesSpecificDate = Boolean(cfg.fechas_especificas?.includes(todayStr));
  const isTodayPromo = Boolean(cfg.activo && (matchesDayOfWeek || matchesSpecificDate));

  const defaultMessage = isTodayPromo
    ? `🔥 ¡Hoy es día de Alfa Coins al ${multWord}! Cada $1 MXN pagado te otorga ${cfg.multiplicador} Alfa Coins en cualquier sucursal.`
    : activeDaysNames.length > 0
    ? `Días de Alfa Coins al ${multWord}: ${activeDaysNames.join(', ')}.`
    : '';

  const customMsg = (cfg.mensaje_promo || cfg.mensaje_app || '').trim();

  return {
    isActive: isTodayPromo,
    isActiveToday: isTodayPromo,
    configEnabled: Boolean(cfg.activo),
    multiplier: isTodayPromo ? cfg.multiplicador : 1,
    configuredMultiplier: cfg.multiplicador,
    activeDaysNames,
    label: isTodayPromo
      ? `Día de Alfa Coins al ${cfg.multiplicador === 3 ? 'Triple (3x)' : 'Doble (2x)'}`
      : 'Acumulación Estándar (1x)',
    shortBadge: isTodayPromo ? `${cfg.multiplicador}x ALFA COINS HOY` : '1x',
    promoMessage: customMsg || defaultMessage,
  };
}

// ============================================================================
// REVERSIÓN AUTOMÁTICA DE LEALTAD, ALFA COINS, SELLOS Y BENEFICIOS AL ELIMINAR VENTA
// ============================================================================

export interface SaleLoyaltySnapshot {
  aplicado: boolean;
  revertido?: boolean;
  cliente_id: string;
  fecha_dia: string;
  consumo_real_sumado: number;
  visita_asistida_sumada: number;
  prev_ultima_visita_fecha?: string;
  visita_elegible_sumada: number;
  alfa_coins_ganados: number;
  alfa_coins_canjeados: number;
  multiplicador_aplicado: number;
  sellos_ganados: number;
  corte_gratis_canjeado: boolean;
  prev_cortes_acumulados: number;
  prev_corte_gratis_disponible: boolean;
  prev_ultimo_sello_fecha: string;
  recompensa_pendiente_id?: string;
  prev_nivel?: string;
  new_nivel?: string;
  // Beneficios adicionales aplicados en esta venta
  beneficio_folio?: string;
  beneficio_id?: string;
  is_birthday_applied?: boolean;
  cumpleanos_anio_marcado?: number;
  is_referral_applied?: boolean;
  referrer_id?: string;
  referrer_coins_awarded?: number;
  referrer_recompensa_pendiente_id?: string;
  is_juntos_applied?: boolean;
  juntos_mode?: string;
  juntos_titular_coins_awarded?: number;
  juntos_companions_awarded?: { id: string; coins: number; folio?: string }[];
  prev_ultimo_canje_juntos_fecha?: string;
}

/**
 * Revierte de forma segura e idempotente todos los efectos de lealtad (Alfa Coins ganados,
 * Alfa Coins canjeados, sellos del Pase Alfa, 10.° corte gratis, visitas históricas,
 * consumo acumulado, nivel del cliente y beneficios QR como Cumpleaños, Invita a un Amigo
 * o Juntos es Mejor) cuando una venta pagada es eliminada en Caja o Ventas Facturadas.
 */
export async function revertSaleLoyaltyAndBenefits(
  db: Firestore,
  saleData: any,
  saleId: string
): Promise<{ reverted: boolean; summary: string[] }> {
  const summary: string[] = [];
  if (!db || !saleData) return { reverted: false, summary };

  try {
    // 1. Si esta venta liquidó un anticipo previo (deposit_sale_id), liberar el anticipo para que no se pierda
    if (saleData.deposit_sale_id) {
      try {
        await updateDoc(doc(db, 'ventas', String(saleData.deposit_sale_id)), {
          absorbed_in_sale_id: deleteField(),
        });
      } catch (_) {}
    }

    // Si la venta estaba Pendiente de cobro en terminal o es únicamente un registro de anticipo en línea,
    // nunca sumó Alfa Coins ni sellos al perfil del cliente.
    const rawStatus = String(saleData.pago_estado || '').toLowerCase();
    const isPendingOrDepositOnly =
      rawStatus === 'pendiente' ||
      rawStatus === 'pending_payment' ||
      rawStatus === 'pendiente_anticipo' ||
      rawStatus === 'deposit_paid' ||
      saleData.tipo_venta === 'anticipo' ||
      String(saleId).startsWith('deposit_');

    if (isPendingOrDepositOnly) {
      return { reverted: false, summary };
    }

    const snap: SaleLoyaltySnapshot | undefined = saleData.lealtad_aplicada;
    if (snap?.revertido) {
      return { reverted: false, summary: ['La lealtad de esta venta ya había sido revertida previamente.'] };
    }

    const clientId = String(snap?.cliente_id || saleData.cliente_id || saleData.client?.id || '').trim();
    if (!clientId) {
      return { reverted: false, summary };
    }

    const [clientDocSnap, paseAlfaSnap, salesQuerySnap] = await Promise.all([
      getDoc(doc(db, 'clientes', clientId)),
      getDoc(doc(db, 'configuracion', 'pase_alfa')).catch(() => null),
      getDocs(query(collection(db, 'ventas'), where('cliente_id', '==', clientId))).catch(() => null),
    ]);

    if (!clientDocSnap.exists()) {
      return { reverted: false, summary };
    }

    const clientData: any = { id: clientDocSnap.id, ...clientDocSnap.data() };
    const paseAlfaData: any = paseAlfaSnap?.exists() ? paseAlfaSnap.data() : {};
    const nivelesConfig = paseAlfaData?.niveles_config || null;
    const rawSellosReq = Number(paseAlfaData?.sellosRequeridos || 10);
    const targetStamps = rawSellosReq === 10 ? 9 : Math.max(1, rawSellosReq);

    // Determinar fecha (yyyy-MM-dd) de la venta eliminada
    const saleTs = saleData.fecha_hora_venta || saleData.creado_en || saleData.fecha_pago;
    const saleDateObj = saleTs?.toDate
      ? saleTs.toDate()
      : saleTs?.seconds
      ? new Date(saleTs.seconds * 1000)
      : new Date();
    const saleDayStr =
      snap?.fecha_dia ||
      `${saleDateObj.getFullYear()}-${String(saleDateObj.getMonth() + 1).padStart(2, '0')}-${String(saleDateObj.getDate()).padStart(2, '0')}`;

    // Analizar las ventas válidas RESTANTES del cliente (excluyendo la venta que se está eliminando)
    const remainingSales: any[] = [];
    let remainingSpendFromSales = 0;
    const remainingVisitDays = new Set<string>();
    let latestRemainingVisitDay = '';
    let latestRemainingStampDay = '';
    const haircutPriceRef = Number(saleData.tarifa_corte_aplicada || 140);

    if (salesQuerySnap) {
      salesQuerySnap.docs.forEach((d) => {
        if (d.id === saleId) return;
        const s = d.data();
        const st = String(s.pago_estado || '').toLowerCase();
        if (
          st === 'cancelado' ||
          st === 'pendiente' ||
          st === 'pending_payment' ||
          st === 'pendiente_anticipo' ||
          s.absorbed_in_sale_id
        ) {
          return;
        }
        remainingSales.push({ id: d.id, ...s });

        const sTotal = Number(s.total ?? s.monto_pagado_real ?? 0);
        const sCoinsDisc = Number(s.descuento_alfacoins ?? 0);
        const sRealPaid = Math.max(0, sTotal - sCoinsDisc);
        remainingSpendFromSales += sRealPaid;

        const items = Array.isArray(s.items) ? s.items : [];
        const hasService = items.length === 0 || items.some((it: any) => it.tipo === 'servicio' || !it.tipo);
        if (hasService && s.tipo_venta !== 'anticipo' && !d.id.startsWith('deposit_')) {
          const dt = s.fecha_hora_venta?.toDate
            ? s.fecha_hora_venta.toDate()
            : s.creado_en?.toDate
            ? s.creado_en.toDate()
            : null;
          const dayKey = dt
            ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
            : '';
          if (dayKey) {
            remainingVisitDays.add(dayKey);
            if (dayKey > latestRemainingVisitDay) {
              latestRemainingVisitDay = dayKey;
            }
            const sLoyalty: SaleLoyaltySnapshot | undefined = s.lealtad_aplicada;
            const sEarnedStamp = sLoyalty
              ? Number(sLoyalty.sellos_ganados || 0) > 0
              : sRealPaid + 0.01 >= Number(s.tarifa_corte_aplicada || haircutPriceRef);
            if (sEarnedStamp && dayKey > latestRemainingStampDay) {
              latestRemainingStampDay = dayKey;
            }
          }
        }
      });
    }

    // Calcular valores exactos a revertir (usando snapshot `lealtad_aplicada` si existe, o cálculo determinista para ventas históricas)
    const saleSubtotal = Number(saleData.subtotal ?? saleData.total ?? 0);
    const saleCoinsDiscount = Number(saleData.descuento_alfacoins ?? 0);
    const saleAnticipo = Number(saleData.anticipoPagado ?? saleData.anticipo_pagado ?? 0);
    const fallbackNetPaidNow = Math.max(0, Number(saleData.monto_pagado_real ?? (Number(saleData.total || 0) - saleCoinsDiscount - saleAnticipo)));
    const fallbackRealMoneySpent = Math.max(
      0,
      Math.round((Number(saleData.total || 0) - saleCoinsDiscount) * 100) / 100
    );

    const hasApp = isClientWithApp(clientData);
    const coinsEarnedInSale =
      snap?.alfa_coins_ganados !== undefined
        ? Number(snap.alfa_coins_ganados)
        : hasApp
        ? Math.floor(Math.max(0, fallbackNetPaidNow))
        : 0;
    const coinsRedeemedInSale =
      snap?.alfa_coins_canjeados !== undefined
        ? Number(snap.alfa_coins_canjeados)
        : Number(saleData.alfacoins_canjeados || 0);
    const juntosTitularBonus = Number(snap?.juntos_titular_coins_awarded || 0);

    const appliedBenefitId = String(
      snap?.beneficio_id || saleData.beneficio_aplicado?.id || ''
    ).toLowerCase();
    const appliedBenefitFolio = String(
      snap?.beneficio_folio || saleData.beneficio_aplicado?.folio || ''
    );
    const isFreeCutSale = Boolean(
      snap?.corte_gratis_canjeado ||
        appliedBenefitId === 'decimo_corte' ||
        appliedBenefitId === 'corte_gratis' ||
        appliedBenefitFolio.startsWith('VA-CORTE')
    );

    const saleItems = Array.isArray(saleData.items) ? saleData.items : [];
    const hasServiceInSale =
      saleItems.length === 0 || saleItems.some((it: any) => it.tipo === 'servicio' || !it.tipo);

    const stampsAwardedInSale =
      snap?.sellos_ganados !== undefined
        ? Number(snap.sellos_ganados)
        : !isFreeCutSale &&
          hasApp &&
          hasServiceInSale &&
          fallbackRealMoneySpent + 0.01 >= haircutPriceRef
        ? 1
        : 0;

    const realSpendAdded =
      snap?.consumo_real_sumado !== undefined
        ? Number(snap.consumo_real_sumado)
        : fallbackRealMoneySpent;

    const visitAdded =
      snap?.visita_asistida_sumada !== undefined
        ? Number(snap.visita_asistida_sumada)
        : hasServiceInSale && !remainingVisitDays.has(saleDayStr)
        ? 1
        : 0;

    const eligibleVisitAdded =
      snap?.visita_elegible_sumada !== undefined
        ? Number(snap.visita_elegible_sumada)
        : stampsAwardedInSale > 0
        ? 1
        : 0;

    const clientUpdate: Record<string, any> = {};

    // A. Revertir Alfa Coins del cliente (restar ganados + bonos Juntos y devolver canjeados)
    const currentClientCoins = Number(
      clientData.alfaCoins ??
        clientData.alfa_coins ??
        clientData.puntosLealtad ??
        clientData.puntos_lealtad ??
        clientData.puntos ??
        0
    );
    const totalCoinsToSubtract = coinsEarnedInSale + juntosTitularBonus;
    const totalCoinsToRefund = coinsRedeemedInSale;

    if (totalCoinsToSubtract > 0 || totalCoinsToRefund > 0) {
      const nextClientCoins = Math.max(
        0,
        currentClientCoins - totalCoinsToSubtract + totalCoinsToRefund
      );
      clientUpdate.puntos = nextClientCoins;
      clientUpdate.alfaCoins = nextClientCoins;
      clientUpdate.alfa_coins = nextClientCoins;
      clientUpdate.puntosLealtad = nextClientCoins;
      clientUpdate.puntos_lealtad = nextClientCoins;

      if (totalCoinsToSubtract > 0) {
        summary.push(`-${totalCoinsToSubtract} Alfa Coins retirados`);
      }
      if (totalCoinsToRefund > 0) {
        summary.push(`+${totalCoinsToRefund} Alfa Coins devueltos al monedero`);
      }
    }

    // B. Revertir Sellos del Pase Alfa o restaurar 10.° Corte Gratis
    const currentStamps = Number(
      clientData.cortes_acumulados ?? clientData.cortesAcumulados ?? 0
    );
    if (isFreeCutSale) {
      const restoredStamps =
        snap?.prev_cortes_acumulados !== undefined && snap.prev_cortes_acumulados > 0
          ? Number(snap.prev_cortes_acumulados)
          : targetStamps;
      clientUpdate.cortes_acumulados = restoredStamps;
      clientUpdate.corte_gratis_disponible = true;
      summary.push(`10.° Corte Gratis restaurado (${restoredStamps}/${targetStamps} sellos)`);
    } else if (stampsAwardedInSale > 0) {
      const nextStamps = Math.max(0, currentStamps - stampsAwardedInSale);
      clientUpdate.cortes_acumulados = nextStamps;
      clientUpdate.corte_gratis_disponible = nextStamps >= targetStamps;
      if (clientData.ultimo_sello_fecha === saleDayStr) {
        clientUpdate.ultimo_sello_fecha =
          snap?.prev_ultimo_sello_fecha !== undefined
            ? snap.prev_ultimo_sello_fecha
            : latestRemainingStampDay || '';
      }
      summary.push(
        `-${stampsAwardedInSale} sello(s) Pase Alfa (${nextStamps}/${targetStamps})`
      );
    }

    // C. Revertir Consumo Histórico, Visitas y recalcular Nivel Alfa
    const currentSpend = Math.max(
      Number(clientData.consumo_total ?? 0),
      Number(clientData.gasto_total ?? 0),
      Number(clientData.consumoTotal ?? 0)
    );
    const nextSpend = Math.max(
      Math.round(remainingSpendFromSales * 100) / 100,
      Math.max(0, Math.round((currentSpend - realSpendAdded) * 100) / 100)
    );
    clientUpdate.consumo_total = nextSpend;
    clientUpdate.gasto_total = nextSpend;
    clientUpdate.consumoTotal = nextSpend;

    const currentVisits = Math.max(
      Number(clientData.citas_asistidas ?? 0),
      Number(clientData.visitas_totales ?? 0)
    );
    const nextVisits = Math.max(
      remainingVisitDays.size,
      Math.max(0, currentVisits - visitAdded)
    );
    clientUpdate.citas_asistidas = nextVisits;
    clientUpdate.visitas_totales = nextVisits;

    if (clientData.ultima_visita_fecha === saleDayStr && !remainingVisitDays.has(saleDayStr)) {
      clientUpdate.ultima_visita_fecha =
        snap?.prev_ultima_visita_fecha || latestRemainingVisitDay || '';
    }

    if (eligibleVisitAdded > 0) {
      const currEligible = Number(clientData.visitas_elegibles_historicas ?? 0);
      clientUpdate.visitas_elegibles_historicas = Math.max(0, currEligible - eligibleVisitAdded);
    }

    if (hasApp) {
      const remainingPaseAlfaStats = calculatePaseAlfaStatsFromSales(remainingSales, clientData);
      const currPaseAlfaVisits = Number(clientData.visitas_pase_alfa ?? 0);
      const currPaseAlfaSpend = Number(clientData.consumo_pase_alfa ?? 0);
      const nextPaseAlfaVisits = Math.max(
        remainingPaseAlfaStats.visits,
        Math.max(0, currPaseAlfaVisits - visitAdded),
        Number(clientUpdate.cortes_acumulados ?? currentStamps)
      );
      const nextPaseAlfaSpend = Math.max(
        remainingPaseAlfaStats.spend,
        Math.max(0, Math.round((currPaseAlfaSpend - realSpendAdded) * 100) / 100)
      );

      clientUpdate.visitas_pase_alfa = nextPaseAlfaVisits;
      clientUpdate.consumo_pase_alfa = nextPaseAlfaSpend;

      const reEvaluatedTier = evaluateClientAlfaTier(clientData, nivelesConfig, {
        overrideVisits: nextPaseAlfaVisits,
        overrideSpend: nextPaseAlfaSpend,
        forceEvaluateWhenPaused: true,
      });
      if (reEvaluatedTier.tierName && reEvaluatedTier.tierName !== 'Sin Nivel') {
        clientUpdate.nivel = reEvaluatedTier.tierName;
      }
    }

    // D. Limpiar recompensa_pendiente si corresponde a la venta eliminada
    const pendingReward = clientData.recompensa_pendiente;
    if (pendingReward) {
      const matchesById =
        snap?.recompensa_pendiente_id && pendingReward.id === snap.recompensa_pendiente_id;
      const matchesByValues =
        !snap?.recompensa_pendiente_id &&
        Number(pendingReward.coins_ganadas || 0) === coinsEarnedInSale &&
        Number(pendingReward.sellos_ganados || 0) === stampsAwardedInSale;
      if (matchesById || matchesByValues) {
        clientUpdate.recompensa_pendiente = null;
      }
    }

    // E. Revertir efectos de Beneficios QR (Cumpleaños, Invita a un Amigo, Juntos es Mejor)
    const isBirthday = Boolean(
      snap?.is_birthday_applied ||
        appliedBenefitId === 'regalo_cumpleanos' ||
        appliedBenefitFolio.includes('CUMPLE')
    );
    if (isBirthday) {
      clientUpdate.ultimo_canje_cumpleanos_anio = deleteField();
      clientUpdate.ultimo_canje_cumpleanos_folio = deleteField();
      clientUpdate.fecha_ultimo_canje_cumpleanos = deleteField();
      summary.push('Regalo de Cumpleaños reactivado');
    }

    const isReferral = Boolean(
      snap?.is_referral_applied ||
        appliedBenefitId === 'invita_amigo' ||
        appliedBenefitFolio.startsWith('VA-REF')
    );
    if (isReferral) {
      clientUpdate.beneficio_referido_usado = false;
      clientUpdate.referido_por_id = deleteField();
      clientUpdate.referido_por_nombre = deleteField();
      clientUpdate.codigo_referido_usado = deleteField();
      clientUpdate.fecha_canje_referido = deleteField();
    }

    const isJuntos = Boolean(
      snap?.is_juntos_applied ||
        appliedBenefitId === 'juntos_es_mejor' ||
        appliedBenefitFolio.startsWith('VA-JUNTOS')
    );
    if (isJuntos && clientData.ultimo_canje_juntos_fecha === saleDayStr) {
      clientUpdate.ultimo_canje_juntos_fecha = snap?.prev_ultimo_canje_juntos_fecha || '';
    }

    // Guardar actualización consolidada en el documento del cliente
    await updateDoc(doc(db, 'clientes', clientId), clientUpdate);

    // F. Si fue un canje de referido y se premiaron 500 Alfa Coins al anfitrión, revertirlos del anfitrión
    let referrerId = snap?.referrer_id || '';
    let referrerCoinsToRevert = Number(snap?.referrer_coins_awarded || 0);
    if (isReferral && (!referrerId || !snap) && appliedBenefitFolio) {
      try {
        const canjeSnap = await getDoc(doc(db, 'canjes_beneficios', appliedBenefitFolio));
        if (canjeSnap.exists()) {
          const cData = canjeSnap.data();
          referrerId = referrerId || String(cData.referrerId || '');
          if (snap === undefined && cData.recompensaAcreditada) {
            referrerCoinsToRevert = Number(cData.rewardCoins || REFERRAL_HOST_REWARD_COINS);
          }
        }
      } catch (_) {}
    }

    if (referrerId && referrerCoinsToRevert > 0) {
      try {
        const hostRef = doc(db, 'clientes', referrerId);
        const hostSnap = await getDoc(hostRef);
        if (hostSnap.exists()) {
          const hostData: any = hostSnap.data();
          const hostCurrCoins = Number(
            hostData.alfaCoins ??
              hostData.alfa_coins ??
              hostData.puntosLealtad ??
              hostData.puntos_lealtad ??
              hostData.puntos ??
              0
          );
          const nextHostCoins = Math.max(0, hostCurrCoins - referrerCoinsToRevert);
          const nextHostReferrals = Math.max(0, Number(hostData.amigos_referidos || 1) - 1);
          const hostUpdate: Record<string, any> = {
            puntos: nextHostCoins,
            alfaCoins: nextHostCoins,
            alfa_coins: nextHostCoins,
            puntosLealtad: nextHostCoins,
            puntos_lealtad: nextHostCoins,
            amigos_referidos: nextHostReferrals,
          };
          if (
            hostData.recompensa_pendiente &&
            (hostData.recompensa_pendiente.id === snap?.referrer_recompensa_pendiente_id ||
              hostData.recompensa_pendiente.tipo_recompensa === 'referido')
          ) {
            hostUpdate.recompensa_pendiente = null;
          }
          await updateDoc(hostRef, hostUpdate);
          summary.push(`-${referrerCoinsToRevert} Alfa Coins de referido revertidos al anfitrión`);
        }
      } catch (e) {
        console.warn('Error revirtiendo Alfa Coins del anfitrión:', e);
      }
    }

    // G. Si fue Juntos es Mejor con acompañantes con App, revertir sus +400 Alfa Coins
    if (Array.isArray(snap?.juntos_companions_awarded) && snap!.juntos_companions_awarded.length > 0) {
      for (const comp of snap!.juntos_companions_awarded) {
        if (!comp?.id || Number(comp.coins || 0) <= 0) continue;
        try {
          const compRef = doc(db, 'clientes', comp.id);
          const compSnap = await getDoc(compRef);
          if (compSnap.exists()) {
            const compData: any = compSnap.data();
            const compCurrCoins = Number(
              compData.alfaCoins ??
                compData.alfa_coins ??
                compData.puntosLealtad ??
                compData.puntos_lealtad ??
                compData.puntos ??
                0
            );
            const nextCompCoins = Math.max(0, compCurrCoins - Number(comp.coins));
            const compUpdate: Record<string, any> = {
              puntos: nextCompCoins,
              alfaCoins: nextCompCoins,
              alfa_coins: nextCompCoins,
              puntosLealtad: nextCompCoins,
              puntos_lealtad: nextCompCoins,
            };
            if (compData.ultimo_canje_juntos_fecha === saleDayStr) {
              compUpdate.ultimo_canje_juntos_fecha = '';
            }
            await updateDoc(compRef, compUpdate);
          }
          if (comp.folio) {
            await updateDoc(doc(db, 'canjes_beneficios', comp.folio), {
              estado: 'cancelado_por_venta_eliminada',
              utilizado_en_venta: false,
              recompensaAcreditada: false,
            }).catch(() => {});
          }
        } catch (_) {}
      }
    }

    // H. Cancelar el documento en `canjes_beneficios` para que el folio/beneficio no quede quemado
    if (appliedBenefitFolio) {
      await updateDoc(doc(db, 'canjes_beneficios', appliedBenefitFolio), {
        estado: 'cancelado_por_venta_eliminada',
        utilizado_en_venta: false,
        recompensaAcreditada: false,
        revertido_en: Timestamp.now(),
      }).catch(() => {});
    }

    return { reverted: true, summary };
  } catch (err) {
    console.error('Error en revertSaleLoyaltyAndBenefits:', err);
    return { reverted: false, summary };
  }
}




