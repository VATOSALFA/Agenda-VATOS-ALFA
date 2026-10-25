'use server';

import { getDb } from '@/lib/firebase-server';
import { addMinutes, format, set, parse, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { parseClientCustomDuration } from '@/lib/client-notes-helper';
import { evaluateDepositRequirement, DEFAULT_BOOKING_RULES, ReglasReservasConfig, isExpiredPendingDepositReservation } from '@/lib/booking-rules';
import { normalizePhoneForLookup, isValidPhoneNumber } from '@/lib/phone-utils';

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

        // 1. Get Professional Schedule
        // Optimized: Parallelize initial independent fetches if possible, but here we need prof schedule first to know if we even need to check others.
        const profDoc = await db.collection('profesionales').doc(professionalId).get();
        if (!profDoc.exists) return { error: 'Profesional no encontrado.' };

        const profData = profDoc.data();
        if (!profData) return { error: 'Datos del profesional no disponibles.' };


        // Safe Date Parsing
        let dayName = '';
        const parsedDate = parse(date, 'yyyy-MM-dd', new Date());
        if (isNaN(parsedDate.getTime())) return { error: 'Fecha inválida.' };

        dayName = format(parsedDate, 'eeee', { locale: es }).toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // 1.05 Check for Special Journeys (Manual Overrides from Admin -> Profesionales)
        const specialDaysSnap = await db.collection('jornadas_especiales')
            .where('profesionalId', '==', professionalId)
            .where('fecha', '==', date)
            .get();

        // 1.06 Check for Blocking Blocks ('bloqueos_horario')
        // NOTE: 'available' blocks in 'bloqueos_horario' are created from the internal Agenda
        // ("Habilitar Horario Especial") and are strictly internal (never exposed on Web or App).
        const blocksSnapshot = await db.collection('bloqueos_horario')
            .where('fecha', '==', date)
            .where('barbero_id', '==', professionalId)
            .get();

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

        // 1.0 Fetch Local Schedule to enforce bounds on regular schedule
        let localData = null;
        if (profData.local_id) {
            const localDoc = await db.collection('locales').doc(profData.local_id).get();
            if (localDoc.exists) localData = localDoc.data();
        }
        if (!localData) {
            const locsSnap = await db.collection('locales').limit(1).get();
            if (!locsSnap.empty) localData = locsSnap.docs[0].data();
        }

        const localScheduleDay = localData?.schedule?.[dayName];
        const scheduleDay = profData.schedule?.[dayName];

        // Build unified working intervals:
        // (A) Regular schedule (if enabled and local is open, clamped to local hours, minus regular breaks)
        // (B) Special journeys ('jornadas_especiales' from Admin -> Profesionales, which can be before/after local hours or on closed days)
        const workingIntervals: { start: number, end: number }[] = [];

        if (scheduleDay && scheduleDay.enabled && localScheduleDay && localScheduleDay.enabled) {
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

        // Add Special Journeys ('jornadas_especiales') - unrestricted by local opening/closing hours
        if (!specialDaysSnap.empty) {
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

        // 2. Get Busy Slots (Reservations)
        const reservationsSnapshot = await db.collection('reservas')
            .where('fecha', '==', date)
            .get();

        const allResDocs = [...reservationsSnapshot.docs];
        if (isSandbox) {
            try {
                const sandboxSnapshot = await db.collection('reservas_sandbox')
                    .where('fecha', '==', date)
                    .get();
                allResDocs.push(...sandboxSnapshot.docs);
            } catch (err) {
                console.warn('[Booking] Error al consultar reservas_sandbox en getAvailableSlots:', err);
            }
        }

        const nowMs = Date.now();
        let activeAppointmentCount = 0;
        let totalBusyMinutes = 0;

        allResDocs.forEach(doc => {
            const data = doc.data();
            if (data.estado === 'Cancelado' || data.estado === 'No asiste') return;

            if (isExpiredPendingDepositReservation(data, nowMs, 20)) {
                doc.ref.update({
                    estado: 'Cancelado',
                    motivo_cancelacion: 'Cancelada automáticamente por falta de pago de anticipo en los 20 minutos de tolerancia.',
                    cancelada_automaticamente: true,
                    cancelado_en: FieldValue.serverTimestamp(),
                }).catch(() => {});
                if (!isSandbox && data.cliente_id) {
                    db.collection('clientes').doc(data.cliente_id).update({
                        citas_canceladas: FieldValue.increment(1)
                    }).catch(() => {});
                }
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

        // Fetch booking rules and settings
        let minReservationBuffer = minReservationBufferMinutes !== undefined ? minReservationBufferMinutes : 30; // Minutes
        let maxDaysFuture = 14;
        let GRID_INTERVAL = 30; // Minutes

        try {
            const rulesSnap = await db.collection('configuracion').doc('reglas_reservas').get();
            if (rulesSnap.exists) {
                const rData = rulesSnap.data();
                if (rData) {
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
                }
            } else {
                const settingsSnap = await db.collection('settings').doc('website').get();
                if (settingsSnap.exists) {
                    const data = settingsSnap.data();
                    if (data) {
                        if (minReservationBufferMinutes === undefined && data.minReservationTime !== undefined) {
                            minReservationBuffer = (Number(data.minReservationTime) || 1) * 60;
                        }
                        if (data.slotInterval) {
                            const parsedInterval = Number(data.slotInterval);
                            if (!isNaN(parsedInterval) && parsedInterval > 0) GRID_INTERVAL = parsedInterval;
                        }
                    }
                }
            }
        } catch (settingsError) {
            console.warn("Could not load booking rules, using defaults.", settingsError);
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
        let db;
        try {
            db = getDb();
        } catch (e: any) {
            console.error("Database connection error:", e);
            return { error: 'Error interno: No se pudo conectar con el sistema de reservas.' };
        }

        if (!db) return { error: 'Database connection failed' };

        // Basic validation
        if (!data.client?.phone || !data.serviceIds?.length || !data.professionalId || !data.date || !data.time) {
            return { error: 'Faltan datos requeridos (Servicios, Profesional, Fecha u Hora)' };
        }

        // 1. Check/Create Client
        const clientsRef = db.collection('clientes');
        let clientId;

        // Fetch Checking Settings
        let validateEmail = true;
        let validatePhone = true;
        let autoClientNumber = true; // Default true
        try {
            const settingsSnap = await db.collection('configuracion').doc('clientes').get();
            if (settingsSnap.exists) {
                const s = settingsSnap.data();
                if (s) {
                    validateEmail = s.validateEmail !== false; // Default true
                    validatePhone = s.validatePhone !== false; // Default true
                    autoClientNumber = s.autoClientNumber !== false; // Default true
                }
            }
        } catch (e) { console.warn("Could not read client settings, defaulting to validation on"); }

        // Attempt to find existing
        let existingDoc;

        if (validateEmail && data.client.email) {
            // 1. Check 'correo' (Standard)
            let q = clientsRef.where('correo', '==', data.client.email).limit(1);
            let snap = await q.get();

            if (!snap.empty) {
                existingDoc = snap.docs[0];
            } else {
                // 2. Fallback: Check 'email' (Legacy)
                q = clientsRef.where('email', '==', data.client.email).limit(1);
                snap = await q.get();
                if (!snap.empty) existingDoc = snap.docs[0];
            }
        }

        if (!existingDoc && validatePhone && data.client.phone) {
            // 3. Check by Phone (supports Mexican 10-digit and International numbers)
            const phoneLookup = normalizePhoneForLookup(data.client.phone);
            for (const variant of phoneLookup.variants) {
                const q = clientsRef.where('telefono', '==', variant).limit(1);
                const snap = await q.get();
                if (!snap.empty) {
                    existingDoc = snap.docs[0];
                    break;
                }
            }
        }
        
        if (!existingDoc && data.client.name && data.client.lastName) {
            // 4. Fallback: Check by Name and Last Name
            const q = clientsRef.where('nombre', '==', data.client.name).where('apellido', '==', data.client.lastName).limit(1);
            const snap = await q.get();
            if (!snap.empty) existingDoc = snap.docs[0];
        }

        if (existingDoc) {
            clientId = existingDoc.id;
            
            // Progressive Enrichment: Update email or phone if missing/placeholder (omit in sandbox mode)
            if (!data.isSandbox) {
                const existingData = existingDoc.data();
                const updates: any = {};
                
                // Check and update Email
                const currentEmail = existingData.correo || existingData.email || '';
                const isInvalidEmail = !currentEmail || currentEmail.toLowerCase() === 'no registrado' || currentEmail.trim() === '' || !currentEmail.includes('@');
                const providedEmail = data.client.email;
                
                if (validateEmail && providedEmail && isInvalidEmail && providedEmail.includes('@')) {
                    updates.correo = providedEmail;
                }
                
                // Check and update Phone
                const currentPhone = existingData.telefono || '';
                const isInvalidPhone = !currentPhone || currentPhone.toLowerCase() === 'no registrado' || currentPhone.trim() === '';
                const providedPhone = data.client.phone;
                
                if (validatePhone && providedPhone && isInvalidPhone && isValidPhoneNumber(providedPhone)) {
                    updates.telefono = providedPhone;
                }
                
                if (Object.keys(updates).length > 0) {
                    await db.collection('clientes').doc(clientId).update(updates);
                    console.log(`[Booking] Enriched existing client ${clientId}:`, updates);
                }
            }
        } else if (data.isSandbox) {
            // In Sandbox Mode, do not create mock client records in production 'clientes' collection
            clientId = `sandbox_cli_${randomUUID().substring(0, 8)}`;
        } else {
            // Determine Custom Client ID (Auto-increment)
            let nextClientNumber = undefined;

            if (autoClientNumber) {
                nextClientNumber = 1;
                try {
                    // Strategy: Check both Strings (legacy) and Numbers to find the true max
                    // 1. Check for max String (default orderBy sorts Strings > Numbers)
                    const maxStringQuery = clientsRef.orderBy('numero_cliente', 'desc').limit(1);
                    const maxStringSnap = await maxStringQuery.get();

                    // 2. Check for max Number (explicitly filter for numbers)
                    const maxNumberQuery = clientsRef.where('numero_cliente', '>=', 0).orderBy('numero_cliente', 'desc').limit(1);
                    const maxNumberSnap = await maxNumberQuery.get();

                    let maxVal = 0;

                    if (!maxStringSnap.empty) {
                        const data = maxStringSnap.docs[0].data();
                        const val = Number(data.numero_cliente);
                        if (!isNaN(val)) maxVal = Math.max(maxVal, val);
                    }

                    if (!maxNumberSnap.empty) {
                        const data = maxNumberSnap.docs[0].data();
                        const val = Number(data.numero_cliente);
                        if (!isNaN(val)) maxVal = Math.max(maxVal, val);
                    }

                    nextClientNumber = maxVal + 1;
                } catch (e) {
                    console.warn("Could not auto-generate client number:", e);
                    // Fallback: leave as undefined or handle error? Proceeding without number is safer than failing booking.
                }
            }

            const newClientData: any = {
                nombre: data.client.name || 'Cliente',
                apellido: data.client.lastName || '',
                telefono: data.client.phone,
                correo: data.client.email || '',
                fecha_nacimiento: data.client.birthday || null,
                notas: data.client.notes || '',
                creado_en: FieldValue.serverTimestamp(),
                origen: data.origin || 'web_publica',
            };

            if (nextClientNumber !== undefined) {
                newClientData.numero_cliente = nextClientNumber;
            }

            const newClientRef = await clientsRef.add(newClientData);
            clientId = newClientRef.id;
        }

        // 2. Fetch Services Details (Preserving duplicate instances for quantities/multiple people)
        const uniqueServiceIds = Array.from(new Set(data.serviceIds as string[]));
        const servicesRefs = uniqueServiceIds.map((id: string) => db.collection('servicios').doc(id));
        const servicesDocs = await db.getAll(...servicesRefs);

        const serviceDocMap = new Map(
            servicesDocs.filter((doc) => doc.exists).map((doc) => [doc.id, { id: doc.id, ...doc.data() }])
        );

        // Preserve all instances requested by the client
        const validServices = (data.serviceIds as string[])
            .map((id: string) => serviceDocMap.get(id))
            .filter((s): s is NonNullable<typeof s> => Boolean(s));

        if (validServices.length === 0) return { error: 'Servicios no encontrados' };

        // 1. Get Professional Schedule
        const profDoc = await db.collection('profesionales').doc(data.professionalId).get();
        if (!profDoc.exists) return { error: 'Profesional no encontrado' };
        const profData = profDoc.data();

        // Check if there is a custom duration from data or from client notes
        let clientCustomDur: number | null = null;
        if (data.duration && Number(data.duration) > 0) {
            clientCustomDur = Number(data.duration);
        } else if (data.customDuration && Number(data.customDuration) > 0) {
            clientCustomDur = Number(data.customDuration);
        } else if (existingDoc) {
            const cNotes = existingDoc.data().notas || existingDoc.data().nota || '';
            clientCustomDur = parseClientCustomDuration(cNotes, profData?.publicName || profData?.name);
            if (clientCustomDur) {
                console.log(`[Booking] Aplicando duración personalizada desde notas del cliente (${existingDoc.id}): ${clientCustomDur} min`);
            }
        }

        let totalDuration = 0;
        if (clientCustomDur && clientCustomDur > 0) {
            if (validServices.length === 1) {
                totalDuration = clientCustomDur;
            } else {
                let firstOverridden = false;
                totalDuration = validServices.reduce((sum: number, s: any) => {
                    if (!firstOverridden && (s.name?.toLowerCase().includes('corte') || validServices.length === 1)) {
                        firstOverridden = true;
                        return sum + clientCustomDur!;
                    }
                    const customDur = s.durationPorProfesional?.[data.professionalId];
                    return sum + (customDur !== undefined ? Number(customDur) : (s.duration || 0));
                }, 0);
            }
        } else {
            totalDuration = validServices.reduce((sum: number, s: any) => {
                const customDur = s.durationPorProfesional?.[data.professionalId];
                return sum + (customDur !== undefined ? Number(customDur) : (s.duration || 0));
            }, 0);
        }

        const totalPrice = validServices.reduce((sum: number, s: any) => sum + (s.price || 0), 0);
        const serviceNames = validServices.map((s: any) => s.name).join(', ');

        // CALCULATE TIMES
        const [h, m] = data.time.split(':').map(Number);
        const startTime = set(parse(data.date, 'yyyy-MM-dd', new Date()), { hours: h, minutes: m });
        const endTime = addMinutes(startTime, totalDuration);
        const endTimeStr = format(endTime, 'HH:mm');
        const startTimeStr = data.time;

        const dayName = format(parse(data.date, 'yyyy-MM-dd', new Date()), 'eeee', { locale: es }).toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // 1.1 NEW VALIDATION: Check if professional performs these services
        const profServices = (profData && Array.isArray(profData.services)) ? profData.services : [];
        if (data.serviceIds && data.serviceIds.length > 0) {
            const unsupportedServices = data.serviceIds.filter((id: string) => !profServices.includes(id));

            if (unsupportedServices.length > 0) {
                // Try to find names for better error message
                const unsupportedNames = validServices
                    .filter((s: any) => unsupportedServices.includes(s.id))
                    .map((s: any) => s.name)
                    .join(', ');

                return { error: `El profesional no realiza los siguientes servicios: ${unsupportedNames || 'Servicios no válidos para este profesional'}` };
            }
        }
        // 1.05 Check for Special Journeys (Manual Overrides)
        const specialDaysSnap = await db.collection('jornadas_especiales')
            .where('profesionalId', '==', data.professionalId)
            .where('fecha', '==', data.date)
            .get();

        // 1.06 Check for Blocks and Enabled Schedules ('bloqueos_horario')
        const blocksSnapshot = await db.collection('bloqueos_horario')
            .where('fecha', '==', data.date)
            .where('barbero_id', '==', data.professionalId)
            .get();

        const availableBlocks: { start: string, end: string }[] = [];
        const blockingBlocks: { start: string, end: string }[] = [];

        blocksSnapshot.forEach(doc => {
            const bData = doc.data();
            if (bData.type === 'available') {
                if (bData.hora_inicio && bData.hora_fin) {
                    availableBlocks.push({ start: bData.hora_inicio, end: bData.hora_fin });
                }
            } else {
                if (bData.hora_inicio && bData.hora_fin) {
                    blockingBlocks.push({ start: bData.hora_inicio, end: bData.hora_fin });
                }
            }
        });

        const isCoveredByAvailable = availableBlocks.some(ab => ab.start <= startTimeStr && ab.end >= endTimeStr);

        let profEffectiveStart = '';
        let profEffectiveEnd = '';
        let isSpecialJourney = false;
        let profBreaks: {start: string, end: string}[] = [];

        if (!specialDaysSnap.empty) {
            const journeys = specialDaysSnap.docs.map(d => d.data());
            journeys.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
            
            profEffectiveStart = journeys[0].hora_inicio;
            profEffectiveEnd = journeys.reduce((latest, j) => j.hora_fin > latest ? j.hora_fin : latest, journeys[0].hora_fin);
            isSpecialJourney = true;
            
            for (let i = 0; i < journeys.length - 1; i++) {
                if (journeys[i].hora_fin < journeys[i+1].hora_inicio) {
                    profBreaks.push({ start: journeys[i].hora_fin, end: journeys[i+1].hora_inicio });
                }
            }
        } else if (isCoveredByAvailable) {
            isSpecialJourney = true;
            profEffectiveStart = startTimeStr;
            profEffectiveEnd = endTimeStr;
        } else {
            const scheduleDay = profData?.schedule?.[dayName];
            if (!scheduleDay || !scheduleDay.enabled) return { error: 'El profesional no trabaja este día.' };
            profEffectiveStart = scheduleDay.start;
            profEffectiveEnd = scheduleDay.end;
            profBreaks = scheduleDay.breaks || [];
        }

        // 1.2 Validate against local shop's hours
        let localData = null;
        let resolvedLocationId = (data.locationId && data.locationId !== 'default') ? data.locationId : null;

        if (resolvedLocationId) {
            const localDoc = await db.collection('locales').doc(resolvedLocationId).get();
            if (localDoc.exists) localData = localDoc.data();
        } else if (profData && profData.local_id) {
            resolvedLocationId = profData.local_id;
            const localDoc = await db.collection('locales').doc(resolvedLocationId).get();
            if (localDoc.exists) localData = localDoc.data();
        }
        
        if (!localData) {
            const locsSnap = await db.collection('locales').limit(1).get();
            if (!locsSnap.empty) {
                localData = locsSnap.docs[0].data();
                resolvedLocationId = locsSnap.docs[0].id;
            }
        }

        const localScheduleDay = localData?.schedule?.[dayName];
        if (!isSpecialJourney) {
            if (!localScheduleDay || !localScheduleDay.enabled) return { error: 'La sucursal se encuentra cerrada este día.' };
        }

        const pStart = profEffectiveStart;
        const pEnd = profEffectiveEnd;
        
        let combinedStart = pStart;
        let combinedEnd = pEnd;

        if (!isSpecialJourney && localScheduleDay && localScheduleDay.enabled) {
            const lStart = localScheduleDay.start;
            const lEnd = localScheduleDay.end;
            combinedStart = pStart > lStart ? pStart : lStart;
            combinedEnd = pEnd < lEnd ? pEnd : lEnd;
        }

        // Check working hours against unified bounds
        if (!isCoveredByAvailable && (startTimeStr < combinedStart || endTimeStr > combinedEnd)) {
            return { error: 'La hora seleccionada está fuera del horario laboral habilitado.' };
        }

        // Check Breaks
        if (!isCoveredByAvailable && profBreaks && Array.isArray(profBreaks)) {
            const isBreak = profBreaks.some((brk: any) => {
                return startTimeStr < brk.end && endTimeStr > brk.start;
            });
            if (isBreak) return { error: 'El horario coincide con el descanso del profesional.' };
        }

        // Check Existing Reservations (In sandbox mode, checks both production and sandbox reservations)
        const reservationsSnapshot = await db.collection('reservas')
            .where('fecha', '==', data.date)
            .get(); // Filter by professional in memory to avoid index issues if not exists

        const allReservationsToCheck = [...reservationsSnapshot.docs];
        if (data.isSandbox) {
            try {
                const sandboxSnapshot = await db.collection('reservas_sandbox')
                    .where('fecha', '==', data.date)
                    .get();
                allReservationsToCheck.push(...sandboxSnapshot.docs);
            } catch (sandboxFetchErr) {
                console.warn('[Booking] Error al consultar reservas_sandbox para conflictos:', sandboxFetchErr);
            }
        }

        const nowCheckMs = Date.now();
        const hasReservationConflict = allReservationsToCheck.some(doc => {
            const res = doc.data();
            if (res.estado === 'Cancelado' || res.estado === 'No asiste') return false;

            if (isExpiredPendingDepositReservation(res, nowCheckMs, 20)) {
                doc.ref.update({
                    estado: 'Cancelado',
                    motivo_cancelacion: 'Cancelada automáticamente por falta de pago de anticipo en los 20 minutos de tolerancia.',
                    cancelada_automaticamente: true,
                    cancelado_en: FieldValue.serverTimestamp(),
                }).catch(() => {});
                if (!data.isSandbox && res.cliente_id) {
                    db.collection('clientes').doc(res.cliente_id).update({
                        citas_canceladas: FieldValue.increment(1)
                    }).catch(() => {});
                }
                return false;
            }

            // Check if it's the same professional
            const isForProf = res.barbero_id === data.professionalId || (res.items && res.items.some((i: any) => i.barbero_id === data.professionalId));
            if (!isForProf) return false;

            return startTimeStr < res.hora_fin && endTimeStr > res.hora_inicio;
        });

        if (hasReservationConflict) return { error: 'Ya existe una reserva en este horario.' };

        // Check Blocks (excluding enabled available slots)
        const hasBlockConflict = blockingBlocks.some(blk => {
            if (isCoveredByAvailable) return false;
            return startTimeStr < blk.end && endTimeStr > blk.start;
        });

        if (hasBlockConflict) return { error: 'El profesional tiene un bloqueo en este horario.' };


        const isProfLocked = data.professional_lock !== undefined ? Boolean(data.professional_lock) : true;
        let firstOverridden = false;
        const items: any[] = validServices.map((s: any) => {
            const customDur = s.durationPorProfesional?.[data.professionalId];
            let itemDur = customDur !== undefined ? Number(customDur) : (s.duration || 0);
            if (clientCustomDur && !firstOverridden && (s.name?.toLowerCase().includes('corte') || validServices.length === 1)) {
                itemDur = clientCustomDur;
                firstOverridden = true;
            }
            return {
                id: s.id,
                nombre: s.name,
                servicio: s.name,
                precio: s.price,
                duracion: itemDur,
                barbero_id: data.professionalId,
                professional_lock: isProfLocked,
                tipo: 'servicio'
            };
        });

        // Add optional physical products (e.g. from Sofía / upsell)
        let productsTotal = 0;
        if (Array.isArray(data.productItems) && data.productItems.length > 0) {
            data.productItems.forEach((p: any) => {
                const prodPrice = Number(p.precio || p.price || 0);
                const prodQty = Number(p.cantidad || p.quantity || 1);
                productsTotal += prodPrice * prodQty;
                items.push({
                    id: p.id || `prod_${Date.now()}`,
                    nombre: p.nombre || p.name || 'Producto',
                    precio: prodPrice,
                    cantidad: prodQty,
                    tipo: 'producto',
                    barbero_id: data.professionalId
                });
            });
        }

        const grandTotal = data.totalAmount ? Number(data.totalAmount) : (totalPrice + productsTotal);

        // --- VALIDACIÓN DE ANTICIPO (MOTOR UNIFICADO DE REGLAS DE RESERVAS) ---
        let bookingRules: ReglasReservasConfig = { ...DEFAULT_BOOKING_RULES };
        try {
            const rulesDoc = await db.collection('configuracion').doc('reglas_reservas').get();
            if (rulesDoc.exists) {
                bookingRules = { ...bookingRules, ...(rulesDoc.data() as any) };
            } else {
                const cfgDoc = await db.collection('configuracion').doc('servicios').get();
                if (cfgDoc.exists) {
                    bookingRules = { ...bookingRules, ...(cfgDoc.data() as any) };
                }
            }
        } catch (e) {
            console.error("Error reading booking rules in createPublicReservation:", e);
        }

        // Validación estricta de ventana máxima a futuro
        try {
            const timeZone = 'America/Mexico_City';
            const nowRaw = new Date();
            const mexicoDateStr = new Intl.DateTimeFormat('en-CA', {
                timeZone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(nowRaw);
            const queryDateObj = parse(data.date, 'yyyy-MM-dd', new Date());
            const nowDateObj = parse(mexicoDateStr, 'yyyy-MM-dd', new Date());
            const daysDiff = Math.round((queryDateObj.getTime() - nowDateObj.getTime()) / (1000 * 60 * 60 * 24));
            const maxDaysFuture = Number(bookingRules.dias_maximos_futuro) || 14;
            if (daysDiff < 0) {
                return { error: 'No es posible agendar en fechas u horarios pasados.' };
            }
            if (daysDiff > maxDaysFuture) {
                return { error: `La fecha seleccionada supera la ventana máxima de reserva permitida (${maxDaysFuture} días a futuro).` };
            }
        } catch (dateErr) {
            console.warn("Error validando ventana máxima de fecha:", dateErr);
        }

        // Historial de inasistencias y cancelaciones del cliente (Escudo Antifraude)
        let clientHistory = null;
        const targetClientId = clientId || existingDoc?.id;
        const rawPhone = data.client?.phone || (existingDoc?.data()?.telefono);
        const phoneLookup = normalizePhoneForLookup(rawPhone);

        if (existingDoc || targetClientId || phoneLookup.isValid) {
            const cData = existingDoc ? (existingDoc.data() || {}) : {};
            const canceladas = Number(cData.citas_canceladas) || 0;
            let noAsistidas = Number(cData.citas_no_asistidas) || 0;

            let realReservationsNoShows = 0;
            try {
                if (targetClientId) {
                    const snapId = await db.collection('reservas')
                        .where('cliente_id', '==', targetClientId)
                        .where('estado', '==', 'No asiste')
                        .get();
                    realReservationsNoShows = Math.max(realReservationsNoShows, snapId.size);
                }
                if (phoneLookup.primary && phoneLookup.isValid) {
                    const snapPhone = await db.collection('reservas')
                        .where('cliente_telefono', '==', phoneLookup.primary)
                        .where('estado', '==', 'No asiste')
                        .get();
                    realReservationsNoShows = Math.max(realReservationsNoShows, snapPhone.size);
                }
            } catch (err) {
                console.warn("[Booking] Error comprobando inasistencias en reservas:", err);
            }

            const trueNoShows = Math.max(noAsistidas, realReservationsNoShows);

            // Sincronizar documento del cliente si estaba desactualizado
            if (existingDoc && trueNoShows > (Number(cData.citas_no_asistidas) || 0)) {
                existingDoc.ref.update({
                    citas_no_asistidas: trueNoShows,
                    actualizado_el: new Date()
                }).catch(() => {});
            }

            clientHistory = {
                citas_canceladas: canceladas,
                citas_no_asistidas: trueNoShows,
            };
        }

        // Escudo Anti-Fragmentación y Acumulado Diario en la Misma Fecha
        let sameDayActiveCount = 0;
        let sameDayActiveTotal = 0;
        try {
            const clientPhoneLookup = normalizePhoneForLookup(data.client?.phone);

            allReservationsToCheck.forEach(doc => {
                const r = doc.data();
                if (r.estado === 'Cancelado' || r.estado === 'Cancelada' || r.estado === 'No asiste') return;

                const matchesId = clientId && r.cliente_id === clientId;
                const resPhoneLookup = normalizePhoneForLookup(r.cliente_telefono);
                const matchesPhone = Boolean(
                    clientPhoneLookup.primary &&
                    resPhoneLookup.primary &&
                    clientPhoneLookup.primary === resPhoneLookup.primary
                );

                if (matchesId || matchesPhone) {
                    sameDayActiveCount += 1;
                    sameDayActiveTotal += Number(r.total || 0);
                }
            });
        } catch (sameDayCheckErr) {
            console.warn("[Booking] Error calculando acumulado diario de citas:", sameDayCheckErr);
        }

        // Evaluación jerárquica: Prioridad 1 (Cliente) -> Prioridad 2 (Servicio) -> Prioridad 3 (Reglas Personalizadas) -> Prioridad 3.5 (Escudo Anti-Fragmentación) -> Prioridad 4 (Global)
        const evalResult = evaluateDepositRequirement({
            totalPrice,
            services: validServices as any,
            clientHistory,
            date: data.date,
            time: data.time,
            totalDurationMinutes: totalDuration,
            isNewClient: !existingDoc,
            sameDayActiveCount,
            sameDayActiveTotal,
            rules: bookingRules,
        });

        const calculatedDeposit = evalResult.depositAmount;
        const requiresDeposit = evalResult.requiresDeposit;
        const depositPercentage = evalResult.depositPercentage;

        // 3. Si la reserva proviene de la web pública (flujo directo sin pasarela):
        const originChannel = data.canal_reserva || data.origin || 'web_publica';
        const isPaid = data.paymentStatus === 'deposit_paid' || data.paymentStatus === 'paid';

        // Bloqueo de reserva online por regla personalizada
        if (originChannel === 'web_publica' && evalResult.blockedOnline) {
            return {
                error: evalResult.blockedReason || 'Esta cita no está disponible para reserva online. Favor de comunicarse directamente a la sucursal.',
                blockedOnline: true
            };
        }

        if (originChannel === 'web_publica' && requiresDeposit && !isPaid) {
            const ruleDetail = evalResult.reason === 'client_history'
                ? ` debido a que registras ${evalResult.clientNoShowsCount} inasistencia(s) previa(s)`
                : (evalResult.reason === 'same_day_accumulation'
                    ? ` (Escudo Anti-Fragmentación: ya cuentas con ${evalResult.sameDayActiveCount} cita(s) activa(s) en esta fecha y tu total acumulado diario alcanza $${(evalResult.sameDayAccumulatedTotal || grandTotal).toFixed(2)} MXN)`
                    : (evalResult.reason === 'opening_hour'
                        ? ` por tratarse de la franja de apertura (${bookingRules.anticipo_horario_apertura_hora || '10:00'} a ${bookingRules.anticipo_horario_apertura_hora_fin || '10:30'} AM)`
                        : (evalResult.customRuleMessage ? ` (${evalResult.customRuleMessage})` : '')));
            return {
                error: `Esta reserva requiere un anticipo del ${depositPercentage}% ($${calculatedDeposit} MXN)${ruleDetail}. Por favor realiza el pago en línea para confirmar tu cita.`,
                requiresPayment: true,
                depositAmount: calculatedDeposit
            };
        }

        const finalAmountDue = data.amountDue !== undefined && Number(data.amountDue) >= calculatedDeposit 
            ? Number(data.amountDue) 
            : (requiresDeposit ? calculatedDeposit : (Number(data.amountDue) || 0));

        const finalRequiresDeposit = requiresDeposit || finalAmountDue > 0;

        // 4. Create Reservation
        const reservationData = {
            cliente_id: clientId,
            cliente_telefono: data.client.phone || '',
            cliente_nombre: `${data.client.name || ''} ${data.client.lastName || ''}`.trim(),
            barbero_id: data.professionalId, // Main professional
            professional_lock: isProfLocked,
            fecha: data.date,
            hora_inicio: data.time,
            hora_fin: endTimeStr,
            estado: data.status || (finalRequiresDeposit && !isPaid ? 'Pendiente de pago' : 'Reservado'),
            servicio: serviceNames, // Legacy field: concatenated names
            local_id: resolvedLocationId || 'default',
            items: items,
            total: grandTotal,
            origen: originChannel,
            canal_reserva: originChannel,
            createdAt: FieldValue.serverTimestamp(),
            // Financials for Upfront Payment
            pago_estado: data.paymentStatus || (finalRequiresDeposit && !isPaid ? 'pending_payment' : 'pendiente'),
            anticipo_esperado: finalAmountDue,
            saldo_pendiente: isPaid ? Math.max(0, grandTotal - finalAmountDue) : grandTotal,
            requiere_pago_anticipado: finalRequiresDeposit
        };

        // MODO SANDBOX / PRUEBAS LOCAL:
        // No altera la agenda real de la barbería ni envía correos reales.
        if (data.isSandbox) {
            let sandboxId = `SANDBOX-${Math.floor(100000 + Math.random() * 900000)}`;
            try {
                const sRef = await db.collection('reservas_sandbox').add({
                    ...reservationData,
                    isSandbox: true,
                    creado_en: FieldValue.serverTimestamp(),
                    simulatedAt: FieldValue.serverTimestamp()
                });
                sandboxId = sRef.id;
            } catch (sandboxErr) {
                console.warn('[SANDBOX] Guardado en reservas_sandbox omitido:', sandboxErr);
            }

            console.log(`[SANDBOX BOOKING] Reserva de prueba completada exitosamente sin afectar la agenda real (ID: ${sandboxId})`);
            return {
                success: true,
                reservationId: sandboxId,
                isSandbox: true,
                warning: 'Modo Pruebas: Cita simulada correctamente (no afectó la agenda de la barbería ni envió correos).'
            };
        }

        const resRef = await db.collection('reservas').add(reservationData);

        // Generate and store action token for email quick actions
        const actionToken = randomUUID();
        await db.collection('reservas').doc(resRef.id).update({ actionToken });

        // --- EMAIL NOTIFICATIONS ---
        let emailWarning = null;
        try {
            // Await execution to ensure delivery in Serverless environment (Next.js Server Actions)
            await sendBookingConfirmation({ ...reservationData, id: resRef.id, actionToken }, db, data.client.email, data.professionalId);
        } catch (emailError: any) {
            console.error("Failed to send confirmation emails:", emailError);
            emailWarning = `Email falló: ${emailError.message}`;
        }

        return { success: true, reservationId: resRef.id, warning: emailWarning };

    } catch (error: any) {
        console.error("Error creating reservation:", error);
        return { error: error.message };
    }
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
                tolerancia_puntualidad_minutos: 10,
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
                tolerancia_puntualidad_minutos: Number(data.tolerancia_puntualidad_minutos) || 10,
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
                tolerancia_puntualidad_minutos: 10,
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
        tolerancia_puntualidad_minutos: 10,
    };
}

// --- CLIENT BOOKING ELIGIBILITY CHECK (SERVER ACTION) ---
export async function checkClientBookingEligibility(
    identifier: string,
    targetDate?: string,
    newBookingTotal?: number
): Promise<{
    requiresDepositDueToHistory: boolean;
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

        const totalFaltas = canceladas + realNoShows;
        const maxPermitidas = Number(config.max_inasistencias_permitidas) || 2;
        const requiresDeposit = config.penalizacion_inasistencias_activa && ((realNoShows >= maxPermitidas) || (totalFaltas >= maxPermitidas));

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

        if (config.anticipo_monto_minimo_activo && sameDayActiveCount > 0) {
            if (sameDayAccumulatedTotal >= minThreshold || sameDayActiveCount >= 1) {
                requiresDepositDueToSameDay = true;
                sameDayDepositReason = `Detectamos que ya cuentas con ${sameDayActiveCount} cita(s) programada(s) para este día ($${sameDayActiveTotal.toFixed(2)} MXN). Al reservar este horario adicional y acumular $${sameDayAccumulatedTotal.toFixed(2)} MXN en la fecha, se requiere un anticipo del ${defaultPercent}% de garantía.`;
            }
        }

        return {
            requiresDepositDueToHistory: requiresDeposit,
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

// --- EMAIL HELPER ---
import { Resend } from 'resend';

async function sendBookingConfirmation(reservation: any, db: any, clientEmail: string, professionalId: string) {
    if (!clientEmail && !professionalId) return;

    // Direct error propagation - no try/catch wrapping the whole thing
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
        throw new Error("RESEND_API_KEY is missing in server environment.");
    }
    const resend = new Resend(resendApiKey);

    // 1. Fetch Configuration & Sender
    const [emailConfigDoc, websiteSettingsDoc, empresaSnap, professionalDoc, localDoc, clientDoc] = await Promise.all([
        db.collection('configuracion').doc('emails').get(),
        db.collection('settings').doc('website').get(),
        db.collection('empresa').limit(1).get(),
        professionalId ? db.collection('profesionales').doc(professionalId).get() : Promise.resolve({ exists: false, data: () => ({}) }),
        reservation.local_id ? db.collection('locales').doc(reservation.local_id).get() : Promise.resolve({ exists: false, data: () => ({}) }),
        reservation.cliente_id ? db.collection('clientes').doc(reservation.cliente_id).get() : Promise.resolve({ exists: false, data: () => ({}) })
    ]);

    const emailConfig = emailConfigDoc.exists ? emailConfigDoc.data() : {};
    const websiteSettings = websiteSettingsDoc.exists ? websiteSettingsDoc.data() : {};
    const empresaConfig = !empresaSnap.empty ? empresaSnap.docs[0].data() : {};
    const professional = professionalDoc.exists ? professionalDoc.data() : {};
    const localData = localDoc.exists ? localDoc.data() : {};
    const clientData = clientDoc.exists ? clientDoc.data() : {};

    // --- BUILD BCC LIST for CC Admins ---
    const ccAdminsConfig = websiteSettings.ccAdminsConfig || {};
    let resolvedBcc: string[] = [];

    try {
        const bccCollect: string[] = [];

        if (ccAdminsConfig.notifyGeneralAdmin) {
            const generalAdminsSnap = await db.collection('usuarios')
                .where('role', '==', 'Administrador general')
                .limit(5)
                .get();
            generalAdminsSnap.forEach((adminDoc: any) => {
                const u = adminDoc.data();
                if (u.email && u.email.includes('@')) bccCollect.push(u.email);
            });
        }

        if (ccAdminsConfig.notifyLocalAdmin && reservation.local_id) {
            const localAdminsSnap = await db.collection('usuarios')
                .where('role', '==', 'Administrador local')
                .where('local_id', '==', reservation.local_id)
                .limit(5)
                .get();
            localAdminsSnap.forEach((adminDoc: any) => {
                const u = adminDoc.data();
                if (u.email && u.email.includes('@')) bccCollect.push(u.email);
            });
        }

        // Remove duplicates and exclude the professional's own email
        resolvedBcc = [...new Set(bccCollect)].filter(e => e !== professional.email);
        console.log(`[Email-Pro] BCC list: ${resolvedBcc.join(', ') || 'empty'}`);
    } catch (bccError) {
        console.error('[Email-Pro] Error building BCC list:', bccError);
    }

    // Determine Sender
    const senderName = empresaConfig.name || 'VATOS ALFA Barber Shop';
    const senderEmail = 'contacto@vatosalfa.com'; // Default verified
    const logoUrl = empresaConfig.logo_url || empresaConfig.icon_url || 'https://vatosalfa.com/logo.png';
    const secondaryColor = empresaConfig.theme?.secondaryColor || '#314177';

    // Construct Sender String correctly
    let fromEmail = `${senderName} <${senderEmail}>`;

    // Override with configured sender if available
    if (emailConfig.senders && Array.isArray(emailConfig.senders)) {
        const primary = emailConfig.senders.find((s: any) => s.isPrimary && s.confirmed);
        const anyConfirmed = emailConfig.senders.find((s: any) => s.confirmed);
        const sender = primary || anyConfirmed;
        if (sender) fromEmail = `${senderName} <${sender.email}>`;
    }

    // Common Data formatting
    const itemsList = reservation.items || [{ servicio: reservation.servicio || 'Servicio' }];
    const itemsListHtml = itemsList.map((i: any) =>
        `<div style="margin-bottom: 8px; font-family: 'Roboto', Arial, sans-serif; font-size: 1.4em; font-weight: 700; color: #333;">${i.nombre || i.servicio || 'Servicio'}</div>`
    ).join('');

    let dateStr = reservation.fecha;
    try {
        // Try parsing if it's YYYY-MM-DD
        if (reservation.fecha && typeof reservation.fecha === 'string' && reservation.fecha.includes('-')) {
            const dateObj = parse(reservation.fecha, 'yyyy-MM-dd', new Date());
            dateStr = format(dateObj, "EEEE, d 'de' MMMM, yyyy", { locale: es });
        }
    } catch (e) {
        console.log("Date parsing skipped:", e);
    }

    const timeStr = reservation.hora_inicio || '00:00';

    const localAddress = localData.address || localData.direccion || 'Sucursal Principal';
    const localPhone = localData.phone || localData.telefono || '';
    const whatsappLink = localPhone ? `https://wa.me/${localPhone.replace(/\D/g, '')}` : '#';

    // --- CLIENT EMAIL ---
    const clientConfig = websiteSettings.confirmationEmailConfig || {};
    const isClientEnabled = clientEmail && clientConfig.enabled !== false;

    if (isClientEnabled) {
        const tpl = websiteSettings.confirmationEmailTemplate || {};
        const subject = `${tpl.subject || 'Confirmación de Cita'} - ${senderName}`;

        const showDate = clientConfig.showDate !== false;
        const showTime = clientConfig.showTime !== false;
        const showProfessional = clientConfig.showProfessional !== false;
        const showLocation = clientConfig.showLocation !== false;
        const showServices = clientConfig.showServices !== false;
        const yellowNote = websiteSettings.predefinedNotes || 'Favor de llegar 5 minutos antes de la hora de tu cita.';

        const quickActions = websiteSettings.quickActionsConfig || {};
        const isQuickActionsEnabled = quickActions.enabled === true;
        const waPhone = localPhone.replace(/\D/g, '');
        const appBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://vatosalfa.com';
        const actionApiUrl = `${appBaseUrl}/api/cita/action`;
        const confirmLink = reservation.actionToken
            ? `${actionApiUrl}?token=${reservation.actionToken}&action=confirm`
            : `https://wa.me/${waPhone}?text=${encodeURIComponent(`¡Hola! Confirmo mi cita para el ${dateStr} a las ${timeStr}.`)}`;
        const rescheduleLink = `https://wa.me/${waPhone}?text=${encodeURIComponent(`¡Hola! Requiero reagendar mi cita del ${dateStr} a las ${timeStr}.`)}`;
        const cancelLink = reservation.actionToken
            ? `${actionApiUrl}?token=${reservation.actionToken}&action=cancel`
            : `https://wa.me/${waPhone}?text=${encodeURIComponent(`¡Hola! Deseo cancelar mi cita del ${dateStr} a las ${timeStr}.`)}`;

        const html = `
            <div style="font-family: 'Roboto', Arial, sans-serif; color: #333; max-width: 100%; padding: 20px; background-color: #f4f4f4;">
            <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet">
            
            <div style="max-width: 400px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div style="background-color: #ffffff; padding: 25px 20px 10px 20px; text-align: center;">
                    <img src="${logoUrl}" alt="${senderName}" style="width: 100%; max-width: 280px; height: auto; object-fit: contain;" />
                </div>

                <div style="padding: 25px;">
                    <h2 style="color: ${secondaryColor}; text-align: center; margin-top: 5px; margin-bottom: 5px; font-family: 'Roboto', Arial, sans-serif; font-weight: 700; font-size: 24px; line-height: 1.2;">${(tpl.headline || '¡Hola {nombre}, tu cita está confirmada!').replace('{nombre}', clientData.nombre || '').replace(/  +/g, ' ')}</h2>
                    
                    ${showServices ? `<div style="margin-bottom: 25px; text-align: center;">${itemsListHtml}</div>` : ''}

                    <table style="width: 100%; border-collapse: separate; border-spacing: 0 12px;">
                            ${showDate ? `<tr>
                            <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/2693/2693507.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td> 
                            <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${dateStr}</td>
                            </tr>` : ''}
                            
                            ${showTime ? `<tr>
                            <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/2972/2972531.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                            <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${timeStr}</td>
                            </tr>` : ''}

                            ${showProfessional ? `<tr>
                                <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/1077/1077114.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                                <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${professional.name || 'Profesional'}</td>
                            </tr>` : ''}

                            ${showLocation ? `<tr>
                                <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/535/535239.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                                <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${localAddress}</td>
                            </tr>` : ''}
                    </table>

                    <div style="background-color: #ffffff; color: #333; padding: 15px; border-radius: 8px; font-size: 0.9em; margin-top: 25px; text-align: center; border: 1px solid #000000;">
                        ${yellowNote.replace(/\n/g, '<br/>')}
                    </div>

                    ${isQuickActionsEnabled ? `
                    <div style="margin-top: 25px; text-align: center;">
                        <div style="display: block; width: 100%;">
                            ${quickActions.showConfirm ? `
                            <a href="${confirmLink}" style="display: inline-block; background-color: #22c55e; color: white; padding: 10px 14px; border-radius: 8px; text-decoration: none; font-size: 11px; font-weight: bold; margin: 5px; font-family: 'Roboto', Arial, sans-serif;">CONFIRMAR</a>` : ''}
                            ${quickActions.showReschedule ? `
                            <a href="${rescheduleLink}" style="display: inline-block; background-color: #314177; color: white; padding: 10px 14px; border-radius: 8px; text-decoration: none; font-size: 11px; font-weight: bold; margin: 5px; font-family: 'Roboto', Arial, sans-serif;">REAGENDAR</a>` : ''}
                            ${quickActions.showCancel ? `
                            <a href="${cancelLink}" style="display: inline-block; background-color: #ef4444; color: white; padding: 10px 14px; border-radius: 8px; text-decoration: none; font-size: 11px; font-weight: bold; margin: 5px; font-family: 'Roboto', Arial, sans-serif;">CANCELAR</a>` : ''}
                        </div>
                    </div>` : ''}

                    <div style="margin-top: 25px; text-align: left;">
                        <div style="margin-bottom: 12px; padding-left: 2px;">
                            <a href="${whatsappLink}" style="text-decoration: none; color: #333; display: inline-flex; align-items: center;">
                                <img src="https://cdn-icons-png.flaticon.com/512/3670/3670051.png" width="20" style="margin-right: 12px;" alt="WhatsApp" />
                                <span style="font-weight: 700; font-size: 1em;">${tpl.whatsappText || 'Contáctanos por WhatsApp'}</span>
                            </a>
                        </div>
                        <div style="display: flex; align-items: center; color: #333; padding-left: 2px;">
                                <img src="https://cdn-icons-png.flaticon.com/512/724/724664.png" width="20" style="margin-right: 12px; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);" alt="Teléfono" />
                                <span style="font-weight: 700; font-size: 1em;">${localPhone}</span>
                        </div>
                    </div>
                </div>
                
                <div style="background-color: #ffffff; padding: 20px; text-align: center; font-size: 0.75em; color: #bbb; border-top: 1px solid #f9f9f9;">
                    ${emailConfig.signature ? emailConfig.signature.replace(/\n/g, '<br/>') : senderName}
                </div>
            </div>
        </div>`;

        await resend.emails.send({
            from: fromEmail,
            to: clientEmail,
            subject: subject,
            html: html
        });
        
        // --- TRACK EMAIL STATUS ---
        try {
            if (reservation.id) {
                await db.collection('reservas').doc(reservation.id).update({
                    'notifications.email_confirmation_sent': true,
                    'notifications.email_confirmation_sent_at': Timestamp.now()
                });
            }
        } catch (updateError) {
            console.error("Failed to track email status:", updateError);
        }

        console.log(`[Email] Client confirmation sent to ${clientEmail}`);
    } else {
        console.log(`[Email] Skipping Client Email. Email: ${clientEmail}, Enabled: ${clientConfig.enabled}`);
    }

    // --- PROFESSIONAL EMAIL ---
    const profConfig = websiteSettings.professionalConfirmationEmailConfig || {};
    let isProfEnabled = professional.email && profConfig.enabled !== false;

    // QUIET HOURS LOGIC: Skip if < 8:00 AM or > Today's Closing Time
    if (isProfEnabled) {
        try {
            const timeZone = localData.timezone || 'America/Mexico_City';
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('es-MX', {
                timeZone,
                weekday: 'long',
                hour: 'numeric',
                minute: 'numeric',
                hour12: false
            });
            const parts = formatter.formatToParts(now);
            const dayName = parts.find(p => p.type === 'weekday')?.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || '';
            const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
            const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
            const currentMinutes = hour * 60 + minute;
            const summaryTimeMinutes = 8 * 60; // 08:00 AM

            const schedule = localData.schedule || {};
            const scheduleDay = schedule[dayName];

            if (scheduleDay && scheduleDay.enabled && scheduleDay.end) {
                const [endH, endM] = scheduleDay.end.split(':').map(Number);
                const endMinutes = endH * 60 + endM;

                // Rule: If it's too early (before Daily Summary) OR too late (After closing), SKIP.
                if (currentMinutes < summaryTimeMinutes || currentMinutes > endMinutes) {
                    console.log(`[Email-Pro] Quiet Hours enforced (Current: ${hour}:${minute}, Window: 08:00-${scheduleDay.end}). Skipping email.`);
                    isProfEnabled = false;
                }
            } else {
                // Shop Closed today: Skip email (relies on next available Summary)
                console.log(`[Email-Pro] Shop Closed or No Schedule for ${dayName}. Skipping email.`);
                isProfEnabled = false;
            }
        } catch (e) {
            console.error("Error checking quiet hours:", e);
        }
    }

    if (isProfEnabled) {
        const profTpl = websiteSettings.professionalConfirmationEmailTemplate || {};

        // Subject with variable replacement
        let subject = (profTpl.subject || `Nueva Cita - {cliente}`).replace('{cliente}', clientData.nombre || 'Cliente');

        const showDate = profConfig.showDate !== false;
        const showTime = profConfig.showTime !== false;
        const showClientName = profConfig.showClientName !== false;
        const showLocation = profConfig.showLocation !== false;
        const showServices = profConfig.showServices !== false;
        const note = profConfig.note || '';

        // Headline with variable replacement
        let headline = (profTpl.headline || `¡{profesional}, tienes una nueva cita!`).replace('{profesional}', professional.name || 'Profesional');

        const html = `
                <div style="font-family: 'Roboto', Arial, sans-serif; color: #333; max-width: 100%; padding: 20px; background-color: #f4f4f4;">
                <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet">
                
                <div style="max-width: 400px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <div style="background-color: #ffffff; padding: 25px 20px 10px 20px; text-align: center;">
                        <img src="${logoUrl}" alt="${senderName}" style="width: 100%; max-width: 280px; height: auto; object-fit: contain;" />
                    </div>

                    <div style="padding: 25px;">
                        <h2 style="color: ${secondaryColor}; text-align: center; margin-top: 5px; margin-bottom: 5px; font-family: 'Roboto', Arial, sans-serif; font-weight: 700; font-size: 24px; line-height: 1.2;">${headline}</h2>
                        
                        ${showServices ? `<div style="margin-bottom: 25px; text-align: center;">${itemsListHtml}</div>` : ''}

                        <table style="width: 100%; border-collapse: separate; border-spacing: 0 12px;">
                            ${showDate ? `<tr>
                                <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/2693/2693507.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td> 
                                <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${dateStr}</td>
                            </tr>` : ''}
                            
                            ${showTime ? `<tr>
                                <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/2972/2972531.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                                <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${timeStr}</td>
                            </tr>` : ''}

                            ${showClientName ? `<tr>
                                    <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/1077/1077114.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                                    <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${clientData.nombre || 'Cliente'} ${clientData.apellido || ''}</td>
                                </tr>` : ''}

                            ${showLocation ? `<tr>
                                    <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/535/535239.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                                    <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${localAddress}</td>
                                </tr>` : ''}
                        </table>

                        ${note ? `
                        <div style="background-color: #ffffff; color: #333; padding: 15px; border-radius: 8px; font-size: 0.9em; margin-top: 25px; text-align: center; border: 1px solid #000000;">
                            ${note.replace(/\n/g, '<br/>')}
                        </div>` : ''}
                    </div>
                    
                    <div style="background-color: #ffffff; padding: 20px; text-align: center; font-size: 0.75em; color: #bbb; border-top: 1px solid #f9f9f9;">
                        ${emailConfig.signature ? emailConfig.signature.replace(/\n/g, '<br/>') : senderName}
                    </div>
                </div>
                </div>
                `;

        await resend.emails.send({
            from: fromEmail,
            to: professional.email,
            bcc: resolvedBcc.length > 0 ? resolvedBcc : undefined,
            subject: subject,
            html: html
        });
        console.log(`[Email] Professional confirmation sent to ${professional.email}${resolvedBcc.length > 0 ? ` (BCC: ${resolvedBcc.join(', ')})` : ''}`);

    } else {
        console.log(`[Email] Skipping Professional Email. Email: ${professional.email}, Enabled: ${profConfig.enabled}`);
    }
}

// --- CANCELLATION EMAIL HELPER ---
export interface SendBookingCancellationParams {
    reservationId?: string;
    reservation?: any;
    reason?: string;
    clientEmail?: string;
    forceSend?: boolean;
}

export async function sendBookingCancellation(params: SendBookingCancellationParams) {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
        console.error("[Email Cancellation] RESEND_API_KEY is missing in server environment.");
        return { error: "RESEND_API_KEY missing" };
    }
    const resend = new Resend(resendApiKey);

    const db = getDb();
    if (!db) {
        return { error: "Database not available" };
    }

    try {
        let reservation = params.reservation || null;
        const reservationId = params.reservationId || (reservation ? reservation.id : null);

        if (reservationId && (!reservation || !reservation.fecha)) {
            const resDoc = await db.collection('reservas').doc(reservationId).get();
            if (resDoc.exists) {
                reservation = { ...resDoc.data(), id: resDoc.id };
            }
        }

        if (!reservation) {
            return { error: "Reserva no encontrada para enviar correo de cancelación" };
        }

        // Check if already sent
        if (!params.forceSend && reservation.notifications?.email_cancellation_sent) {
            console.log(`[Email Cancellation] Already sent for reservation ${reservation.id || reservationId}`);
            return { success: true, skipped: true, reason: 'Already sent' };
        }

        // Fetch configs in parallel
        const [emailConfigDoc, websiteSettingsDoc, empresaSnap] = await Promise.all([
            db.collection('configuracion').doc('emails').get(),
            db.collection('settings').doc('website').get(),
            db.collection('empresa').limit(1).get()
        ]);

        const emailConfig: any = emailConfigDoc.exists ? emailConfigDoc.data() : {};
        const websiteSettings: any = websiteSettingsDoc.exists ? websiteSettingsDoc.data() : {};
        const empresaConfig: any = !empresaSnap.empty ? empresaSnap.docs[0].data() : {};

        const cancelConfig = websiteSettings.cancellationEmailConfig || {};
        if (cancelConfig.enabled === false && !params.forceSend) {
            console.log("[Email Cancellation] Cancellation emails are disabled in configuration.");
            return { success: true, skipped: true, reason: 'Disabled in config' };
        }

        // Resolve client email and client name
        let clientEmail = params.clientEmail || reservation.cliente_email || reservation.customer?.correo || reservation.customer?.email || '';
        let clientName = reservation.cliente_nombre || reservation.customer?.nombre || '';

        if (!clientEmail && reservation.cliente_id) {
            try {
                const clientDoc = await db.collection('clientes').doc(reservation.cliente_id).get();
                if (clientDoc.exists) {
                    const cData = clientDoc.data() || {};
                    clientEmail = cData.correo || cData.email || '';
                    if (!clientName) clientName = cData.nombre || '';
                }
            } catch (err) {
                console.error("[Email Cancellation] Error fetching client doc:", err);
            }
        }

        if (!clientEmail) {
            console.log(`[Email Cancellation] No client email found for reservation ${reservation.id || reservationId}. Skipping.`);
            return { success: true, skipped: true, reason: 'No client email' };
        }

        // Resolve professional and location
        const professionalId = reservation.barbero_id || (reservation.items && reservation.items[0] ? reservation.items[0].barbero_id : '');
        const [profDoc, locDoc] = await Promise.all([
            professionalId ? db.collection('profesionales').doc(professionalId).get() : Promise.resolve({ exists: false, data: () => ({}) }),
            reservation.local_id ? db.collection('locales').doc(reservation.local_id).get() : Promise.resolve({ exists: false, data: () => ({}) })
        ]);
        const professional: any = profDoc.exists ? profDoc.data() : {};
        const localData: any = locDoc.exists ? locDoc.data() : {};

        const professionalName = professional.name || reservation.barbero_nombre || 'Profesional';
        const localAddress = localData.address || localData.direccion || 'Sucursal Principal';
        const localPhone = localData.phone || localData.telefono || '';
        const whatsappLink = localPhone ? `https://wa.me/${localPhone.replace(/\D/g, '')}` : '#';

        // Sender setup
        const senderName = empresaConfig.name || 'VATOS ALFA Barber Shop';
        const defaultSenderEmail = 'contacto@vatosalfa.com';
        let fromEmail = `${senderName} <${defaultSenderEmail}>`;

        if (emailConfig.senders && Array.isArray(emailConfig.senders)) {
            const primary = emailConfig.senders.find((s: any) => s.isPrimary && s.confirmed);
            const anyConfirmed = emailConfig.senders.find((s: any) => s.confirmed);
            const sender = primary || anyConfirmed;
            if (sender) fromEmail = `${senderName} <${sender.email}>`;
        }

        const logoUrl = empresaConfig.logo_url || empresaConfig.icon_url || 'https://vatosalfa.com/logo.png';
        const secondaryColor = empresaConfig.theme?.secondaryColor || '#314177';

        // Date & Time formatting
        let dateStr = reservation.fecha || '';
        try {
            if (dateStr && typeof dateStr === 'string' && dateStr.includes('-')) {
                const dateObj = parse(dateStr, 'yyyy-MM-dd', new Date());
                dateStr = format(dateObj, "EEEE, d 'de' MMMM, yyyy", { locale: es });
            }
        } catch (e) {
            console.log("Date parsing skipped:", e);
        }
        const timeStr = reservation.hora_inicio || '00:00';

        // Services formatting
        const itemsList = reservation.items || [{ servicio: reservation.servicio || 'Servicio' }];
        const itemsListHtml = itemsList.map((i: any) =>
            `<div style="margin-bottom: 4px; font-family: 'Roboto', Arial, sans-serif; font-size: 1.35em; font-weight: 700; color: #1e293b;">${i.nombre || i.servicio || 'Servicio'}</div>`
        ).join('');

        // Template strings
        const tpl = websiteSettings.cancellationEmailTemplate || {};
        const subject = `${tpl.subject || 'Cancelación de Cita'} - ${senderName}`;
        let headline = tpl.headline || '¡Hola {nombre}, tu cita ha sido cancelada!';
        headline = headline.replace('{nombre}', clientName || 'Estimado(a) Cliente').replace(/  +/g, ' ');

        const cancellationNote = tpl.note || 'Lamentamos informarte que tu cita ha sido cancelada. Si deseas volver a agendar con nosotros, puedes reservar una nueva cita en línea cuando gustes.';
        const buttonText = tpl.buttonText || 'AGENDAR NUEVA CITA';
        const buttonUrl = tpl.buttonUrl || 'https://vatosalfa.com/reservar';
        const whatsappText = tpl.whatsappText || 'Contáctanos por WhatsApp';

        const showDate = cancelConfig.showDate !== false;
        const showTime = cancelConfig.showTime !== false;
        const showProfessional = cancelConfig.showProfessional !== false;
        const showLocation = cancelConfig.showLocation !== false;
        const showServices = cancelConfig.showServices !== false;
        const showReason = cancelConfig.showReason !== false;
        const showButton = cancelConfig.showButton !== false;

        const cancellationReason = params.reason || reservation.motivo_cancelacion || '';

        const html = `
        <div style="font-family: 'Roboto', Arial, sans-serif; color: #1e293b; max-width: 100%; padding: 25px 12px; background-color: #f1f5f9;">
            <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;600;700&display=swap" rel="stylesheet">
            
            <div style="max-width: 420px; margin: 0 auto; background-color: #ffffff; border-radius: 18px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
                <div style="background-color: #ffffff; padding: 25px 25px 12px 25px; text-align: center;">
                    <img src="${logoUrl}" alt="${senderName}" style="display: block; margin: 0 auto; width: 100%; max-width: 250px; height: auto; object-fit: contain;" />
                </div>

                <div style="padding: 10px 26px 26px 26px;">
                    <div style="text-align: center; margin-bottom: 12px;">
                        <span style="display: inline-block; background-color: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; font-size: 11px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; padding: 4px 12px; border-radius: 9999px;">CITA CANCELADA</span>
                    </div>

                    <h2 style="color: #0f172a; text-align: center; margin-top: 0px; margin-bottom: 8px; font-family: 'Roboto', Arial, sans-serif; font-weight: 700; font-size: 22px; line-height: 1.25;">
                        ${headline}
                    </h2>
                    
                    ${showServices ? `<div style="margin-bottom: 20px; text-align: center;">${itemsListHtml}</div>` : ''}

                    <table style="width: 100%; border-collapse: separate; border-spacing: 0 10px; margin-bottom: 15px;">
                        ${showDate ? `<tr>
                            <td style="width: 26px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/2693/2693507.png" width="20" height="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td> 
                            <td style="font-weight: 600; font-size: 0.98em; color: #334155; vertical-align: middle; padding-left: 12px;">${dateStr}</td>
                        </tr>` : ''}
                        
                        ${showTime ? `<tr>
                            <td style="width: 26px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/2972/2972531.png" width="20" height="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                            <td style="font-weight: 600; font-size: 0.98em; color: #334155; vertical-align: middle; padding-left: 12px;">${timeStr}</td>
                        </tr>` : ''}

                        ${showProfessional ? `<tr>
                            <td style="width: 26px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/1077/1077114.png" width="20" height="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                            <td style="font-weight: 600; font-size: 0.98em; color: #334155; vertical-align: middle; padding-left: 12px;">${professionalName}</td>
                        </tr>` : ''}

                        ${showLocation ? `<tr>
                            <td style="width: 26px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/535/535239.png" width="20" height="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                            <td style="font-weight: 600; font-size: 0.98em; color: #334155; vertical-align: middle; padding-left: 12px;">${localAddress}</td>
                        </tr>` : ''}
                    </table>

                    <div style="background-color: #f8fafc; color: #334155; padding: 16px; border-radius: 10px; font-size: 0.9em; margin-top: 18px; text-align: center; border: 1px solid #e2e8f0; line-height: 1.45;">
                        ${showReason && cancellationReason ? `
                        <div style="font-weight: 700; color: #b91c1c; margin-bottom: 6px; font-size: 0.95em;">
                            Motivo: <span style="font-weight: 500; color: #475569;">${cancellationReason}</span>
                        </div>` : ''}
                        <div style="color: #475569;">
                            ${cancellationNote.replace(/\n/g, '<br/>')}
                        </div>
                    </div>

                    ${showButton ? `
                    <div style="margin-top: 24px; text-align: center;">
                        <a href="${buttonUrl}" style="display: inline-block; background-color: ${secondaryColor}; color: #ffffff; padding: 13px 26px; border-radius: 8px; text-decoration: none; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; font-family: 'Roboto', Arial, sans-serif;">
                            ${buttonText}
                        </a>
                    </div>` : ''}

                    <div style="margin-top: 24px; text-align: left; padding-top: 18px; border-top: 1px solid #f1f5f9;">
                        <div style="margin-bottom: 12px; padding-left: 2px;">
                            <a href="${whatsappLink}" style="text-decoration: none; color: #1e293b; display: inline-flex; align-items: center;">
                                <img src="https://cdn-icons-png.flaticon.com/512/3670/3670051.png" width="20" height="20" style="margin-right: 12px; display: inline-block; vertical-align: middle;" alt="WhatsApp" />
                                <span style="font-weight: 700; font-size: 0.95em;">${whatsappText}</span>
                            </a>
                        </div>
                        ${localPhone ? `
                        <div style="display: flex; align-items: center; color: #1e293b; padding-left: 2px;">
                            <img src="https://cdn-icons-png.flaticon.com/512/724/724664.png" width="20" height="20" style="margin-right: 12px; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%); display: inline-block; vertical-align: middle;" alt="Teléfono" />
                            <span style="font-weight: 700; font-size: 0.95em;">${localPhone}</span>
                        </div>` : ''}
                    </div>
                </div>
                
                <div style="background-color: #fbfbfc; padding: 18px; text-align: center; font-size: 0.75em; color: #94a3b8; border-top: 1px solid #f1f5f9;">
                    ${emailConfig.signature ? emailConfig.signature.replace(/\n/g, '<br/>') : senderName}
                </div>
            </div>
        </div>
        `;

        const resendResponse = await resend.emails.send({
            from: fromEmail,
            to: clientEmail,
            subject: subject,
            html: html
        });

        if (resendResponse.error) {
            console.error("[Email Cancellation] Resend error:", resendResponse.error);
            return { error: resendResponse.error.message };
        }

        // Track email status in Firestore
        const finalResId = reservation.id || reservationId;
        if (finalResId && !params.forceSend) {
            try {
                await db.collection('reservas').doc(finalResId).update({
                    'notifications.email_cancellation_sent': true,
                    'notifications.email_cancellation_sent_at': Timestamp.now()
                });
            } catch (err) {
                console.error("[Email Cancellation] Failed to update reservation flags:", err);
            }
        }

        console.log(`[Email Cancellation] Successfully sent to ${clientEmail}. Resend ID: ${resendResponse.data?.id}`);
        return { success: true, id: resendResponse.data?.id };

    } catch (error: any) {
        console.error("[Email Cancellation] Unhandled error:", error);
        return { error: error.message || "Error al enviar correo de cancelación" };
    }
}

export async function sendBookingCancellationAction(reservationId: string, reason?: string) {
    return sendBookingCancellation({ reservationId, reason });
}

export async function sendTestCancellationEmail(targetEmail: string) {
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

