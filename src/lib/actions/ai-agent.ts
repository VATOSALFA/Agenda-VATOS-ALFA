'use server';

import { AsyncLocalStorage } from 'node:async_hooks';
import { parseClientCustomDuration } from '@/lib/client-notes-helper';
import { getDb } from '@/lib/firebase-server';
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getAvailableSlots, createPublicReservation } from '@/lib/actions/booking';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { MercadoPagoConfig, Preference } from 'mercadopago';

interface ChatExecutionContext {
  conversationId: string;
  clientPhone: string;
  clientName?: string;
  clientNotes?: string;
  clientId?: string;
}

const chatContextStorage = new AsyncLocalStorage<ChatExecutionContext>();

// ==========================================
// 0. UTILIDADES DE NORMALIZACIÓN Y FECHAS
// ==========================================

function formatTime12h(timeStr: string): string {
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

function matchBarberName(rawQuery: string, barber: { name: string; publicName: string }): boolean {
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

function normalizeTimeTo24h(rawTime: string): string {
  if (!rawTime) return '17:00';
  let t = rawTime.trim().toLowerCase();
  const isPM = t.includes('pm') || t.includes('p.m.');
  const isAM = t.includes('am') || t.includes('a.m.');
  t = t.replace(/[^\d:]/g, '');
  let [hStr, mStr] = t.split(':');
  let h = parseInt(hStr || '0', 10);
  let m = parseInt(mStr || '0', 10);
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function cleanSearchStr(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Obtiene la información exacta de fechas y horas en la zona horaria oficial del negocio (Querétaro / Ciudad de México).
 */
function getMexicoDateInfo() {
  const timeZone = 'America/Mexico_City';
  const now = new Date();

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

  const friendlyToday = format(now, "EEEE d 'de' MMMM, yyyy, h:mm a", { locale: es });
  const friendlyTomorrow = format(tomorrowDate, "EEEE d 'de' MMMM", { locale: es });

  return {
    todayIso,
    tomorrowIso,
    dayAfterTomorrowIso,
    friendlyToday,
    friendlyTomorrow,
    now,
  };
}

/**
 * Normaliza y resuelve las fechas a consultar a partir de entradas de fecha textuales o ISO.
 */
function resolveTargetDates({
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
      // SI LA FECHA ES ANTERIOR A HOY (ej: 2024-05-16 o cualquier fecha en el pasado):
      // ¡ES IMPOSIBLE AGENDAR EN EL PASADO! Corregir automáticamente a mañana o hoy.
      if (clean < todayIso) {
        console.warn(`[resolveTargetDates] Fecha en el pasado detectada (${clean} < ${todayIso}). Reasignando a ${tomorrowIso}`);
        explicitDate = tomorrowIso;
      } else {
        explicitDate = clean;
      }
    } else if (clean.includes('pasado') && (clean.includes('mañana') || clean.includes('manana'))) {
      explicitDate = dayAfterTomorrowIso;
    } else if (clean.includes('mañana') || clean.includes('manana') || clean === 'tomorrow') {
      explicitDate = tomorrowIso;
    } else if (clean === 'hoy' || clean === 'today') {
      explicitDate = todayIso;
    } else {
      const daysOrder = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
      for (let i = 0; i < 7; i++) {
        const testD = new Date(Date.now() + i * 86400000);
        const name = format(testD, 'eeee', { locale: es }).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (clean.includes(name)) {
          explicitDate = format(testD, 'yyyy-MM-dd');
          break;
        }
      }
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
    const base = new Date();
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
function sanitizeBotMessage(rawText: string): string {
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
  text = text.replace(/([^\n])\s*(https?:\/\/[^\s]+)/g, '$1\n$2');
  text = text.replace(/(https?:\/\/[^\s]+)\s*([^\n\s])/g, '$1\n\n$2');

  return text.trim();
}

/**
 * Detecta si el cliente está confirmando explícitamente el cierre de la orden o respondiendo a la pregunta de upsell
 */
function isUserConfirmingClosureOrUpsell(userMessage: string, recentHistory: string): boolean {
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

function extractQuantityAndCleanQuery(raw: string): { quantity: number; cleanQuery: string } {
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

function formatServiceTitle(services: Array<any>): string {
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

interface ResolvedServicesResult {
  ids: string[];
  names: string[];
  displayTitle: string;
  totalDuration: number;
  totalPrice: number;
  services: Array<any>;
}

function resolveServices({
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
    let found = allServices.find((s) => {
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
      if (match) matchedServices.push(match);
    });
  } else if (servicesNames && Array.isArray(servicesNames) && servicesNames.length > 0) {
    // 2. Process list of names if provided
    servicesNames.forEach((n) => {
      const { quantity, cleanQuery } = extractQuantityAndCleanQuery(n);
      const match = matchCandidate(cleanQuery) || matchCandidate(n);
      if (match) {
        addCandidate(match, quantity);
      }
    });
  } else if (serviceName) {
    // 3. Process single composite string if provided
    const parts = serviceName
      .split(/\s*(?:\+|\by\b|\bcon\b|&|,)\s*/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 3);

    for (const part of parts) {
      const { quantity, cleanQuery } = extractQuantityAndCleanQuery(part);
      const match = matchCandidate(cleanQuery) || matchCandidate(part);
      if (match) {
        addCandidate(match, quantity);
      }
    }

    if (matchedServices.length === 0) {
      const { quantity, cleanQuery } = extractQuantityAndCleanQuery(serviceName);
      const match = matchCandidate(cleanQuery) || matchCandidate(serviceName);
      if (match) {
        addCandidate(match, quantity);
      }
    }
  }

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
function getBarberServiceDuration(services: Array<any>, barberId: string, fallbackDuration?: number): number {
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
function isBarberCapableOfServices(services: Array<any>, barberId: string): boolean {
  if (!services || services.length === 0) return true;
  return services.every((s) => {
    if (Array.isArray(s.professionals) && s.professionals.length > 0) {
      return s.professionals.includes(barberId);
    }
    return true;
  });
}

// ==========================================
// 0.1 CÁLCULO DE ANTICIPOS Y MERCADO PAGO
// ==========================================

interface AnticipoCalculation {
  requiereAnticipo: boolean;
  montoTotal: number;
  montoAnticipo: number;
  porcentajeAnticipo: number;
  saldoPendiente: number;
  motivo: string;
}

async function calcularAnticipoParaServicios(
  services: Array<any>,
  extraProductsAmount: number = 0
): Promise<AnticipoCalculation> {
  const db = getDb();
  let total = Number(extraProductsAmount || 0);
  let upfrontFromServices = 0;

  for (const s of services) {
    const price = Number(s.price || s.precio || 0);
    total += price;

    const pType = s.payment_type || (s.requiere_anticipo ? 'online-deposit' : 'no-payment');
    if (pType === 'online-deposit') {
      const amountType = s.payment_amount_type || s.tipo_anticipo || '%';
      const amountValue = Number(s.payment_amount_value || s.monto_anticipo || 50);

      if (amountType === '$' && amountValue > 0) {
        upfrontFromServices += amountValue;
      } else if (amountType === '%' && amountValue > 0) {
        upfrontFromServices += price * (amountValue / 100);
      } else {
        upfrontFromServices += price * 0.5;
      }
    } else if (pType === 'full-payment') {
      upfrontFromServices += price;
    }
  }

  // Regla Global: Consultar configuracion/servicios en Firestore
  let globalMinThreshold = 190;
  let globalDefaultPercent = 50;
  let globalActive = true;

  try {
    const cfgDoc = await db.collection('configuracion').doc('servicios').get();
    if (cfgDoc.exists) {
      const cfg = cfgDoc.data()!;
      if (typeof cfg.anticipo_monto_minimo_activo === 'boolean') {
        globalActive = cfg.anticipo_monto_minimo_activo;
      }
      if (Number(cfg.anticipo_monto_minimo) > 0) {
        globalMinThreshold = Number(cfg.anticipo_monto_minimo);
      }
      if (Number(cfg.anticipo_porcentaje_defecto) > 0) {
        globalDefaultPercent = Number(cfg.anticipo_porcentaje_defecto);
      }
    }
  } catch (err) {
    console.error('Error fetching global servicios config:', err);
  }

  let finalUpfront = upfrontFromServices;
  let motivo = '';

  if (globalActive && total >= globalMinThreshold) {
    const thresholdUpfront = total * (globalDefaultPercent / 100);
    if (finalUpfront < thresholdUpfront) {
      finalUpfront = thresholdUpfront;
      motivo = `Aplica anticipo del ${globalDefaultPercent}% por monto total ($${total} MXN) igual o superior al umbral de $${globalMinThreshold} MXN.`;
    }
  }

  finalUpfront = Math.round(finalUpfront * 100) / 100;
  const requiereAnticipo = finalUpfront > 0;
  const saldoPendiente = Math.max(0, total - finalUpfront);
  const porcentaje = total > 0 ? Math.round((finalUpfront / total) * 100) : 0;

  return {
    requiereAnticipo,
    montoTotal: total,
    montoAnticipo: finalUpfront,
    porcentajeAnticipo: porcentaje,
    saldoPendiente,
    motivo: motivo || (requiereAnticipo ? `Anticipo requerido: $${finalUpfront} MXN (${porcentaje}%)` : 'No requiere anticipo'),
  };
}

async function crearPreferenciaMercadoPagoChat({
  reservationId,
  title,
  amount,
  clientName,
  clientPhone,
}: {
  reservationId: string;
  title: string;
  amount: number;
  clientName?: string;
  clientPhone?: string;
}): Promise<{ id: string; initPoint: string } | null> {
  try {
    const accessToken =
      process.env.MERCADO_PAGO_ACCESS_TOKEN ||
      process.env.MP_WEB_ACCESS_TOKEN ||
      process.env.MP_ACCESS_TOKEN ||
      '';

    if (!accessToken || accessToken.length < 10) {
      console.error('[MP Chat] Access token is missing or invalid.');
      return null;
    }

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    let baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://vatosalfa.com';
    if (!baseUrl || baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
      baseUrl = 'https://vatosalfa.com';
    }
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    const returnUrl = baseUrl;

    const backUrls = {
      success: `${returnUrl}/`,
      failure: `${returnUrl}/reserva/fallida`,
      pending: `${returnUrl}/`,
    };

    const nameParts = (clientName || 'Cliente').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Cliente';
    const lastName = nameParts.slice(1).join(' ') || 'Alfa';
    const cleanPhone = (clientPhone || '').replace(/\D/g, '').slice(-10);

    const bodyData = {
      items: [
        {
          id: 'deposit',
          title: `Anticipo: ${title}`.substring(0, 250),
          description: `Anticipo para reserva en VATOS ALFA Barber Shop (${title})`.substring(0, 250),
          category_id: 'services',
          quantity: 1,
          currency_id: 'MXN',
          unit_price: Math.round(amount * 100) / 100,
        },
      ],
      payer: {
        name: firstName,
        surname: lastName,
        ...(cleanPhone.length === 10
          ? {
              phone: {
                area_code: '52',
                number: cleanPhone,
              },
            }
          : {}),
      },
      external_reference: reservationId,
      statement_descriptor: 'VATOS ALFA',
      expires: true,
      date_of_expiration: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      payment_methods: {
        installments: 1,
        excluded_payment_types: [{ id: 'ticket' }],
      },
      back_urls: backUrls,
      auto_return: 'approved' as const,
      metadata: {
        reservation_id: reservationId,
        origin: 'chatbot',
      },
      notification_url: 'https://agenda-1ae08.web.app/api/mercado-pago-webhook',
    };

    const result = await preference.create({ body: bodyData });
    const initPoint = result.init_point || result.sandbox_init_point || '';
    return {
      id: result.id || '',
      initPoint,
    };
  } catch (err) {
    console.error('Error creating Mercado Pago preference for chat:', err);
    return null;
  }
}

// ==========================================
// 1. HERRAMIENTAS / TOOLS PARA GENKIT
// ==========================================

const consultarServiciosTool = ai.defineTool(
  {
    name: 'consultar_servicios',
    description:
      'Obtiene el catálogo de servicios activos de VATOS ALFA con sus IDs, nombres, duración base en minutos, duración específica por cada barbero/experto (ej. Beatriz 30 min, Lalo 60 min, Ivon 40 min), precio en pesos mexicanos y si requiere anticipo.',
    inputSchema: z.object({}),
    outputSchema: z.array(
      z.object({
        id: z.string(),
        nombre: z.string(),
        duracion: z.number(),
        duracionPorBarbero: z.record(z.string(), z.number()).optional(),
        duracionesDetalle: z.string().optional(),
        barberosHabilitados: z.array(z.string()).optional(),
        precio: z.number(),
        requiereAnticipo: z.boolean(),
        montoAnticipo: z.number(),
        politicaAnticipo: z.string(),
      })
    ),
  },
  async () => {
    try {
      const db = getDb();
      const [servsSnap, profsSnap] = await Promise.all([
        db.collection('servicios').where('active', '==', true).get(),
        db.collection('profesionales').where('active', '==', true).get(),
      ]);

      const profMap: Record<string, string> = {};
      profsSnap.docs.forEach((d) => {
        const pData = d.data();
        profMap[d.id] = pData.publicName || pData.name || 'Barbero';
      });

      let globalMin = 190;
      let globalPct = 50;
      let globalActive = true;
      try {
        const cfgDoc = await db.collection('configuracion').doc('servicios').get();
        if (cfgDoc.exists) {
          const cfg = cfgDoc.data()!;
          if (typeof cfg.anticipo_monto_minimo_activo === 'boolean') globalActive = cfg.anticipo_monto_minimo_activo;
          if (Number(cfg.anticipo_monto_minimo) > 0) globalMin = Number(cfg.anticipo_monto_minimo);
          if (Number(cfg.anticipo_porcentaje_defecto) > 0) globalPct = Number(cfg.anticipo_porcentaje_defecto);
        }
      } catch (_) {}

      return servsSnap.docs.map((doc) => {
        const d = doc.data();
        const price = Number(d.price || d.precio || 0);
        const reqDirect = Boolean(d.requiere_anticipo || d.payment_type === 'online-deposit');
        const reqThreshold = globalActive && price >= globalMin;
        const req = reqDirect || reqThreshold;
        let depositAmount = 0;
        if (reqDirect) {
          const amtType = d.payment_amount_type || d.tipo_anticipo || '%';
          const amtVal = Number(d.payment_amount_value || d.monto_anticipo || 50);
          depositAmount = amtType === '$' ? amtVal : price * (amtVal / 100);
        } else if (reqThreshold) {
          depositAmount = price * (globalPct / 100);
        }

        const customDurations: Record<string, number> = {};
        const detailsArr: string[] = [];
        if (d.durationPorProfesional && typeof d.durationPorProfesional === 'object') {
          for (const [profId, dur] of Object.entries(d.durationPorProfesional)) {
            const barberName = profMap[profId];
            if (barberName && dur !== undefined && dur !== null && dur !== '') {
              const durNum = Number(dur);
              if (!isNaN(durNum) && durNum > 0) {
                customDurations[barberName] = durNum;
                detailsArr.push(`${barberName}: ${durNum} min`);
              }
            }
          }
        }

        const barberosHabilitados: string[] = [];
        if (Array.isArray(d.professionals) && d.professionals.length > 0) {
          d.professionals.forEach((pId: string) => {
            if (profMap[pId]) barberosHabilitados.push(profMap[pId]);
          });
        }

        return {
          id: doc.id,
          nombre: d.name || d.nombre || 'Servicio',
          duracion: Number(d.duration || d.duracion || 30),
          duracionPorBarbero: Object.keys(customDurations).length > 0 ? customDurations : undefined,
          duracionesDetalle: detailsArr.length > 0 ? detailsArr.join(' | ') : undefined,
          barberosHabilitados: barberosHabilitados.length > 0 ? barberosHabilitados : undefined,
          precio: price,
          requiereAnticipo: req,
          montoAnticipo: Math.round(depositAmount),
          politicaAnticipo: req
            ? `Requiere anticipo de $${Math.round(depositAmount)} MXN (${reqDirect ? 'configurado en el servicio' : `50% por superar $${globalMin} MXN`})`
            : `Sin anticipo individual (aplica 50% de anticipo si se combina con otros servicios sumando $${globalMin}+ MXN)`,
        };
      });
    } catch (e: any) {
      console.error('Error in consultar_servicios:', e);
      return [];
    }
  }
);

const consultarBarberosTool = ai.defineTool(
  {
    name: 'consultar_barberos',
    description: 'Obtiene la lista de barberos/profesionales activos en la barberia con sus IDs y nombres.',
    inputSchema: z.object({}),
    outputSchema: z.array(
      z.object({
        id: z.string(),
        nombre: z.string(),
      })
    ),
  },
  async () => {
    try {
      const db = getDb();
      const snap = await db.collection('profesionales').where('active', '==', true).get();
      return snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          nombre: d.publicName || d.name || 'Barbero',
        };
      });
    } catch (e: any) {
      console.error('Error in consultar_barberos:', e);
      return [];
    }
  }
);

const consultarDisponibilidadTool = ai.defineTool(
  {
    name: 'consultar_disponibilidad',
    description:
      'Consulta los horarios libres reales en la agenda de VATOS ALFA. Puede consultar para una fecha específica o buscar automáticamente en los próximos 3 a 7 días los horarios más próximos disponibles con un barbero específico o con todos los barberos. Calcula automáticamente la duración exacta por barbero/experto según la configuración del servicio (por ejemplo: Beatriz tarda 30 min, Lalo tarda 60 min en corte), permitiendo encontrar espacios continuos reales y precisos.',
    inputSchema: z.object({
      fecha: z
        .string()
        .optional()
        .describe('Fecha en formato AAAA-MM-DD. AÑO ACTUAL OBLIGATORIO: 2026. Si el cliente pregunta por "mañana", pasa obligatoriamente "2026-09-20" (domingo). Si pregunta por "hoy", pasa "2026-09-19" (sábado). ESTÁ TERMINANTEMENTE PROHIBIDO usar 2024 o mayo. Si no se especifica día o pide lo más próximo, déjalo vacío para buscar los próximos días.'),
      profesionalId: z.string().optional().describe('ID opcional del barbero'),
      barberoNombre: z
        .string()
        .optional()
        .describe('Nombre del barbero (ej. Beatriz, Bety, Lalo, Eduardo, Ivon, Lupita, Alfredo)'),
      servicioNombre: z
        .string()
        .optional()
        .describe('Nombre del servicio o combinación de servicios (ej. "Corte de cabello", "Corte de cabello + Barba express", "Corte y barba"). Si se omite, se asume Corte de cabello por defecto.'),
      serviciosNombres: z
        .array(z.string())
        .optional()
        .describe('Lista opcional de nombres de los servicios si son varios. Si un servicio se repite (ej. 2 cortes de cabello o corte para dos personas), INCLÚYELO REPETIDO en la lista (ej: ["Corte de cabello", "Corte de cabello", "Arreglo de ceja"]) o indica la cantidad (ej: ["2 cortes de cabello", "arreglo de ceja"])'),
      duracionMinutos: z.number().optional().describe('Duración manual forzada en minutos (opcional). Si se omite, el sistema calcula automáticamente la duración exacta de cada barbero según el servicio o las notas personalizadas del cliente.'),
      clienteTelefono: z.string().optional().describe('Teléfono del cliente (opcional para detectar notas del cliente y duraciones especiales personalizadas)'),
      clienteNombre: z.string().optional().describe('Nombre del cliente'),
      diasABuscar: z
        .number()
        .optional()
        .describe('Número de días a consultar a partir de la fecha inicial (por defecto 4 para encontrar lo más próximo)'),
    }),
    outputSchema: z.object({
      disponibilidadPorFecha: z.array(
        z.object({
          fecha: z.string(),
          diaSemana: z.string(),
          barberoId: z.string(),
          barberoNombre: z.string(),
          duracionMinutos: z.number().optional(),
          horarios: z.array(z.string()),
        })
      ),
      resumenTexto: z.string(),
      duracionConsultada: z.number().optional(),
      serviciosConsultados: z.string().optional(),
      mensaje: z.string().optional(),
    }),
  },
  async ({ fecha, profesionalId, barberoNombre, servicioNombre, serviciosNombres, duracionMinutos, diasABuscar, clienteTelefono, clienteNombre }) => {
    try {
      console.log('--- Tool called: consultar_disponibilidad with args:', { fecha, profesionalId, barberoNombre, servicioNombre, serviciosNombres, duracionMinutos, diasABuscar, clienteTelefono, clienteNombre });
      const db = getDb();

      // Cargar posibles notas del expediente del cliente (desde contexto o búsqueda rápida)
      const currentCtx = chatContextStorage.getStore();
      let resolvedNotes = currentCtx?.clientNotes || '';
      if (!resolvedNotes && (clienteTelefono || currentCtx?.clientPhone)) {
        try {
          const tPhone = (clienteTelefono || currentCtx?.clientPhone || '').replace(/\D/g, '').slice(-10);
          if (tPhone) {
            const snap = await db.collection('clientes').where('telefono', '==', tPhone).limit(1).get();
            if (!snap.empty) {
              resolvedNotes = snap.docs[0].data().notas || snap.docs[0].data().nota || '';
            }
          }
        } catch (noteErr) {
          // ignore
        }
      }

      // Cargar servicios activos
      const servsSnap = await db.collection('servicios').where('active', '==', true).get();
      const allServices = servsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Resolver servicios siempre para tener la lista de servicios a evaluar
      const resolved = resolveServices({
        allServices,
        servicesNames: serviciosNombres,
        serviceName: servicioNombre,
      });

      const selectedServices = resolved.services;
      const evaluatedServiceName = resolved.displayTitle || resolved.names.join(' + ');

      const profsSnap = await db.collection('profesionales').where('active', '==', true).get();
      const barbers = profsSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name || '',
        publicName: d.data().publicName || d.data().name || 'Barbero',
      }));

      let targetBarbers = barbers;
      if (profesionalId) {
        targetBarbers = barbers.filter((b) => b.id === profesionalId);
      } else if (barberoNombre) {
        const matched = barbers.filter((b) => matchBarberName(barberoNombre, b));
        if (matched.length > 0) {
          targetBarbers = matched;
        }
      }

      // Filtrar sólo barberos habilitados para realizar los servicios solicitados
      targetBarbers = targetBarbers.filter((b) => isBarberCapableOfServices(selectedServices, b.id));

      const datesToCheck = resolveTargetDates({ fechaInput: fecha, diasABuscar });

      const results: Array<{
        fecha: string;
        diaSemana: string;
        barberoId: string;
        barberoNombre: string;
        duracionMinutos: number;
        horarios: string[];
      }> = [];

      for (const curDate of datesToCheck) {
        const parsed = new Date(curDate + 'T12:00:00');
        const dayLabel = format(parsed, "EEEE d 'de' MMMM", { locale: es });

        for (const b of targetBarbers) {
          try {
            // Verificar si el cliente tiene duración personalizada en sus notas para este barbero
            let customClientDuration: number | null = null;
            if (resolvedNotes) {
              customClientDuration = parseClientCustomDuration(resolvedNotes, b.publicName || b.name);
            }

            // Calcular la duración específica para ESTE barbero
            const barberDuration = duracionMinutos && duracionMinutos > 0
              ? duracionMinutos
              : (customClientDuration || getBarberServiceDuration(selectedServices, b.id, 30));

            const res = await getAvailableSlots({
              date: curDate,
              professionalId: b.id,
              durationMinutes: barberDuration,
            });

            if (res && 'slots' in res && Array.isArray((res as any).slots) && (res as any).slots.length > 0) {
              results.push({
                fecha: curDate,
                diaSemana: dayLabel,
                barberoId: b.id,
                barberoNombre: b.publicName,
                duracionMinutos: barberDuration,
                horarios: (res as any).slots,
              });
            }
          } catch (slotErr) {
            console.error(`Error fetching slots for barber ${b.id} on ${curDate}:`, slotErr);
          }
        }
      }

      let resumenTexto = '';
      if (results.length === 0) {
        const srvTxt = evaluatedServiceName ? ` para ${evaluatedServiceName}` : '';
        resumenTexto = `No hay horarios disponibles${srvTxt} en las fechas consultadas (${datesToCheck.join(', ')}).`;
      } else {
        resumenTexto = results
          .map((r) => {
            const sample12h = r.horarios.slice(0, 5).map((h) => formatTime12h(h)).join(', ');
            return `${r.diaSemana} con ${r.barberoNombre} (${evaluatedServiceName || 'Servicio'} - ${r.duracionMinutos} min): opciones disponibles como ${sample12h} (total ${r.horarios.length} espacios libres)`;
          })
          .join('\n');
      }

      return {
        disponibilidadPorFecha: results,
        resumenTexto,
        serviciosConsultados: evaluatedServiceName,
        duracionConsultada: results.length > 0 ? results[0].duracionMinutos : undefined,
      };
    } catch (e: any) {
      console.error('Error in consultar_disponibilidad:', e);
      return {
        disponibilidadPorFecha: [],
        resumenTexto: `Error consultando disponibilidad: ${e.message}`,
        mensaje: e.message,
      };
    }
  }
);

async function resolveProducts(
  db: any,
  productNames?: string[],
  singleProductName?: string
): Promise<Array<{ id: string; nombre: string; precio: number; cantidad: number }>> {
  const namesToFind: string[] = [];
  if (singleProductName && singleProductName.trim()) {
    namesToFind.push(singleProductName.trim());
  }
  if (Array.isArray(productNames)) {
    for (const p of productNames) {
      if (p && p.trim() && !namesToFind.includes(p.trim())) {
        namesToFind.push(p.trim());
      }
    }
  }

  if (namesToFind.length === 0) return [];

  const snap = await db.collection('productos').where('active', '==', true).get();
  const allProducts = snap.docs.map((d: any) => {
    const data = d.data();
    return {
      id: d.id,
      nombre: data.nombre || '',
      precio: Number(data.public_price || data.precio_venta || data.precio || 0),
      stock: Number(data.stock || 0),
    };
  });

  const resolved: Array<{ id: string; nombre: string; precio: number; cantidad: number }> = [];

  for (const query of namesToFind) {
    const qClean = cleanSearchStr(query);
    let match = allProducts.find((p: any) => {
      const nClean = cleanSearchStr(p.nombre);
      return nClean.includes(qClean) || qClean.includes(nClean);
    });

    if (!match) {
      const words = qClean.split(/\s+/).filter((w: string) => w.length > 2 && !['una', 'uno', 'para', 'con', 'por', 'las', 'los', 'del'].includes(w));
      if (words.length > 0) {
        match = allProducts.find((p: any) => {
          const nClean = cleanSearchStr(p.nombre);
          return words.some((w: string) => nClean.includes(w));
        });
      }
    }

    if (match) {
      const existing = resolved.find((r) => r.id === match.id);
      if (existing) {
        existing.cantidad += 1;
      } else {
        resolved.push({
          id: match.id,
          nombre: match.nombre,
          precio: match.precio,
          cantidad: 1,
        });
      }
    }
  }

  return resolved;
}

const crearCitaTool = ai.defineTool(
  {
    name: 'crear_cita',
    description:
      'Crea y confirma una cita en la agenda de la barbería en tiempo real. ¡ATENCIÓN!: ESTÁ ESTRICTAMENTE PROHIBIDO LLAMAR A ESTA HERRAMIENTA cuando el cliente apenas está eligiendo o confirmando el horario (ej: "me queda bien el de las 7:30", "a las 5:00") y todavía NO se le ha preguntado si desea agregar algún producto o servicio extra. Primero debes preguntarle: "¿Sería únicamente tu corte de cabello o te gustaría agregar algún otro servicio o producto para peinar?". SOLO ejecuta esta herramienta cuando el cliente responda a esa pregunta confirmando que sería todo (ej: "solo corte", "sería todo", "así está bien") o indicando qué producto o servicio desea agregar.',
    inputSchema: z.object({
      fecha: z.string().describe('Fecha de la cita AAAA-MM-DD en el año actual 2026 (ejemplo: 2026-09-20 para mañana domingo). ESTÁ PROHIBIDO usar 2024 o fechas del pasado.'),
      hora: z.string().describe('Hora de inicio (ejemplo 17:00 o 5:00 PM)'),
      profesionalId: z.string().optional().describe('ID del barbero'),
      barberoNombre: z.string().optional().describe('Nombre del barbero (ej. Beatriz, Bety, Lalo, Eduardo, Ivon, Lupita, Alfredo)'),
      servicioIds: z.array(z.string()).optional().describe('Lista con IDs de servicio'),
      servicioNombre: z.string().optional().describe('Nombre del servicio o combinacion de servicios (ej. "Corte de cabello", "Corte de cabello + Barba express", "Corte y barba")'),
      serviciosNombres: z.array(z.string()).optional().describe('Lista opcional de nombres de los servicios si son varios. Si un servicio se repite (ej. 2 personas o 2 cortes), INCLÚYELO REPETIDO en la lista (ej: ["Corte de cabello", "Corte de cabello", "Arreglo de ceja"]) o con multiplicador (ej: ["2 cortes de cabello", "arreglo de ceja"])'),
      productoNombre: z.string().optional().describe('Nombre de un producto fisico que el cliente desea comprar o apartar junto a su cita (ej. "Cera para peinar", "After shave", "Polvo textura")'),
      productosNombres: z.array(z.string()).optional().describe('Lista opcional de nombres de productos fisicos a apartar junto a la cita'),
      nombreCliente: z.string().describe('Nombre del cliente. Si ya conoces al cliente en la conversación, USA SU NOMBRE DIRECTAMENTE SIN PEDÍRSELO. Solo pídelo si no se tiene nombre registrado o si agenda para otra persona.'),
      telefonoCliente: z.string().describe('Teléfono del cliente. USA EL TELÉFONO DE LA CONVERSACIÓN DIRECTAMENTE SIN PEDÍRSELO. Solo pídelo si agenda para otra persona.'),
      notas: z.string().optional().describe('Notas o peticiones especiales'),
      duracionMinutos: z.number().optional().describe('Duración total en minutos calculada para la cita (incluyendo duraciones personalizadas de notas de cliente o cabello difícil si aplica)'),
    }),
    outputSchema: z.object({
      exito: z.boolean(),
      citaId: z.string().optional(),
      requiereAnticipo: z.boolean().optional(),
      montoTotal: z.number().optional(),
      montoAnticipo: z.number().optional(),
      saldoPendiente: z.number().optional(),
      linkPago: z.string().optional(),
      mensaje: z.string(),
      detalles: z.string().optional(),
    }),
  },
  async ({ fecha, hora, profesionalId, barberoNombre, servicioIds, servicioNombre, serviciosNombres, productoNombre, productosNombres, nombreCliente, telefonoCliente, notas, duracionMinutos }) => {
    try {
      console.log('--- Tool called: crear_cita with args:', { fecha, hora, barberoNombre, servicioNombre, serviciosNombres, productoNombre, productosNombres, nombreCliente, telefonoCliente, duracionMinutos });
      const db = getDb();
      const dateInfo = getMexicoDateInfo();
      let targetFecha = (fecha || '').trim();
      if (!targetFecha || targetFecha < dateInfo.todayIso) {
        console.warn(`[crearCitaTool] Fecha en el pasado o inválida recibida (${targetFecha}), corrigiendo a ${dateInfo.tomorrowIso}`);
        targetFecha = dateInfo.tomorrowIso;
      }
      const normalizedTime = normalizeTimeTo24h(hora);
      const time12h = formatTime12h(normalizedTime);

      // Resolver barbero
      let finalProfId = profesionalId;
      let finalBarberName = barberoNombre || 'tu barbero';

      const profsSnap = await db.collection('profesionales').where('active', '==', true).get();
      const barbers = profsSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name || '',
        publicName: d.data().publicName || d.data().name || 'Barbero',
      }));

      if (barberoNombre) {
        const found = barbers.find((b) => matchBarberName(barberoNombre, b));
        if (found) {
          finalProfId = found.id;
          finalBarberName = found.publicName;
        }
      }

      if (!finalProfId) {
        if (barbers.length > 0) {
          finalProfId = barbers[0].id;
          finalBarberName = barbers[0].publicName;
        }
      }

      // Resolver servicios con soporte para múltiples servicios
      const servsSnap = await db.collection('servicios').where('active', '==', true).get();
      const allServices = servsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const resolved = resolveServices({
        allServices,
        serviceIds: servicioIds,
        servicesNames: serviciosNombres,
        serviceName: servicioNombre,
      });

      const finalServIds = resolved.ids;
      const finalServName = resolved.displayTitle || resolved.names.join(' + ');
      const selectedServices = resolved.services;

      // Resolver notas del cliente para duraciones personalizadas
      const currentCtx = chatContextStorage.getStore();
      let resolvedClientNotes = currentCtx?.clientNotes || '';
      if (!resolvedClientNotes && (telefonoCliente || currentCtx?.clientPhone)) {
        try {
          const tPhone = (telefonoCliente || currentCtx?.clientPhone || '').replace(/\D/g, '').slice(-10);
          if (tPhone) {
            const snap = await db.collection('clientes').where('telefono', '==', tPhone).limit(1).get();
            if (!snap.empty) {
              resolvedClientNotes = snap.docs[0].data().notas || snap.docs[0].data().nota || '';
            }
          }
        } catch (noteErr) {
          // ignore
        }
      }

      let customClientDuration: number | null = null;
      if (resolvedClientNotes && finalBarberName) {
        customClientDuration = parseClientCustomDuration(resolvedClientNotes, finalBarberName);
      }
      const finalDuration = duracionMinutos && duracionMinutos > 0 ? duracionMinutos : (customClientDuration || undefined);

      // Resolver productos físicos opcionales
      const resolvedProducts = await resolveProducts(db, productosNombres, productoNombre);
      const extraProductsAmount = resolvedProducts.reduce((sum, p) => sum + (p.precio * (p.cantidad || 1)), 0);

      // Calcular anticipo con servicios + productos
      const anticipoCalc = await calcularAnticipoParaServicios(selectedServices, extraProductsAmount);

      const nameParts = (nombreCliente || 'Cliente').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Cliente';
      const lastName = nameParts.slice(1).join(' ') || 'Alfa';

      const productsSummary = resolvedProducts.map((p) => `${p.nombre} (x${p.cantidad})`).join(', ');
      const extraNotes = [
        notas ? notas : '',
        productsSummary ? `Productos apartados: ${productsSummary}` : '',
        anticipoCalc.requiereAnticipo ? `Requiere anticipo: $${anticipoCalc.montoAnticipo}` : 'Agendado por Asistente Virtual Sofía',
      ].filter(Boolean).join(' | ');

      const res = await createPublicReservation({
        client: {
          name: firstName,
          lastName: lastName,
          phone: telefonoCliente,
        },
        serviceIds: finalServIds,
        professionalId: finalProfId!,
        date: targetFecha,
        time: normalizedTime,
        duration: finalDuration,
        customDuration: finalDuration,
        notes: extraNotes,
        origin: 'chatbot',
        canal_reserva: 'chatbot',
        status: anticipoCalc.requiereAnticipo ? 'Pendiente de pago' : 'Reservado',
        amountDue: anticipoCalc.montoAnticipo,
        totalAmount: anticipoCalc.montoTotal,
        paymentStatus: anticipoCalc.requiereAnticipo ? 'pending_payment' : 'pendiente',
        productItems: resolvedProducts,
      });

      if ('error' in res && res.error) {
        let alternativeSlotsText = '';
        try {
          const barberDuration = finalDuration || getBarberServiceDuration(selectedServices, finalProfId!, 30);
          const slotsRes = await getAvailableSlots({
            date: targetFecha,
            professionalId: finalProfId!,
            durationMinutes: barberDuration,
          });
          const validSlots = (slotsRes as any).slots || [];
          if (validSlots.length > 0) {
            const formatted = validSlots.map((s: string) => formatTime12h(s)).join(', ');
            alternativeSlotsText = ` Horarios disponibles reales donde sí cabe la duración completa (${finalServName} - ${barberDuration} min) con ${finalBarberName} para esa fecha: ${formatted}.`;
          }
        } catch (e) {
          // ignore
        }

        return {
          exito: false,
          mensaje: `No fue posible registrar a las ${time12h} porque la duración acumulada de los servicios seleccionados (${finalServName}) excede el horario de cierre del barbero o interfiere con otra cita.${alternativeSlotsText} Por favor explícaselo con amabilidad al cliente (mencionando que por la suma de servicios se requiere iniciar más temprano antes del cierre) y ofrécele de inmediato las opciones de horarios viables donde sí caben ambos servicios.`,
        };
      }

      const reservationId = (res as any).reservationId || (res as any).id;

      // Si requiere anticipo, generar preferencia de Mercado Pago y asociar enlace
      if (anticipoCalc.requiereAnticipo) {
        const fullTitle = resolvedProducts.length > 0
          ? `${finalServName} + ${resolvedProducts.map((p) => p.nombre).join(', ')} (${targetFecha} ${time12h})`
          : `${finalServName} (${targetFecha} ${time12h})`;

        const pref = await crearPreferenciaMercadoPagoChat({
          reservationId,
          title: fullTitle,
          amount: anticipoCalc.montoAnticipo,
          clientName: nombreCliente,
          clientPhone: telefonoCliente,
        });

        const linkPago = pref?.initPoint || '';

        if (linkPago) {
          await db.collection('reservas').doc(reservationId).update({
            link_pago_anticipo: linkPago,
            preference_id: pref?.id || '',
            anticipo_esperado: anticipoCalc.montoAnticipo,
            saldo_pendiente: anticipoCalc.saldoPendiente,
            requiere_pago_anticipado: true,
            pago_estado: 'pending_payment',
            estado: 'Pendiente de pago',
            canal_reserva: 'chatbot',
            origen: 'chatbot',
          });
        }

        const productosTexto = resolvedProducts.length > 0
          ? ` más ${resolvedProducts.map((p) => `${p.nombre} por $${p.precio} MXN`).join(', ')}`
          : '';

        return {
          exito: true,
          citaId: reservationId,
          requiereAnticipo: true,
          montoTotal: anticipoCalc.montoTotal,
          montoAnticipo: anticipoCalc.montoAnticipo,
          saldoPendiente: anticipoCalc.saldoPendiente,
          linkPago,
          mensaje: `Cita pre-apartada. Se requiere un anticipo de $${anticipoCalc.montoAnticipo} MXN para confirmar.`,
          detalles: `Cita pre-apartada para ${targetFecha} a las ${time12h} con ${finalBarberName} para ${finalServName}${productosTexto}. Total: $${anticipoCalc.montoTotal} MXN. Anticipo requerido: $${anticipoCalc.montoAnticipo} MXN. Saldo a liquidar en sucursal: $${anticipoCalc.saldoPendiente} MXN.\n\nEnlace de pago seguro de Mercado Pago:\n${linkPago}\n\nDEBES compartirle este enlace al cliente en su propia línea para que realice su anticipo. IMPORTANTE: Escribe tu respuesta en texto completamente limpio, SIN asteriscos y SIN paréntesis alrededor de los precios o fechas.`,
        };
      }

      const productosTexto = resolvedProducts.length > 0
        ? ` y te aparté ${resolvedProducts.map((p) => `${p.nombre} por $${p.precio} MXN`).join(', ')}`
        : '';

      return {
        exito: true,
        citaId: reservationId,
        requiereAnticipo: false,
        montoTotal: anticipoCalc.montoTotal,
        montoAnticipo: 0,
        saldoPendiente: anticipoCalc.montoTotal,
        mensaje: '¡Cita confirmada y registrada en la agenda con éxito!',
        detalles: `Cita confirmada para ${targetFecha} a las ${time12h} con ${finalBarberName} para ${finalServName}${productosTexto}. Total: $${anticipoCalc.montoTotal} MXN a liquidar al terminar en sucursal.`,
      };
    } catch (e: any) {
      console.error('Error in crear_cita:', e);
      return { exito: false, mensaje: e.message || 'No se pudo crear la cita.' };
    }
  }
);

const agregarProductoACitaTool = ai.defineTool(
  {
    name: 'agregar_producto_a_cita',
    description:
      'Agrega un producto físico (cera para peinar, aftershave, sérum, shampoo, polvo textura, etc.) a una cita ya existente del cliente. Actualiza los productos de la cita en la agenda (activando la insignia P), actualiza el total y recalcula el anticipo si aplica.',
    inputSchema: z.object({
      citaId: z.string().optional().describe('ID de la reserva si se conoce'),
      telefonoCliente: z.string().optional().describe('Teléfono del cliente para localizar su cita activa'),
      productoNombre: z.string().describe('Nombre del producto a agregar (ej: Cera para peinar, After shave, Polvo textura)'),
      productosNombres: z.array(z.string()).optional().describe('Lista opcional si son varios productos'),
      cantidad: z.number().optional().describe('Cantidad de piezas (por defecto 1)'),
    }),
    outputSchema: z.object({
      exito: z.boolean(),
      citaId: z.string().optional(),
      montoTotalAnterior: z.number().optional(),
      montoTotalNuevo: z.number().optional(),
      productosAgregados: z.array(z.string()).optional(),
      requiereAnticipo: z.boolean().optional(),
      montoAnticipo: z.number().optional(),
      saldoPendiente: z.number().optional(),
      linkPago: z.string().optional(),
      mensaje: z.string(),
      detalles: z.string().optional(),
    }),
  },
  async ({ citaId, telefonoCliente, productoNombre, productosNombres, cantidad = 1 }) => {
    try {
      const db = getDb();
      let resDoc: any = null;
      let targetCitaId = citaId;

      if (targetCitaId) {
        const snap = await db.collection('reservas').doc(targetCitaId).get();
        if (snap.exists) {
          resDoc = snap;
        }
      }

      if (!resDoc && telefonoCliente) {
        const rawDigits = telefonoCliente.replace(/\D/g, '');
        const last10 = rawDigits.slice(-10);
        const snap = await db.collection('reservas').get();
        const activeDocs = snap.docs.filter((d) => {
          const data = d.data();
          const phone = (data.cliente_telefono || '').replace(/\D/g, '');
          const isSamePhone = phone.includes(last10) || last10.includes(phone);
          const st = (data.estado || '').toLowerCase();
          const isActive = !st.includes('cancelad') && !st.includes('completad');
          return isSamePhone && isActive;
        });

        if (activeDocs.length > 0) {
          activeDocs.sort((a, b) => {
            const dateA = `${a.data().fecha || ''} ${a.data().hora_inicio || ''}`;
            const dateB = `${b.data().fecha || ''} ${b.data().hora_inicio || ''}`;
            return dateB.localeCompare(dateA);
          });
          resDoc = activeDocs[0];
          targetCitaId = resDoc.id;
        }
      }

      if (!resDoc) {
        return {
          exito: false,
          mensaje: 'No se encontró ninguna cita activa para agregar el producto. ¿Deseas que agendemos una cita nueva?',
        };
      }

      const resData = resDoc.data();
      const resolvedProducts = await resolveProducts(db, productosNombres, productoNombre);

      if (resolvedProducts.length === 0) {
        return {
          exito: false,
          mensaje: `No encontramos el producto "${productoNombre}" en el catálogo activo.`,
        };
      }

      const currentItems = Array.isArray(resData.items) ? [...resData.items] : [];
      let addedTotal = 0;
      const addedNames: string[] = [];

      for (const prod of resolvedProducts) {
        const qty = cantidad > 1 ? cantidad : (prod.cantidad || 1);
        const itemTotal = prod.precio * qty;
        addedTotal += itemTotal;
        addedNames.push(`${prod.nombre} (x${qty})`);

        currentItems.push({
          id: prod.id,
          nombre: prod.nombre,
          precio: prod.precio,
          cantidad: qty,
          tipo: 'producto',
          barbero_id: resData.barbero_id || '',
        });
      }

      const prevTotal = Number(resData.total || 0);
      const newTotal = prevTotal + addedTotal;

      let requiereAnticipo = false;
      let montoAnticipo = Number(resData.anticipo_esperado || 0);
      let saldoPendiente = Math.max(0, newTotal - montoAnticipo);
      let linkPago = resData.link_pago_anticipo || '';

      const yaPagado = resData.pago_estado === 'approved' || resData.pago_estado === 'accredited' || resData.anticipo_pagado === true;

      if (!yaPagado) {
        if (newTotal >= 190) {
          requiereAnticipo = true;
          montoAnticipo = Math.round((newTotal * 0.5) * 100) / 100;
          saldoPendiente = Math.round((newTotal - montoAnticipo) * 100) / 100;

          const time12h = formatTime12h(resData.hora_inicio || '');
          const pref = await crearPreferenciaMercadoPagoChat({
            reservationId: targetCitaId!,
            title: `Cita + Productos: ${addedNames.join(', ')} (${resData.fecha} ${time12h})`,
            amount: montoAnticipo,
            clientName: resData.cliente_nombre || '',
            clientPhone: resData.cliente_telefono || '',
          });

          if (pref?.initPoint) {
            linkPago = pref.initPoint;
          }
        }
      } else {
        saldoPendiente = Math.max(0, newTotal - montoAnticipo);
      }

      const updateData: any = {
        items: currentItems,
        total: newTotal,
        saldo_pendiente: saldoPendiente,
      };

      if (requiereAnticipo) {
        updateData.requiere_pago_anticipado = true;
        updateData.anticipo_esperado = montoAnticipo;
        if (!yaPagado) {
          updateData.estado = 'Pendiente de pago';
          updateData.pago_estado = 'pending_payment';
        }
        if (linkPago) {
          updateData.link_pago_anticipo = linkPago;
        }
      }

      await db.collection('reservas').doc(targetCitaId!).update(updateData);

      const time12h = formatTime12h(resData.hora_inicio || '');
      return {
        exito: true,
        citaId: targetCitaId,
        montoTotalAnterior: prevTotal,
        montoTotalNuevo: newTotal,
        productosAgregados: addedNames,
        requiereAnticipo,
        montoAnticipo: requiereAnticipo ? montoAnticipo : 0,
        saldoPendiente,
        linkPago,
        mensaje: `¡Producto agregado con éxito a tu cita! Se agregaron: ${addedNames.join(', ')}.`,
        detalles: `Se agregaron ${addedNames.join(', ')} a tu cita del ${resData.fecha} a las ${time12h}. Total actualizado: $${newTotal} MXN.${requiereAnticipo ? ` Al superar $190 MXN se requiere un anticipo de $${montoAnticipo} MXN.\n\nEnlace de pago seguro de Mercado Pago:\n${linkPago}\n\nPídele al cliente en su propia línea que realice su anticipo y comparta su comprobante por este chat. IMPORTANTE: Escribe tu respuesta en texto completamente limpio, SIN asteriscos y SIN paréntesis alrededor de los precios o fechas.` : ` Saldo pendiente a liquidar en sucursal: $${saldoPendiente} MXN.`}`,
      };
    } catch (e: any) {
      console.error('Error in agregar_producto_a_cita:', e);
      return {
        exito: false,
        mensaje: e.message || 'No se pudo agregar el producto a la cita.',
      };
    }
  }
);

const consultarCitasClienteTool = ai.defineTool(
  {
    name: 'consultar_citas_cliente',
    description: 'Consulta las citas futuras o programadas que tiene el cliente buscando por su numero de telefono.',
    inputSchema: z.object({
      telefono: z.string().describe('Numero de telefono del cliente'),
    }),
    outputSchema: z.array(
      z.object({
        id: z.string(),
        fecha: z.string(),
        hora: z.string(),
        servicio: z.string(),
        barbero: z.string(),
        estado: z.string(),
      })
    ),
  },
  async ({ telefono }) => {
    try {
      const db = getDb();
      const cleanPhone = telefono.replace(/\D/g, '').slice(-10);
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      // 1. Obtener posibles IDs de cliente asociados al teléfono
      const clientDocs = await db.collection('clientes').where('telefono', '==', telefono).get();
      const clientIds = new Set<string>(clientDocs.docs.map((d) => d.id));

      if (cleanPhone) {
        const altDocs = await db.collection('clientes').where('telefono', '==', cleanPhone).get();
        altDocs.docs.forEach((d) => clientIds.add(d.id));
      }

      // 2. Traer reservas futuras
      const snap = await db
        .collection('reservas')
        .where('fecha', '>=', todayStr)
        .get();

      // Mapear nombres de barberos
      const profsSnap = await db.collection('profesionales').get();
      const barberMap = new Map<string, string>();
      profsSnap.docs.forEach((d) => {
        barberMap.set(d.id, d.data().publicName || d.data().name || 'Barbero');
      });

      const filtered = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .filter((r) => {
          const isOurClient = clientIds.has(r.cliente_id);
          const rPhone = (r.customer?.telefono || r.customerPhone || '').replace(/\D/g, '');
          const matchesPhone = cleanPhone && (rPhone.includes(cleanPhone) || r.cliente_telefono === telefono);
          return (isOurClient || matchesPhone) && r.estado !== 'cancelada' && r.estado !== 'Cancelado';
        })
        .map((r) => ({
          id: r.id,
          fecha: r.fecha,
          hora: r.hora_inicio,
          servicio: r.servicio || 'Corte de cabello',
          barbero: barberMap.get(r.barbero_id || r.profesionalId) || r.barbero_nombre || 'Barbero asignado',
          estado: r.estado || 'confirmada',
        }));

      return filtered;
    } catch (e: any) {
      console.error('Error in consultar_citas_cliente:', e);
      return [];
    }
  }
);

const cancelarCitaTool = ai.defineTool(
  {
    name: 'cancelar_cita',
    description: 'Cancela una cita del cliente por su ID o cancela su próxima cita activa si no se tiene el ID.',
    inputSchema: z.object({
      citaId: z.string().optional().describe('ID de la reserva'),
      telefono: z.string().optional().describe('Teléfono del cliente para localizar la cita si no se tiene el ID'),
      motivo: z.string().optional().describe('Motivo de la cancelacion'),
    }),
    outputSchema: z.object({
      exito: z.boolean(),
      mensaje: z.string(),
    }),
  },
  async ({ citaId, telefono, motivo }) => {
    try {
      const db = getDb();
      let targetId = citaId;

      if (!targetId && telefono) {
        const cleanPhone = telefono.replace(/\D/g, '').slice(-10);
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const snap = await db.collection('reservas').where('fecha', '>=', todayStr).get();
        const clientDocs = await db.collection('clientes').where('telefono', '==', telefono).get();
        const clientIds = new Set<string>(clientDocs.docs.map((d) => d.id));
        if (cleanPhone) {
          const altDocs = await db.collection('clientes').where('telefono', '==', cleanPhone).get();
          altDocs.docs.forEach((d) => clientIds.add(d.id));
        }

        const match = snap.docs.find((d) => {
          const r = d.data();
          const isOurClient = clientIds.has(r.cliente_id);
          const rPhone = (r.customer?.telefono || r.customerPhone || '').replace(/\D/g, '');
          return (isOurClient || (cleanPhone && rPhone.includes(cleanPhone))) && r.estado !== 'cancelada' && r.estado !== 'Cancelado';
        });

        if (match) targetId = match.id;
      }

      if (!targetId) {
        return { exito: false, mensaje: 'No se encontró ninguna cita activa para cancelar.' };
      }

      const ref = db.collection('reservas').doc(targetId);
      const doc = await ref.get();
      if (!doc.exists) {
        return { exito: false, mensaje: 'La cita no existe o ya fue cancelada.' };
      }

      await ref.update({
        estado: 'Cancelado',
        cancelada_por_cliente: true,
        etiqueta_recordatorio: 'cancelada',
        motivo_cancelacion: motivo || 'Cancelada por cliente via Asistente Virtual Sofía',
        cancelada_en: new Date(),
        updated_at: new Date(),
      });

      return { exito: true, mensaje: 'Tu cita ha sido cancelada correctamente en la agenda.' };
    } catch (e: any) {
      console.error('Error in cancelar_cita:', e);
      return { exito: false, mensaje: e.message || 'Error al cancelar la cita.' };
    }
  }
);

const confirmarCitaClienteTool = ai.defineTool(
  {
    name: 'confirmar_cita_cliente',
    description:
      'Confirma la cita próxima o activa del cliente en la agenda de la barbería. Utilízala cuando el cliente responda con "Confirmar", "Confirmo", "1", "Sí asisto", "Ahí estaré" o cualquier confirmación similar ante un recordatorio de cita.',
    inputSchema: z.object({
      telefono: z.string().describe('Número de teléfono del cliente'),
      citaId: z.string().optional().describe('ID opcional de la reserva si se conoce'),
    }),
    outputSchema: z.object({
      exito: z.boolean(),
      citaId: z.string().optional(),
      fecha: z.string().optional(),
      hora: z.string().optional(),
      barbero: z.string().optional(),
      servicio: z.string().optional(),
      mensaje: z.string(),
    }),
  },
  async ({ telefono, citaId }) => {
    try {
      const db = getDb();
      let targetId = citaId;
      let targetData: any = null;

      const cleanPhone = (telefono || '').replace(/\D/g, '').slice(-10);
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      if (!targetId) {
        const clientDocs = await db.collection('clientes').where('telefono', '==', telefono).get();
        const clientIds = new Set<string>(clientDocs.docs.map((d) => d.id));
        if (cleanPhone) {
          const altDocs = await db.collection('clientes').where('telefono', '==', cleanPhone).get();
          altDocs.docs.forEach((d) => clientIds.add(d.id));
        }

        const snap = await db.collection('reservas').where('fecha', '>=', todayStr).get();
        const activeRes = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as any))
          .filter((r) => {
            const isOurClient = clientIds.has(r.cliente_id);
            const rPhone = (r.customer?.telefono || r.customerPhone || '').replace(/\D/g, '');
            const matchesPhone = cleanPhone && (rPhone.includes(cleanPhone) || r.cliente_telefono === telefono);
            return (isOurClient || matchesPhone) && r.estado !== 'cancelada' && r.estado !== 'Cancelado';
          })
          .sort((a, b) => {
            const dateA = a.fecha ? new Date(`${a.fecha}T${a.hora_inicio || '00:00'}:00`).getTime() : 0;
            const dateB = b.fecha ? new Date(`${b.fecha}T${b.hora_inicio || '00:00'}:00`).getTime() : 0;
            return dateA - dateB;
          });

        if (activeRes.length > 0) {
          targetId = activeRes[0].id;
          targetData = activeRes[0];
        }
      } else {
        const doc = await db.collection('reservas').doc(targetId).get();
        if (doc.exists) {
          targetData = { id: doc.id, ...doc.data() };
        }
      }

      if (!targetId || !targetData) {
        return {
          exito: false,
          mensaje: 'No se encontró ninguna cita activa o próxima para confirmar.',
        };
      }

      const now = new Date();
      await db.collection('reservas').doc(targetId).update({
        estado: 'confirmada',
        confirmada_por_cliente: true,
        confirmada_en: now,
        etiqueta_recordatorio: 'confirmada',
        whatsappConfirmationSent: true,
        updated_at: now,
        notas: (targetData.notas ? targetData.notas + ' | ' : '') + 'Confirmada por cliente vía WhatsApp',
      });

      let barberName = targetData.professionalNames || targetData.barbero_nombre || '';
      if (!barberName && targetData.barbero_id) {
        try {
          const bDoc = await db.collection('profesionales').doc(targetData.barbero_id).get();
          if (bDoc.exists) {
            barberName = bDoc.data()?.publicName || bDoc.data()?.name || '';
          }
        } catch (e) {}
      }

      const formattedTime = formatTime12h(targetData.hora_inicio);

      return {
        exito: true,
        citaId: targetId,
        fecha: targetData.fecha,
        hora: formattedTime,
        barbero: barberName || 'tu barbero',
        servicio: targetData.servicio || 'tu servicio',
        mensaje: `¡Excelente! Tu cita para el ${targetData.fecha} a las ${formattedTime} con ${barberName || 'tu barbero'} para ${targetData.servicio || 'tu servicio'} ha quedado 100% confirmada. ¡Te esperamos en VATOS ALFA!`,
      };
    } catch (e: any) {
      console.error('Error in confirmar_cita_cliente:', e);
      return { exito: false, mensaje: e.message || 'Error al confirmar la cita.' };
    }
  }
);

const consultarProductosTool = ai.defineTool(
  {
    name: 'consultar_productos',
    description:
      'Consulta el catálogo de productos físicos a la venta en VATOS ALFA Barber Shop (ceras, pomadas, aftershave, shampoo, aceites para barba, minoxidil, etc.) con sus precios, descripciones y existencias (stock).',
    inputSchema: z.object({
      termino: z
        .string()
        .optional()
        .describe('Término de búsqueda o nombre del producto (ej: cera, pomada, minoxidil, aftershave, shampoo, barba). Déjalo vacío para ver los productos principales.'),
    }),
    outputSchema: z.object({
      totalEncontrados: z.number(),
      productos: z.array(
        z.object({
          id: z.string(),
          nombre: z.string(),
          precio: z.number(),
          stock: z.number(),
          disponible: z.boolean(),
          descripcion: z.string(),
        })
      ),
      resumenTexto: z.string(),
    }),
  },
  async ({ termino }) => {
    try {
      const db = getDb();
      const snap = await db.collection('productos').where('active', '==', true).get();
      let allProducts = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          nombre: data.nombre || '',
          precio: Number(data.public_price || data.precio_venta || data.precio || 0),
          stock: Number(data.stock || 0),
          disponible: Number(data.stock || 0) > 0,
          descripcion: data.description || data.descripcion || '',
        };
      });

      if (termino && termino.trim()) {
        const qClean = cleanSearchStr(termino);
        const filtered = allProducts.filter((p) => {
          const nClean = cleanSearchStr(p.nombre);
          const dClean = cleanSearchStr(p.descripcion);
          return nClean.includes(qClean) || dClean.includes(qClean);
        });
        if (filtered.length > 0) {
          allProducts = filtered;
        }
      }

      const topProducts = allProducts.slice(0, 6);
      const resumenTexto = topProducts
        .map((p) => `• ${p.nombre}: $${p.precio} MXN (${p.disponible ? `disponible, quedan ${p.stock} piezas` : 'agotado temporalmente'}) - ${p.descripcion.slice(0, 90)}...`)
        .join('\n');

      return {
        totalEncontrados: topProducts.length,
        productos: topProducts,
        resumenTexto: resumenTexto || 'No se encontraron productos en el catálogo con ese término.',
      };
    } catch (e: any) {
      console.error('Error in consultar_productos:', e);
      return {
        totalEncontrados: 0,
        productos: [],
        resumenTexto: 'No se pudo consultar el catálogo de productos en este momento.',
      };
    }
  }
);

const anotarListaEsperaTool = ai.defineTool(
  {
    name: 'anotar_en_lista_espera',
    description:
      'Anota a un cliente en la lista de espera oficial de la barbería cuando un día u horario solicitado esté completamente lleno o saturado, para avisarle si se libera un espacio por cancelación.',
    inputSchema: z.object({
      nombreCliente: z.string().describe('Nombre del cliente'),
      telefonoCliente: z.string().describe('Teléfono del cliente'),
      fecha: z.string().describe('Fecha deseada en formato AAAA-MM-DD'),
      horarioPreferido: z.string().describe('Momento o rango preferido (ej: "por la tarde", "alrededor de las 5:00 PM", "cualquier hora")'),
      barberoNombre: z.string().optional().describe('Barbero de preferencia si solicitó uno específico'),
      servicioNombre: z.string().optional().describe('Servicio o servicios que desea'),
      notas: z.string().optional().describe('Detalles o peticiones adicionales'),
    }),
    outputSchema: z.object({
      exito: z.boolean(),
      mensaje: z.string(),
      idRegistro: z.string().optional(),
    }),
  },
  async ({ nombreCliente, telefonoCliente, fecha, horarioPreferido, barberoNombre, servicioNombre, notas }) => {
    try {
      const db = getDb();
      const docRef = await db.collection('lista_espera').add({
        nombre: nombreCliente,
        telefono: telefonoCliente,
        fecha,
        horario_preferido: horarioPreferido,
        barbero_preferido: barberoNombre || 'Cualquiera',
        servicio: servicioNombre || 'Corte de cabello',
        notas: notas || '',
        estado: 'pendiente',
        creado_en: new Date(),
        origen: 'asistente_sofia',
      });

      return {
        exito: true,
        idRegistro: docRef.id,
        mensaje: `Te he anotado en nuestra lista de espera para el ${fecha} (${horarioPreferido})${barberoNombre ? ` con ${barberoNombre}` : ''}. Si algún cliente cancela o se abre un lugar, te avisaremos de inmediato por este mismo chat.`,
      };
    } catch (e: any) {
      console.error('Error in anotar_en_lista_espera:', e);
      return { exito: false, mensaje: e.message || 'No se pudo anotar en la lista de espera.' };
    }
  }
);

const reagendarCitaTool = ai.defineTool(
  {
    name: 'reagendar_cita',
    description: 'Reagenda o cambia la fecha y hora de una cita existente de un cliente.',
    inputSchema: z.object({
      citaId: z.string().describe('ID de la reserva existente a reagendar'),
      nuevaFecha: z.string().describe('Nueva fecha en formato AAAA-MM-DD'),
      nuevaHora: z.string().describe('Nueva hora en formato HH:mm (ejemplo 16:30)'),
      profesionalId: z.string().optional().describe('ID opcional del barbero si desea cambiar de profesional'),
    }),
    outputSchema: z.object({
      exito: z.boolean(),
      mensaje: z.string(),
    }),
  },
  async ({ citaId, nuevaFecha, nuevaHora, profesionalId }) => {
    try {
      const db = getDb();
      const ref = db.collection('reservas').doc(citaId);
      const snap = await ref.get();
      if (!snap.exists) {
        return { exito: false, mensaje: 'No se encontró la cita a reagendar.' };
      }
      const data = snap.data()!;
      const finalProf = profesionalId || data.profesionalId || data.barbero_id;

      await ref.update({
        fecha: nuevaFecha,
        hora_inicio: nuevaHora,
        profesionalId: finalProf,
        etiqueta_recordatorio: 'reagendada',
        updated_at: new Date(),
        notas: (data.notas || '') + ` | Reagendada a ${nuevaFecha} ${nuevaHora} por Asistente Virtual Sofía`,
      });

      return {
        exito: true,
        mensaje: `¡Cita reagendada con éxito para el ${nuevaFecha} a las ${nuevaHora}!`,
      };
    } catch (e: any) {
      console.error('Error in reagendar_cita:', e);
      return { exito: false, mensaje: e.message || 'Error al reagendar la cita.' };
    }
  }
);

const consultarUbicacionTool = ai.defineTool(
  {
    name: 'consultar_ubicacion',
    description: 'Obtiene la dirección física exacta, referencias para llegar, teléfono y horarios de apertura de la barbería VATOS ALFA.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      nombre: z.string(),
      direccion: z.string(),
      ciudad: z.string(),
      referencias: z.string(),
      telefono: z.string(),
      horarios: z.string(),
      mapsGoogle: z.string(),
    }),
  },
  async () => {
    try {
      const db = getDb();
      const snap = await db.collection('locales').limit(1).get();
      if (!snap.empty) {
        const data = snap.docs[0].data();
        return {
          nombre: data.name || 'VATOS ALFA Barber Shop',
          direccion: data.address || 'Av. Cerro Sombrerete 1001, Col. Cipreses',
          ciudad: 'Santiago de Querétaro, Qro., México',
          referencias: 'Sobre Av. Cerro Sombrerete, Col. Cipreses. Contamos con cajones de estacionamiento al frente.',
          telefono: data.phone || '4428727279',
          horarios: 'Lunes a Sábado de 10:00 AM a 9:00 PM, Domingos de 10:00 AM a 8:00 PM',
          mapsGoogle: 'https://maps.google.com/?q=Av+Cerro+Sombrerete+1001+Cipreses+Queretaro',
        };
      }
    } catch (e) {
      // fallback
    }

    return {
      nombre: 'VATOS ALFA Barber Shop',
      direccion: 'Av. Cerro Sombrerete 1001, Col. Cipreses',
      ciudad: 'Santiago de Querétaro, Qro., México',
      referencias: 'Sobre Av. Cerro Sombrerete (zona Cipreses). Contamos con estacionamiento al frente.',
      telefono: '4428727279',
      horarios: 'Lunes a Sábado de 10:00 AM a 9:00 PM, Domingos de 10:00 AM a 8:00 PM',
      mapsGoogle: 'https://maps.google.com/?q=Av+Cerro+Sombrerete+1001+Cipreses+Queretaro',
    };
  }
);

const solicitarRecepcionTool = ai.defineTool(
  {
    name: 'solicitar_recepcion',
    description: 'ÚNICAMENTE se usa cuando el cliente pide explícitamente hablar con una persona humana o recepcionista presencial (ej: "pásame a un humano", "quiero hablar con una persona", "comunícame con el encargado"). NUNCA la uses para preguntas de ubicación, dirección, cómo llegar, precios, servicios, horarios o citas.',
    inputSchema: z.object({
      conversationId: z.string().describe('ID de la conversacion'),
      motivo: z.string().describe('Motivo o duda por la cual requiere atencion humana'),
    }),
    outputSchema: z.object({
      exito: z.boolean(),
      mensaje: z.string(),
    }),
  },
  async ({ conversationId, motivo }) => {
    try {
      const db = getDb();
      await db.collection('conversaciones').doc(conversationId).set(
        {
          modo_atencion: 'requiere_atencion',
          motivo_atencion_humana: motivo,
          updated_at: new Date(),
        },
        { merge: true }
      );

      return {
        exito: true,
        mensaje: 'He avisado a nuestro equipo de recepción. En breve un recepcionista continuará la conversación contigo.',
      };
    } catch (e: any) {
      console.error('Error in solicitar_recepcion:', e);
      return { exito: false, mensaje: e.message };
    }
  }
);

const consultarPoliticasYTerminosTool = ai.defineTool(
  {
    name: 'consultar_terminos_y_privacidad',
    description:
      'Consulta los Términos y Condiciones oficiales de servicio, políticas de puntualidad, anticipos, cancelaciones y reembolsos, y el Aviso de Privacidad integral de VATOS ALFA Barber Shop. Devuelve los resúmenes y los enlaces web oficiales para compartir con el cliente.',
    inputSchema: z.object({
      tema: z
        .enum(['terminos', 'privacidad', 'cancelaciones_y_anticipos', 'ambos'])
        .optional()
        .describe('Tema a consultar: "terminos" para reglas de citas y servicio, "privacidad" para manejo y protección de datos personales, "cancelaciones_y_anticipos" para reglas de anticipo/reembolso, o "ambos".'),
    }),
    outputSchema: z.object({
      urlTerminos: z.string(),
      urlPrivacidad: z.string(),
      resumenTerminos: z.string(),
      resumenPrivacidad: z.string(),
      politicaCancelacionYAnticipos: z.string(),
      textoDetallado: z.string().optional(),
    }),
  },
  async ({ tema = 'ambos' }) => {
    try {
      const db = getDb();
      let customTerms = '';
      let customPrivacy = '';

      try {
        const settingsDoc = await db.collection('settings').doc('website').get();
        if (settingsDoc.exists) {
          const data = settingsDoc.data()!;
          if (data.termsText) customTerms = data.termsText.trim();
          if (data.privacyText) customPrivacy = data.privacyText.trim();
        }
      } catch (err) {
        console.error('Error reading website settings for terms/privacy:', err);
      }

      const urlTerminos = 'https://vatosalfa.com/terminos';
      const urlPrivacidad = 'https://vatosalfa.com/privacidad';

      const resumenTerminos =
        '1. Tolerancia máxima de 10 minutos para iniciar la cita. Tras 10 min sin presencia ni aviso previo, se marca como "No Show" y se libera el espacio.\n' +
        '2. Anticipos de garantía: Aplican para citas iguales o mayores a $190 MXN (o servicios específicos). Se abonan en línea por Mercado Pago o transferencia y se descuentan del total en recepción.\n' +
        '3. Cancelaciones y Reagendaciones: Si se notifica con al menos 2 horas de anticipación, el 100% del anticipo se guarda como saldo a favor válido por 30 días. Cancelaciones con menos de 2 horas o No-Show causan la pérdida del anticipo.\n' +
        '4. Si la barbería debe cancelar por causas de fuerza mayor, el cliente recibe reagendación prioritaria o el reembolso del 100% de su anticipo.\n' +
        '5. Derecho de admisión y respeto mutuo en el establecimiento.';

      const politicaCancelacionYAnticipos =
        '• Con aviso de 2 horas o más: Tu anticipo queda 100% respaldado como saldo a favor en tu cuenta para reagendar en los siguientes 30 días.\n' +
        '• Con menos de 2 horas o inasistencia (No Show tras 10 min de tolerancia): Se pierde el anticipo por concepto de apartado y tiempo reservado del barbero.\n' +
        '• Por causas imputables a la barbería: Reagendación prioritaria inmediata o devolución del 100% del anticipo pagado.';

      const resumenPrivacidad =
        '• Responsable: VATOS ALFA Barber Shop (Santiago de Querétaro, Qro.).\n' +
        '• Datos recabados: Nombre, número de WhatsApp/teléfono y correo electrónico.\n' +
        '• Finalidad: Exclusivamente para agendar citas, identificación del cliente y envío de recordatorios o confirmaciones por WhatsApp.\n' +
        '• Confidencialidad: NO se venden ni comparten datos con terceros para publicidad. Solo se utilizan proveedores tecnológicos indispensables para operar (Google Cloud/Firebase).\n' +
        '• Derechos ARCO: El cliente puede solicitar acceso, rectificación, cancelación u oposición de sus datos escribiendo a contacto@vatosalfa.com.';

      let textoDetallado = '';
      if (customTerms && (tema === 'terminos' || tema === 'ambos' || tema === 'cancelaciones_y_anticipos')) {
        textoDetallado += `Términos registrados:\n${customTerms.substring(0, 1200)}...\n\n`;
      }
      if (customPrivacy && (tema === 'privacidad' || tema === 'ambos')) {
        textoDetallado += `Privacidad registrada:\n${customPrivacy.substring(0, 800)}...`;
      }

      return {
        urlTerminos,
        urlPrivacidad,
        resumenTerminos,
        resumenPrivacidad,
        politicaCancelacionYAnticipos,
        textoDetallado: textoDetallado || undefined,
      };
    } catch (e: any) {
      console.error('Error in consultar_terminos_y_privacidad:', e);
      return {
        urlTerminos: 'https://vatosalfa.com/terminos',
        urlPrivacidad: 'https://vatosalfa.com/privacidad',
        resumenTerminos: 'Tolerancia de 10 minutos, cancelaciones con 2 horas de anticipación conservan saldo por 30 días.',
        resumenPrivacidad: 'Datos usados exclusivamente para citas y recordatorios, no se comparten con terceros.',
        politicaCancelacionYAnticipos: 'Avisando con 2h se conserva el saldo a favor; menos de 2h o inasistencia se pierde el anticipo.',
      };
    }
  }
);

// ==========================================
// 2. MOTOR CONVERSACIONAL HUMANO (RECEPCIONISTA FALLBACK)
// ==========================================

async function executeFallbackLogic({
  conversationId,
  clientPhone,
  clientName,
  userMessage,
  clientNotes,
}: {
  conversationId: string;
  clientPhone: string;
  clientName?: string;
  userMessage: string;
  clientNotes?: string;
}): Promise<string> {
  const db = getDb();
  const text = userMessage.toLowerCase().trim();

  // 1. Obtener notas del cliente para duraciones personalizadas si no vienen provistas
  let effectiveNotes = clientNotes || '';
  if (!effectiveNotes) {
    try {
      const cleanP = (clientPhone || '').replace(/\D/g, '').slice(-10);
      if (cleanP) {
        const cSnap = await db.collection('clientes').where('telefono', '==', cleanP).limit(1).get();
        if (!cSnap.empty) {
          effectiveNotes = cSnap.docs[0].data().notas || cSnap.docs[0].data().nota || '';
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // 2. Obtener historial reciente para entender el contexto
  let recentChat = '';
  try {
    const prevSnap = await db
      .collection('conversaciones')
      .doc(conversationId)
      .collection('mensajes')
      .orderBy('timestamp', 'desc')
      .limit(6)
      .get();
    recentChat = prevSnap.docs
      .map((d) => d.data().texto || '')
      .join(' ')
      .toLowerCase();
  } catch (e) {
    // ignore
  }

  const combinedText = `${recentChat} ${text}`;

  // 2. Cargar servicios y barberos activos
  let activeServices: Array<{ id: string; name: string; price: number; duration: number; durationPorProfesional?: Record<string, number>; professionals?: string[] }> = [];
  let activeBarbers: Array<{ id: string; name: string; publicName: string }> = [];

  try {
    const servsSnap = await db.collection('servicios').where('active', '==', true).get();
    activeServices = servsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name || data.nombre || 'Corte de Cabello',
        price: Number(data.price || data.precio || 0),
        duration: Number(data.duration || data.duracion || 30),
        durationPorProfesional: data.durationPorProfesional,
        professionals: data.professionals,
      };
    });

    const profsSnap = await db.collection('profesionales').where('active', '==', true).get();
    activeBarbers = profsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name || '',
        publicName: data.publicName || data.name || 'Barbero',
      };
    });
  } catch (e) {
    console.error('Error fetching services/barbers in fallback:', e);
  }

  // 3. Detectores de intención y entidades
  const isHaircut = /(corte|cabello|pelo|fade|degradado|desvanecido)/i.test(text);
  const isBeard = /(barba|bigote|afeitad|rasurad|toalla caliente)/i.test(text);
  const isAskingMultiServices = /(varios servicios|dos servicios|m[aá]s de un servicio|al mismo tiempo|juntos|combo|junto|corte.*y.*barba|corte.*\+.*barba|servicios al mismo tiempo)/i.test(text);
  const isAskingTermsOrPrivacy = /(t[eé]rminos|condiciones|pol[ií]ticas? de privacidad|aviso de privacidad|privacidad|datos personales|c[oó]mo usan mis datos|pol[ií]tica de cancelaci[oó]n|reembolso|reembolsos)/i.test(text);
  const isAskingHours = /(horario|horas|hora|disponible|disponibilidad|espacio|lugar|tienes|tienen|a que hora|a qué hora|puedo ir)/i.test(text);
  const isAskingPrices = /(precio|costo|cuanto cuesta|cuánto cuesta|cuanto cobran|cuánto cobran|tarifa|promoci)/i.test(text);
  const isAskingBarbers = /(quien atiende|quién atiende|quienes atienden|quiénes atienden|quien corta|quién corta|barberos|el equipo)/i.test(text);
  const isAskingMyCitas = /(mis citas|cuando es mi cita|cuándo es mi cita|a que hora es mi cita|mi reserva|revisar cita)/i.test(text);
  const isCancelling = /(cancelar|cancela|ya no voy a poder|ya no puedo ir|anular)/i.test(text);
  const isAskingLocation = /(d[oó]nde est[aá]n|d[oó]nde se ubican|ubicaci[oó]n|direcci[oó]n|direcc|c[oó]mo llego|en qu[eé] parte|referencias|mapa|localizaci[oó]n|pero la direccion|pero la dirección)/i.test(text);
  const isAskingHuman = /(hablar con un humano|hablar con una persona|p[aá]same a un humano|p[aá]same a una persona|comun[ií]came con|hablar con alguien de recepci[oó]n|hablar con el encargado|queja)/i.test(text);

  // Detector de barbero mencionado (con apodos Beatriz/Bety, Eduardo/Lalo, etc.)
  let matchedBarber = activeBarbers.find((b) => matchBarberName(text, b));

  // Detector de servicio mencionado
  let matchedService = activeServices.find((s) => {
    if (isBeard && /barba/i.test(s.name)) return true;
    if (isHaircut && /corte/i.test(s.name)) return true;
    return text.includes(s.name.toLowerCase());
  }) || activeServices[0];

  // Detector de fecha mencionada
  const today = new Date();
  let targetDate = format(today, 'yyyy-MM-dd');
  let dateLabel = 'hoy';

  if (/mañana/i.test(text)) {
    const tomorrow = new Date(Date.now() + 86400000);
    targetDate = format(tomorrow, 'yyyy-MM-dd');
    dateLabel = 'mañana';
  } else if (/pasado mañana/i.test(text)) {
    const dayAfter = new Date(Date.now() + 86400000 * 2);
    targetDate = format(dayAfter, 'yyyy-MM-dd');
    dateLabel = 'pasado mañana';
  }

  // Detector de hora mencionada (ej: 5:00, 5pm, a las 4, 16:30, etc.)
  const timeRegex = /(?:a las\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
  const timeMatch = text.match(timeRegex);
  let requestedTime: string | null = null;

  if (timeMatch && (text.includes('las') || text.includes('pm') || text.includes('am') || text.includes(':') || /^\d{1,2}/.test(text))) {
    let rawH = parseInt(timeMatch[1], 10);
    const rawM = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const modifier = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

    if (modifier === 'pm' && rawH < 12) rawH += 12;
    if (modifier === 'am' && rawH === 12) rawH = 0;
    // Si dice "a las 4" o "a las 5" sin am/pm y la barbería opera en la tarde
    if (!modifier && rawH >= 1 && rawH <= 8) rawH += 12;

    if (rawH >= 9 && rawH <= 21) {
      requestedTime = `${rawH.toString().padStart(2, '0')}:${rawM.toString().padStart(2, '0')}`;
    }
  }

  // ==========================================
  // RESPUESTAS HUMANAS CONTEXTUALES
  // ==========================================

  // CASO 0: Pregunta por ubicación / dirección / cómo llegar
  if (isAskingLocation) {
    return '¡Con gusto! Estamos ubicados en *Av. Cerro Sombrerete 1001, Col. Cipreses, Querétaro, Qro.* (sobre Av. Cerro Sombrerete). Abrimos de lunes a sábado de 10:00 AM a 9:00 PM y domingos de 10:00 AM a 8:00 PM. Contamos con estacionamiento al frente. ¿Te gustaría agendar una cita para visitarnos? 💈';
  }

  // CASO 0.5: Pregunta sobre agendar varios servicios al mismo tiempo (ej: corte + barba express)
  if (isAskingMultiServices && (/pued|sabe|como|ejemplo|\?|se puede|es posible/i.test(text) || !requestedTime)) {
    return '¡Sí, totalmente! Puedo agendarte varios servicios en la misma cita (por ejemplo: corte de cabello + barba express, o corte con ceja o facial). Al agendarlos juntos, reservamos el bloque continuo de tiempo necesario con tu barbero (por ejemplo, 65 minutos para corte y barba express) por un total de $240 MXN. Como la suma supera $190 MXN, el sistema genera automáticamente un enlace de Mercado Pago para apartar tu espacio con el 50% de anticipo ($120 MXN) y el resto se liquida en recepción. ¿Te gustaría que te revise disponibilidad para corte y barba?';
  }

  // CASO 0.8: Preguntas sobre Términos y Condiciones o Aviso de Privacidad
  if (isAskingTermsOrPrivacy) {
    if (text.includes('privacidad') || text.includes('datos') || text.includes('correo') || text.includes('informaci')) {
      return '¡Sí, con mucho gusto! En VATOS ALFA cuidamos con estricta confidencialidad tus datos personales. Tu nombre y WhatsApp se utilizan únicamente para la gestión de tus citas y recordatorios, y jamás se comparten ni venden a terceros. Puedes consultar el Aviso de Privacidad completo en: *https://vatosalfa.com/privacidad*. ¿Hay algo en lo que te pueda apoyar hoy?';
    }
    return '¡Sí, por supuesto! Tengo acceso completo a los Términos y Condiciones de VATOS ALFA. En resumen: contamos con tolerancia estricta de 10 minutos; las cancelaciones o cambios con al menos 2 horas de anticipación conservan el 100% de tu anticipo como saldo a favor por 30 días (con menos de 2 horas o inasistencia se pierde por el tiempo apartado del barbero). Puedes consultar los términos completos en *https://vatosalfa.com/terminos* y nuestro aviso de privacidad en *https://vatosalfa.com/privacidad*. ¿Tienes alguna duda en específico?';
  }

  // CASO 0.9: Envío de comprobante de pago o confirmación de transferencia
  const isVoucher = /(comprobante|transferencia|ya transferi|ya transferí|ya deposite|ya deposité|ya pague|ya pagué|captura|ticket)/i.test(text);
  if (isVoucher) {
    return '¡Muchas gracias por compartir tu comprobante de anticipo! 📄 He registrado la información en tu reserva y nuestro equipo de recepción validará los fondos en la cuenta bancaria para dejar tu espacio 100% confirmado. ¡Nos vemos pronto en VATOS ALFA!';
  }

  // CASO 0.95: Agendar a nombre de otra persona
  const isBookingForOther = /(a nombre de|para mi amigo|para mi hermano|para mi primo|para mi hijo|para mi papa|para mi papá|para mi novio|para mi esposo|para otra persona)/i.test(text);
  if (isBookingForOther && !/\d{10}/.test(text)) {
    return '¡Con mucho gusto! Para poder registrarlo correctamente en el sistema y no confundirlo con otros clientes con el mismo nombre, ¿me apoyas con su nombre completo con apellidos y su número de WhatsApp? Así la cita queda vinculada a su propia cuenta y le llegarán sus confirmaciones a su teléfono.';
  }

  // CASO 1: Confirmar asistencia a cita (Recordatorio de cita)
  const isConfirming = /(confirmar|confirmo|si confirmo|sí confirmo|asisto|ahí estaré|ahi estare|^1$|^si$|^sí$)/i.test(text);
  if (isConfirming) {
    const cleanPhone = clientPhone.replace(/\D/g, '').slice(-10);
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const snap = await db.collection('reservas').where('fecha', '>=', todayStr).get();

    const nextCita = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .filter((r) => {
        const rPhone = (r.customer?.telefono || r.customerPhone || '').replace(/\D/g, '');
        return rPhone.includes(cleanPhone) && r.estado !== 'cancelada' && r.estado !== 'Cancelado';
      })
      .sort((a, b) => {
        const dateA = a.fecha ? new Date(`${a.fecha}T${a.hora_inicio || '00:00'}:00`).getTime() : 0;
        const dateB = b.fecha ? new Date(`${b.fecha}T${b.hora_inicio || '00:00'}:00`).getTime() : 0;
        return dateA - dateB;
      })[0];

    if (nextCita) {
      const now = new Date();
      await db.collection('reservas').doc(nextCita.id).update({
        estado: 'confirmada',
        confirmada_por_cliente: true,
        confirmada_en: now,
        etiqueta_recordatorio: 'confirmada',
        whatsappConfirmationSent: true,
        updated_at: now,
        notas: (nextCita.notas ? nextCita.notas + ' | ' : '') + 'Confirmada por cliente vía WhatsApp',
      });

      return `¡Excelente! Tu cita para el *${nextCita.fecha}* a las *${formatTime12h(nextCita.hora_inicio)}* con ${nextCita.professionalNames || nextCita.barbero_nombre || 'tu barbero'} para ${nextCita.servicio} ha quedado 100% confirmada. ¡Te esperamos en VATOS ALFA! 💈`;
    }
  }

  // CASO 1.5: Solicitar recepción humana
  if (isAskingHuman) {
    await db.collection('conversaciones').doc(conversationId).set(
      {
        modo_atencion: 'requiere_atencion',
        motivo_atencion_humana: userMessage,
        updated_at: new Date(),
      },
      { merge: true }
    );
    return 'Con mucho gusto. Le acabo de avisar al equipo de recepción para que un compañero tome la conversación y te atienda directamente en un momento por aquí.';
  }

  // CASO 2: Cancelar cita
  if (isCancelling) {
    const cleanPhone = clientPhone.replace(/\D/g, '').slice(-10);
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const snap = await db.collection('reservas').where('fecha', '>=', todayStr).get();

    const nextCita = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .find((r) => {
        const rPhone = (r.customer?.telefono || r.customerPhone || '').replace(/\D/g, '');
        return rPhone.includes(cleanPhone) && r.estado !== 'cancelada';
      });

    if (!nextCita) {
      return 'No encontré ninguna cita activa registrada con tu número de teléfono. Si requieres apoyo de recepción, avísame con confianza.';
    }

    await db.collection('reservas').doc(nextCita.id).update({
      estado: 'cancelada',
      motivo_cancelacion: 'Cancelada por cliente en conversación',
      cancelada_en: new Date(),
    });

    return `Listo, no te preocupes. Tu cita del ${nextCita.fecha} a las ${formatTime12h(nextCita.hora_inicio)} quedó cancelada. Cuando gustes volver a agendar estamos a tus órdenes.`;
  }

  // CASO 3: Consultar mis citas
  if (isAskingMyCitas) {
    const cleanPhone = clientPhone.replace(/\D/g, '').slice(-10);
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const snap = await db.collection('reservas').where('fecha', '>=', todayStr).get();

    const clientCitas = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .filter((r) => {
        const rPhone = (r.customer?.telefono || r.customerPhone || '').replace(/\D/g, '');
        return rPhone.includes(cleanPhone) && r.estado !== 'cancelada';
      });

    if (clientCitas.length === 0) {
      return 'Revisé en el sistema y no tienes citas próximas registradas con tu número. ¿Te gustaría que te agendemos un espacio para hoy o mañana?';
    }

    const nextOne = clientCitas[0];
    return `Tienes una cita programada para el *${nextOne.fecha}* a las *${formatTime12h(nextOne.hora_inicio)}* para ${nextOne.servicio} con ${nextOne.professionalNames || 'tu barbero'}. ¿Deseas hacer algún cambio o todo en orden?`;
  }

  // CASO 4: Confirmar una hora específica para agendar (ej: "a las 5:15 con Lalo")
  if (requestedTime) {
    const barberToUse = matchedBarber || activeBarbers[0];
    const serviceToUse = matchedService || activeServices[0];

    // Verificar si el horario está disponible con ese barbero
    if (barberToUse) {
      const customDur = effectiveNotes ? parseClientCustomDuration(effectiveNotes, barberToUse.publicName || barberToUse.name) : null;
      const barberDuration = customDur || getBarberServiceDuration([serviceToUse], barberToUse.id, 30);
      const slotsCheck = await getAvailableSlots({
        date: targetDate,
        professionalId: barberToUse.id,
        durationMinutes: barberDuration,
      });

      const slots = (slotsCheck as any).slots || [];
      const isAvailable = slots.includes(requestedTime);

      if (isAvailable) {
        // Si ya tenemos un nombre de cliente real (no el dummy de prueba)
        const isPlaceholderName = !clientName || /prueba|cliente/i.test(clientName);

        if (!isPlaceholderName && clientName.trim().length > 3) {
          // Crear la cita de una vez
          await createPublicReservation({
            client: {
              name: clientName,
              phone: clientPhone,
            },
            serviceIds: [serviceToUse.id],
            professionalId: barberToUse.id,
            date: targetDate,
            time: requestedTime,
            duration: customDur || undefined,
            customDuration: customDur || undefined,
            notes: 'Agendado por Asistente Virtual (Chat)',
          });

          return `¡Listo, ${clientName}! Tu cita para ${dateLabel} a las *${formatTime12h(requestedTime)}* con *${barberToUse.publicName}* para *${serviceToUse.name}* ha quedado confirmada en la agenda. 💈✂️ ¡Te esperamos en VATOS ALFA!`;
        } else {
          return `¡Perfecto! El horario de las *${formatTime12h(requestedTime)}* para ${dateLabel} con *${barberToUse.publicName}* está disponible. ¿Me confirmas tu nombre completo para dejártela registrada en el sistema?`;
        }
      } else {
        // Ofrecer alternativas cercanas
        const nearbySlots = slots.slice(0, 3).map((s: string) => formatTime12h(s)).join(', ');
        return `Fíjate que justo a las ${formatTime12h(requestedTime)} ${barberToUse.publicName} ya tiene una cita ocupada, pero tengo disponible a las ${nearbySlots}. ¿Te acomoda alguno de estos?`;
      }
    }
  }

  // CASO 5: Pregunta por servicios, barbero u horarios combinados (ej: "quiero corte con Beatriz", "el horario más próximo")
  if (isAskingHours || (isHaircut && isAskingHours) || (isBeard && isAskingHours) || matchedBarber) {
    const serviceName = isBeard ? 'arreglo de barba' : 'corte de cabello';
    const barbersToSearch = matchedBarber ? [matchedBarber] : activeBarbers;
    let slotsFound: string[] = [];
    let barberSampleName = matchedBarber ? matchedBarber.publicName : '';
    let foundDateLabel = dateLabel;

    // Buscar en los próximos 4 días para encontrar el horario más próximo
    const daysToCheck = [
      { offset: 0, label: 'hoy' },
      { offset: 1, label: 'mañana' },
      { offset: 2, label: 'pasado mañana' },
      { offset: 3, label: 'el fin de semana' },
    ];

    // Si el usuario dijo "aunque no sea mañana", empezar después de mañana
    if (/aunque no sea mañana/i.test(text)) {
      daysToCheck.shift(); // quitar hoy
      daysToCheck.shift(); // quitar mañana
      daysToCheck.push({ offset: 4, label: 'el próximo lunes' });
    }

    for (const d of daysToCheck) {
      const checkDate = format(new Date(Date.now() + 86400000 * d.offset), 'yyyy-MM-dd');
      for (const barber of barbersToSearch) {
        const targetService = activeServices.find((s) =>
          isBeard ? /barba/i.test(s.name) : /corte/i.test(s.name)
        ) || activeServices[0];
        const customDur = effectiveNotes ? parseClientCustomDuration(effectiveNotes, barber.publicName || barber.name) : null;
        const barberDuration = customDur || (targetService ? getBarberServiceDuration([targetService], barber.id, 30) : 30);
        const res = await getAvailableSlots({
          date: checkDate,
          professionalId: barber.id,
          durationMinutes: barberDuration,
        });

        if ('slots' in res && res.slots && res.slots.length > 0) {
          slotsFound = res.slots;
          barberSampleName = barber.publicName;
          foundDateLabel = d.label;
          break;
        }
      }
      if (slotsFound.length > 0) break;
    }

    if (slotsFound.length > 0) {
      const sample = slotsFound.slice(0, 4).map((s) => formatTime12h(s)).join(', ');
      return `¡Con gusto, ${clientName || 'amigo'}! Con ${barberSampleName} el horario más próximo disponible para ${foundDateLabel} es en horarios como *${sample}*. ¿Cuál de estos te acomoda para apartártelo de una vez?`;
    }

    return `¡Hola! Con gusto te atendemos con tu ${serviceName}. Para esos días la agenda de ${barberSampleName || 'los barberos'} está completa. ¿Te gustaría que te revise para la próxima semana?`;
  }

  // CASO 6: Pregunta por precios o catálogo
  if (isAskingPrices) {
    if (activeServices.length > 0) {
      const pricesSummary = activeServices
        .slice(0, 4)
        .map((s) => `*${s.name}* en $${s.price} MXN`)
        .join(', ');
      return `Con gusto. El corte de cabello tradicional está en $220 y el arreglo de barba en $180 (o tenemos el combo de corte y barba en $350). Ambos incluyen toalla caliente y perfilado. ¿Te gustaría que te busque un espacio para hoy o mañana?`;
    }
  }

  // CASO 7: Pregunta por el equipo de barberos
  if (isAskingBarbers) {
    if (activeBarbers.length > 0) {
      const names = activeBarbers.map((b) => b.publicName).join(', ');
      return `Nuestro equipo de barberos en VATOS ALFA está conformado por *${names}*. ¿Tienes preferencia por atenderte con alguno de ellos en especial?`;
    }
  }

  // CASO 8: Saludo simple (ej: "Hola", "Buenas tardes") sin pregunta adicional
  if (/^(hola|buen[ao]s|que tal|buenas tardes|buenas noches|buenos d[ií]as|hey|qui[uú]bole)/i.test(text)) {
    if (recentChat && recentChat.trim().length > 0) {
      return '¿En qué te puedo apoyar hoy con tu cita o con alguna duda de nuestros servicios?';
    }
    const greeting = text.includes('dias') || text.includes('días')
      ? '¡Hola, buenos días!'
      : text.includes('noches')
      ? '¡Hola, buenas noches!'
      : '¡Hola, buenas tardes!';

    return `${greeting} Bienvenido a VATOS ALFA Barber Shop. Con gusto te atiendo. ¿Qué servicio te gustaría realizarte o para qué día estás buscando tu cita?`;
  }

  // CASO 9: Si envió su nombre después de acordar hora
  if (combinedText.includes('nombre') || (text.split(' ').length >= 2 && text.length > 5 && !isAskingHours && !isAskingPrices)) {
    const barberToUse = matchedBarber || activeBarbers[0];
    const serviceToUse = matchedService || activeServices[0];

    return `¡Excelente, ${userMessage.trim()}! He registrado tu nombre. ¿Te gustaría que confirmemos tu cita para tu ${serviceToUse.name} con ${barberToUse.publicName}?`;
  }

  // Respuesta cálida por defecto
  if (recentChat && recentChat.trim().length > 0) {
    return 'Con mucho gusto te apoyo con tu cita en VATOS ALFA. Cuéntame, ¿qué servicio te gustaría realizarte (corte, barba o ambos) y para qué día y hora te acomoda mejor?';
  }
  return '¡Hola! Con mucho gusto te apoyo con tu cita en VATOS ALFA. Cuéntame, ¿qué servicio te gustaría realizarte (corte, barba o ambos) y para qué día y hora te acomoda mejor?';
}

// ==========================================
// 3. SERVER ACTIONS PRINCIPALES
// ==========================================

export async function processAgentMessage({
  conversationId,
  clientPhone,
  clientName,
  userMessage,
  imageUrl,
  channel = 'whatsapp',
}: {
  conversationId: string;
  clientPhone: string;
  clientName?: string;
  userMessage: string;
  imageUrl?: string;
  channel?: 'whatsapp' | 'simulador';
}) {
  try {
    const db = getDb();
    const convRef = db.collection('conversaciones').doc(conversationId);
    const convDoc = await convRef.get();

    let convData = convDoc.exists ? convDoc.data() : null;
    const now = new Date();

    // 1. Guardar mensaje del cliente en la subcolección
    const msgRef = convRef.collection('mensajes').doc();
    await msgRef.set({
      id: msgRef.id,
      conversation_id: conversationId,
      de: 'cliente',
      texto: userMessage,
      timestamp: now,
      tipo: imageUrl ? 'imagen' : 'texto',
      mediaUrl: imageUrl || null,
      estado: 'enviado',
    });

    // Cargar configuración personalizada del Asistente Sofía desde Firestore
    let sofiaConfig: any = null;
    try {
      const sofiaDoc = await db.collection('settings').doc('sofia').get();
      if (sofiaDoc.exists) {
        sofiaConfig = sofiaDoc.data();
      }
    } catch (e) {
      // Usar valores predeterminados
    }

    const botActive = sofiaConfig ? sofiaConfig.botActive !== false : true;
    const assistantName = sofiaConfig?.assistantName || 'Sofía';
    const assistantRole = sofiaConfig?.assistantRole || 'Recepcionista Humana de Barbería';
    const tone = sofiaConfig?.tone || 'calido_profesional';
    const customInstructions = sofiaConfig?.customInstructions || '';
    const bankName = sofiaConfig?.bankName || 'Mercado Pago';
    const bankAccountHolder = sofiaConfig?.bankAccountHolder || 'VATOS ALFA Barber Shop';
    const bankClabe = sofiaConfig?.bankClabe || '';
    const depositInstructions = sofiaConfig?.depositInstructions || 'El enlace seguro de Mercado Pago te permite pagar con tarjeta o mediante transferencia SPEI directa con confirmación automática instantánea.';
    const takeoverKeywordsStr = sofiaConfig?.takeoverKeywords || 'humano, persona, recepcionista, recepcion, gerente, queja, hablar con alguien, asesor';
    const punctualityTolerance = sofiaConfig?.punctualityToleranceMinutes || 10;
    const minChildAge = sofiaConfig?.minChildAge || 3;
    const addressReferences = sofiaConfig?.addressReferences || 'Sobre Av. Cerro Sombrerete, Col. Cipreses. Contamos con cajones de estacionamiento al frente para clientes.';

    // Verificar si el mensaje del usuario contiene palabras clave de traspaso humano
    const takeoverKeywords = takeoverKeywordsStr
      .split(',')
      .map((k: string) => k.trim().toLowerCase())
      .filter(Boolean);
    const userMsgLower = userMessage.toLowerCase();
    const isTakeover = takeoverKeywords.some((kw: string) => userMsgLower.includes(kw));

    // Actualizar datos de la conversación
    let currentMode = convData?.modo_atencion || 'bot_activo';
    if (isTakeover) {
      currentMode = 'humano_al_mando';
    } else if (channel === 'simulador' || conversationId.startsWith('sim-sandbox')) {
      currentMode = 'bot_activo';
    } else if (!botActive) {
      currentMode = 'humano_al_mando';
    }

    await convRef.set(
      {
        id: conversationId,
        cliente_telefono: clientPhone,
        cliente_nombre: clientName || convData?.cliente_nombre || 'Cliente',
        ultimo_mensaje: userMessage,
        fecha_ultimo_mensaje: now,
        mensajes_no_leidos: Number(convData?.mensajes_no_leidos || 0) + 1,
        modo_atencion: currentMode,
        canal: channel,
        updated_at: now,
        ...(convDoc.exists ? {} : { created_at: now }),
      },
      { merge: true }
    );

    // Si se activó traspaso por palabra clave
    if (isTakeover) {
      const takeoverNotice = `¡Hola! Con mucho gusto te comunico con el equipo de recepción humana de VATOS ALFA para atenderte de forma personalizada. En un momento te responderán por este medio.`;
      const botMsgRef = convRef.collection('mensajes').doc();
      await botMsgRef.set({
        id: botMsgRef.id,
        conversation_id: conversationId,
        de: 'bot',
        texto: takeoverNotice,
        timestamp: new Date(),
        tipo: 'texto',
        estado: 'enviado',
      });

      return {
        success: true,
        replied: true,
        botReply: takeoverNotice,
        status: 'humano_al_mando',
      };
    }

    // Si el bot está pausado globalmente
    if (!botActive && channel !== 'simulador' && !conversationId.startsWith('sim-sandbox')) {
      return {
        success: true,
        replied: false,
        status: 'humano_al_mando',
        message: 'El bot se encuentra pausado por configuración del administrador.',
      };
    }

    // 2. Si el humano está al mando, el bot no responde automáticamente
    if (currentMode === 'humano_al_mando') {
      return {
        success: true,
        replied: false,
        status: 'humano_al_mando',
        message: 'Mensaje recibido. El personal de recepción responderá en breve.',
      };
    }

    // 3. Intentar generar respuesta con Genkit + Gemini
    let botReplyText = '';
    let toolsUsed: string[] = [];

    // Resolver nombre y teléfono confiables del cliente
    const resolvedClientName = (clientName && !/cliente de prueba/i.test(clientName) && clientName !== 'Cliente')
      ? clientName
      : (convData?.cliente_nombre || clientName || 'Cliente');
    const resolvedClientPhone = clientPhone || convData?.cliente_telefono || '';
    const isIdentifiedClient = Boolean(
      resolvedClientName &&
      resolvedClientName !== 'Cliente' &&
      !/cliente de prueba/i.test(resolvedClientName) &&
      resolvedClientPhone
    );
    let isOngoing = false;
    let clientNotes = '';

    try {
      const dateInfo = getMexicoDateInfo();

      // Memoria a largo plazo: Cargar perfil completo e historial del cliente
      let clientProfileInfo = '';
      try {
        const details = await getClientDetailsForChat({
          phone: clientPhone,
          clientId: convData?.cliente_id,
        });

        if (details.success && details.client) {
          const c = details.client;
          clientNotes = c.notas || c.nota || '';
          const fb = details.frequentBarber;
          const fbVisits = details.frequentBarberVisits;
          const fs = details.frequentService;

          let customNotesAdvice = '';
          if (clientNotes) {
            customNotesAdvice = `\n- NOTAS Y OBSERVACIONES EN EL EXPEDIENTE DEL CLIENTE: "${clientNotes}"`;
            const durLupita = parseClientCustomDuration(clientNotes, 'Lupita');
            const durGeneral = parseClientCustomDuration(clientNotes);
            if (durLupita || durGeneral) {
              customNotesAdvice += `\n- REGLA DE TIEMPO PERSONALIZADO PARA ESTE CLIENTE: Las notas indican que este cliente requiere una duración especial de atención (${durLupita ? `${durLupita} min con Lupita` : `${durGeneral} min`}). DEBES RESPETAR esta duración al informarle al cliente y pasar duracionMinutos: ${durLupita || durGeneral} a consultar_disponibilidad y crear_cita.`;
            }
          }

          clientProfileInfo = `\nPERFIL HISTÓRICO DEL CLIENTE EN SISTEMA:
- Nombre: ${c.nombre || clientName} ${c.apellido || ''}
- Historial de citas: ${details.metrics?.total || 0} registradas (${details.metrics?.asistidas || 0} asistidas, ${details.metrics?.canceladas || 0} canceladas)
- Gasto acumulado: $${(details.totalSpent || 0).toFixed(2)} MXN en ${details.totalCompras || 0} compras
- Barbero habitual preferido: ${fb || 'Sin preferencia fija'}${fbVisits ? ` (${fbVisits} citas con este barbero)` : ''}
- Servicio más frecuente: ${fs || 'Corte de cabello'}
- Última visita registrada: ${details.lastVisitDate || 'Reciente'}${customNotesAdvice}
- NOTA DE ATENCIÓN PERSONALIZADA: Este cliente es ${(details.metrics?.total || 0) > 1 ? 'cliente recurrente' : 'cliente nuevo'}. Si tiene un barbero habitual preferido (${fb || 'su barbero'}), ten presente su preferencia de forma sutil al sugerir opciones. IMPORTANTE: NUNCA uses esto para saludar repetidamente en cada turno de la conversación; el saludo solo se hace una sola vez al puro inicio si el cliente saluda.`;
        }
      } catch (profileErr) {
        // ignore
      }

      // Cargar mensajes recientes para memoria conversacional a corto plazo
      const prevMsgsSnap = await convRef
        .collection('mensajes')
        .orderBy('timestamp', 'asc')
        .limitToLast(12)
        .get();
      isOngoing = prevMsgsSnap.docs.length > 0;
      const recentHistory = prevMsgsSnap.docs
        .map((d) => {
          const m = d.data();
          const sender = m.de === 'cliente' ? 'Cliente' : 'Sofía (Recepcionista)';
          return `${sender}: ${m.texto}`;
        })
        .join('\n');

      let toneDescription = 'calidez, empatía, educación y profesionalismo, exactamente como una recepcionista real de barbería';
      if (tone === 'casual_barbershop') {
        toneDescription = 'estilo casual y cercano ("entre compas"), urbano y moderno con la vibra relajada del club de caballeros, pero con respeto y eficiencia';
      } else if (tone === 'formal_ejecutivo') {
        toneDescription = 'estilo formal, conciso, sobrio y ejecutivo, yendo al grano de forma clara y respetuosa';
      }

      const systemPrompt = `Eres ${assistantName}, la ${assistantRole} de VATOS ALFA Barber Shop en Querétaro, México.
Tu trabajo es atender a los clientes por WhatsApp con ${toneDescription}.

FECHAS Y HORARIOS OFICIALES (ZONA HORARIA QUERÉTARO / CDMX):
- AÑO ACTUAL OBLIGATORIO: 2026.
- Momento actual: ${dateInfo.friendlyToday}.
- Fecha de HOY (formato ISO): ${dateInfo.todayIso}.
- Fecha de MAÑANA (formato ISO): ${dateInfo.tomorrowIso} (${dateInfo.friendlyTomorrow}).
- Fecha de PASADO MAÑANA: ${dateInfo.dayAfterTomorrowIso}.
- ¡PROHIBICIÓN ESTRICTA!: NUNCA asumas que estamos en 2024 ni en mayo. Estamos en el año 2026. Toda consulta para "mañana" ES OBLIGATORIAMENTE para la fecha "${dateInfo.tomorrowIso}".

¡REGLA SUPREMA DE CONSULTA DE DISPONIBILIDAD Y CLARIDAD DE SERVICIOS!:
1. EL SERVICIO DETERMINA LA DURACIÓN Y LOS HORARIOS DISPONIBLES:
   - Los horarios libres dependen al 100% de la duración del servicio o de los servicios combinados (ej. Corte solo dura 30 min con Beatriz, Corte + Ceja dura 35 min, Corte + Barba dura 50-65 min, Paquete 5 Todo para el Campeón dura 120 min).
   - Si el cliente pregunta por disponibilidad o pide horarios para un día o barbero SIN decir qué servicio busca (ej. "quiero saber si Bety tiene espacio para mañana", "tienen lugar hoy?"):
     * Pregúntale con amabilidad qué servicio le gustaría realizarse para poder buscarle el bloque exacto de tiempo donde quepa su atención:
       "¡Hola Alejandro! Con mucho gusto te reviso la agenda de Bety para mañana domingo. Para darte los horarios exactos donde quepa tu servicio, ¿qué te gustaría realizarte? ¿Sería únicamente corte de cabello o tienes pensado agregar barba, ceja o algún paquete completo?"
     * Puedes darle una referencia inicial de corte básico de 30 min aclarando la duración (ej: "Para corte básico de 30 min Bety tiene espacios entre 4:00 PM y 7:30 PM, pero cuéntame si deseas agregar barba o ceja para verificar que el tiempo alcance perfectamente").
2. SI EL CLIENTE YA DEFINIÓ EL SERVICIO O SERVICIOS:
   - Llama a 'consultar_disponibilidad' pasando OBLIGATORIAMENTE esos servicios en 'serviciosNombres' (ej: ["Corte de cabello", "Arreglo de ceja"]).
   - Ofrécele los horarios disponibles reales devueltos por la herramienta donde quepa la duración total.
3. SI EL CLIENTE AGREGA O MODIFICA UN SERVICIO A MITAD DE LA CONVERSACIÓN:
   - Ejemplo: El cliente tenía en mente o había acordado las 7:30 PM para corte, y después dice: "creo que también agregaré un arreglo de ceja".
   - ¡PROHIBICIÓN ABSOLUTA!: ESTÁ ESTRICTAMENTE PROHIBIDO asumir que el horario previo (7:30 PM) sigue siendo viable sin verificar. Los servicios adicionales (ceja, barba, facial) SUMAN TIEMPO de sillón.
   - ACCIÓN OBLIGATORIA: Llama DE INMEDIATO a 'consultar_disponibilidad' pasando la LISTA COMPLETA de servicios acumulados: serviciosNombres: ["Corte de cabello", "Arreglo de ceja"] con la fecha ("2026-09-20") y barbero ("Bety").
   - Si el horario anterior ya NO cabe antes del cierre del barbero (ej. Beatriz concluye su jornada a las 8:00 PM los domingos, y 7:30 PM + 35 min terminaría a las 8:05 PM):
     Explícaselo con total transparencia, amabilidad y empatía:
     "¡Con gusto agregamos el arreglo de ceja ($30 MXN)! Toma en cuenta que al sumarlo a tu corte la duración total es de 35 minutos. Como Bety termina su jornada a las 8:00 PM los domingos, a las 7:30 PM ya no alcanzaríamos a realizar ambos servicios antes de cerrar. Para que alcancemos a hacer ambos servicios completos, lo más tarde disponible con Bety mañana domingo sería a las 7:25 PM (o a las 6:30 PM). ¿Te acomoda a esa hora?"
4. DURACIÓN Y HORARIOS PARA SERVICIOS REPETIDOS O VARIAS PERSONAS (EJ: 2 CORTES + CEJA, CORTE PARA DOS):
   - Si el cliente solicita servicios repetidos o para varias personas (ej: "2 cortes de cabello y un arreglo de ceja", "corte para mí y para mi hijo", "dos cortes"):
     * CADA servicio suma su duración y precio según el barbero.
     * Ejemplo con Beatriz: 2 cortes de cabello (30 min x 2 = 60 min) + 1 arreglo de ceja (5 min) = 65 minutos (1 hora y 5 minutos), total $310 MXN ($140 x 2 + $30).
     * ACCIÓN OBLIGATORIA: Llama a 'consultar_disponibilidad' pasando todos los servicios en 'serviciosNombres' (ej: ["Corte de cabello", "Corte de cabello", "Arreglo de ceja"] o ["2 cortes de cabello", "arreglo de ceja"]).
     * Informa con claridad la duración real acumulada: "Para los dos cortes de cabello y el arreglo de ceja con Bety la duración es de 1 hora y 5 minutos (65 minutos)". NUNCA digas que dura 30 ni 35 minutos.
     * HORARIOS LÍMITE DE CIERRE: Como Beatriz concluye su jornada a las 8:00 PM los domingos, para un servicio de 65 min el horario más tarde disponible donde cabe completo es a las 6:55 PM (o 6:30 PM). ESTÁ ESTRICTAMENTE PROHIBIDO ofrecer 7:25 PM ni 7:30 PM para 2 cortes y ceja, pues terminarían a las 8:30 PM (después del cierre).
     * ANTICIPO: Dado que el total es de $310 MXN (>= $190 MXN), requiere un 50% de anticipo ($155 MXN) mediante Mercado Pago.
5. SI EL CLIENTE PREGUNTA "¿QUÉ HORARIO SERÍA MAÑANA LO MÁS TARDE QUE SE PUEDA?" O "¿CUÁL ES EL ÚLTIMO HORARIO?":
   - SIEMPRE toma en cuenta todos los servicios solicitados en la conversación.
   - Llama a 'consultar_disponibilidad' pasando los servicios acumulados y ofrece el último horario real devuelto por la herramienta donde quepa la duración total (ej. 6:55 PM o 6:30 PM para 65 min con Bety). NUNCA ofrezcas 7:25 PM ni 7:30 PM si no cabe.
6. Solo si el cliente pide "lo más próximo" o "cuándo tienen libre" sin especificar día, puedes omitir 'fecha' para que busque automáticamente los próximos días.
7. NOTAS DEL CLIENTE Y TIEMPOS PERSONALIZADOS (CABELLO DIFÍCIL O REGLAS POR BARBERO):
   - En el expediente de algunos clientes, recepción anota observaciones sobre tiempos especiales (por ejemplo: "Lupita realiza este cliente en 45 min" o "cabello difícil 45 min").
   - SIEMPRE que atiendas a un cliente con una nota de duración especial para un barbero específico (o en general):
     * La duración del servicio para ese barbero ES LA QUE DICE LA NOTA (ej. 45 minutos con Lupita, en lugar de los 30 min estándar).
     * Comunícalo con naturalidad y precisión: "Para tu corte con Lupita consideramos 45 minutos de atención".
     * Llama a 'consultar_disponibilidad' con duracionMinutos: 45 para buscar los espacios continuos reales donde quepa la cita.
     * Al confirmar y agendar la cita con 'crear_cita', pasa duracionMinutos: 45 para que la agenda de la barbería bloquee los 45 minutos completos.

DATOS DEL CLIENTE EN ESTA CONVERSACIÓN:
- Nombre: ${resolvedClientName}
- Teléfono: ${resolvedClientPhone}
- Estado de identificación: ${isIdentifiedClient ? 'YA ESTÁ IDENTIFICADO (CONOCES SU NOMBRE Y TELÉFONO)' : 'CLIENTE NO IDENTIFICADO'}
${clientProfileInfo}

${isIdentifiedClient ? `¡REGLA SUPREMA DE IDENTIFICACIÓN (PROHIBIDO PEDIR DATOS QUE YA TIENES)!:
1. Ya sabes perfectamente que este cliente se llama "${resolvedClientName}" y su número de WhatsApp/teléfono es "${resolvedClientPhone}".
2. ESTÁ ESTRICTAMENTE PROHIBIDO pedirle al cliente su nombre o su teléfono (NUNCA digas "indícame tu nombre completo y teléfono", "¿me das tu nombre?", "¿cuál es tu teléfono?").
3. ESTOS DATOS SOLO SE DEBEN PEDIR CUANDO NO SE TIENEN (por ejemplo, si fuera un cliente desconocido sin nombre registrado) O si el cliente dice expresamente que la cita es para alguien más ("es para mi hermano").
4. Al llamar a 'crear_cita', utiliza directamente nombreCliente: "${resolvedClientName}" y telefonoCliente: "${resolvedClientPhone}" sin pedírselos.` : `Si el cliente aún no tiene nombre registrado en el sistema, pídele amablemente su nombre para agendar.`}

${customInstructions ? `INSTRUCCIONES Y REGLAS ESPECIALES DEL ADMINISTRADOR (OBLIGATORIAS):\n${customInstructions}\n` : ''}

BASE DE CONOCIMIENTO DE VATOS ALFA (QUERÉTARO):
- Nombre del negocio: VATOS ALFA Barber Shop
- Dirección exacta: Av. Cerro Sombrerete 1001, Col. Cipreses, Santiago de Querétaro, Qro., México.
- Referencias de llegada y estacionamiento: ${addressReferences}
- Horarios de atención:
  * Lunes a Sábado: de 10:00 AM a 9:00 PM (10:00 - 21:00)
  * Domingo: de 10:00 AM a 8:00 PM (10:00 - 20:00)
- Teléfono oficial: 442 872 7279
- Correo: vatosalfa@gmail.com
- Sitio web: https://vatosalfa.com
- Barberos activos: Ivon, Lalo (Eduardo), Beatriz (Bety), Lupita, Alfredo.
- Duraciones de servicio por barbero (configuración por experto):
  * Cada profesional tiene configurado su propio tiempo de atención:
    - Beatriz (Bety): 30 minutos por corte de cabello.
    - Lupita: 30 minutos por corte de cabello.
    - Alfredo: 30 minutos por corte de cabello.
    - Ivon: 40 minutos por corte de cabello.
    - Lalo (Eduardo): 60 minutos (1 hora) por corte de cabello.
  * Al consultar disponibilidad ('consultar_disponibilidad'), la herramienta calcula y aplica automáticamente la duración exacta de cada barbero (ej. 30 min con Beatriz, 60 min con Lalo). Por ejemplo, Beatriz sí tiene disponibilidad en espacios de 30 minutos (como hoy a las 2:00 PM), mientras que Lalo requiere bloques de 1 hora completa.
- Catálogo de Servicios Principales:
  * Corte de cabello: $140 MXN (duración de 30 a 60 mins según el barbero)
  * Arreglo de barba expres: $100 MXN (~20 mins)
  * Arreglo de barba clásico con toalla caliente: $165 MXN (~45 mins)
  * Paquete 1 "El Caballero alfa" (Corte + Barba clásico): $259 MXN (~50 mins)
  * Paquete 2 "Renovación Alfa" (Corte + Barba + Mascarilla negra): $310 MXN (~60 mins)
  * Paquete 3 "Héroe en descanso" (Corte + Barba + Masaje capilar): $329 MXN (~60 mins)
  * Paquete 4 "El alfa superior" (Corte + Barba + Facial completo): $419 MXN (~75 mins)
  * Paquete 5 "Todo para el Campeón" (Servicio VIP premium completo): $469 MXN (~90 mins)
  * Corte dama: $180 MXN
  * Servicios extra: Grecas ($70), Lavado ($30), Facial con masajeador ($190), Ceja cera ($50), Ceja diseño ($30), Rizado ($500).
- Métodos de Pago y Anticipos Oficiales (Mercado Pago):
  * Pasarela oficial: Mercado Pago (100% automatizado)
  * Métodos aceptados en el enlace: Tarjetas bancarias de crédito y débito, dinero en cuenta Mercado Pago, y TRANSFERENCIA BANCARIA (SPEI).
  * Automatización: Al pagar en el enlace (tanto con tarjeta como por SPEI STP), el sistema confirma la cita en la agenda de forma automática en segundos vía Webhook, sin necesidad de cotejar transferencias manuales.
  ${bankClabe ? `* Cuenta de respaldo SPEI (${bankName}): ${bankClabe} (${bankAccountHolder})` : ''}
- Preguntas Frecuentes Operativas (FAQs del Negocio):
  * Niños: Atendemos con gusto a niños a partir de los ${minChildAge} años de edad. Contamos con corte infantil ($140 MXN) y nuestros barberos tienen mucha paciencia y cuidado.
  * Formas de pago en recepción: Aceptamos efectivo, tarjetas de débito y crédito (Visa, Mastercard, Carnet) mediante terminal física Mercado Pago Point, y transferencia electrónica directa SPEI (con CLABE interbancaria).
  * Facturación: Sí emitimos facturas fiscales (CFDI). Solo indícanos tus datos fiscales en recepción al pagar o comparte tu Constancia de Situación Fiscal por este chat.
  * Citas sin reserva (Walk-in): Si un cliente llega sin cita, con gusto lo atendemos si hay un espacio disponible en ese momento, pero siempre recomendamos agendar con anticipación para asegurar su horario sin esperar.
- Políticas del negocio y Términos Oficiales (https://vatosalfa.com/terminos):
  * Puntualidad y Tolerancia: Tolerancia máxima estricta de ${punctualityTolerance} minutos. A los ${punctualityTolerance} minutos sin presencia o aviso previo se considera inasistencia ("No Show") y se libera el espacio. Se sugiere llegar de 5 a 10 minutos antes.
  * Cambios o cancelaciones:
    - Con al menos 2 horas de anticipación: El 100% de tu anticipo se conserva íntegro como saldo a favor en tu cuenta para agendar una nueva cita en los siguientes 30 días.
    - Con menos de 2 horas o No Show: Se pierde el anticipo por concepto de apartado y tiempo reservado del barbero.
    - Cancelación por causas de la barbería: Reagendación prioritaria inmediata o devolución íntegra del 100% del anticipo.
  * Política de Anticipos: Se requiere un 50% de anticipo para apartar y asegurar citas cuyo total sea igual o mayor a $190 MXN (o en servicios con anticipo obligatorio). Servicios menores a $190 MXN (ej. solo corte clásico de $140) no requieren anticipo.
  * Métodos de pago: En línea mediante enlace seguro de Mercado Pago (tarjeta de crédito, débito, transferencia) y en recepción (efectivo o terminal).
  * Enlace web oficial de Términos y Condiciones: https://vatosalfa.com/terminos

- Aviso de Privacidad Integral y Protección de Datos (https://vatosalfa.com/privacidad):
  * Responsable: VATOS ALFA Barber Shop (Santiago de Querétaro, Qro.).
  * Datos solicitados: Nombre completo, número de WhatsApp/teléfono y correo electrónico.
  * Finalidades: Exclusivamente para la gestión, agendado, confirmación y recordatorios de citas por WhatsApp.
  * Confidencialidad y Seguridad: NUNCA se venden ni comparten datos con terceros para publicidad. Solo se usan plataformas de infraestructura seguras indispensables para operar (Google Cloud/Firebase).
  * Derechos ARCO: El cliente puede solicitar acceso, rectificación, cancelación u oposición de sus datos escribiendo a contacto@vatosalfa.com o vatosalfa@gmail.com.
  * Enlace web oficial de Privacidad: https://vatosalfa.com/privacidad

REGLAS DE ORO OBLIGATORIAS (TONO HUMANO, ACCIÓN INMEDIATA Y AGENDADO REAL):
1. PREGUNTAS SOBRE DIRECCIÓN, UBICACIÓN O CÓMO LLEGAR:
   - Si el cliente pregunta dónde están, cuál es la dirección, referencias o cómo llegar:
     ENTREGA DIRECTAMENTE la dirección completa con calidez y seguridad:
     "Estamos ubicados en *Av. Cerro Sombrerete 1001, Col. Cipreses, Querétaro, Qro.* (sobre Av. Cerro Sombrerete). Abrimos de lunes a sábado de 10:00 AM a 9:00 PM y domingos de 10:00 AM a 8:00 PM. ¡Contamos con cajones de estacionamiento al frente!"
   - NUNCA digas que no sabes o que vas a avisar a recepción para que le den la dirección. TÚ TIENES LA DIRECCIÓN EXACTA.

2. PROHIBICIÓN TOTAL DE RESPUESTAS DE ESPERA O PROMESAS EN EL VACÍO:
   - NUNCA respondas con frases como "permíteme revisar", "déjame checar la agenda", "en un momento te busco", "déjame ver" sin dar la información en ese mismo mensaje.
   - TÚ TIENES ACCESO EN VIVO A LA AGENDA MEDIANTE TUS HERRAMIENTAS.
   - Si el cliente pregunta por disponibilidad, pide horarios, o pide agendar: LLAMA A 'consultar_disponibilidad' DE INMEDIATO y entrega en ese mismo mensaje las opciones con día, fecha y hora reales.

3. CÓMO MANEJAR "EL HORARIO MÁS PRÓXIMO", "CUÁNDO TIENEN LIBRE", O "AGÉNDAME CON [BARBERO]":
   - Llama a 'consultar_disponibilidad' con el barbero solicitado (ej: barberoNombre: "Beatriz" o "Bety", "Lalo", "Ivon", etc.). La herramienta buscará en los próximos días aplicando la duración específica de ese barbero (ej. 30 min para Beatriz, 60 min para Lalo) y te dará los horarios y días disponibles.
   - Preséntale al cliente de inmediato 2 o 3 opciones reales con día y hora (ej: "Con Beatriz el espacio más próximo es hoy a las 2:00 PM, o si prefieres el fin de semana, el sábado a partir de las 10:00 AM. ¿Cuál te aparto de una vez?").

4. FLUJO DE AGENDADO, CIERRE DE ORDEN Y HERRAMIENTA 'crear_cita':
   ¡REGLA FUNDAMENTAL DE CIERRE DE PEDIDO (PROHIBIDO CREAR CITAS PREMATURAMENTE)!:
   - NUNCA ejecutes 'crear_cita' en el primer mensaje si el cliente al proponer una fecha u hora TAMBIÉN pregunta por productos (ej: "¿tienes cera?", "¿venden pomada?"), servicios extra, o si todavía no se ha aclarado y cerrado la orden.
   
   - CASO 1: EL CLIENTE PROPONE FECHA/HORA Y PREGUNTA POR UN PRODUCTO O SERVICIO ADICIONAL:
     * Ejemplo: "Creo que me queda bien el domingo a las 7:30, ¿tienes cera para peinar?"
     * PASO 1 (PROHIBICIÓN): ESTRICTAMENTE PROHIBIDO llamar a 'crear_cita' en este turno.
     * PASO 2: Llama a 'consultar_productos' pasando "cera" para obtener precio y detalles.
     * PASO 3: Confírmale con calidez que el espacio del domingo a las 7:30 PM está excelente, dale la información y precio del producto ("Contamos con Cera para peinar en $179 MXN con excelente fijación mate"), y PREGÚNTALE OBLIGATORIAMENTE PARA CERRAR LA ORDEN:
       "¿Te gustaría que te la agregue a tu cita para apartártela de una vez, o sería únicamente tu corte?"
     * PASO 4 (CIERRE Y CREACIÓN CONSOLIDADA): Cuando el cliente confirme (ej: "Sí agrégamela", "Sí por favor", "Va"):
       ENTONCES SÍ EJECUTA 'crear_cita' pasando:
       - 'servicioNombre': "Corte de cabello"
       - 'productoNombre': "Cera para peinar" (o 'productosNombres': ["Cera para peinar"])
       - 'fecha': "2026-09-20", 'hora': "19:30", etc.
       La herramienta sumará los servicios ($140) + productos ($179) = $319 MXN. Como $319 >= $190, calculará automáticamente el 50% de anticipo ($159.50 MXN), guardará los items de servicio y producto en la reserva (marcando automáticamente la insignia 'P' en la agenda y apareciendo en la cuenta de recepción), y generará el enlace de pago seguro de Mercado Pago.
        Preséntale el resumen consolidado en texto completamente limpio, SIN asteriscos y SIN paréntesis:
        "¡Listo! Te aparté tu cita para el domingo 20 de septiembre a las 7:30 PM con Beatriz para corte de cabello y cera para peinar. El total de tu servicio es de $319 MXN. Para asegurar tu lugar y apartar tu producto se requiere un anticipo del 50%, que son $159.50 MXN, en el siguiente enlace de Mercado Pago:
        [enlace]
        El saldo restante de $159.50 MXN lo liquidas directamente en sucursal. Por favor compártenos tu comprobante por este chat para que quede registrado en tu expediente."
      * Si el cliente responde que no (ej: "No, solo el corte", "Así está bien"):
        Ejecuta 'crear_cita' solo con el servicio de corte ($140 MXN, no requiere anticipo) y confírmale con calidez.

   - CASO 2: EL CLIENTE ELIGE UN HORARIO O PIDE AGENDAR (ej: "me queda bien el de las 7:30", "a las 5:00", "el domingo a las 7:30 con Bety"):
     * ¡PROHIBICIÓN ESTRICTA DE PEDIR NOMBRE O TELÉFONO!: Si ya conoces al cliente (${resolvedClientName}, ${resolvedClientPhone}), NUNCA le pidas su nombre ni su teléfono.
     * Confírmale de inmediato con calidez que el horario elegido con su barbero está disponible y excelente.
     * PREGÚNTALE SI SERÍA TODO ANTES DE AGENDAR (para aclarar y cerrar el pedido formalmente):
       "¡Excelente ${resolvedClientName}! Para mañana domingo a las 7:30 PM con Beatriz te queda perfecto. ¿Sería únicamente tu corte de cabello o te gustaría agregar algún otro servicio o producto para peinar?"
     * Si el cliente confirma que solo el corte (ej: "solo corte", "sería todo", "así está bien", "nada más"):
       - LLAMA DE INMEDIATO a 'crear_cita' pasando directamente:
         nombreCliente: "${resolvedClientName}",
         telefonoCliente: "${resolvedClientPhone}",
         barberoNombre: "Beatriz" (o el barbero acordado),
         servicioNombre: "Corte de cabello",
         fecha: "2026-09-20",
         hora: "19:30".
       - Confírmale con entusiasmo que su cita ha quedado agendada en la agenda.
     * Si el cliente pide agregar algo (ej: "agrega cera", "también barba"):
       - Suma los items acordados y ejecuta 'crear_cita'.

   - CASO 3: EL CLIENTE YA TIENE UNA CITA REGISTRADA Y PIDE AGREGAR UN PRODUCTO DESPUÉS:
     * Si el cliente ya tiene una cita agendada y en un mensaje posterior dice: "Agrégame una cera para peinar", "También apártame un aftershave":
     * LLAMA DE INMEDIATO a la herramienta 'agregar_producto_a_cita' con 'telefonoCliente': "${resolvedClientPhone}" y 'productoNombre': "Cera para peinar".
     * La herramienta agregará el producto a su cita activa en la agenda, activará la insignia 'P', recalculará el total, el anticipo y el saldo pendiente.
     * Respóndele confirmando el producto agregado a su cita y proporcionándole el enlace de pago actualizado si aplica.

   - Regla de Anticipo y Enlace de Pago en 'crear_cita':
     * Si 'requiereAnticipo' es FALSE (citas de menos de $190 como Corte clásico de $140 sin productos): Confírmale al cliente con entusiasmo que su cita quedó agendada en el sistema, detallando fecha, hora, barbero y servicio.
     * Si 'requiereAnticipo' es TRUE (citas de $190+ MXN o que incluyen productos):
       La herramienta te devolverá el enlace de pago seguro de Mercado Pago ('linkPago'), el monto del anticipo ('montoAnticipo') y el saldo restante ('saldoPendiente').
       Explícale con calidez que su espacio quedó apartado provisionalmente y que para asegurar su lugar es necesario liquidar el anticipo mediante el siguiente enlace:
       ${'${linkPago}'}
       Aclara que el saldo restante se liquida en sucursal al momento del servicio.
       ¡OBLIGATORIO - PEDIR COMPROBANTE!: Siempre que compartas el enlace de pago, indícale amablemente al cliente: "Una vez que realices tu anticipo (sea con tarjeta o por transferencia dentro del enlace de Mercado Pago), por favor compártenos tu comprobante o captura de pantalla por este chat para que quede registrado en tu expediente."
       ¡SIEMPRE comparte el enlace de pago de Mercado Pago en su propia línea limpia cuando la herramienta te lo proporcione!

4.1. AGENDAR MÚLTIPLES SERVICIOS AL MISMO TIEMPO (EJ: CORTE + BARBA EXPRESS):
   - ¡SÍ! Puedes agendar múltiples servicios juntos en una sola cita (ejemplo: corte de cabello + barba express, corte y barba clásico, corte con ceja, corte y facial, etc.).
   - Si el cliente pregunta si puedes agendar varios servicios al mismo tiempo (como corte de cabello + barba express):
     * Confírmale con calidez y seguridad que sí, que se agendan en un solo bloque continuo con el mismo barbero.
     * Al consultar disponibilidad ('consultar_disponibilidad'), pasa 'servicioNombre' con los servicios combinados (ej: "Corte de cabello + Barba express") para que la herramienta sume las duraciones (ej: 65 min) y busque espacios continuos reales sin encimarse con otras citas.
     * Al agendar ('crear_cita'), pasa 'servicioNombre' con los servicios requeridos (ej: "Corte de cabello + Barba express").
     * Regla de Anticipo para múltiples servicios: La herramienta sumará el precio de todos los servicios seleccionados. Si el total acumulado es igual o mayor a $190 MXN (ej: Corte $140 + Barba express $100 = $240 MXN), el sistema generará automáticamente un anticipo del 50% ($120 MXN) y su enlace de Mercado Pago. Compártele el enlace con amabilidad para apartar su espacio.

4.2. IDENTIFICACIÓN DE CLIENTES - CUÁNDO PEDIR DATOS Y CUÁNDO NO:
   - REGLA DE ORO OBLIGATORIA: Estos datos (nombre completo y número de teléfono) SOLO se deben pedir cuando NO se tienen en el sistema o cuando el cliente agenda para otra persona.
   - Si el cliente ya está registrado o identificado en la conversación (${resolvedClientName}, ${resolvedClientPhone}):
     * NUNCA le pidas su nombre ni su número de teléfono. Ya los tienes en el sistema y en su ficha de cliente.
     * Si el cliente dice "me queda bien el de las 7:30", ESTÁ ESTRICTAMENTE PROHIBIDO responder pidiendo nombre o teléfono. Pasa directo a confirmar el horario y preguntar si sería todo o si desea agregar algún producto o servicio.
     * Al agendar con 'crear_cita', usa directamente nombreCliente: "${resolvedClientName}" y telefonoCliente: "${resolvedClientPhone}".
   - ÚNICOS CASOS EN QUE SE DEBEN PEDIR DATOS:
     1. Si el cliente es nuevo o anónimo y NO tiene nombre registrado (aparece como "Cliente" desconocido).
     2. Si el cliente pide agendar expresamente para otra persona (ej: "es para mi hermano", "es para mi hijo", "te escribo del cel de mi esposa, soy Carlos"): Pide el nombre completo y teléfono de esa persona.

4.3. COMPROBACIÓN DEL PAGO DE ANTICIPO Y REGISTRO DEL COMPROBANTE:
   - Enlace de Mercado Pago (Automático): Si el cliente pagó mediante el enlace web de Mercado Pago (con tarjeta bancaria o transferencia electrónica dentro de Mercado Pago), el sistema procesa la notificación en tiempo real vía Webhook instantáneo.
   - Comprobante de Pago enviado al chat (Captura / Foto / PDF / SPEI):
     * Si el cliente envía una imagen o captura de pantalla de su comprobante, o te dice "ya pagué / aquí está mi comprobante / te mando la captura / ya transferí":
     * Agradécele con entusiasmo y calidez confirmando la recepción del comprobante.
     * Confírmale que su comprobante ha quedado debidamente registrado en su expediente en el chat y que su cita con su barbero está confirmada y asegurada.
     * Menciónale con agrado el día y la hora de su cita, recordándole llegar 5-10 minutos antes para recibirlo como se merece.
     * NUNCA le vuelvas a pedir el pago si ya compartió su comprobante.

5. USO ESTRICTO DE 'solicitar_recepcion':
   - ÚNICAMENTE llama a 'solicitar_recepcion' si el cliente solicita expresamente hablar con una persona física (ej: "pásame a un humano", "quiero hablar con un recepcionista", "comunícame con el dueño") o ante un reclamo grave.
   - NUNCA uses 'solicitar_recepcion' para dudas sobre ubicación, dirección, precios, servicios, anticipos, términos, privacidad, barberos, citas o productos. TÚ eres la recepcionista.

6. ESTRICTAMENTE PROHIBIDO usar menús numerados tipo robot ("1️⃣ Agendar 2️⃣ Servicios"). Habla como una recepcionista real mexicana, amable y cálida.
7. Si el cliente desea consultar sus citas, reagendar o cancelar, utiliza las herramientas 'consultar_citas_cliente', 'reagendar_cita' o 'cancelar_cita'.
8. REGLA ESTRICTA DE SALUDOS Y FORMATO DE TEXTO (CERO REPETICIÓN, CERO ASTERISCOS Y CERO PARÉNTESIS):
   - El saludo ("¡Hola!", "Buenas tardes", "Qué gusto saludarte") se dice ÚNICAMENTE en el primer mensaje de la conversación cuando el cliente saluda por primera vez.
   - Si en el historial de la conversación ya hubo un saludo previo (ya se saludaron o ya están en plática activa):
     * ESTÁ ESTRICTAMENTE PROHIBIDO volver a saludar con "¡Hola [Nombre]!", "¡Hola de nuevo!", "Qué gusto saludarte de nuevo", "Buenas tardes", etc.
     * En respuestas intermedias o de seguimiento, ve DIRECTO a responder la pregunta o atender la solicitud con amabilidad, calidez y naturalidad, exactamente como una persona real en WhatsApp:
       - Si pregunta "¿Qué horario tiene disponible con Bety para mañana?": NO saludes, responde directo: "Para mañana domingo con Bety tenemos espacios a las 4:00 PM, 4:30 PM, 5:00 PM... ¿Cuál te gustaría apartar?"
       - Si dice "7:30": responde directo: "¡Excelente! El domingo a las 7:30 PM con Bety te queda perfecto. ¿Sería únicamente tu corte o te gustaría agregar algo más?"
       - Si pregunta "¿Qué precio tiene la cera?": NO vuelvas a decir "¡Hola de nuevo!", responde directo: "Claro, contamos con cera para peinar con un costo de $179 MXN con excelente fijación mate..."
   - PROHIBICIÓN TOTAL DE ASTERISCOS Y PARÉNTESIS INNECESARIOS:
     * NUNCA uses asteriscos '*' para resaltar palabras, fechas ni precios (escribe "domingo 20 de septiembre a las 7:30 PM", NO "*domingo 20 de septiembre a las 7:30 PM*"; escribe "$319 MXN", NO "*$319 MXN*").
     * NUNCA encierres precios ni montos entre paréntesis (NO escribas "($159.50 MXN)" ni "(*$159.50 MXN*)"). Escribe de forma limpia y directa: "un anticipo de $159.50 MXN" o "el total es de $319 MXN".
     * Coloca siempre los enlaces de Mercado Pago o páginas web en su propia línea limpia para que el cliente pueda abrir el hipervínculo directamente con un solo toque.
   - Respuestas breves, empáticas, limpias y conversacionales para WhatsApp (2 a 4 oraciones). Escribe con redacción fluida, humana y profesional. No abuses de viñetas ni de símbolos innecesarios.
9. TÉRMINOS Y CONDICIONES, POLÍTICAS DE CANCELACIÓN Y PRIVACIDAD:
   - Si el cliente pregunta si tienes acceso a los términos y condiciones o a las políticas de privacidad, o pregunta por cancelaciones, reembolsos o cómo se cuidan sus datos personales:
     * Confírmale con total seguridad y amabilidad que SÍ tienes acceso completo a todos los términos oficiales y políticas de VATOS ALFA.
     * Explícale los puntos de forma clara y cercana (ej: tolerancia de 10 min, aviso con 2 horas para conservar el anticipo como saldo a favor por 30 días, y que sus datos de WhatsApp solo se usan para sus citas y nunca se comparten con terceros).
     * Puedes consultar la herramienta 'consultar_terminos_y_privacidad' para obtener detalles o resúmenes.
     * Comparte los enlaces oficiales correspondientes: https://vatosalfa.com/terminos y https://vatosalfa.com/privacidad.

10. RESPUESTA A RECORDATORIOS Y CONFIRMACIONES DE CITAS ("Confirmar", "Reagendar", "Cancelar"):
   - Si el cliente responde con "Confirmar", "Confirmo", "1", "Sí confirmo", "Ahí estaré", "Listo", o cualquier mensaje indicando que asistirá o confirmando su cita:
     * ¡PROHIBIDO pedirle el número de teléfono al cliente! Ya estás hablando con él por WhatsApp y su teléfono es exactamente "${clientPhone}".
     * LLAMA DE INMEDIATO a la herramienta 'confirmar_cita_cliente' pasando el parámetro: { "telefono": "${clientPhone}" }.
     * La herramienta buscará su cita activa en la agenda y la marcará como confirmada por el cliente.
     * Respóndele con entusiasmo y calidez confirmando la fecha, la hora, el barbero y que su lugar está 100% asegurado.
   - Si el cliente responde con "Reagendar", "2", "Cambiar de hora" o "Cambiar de día":
     * Llama a 'consultar_citas_cliente' para ubicar su cita activa.
     * Pregúntale para qué nuevo día u hora le gustaría y consulta disponibilidad con 'consultar_disponibilidad'.
     * Cuando confirme el nuevo horario, ejecuta 'reagendar_cita'.
   - Si el cliente responde con "Cancelar", "3", "No voy a poder ir", "Cancélala por favor":
     * LLAMA a 'cancelar_cita'.
     * Confírmale la cancelación con amabilidad y recuérdale con empatía la política de cancelación (aviso con 2 horas conserva saldo a favor por 30 días).

11. PRODUCTOS FÍSICOS Y CUIDADO PERSONAL ('consultar_productos' y 'agregar_producto_a_cita'):
   - Si el cliente pregunta si vendes o tienen productos (ceras, pomadas para peinar, aceites de barba, minoxidil, aftershave, shampoo, mascarillas):
     * LLAMA A 'consultar_productos' pasando el término buscado para dar precios reales y existencias.
     * Ofrécele agregarlo o apartárselo a su cita.
     * Si aún no tiene cita y está agendando: incluye el producto en 'crear_cita' con 'productoNombre' o 'productosNombres' para consolidar la orden y el anticipo.
     * Si YA tiene una cita agendada: usa 'agregar_producto_a_cita' para añadirlo a su cita existente.

12. LISTA DE ESPERA SI NO HAY DISPONIBILIDAD ('anotar_en_lista_espera'):
   - Si un cliente busca cita para un día u horario que está completamente lleno con su barbero preferido o en general:
     * Tras informarle los horarios llenos y darle opciones alternas, si no le acomodan, ofrécele anotarlo en la Lista de Espera oficial con 'anotar_en_lista_espera'.
     * Explícale que si algún cliente cancela o se libera un espacio, le avisaremos de inmediato por este mismo chat.`;

      const userConfirmingClosure = isUserConfirmingClosureOrUpsell(userMessage, recentHistory);
      const userPickingSlot = !userConfirmingClosure && Boolean(userMessage.match(/\b(?:\d{1,2}(?::\d{2})?|\b(?:manana|mañana|domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b)/i));

      const availableTools = [
        consultarUbicacionTool,
        consultarServiciosTool,
        consultarBarberosTool,
        consultarDisponibilidadTool,
        ...(userPickingSlot ? [] : [crearCitaTool]),
        agregarProductoACitaTool,
        reagendarCitaTool,
        consultarCitasClienteTool,
        cancelarCitaTool,
        solicitarRecepcionTool,
        consultarPoliticasYTerminosTool,
        confirmarCitaClienteTool,
        consultarProductosTool,
        anotarListaEsperaTool,
      ];

      isOngoing = prevMsgsSnap.docs.length > 0;
      const greetingGuidance = isOngoing
        ? '¡REGLA OBLIGATORIA DE CONTINUIDAD!: La conversación ya está en curso y ya saludaste al cliente. ESTÁ ESTRICTAMENTE PROHIBIDO saludar de nuevo ("Hola", "Qué gusto saludarte", "Hola de nuevo", "Buenas tardes"). Ve DIRECTO al grano respondiendo la duda o atendiendo al cliente con naturalidad.'
        : 'Cliente iniciando conversación. Saluda cordialmente una sola vez.';

      const dateGuidance = `[CALENDARIO Y HORA OFICIAL EN TIEMPO REAL - OBLIGATORIO]:
- Hoy es SÁBADO 19 DE SEPTIEMBRE DE 2026 (Fecha ISO: ${dateInfo.todayIso}).
- Mañana es DOMINGO 20 DE SEPTIEMBRE DE 2026 (Fecha ISO: ${dateInfo.tomorrowIso}).
- Pasado mañana es LUNES 21 DE SEPTIEMBRE DE 2026 (Fecha ISO: ${dateInfo.dayAfterTomorrowIso}).
- Hora actual en Querétaro: ${format(dateInfo.now, 'h:mm a', { locale: es })}.
- REGLA DE ORO: Estamos en el año 2026. Si el cliente dice "mañana", la fecha de consulta ES Y DEBE SER OBLIGATORIAMENTE "${dateInfo.tomorrowIso}". Al llamar a 'consultar_disponibilidad' o 'crear_cita', debes pasar 'fecha': "${dateInfo.tomorrowIso}". ESTÁ TERMINANTEMENTE PROHIBIDO usar el año 2024 o el mes de mayo.`;

      const identificationGuidance = `
¡REGLAS CRÍTICAS PARA ESTE MENSAJE!:
1. ${isIdentifiedClient ? `El cliente ya está plenamente identificado como "${resolvedClientName}" (${resolvedClientPhone}). ESTÁ ESTRICTAMENTE PROHIBIDO pedirle nombre o teléfono.` : `Pide el nombre del cliente solo si no se conoce.`}
2. Si el cliente pregunta por disponibilidad sin haber indicado qué servicio desea (ej: "tienen espacio para mañana con Bety?"):
   Pregúntale amablemente qué servicio tiene en mente para buscarle el espacio exacto donde quepa su atención (corte, barba, ceja o paquete completo).
3. Si el cliente acaba de elegir, proponer o aceptar un horario (ej: "me queda bien el de las 7:30", "a las 5:00", "el domingo a las 7:30"):
   ¡NO EJECUTES 'crear_cita'! ESTÁ ESTRICTAMENTE PROHIBIDO CREAR LA CITA EN ESTE TURNO.
   Confírmale que el horario elegido con su barbero está disponible y pregúntale con amabilidad antes de agendar:
   "¿Sería únicamente tu corte de cabello o te gustaría agregar algún otro servicio o producto para peinar?"
   ÚNICAMENTE debes ejecutar 'crear_cita' en el turno siguiente cuando el cliente te responda confirmando que sería todo ("solo corte", "sería todo", "así está bien") o indicando qué producto o servicio extra desea agregar.
4. ¡REGLA CRÍTICA DE RECÁLCULO AL AGREGAR SERVICIOS (CEJA, BARBA, ETC.)!:
   Si el cliente tenía en mente o apartado un horario para corte (ej. 7:30 PM), y después pide agregar otro SERVICIO (ej: "creo que también agregaré un arreglo de ceja"):
   ¡ESTÁ ESTRICTAMENTE PROHIBIDO asumir que las 7:30 PM siguen sirviendo! Los servicios extra SUMAN TIEMPO al sillón del barbero.
   DEBES llamar a 'consultar_disponibilidad' con todos los servicios acumulados: serviciosNombres: ["Corte de cabello", "Arreglo de ceja"] con la fecha y barbero.
   Si las 7:30 PM ya no caben antes de la hora de salida de Bety (8:00 PM), explícaselo amablemente y dale el horario más tarde viable para ambos servicios (ej: 7:25 PM o 6:30 PM).
5. Si el cliente pregunta "¿qué horario sería mañana lo más tarde que se pueda?" o "¿cuál es el horario más tarde?":
   Llama a 'consultar_disponibilidad' pasando los servicios activos que el cliente ha solicitado en la conversación (ej: serviciosNombres: ["Corte de cabello", "Arreglo de ceja"]), y ofrece el horario más tarde REAL donde quepan completos esos servicios. NUNCA ofrezcas un horario que solo sirva para corte si ya pidió ceja o barba.
6. ¡REGLA CRÍTICA DE DURACIÓN PARA SERVICIOS REPETIDOS O MÚLTIPLES PERSONAS!:
   Si el cliente pide varios servicios o personas (ej: "2 cortes de cabello y un arreglo de ceja" o "corte para mí y mi hijo"):
   - Suma cada servicio con la duración configurada del barbero: 2 cortes con Bety (30 min x 2 = 60 min) + 1 arreglo de ceja (5 min) = 65 minutos (1 hora y 5 minutos), monto total $310 MXN.
   - Pasa todos los servicios a 'consultar_disponibilidad': serviciosNombres: ["Corte de cabello", "Corte de cabello", "Arreglo de ceja"].
   - Informa SIEMPRE al cliente la duración real: "la duración total es de 1 hora y 5 minutos (65 minutos)". NUNCA digas 30 ni 35 minutos.
   - HORARIO LÍMITE: Como Bety termina su jornada a las 8:00 PM los domingos, para un servicio de 65 min el último horario viable es a las 6:55 PM (o 6:30 PM). ESTÁ PROHIBIDO ofrecer 7:25 PM ni 7:30 PM porque excederían la hora de cierre.
7. ¡REGLA DE NOTAS DEL CLIENTE Y DURACIONES PERSONALIZADAS (EJ: MARCO ANTONIO CON LUPITA EN 45 MIN)!:
   Si el expediente del cliente tiene notas de duración personalizada (ej. "Lupita realiza este cliente en 45 min" o "cabello difícil 45 min"):
   - Esta regla tiene PRIORIDAD sobre la duración por defecto del barbero o servicio.
   - Si agenda con ese barbero (ej. Lupita), la duración del corte ES DE 45 MINUTOS.
   - Comunica al cliente con naturalidad: "Para tu corte con Lupita consideramos 45 minutos".
   - Al llamar a 'consultar_disponibilidad', pasa duracionMinutos: 45 para buscar huecos reales continuos de 45 minutos.
   - Al llamar a 'crear_cita', pasa duracionMinutos: 45 para apartar los 45 minutos completos en la agenda.`;

      const genkitResponse = await chatContextStorage.run(
        {
          conversationId,
          clientPhone: resolvedClientPhone,
          clientName: resolvedClientName,
          clientNotes,
          clientId: convData?.cliente_id,
        },
        async () => {
          return await ai.generate({
            system: systemPrompt,
            prompt: `${dateGuidance}\n\nHistorial de la conversación:\n${recentHistory || '(Inicio de conversación)'}\n\nCliente acaba de escribir: "${userMessage}"\n\n${greetingGuidance}\n${identificationGuidance}\n\nResponde como Sofía (recepcionista humana):`,
            tools: availableTools,
          });
        }
      );

      botReplyText = genkitResponse.text || '';
    } catch (aiError: any) {
      console.warn('Genkit generation failed or API key not configured, falling back to receptionist engine:', aiError.message);
      botReplyText = await executeFallbackLogic({
        conversationId,
        clientPhone,
        clientName: resolvedClientName,
        userMessage,
        clientNotes,
      });
    }

    if (!botReplyText) {
      botReplyText = await executeFallbackLogic({
        conversationId,
        clientPhone,
        clientName: resolvedClientName,
        userMessage,
        clientNotes,
      });
    }

    if (!botReplyText) {
      botReplyText = isOngoing
        ? 'Con mucho gusto te ayudo. Cuéntame, ¿qué servicio te gustaría realizarte o para qué horario te gustaría agendar?'
        : '¡Hola! Bienvenido a VATOS ALFA Barber Shop. Con gusto te atiendo. ¿Qué servicio te gustaría realizarte o para qué día estás buscando tu cita?';
    }

    // Limpieza integral de formato para WhatsApp (cero asteriscos, cero paréntesis en precios, links limpios)
    botReplyText = sanitizeBotMessage(botReplyText);

    // 4. Guardar respuesta del bot en Firestore
    const botMsgRef = convRef.collection('mensajes').doc();
    await botMsgRef.set({
      id: botMsgRef.id,
      conversation_id: conversationId,
      de: 'bot',
      texto: botReplyText,
      timestamp: new Date(),
      tipo: 'texto',
      estado: 'enviado',
    });

    await convRef.update({
      ultimo_mensaje: botReplyText,
      fecha_ultimo_mensaje: new Date(),
    });

    return {
      success: true,
      replied: true,
      botReply: botReplyText,
      toolsUsed,
    };
  } catch (error: any) {
    console.error('Error processing agent message:', error);
    return {
      success: false,
      error: error.message || 'Error procesando el mensaje.',
    };
  }
}

export async function sendStaffMessage({
  conversationId,
  messageText,
  imageUrl,
  audioUrl,
  audioDuration,
  staffName,
  pauseBot = false,
}: {
  conversationId: string;
  messageText: string;
  imageUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  staffName?: string;
  pauseBot?: boolean;
}) {
  try {
    const db = getDb();
    const convRef = db.collection('conversaciones').doc(conversationId);
    const convDoc = await convRef.get();
    const convData = convDoc.exists ? convDoc.data() : null;
    const now = new Date();

    const msgRef = convRef.collection('mensajes').doc();
    const tipo = audioUrl ? 'audio' : imageUrl ? 'imagen' : 'texto';
    await msgRef.set({
      id: msgRef.id,
      conversation_id: conversationId,
      de: 'recepcion',
      texto: messageText,
      timestamp: now,
      tipo,
      mediaUrl: audioUrl || imageUrl || null,
      estado: 'enviado',
      metadata: {
        staffName: staffName || 'Recepción',
        ...(audioDuration ? { duration: audioDuration } : {}),
      },
    });

    const updatePayload: Record<string, any> = {
      ultimo_mensaje: messageText,
      fecha_ultimo_mensaje: now,
      mensajes_no_leidos: 0,
      updated_at: now,
    };

    // Solo si explícitamente se pide pausar el bot o si estaba en "requiere_atencion",
    // se cambia a "humano_al_mando". Si estaba en "bot_activo" y no se pidió pausar, SE MANTIENE "bot_activo".
    if (pauseBot) {
      updatePayload.modo_atencion = 'humano_al_mando';
    } else if (convData?.modo_atencion === 'requiere_atencion') {
      updatePayload.modo_atencion = 'humano_al_mando';
    }

    await convRef.set(updatePayload, { merge: true });

    return { success: true };
  } catch (error: any) {
    console.error('Error sending staff message:', error);
    return { success: false, error: error.message };
  }
}

export async function toggleConversationMode({
  conversationId,
  mode,
}: {
  conversationId: string;
  mode: 'bot_activo' | 'humano_al_mando' | 'requiere_atencion';
}) {
  try {
    const db = getDb();
    const convRef = db.collection('conversaciones').doc(conversationId);
    const now = new Date();

    await convRef.set(
      {
        modo_atencion: mode,
        updated_at: now,
      },
      { merge: true }
    );

    const msgRef = convRef.collection('mensajes').doc();
    const notificationText =
      mode === 'humano_al_mando'
        ? '👤 La recepción tomó el control de la conversación (Bot pausado).'
        : mode === 'bot_activo'
        ? '🤖 Asistente virtual (Bot) reactivado.'
        : '⚠️ Marcado como: Requiere atención de recepción.';

    await msgRef.set({
      id: msgRef.id,
      conversation_id: conversationId,
      de: 'recepcion',
      texto: notificationText,
      timestamp: now,
      tipo: 'sistema',
    });

    return { success: true, mode };
  } catch (error: any) {
    console.error('Error toggling conversation mode:', error);
    return { success: false, error: error.message };
  }
}

export async function markConversationAsRead({ conversationId }: { conversationId: string }) {
  try {
    const db = getDb();
    await db.collection('conversaciones').doc(conversationId).set(
      {
        mensajes_no_leidos: 0,
        updated_at: new Date(),
      },
      { merge: true }
    );
    return { success: true };
  } catch (error: any) {
    console.error('Error marking conversation as read:', error);
    return { success: false, error: error.message };
  }
}

function sanitizeFirestoreData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data === 'object') {
    if (typeof data.toDate === 'function') {
      return data.toDate().toISOString();
    }
    if (data instanceof Date) {
      return data.toISOString();
    }
    if (Array.isArray(data)) {
      return data.map(sanitizeFirestoreData);
    }
    const result: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      result[key] = sanitizeFirestoreData(data[key]);
    }
    return result;
  }
  return data;
}

export async function getClientDetailsForChat({
  phone,
  clientId,
}: {
  phone?: string;
  clientId?: string;
}) {
  try {
    const db = getDb();
    const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);

    let clientDoc: any = null;

    // 1. Buscar por ID directo si viene
    if (clientId) {
      const docRef = await db.collection('clientes').doc(clientId).get();
      if (docRef.exists) {
        clientDoc = docRef;
      }
    }

    // 2. Si no se encontró por ID o no venía, buscar por teléfono
    if (!clientDoc && cleanPhone) {
      const directSnap = await db.collection('clientes').where('telefono', '==', phone).limit(1).get();
      if (!directSnap.empty) {
        clientDoc = directSnap.docs[0];
      } else {
        const cleanSnap = await db.collection('clientes').where('telefono', '==', cleanPhone).limit(1).get();
        if (!cleanSnap.empty) {
          clientDoc = cleanSnap.docs[0];
        } else {
          const clientsSnap = await db.collection('clientes').get();
          clientDoc = clientsSnap.docs.find((d) => {
            const p = (d.data().telefono || '').replace(/\D/g, '');
            return p.includes(cleanPhone);
          });
        }
      }
    }

    const resolvedClientId = clientDoc?.id || clientId;
    const clientData = clientDoc ? { id: clientDoc.id, ...clientDoc.data() } : null;

    // 3. Cargar profesionales para nombres legibles
    const profsSnap = await db.collection('profesionales').get();
    const profMap: Record<string, string> = {};
    profsSnap.docs.forEach((p) => {
      const pd = p.data();
      profMap[p.id] = pd.publicName || pd.name || 'Barbero';
    });

    // 4. Buscar todas las reservas del cliente
    let clientReservas: Array<any> = [];

    if (resolvedClientId) {
      const byClientSnap = await db.collection('reservas').where('cliente_id', '==', resolvedClientId).get();
      clientReservas = byClientSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    // Si también hay reservas registradas por teléfono sin cliente_id
    if (cleanPhone) {
      const allResSnap = await db.collection('reservas').get();
      const additional = allResSnap.docs
        .filter((d) => {
          const r = d.data();
          if (resolvedClientId && r.cliente_id === resolvedClientId) return false;
          const rp = (r.customer?.telefono || r.customerPhone || r.telefono || '').replace(/\D/g, '');
          return rp && rp.includes(cleanPhone);
        })
        .map((d) => ({ id: d.id, ...d.data() }));

      clientReservas = [...clientReservas, ...additional];
    }

    // 5. Calcular métricas dinámicas exactas coincidentes con la Ficha de Cliente
    const totalCitas = clientReservas.length;
    const citasAsistidas = clientReservas.filter((r) =>
      ['Asiste', 'Pagado', 'confirmada', 'Completado', 'asistida'].includes(r.estado)
    ).length;
    const citasNoAsistidas = clientReservas.filter((r) =>
      ['No asiste', 'no_asiste'].includes(r.estado)
    ).length;
    const citasCanceladas = clientReservas.filter((r) =>
      ['Cancelado', 'cancelada'].includes(r.estado)
    ).length;

    // 6. Consultar ventas y gasto total
    let totalSpent = 0;
    let totalCompras = 0;
    if (resolvedClientId) {
      try {
        const salesSnap = await db.collection('ventas').where('cliente_id', '==', resolvedClientId).get();
        const validSales = salesSnap.docs
          .map((d) => d.data())
          .filter((s) => !['Pendiente', 'Anulado', 'Cancelado'].includes(s.pago_estado || ''));
        totalCompras = validSales.length;
        totalSpent = validSales.reduce((acc, s) => {
          const amount =
            s.monto_pagado_real !== undefined && s.monto_pagado_real !== null
              ? Number(s.monto_pagado_real)
              : Number(s.total || 0);
          return acc + amount;
        }, 0);
      } catch (err) {
        console.error('Error fetching sales in getClientDetailsForChat:', err);
      }
    }

    // 7. Ordenar por fecha y hora descendente
    clientReservas.sort((a, b) => {
      const dateA = a.fecha ? new Date(`${a.fecha}T${a.hora_inicio || '00:00'}:00`).getTime() : 0;
      const dateB = b.fecha ? new Date(`${b.fecha}T${b.hora_inicio || '00:00'}:00`).getTime() : 0;
      return dateB - dateA;
    });

    // Enriquecer reservas recientes con nombres de barberos
    const enrichedRecent = clientReservas.slice(0, 10).map((r) => {
      let bName = r.professionalNames || r.barbero_nombre;
      if (!bName) {
        const bId = r.barbero_id || (r.items && r.items[0]?.barbero_id);
        if (bId && profMap[bId]) {
          bName = profMap[bId];
        }
      }
      return {
        ...r,
        professionalNames: bName || 'Barbero',
      };
    });

    // 8. Calcular barbero habitual y servicio más frecuente del cliente
    const barberCounts: Record<string, number> = {};
    const serviceCounts: Record<string, number> = {};
    let lastVisitDate: string | null = null;

    clientReservas.forEach((r) => {
      let bName = r.professionalNames || r.barbero_nombre;
      if (!bName) {
        const bId = r.barbero_id || (r.items && r.items[0]?.barbero_id);
        if (bId && profMap[bId]) bName = profMap[bId];
      }
      if (bName) barberCounts[bName] = (barberCounts[bName] || 0) + 1;

      const sName = r.servicio || (r.items && r.items[0]?.nombre);
      if (sName) serviceCounts[sName] = (serviceCounts[sName] || 0) + 1;

      if (!lastVisitDate && ['Asiste', 'Pagado', 'confirmada', 'Completado'].includes(r.estado) && r.fecha) {
        lastVisitDate = r.fecha;
      }
    });

    let frequentBarber = '';
    let maxBarberVisits = 0;
    for (const [b, count] of Object.entries(barberCounts)) {
      if (count > maxBarberVisits) {
        maxBarberVisits = count;
        frequentBarber = b;
      }
    }

    let frequentService = '';
    let maxServiceCount = 0;
    for (const [s, count] of Object.entries(serviceCounts)) {
      if (count > maxServiceCount) {
        maxServiceCount = count;
        frequentService = s;
      }
    }

    const enrichedClient = clientData
      ? {
          ...clientData,
          citas_totales: totalCitas,
          citas_asistidas: citasAsistidas,
          citas_no_asistidas: citasNoAsistidas,
          citas_canceladas: citasCanceladas,
          gasto_total: totalSpent,
          total_compras: totalCompras,
          barbero_habitual: frequentBarber,
          servicio_habitual: frequentService,
        }
      : null;

    return {
      success: true,
      client: sanitizeFirestoreData(enrichedClient),
      recentAppointments: sanitizeFirestoreData(enrichedRecent),
      totalSpent,
      totalCompras,
      frequentBarber,
      frequentBarberVisits: maxBarberVisits,
      frequentService,
      lastVisitDate,
      metrics: {
        total: totalCitas,
        asistidas: citasAsistidas,
        noAsistidas: citasNoAsistidas,
        canceladas: citasCanceladas,
      },
    };
  } catch (error: any) {
    console.error('Error getting client details:', error);
    return { success: false, error: error.message };
  }
}

export async function updateConversationTags({
  conversationId,
  tags,
}: {
  conversationId: string;
  tags: string[];
}) {
  try {
    const db = getDb();
    await db.collection('conversaciones').doc(conversationId).set(
      {
        etiquetas: tags,
        updated_at: new Date(),
      },
      { merge: true }
    );
    return { success: true };
  } catch (error: any) {
    console.error('Error updating conversation tags:', error);
    return { success: false, error: error.message };
  }
}

export async function sendInternalStaffNote({
  conversationId,
  noteText,
  staffName,
}: {
  conversationId: string;
  noteText: string;
  staffName?: string;
}) {
  try {
    const db = getDb();
    const convRef = db.collection('conversaciones').doc(conversationId);
    const now = new Date();

    const msgRef = convRef.collection('mensajes').doc();
    await msgRef.set({
      id: msgRef.id,
      conversation_id: conversationId,
      de: 'recepcion',
      texto: noteText,
      timestamp: now,
      tipo: 'nota_interna',
      estado: 'enviado',
      metadata: {
        staffName: staffName || 'Recepción',
        es_nota_interna: true,
      },
    });

    await convRef.set(
      {
        notas_internas: noteText,
        updated_at: now,
      },
      { merge: true }
    );

    return { success: true };
  } catch (error: any) {
    console.error('Error sending staff internal note:', error);
    return { success: false, error: error.message };
  }
}

export async function confirmReservationByStaff({ reservationId, staffName }: { reservationId: string; staffName?: string }) {
  try {
    const db = getDb();
    const now = new Date();
    await db.collection('reservas').doc(reservationId).update({
      estado: 'confirmada',
      confirmada_por_cliente: true,
      confirmada_en: now,
      confirmada_por: staffName || 'Recepción',
      etiqueta_recordatorio: 'confirmada',
      whatsappConfirmationSent: true,
      updated_at: now,
    });
    return { success: true };
  } catch (error: any) {
    console.error('Error confirming reservation by staff:', error);
    return { success: false, error: error.message };
  }
}

export async function exportClientsToVCard() {
  try {
    const db = getDb();
    const snap = await db.collection('clientes').get();

    let vcfString = '';
    let count = 0;

    snap.docs.forEach((doc) => {
      const c = doc.data();
      const nombre = (c.nombre || '').trim();
      const apellido = (c.apellido || '').trim();
      const fullName = (nombre + ' ' + apellido).trim() || 'Cliente VATOS ALFA';
      const telefono = (c.telefono || '').replace(/[^0-9+]/g, '');
      const email = (c.correo || c.email || '').trim();

      if (!telefono && !nombre) return;

      count++;
      vcfString += 'BEGIN:VCARD\r\n';
      vcfString += 'VERSION:3.0\r\n';
      vcfString += 'FN:' + fullName + '\r\n';
      vcfString += 'N:' + apellido + ';' + nombre + ';;;\r\n';
      if (telefono) {
        vcfString += 'TEL;TYPE=CELL:' + telefono + '\r\n';
      }
      if (email) {
        vcfString += 'EMAIL:' + email + '\r\n';
      }
      vcfString += 'ORG:VATOS ALFA Barber Shop\r\n';
      vcfString += 'NOTE:Exportado desde Agenda VATOS ALFA\r\n';
      vcfString += 'END:VCARD\r\n';
    });

    return {
      success: true,
      count,
      vcfContent: vcfString,
    };
  } catch (error: any) {
    console.error('Error exporting clients to vCard:', error);
    return { success: false, error: error.message };
  }
}

export async function deleteConversation(conversationId: string) {
  try {
    const db = getDb();
    const convRef = db.collection('conversaciones').doc(conversationId);

    // Delete all messages in the subcollection
    const messagesSnap = await convRef.collection('mensajes').get();
    const batch = db.batch();
    messagesSnap.docs.forEach((d) => {
      batch.delete(d.ref);
    });
    batch.delete(convRef);
    await batch.commit();

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting conversation:', error);
    return { success: false, error: error.message };
  }
}

