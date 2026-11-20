'use server';

import { getDb } from '@/lib/firebase-server';
import { addMinutes, format, set, parse, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { parseClientCustomDuration } from '@/lib/client-notes-helper';
import { evaluateDepositRequirement, DEFAULT_BOOKING_RULES, ReglasReservasConfig, isExpiredPendingDepositReservation } from '@/lib/booking-rules';
import { normalizePhoneForLookup, isValidPhoneNumber } from '@/lib/phone-utils';
import { checkRateLimit, getRequestIp, verifyStaffAccess } from '@/lib/server-auth';
import { sendBookingCancellation } from '@/lib/services/booking-cancellation-email';
import { sendBookingConfirmation } from '@/lib/services/booking-confirmation-email';
import { createReservationServer } from '@/lib/services/reservation-service';

interface GetAvailabilityParams {
    date: string; // YYYY-MM-DD
    professionalId: string;
    durationMinutes: number;
    minReservationBufferMinutes?: number;
    isSandbox?: boolean;
}

export type GetAvailableSlotsResult = 
    | { slots: string[]; appointmentCount?: number; busyMinutes?: number }
    | { error: string };

const BOOKING_META_TTL_MS = 60 * 1000;
const bookingMetaCacheGlobal = globalThis as typeof globalThis & {
    __vaBookingMetaCache?: {
        rules?: { data: any; fetchedAt: number };
        localesById?: Map<string, { data: any; fetchedAt: number }>;
    };
};

async function getCachedBookingRules(db: FirebaseFirestore.Firestore) {
    const cache = (bookingMetaCacheGlobal.__vaBookingMetaCache ??= {});
    if (cache.rules && Date.now() - cache.rules.fetchedAt < BOOKING_META_TTL_MS) {
        return cache.rules.data;
    }
    const rulesSnap = await db.collection('configuracion').doc('reglas_reservas').get();
    let result: { source: 'reglas' | 'website' | 'none'; data: any } = { source: 'none', data: null };
    if (rulesSnap.exists) {
        result = { source: 'reglas', data: rulesSnap.data() || null };
    } else {
        const settingsSnap = await db.collection('settings').doc('website').get();
        if (settingsSnap.exists) {
            result = { source: 'website', data: settingsSnap.data() || null };
        }
    }
    cache.rules = { data: result, fetchedAt: Date.now() };
    return result;
}

async function getCachedLocalData(db: FirebaseFirestore.Firestore, localId?: string | null) {
    const cache = (bookingMetaCacheGlobal.__vaBookingMetaCache ??= {});
    const map = (cache.localesById ??= new Map());
    const key = localId || '__default__';
    const hit = map.get(key);
    if (hit && Date.now() - hit.fetchedAt < BOOKING_META_TTL_MS) {
        return hit.data;
    }
    let localData: any = null;
    if (localId) {
        const localDoc = await db.collection('locales').doc(localId).get();
        if (localDoc.exists) localData = localDoc.data();
    }
    if (!localData) {
        const locsSnap = await db.collection('locales').limit(1).get();
        if (!locsSnap.empty) localData = locsSnap.docs[0].data();
    }
    map.set(key, { data: localData, fetchedAt: Date.now() });
    return localData;
}

export async function getAvailableSlots({ date, professionalId, durationMinutes, minReservationBufferMinutes, isSandbox }: GetAvailabilityParams): Promise<GetAvailableSlotsResult> {
    // 0. Strict Input Validation
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { error: 'Formato de fecha inválido. Se requiere AAAA-MM-DD.' };
    }
    if (!professionalId || typeof professionalId !== 'string') {
        return { error: 'ID de profesional inválido.' };
    }
    if (typeof durationMinutes !== 'number' || durationMinutes <= 0) {
        return { slots: [] as string[] }; // No slots for invalid duration
    }

    try {
        const db = getDb();
        if (!db) return { error: 'No database connection' };

        // Safe Date Parsing
        let dayName = '';
        const parsedDate = parse(date, 'yyyy-MM-dd', new Date());
        if (isNaN(parsedDate.getTime())) return { error: 'Fecha inválida.' };

        dayName = format(parsedDate, 'eeee', { locale: es }).toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // 1. Parallelize independent Firestore reads (cuts latency ~70%)
        const [profDoc, specialDaysSnap, blocksSnapshot, reservationsSnapshot, sandboxSnapshot, cachedRules] = await Promise.all([
            db.collection('profesionales').doc(professionalId).get(),
            db.collection('jornadas_especiales')
                .where('profesionalId', '==', professionalId)
                .where('fecha', '==', date)
                .get(),
            db.collection('bloqueos_horario')
                .where('fecha', '==', date)
                .where('barbero_id', '==', professionalId)
                .get(),
            db.collection('reservas')
                .where('fecha', '==', date)
                .get(),
            isSandbox
                ? db.collection('reservas_sandbox').where('fecha', '==', date).get().catch((err) => {
                    console.warn('[Booking] Error al consultar reservas_sandbox en getAvailableSlots:', err);
                    return null;
                })
                : Promise.resolve(null),
            getCachedBookingRules(db).catch(() => ({ source: 'none' as const, data: null })),
        ]);

        if (!profDoc.exists) return { error: 'Profesional no encontrado.' };

        const profData = profDoc.data();
        if (!profData) return { error: 'Datos del profesional no disponibles.' };

        // Helper specifically for safe parsing
        const parseTimeSafe = (timeStr: any) => {
            if (!timeStr || typeof timeStr !== 'string') return null;
            const parts = timeStr.split(':');
            if (parts.length < 2) return null;
            const h = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (isNaN(h) || isNaN(m)) return null;
            return { h, m };
        };

        const blockingBlocks: { start: string, end: string, startM: number, endM: number }[] = [];

        blocksSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.type === 'available') {
                // Internal-only schedule enabled from Agenda; do not expose publicly
                return;
            }
            const s = parseTimeSafe(data.hora_inicio);
            const e = parseTimeSafe(data.hora_fin);
            if (s && e) {
                const startM = s.h * 60 + s.m;
                const endM = e.h * 60 + e.m;
                blockingBlocks.push({ start: data.hora_inicio, end: data.hora_fin, startM, endM });
            }
        });

        // 1.0 Fetch Local Schedule (cached 60s) to enforce bounds on regular schedule
        const localData = await getCachedLocalData(db, profData.local_id);

        const localScheduleDay = localData?.schedule?.[dayName];
        const scheduleDay = profData.schedule?.[dayName];

        // Build unified working intervals:
        // (A) Special journeys ('jornadas_especiales' from Admin -> Profesionales):
        //     IMPORTANTE: La Jornada Especial SUSTITUYE por completo el horario regular del profesional en esa fecha.
        //     No se suma al horario regular; el resto del día queda no disponible.
        // (B) Regular schedule (if enabled and local is open, clamped to local hours, minus regular breaks) ONLY if no special journey.
        const workingIntervals: { start: number, end: number }[] = [];

        if (!specialDaysSnap.empty) {
            // Add Special Journeys ('jornadas_especiales') - replaces regular schedule
            specialDaysSnap.docs.forEach(d => {
                const j = d.data();
                const js = parseTimeSafe(j.hora_inicio);
                const je = parseTimeSafe(j.hora_fin);
                if (js && je) {
                    const jStartM = js.h * 60 + js.m;
                    const jEndM = je.h * 60 + je.m;
                    if (jStartM < jEndM) {
                        workingIntervals.push({ start: jStartM, end: jEndM });
                    }
                }
            });
        } else if (scheduleDay && scheduleDay.enabled && localScheduleDay && localScheduleDay.enabled) {
            const profStart = parseTimeSafe(scheduleDay.start);
            const profEnd = parseTimeSafe(scheduleDay.end);
            const localStart = parseTimeSafe(localScheduleDay.start);
            const localEnd = parseTimeSafe(localScheduleDay.end);

            if (profStart && profEnd && localStart && localEnd) {
                const regStartM = Math.max(profStart.h * 60 + profStart.m, localStart.h * 60 + localStart.m);
                const regEndM = Math.min(profEnd.h * 60 + profEnd.m, localEnd.h * 60 + localEnd.m);

                if (regStartM < regEndM) {
                    let regSegments: { start: number, end: number }[] = [{ start: regStartM, end: regEndM }];

                    // Subtract regular breaks from regular shift segments
                    if (scheduleDay.breaks && Array.isArray(scheduleDay.breaks)) {
                        scheduleDay.breaks.forEach((brk: any) => {
                            const bs = parseTimeSafe(brk.start);
                            const be = parseTimeSafe(brk.end);
                            if (bs && be) {
                                const brkStartM = bs.h * 60 + bs.m;
                                const brkEndM = be.h * 60 + be.m;
                                if (brkStartM < brkEndM) {
                                    const nextSegments: { start: number, end: number }[] = [];
                                    regSegments.forEach(seg => {
                                        if (brkEndM <= seg.start || brkStartM >= seg.end) {
                                            nextSegments.push(seg);
                                        } else {
                                            if (brkStartM > seg.start) nextSegments.push({ start: seg.start, end: brkStartM });
                                            if (brkEndM < seg.end) nextSegments.push({ start: brkEndM, end: seg.end });
                                        }
                                    });
                                    regSegments = nextSegments;
                                }
                            }
                        });
                    }

                    workingIntervals.push(...regSegments);
                }
            }
        }

        if (workingIntervals.length === 0) {
            return { slots: [] as string[] };
        }

        // Merge overlapping or adjacent working intervals
        workingIntervals.sort((a, b) => a.start - b.start);
        const mergedWorking: { start: number, end: number }[] = [];
        workingIntervals.forEach(interval => {
            if (mergedWorking.length === 0) {
                mergedWorking.push({ ...interval });
            } else {
                const last = mergedWorking[mergedWorking.length - 1];
                if (interval.start <= last.end) {
                    last.end = Math.max(last.end, interval.end);
                } else {
                    mergedWorking.push({ ...interval });
                }
            }
        });

        const busyIntervals: { start: number, end: number }[] = [];

        // 2. Get Busy Slots (Reservations — already fetched in parallel above)
        const allResDocs = [...reservationsSnapshot.docs];
        if (sandboxSnapshot && !sandboxSnapshot.empty) {
            allResDocs.push(...sandboxSnapshot.docs);
        }

        const nowMs = Date.now();
        let activeAppointmentCount = 0;
        let totalBusyMinutes = 0;

        allResDocs.forEach(doc => {
            const data = doc.data();
            if (data.estado === 'Cancelado' || data.estado === 'No asiste') return;

            if (isExpiredPendingDepositReservation(data, nowMs, 30)) {
                db.runTransaction(async (tx) => {
                    const freshSnap = await tx.get(doc.ref);
                    if (!freshSnap.exists) return;
                    const freshData = freshSnap.data() || {};
                    if (freshData.estado !== 'Pendiente de pago') return;
                    tx.update(doc.ref, {
                        estado: 'Cancelado',
                        motivo_cancelacion: 'Cancelada automáticamente por falta de pago de anticipo en los 30 minutos de tolerancia.',
                        cancelada_automaticamente: true,
                        cancelado_en: FieldValue.serverTimestamp(),
                    });
                    if (!isSandbox && freshData.cliente_id) {
                        tx.update(db.collection('clientes').doc(freshData.cliente_id), {
                            citas_canceladas: FieldValue.increment(1)
                        });
                    }
                }).catch(() => {});
                return;
            }

            // Robust check for professional match
            let isForProf = data.barbero_id === professionalId;
            if (!isForProf && Array.isArray(data.items)) {
                isForProf = data.items.some((i: any) => i && i.barbero_id === professionalId);
            }

            if (isForProf) {
                activeAppointmentCount++;
                const s = parseTimeSafe(data.hora_inicio);
                const e = parseTimeSafe(data.hora_fin);
                if (s && e) {
                    const startMin = s.h * 60 + s.m;
                    const endMin = e.h * 60 + e.m;
                    if (endMin > startMin) {
                        totalBusyMinutes += (endMin - startMin);
                    }
                    busyIntervals.push({
                        start: startMin,
                        end: endMin
                    });
                }
            }
        });

        // 3. Get Busy Slots (Blocking Blocks)
        blockingBlocks.forEach(blk => {
            busyIntervals.push({
                start: blk.startM,
                end: blk.endM
            });
        });

        // 3. Generate Available Slots with Receptionist Intelligence (No Dead Gaps)
        // Minimum standalone viable gap in barbershop (no standalone haircut/service is < 30m)
        const MIN_VIABLE_GAP = 30;

        // Apply cached booking rules and settings
        let minReservationBuffer = minReservationBufferMinutes !== undefined ? minReservationBufferMinutes : 30; // Minutes
        let maxDaysFuture = 14;
        let GRID_INTERVAL = 30; // Minutes

        if (cachedRules?.source === 'reglas' && cachedRules.data) {
            const rData = cachedRules.data;
            if (minReservationBufferMinutes === undefined && rData.tiempo_minimo_anticipacion_minutos !== undefined) {
                minReservationBuffer = Number(rData.tiempo_minimo_anticipacion_minutos) || 30;
            }
            if (rData.dias_maximos_futuro !== undefined) {
                maxDaysFuture = Number(rData.dias_maximos_futuro) || 14;
            }
            if (rData.intervalo_horarios_minutos !== undefined) {
                const parsedInterval = Number(rData.intervalo_horarios_minutos);
                if (!isNaN(parsedInterval) && parsedInterval > 0) GRID_INTERVAL = parsedInterval;
            }
        } else if (cachedRules?.source === 'website' && cachedRules.data) {
            const data = cachedRules.data;
            if (minReservationBufferMinutes === undefined && data.minReservationTime !== undefined) {
                minReservationBuffer = (Number(data.minReservationTime) || 1) * 60;
            }
            if (data.slotInterval) {
                const parsedInterval = Number(data.slotInterval);
                if (!isNaN(parsedInterval) && parsedInterval > 0) GRID_INTERVAL = parsedInterval;
            }
        }

        // Timezone Logic (compare against Now in Mexico City time)
        const timeZone = 'America/Mexico_City';
        const nowRaw = new Date();
        const mexicoDateStr = new Intl.DateTimeFormat('en-CA', { // YYYY-MM-DD
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(nowRaw);

        // Validation against maximum booking window into future
        const queryDateObj = parse(date, 'yyyy-MM-dd', new Date());
        const nowDateObj = parse(mexicoDateStr, 'yyyy-MM-dd', new Date());
        const daysDiff = Math.round((queryDateObj.getTime() - nowDateObj.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff < 0 || daysDiff > maxDaysFuture) {
            return { slots: [] as string[] };
        }

        const isQueryDateToday = (date === mexicoDateStr);
        let currentMinutes = -1;

        if (isQueryDateToday) {
            const mexicoTimeParts = new Intl.DateTimeFormat('en-GB', { // HH:mm
                timeZone,
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).formatToParts(nowRaw);
            const nowH = parseInt(mexicoTimeParts.find(p => p.type === 'hour')?.value || '0', 10);
            const nowM = parseInt(mexicoTimeParts.find(p => p.type === 'minute')?.value || '0', 10);
            currentMinutes = nowH * 60 + nowM;
        }

        // Subtract busy intervals (reservations and blocking blocks) from merged working intervals to identify free windows
        let freeWindows: { start: number, end: number }[] = [...mergedWorking];
        busyIntervals.forEach(busy => {
            if (busy.start >= busy.end) return;
            const nextWindows: { start: number, end: number }[] = [];
            freeWindows.forEach(win => {
                if (busy.end <= win.start || busy.start >= win.end) {
                    nextWindows.push(win);
                } else {
                    if (busy.start > win.start) nextWindows.push({ start: win.start, end: busy.start });
                    if (busy.end < win.end) nextWindows.push({ start: busy.end, end: win.end });
                }
            });
            freeWindows = nextWindows;
        });

        const availableSlotsSet = new Set<string>();
        const gridStep = Math.max(30, GRID_INTERVAL || 30);

        for (const window of freeWindows) {
            const wStart = window.start;
            const wEnd = window.end;
            const wLength = wEnd - wStart;

            if (wLength < durationMinutes) continue;

            const candidateStarts = new Set<number>();

            // 1. Dynamic forward anchor (encaje continuo: si terminó a las 15:15, habilitar 15:15 de inmediato)
            candidateStarts.add(wStart);

            // 2. Dynamic backward anchor (encaje inverso: permitir cita pegada al final de la jornada o ventana)
            const backwardAnchor = wEnd - durationMinutes;
            if (backwardAnchor >= wStart) {
                candidateStarts.add(backwardAnchor);
            }

            // 3. Candidatos en cuadrícula estándar de 30 min (10:00, 10:30, 11:00... 19:00, 19:30)
            const firstGrid = Math.ceil(wStart / gridStep) * gridStep;
            for (let t = firstGrid; t + durationMinutes <= wEnd; t += gridStep) {
                candidateStarts.add(t);
            }

            const sortedCandidates = Array.from(candidateStarts).sort((a, b) => a - b);

            for (const slotStart of sortedCandidates) {
                const slotEnd = slotStart + durationMinutes;

                // Buffer de anticipación mínima para reservas del mismo día
                if (isQueryDateToday && slotStart < (currentMinutes + minReservationBuffer)) {
                    continue;
                }

                const gapBefore = slotStart - wStart;
                const gapAfter = wEnd - slotEnd;

                if (wLength < 2 * MIN_VIABLE_GAP) {
                    // En ventanas estrechas donde sólo cabe una cita, se permite si queda pegada al inicio o al final
                    if (gapBefore === 0 || gapAfter === 0) {
                        const h = Math.floor(slotStart / 60);
                        const m = slotStart % 60;
                        availableSlotsSet.add(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                    }
                } else {
                    // En ventanas normales/amplias, se descartan los huecos huérfanos (< 30 min)
                    const hasDeadGapBefore = gapBefore > 0 && gapBefore < MIN_VIABLE_GAP;
                    const hasDeadGapAfter = gapAfter > 0 && gapAfter < MIN_VIABLE_GAP;

                    if (!hasDeadGapBefore && !hasDeadGapAfter) {
                        const h = Math.floor(slotStart / 60);
                        const m = slotStart % 60;
                        availableSlotsSet.add(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                    }
                }
            }
        }

        const availableSlots = Array.from(availableSlotsSet).sort();
        return {
            slots: availableSlots,
            appointmentCount: activeAppointmentCount,
            busyMinutes: totalBusyMinutes
        };

    } catch (error: any) {
        console.error('CRITICAL Error fetching availability:', error);
        // Important: Return a serializable object, NOT an Error instance
        return { error: 'Error interno verificando horarios. Intente nuevamente.' };
    }
}

// ... (previous code)

export async function createPublicReservation(data: any) {
    try {
        const ip = await getRequestIp();
        const rl = checkRateLimit(`public_book:${ip}`, 10, 60_000);
        if (!rl.allowed) {
            return { error: `Demasiadas solicitudes de reserva. Intenta nuevamente en ${rl.retryAfterSec}s.` };
        }
    } catch {
        // Ignorar fuera de contexto HTTP (ej. pruebas CLI locales)
    }
    return await createReservationServer(data, { trustedInternalCaller: false });
}

// --- PUBLIC SERVICIOS CONFIG (SERVER ACTION) ---
export async function getPublicServiciosConfig() {
    try {
        const db = getDb();
        if (!db) {
            return {
                anticipo_monto_minimo_activo: true,
                anticipo_monto_minimo: 190,
                anticipo_porcentaje_defecto: 50,
                anticipo_horario_apertura_activo: true,
                anticipo_horario_apertura_hora: '10:00',
                anticipo_horario_apertura_hora_fin: '10:30',
                anticipo_horario_apertura_porcentaje: 50,
                penalizacion_inasistencias_activa: true,
                max_inasistencias_permitidas: 2,
                penalizacion_anticipo_porcentaje: 50,
                tiempo_minimo_anticipacion_minutos: 30,
                dias_maximos_futuro: 14,
                tolerancia_puntualidad_minutos: 5,
            };
        }

        // 1. Intentar leer configuracion/reglas_reservas
        const reglasSnap = await db.collection('configuracion').doc('reglas_reservas').get();
        if (reglasSnap.exists) {
            const data = reglasSnap.data() || {};
            return {
                anticipo_monto_minimo_activo: data.anticipo_monto_minimo_activo !== false,
                anticipo_monto_minimo: Number(data.anticipo_monto_minimo) > 0 ? Number(data.anticipo_monto_minimo) : 190,
                anticipo_porcentaje_defecto: Number(data.anticipo_porcentaje_defecto) > 0 ? Number(data.anticipo_porcentaje_defecto) : 50,
                anticipo_horario_apertura_activo: data.anticipo_horario_apertura_activo !== false,
                anticipo_horario_apertura_hora: data.anticipo_horario_apertura_hora || '10:00',
                anticipo_horario_apertura_hora_fin: data.anticipo_horario_apertura_hora_fin || '10:30',
                anticipo_horario_apertura_porcentaje: Number(data.anticipo_horario_apertura_porcentaje) > 0 ? Number(data.anticipo_horario_apertura_porcentaje) : 50,
                penalizacion_inasistencias_activa: data.penalizacion_inasistencias_activa !== false,
                max_inasistencias_permitidas: Number(data.max_inasistencias_permitidas) > 0 ? Number(data.max_inasistencias_permitidas) : 2,
                penalizacion_anticipo_porcentaje: Number(data.penalizacion_anticipo_porcentaje) > 0 ? Number(data.penalizacion_anticipo_porcentaje) : 50,
                tiempo_minimo_anticipacion_minutos: Number(data.tiempo_minimo_anticipacion_minutos) || 30,
                dias_maximos_futuro: Number(data.dias_maximos_futuro) || 14,
                tolerancia_puntualidad_minutos: Number(data.tolerancia_puntualidad_minutos) || 5,
                reglas_personalizadas: Array.isArray(data.reglas_personalizadas) ? data.reglas_personalizadas : [],
            };
        }

        // 2. Respaldo a configuracion/servicios
        const snap = await db.collection('configuracion').doc('servicios').get();
        if (snap.exists) {
            const data = snap.data() || {};
            return {
                anticipo_monto_minimo_activo: data.anticipo_monto_minimo_activo !== false,
                anticipo_monto_minimo: Number(data.anticipo_monto_minimo) > 0 ? Number(data.anticipo_monto_minimo) : 190,
                anticipo_porcentaje_defecto: Number(data.anticipo_porcentaje_defecto) > 0 ? Number(data.anticipo_porcentaje_defecto) : 50,
                anticipo_horario_apertura_activo: data.anticipo_horario_apertura_activo !== false,
                anticipo_horario_apertura_hora: data.anticipo_horario_apertura_hora || '10:00',
                anticipo_horario_apertura_hora_fin: data.anticipo_horario_apertura_hora_fin || '10:30',
                anticipo_horario_apertura_porcentaje: Number(data.anticipo_horario_apertura_porcentaje) > 0 ? Number(data.anticipo_horario_apertura_porcentaje) : 50,
                penalizacion_inasistencias_activa: data.penalizacion_inasistencias_activa !== false,
                max_inasistencias_permitidas: Number(data.max_inasistencias_permitidas) > 0 ? Number(data.max_inasistencias_permitidas) : 2,
                penalizacion_anticipo_porcentaje: Number(data.penalizacion_anticipo_porcentaje) > 0 ? Number(data.penalizacion_anticipo_porcentaje) : 50,
                tiempo_minimo_anticipacion_minutos: 30,
                dias_maximos_futuro: 14,
                tolerancia_puntualidad_minutos: 5,
            };
        }
    } catch (e) {
        console.error("Error reading public servicios config:", e);
    }

    return {
        anticipo_monto_minimo_activo: true,
        anticipo_monto_minimo: 190,
        anticipo_porcentaje_defecto: 50,
        anticipo_horario_apertura_activo: true,
        anticipo_horario_apertura_hora: '10:00',
        anticipo_horario_apertura_hora_fin: '10:30',
        anticipo_horario_apertura_porcentaje: 50,
        penalizacion_inasistencias_activa: true,
        max_inasistencias_permitidas: 2,
        penalizacion_anticipo_porcentaje: 50,
        tiempo_minimo_anticipacion_minutos: 30,
        dias_maximos_futuro: 14,
        tolerancia_puntualidad_minutos: 5,
    };
}

// --- CLIENT BOOKING ELIGIBILITY CHECK (SERVER ACTION) ---
export async function checkClientBookingEligibility(
    identifier: string,
    targetDate?: string,
    newBookingTotal?: number
): Promise<{
    requiresDepositDueToHistory: boolean;
    exento_anticipo?: boolean;
    citas_canceladas: number;
    citas_no_asistidas: number;
    totalFaltas: number;
    penalizacion_anticipo_porcentaje: number;
    sameDayActiveCount: number;
    sameDayActiveTotal: number;
    sameDayAccumulatedTotal: number;
    requiresDepositDueToSameDay: boolean;
    sameDayDepositReason?: string;
    sameDayDepositPercent: number;
}> {
    const defaultRes = {
        requiresDepositDueToHistory: false,
        citas_canceladas: 0,
        citas_no_asistidas: 0,
        totalFaltas: 0,
        penalizacion_anticipo_porcentaje: 50,
        sameDayActiveCount: 0,
        sameDayActiveTotal: 0,
        sameDayAccumulatedTotal: Number(newBookingTotal) || 0,
        requiresDepositDueToSameDay: false,
        sameDayDepositReason: '',
        sameDayDepositPercent: 50,
    };

    if (!identifier || typeof identifier !== 'string' || identifier.trim().length < 4) {
        return defaultRes;
    }

    try {
        const db = getDb();
        if (!db) return defaultRes;

        const config = await getPublicServiciosConfig();

        const clean = identifier.trim();
        const phoneLookup = !clean.includes('@') ? normalizePhoneForLookup(clean) : { primary: '', variants: [], isValid: false };

        const clientsRef = db.collection('clientes');
        let clientDoc: any = null;

        // 1. Búsqueda por teléfono (buscando variantes comunes de formato nacional e internacional)
        if (phoneLookup.variants.length > 0) {
            for (const variant of phoneLookup.variants) {
                const phoneSnap = await clientsRef.where('telefono', '==', variant).limit(1).get();
                if (!phoneSnap.empty) {
                    clientDoc = phoneSnap.docs[0];
                    break;
                }
            }
        }

        // 2. Búsqueda por correo (estándar y legacy) si no se encontró por teléfono
        if (!clientDoc && clean.includes('@')) {
            const emailSnap = await clientsRef.where('correo', '==', clean).limit(1).get();
            if (!emailSnap.empty) {
                clientDoc = emailSnap.docs[0];
            } else {
                const legacySnap = await clientsRef.where('email', '==', clean).limit(1).get();
                if (!legacySnap.empty) clientDoc = legacySnap.docs[0];
            }
        }

        const data = clientDoc ? (clientDoc.data() || {}) : {};
        const canceladas = Number(data.citas_canceladas) || 0;
        let noAsistidas = Number(data.citas_no_asistidas) || 0;

        // 3. Verificación cruzada en la colección 'reservas' para inasistencias reales
        let reservasNoShows = 0;
        if (config.penalizacion_inasistencias_activa) {
            try {
                if (clientDoc) {
                    const snapById = await db.collection('reservas')
                        .where('cliente_id', '==', clientDoc.id)
                        .where('estado', '==', 'No asiste')
                        .get();
                    reservasNoShows = Math.max(reservasNoShows, snapById.size);
                }
                if (phoneLookup.primary) {
                    const snapByPhone = await db.collection('reservas')
                        .where('cliente_telefono', '==', phoneLookup.primary)
                        .where('estado', '==', 'No asiste')
                        .get();
                    reservasNoShows = Math.max(reservasNoShows, snapByPhone.size);
                }
            } catch (resErr) {
                console.warn("[checkClientBookingEligibility] Error comprobando inasistencias en reservas:", resErr);
            }
        }

        const realNoShows = Math.max(noAsistidas, reservasNoShows);

        // Auto-sincronizar el documento del cliente en Firestore si estaba en 0 o desactualizado
        if (clientDoc && realNoShows > (Number(data.citas_no_asistidas) || 0)) {
            clientDoc.ref.update({
                citas_no_asistidas: realNoShows,
                actualizado_el: new Date()
            }).catch(() => {});
        }

        const isClientExempt = Boolean(data.exento_anticipo === true && (Number(data.faltas_desde_exencion) || 0) < 2);
        const totalFaltas = canceladas + realNoShows;
        const maxPermitidas = Number(config.max_inasistencias_permitidas) || 2;
        const requiresDeposit = !isClientExempt && config.penalizacion_inasistencias_activa && ((realNoShows >= maxPermitidas) || (totalFaltas >= maxPermitidas));

        // 4. Verificación de Citas Activas en la Misma Fecha (Escudo Anti-Fragmentación y Acumulado Diario)
        let sameDayActiveCount = 0;
        let sameDayActiveTotal = 0;

        if (targetDate && targetDate.trim().length === 10) {
            try {
                const dateClean = targetDate.trim();
                const sameDaySnap = await db.collection('reservas')
                    .where('fecha', '==', dateClean)
                    .get();

                const validDocs = sameDaySnap.docs.filter(doc => {
                    const r = doc.data();
                    if (r.estado === 'Cancelado' || r.estado === 'Cancelada' || r.estado === 'No asiste') return false;

                    const matchesId = clientDoc && r.cliente_id === clientDoc.id;
                    const resPhoneLookup = normalizePhoneForLookup(r.cliente_telefono);
                    const matchesPhone = Boolean(
                        phoneLookup.primary &&
                        resPhoneLookup.primary &&
                        phoneLookup.primary === resPhoneLookup.primary
                    );

                    return matchesId || matchesPhone;
                });

                sameDayActiveCount = validDocs.length;
                sameDayActiveTotal = validDocs.reduce((sum, doc) => sum + (Number(doc.data().total) || 0), 0);
            } catch (sameDayErr) {
                console.warn("[checkClientBookingEligibility] Error comprobando citas activas del mismo día:", sameDayErr);
            }
        }

        const safeNewBookingTotal = Number(newBookingTotal) || 0;
        const sameDayAccumulatedTotal = sameDayActiveTotal + safeNewBookingTotal;
        const minThreshold = Number(config.anticipo_monto_minimo) || 190;
        const defaultPercent = Number(config.anticipo_porcentaje_defecto) || 50;

        let requiresDepositDueToSameDay = false;
        let sameDayDepositReason = '';

        if (!isClientExempt && config.anticipo_monto_minimo_activo && sameDayActiveCount > 0) {
            if (sameDayAccumulatedTotal >= minThreshold || sameDayActiveCount >= 1) {
                requiresDepositDueToSameDay = true;
                sameDayDepositReason = `Detectamos que ya cuentas con ${sameDayActiveCount} cita(s) programada(s) para este día ($${sameDayActiveTotal.toFixed(2)} MXN). Al reservar este horario adicional y acumular $${sameDayAccumulatedTotal.toFixed(2)} MXN en la fecha, se requiere un anticipo del ${defaultPercent}% de garantía.`;
            }
        }

        return {
            requiresDepositDueToHistory: requiresDeposit,
            exento_anticipo: isClientExempt,
            citas_canceladas: canceladas,
            citas_no_asistidas: realNoShows,
            totalFaltas,
            penalizacion_anticipo_porcentaje: Number(config.penalizacion_anticipo_porcentaje) || 50,
            sameDayActiveCount,
            sameDayActiveTotal,
            sameDayAccumulatedTotal,
            requiresDepositDueToSameDay,
            sameDayDepositReason,
            sameDayDepositPercent: defaultPercent,
        };
    } catch (err) {
        console.error("Error in checkClientBookingEligibility:", err);
        return defaultRes;
    }
}

// --- MANUAL EMAIL TRIGGER (FOR ADMIN PANEL) ---
export async function sendManualBookingConfirmation(reservationId: string) {
    await verifyStaffAccess();
    const db = getDb();
    if (!db) return { error: 'Database not available' };

    try {
        const resDoc = await db.collection('reservas').doc(reservationId).get();
        if (!resDoc.exists) return { error: 'Reserva no encontrada' };

        const reservation = resDoc.data();
        if (!reservation) return { error: 'Datos vacíos' };

        if (reservation.notifications?.email_notification === false) {
            return { success: true, skipped: true };
        }

        // Fetch Client Email manually since internal function needs it arg
        let clientEmail = '';
        if (reservation.cliente_id) {
            const clientDoc = await db.collection('clientes').doc(reservation.cliente_id).get();
            if (clientDoc.exists) {
                const data = clientDoc.data();
                clientEmail = data?.correo || data?.email || '';
            }
        }

        const professionalId = reservation.barbero_id || (reservation.items && reservation.items[0] ? reservation.items[0].barbero_id : '');

        // Generate action token if missing (for quick action buttons)
        let actionToken = reservation.actionToken;
        if (!actionToken) {
            actionToken = randomUUID();
            await db.collection('reservas').doc(reservationId).update({ actionToken });
        }

        await sendBookingConfirmation({ ...reservation, id: reservationId, actionToken }, db, clientEmail, professionalId);
        return { success: true };
    } catch (e: any) {
        console.error("Manual Email Error:", e);
        return { error: e.message }; // Return error to client for toast
    }
}

export async function sendBookingCancellationAction(reservationId: string, reason?: string) {
    await verifyStaffAccess();
    return sendBookingCancellation({ reservationId, reason });
}

export async function sendTestCancellationEmail(targetEmail: string) {
    await verifyStaffAccess();
    const today = new Date();
    const formattedDate = format(today, 'yyyy-MM-dd');
    const mockReservation = {
        id: 'test-cancellation-' + Date.now(),
        cliente_nombre: 'Alejandro',
        cliente_email: targetEmail,
        servicio: 'Corte de cabello',
        items: [{ nombre: 'Corte de cabello' }],
        fecha: formattedDate,
        hora_inicio: '16:00',
        barbero_nombre: 'Beatriz',
        motivo_cancelacion: 'Cancelación solicitada por el cliente',
    };
    return sendBookingCancellation({
        reservation: mockReservation,
        clientEmail: targetEmail,
        reason: 'Cancelación de prueba del sistema',
        forceSend: true
    });
}

