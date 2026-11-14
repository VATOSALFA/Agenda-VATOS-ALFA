import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  DocumentReference,
  FieldValue,
  Firestore,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { format } from 'date-fns';
import type {
  Client,
  Local,
  Product,
  Profesional,
  Reservation,
  Service,
  TimeBlock,
} from '@/lib/types';
import { formatMoney } from '@/lib/utils';
import { isClientWithApp } from '@/lib/client-app-helper';
import {
  evaluateActiveCoinsMultiplier,
  evaluateClientAlfaTier,
  evaluatePaseAlfaStampsForSale,
  getCurrentHaircutPrice,
  type SaleLoyaltySnapshot,
} from '@/lib/benefit-security';
import { getEffectiveBarberDaySchedule } from '@/lib/scheduling/schedule-engine';
import { logAuditAction } from '@/lib/audit-logger';

// ============================================================================
// 1. UTILIDADES GENERALES Y LIMPIEZA FIRESTORE
// ============================================================================

function isFirestoreAtomicValue(val: any): boolean {
  if (!val || typeof val !== 'object') return false;
  return (
    val instanceof Date ||
    val instanceof Timestamp ||
    val instanceof FieldValue ||
    val instanceof DocumentReference ||
    typeof val.toDate === 'function' ||
    typeof val._methodName === 'string'
  );
}

export function cleanFirestoreObject(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (isFirestoreAtomicValue(obj)) return obj;
  if (Array.isArray(obj)) return obj.map(cleanFirestoreObject);
  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] =
        typeof value === 'object' && value !== null && !isFirestoreAtomicValue(value)
          ? cleanFirestoreObject(value)
          : value;
    }
  }
  return cleaned;
}

export function isAutomatedBranch(local: Local | null | undefined): boolean {
  return Boolean(local && local.modoOperacion === 'sin_recepcionista');
}

export function parseTimeToMinutes(timeStr?: string | null): number {
  if (!timeStr) return 0;
  const [h, m] = String(timeStr).split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

export function formatMinutesToTime(totalMins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getQrImageUrl(dataUrl: string, size = 220): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(dataUrl)}`;
}

// Sonidos Web Audio nativos para Kiosco y Mini-Tablet de Estación (0 dependencias externas)
export function playSmartChime(kind: 'checkin' | 'payment_ok' | 'alert' | 'tap' = 'checkin') {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const playNote = (freq: number, startOffset: number, duration: number, type: OscillatorType = 'sine', vol = 0.22) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);
      gain.gain.setValueAtTime(vol, ctx.currentTime + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + startOffset);
      osc.stop(ctx.currentTime + startOffset + duration);
    };

    if (kind === 'checkin') {
      playNote(587.33, 0, 0.16, 'sine', 0.25); // D5
      playNote(880.0, 0.14, 0.28, 'sine', 0.28); // A5
      playNote(1174.66, 0.3, 0.35, 'sine', 0.24); // D6
    } else if (kind === 'payment_ok') {
      playNote(659.25, 0, 0.12, 'sine', 0.22); // E5
      playNote(880.0, 0.11, 0.14, 'sine', 0.24); // A5
      playNote(1318.51, 0.23, 0.32, 'sine', 0.26); // E6
    } else if (kind === 'alert') {
      playNote(320, 0, 0.18, 'triangle', 0.25);
      playNote(260, 0.19, 0.24, 'triangle', 0.25);
    } else {
      playNote(740, 0, 0.06, 'sine', 0.12);
    }
  } catch {
    // Ignore browser autoplay blocks
  }
}

// ============================================================================
// 2. ECOSISTEMA APP-FIRST: COMUNICACIÓN DIRECTA EN EL CHAT DE JANETH (APP MÓVIL)
// ============================================================================

export function resolveClientConversationId(client: Pick<Client, 'id' | 'telefono'>): string {
  const cleanDigits = String(client.telefono || '').replace(/\D/g, '').slice(-10);
  if (cleanDigits.length === 10) return cleanDigits;
  return String(client.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

export async function sendJanethAppNotification(params: {
  db: Firestore;
  client: Client;
  message: string;
  actionType?: string;
  reservationId?: string;
  saleId?: string;
  requireHumanAttention?: boolean;
  tags?: string[];
}) {
  const {
    db,
    client,
    message,
    actionType = 'smart_branch_notification',
    reservationId,
    saleId,
    requireHumanAttention = false,
    tags = [],
  } = params;

  try {
    const convId = resolveClientConversationId(client);
    if (!convId) return;

    const convRef = doc(db, 'conversaciones', convId);
    const existingSnap = await getDoc(convRef).catch(() => null);
    const existingData = existingSnap?.exists() ? existingSnap.data() : null;

    const fullName = `${client.nombre || ''} ${client.apellido || ''}`.trim() || 'Cliente VATOS ALFA';
    const cleanPhone = String(client.telefono || '').replace(/\D/g, '').slice(-10);

    const nextMode = requireHumanAttention
      ? 'requiere_atencion'
      : existingData?.modo_atencion || 'bot_activo';

    const convPayload: Record<string, any> = {
      cliente_id: client.id,
      cliente_nombre: fullName,
      cliente_telefono: cleanPhone || client.telefono || '',
      canal: 'app',
      ultimo_mensaje: message.slice(0, 220),
      fecha_ultimo_mensaje: serverTimestamp(),
      updated_at: serverTimestamp(),
      modo_atencion: nextMode,
      ...(requireHumanAttention
        ? {
            requiere_atencion_humana: true,
            mensajes_no_leidos: increment(1),
          }
        : {}),
      ...(tags.length > 0 ? { etiquetas: arrayUnion(...tags) } : {}),
    };

    if (!existingSnap?.exists()) {
      convPayload.created_at = serverTimestamp();
      convPayload.mensajes_no_leidos = requireHumanAttention ? 1 : 0;
    }

    await setDoc(convRef, cleanFirestoreObject(convPayload), { merge: true });

    const msgRef = doc(collection(db, 'conversaciones', convId, 'mensajes'));
    await setDoc(
      msgRef,
      cleanFirestoreObject({
        id: msgRef.id,
        conversation_id: convId,
        de: 'bot',
        texto: message,
        timestamp: serverTimestamp(),
        tipo: 'texto',
        estado: 'enviado',
        metadata: {
          botName: 'Janeth',
          automatedBranchNotification: true,
          action_type: actionType,
          reservation_id: reservationId || null,
          sale_id: saleId || null,
        },
      })
    );
  } catch (err) {
    console.warn('No se pudo enviar mensaje automático al chat de Janeth en la App:', err);
  }
}

export async function notifyClientCheckInInApp(params: {
  db: Firestore;
  client: Client;
  localName: string;
  barberName: string;
  stationNumber?: string;
  paidAtKiosk: boolean;
  totalAmount: number;
  reservationId?: string;
}) {
  const { db, client, localName, barberName, stationNumber, paidAtKiosk, totalAmount, reservationId } = params;
  const stationLabel = stationNumber ? ` (Estación ${stationNumber})` : '';
  const paymentNote = paidAtKiosk
    ? `Tu pago por $${formatMoney(totalAmount)} MXN ya quedó registrado.`
    : `El total estimado de tu servicio es $${formatMoney(totalAmount)} MXN.`;

  const text = `¡Bienvenido a ${localName}, ${client.nombre}! Ya registramos tu llegada y avisamos a ${barberName}${stationLabel}. ${paymentNote} Toma asiento un momento, enseguida te llamamos por tu nombre.`;

  await sendJanethAppNotification({
    db,
    client,
    message: text,
    actionType: 'kiosco_checkin',
    reservationId,
  });
}

export async function notifyClientDigitalReceiptInApp(params: {
  db: Firestore;
  client: Client;
  localName: string;
  barberName: string;
  items: { nombre: string; cantidad: number; subtotal: number }[];
  totalPaid: number;
  tipAmount: number;
  paymentMethodLabel: string;
  stampsAdded?: number;
  currentStamps?: number;
  targetStamps?: number;
  coinsEarned?: number;
  saleId: string;
  reservationId?: string;
}) {
  const {
    db,
    client,
    localName,
    barberName,
    items,
    totalPaid,
    tipAmount,
    paymentMethodLabel,
    stampsAdded = 0,
    currentStamps = 0,
    targetStamps = 9,
    coinsEarned = 0,
    saleId,
    reservationId,
  } = params;

  const hasApp = isClientWithApp(client);
  const itemsSummary = items
    .map((i) => `• ${i.cantidad}x ${i.nombre} ($${formatMoney(i.subtotal)})`)
    .join('\n');

  const tipLine = tipAmount > 0 ? `\nPropina para ${barberName}: $${formatMoney(tipAmount)} MXN` : '';
  const loyaltyLine = hasApp
    ? `\n\nPase Alfa: ${stampsAdded > 0 ? `+${stampsAdded} sello acreditado (${currentStamps}/${targetStamps})` : `Sellos actuales: ${currentStamps}/${targetStamps}`}${coinsEarned > 0 ? ` • +${coinsEarned} AlfaCoins abonados` : ''}.`
    : `\n\nDescarga la App Móvil VATOS ALFA e inicia sesión con tu número para activar tu Pase Alfa, acumular sellos para cortes gratis y recibir AlfaCoins.`;

  const text =
    `Comprobante Digital VATOS ALFA — ${localName}\n` +
    `Folio: #${saleId.slice(0, 8).toUpperCase()}\n` +
    `Atendido por: ${barberName}\n\n` +
    `${itemsSummary}\n` +
    `Total servicio/productos: $${formatMoney(totalPaid)} MXN` +
    `${tipLine}\n` +
    `Método: ${paymentMethodLabel}` +
    `${loyaltyLine}\n\n` +
    `¿Algo por mejorar en tu corte? Cuentas con garantía directa escribiéndome por este chat.`;

  await sendJanethAppNotification({
    db,
    client,
    message: text,
    actionType: 'digital_receipt',
    saleId,
    reservationId,
  });
}

export async function notifyClientNoShowAntiFraudInApp(params: {
  db: Firestore;
  client: Client;
  localName: string;
  barberName: string;
  horaInicio: string;
  reasonLabel: 'No asistió' | 'Cancelada';
  reservationId: string;
}) {
  const { db, client, localName, barberName, horaInicio, reasonLabel, reservationId } = params;
  const text =
    `Hola ${client.nombre}, se acaba de registrar tu cita de las ${horaInicio} hrs con ${barberName} en ${localName} como "${reasonLabel}".\n\n` +
    `Por control de calidad: si en realidad SÍ asististe y recibiste tu servicio en sucursal, respóndeme "SÍ ASISTÍ" aquí mismo en el chat de la App y te regalaremos tu próximo corte de cortesía.`;

  await sendJanethAppNotification({
    db,
    client,
    message: text,
    actionType: 'antifraud_noshow_verification',
    reservationId,
    tags: ['auditoria_inasistencia'],
  });
}

export async function escalateKioskHelpToCentral(params: {
  db: Firestore;
  localName: string;
  localId: string;
  visitorName: string;
  visitorPhone: string;
  topic: string;
}) {
  const { db, localName, localId, visitorName, visitorPhone, topic } = params;
  const cleanPhone = String(visitorPhone || '').replace(/\D/g, '').slice(-10);
  const convId = cleanPhone.length === 10 ? cleanPhone : `kiosco_${localId}_${Date.now().toString().slice(-6)}`;

  const convRef = doc(db, 'conversaciones', convId);
  const alertText = `[Solicitud desde Kiosco ${localName}] ${visitorName || 'Cliente en sucursal'} (${cleanPhone || 'Sin teléfono'}): ${topic}`;

  await setDoc(
    convRef,
    cleanFirestoreObject({
      cliente_nombre: visitorName || `Visitante Kiosco (${localName})`,
      cliente_telefono: cleanPhone || '',
      canal: 'app',
      ultimo_mensaje: alertText.slice(0, 220),
      fecha_ultimo_mensaje: serverTimestamp(),
      updated_at: serverTimestamp(),
      modo_atencion: 'requiere_atencion',
      requiere_atencion_humana: true,
      mensajes_no_leidos: increment(1),
      etiquetas: arrayUnion('ayuda_kiosco'),
    }),
    { merge: true }
  );

  const msgRef = doc(collection(db, 'conversaciones', convId, 'mensajes'));
  await setDoc(msgRef, {
    id: msgRef.id,
    conversation_id: convId,
    de: 'sistema',
    texto: alertText,
    timestamp: serverTimestamp(),
    tipo: 'sistema',
    estado: 'enviado',
    metadata: {
      action_type: 'kiosco_help_request',
      local_id: localId,
      local_name: localName,
    },
  });

  await logAuditAction({
    action: 'SOLICITUD_AYUDA_KIOSCO',
    details: alertText,
    userId: 'kiosco',
    userName: visitorName || 'Cliente en Kiosco',
    userRole: 'Kiosco',
    severity: 'info',
    localId,
  });
}

// ============================================================================
// 3. IDENTIFICACIÓN DE CLIENTES POR QR DE LA APP O TELÉFONO
// ============================================================================

export async function resolveClientFromQrOrInput(params: {
  db: Firestore;
  rawInput: string;
  clientsCache?: Client[];
}): Promise<{ client: Client | null; parsedPhone?: string; error?: string }> {
  const { db, rawInput, clientsCache = [] } = params;
  const raw = String(rawInput || '').trim();
  if (!raw) return { client: null, error: 'Ingresa tu número o escanea tu código QR.' };

  let clientIdToSearch = '';
  let phoneToSearch = '';
  let clientNumberToSearch = '';

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      clientIdToSearch = String(parsed.clientId || parsed.id || '').trim();
      phoneToSearch = String(parsed.phone || parsed.clientPhone || parsed.telefono || '').trim();
    }
  } catch {
    const digitsOnly = raw.replace(/\D/g, '');
    if (digitsOnly.length >= 10) {
      phoneToSearch = digitsOnly.slice(-10);
    } else if (/^\d{1,5}$/.test(raw)) {
      clientNumberToSearch = raw;
    } else if (raw.length >= 15 && !raw.includes(' ')) {
      clientIdToSearch = raw;
    }
  }

  // 1. Buscar rápido en caché en memoria si está disponible
  if (clientsCache.length > 0) {
    if (clientIdToSearch) {
      const foundById = clientsCache.find((c) => c.id === clientIdToSearch);
      if (foundById) return { client: foundById, parsedPhone: foundById.telefono };
    }
    if (phoneToSearch) {
      const cleanTarget = phoneToSearch.replace(/\D/g, '').slice(-10);
      const foundByPhone = clientsCache.find(
        (c) => String(c.telefono || '').replace(/\D/g, '').slice(-10) === cleanTarget
      );
      if (foundByPhone) return { client: foundByPhone, parsedPhone: cleanTarget };
    }
    if (clientNumberToSearch) {
      const foundByNum = clientsCache.find(
        (c) => String(c.numero_cliente || '') === clientNumberToSearch
      );
      if (foundByNum) return { client: foundByNum, parsedPhone: foundByNum.telefono };
    }
  }

  // 2. Respaldo directo en Firestore
  if (clientIdToSearch) {
    const snap = await getDoc(doc(db, 'clientes', clientIdToSearch));
    if (snap.exists()) {
      const cl = { id: snap.id, ...snap.data() } as Client;
      return { client: cl, parsedPhone: cl.telefono };
    }
  }

  if (phoneToSearch) {
    const cleanPhone = phoneToSearch.replace(/\D/g, '').slice(-10);
    const q1 = query(collection(db, 'clientes'), where('telefono', '==', cleanPhone));
    const snap1 = await getDocs(q1);
    if (!snap1.empty) {
      const cl = { id: snap1.docs[0].id, ...snap1.docs[0].data() } as Client;
      return { client: cl, parsedPhone: cleanPhone };
    }
    const q2 = query(collection(db, 'clientes'), where('telefono', '==', `+52${cleanPhone}`));
    const snap2 = await getDocs(q2);
    if (!snap2.empty) {
      const cl = { id: snap2.docs[0].id, ...snap2.docs[0].data() } as Client;
      return { client: cl, parsedPhone: cleanPhone };
    }
    return { client: null, parsedPhone: cleanPhone };
  }

  return { client: null, error: 'No encontramos un perfil vinculado a ese dato.' };
}

// ============================================================================
// 4. DISPONIBILIDAD EN TIEMPO REAL Y ASIGNACIÓN DE WALK-INS ("SIN CITA")
// ============================================================================

export interface BarberRealtimeAvailability {
  barber: Profesional;
  worksToday: boolean;
  canPerformAllSelected: boolean;
  isCurrentlyInChair: boolean;
  waitingQueueCount: number;
  completedTodayCount: number;
  canFitBeforeClosing: boolean;
  waitMinutes: number;
  earliestStartStr: string;
  estimatedEndStr: string;
  statusLabel: string;
}

export function calculateRealTimeBarberAvailability(params: {
  barbers: Profesional[];
  local: Local | null | undefined;
  selectedServices: Service[];
  todayReservations: Reservation[];
  todayTimeBlocks: TimeBlock[];
  specialJourneys?: any[];
  now?: Date;
}): {
  availabilities: BarberRealtimeAvailability[];
  firstAvailable: BarberRealtimeAvailability | null;
} {
  const {
    barbers,
    local,
    selectedServices,
    todayReservations,
    todayTimeBlocks,
    specialJourneys = [],
    now = new Date(),
  } = params;

  const totalBaseDuration = Math.max(
    15,
    selectedServices.reduce((acc, s) => acc + (Number(s.duration) || 30), 0)
  );
  const nowMins = now.getHours() * 60 + now.getMinutes();
  // Redondear inicio inmediato al próximo múltiplo de 5 min para horarios limpios en agenda
  const roundedNowMins = Math.ceil(nowMins / 5) * 5;

  const availabilities: BarberRealtimeAvailability[] = barbers
    .filter((b) => b.active && !b.deleted)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .map((barber) => {
      // Duración personalizada por profesional si existe
      const durationForBarber =
        selectedServices.length > 0
          ? selectedServices.reduce((acc, s) => {
              const customDur = s.durationPorProfesional?.[barber.id];
              return acc + (Number(customDur ?? s.duration) || 30);
            }, 0)
          : totalBaseDuration;

      const canPerformAllSelected =
        selectedServices.length === 0 ||
        selectedServices.every((s) => {
          const profServices = Array.isArray(barber.services) ? barber.services : [];
          if (profServices.length === 0 && (!s.professionals || s.professionals.length === 0)) {
            return true;
          }
          return (
            profServices.includes(s.id) ||
            (Array.isArray(s.professionals) && s.professionals.includes(barber.id))
          );
        });

      const effSchedule = getEffectiveBarberDaySchedule({
        barber,
        date: now,
        localSchedule: local?.schedule,
        specialJourneys,
      });

      const worksToday = Boolean(effSchedule && effSchedule.enabled);
      if (!worksToday || !canPerformAllSelected) {
        return {
          barber,
          worksToday,
          canPerformAllSelected,
          isCurrentlyInChair: false,
          waitingQueueCount: 0,
          completedTodayCount: 0,
          canFitBeforeClosing: false,
          waitMinutes: 9999,
          earliestStartStr: '--:--',
          estimatedEndStr: '--:--',
          statusLabel: !canPerformAllSelected ? 'No realiza este servicio' : 'Fuera de turno hoy',
        };
      }

      const shiftStartMins = parseTimeToMinutes(effSchedule.start || '10:00');
      const shiftEndMins = parseTimeToMinutes(effSchedule.end || '21:00');

      const barberRes = todayReservations.filter((r) => r.barbero_id === barber.id);
      const completedTodayCount = barberRes.filter((r) => r.estado === 'Asiste').length;
      const isCurrentlyInChair = barberRes.some((r) => r.estado === 'En atención');
      const waitingQueueCount = barberRes.filter((r) => r.estado === 'En espera').length;

      // Construir intervalos ocupados reales (excluyendo canceladas, inasistencias y cortes ya terminados 'Asiste')
      const busyIntervals: { start: number; end: number }[] = [];

      // Descansos (breaks) del horario del barbero
      if (Array.isArray(effSchedule.breaks)) {
        effSchedule.breaks.forEach((brk: any) => {
          const bs = parseTimeToMinutes(brk.start);
          const be = parseTimeToMinutes(brk.end);
          if (bs < be) busyIntervals.push({ start: bs, end: be });
        });
      }

      // Bloqueos de horario activos en agenda
      todayTimeBlocks
        .filter((tb) => tb.barbero_id === barber.id && tb.type !== 'available')
        .forEach((tb) => {
          const bs = parseTimeToMinutes(tb.hora_inicio);
          const be = parseTimeToMinutes(tb.hora_fin);
          if (bs < be) busyIntervals.push({ start: bs, end: be });
        });

      // Reservas activas de hoy
      barberRes.forEach((r) => {
        const st = String(r.estado || '').toLowerCase();
        if (
          st === 'cancelado' ||
          st === 'cancelada' ||
          st === 'no asiste' ||
          st === 'asiste'
        ) {
          return;
        }
        let rs = parseTimeToMinutes(r.hora_inicio);
        let re = parseTimeToMinutes(r.hora_fin);
        if (re <= rs) re = rs + 30;

        // Si está actualmente en sillón y ya se pasó un poco de su hora_fin estimada, dar margen mínimo de 8 min desde ahora
        if (r.estado === 'En atención' && re <= nowMins) {
          re = nowMins + 8;
        }
        // Si un cliente está 'En espera' de un turno que empezaba hace unos minutos y aún no pasa, empujar su ventana desde ahora
        if (r.estado === 'En espera' && re <= nowMins) {
          const dur = Math.max(20, re - rs);
          rs = nowMins;
          re = nowMins + dur;
        }

        if (re > nowMins) {
          busyIntervals.push({ start: rs, end: re });
        }
      });

      busyIntervals.sort((a, b) => a.start - b.start);

      // Buscar el primer hueco continuo de `durationForBarber` minutos a partir de max(roundedNowMins, shiftStartMins)
      let candidateStart = Math.max(roundedNowMins, shiftStartMins);

      let foundSlot = false;
      while (candidateStart + durationForBarber <= shiftEndMins) {
        const candidateEnd = candidateStart + durationForBarber;
        const overlapping = busyIntervals.find(
          (iv) => candidateStart < iv.end && candidateEnd > iv.start
        );
        if (!overlapping) {
          foundSlot = true;
          break;
        }
        // Saltar al final del bloqueo/cita con redondeo a 5 min
        candidateStart = Math.ceil(overlapping.end / 5) * 5;
      }

      if (!foundSlot) {
        return {
          barber,
          worksToday: true,
          canPerformAllSelected: true,
          isCurrentlyInChair,
          waitingQueueCount,
          completedTodayCount,
          canFitBeforeClosing: false,
          waitMinutes: 9999,
          earliestStartStr: '--:--',
          estimatedEndStr: '--:--',
          statusLabel: 'Agenda llena hoy',
        };
      }

      const waitMinutes = Math.max(0, candidateStart - nowMins);
      const earliestStartStr = formatMinutesToTime(candidateStart);
      const estimatedEndStr = formatMinutesToTime(candidateStart + durationForBarber);

      const statusLabel =
        waitMinutes <= 5
          ? 'Disponible ahora mismo'
          : `Disponible ~${waitMinutes} min (${earliestStartStr})`;

      return {
        barber,
        worksToday: true,
        canPerformAllSelected: true,
        isCurrentlyInChair,
        waitingQueueCount,
        completedTodayCount,
        canFitBeforeClosing: true,
        waitMinutes,
        earliestStartStr,
        estimatedEndStr,
        statusLabel,
      };
    });

  const eligible = availabilities
    .filter((a) => a.worksToday && a.canPerformAllSelected && a.canFitBeforeClosing)
    .sort((a, b) => {
      if (a.waitMinutes !== b.waitMinutes) return a.waitMinutes - b.waitMinutes;
      if (a.waitingQueueCount !== b.waitingQueueCount) return a.waitingQueueCount - b.waitingQueueCount;
      return a.completedTodayCount - b.completedTodayCount;
    });

  return {
    availabilities,
    firstAvailable: eligible[0] || null,
  };
}

// ============================================================================
// 5. MOTOR TRANSACCIONAL DE COBRO INTELIGENTE (KIOSCO Y ESTACIÓN) + LEALTAD
// ============================================================================

export interface SmartCartItem {
  id: string;
  nombre: string;
  precio: number;
  cantidad: number;
  tipo: 'servicio' | 'producto';
  barbero_id: string;
  duracion?: number;
  presentation_id?: string;
  pagado_en_kiosco?: boolean;
  bloqueado_kiosco?: boolean;
}

export async function finalizeSmartSaleLoyalty(params: {
  db: Firestore;
  client: Client;
  cartItems: SmartCartItem[];
  saleTotal: number;
  anticipoPagado?: number;
  saleId: string;
  allServices?: Service[];
}): Promise<{
  stampsAdded: number;
  currentStamps: number;
  targetStamps: number;
  coinsEarned: number;
}> {
  const { db, client, cartItems, saleTotal, anticipoPagado = 0, saleId, allServices = [] } = params;

  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');
  const hasApp = isClientWithApp(client);

  let targetStampsConfig = 9;
  let nivelesConfig: any = null;
  let coinsMult = 1;

  try {
    const paseSnap = await getDoc(doc(db, 'configuracion', 'pase_alfa'));
    if (paseSnap.exists()) {
      const pData = paseSnap.data();
      const sReq = Number(pData.sellosRequeridos || 10);
      targetStampsConfig = sReq === 10 ? 9 : Math.max(1, sReq);
      nivelesConfig = pData.niveles_config || null;
      if (pData.multiplicador_coins_config) {
        const multEval = evaluateActiveCoinsMultiplier(pData.multiplicador_coins_config, now);
        coinsMult = multEval.multiplier || 1;
      }
    }
  } catch {
    // Default values
  }

  const currentHaircutPrice = getCurrentHaircutPrice(allServices) || 140;
  const realMoneySpent = Math.max(0, Math.round((saleTotal + Number(anticipoPagado || 0)) * 100) / 100);
  const hasServiceInCart = cartItems.some((it) => it.tipo === 'servicio');

  const freshClientSnap = await getDoc(doc(db, 'clientes', client.id)).catch(() => null);
  const freshClient = freshClientSnap?.exists()
    ? ({ id: freshClientSnap.id, ...freshClientSnap.data() } as Client)
    : client;

  const alreadyCountedToday = (freshClient as any).ultima_visita_fecha === todayStr;
  const visitDelta = hasServiceInCart && !alreadyCountedToday ? 1 : 0;

  const prevEvaluated = evaluateClientAlfaTier(freshClient, nivelesConfig, {
    forceEvaluateWhenPaused: true,
  });
  const nextEvaluated = evaluateClientAlfaTier(freshClient, nivelesConfig, {
    overrideVisits: prevEvaluated.visitasHistoricas + visitDelta,
    overrideSpend: Math.round((prevEvaluated.consumoHistorico + realMoneySpent) * 100) / 100,
    forceEvaluateWhenPaused: true,
  });

  const currStamps = Number(freshClient.cortes_acumulados ?? freshClient.cortesAcumulados ?? 0);
  let nextStamps = currStamps;
  let stampsAdded = 0;
  let pointsEarned = 0;

  const loyaltySnapshot: SaleLoyaltySnapshot = {
    aplicado: true,
    cliente_id: freshClient.id,
    fecha_dia: todayStr,
    consumo_real_sumado: realMoneySpent,
    visita_asistida_sumada: visitDelta,
    prev_ultima_visita_fecha: String((freshClient as any).ultima_visita_fecha || ''),
    visita_elegible_sumada: 0,
    alfa_coins_ganados: 0,
    alfa_coins_canjeados: 0,
    multiplicador_aplicado: coinsMult,
    sellos_ganados: 0,
    corte_gratis_canjeado: false,
    prev_cortes_acumulados: currStamps,
    prev_corte_gratis_disponible: Boolean((freshClient as any).corte_gratis_disponible),
    prev_ultimo_sello_fecha: String((freshClient as any).ultimo_sello_fecha ?? ''),
    prev_nivel: prevEvaluated.tierName,
    new_nivel: nextEvaluated.tierName,
  };

  const clientUpdatePayload: Record<string, any> = {};

  if (hasApp && nextEvaluated.tierName && nextEvaluated.tierName !== 'Sin Nivel') {
    clientUpdatePayload.nivel = nextEvaluated.tierName;
  }

  if (realMoneySpent > 0) {
    clientUpdatePayload.consumo_total = increment(realMoneySpent);
    clientUpdatePayload.gasto_total = increment(realMoneySpent);
    clientUpdatePayload.consumoTotal = increment(realMoneySpent);
    if (hasApp) {
      clientUpdatePayload.consumo_pase_alfa = increment(realMoneySpent);
    }
  }

  if (visitDelta > 0) {
    clientUpdatePayload.citas_asistidas = increment(1);
    clientUpdatePayload.visitas_totales = increment(1);
    clientUpdatePayload.ultima_visita_fecha = todayStr;
    if (hasApp) {
      clientUpdatePayload.visitas_pase_alfa = increment(1);
    }
  }

  if (hasApp) {
    pointsEarned = saleTotal > 0 ? Math.floor(saleTotal) * coinsMult : 0;
    loyaltySnapshot.alfa_coins_ganados = pointsEarned;

    if (pointsEarned > 0) {
      clientUpdatePayload.puntos = increment(pointsEarned);
      clientUpdatePayload.alfaCoins = increment(pointsEarned);
      clientUpdatePayload.alfa_coins = increment(pointsEarned);
      clientUpdatePayload.puntosLealtad = increment(pointsEarned);
      clientUpdatePayload.puntos_lealtad = increment(pointsEarned);
    }

    const stampEval = evaluatePaseAlfaStampsForSale({
      client: freshClient,
      hasAppDownloaded: true,
      cart: cartItems,
      realMoneySpent,
      currentHaircutPrice,
      targetStamps: targetStampsConfig,
      todayStr,
      appliedBenefit: null,
    });

    stampsAdded = stampEval.stampsToAward;
    loyaltySnapshot.sellos_ganados = stampsAdded;

    if (stampsAdded > 0) {
      nextStamps = Math.min(targetStampsConfig, currStamps + stampsAdded);
      clientUpdatePayload.cortes_acumulados = nextStamps;
      clientUpdatePayload.corte_gratis_disponible = nextStamps >= targetStampsConfig;
      clientUpdatePayload.ultimo_sello_fecha = todayStr;
      clientUpdatePayload.visitas_elegibles_historicas = increment(1);
      loyaltySnapshot.visita_elegible_sumada = 1;
    } else {
      clientUpdatePayload.ultimo_sello_fecha = (freshClient as any).ultimo_sello_fecha ?? '';
    }

    if (stampsAdded > 0 || pointsEarned > 0) {
      const prevCoins = Number(
        freshClient.alfaCoins ??
          freshClient.alfa_coins ??
          freshClient.puntos_lealtad ??
          freshClient.puntosLealtad ??
          freshClient.puntos ??
          0
      );
      const rewardId = `reward_${Date.now()}`;
      loyaltySnapshot.recompensa_pendiente_id = rewardId;
      clientUpdatePayload.recompensa_pendiente = {
        id: rewardId,
        sello_agregado: stampsAdded > 0,
        sellos_ganados: stampsAdded,
        sellos_anteriores: currStamps,
        sellos_actuales: nextStamps,
        meta_sellos: targetStampsConfig,
        corte_gratis_desbloqueado: nextStamps >= targetStampsConfig,
        coins_ganadas: pointsEarned,
        multiplicador_aplicado: coinsMult,
        coins_anteriores: prevCoins,
        coins_actuales: prevCoins + pointsEarned,
        fecha: new Date().toISOString(),
      };
    }
  }

  if (Object.keys(clientUpdatePayload).length > 0) {
    await updateDoc(doc(db, 'clientes', freshClient.id), clientUpdatePayload).catch((err) => {
      console.warn('Error actualizando lealtad en Smart Branch:', err);
    });
  }

  await updateDoc(doc(db, 'ventas', saleId), {
    lealtad_aplicada: cleanFirestoreObject(loyaltySnapshot),
  }).catch(() => {});

  return {
    stampsAdded,
    currentStamps: nextStamps,
    targetStamps: targetStampsConfig,
    coinsEarned: pointsEarned,
  };
}

export async function createSmartSaleRecord(params: {
  db: Firestore;
  local: Local;
  client: Client;
  cartItems: SmartCartItem[];
  fullReservationItems?: SmartCartItem[];
  paymentMethod: 'efectivo' | 'tarjeta' | 'mercadopago' | 'transferencia';
  pagoEstadoInitial: 'Pagado' | 'Pendiente';
  origin: 'kiosco' | 'estacion';
  tipAmount: number;
  tipMethod?: 'efectivo' | 'tarjeta' | 'mercadopago' | 'transferencia';
  anticipoPagado?: number;
  reservationId?: string;
  collectedByBarber?: Profesional | null;
  staffUserId?: string;
  staffUserName?: string;
  isComplementaryExtraSale?: boolean;
  allServices?: Service[];
}): Promise<{ saleId: string; netAmountCharged: number; cashRetainedByBarber: number }> {
  const {
    db,
    local,
    client,
    cartItems,
    fullReservationItems,
    paymentMethod,
    pagoEstadoInitial,
    origin,
    tipAmount = 0,
    tipMethod,
    anticipoPagado = 0,
    reservationId,
    collectedByBarber = null,
    staffUserId = 'smart_branch',
    staffUserName = 'Sucursal Automatizada',
    isComplementaryExtraSale = false,
    allServices = [],
  } = params;

  const subtotal = cartItems.reduce((acc, item) => acc + (Number(item.precio) || 0) * (Number(item.cantidad) || 1), 0);
  const netAmountCharged = Math.max(0, Math.round((subtotal - Number(anticipoPagado || 0)) * 100) / 100);
  const cleanTip = Math.max(0, Math.round(Number(tipAmount || 0) * 100) / 100);
  const effectiveTipMethod = tipMethod || paymentMethod;

  // Regla de Caja Individual por Barbero:
  // Si un barbero cobra EFECTIVO en su estación, ese importe de venta queda retenido en su caja individual
  // para descontarse automáticamente en su liquidación semanal de comisiones.
  // La propina en efectivo NO se suma a efectivo_retenido_barbero porque ya le pertenece al 100% al barbero,
  // y marcamos tipPaid = true para que Administración NO se la pague doble al liquidar comisiones.
  const isBarberCashCollection =
    origin === 'estacion' && paymentMethod === 'efectivo' && Boolean(collectedByBarber?.id);
  const cashRetainedByBarber = isBarberCashCollection ? netAmountCharged : 0;
  const isCashTipKeptDirectlyByBarber =
    origin === 'estacion' && effectiveTipMethod === 'efectivo' && cleanTip > 0;

  const currentHaircutPrice = getCurrentHaircutPrice(allServices) || 140;

  // Buscar anticipo previo no absorbido si aplica
  let unabsorbedDepositSaleId: string | null = null;
  if (reservationId && !isComplementaryExtraSale && Number(anticipoPagado) > 0) {
    try {
      const qDep = query(collection(db, 'ventas'), where('reservationId', '==', reservationId));
      const depSnap = await getDocs(qDep);
      for (const sDoc of depSnap.docs) {
        const d = sDoc.data();
        if (
          (d.tipo_venta === 'anticipo' || sDoc.id.startsWith('deposit_') || d.pago_estado === 'deposit_paid') &&
          !d.absorbed_in_sale_id &&
          d.pago_estado !== 'Pendiente'
        ) {
          unabsorbedDepositSaleId = sDoc.id;
          break;
        }
      }
    } catch {
      // Non-fatal
    }
  }

  const saleDocRef = doc(collection(db, 'ventas'));
  const saleId = saleDocRef.id;

  await runTransaction(db, async (transaction) => {
    // 1. Validar stock de productos (All Reads Before Writes)
    const productQuantities = new Map<string, number>();
    const productRefsMap = new Map<string, DocumentReference>();
    const productItemMap = new Map<string, SmartCartItem>();

    for (const item of cartItems) {
      if (item.tipo === 'producto') {
        productQuantities.set(item.id, (productQuantities.get(item.id) || 0) + item.cantidad);
        if (!productRefsMap.has(item.id)) {
          productRefsMap.set(item.id, doc(db, 'productos', item.id));
          productItemMap.set(item.id, item);
        }
      }
    }

    const uniqueProductIds = Array.from(productQuantities.keys());
    const productDocs = await Promise.all(
      uniqueProductIds.map((id) => transaction.get(productRefsMap.get(id)!))
    );

    let depositDocSnap: any = null;
    const depositDocRef = unabsorbedDepositSaleId ? doc(db, 'ventas', unabsorbedDepositSaleId) : null;
    if (depositDocRef) {
      depositDocSnap = await transaction.get(depositDocRef);
    }

    // 2. Descontar stock y registrar movimientos
    const clientFullName = `${client.nombre || ''} ${client.apellido || ''}`.trim() || 'Cliente';
    for (let i = 0; i < productDocs.length; i++) {
      const pDoc = productDocs[i];
      const pId = uniqueProductIds[i];
      const qtyNeeded = productQuantities.get(pId)!;
      const itemInfo = productItemMap.get(pId)!;
      const pRef = productRefsMap.get(pId)!;

      if (!pDoc.exists()) {
        throw new Error(`El producto "${itemInfo.nombre}" no existe en inventario.`);
      }
      const pData = pDoc.data() as Product;
      const currentStock = Number(pData.stock || 0);
      const newStock = currentStock - qtyNeeded;
      if (newStock < 0) {
        throw new Error(`Stock insuficiente para "${itemInfo.nombre}" (Disponible: ${currentStock}).`);
      }

      transaction.update(pRef, { stock: newStock });

      const movRef = doc(collection(db, 'movimientos_inventario'));
      transaction.set(movRef, {
        date: Timestamp.now(),
        local_id: local.id,
        product_id: pId,
        presentation_id: pData.presentation_id || 'default',
        from: currentStock,
        to: newStock,
        cause: 'Venta',
        staff_id: collectedByBarber?.id || staffUserId,
        comment: `Venta (${origin === 'kiosco' ? 'Kiosco' : 'Estación'}) a ${clientFullName}`,
        product_name: pData.nombre,
        staff_name: collectedByBarber?.name || staffUserName,
        local_name: local.name,
        concepto: `Registrar venta: ${clientFullName}`,
      });
    }

    // 3. Construir items de venta
    const itemsToSave = cartItems.map((item) => ({
      id: item.id,
      nombre: item.nombre,
      tipo: item.tipo,
      barbero_id: item.barbero_id,
      precio: Number(item.precio) || 0,
      precio_unitario: Number(item.precio) || 0,
      cantidad: Number(item.cantidad) || 1,
      subtotal: (Number(item.precio) || 0) * (Number(item.cantidad) || 1),
      descuento: { valor: 0, tipo: 'fixed' as const, monto: 0 },
      commissionPaid: false,
    }));

    const uniqueBarbers = Array.from(new Set(itemsToSave.map((i) => i.barbero_id).filter(Boolean)));
    const propinaDetalles =
      cleanTip > 0 && uniqueBarbers.length > 0
        ? uniqueBarbers.map((bId) => ({
            barbero_id: bId,
            monto: Math.round((cleanTip / uniqueBarbers.length) * 100) / 100,
          }))
        : [];

    const salePayload: Record<string, any> = {
      cliente_id: client.id,
      cliente_nombre: clientFullName,
      local_id: local.id,
      metodo_pago: paymentMethod,
      items: itemsToSave,
      subtotal,
      descuento: { valor: 0, tipo: 'fixed', monto: 0 },
      descuento_alfacoins: 0,
      alfacoins_canjeados: 0,
      tarifa_corte_aplicada: currentHaircutPrice,
      total: subtotal,
      monto_pagado_real: netAmountCharged,
      anticipoPagado: isComplementaryExtraSale ? 0 : Number(anticipoPagado || 0),
      saldo_pendiente: 0,
      propina: cleanTip,
      propina_metodo: effectiveTipMethod,
      ...(propinaDetalles.length > 0 ? { propina_detalles: propinaDetalles } : {}),
      ...(isCashTipKeptDirectlyByBarber
        ? {
            tipPaid: true,
            tipsPaidTo: uniqueBarbers,
          }
        : {}),
      pago_estado: pagoEstadoInitial,
      tipo_venta: isComplementaryExtraSale ? 'extra_estacion' : 'directa',
      fecha_hora_venta: serverTimestamp(),
      creado_en: Timestamp.now(),
      creado_por_id: collectedByBarber?.userId || staffUserId,
      creado_por_nombre:
        origin === 'kiosco'
          ? `Kiosco (${local.name})`
          : `Estación — ${collectedByBarber?.name || staffUserName}`,
      modalidad_sucursal: 'sin_recepcionista',
      origen_cobro: origin,
      ...(collectedByBarber
        ? {
            cobrado_por_barbero_id: collectedByBarber.id,
            cobrado_por_barbero_nombre: collectedByBarber.name,
          }
        : {}),
      efectivo_retenido_barbero: pagoEstadoInitial === 'Pagado' ? cashRetainedByBarber : 0,
      efectivo_descontado_en_comision: false,
      ...(reservationId ? { reservationId } : {}),
      ...(depositDocSnap?.exists() ? { deposit_sale_id: depositDocRef!.id } : {}),
    };

    transaction.set(saleDocRef, cleanFirestoreObject(salePayload));

    // Absorber anticipo previo si ya quedó pagada la liquidación
    if (depositDocSnap?.exists() && pagoEstadoInitial === 'Pagado') {
      transaction.update(depositDocRef!, {
        absorbed_in_sale_id: saleId,
        final_sale_id: saleId,
      });
    }

    // 4. Si ya nace Pagado (ej. Efectivo / Transferencia), actualizar la reserva en la misma transacción
    if (reservationId && pagoEstadoInitial === 'Pagado') {
      const resRef = doc(db, 'reservas', reservationId);
      const effectiveResItems = (fullReservationItems || cartItems).map((it) => ({
        id: it.id,
        nombre: it.nombre,
        servicio: it.nombre,
        tipo: it.tipo,
        barbero_id: it.barbero_id,
        precio: Number(it.precio) || 0,
        subtotal: (Number(it.precio) || 0) * (Number(it.cantidad) || 1),
        duracion: Number(it.duracion) || 0,
        cantidad: Number(it.cantidad) || 1,
        pagado_en_kiosco: origin === 'kiosco' ? true : Boolean(it.pagado_en_kiosco),
        bloqueado_kiosco: true,
      }));
      const fullResTotal = effectiveResItems.reduce((acc, i) => acc + i.subtotal, 0);

      if (origin === 'kiosco') {
        // IMPORTANTE: En Kiosco el cliente paga por adelantado y pasa a 'En espera' para que el barbero lo atienda
        transaction.update(
          resRef,
          cleanFirestoreObject({
            estado: 'En espera',
            checkin_en: serverTimestamp(),
            pago_estado: 'Pagado',
            monto_pagado: fullResTotal,
            monto_pagado_real: fullResTotal,
            saldo_pendiente: 0,
            kiosco_venta_id: saleId,
            items: effectiveResItems,
            precio: fullResTotal,
            total: fullResTotal,
            servicio: effectiveResItems.map((i) => i.nombre).join(', '),
            servicios_bloqueados_kiosco: effectiveResItems
              .filter((i) => i.tipo === 'servicio')
              .map((i) => ({
                id: i.id,
                nombre: i.nombre,
                precio: i.precio,
                cantidad: i.cantidad,
              })),
          })
        );
      } else {
        // En Estación: el barbero concluye el servicio y liquida el saldo
        transaction.update(
          resRef,
          cleanFirestoreObject({
            estado: 'Asiste',
            hora_fin_atencion: serverTimestamp(),
            pago_estado: 'Pagado',
            monto_pagado: fullResTotal,
            monto_pagado_real: fullResTotal,
            saldo_pendiente: 0,
            items: effectiveResItems,
            precio: fullResTotal,
            total: fullResTotal,
            servicio: effectiveResItems.map((i) => i.nombre).join(', '),
            motivo_cancelacion: deleteField(),
            cancelada_automaticamente: deleteField(),
            cancelado_en: deleteField(),
          })
        );
      }
    }
  });

  return { saleId, netAmountCharged, cashRetainedByBarber };
}

export async function revertPendingSmartTerminalSale(db: Firestore, pendingSaleId: string) {
  if (!pendingSaleId) return;
  try {
    await runTransaction(db, async (transaction) => {
      const saleRef = doc(db, 'ventas', pendingSaleId);
      const saleSnap = await transaction.get(saleRef);
      if (!saleSnap.exists()) return;
      const sData = saleSnap.data();
      if (sData.pago_estado === 'Pagado' || sData.mercado_pago_status === 'approved') {
        return; // Ya se pagó, jamás revertir
      }

      const items = Array.isArray(sData.items) ? sData.items : [];
      const prodIds = Array.from(
        new Set(items.filter((i: any) => i.tipo === 'producto').map((i: any) => String(i.id)))
      );
      const prodDocs = await Promise.all(prodIds.map((id) => transaction.get(doc(db, 'productos', id))));

      prodDocs.forEach((pDoc, idx) => {
        if (!pDoc.exists()) return;
        const pId = prodIds[idx];
        const qtyToRestore = items
          .filter((i: any) => i.tipo === 'producto' && i.id === pId)
          .reduce((acc: number, i: any) => acc + (Number(i.cantidad) || 1), 0);
        const curr = Number(pDoc.data().stock || 0);
        transaction.update(doc(db, 'productos', pId), { stock: curr + qtyToRestore });
      });

      transaction.delete(saleRef);
    });
  } catch (e) {
    console.warn('Error revirtiendo intento pendiente de terminal:', e);
    await deleteDoc(doc(db, 'ventas', pendingSaleId)).catch(() => {});
  }
}
