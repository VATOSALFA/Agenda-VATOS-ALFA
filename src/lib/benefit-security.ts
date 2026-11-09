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
 * Calcula cuántas visitas elegibles pagadas acumula un cliente para desbloquear el Regalo de Cumpleaños:
 * - Solo ventas pagadas (no canceladas ni pendientes ni anticipos).
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
      visitasMin: 4,
      gastoMin: 1500,
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
      visitasMin: 8,
      gastoMin: 3500,
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

  const baseVisits = client
    ? Math.max(
        Number(client.citas_asistidas ?? 0),
        Number(client.visitas_totales ?? 0),
        Number(client.visitas ?? 0),
        Number(client.total_visitas ?? 0),
        Number(client.cortes_acumulados ?? client.cortesAcumulados ?? 0)
      )
    : 0;

  const baseSpend = client
    ? Math.max(
        Number(client.consumo_total ?? 0),
        Number(client.gasto_total ?? 0),
        Number(client.consumoTotal ?? 0),
        Number(client.consumo ?? 0)
      )
    : 0;

  const v = Math.max(
    0,
    options?.overrideVisits !== undefined
      ? Math.max(baseVisits, options.overrideVisits)
      : baseVisits + (options?.extraVisits || 0)
  );
  const g = Math.max(
    0,
    Math.round(
      ((options?.overrideSpend !== undefined
        ? Math.max(baseSpend, options.overrideSpend)
        : baseSpend) +
        (options?.extraSpend || 0)) *
        100
    ) / 100
  );

  const hasApp = isClientWithApp(client, options?.appReservationClientIds);

  // Si no hay cliente seleccionado o el cliente NO tiene la app móvil instalada y usada:
  // Los clientes sin app NO tienen nivel ni beneficios del Pase Alfa Club.
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

  const vipVisitasMin = Number(vip.visitasMin ?? 8);
  const vipGastoMin = Number(vip.gastoMin ?? 3500);
  const goldVisitasMin = Number(gold.visitasMin ?? 4);
  const goldGastoMin = Number(gold.gastoMin ?? 1500);

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



