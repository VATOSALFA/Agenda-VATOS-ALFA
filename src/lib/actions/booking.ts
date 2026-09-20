'use server';

import { getDb } from '@/lib/firebase-server';
import { addMinutes, format, set, parse, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { parseClientCustomDuration } from '@/lib/client-notes-helper';

interface GetAvailabilityParams {
    date: string; // YYYY-MM-DD
    professionalId: string;
    durationMinutes: number;
}

export async function getAvailableSlots({ date, professionalId, durationMinutes }: GetAvailabilityParams) {
    // 0. Strict Input Validation
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { error: 'Formato de fecha inválido. Se requiere AAAA-MM-DD.' };
    }
    if (!professionalId || typeof professionalId !== 'string') {
        return { error: 'ID de profesional inválido.' };
    }
    if (typeof durationMinutes !== 'number' || durationMinutes <= 0) {
        return { slots: [] }; // No slots for invalid duration
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

        // 1.05 Check for Special Journeys (Manual Overrides)
        const specialDaysSnap = await db.collection('jornadas_especiales')
            .where('profesionalId', '==', professionalId)
            .where('fecha', '==', date)
            .get();

        // 1.06 Check for Blocks and Enabled Schedules ('bloqueos_horario')
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

        const availableBlocks: { start: string, end: string, startM: number, endM: number }[] = [];
        const blockingBlocks: { start: string, end: string, startM: number, endM: number }[] = [];

        blocksSnapshot.forEach(doc => {
            const data = doc.data();
            const s = parseTimeSafe(data.hora_inicio);
            const e = parseTimeSafe(data.hora_fin);
            if (s && e) {
                const startM = s.h * 60 + s.m;
                const endM = e.h * 60 + e.m;
                if (data.type === 'available') {
                    availableBlocks.push({ start: data.hora_inicio, end: data.hora_fin, startM, endM });
                } else {
                    blockingBlocks.push({ start: data.hora_inicio, end: data.hora_fin, startM, endM });
                }
            }
        });

        let effectiveScheduleStart = '';
        let effectiveScheduleEnd = '';
        let isSpecialJourney = false;
        const syntheticBreaks: { start: string, end: string }[] = [];

        if (!specialDaysSnap.empty) {
            const journeys = specialDaysSnap.docs.map(d => d.data());
            // Sort journeys by start time
            journeys.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
            
            effectiveScheduleStart = journeys[0].hora_inicio;
            effectiveScheduleEnd = journeys.reduce((latest, j) => j.hora_fin > latest ? j.hora_fin : latest, journeys[0].hora_fin);
            isSpecialJourney = true;
            
            // Build synthetic breaks for gaps between separate journeys
            for (let i = 0; i < journeys.length - 1; i++) {
                if (journeys[i].hora_fin < journeys[i+1].hora_inicio) {
                    syntheticBreaks.push({ start: journeys[i].hora_fin, end: journeys[i+1].hora_inicio });
                }
            }
        } else {
            const scheduleDay = profData.schedule?.[dayName];
            if (!scheduleDay || !scheduleDay.enabled) {
                if (availableBlocks.length > 0) {
                    availableBlocks.sort((a, b) => a.startM - b.startM);
                    effectiveScheduleStart = availableBlocks[0].start;
                    effectiveScheduleEnd = availableBlocks.reduce((latest, b) => b.end > latest ? b.end : latest, availableBlocks[0].end);
                    isSpecialJourney = true;
                    for (let i = 0; i < availableBlocks.length - 1; i++) {
                        if (availableBlocks[i].endM < availableBlocks[i+1].startM) {
                            syntheticBreaks.push({ start: availableBlocks[i].end, end: availableBlocks[i+1].start });
                        }
                    }
                } else {
                    return { slots: [] }; // Day is closed and no special journey or enabled block
                }
            } else {
                effectiveScheduleStart = scheduleDay.start;
                effectiveScheduleEnd = scheduleDay.end;
                availableBlocks.forEach(ab => {
                    if (ab.start < effectiveScheduleStart) effectiveScheduleStart = ab.start;
                    if (ab.end > effectiveScheduleEnd) effectiveScheduleEnd = ab.end;
                });
            }
        }

        // 1.0 Fetch Local Schedule to enforce bounds
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
        
        // If not a special journey, we must check if local is open
        if (!isSpecialJourney) {
            if (!localScheduleDay || !localScheduleDay.enabled) {
                return { slots: [] }; // Local is closed and this isn't a special override
            }
        }

        const profStart = parseTimeSafe(effectiveScheduleStart);
        const profEnd = parseTimeSafe(effectiveScheduleEnd);
        
        let finalStart = profStart;
        let finalEnd = profEnd;

        // If not special, intersect with local hours
        if (!isSpecialJourney && localScheduleDay && localScheduleDay.enabled) {
            const localStart = parseTimeSafe(localScheduleDay.start);
            const localEnd = parseTimeSafe(localScheduleDay.end);
            
            if (profStart && profEnd && localStart && localEnd) {
                const startM = Math.max(profStart.h * 60 + profStart.m, localStart.h * 60 + localStart.m);
                const endM = Math.min(profEnd.h * 60 + profEnd.m, localEnd.h * 60 + localEnd.m);
                finalStart = { h: Math.floor(startM / 60), m: startM % 60 };
                finalEnd = { h: Math.floor(endM / 60), m: endM % 60 };
            }
        }

        if (!finalStart || !finalEnd) return { slots: [] }; // Invalid configuration

        const startTimeLimit = finalStart.h * 60 + finalStart.m;
        const endTimeLimit = finalEnd.h * 60 + finalEnd.m;

        if (startTimeLimit >= endTimeLimit) return { slots: [] };

        // 1.1 Add Breaks to Busy Intervals
        const busyIntervals: { start: number, end: number }[] = [];

        if (!isSpecialJourney) {
            const scheduleDay = profData.schedule?.[dayName];
            if (scheduleDay?.breaks && Array.isArray(scheduleDay.breaks)) {
                scheduleDay.breaks.forEach((brk: any) => {
                    const s = parseTimeSafe(brk.start);
                    const e = parseTimeSafe(brk.end);
                    if (s && e) {
                        const brkStartM = s.h * 60 + s.m;
                        const brkEndM = e.h * 60 + e.m;
                        const isOverridden = availableBlocks.some(ab => ab.startM <= brkStartM && ab.endM >= brkEndM);
                        if (!isOverridden) {
                            busyIntervals.push({
                                start: brkStartM,
                                end: brkEndM
                            });
                        }
                    }
                });
            }
        } else {
            // Add synthetic breaks from multiple special journeys
            syntheticBreaks.forEach(brk => {
                const s = parseTimeSafe(brk.start);
                const e = parseTimeSafe(brk.end);
                if (s && e) {
                    busyIntervals.push({
                        start: s.h * 60 + s.m,
                        end: e.h * 60 + e.m
                    });
                }
            });
        }

        // 2. Get Busy Slots (Reservations)
        const reservationsSnapshot = await db.collection('reservas')
            .where('fecha', '==', date)
            .get();

        reservationsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.estado === 'Cancelado' || data.estado === 'No asiste') return;

            // Robust check for professional match
            let isForProf = data.barbero_id === professionalId;
            if (!isForProf && Array.isArray(data.items)) {
                isForProf = data.items.some((i: any) => i && i.barbero_id === professionalId);
            }

            if (isForProf) {
                const s = parseTimeSafe(data.hora_inicio);
                const e = parseTimeSafe(data.hora_fin);
                if (s && e) {
                    busyIntervals.push({
                        start: s.h * 60 + s.m,
                        end: e.h * 60 + e.m
                    });
                }
            }
        });

        // 3. Get Busy Slots (Blocking Blocks - Excluding 'available' overrides)
        blockingBlocks.forEach(blk => {
            const isOverridden = availableBlocks.some(ab => ab.startM <= blk.startM && ab.endM >= blk.endM);
            if (!isOverridden) {
                busyIntervals.push({
                    start: blk.startM,
                    end: blk.endM
                });
            }
        });

        // 3. Generate Available Slots with Receptionist Intelligence (No Dead Gaps)
        // Minimum standalone viable gap in barbershop (no standalone haircut/service is < 30m)
        const MIN_VIABLE_GAP = 30;

        // Fetch settings
        let minReservationBuffer = 60; // Minutes
        let GRID_INTERVAL = 30; // Minutes

        try {
            const settingsSnap = await db.collection('settings').doc('website').get();
            if (settingsSnap.exists) {
                const data = settingsSnap.data();
                if (data) {
                    if (data.minReservationTime !== undefined) minReservationBuffer = (Number(data.minReservationTime) || 1) * 60;
                    if (data.slotInterval) {
                        const parsedInterval = Number(data.slotInterval);
                        if (!isNaN(parsedInterval) && parsedInterval > 0) GRID_INTERVAL = parsedInterval;
                    }
                }
            }
        } catch (settingsError) {
            console.warn("Could not load setting, using defaults.", settingsError);
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

        // Merge overlapping or adjacent busy intervals clamped to shift bounds
        const sortedBusy = [...busyIntervals]
            .map(b => ({
                start: Math.max(startTimeLimit, b.start),
                end: Math.min(endTimeLimit, b.end)
            }))
            .filter(b => b.start < b.end)
            .sort((a, b) => a.start - b.start);

        const mergedBusy: { start: number, end: number }[] = [];
        sortedBusy.forEach(interval => {
            if (mergedBusy.length === 0) {
                mergedBusy.push({ ...interval });
            } else {
                const last = mergedBusy[mergedBusy.length - 1];
                if (interval.start <= last.end) {
                    last.end = Math.max(last.end, interval.end);
                } else {
                    mergedBusy.push({ ...interval });
                }
            }
        });

        // Identify free windows across the workday
        const freeWindows: { start: number, end: number }[] = [];
        let cursor = startTimeLimit;

        for (const busy of mergedBusy) {
            if (busy.start > cursor) {
                freeWindows.push({ start: cursor, end: busy.start });
            }
            cursor = Math.max(cursor, busy.end);
        }
        if (cursor < endTimeLimit) {
            freeWindows.push({ start: cursor, end: endTimeLimit });
        }

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
        return { slots: availableSlots };

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
            // 3. Check by Phone
            const q = clientsRef.where('telefono', '==', data.client.phone).limit(1);
            const snap = await q.get();
            if (!snap.empty) existingDoc = snap.docs[0];
        }
        
        if (!existingDoc && data.client.name && data.client.lastName) {
            // 4. Fallback: Check by Name and Last Name
            const q = clientsRef.where('nombre', '==', data.client.name).where('apellido', '==', data.client.lastName).limit(1);
            const snap = await q.get();
            if (!snap.empty) existingDoc = snap.docs[0];
        }

        if (existingDoc) {
            clientId = existingDoc.id;
            
            // Progressive Enrichment: Update email or phone if missing/placeholder
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
            
            if (validatePhone && providedPhone && isInvalidPhone && providedPhone.length >= 10) {
                updates.telefono = providedPhone;
            }
            
            if (Object.keys(updates).length > 0) {
                await db.collection('clientes').doc(clientId).update(updates);
                console.log(`[Booking] Enriched existing client ${clientId}:`, updates);
            }
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
            .filter(Boolean);

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

        // Check Existing Reservations
        const reservationsSnapshot = await db.collection('reservas')
            .where('fecha', '==', data.date)
            .get(); // Filter by professional in memory to avoid index issues if not exists

        const hasReservationConflict = reservationsSnapshot.docs.some(doc => {
            const res = doc.data();
            if (res.estado === 'Cancelado' || res.estado === 'No asiste') return false;

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

        // --- VALIDACIÓN DE ANTICIPO (REGLA GLOBAL Y POR SERVICIO) ---
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
        } catch (e) {
            console.error("Error reading configuracion/servicios in createPublicReservation:", e);
        }

        // 1. Sumar anticipos configurados a nivel de servicio individual
        let calculatedDeposit = 0;
        validServices.forEach((s: any) => {
            const pType = s.payment_type || 'no-payment';
            if (pType === 'online-deposit') {
                const amountType = s.payment_amount_type || '%';
                const amountVal = Number(s.payment_amount_value);
                if (amountType === '$' && amountVal > 0) {
                    calculatedDeposit += amountVal;
                } else if (amountType === '%' && amountVal > 0) {
                    calculatedDeposit += (Number(s.price || 0) * (amountVal / 100));
                } else {
                    calculatedDeposit += (Number(s.price || 0) * 0.5);
                }
            } else if (pType === 'full-payment') {
                calculatedDeposit += Number(s.price || 0);
            }
        });

        // 2. Regla global: si el total de servicios supera el umbral configurado (ej. >= $190)
        if (globalActive && totalPrice >= globalMinThreshold) {
            const thresholdDeposit = totalPrice * (globalDefaultPercent / 100);
            if (calculatedDeposit < thresholdDeposit) {
                calculatedDeposit = thresholdDeposit;
            }
        }

        calculatedDeposit = Math.round(calculatedDeposit * 100) / 100;
        const requiresDeposit = calculatedDeposit > 0;

        // 3. Si la reserva proviene de la web pública (flujo directo sin pasarela) y requiere anticipo:
        // No permitir creación gratuita sin haber pasado por Mercado Pago.
        const originChannel = data.canal_reserva || data.origin || 'web_publica';
        const isPaid = data.paymentStatus === 'deposit_paid' || data.paymentStatus === 'paid';

        if (originChannel === 'web_publica' && requiresDeposit && !isPaid) {
            return {
                error: `Esta reserva suma $${grandTotal} MXN y requiere un anticipo del ${globalDefaultPercent}% ($${calculatedDeposit} MXN). Por favor realiza el pago en línea para confirmar tu cita.`,
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
            saldo_pendiente: Math.max(0, grandTotal - finalAmountDue),
            requiere_pago_anticipado: finalRequiresDeposit
        };

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
            };
        }

        const snap = await db.collection('configuracion').doc('servicios').get();
        if (snap.exists) {
            const data = snap.data() || {};
            return {
                anticipo_monto_minimo_activo: data.anticipo_monto_minimo_activo !== false,
                anticipo_monto_minimo: Number(data.anticipo_monto_minimo) > 0 ? Number(data.anticipo_monto_minimo) : 190,
                anticipo_porcentaje_defecto: Number(data.anticipo_porcentaje_defecto) > 0 ? Number(data.anticipo_porcentaje_defecto) : 50,
            };
        }
    } catch (e) {
        console.error("Error reading public servicios config:", e);
    }

    return {
        anticipo_monto_minimo_activo: true,
        anticipo_monto_minimo: 190,
        anticipo_porcentaje_defecto: 50,
    };
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
