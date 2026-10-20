export const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const VATOS_BENEFIT_SIGN_SALT = 'VA_SECURE_TOKEN_SALT_2026_VATOS_ALFA_SECURITY_KEY';

export interface BirthdayValidationResult {
  hasBirthday: boolean;
  isBirthdayMonth: boolean;
  birthMonthNum?: number;
  birthMonthName?: string;
  currentMonthNum: number;
  currentMonthName: string;
  birthDateFormatted?: string;
  isEligible: boolean;
  rejectionReason?: string;
}

export function parseBirthMonthAndDay(birthVal: any): { month: number; day: number; year?: number; formatted: string } | null {
  if (!birthVal) return null;

  // If Firestore Timestamp or Date object
  if (typeof birthVal === 'object') {
    const d = birthVal.toDate ? birthVal.toDate() : (birthVal instanceof Date ? birthVal : null);
    if (d && !isNaN(d.getTime())) {
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const year = d.getFullYear();
      return {
        month,
        day,
        year,
        formatted: `${day} de ${MONTH_NAMES_ES[month - 1]}${year ? ` de ${year}` : ''}`,
      };
    }
  }

  if (typeof birthVal !== 'string') return null;
  const trimmed = birthVal.trim();
  if (!trimmed) return null;

  // Format: "15 de Mayo de 1998" or "15 de Mayo"
  if (trimmed.toLowerCase().includes(' de ')) {
    const parts = trimmed.split(/\s+de\s+/i);
    const day = parseInt(parts[0], 10);
    const monthStr = (parts[1] || '').trim().toLowerCase();
    const monthIndex = MONTH_NAMES_ES.findIndex(m => m.toLowerCase() === monthStr);
    const year = parts[2] ? parseInt(parts[2], 10) : undefined;
    if (monthIndex >= 0 && !isNaN(day)) {
      const month = monthIndex + 1;
      return {
        month,
        day,
        year,
        formatted: `${day} de ${MONTH_NAMES_ES[month - 1]}${year ? ` de ${year}` : ''}`,
      };
    }
  }

  // Format: YYYY-MM-DD or DD/MM/YYYY or DD-MM-YYYY
  const parts = trimmed.split(/[-/]/);
  if (parts.length >= 2) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2] || '1', 10);
      if (month >= 1 && month <= 12) {
        return {
          month,
          day: isNaN(day) ? 1 : day,
          year,
          formatted: `${day} de ${MONTH_NAMES_ES[month - 1]}${year ? ` de ${year}` : ''}`,
        };
      }
    } else {
      // DD/MM/YYYY or DD-MM-YYYY
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parts[2] ? parseInt(parts[2], 10) : undefined;
      if (month >= 1 && month <= 12) {
        return {
          month,
          day: isNaN(day) ? 1 : day,
          year,
          formatted: `${day} de ${MONTH_NAMES_ES[month - 1]}${year ? ` de ${year}` : ''}`,
        };
      }
    }
  }

  return null;
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

  const candidates = Array.from(new Set([benefitId, fallbackBenefitId, 'juntos_es_mejor', 'invita_amigo', 'beneficio_alfa'].filter(Boolean))) as string[];

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
export const REFERRAL_MIN_PURCHASE_MXN = 160;

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

