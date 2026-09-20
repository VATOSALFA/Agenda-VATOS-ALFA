import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export function formatTime12h(timeStr: string): string {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  if (isNaN(h)) return timeStr;
  const m = mStr || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

export function matchBarberName(rawQuery: string, barber: { name: string; publicName: string }): boolean {
  if (!rawQuery) return false;
  const q = rawQuery.toLowerCase().trim();
  const n = (barber.name || '').toLowerCase();
  const p = (barber.publicName || '').toLowerCase();
  if (n.includes(q) || p.includes(q)) return true;
  if ((q.includes('beatriz') || q.includes('bety') || q.includes('betty')) && (n.includes('beatriz') || p.includes('bety'))) return true;
  if ((q.includes('eduardo') || q.includes('lalo')) && (n.includes('eduardo') || p.includes('lalo'))) return true;
  if ((q.includes('ivon') || q.includes('yvon')) && (n.includes('ivon') || p.includes('ivon'))) return true;
  if ((q.includes('lupita') || q.includes('guadalupe')) && (n.includes('lupita') || p.includes('lupita'))) return true;
  if (q.includes('alfredo') && (n.includes('alfredo') || p.includes('alfredo'))) return true;
  return false;
}

export function normalizeTimeTo24h(rawTime: string): string {
  if (!rawTime) return '';
  if (!/^\s*\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?\s*$/i.test(rawTime)) return '';
  let t = rawTime.trim().toLowerCase();
  const isPM = t.includes('pm') || t.includes('p.m.');
  const isAM = t.includes('am') || t.includes('a.m.');
  t = t.replace(/[^\d:]/g, '');
  let [hStr, mStr] = t.split(':');
  let h = parseInt(hStr || '0', 10);
  let m = parseInt(mStr || '0', 10);
  if (!Number.isFinite(h) || m > 59 || m < 0 || h > 23 || ((isPM || isAM) && (h < 1 || h > 12))) return '';
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function cleanSearchStr(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function isValidBookingDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizeClientPhone(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^\d{10}$/.test(digits)) return digits;
  if (/^52\d{10}$/.test(digits) || /^521\d{10}$/.test(digits)) return digits.slice(-10);
  return '';
}

export function reservationMatchesPhone(reservation: any, phone: string): boolean {
  const normalized = normalizeClientPhone(phone);
  return !!normalized && [reservation.cliente_telefono, reservation.customerPhone, reservation.customer?.telefono, reservation.customer?.phone]
    .some(value => normalizeClientPhone(value) === normalized);
}

export function isUpcomingReservation(reservation: any, now = new Date()): boolean {
  const state = cleanSearchStr(reservation.estado || '');
  if (['cancelado', 'cancelada', 'completado', 'completada', 'finalizado', 'finalizada', 'no asiste', 'atendido', 'atendida', 'pagado', 'pagada'].includes(state)) return false;
  const { todayIso, localTime } = getMexicoDateInfo(now);
  return isValidBookingDate(reservation.fecha || '') && (reservation.fecha > todayIso || (reservation.fecha === todayIso && reservation.hora_inicio > localTime));
}

export function hasPendingDeposit(reservation: any): boolean {
  if (['paid', 'deposit_paid', 'approved', 'pagado'].includes(cleanSearchStr(reservation.pago_estado || ''))) return false;
  return reservation.pago_estado === 'pending_payment' || cleanSearchStr(reservation.estado || '') === 'pendiente de pago' ||
    (reservation.requiere_pago_anticipado === true && Number(reservation.anticipo_pagado || 0) < Number(reservation.anticipo_esperado || 0));
}

export function requestsHuman(message: string, keywords: string): boolean {
  const words = ` ${cleanSearchStr(message).replace(/[^a-z0-9]+/g, ' ')} `;
  return keywords.split(',').map(cleanSearchStr).filter(Boolean).some(keyword =>
    words.includes(` ${keyword.replace(/[^a-z0-9]+/g, ' ')} `));
}

/**
 * Obtiene la información exacta de fechas y horas en la zona horaria oficial del negocio (Querétaro / Ciudad de México).
 */
export function getMexicoDateInfo(now = new Date()) {
  const timeZone = 'America/Mexico_City';

  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // AAAA-MM-DD

  const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowIso = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(tomorrowDate);

  const dayAfterTomorrowDate = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const dayAfterTomorrowIso = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dayAfterTomorrowDate);

  const friendly = new Intl.DateTimeFormat('es-MX', { timeZone, dateStyle: 'full' });
  const friendlyToday = friendly.format(now);
  const friendlyTomorrow = friendly.format(tomorrowDate);
  const friendlyDayAfterTomorrow = friendly.format(dayAfterTomorrowDate);
  const localTime = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);

  return {
    todayIso,
    tomorrowIso,
    dayAfterTomorrowIso,
    friendlyToday,
    friendlyTomorrow,
    friendlyDayAfterTomorrow,
    localTime,
    now,
  };
}

/**
 * Normaliza y resuelve las fechas a consultar a partir de entradas de fecha textuales o ISO.
 */
export function resolveTargetDates({
  fechaInput,
  diasABuscar,
}: {
  fechaInput?: string;
  diasABuscar?: number;
}): string[] {
  const { todayIso, tomorrowIso, dayAfterTomorrowIso } = getMexicoDateInfo();
  let explicitDate: string | null = null;

  if (fechaInput && typeof fechaInput === 'string') {
    const clean = fechaInput.trim().toLowerCase();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      if (!isValidBookingDate(clean) || clean < todayIso) throw new Error('Indica una fecha válida que no esté en el pasado.');
      explicitDate = clean;
    } else if (clean.includes('pasado') && (clean.includes('mañana') || clean.includes('manana'))) {
      explicitDate = dayAfterTomorrowIso;
    } else if (clean.includes('mañana') || clean.includes('manana') || clean === 'tomorrow') {
      explicitDate = tomorrowIso;
    } else if (clean === 'hoy' || clean === 'today') {
      explicitDate = todayIso;
    } else {
      for (let i = 0; i < 7; i++) {
        const testD = new Date(new Date(todayIso + 'T12:00:00').getTime() + i * 86400000);
        const name = format(testD, 'eeee', { locale: es }).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (clean.includes(name)) {
          explicitDate = format(testD, 'yyyy-MM-dd');
          break;
        }
      }
      if (!explicitDate) throw new Error('No pude interpretar la fecha. Indica el día en formato AAAA-MM-DD.');
    }
  }

  const datesToCheck: string[] = [];
  if (explicitDate) {
    const numDays = diasABuscar && diasABuscar > 1 ? Math.min(diasABuscar, 7) : 1;
    const base = new Date(explicitDate + 'T12:00:00');
    for (let i = 0; i < numDays; i++) {
      const d = new Date(base.getTime() + i * 86400000);
      datesToCheck.push(format(d, 'yyyy-MM-dd'));
    }
  } else {
    // Si no se pasó fecha, buscar los próximos días (mínimo 4 días para abarcar hoy, mañana y siguientes)
    const base = new Date(todayIso + 'T12:00:00');
    const numDays = diasABuscar ? Math.min(Math.max(diasABuscar, 4), 7) : 4;
    for (let i = 0; i < numDays; i++) {
      const d = new Date(base.getTime() + i * 86400000);
      datesToCheck.push(format(d, 'yyyy-MM-dd'));
    }
  }

  return datesToCheck;
}

/**
 * Limpia el texto de salida del bot para eliminar asteriscos decorativos,
 * paréntesis redundantes alrededor de precios y asegurar enlaces limpios.
 */
export function sanitizeBotMessage(rawText: string): string {
  if (!rawText) return '';
  let text = rawText;

  // 1. Eliminar asteriscos dobles y simples usados para negritas o itálicas
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');

  // 2. Eliminar paréntesis que encierran precios o montos (ej: "($159.50 MXN)" -> "$159.50 MXN", "($319 MXN)" -> "$319 MXN")
  text = text.replace(/\(\s*(\$\d+(?:\.\d{1,2})?(?:\s*MXN)?)\s*\)/gi, '$1');
  text = text.replace(/\(\s*(\d+%\s*(?:de\s*)?anticipo)\s*\)/gi, '$1');

  // 3. Limpiar viñetas con asteriscos a viñeta limpia y remover asteriscos residuales
  text = text.replace(/^\s*\*\s+/gm, '• ');
  text = text.replace(/\*/g, '');

  // 4. Asegurar que los links de Mercado Pago y vatosalfa estén en su propia línea limpia
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$2');
  text = text.replace(/https?:\/\/[^\s]+/g, (url) => `\n${url}\n`);
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Detecta si el cliente está confirmando explícitamente el cierre de la orden o respondiendo a la pregunta de upsell
 */
export function isUserConfirmingClosureOrUpsell(userMessage: string, recentHistory: string): boolean {
  const u = (userMessage || '').toLowerCase().trim();

  // Si el usuario está preguntando por precios, dudas o información, NO es un cierre directo
  if (u.includes('?') || u.includes('precio') || u.includes('cuanto') || u.includes('cuánto') || u.includes('costo') || u.includes('dónde') || u.includes('donde') || u.includes('tienen') || u.includes('horario') || u.includes('hora')) {
    return false;
  }

  // Respuestas directas que confirman el fin del pedido o cierre
  const closurePhrases = [
    'solo corte', 'solo el corte', 'solamente corte', 'únicamente corte', 'unicamente corte',
    'sería todo', 'seria todo', 'así está bien', 'asi esta bien', 'nada más', 'nada mas',
    'solo eso', 'no gracias', 'así mero', 'asi mero', 'no, nada más', 'no nada mas',
    'con eso está bien', 'con eso esta bien', 'es todo', 'no, sería todo', 'no seria todo',
    'sí, agrégamela', 'si agregamela', 'agrégamela', 'agregamela', 'agrega la cera',
    'agrega una cera', 'también la cera', 'tambien la cera', 'agrega cera', 'con cera',
    'apártamela', 'apartamela', 'sí apártamela', 'si apartamela', 'sí por favor', 'si por favor',
    'sí agrega', 'si agrega', 'agrega el producto', 'confirmar cita', 'confirmo la cita'
  ];
  if (closurePhrases.some((p) => u.includes(p))) {
    return true;
  }

  // Si el usuario responde afirmativamente de forma breve ("sí", "si", "va", "perfecto") tras la pregunta de cierre
  const h = (recentHistory || '').toLowerCase();
  const lastBotClosing =
    h.includes('¿sería únicamente') ||
    h.includes('¿seria unicamente') ||
    h.includes('¿sería todo') ||
    h.includes('¿seria todo') ||
    h.includes('¿agregamos');

  if (lastBotClosing && /^(si|sí|va|de acuerdo|perfecto|adelante|dale)$/i.test(u)) {
    return true;
  }

  return false;
}

export function extractQuantityAndCleanQuery(raw: string): { quantity: number; cleanQuery: string } {
  let str = (raw || '').trim();
  if (!str) return { quantity: 1, cleanQuery: '' };

  let qty = 1;

  // 1. Phrasing like: "corte para mí y mi hijo", "corte para mí y para mi hermano"
  if (/para\s+m[ií]\s+y\s+(?:para\s+)?mi\s+(?:hijo|hermano|papa|papá|amigo|primo|hija|mama|mamá)/i.test(str)) {
    qty = 2;
    str = str.replace(/para\s+m[ií]\s+y\s+(?:para\s+)?mi\s+(?:hijo|hermano|papa|papá|amigo|primo|hija|mama|mamá)/gi, '').trim();
  } else {
    // 2. Trailing "para X personas / para X" (ej. "corte para 2 personas", "corte para dos", "corte para 3")
    const trailingMatch = str.match(/^(.*?)\s+(?:para\s+)(\d+|dos|tres|cuatro|cinco)\s*(?:personas?|cortes?|caballeros?|niños?)?$/i);
    if (trailingMatch) {
      const numStr = trailingMatch[2].toLowerCase();
      let parsed = parseInt(numStr, 10);
      if (isNaN(parsed)) {
        if (numStr === 'dos') parsed = 2;
        else if (numStr === 'tres') parsed = 3;
        else if (numStr === 'cuatro') parsed = 4;
        else if (numStr === 'cinco') parsed = 5;
        else parsed = 1;
      }
      if (parsed > 0 && parsed <= 10) {
        qty = parsed;
        str = trailingMatch[1].trim();
      }
    } else {
      // 3. Leading number (ej. "2 cortes de cabello", "2 cortes", "2 x corte")
      const leadingNumMatch = str.match(/^(\d+)\s*(?:x\s*|de\s+)?(.*)$/i);
      if (leadingNumMatch) {
        const parsed = parseInt(leadingNumMatch[1], 10);
        if (!isNaN(parsed) && parsed > 0 && parsed <= 10) {
          qty = parsed;
          str = leadingNumMatch[2].trim();
        }
      } else {
        // 4. Leading word number (ej. "dos cortes", "un arreglo de ceja", "tres servicios")
        const leadingWordMatch = str.match(/^(un[oa]?|dos|tres|cuatro|cinco|doble|triple)\s+(?:de\s+)?(.*)$/i);
        if (leadingWordMatch) {
          const word = leadingWordMatch[1].toLowerCase();
          if (word === 'dos' || word === 'doble') qty = 2;
          else if (word === 'tres' || word === 'triple') qty = 3;
          else if (word === 'cuatro') qty = 4;
          else if (word === 'cinco') qty = 5;
          else if (word.startsWith('un')) qty = 1;
          str = leadingWordMatch[2].trim();
        }
      }
    }
  }

  return { quantity: qty > 0 ? qty : 1, cleanQuery: str };
}

export function formatServiceTitle(services: Array<any>): string {
  if (!services || services.length === 0) return 'Servicio';
  const counts = new Map<string, number>();
  for (const s of services) {
    const name = s.name || s.nombre || 'Servicio';
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const parts: string[] = [];
  for (const [name, count] of counts.entries()) {
    if (count > 1) {
      parts.push(`${count}x ${name}`);
    } else {
      parts.push(name);
    }
  }
  return parts.join(' + ');
}

export interface ResolvedServicesResult {
  ids: string[];
  names: string[];
  displayTitle: string;
  totalDuration: number;
  totalPrice: number;
  services: Array<any>;
}

export function resolveServices({
  allServices,
  serviceIds,
  servicesNames,
  serviceName,
}: {
  allServices: Array<any>;
  serviceIds?: string[];
  servicesNames?: string[];
  serviceName?: string;
}): ResolvedServicesResult {
  const matchedServices: Array<any> = [];

  const addCandidate = (candidate: any, quantity: number = 1) => {
    if (!candidate) return;
    const count = Math.max(1, Math.min(quantity, 10));
    for (let i = 0; i < count; i++) {
      matchedServices.push(candidate);
    }
  };

  // Helper to match a query substring to a service
  const matchCandidate = (queryStr: string) => {
    const qClean = cleanSearchStr(queryStr);
    if (!qClean || qClean.length < 3) return null;

    // Direct equality or contains
    let found = allServices.find(s => cleanSearchStr(s.name || s.nombre) === qClean);
    if (found) return found;
    found = allServices.find((s) => {
      const nom = cleanSearchStr(s.name || s.nombre);
      return nom === qClean || nom.includes(qClean) || qClean.includes(nom);
    });
    if (found) return found;

    // Specialized keyword heuristics
    if (/barba\s*expres/i.test(qClean)) {
      found = allServices.find((s) => cleanSearchStr(s.name || s.nombre).includes('barba expres'));
      if (found) return found;
    }

    if (/barba\s*cl[aá]sic|afeitad/i.test(qClean)) {
      found = allServices.find((s) => {
        const nom = cleanSearchStr(s.name || s.nombre);
        return nom.includes('clasic') || nom.includes('afeitado');
      });
      if (found) return found;
    }

    if (/corte\s*dama/i.test(qClean)) {
      found = allServices.find((s) => cleanSearchStr(s.name || s.nombre).includes('dama'));
      if (found) return found;
    }

    if (/corte/i.test(qClean)) {
      found = allServices.find((s) => {
        const nom = cleanSearchStr(s.name || s.nombre);
        return nom.includes('corte') && !nom.includes('dama');
      });
      if (found) return found;
    }

    if (/barba/i.test(qClean)) {
      found =
        allServices.find((s) => cleanSearchStr(s.name || s.nombre).includes('barba expres')) ||
        allServices.find((s) => cleanSearchStr(s.name || s.nombre).includes('barba'));
      if (found) return found;
    }

    if (/ceja/i.test(qClean)) {
      if (/cera|depila/i.test(qClean)) {
        found = allServices.find((s) => cleanSearchStr(s.name || s.nombre).includes('depilacion de ceja'));
        if (found) return found;
      }
      found = allServices.find((s) => cleanSearchStr(s.name || s.nombre).includes('ceja'));
      if (found) return found;
    }

    if (/facial/i.test(qClean)) {
      found = allServices.find((s) => cleanSearchStr(s.name || s.nombre).includes('facial'));
      if (found) return found;
    }

    if (/grecas?/i.test(qClean)) {
      found = allServices.find((s) => cleanSearchStr(s.name || s.nombre).includes('greca'));
      if (found) return found;
    }

    if (/lavado/i.test(qClean)) {
      found = allServices.find((s) => cleanSearchStr(s.name || s.nombre).includes('lavado'));
      if (found) return found;
    }

    if (/rizado/i.test(qClean)) {
      found = allServices.find((s) => cleanSearchStr(s.name || s.nombre).includes('rizado'));
      if (found) return found;
    }

    // Word matching fallback
    const words = qClean
      .split(/\s+/)
      .map((w) => w.replace(/ss$/, 's'))
      .filter((w) => w.length >= 3 && !['para', 'con', 'del', 'las', 'los', 'por', 'favor'].includes(w));

    if (words.length > 0) {
      found = allServices.find((s) => {
        const nom = cleanSearchStr(s.name || s.nombre).replace(/ss$/, 's');
        return words.every((w) => nom.includes(w));
      });
      if (found) return found;
    }

    return null;
  };

  // 1. Direct match by IDs (preserves exact instances in array)
  if (serviceIds && Array.isArray(serviceIds) && serviceIds.length > 0) {
    serviceIds.forEach((id) => {
      const match = allServices.find((s) => s.id === id);
      if (!match) throw new Error('Uno de los servicios solicitados no está disponible. Confirma los servicios antes de continuar.');
      matchedServices.push(match);
    });
  } else if (servicesNames && Array.isArray(servicesNames) && servicesNames.length > 0) {
    // 2. Process list of names if provided
    servicesNames.forEach((n) => {
      const { quantity, cleanQuery } = extractQuantityAndCleanQuery(n);
      const match = matchCandidate(cleanQuery) || matchCandidate(n);
      if (!match) throw new Error(`No se encontró el servicio: ${n}. Confirma el nombre antes de continuar.`);
      addCandidate(match, quantity);
    });
  } else if (serviceName) {
    // 3. Process single composite string if provided
    const exact = allServices.find(s => cleanSearchStr(s.name || s.nombre) === cleanSearchStr(serviceName));
    const parts = exact ? [serviceName] : serviceName
      .split(/\s*(?:\+|\by\b|\bcon\b|&|,)\s*/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 3);

    for (const part of parts) {
      const { quantity, cleanQuery } = extractQuantityAndCleanQuery(part);
      const match = matchCandidate(cleanQuery) || matchCandidate(part);
      if (!match) throw new Error(`No se encontró el servicio: ${part}. Confirma el nombre antes de continuar.`);
      addCandidate(match, quantity);
    }

    if (matchedServices.length === 0) {
      const { quantity, cleanQuery } = extractQuantityAndCleanQuery(serviceName);
      const match = matchCandidate(cleanQuery) || matchCandidate(serviceName);
      if (match) {
        addCandidate(match, quantity);
      }
    }
  }

  if (matchedServices.length === 0 && (serviceName || servicesNames?.length || serviceIds?.length)) throw new Error('No se encontraron los servicios solicitados.');

  // 4. Default fallback: Corte de cabello
  if (matchedServices.length === 0 && allServices.length > 0) {
    const defaultCorte = allServices.find((s) => cleanSearchStr(s.name || s.nombre).includes('corte'));
    matchedServices.push(defaultCorte || allServices[0]);
  }

  const names = matchedServices.map((s) => s.name || s.nombre || 'Servicio');
  const ids = matchedServices.map((s) => s.id);
  const totalDuration = matchedServices.reduce((sum, s) => sum + Number(s.duration || s.duracion || 30), 0);
  const totalPrice = matchedServices.reduce((sum, s) => sum + Number(s.price || s.precio || 0), 0);
  const displayTitle = formatServiceTitle(matchedServices);

  return {
    ids,
    names,
    displayTitle,
    totalDuration: totalDuration > 0 ? totalDuration : 30,
    totalPrice,
    services: matchedServices,
  };
}

/**
 * Calcula la duración exacta de uno o varios servicios para un barbero específico,
 * tomando en cuenta `durationPorProfesional` configurada en cada servicio.
 */
export function getBarberServiceDuration(services: Array<any>, barberId: string, fallbackDuration?: number): number {
  if (!services || services.length === 0) {
    return fallbackDuration && fallbackDuration > 0 ? fallbackDuration : 30;
  }
  const total = services.reduce((sum, s) => {
    let itemDur = 0;
    if (
      s.durationPorProfesional &&
      typeof s.durationPorProfesional === 'object' &&
      s.durationPorProfesional[barberId] !== undefined &&
      s.durationPorProfesional[barberId] !== null &&
      s.durationPorProfesional[barberId] !== ''
    ) {
      const custom = Number(s.durationPorProfesional[barberId]);
      if (!isNaN(custom) && custom > 0) {
        itemDur = custom;
      }
    }
    if (itemDur <= 0) {
      itemDur = Number(s.duration || s.duracion || 30);
    }
    return sum + (itemDur > 0 ? itemDur : 30);
  }, 0);
  return total > 0 ? total : (fallbackDuration && fallbackDuration > 0 ? fallbackDuration : 30);
}

/**
 * Verifica si un barbero tiene asignado/habilitado el servicio según la lista `professionals` del servicio.
 */
export function isBarberCapableOfServices(services: Array<any>, barberId: string): boolean {
  if (!services || services.length === 0) return true;
  return services.every((s) => {
    if (Array.isArray(s.professionals) && s.professionals.length > 0) {
      return s.professionals.includes(barberId);
    }
    return true;
  });
}
