'use server';

import { getDb } from '@/lib/firebase-server';
import { addMinutes, format, set, parse, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { FieldValue } from 'firebase-admin/firestore';

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

        const scheduleDay = profData.schedule?.[dayName];

        if (!scheduleDay || !scheduleDay.enabled) {
            return { slots: [] }; // Day is closed
        }

        // Safe Time Parsing Helper
        const parseTimeSafe = (timeStr: any) => {
            if (!timeStr || typeof timeStr !== 'string') return null;
            const parts = timeStr.split(':');
            if (parts.length < 2) return null;
            const h = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (isNaN(h) || isNaN(m)) return null;
            return { h, m };
        };

        const startT = parseTimeSafe(scheduleDay.start);
        const endT = parseTimeSafe(scheduleDay.end);

        if (!startT || !endT) return { slots: [] }; // Invalid schedule configuration

        // 1.1 Add Breaks to Busy Intervals
        const busyIntervals: { start: number, end: number }[] = [];

        if (scheduleDay.breaks && Array.isArray(scheduleDay.breaks)) {
            scheduleDay.breaks.forEach((brk: any) => {
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
            if (data.estado === 'Cancelado') return;

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

        // 3. Get Busy Slots (Blocks)
        const blocksSnapshot = await db.collection('bloqueos_horario')
            .where('fecha', '==', date)
            .where('barbero_id', '==', professionalId)
            .get();

        blocksSnapshot.forEach(doc => {
            const data = doc.data();
            const s = parseTimeSafe(data.hora_inicio);
            const e = parseTimeSafe(data.hora_fin);
            if (s && e) {
                busyIntervals.push({
                    start: s.h * 60 + s.m,
                    end: e.h * 60 + e.m
                });
            }
        });

        // 4. Calculate Available Slots
        const startObj = set(parsedDate, { hours: startT.h, minutes: startT.m, seconds: 0, milliseconds: 0 });
        const endObj = set(parsedDate, { hours: endT.h, minutes: endT.m, seconds: 0, milliseconds: 0 });

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
            console.warn("Could not load waiting settings, using defaults.", settingsError);
        }

        const availableSlots: string[] = [];
        let current = startObj;

        // Timezone Logic
        // We need to compare against "Now" in Mexico City time to block past slots + buffer
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

        // Loop generation
        // Limit iterations to prevent infinite loops (e.g. if start > end)
        let iterations = 0;
        const MAX_ITERATIONS = 200; // 24 hours / 15 mins = 96 slots max typically

        while (addMinutes(current, durationMinutes) <= endObj && iterations < MAX_ITERATIONS) {
            iterations++;

            const currentH = current.getHours();
            const currentM = current.getMinutes();
            const slotStart = currentH * 60 + currentM;
            const slotEnd = slotStart + durationMinutes;

            // Check Buffer for Today
            if (isQueryDateToday && slotStart < (currentMinutes + minReservationBuffer)) {
                current = addMinutes(current, GRID_INTERVAL);
                continue;
            }

            // Check Overlaps
            const isBusy = busyIntervals.some(busy => {
                // Returns true if overlap exists
                // Overlap condition: Not (EndA <= StartB OR StartA >= EndB)
                // Simplified: StartA < EndB AND EndA > StartB
                return (slotStart < busy.end && slotEnd > busy.start);
            });

            if (!isBusy) {
                availableSlots.push(format(current, 'HH:mm'));
            }

            current = addMinutes(current, GRID_INTERVAL);
        }

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
            const q = clientsRef.where('telefono', '==', data.client.phone).limit(1);
            const snap = await q.get();
            if (!snap.empty) existingDoc = snap.docs[0];
        }

        if (existingDoc) {
            clientId = existingDoc.id;
            // Optional: Update info if missing? For now, just link.
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
                nombre: data.client.name,
                apellido: data.client.lastName,
                telefono: data.client.phone,
                correo: data.client.email || '',
                fecha_nacimiento: data.client.birthday || null,
                notas: data.client.notes || '',
                creado_en: FieldValue.serverTimestamp(),
                origen: 'web_publica',
            };

            if (nextClientNumber !== undefined) {
                newClientData.numero_cliente = nextClientNumber;
            }

            const newClientRef = await clientsRef.add(newClientData);
            clientId = newClientRef.id;
        }

        // 2. Fetch Services Details
        const servicesRefs = data.serviceIds.map((id: string) => db.collection('servicios').doc(id));
        const servicesDocs = await db.getAll(...servicesRefs);

        const validServices = servicesDocs.filter((doc) => doc.exists).map((doc) => ({ id: doc.id, ...doc.data() }));

        if (validServices.length === 0) return { error: 'Servicios no encontrados' };

        const totalDuration = validServices.reduce((sum: number, s: any) => sum + (s.duration || 0), 0);
        const totalPrice = validServices.reduce((sum: number, s: any) => sum + (s.price || 0), 0);
        const serviceNames = validServices.map((s: any) => s.name).join(', ');

        // CALCULATE TIMES
        const [h, m] = data.time.split(':').map(Number);
        const startTime = set(parse(data.date, 'yyyy-MM-dd', new Date()), { hours: h, minutes: m });
        const endTime = addMinutes(startTime, totalDuration);
        const endTimeStr = format(endTime, 'HH:mm');
        const startTimeStr = data.time;

        // VALIDATION: AVAILABILITY
        // 1. Get Professional Schedule
        const profDoc = await db.collection('profesionales').doc(data.professionalId).get();
        if (!profDoc.exists) return { error: 'Profesional no encontrado' };
        const profData = profDoc.data();

        const dayName = format(parse(data.date, 'yyyy-MM-dd', new Date()), 'eeee', { locale: es }).toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        const scheduleDay = profData?.schedule?.[dayName];

        if (!scheduleDay || !scheduleDay.enabled) return { error: 'El profesional no trabaja este día.' };

        // Check working hours
        if (startTimeStr < scheduleDay.start || endTimeStr > scheduleDay.end) {
            return { error: 'La hora seleccionada está fuera del horario laboral.' };
        }

        // Check Breaks
        if (scheduleDay.breaks && Array.isArray(scheduleDay.breaks)) {
            const isBreak = scheduleDay.breaks.some((brk: any) => {
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
            if (res.estado === 'Cancelado') return false;

            // Check if it's the same professional
            const isForProf = res.barbero_id === data.professionalId || (res.items && res.items.some((i: any) => i.barbero_id === data.professionalId));
            if (!isForProf) return false;

            return startTimeStr < res.hora_fin && endTimeStr > res.hora_inicio;
        });

        if (hasReservationConflict) return { error: 'Ya existe una reserva en este horario.' };

        // Check Blocks
        const blocksSnapshot = await db.collection('bloqueos_horario')
            .where('fecha', '==', data.date)
            .where('barbero_id', '==', data.professionalId)
            .get();

        const hasBlockConflict = blocksSnapshot.docs.some(doc => {
            const block = doc.data();
            return startTimeStr < block.hora_fin && endTimeStr > block.hora_inicio;
        });

        if (hasBlockConflict) return { error: 'El profesional tiene un bloqueo en este horario.' };


        const items = validServices.map((s: any) => ({
            id: s.id,
            nombre: s.name,
            servicio: s.name,
            precio: s.price,
            duracion: s.duration,
            barbero_id: data.professionalId
        }));

        // 3. Create Reservation
        const reservationData = {
            cliente_id: clientId,
            barbero_id: data.professionalId, // Main professional
            fecha: data.date,
            hora_inicio: data.time,
            hora_fin: endTimeStr,
            estado: 'Pendiente', // Starts as pending
            servicio: serviceNames, // Legacy field: concatenated names
            local_id: data.locationId || 'default',
            items: items,
            total: totalPrice,
            origen: 'web_publica',
            canal_reserva: 'web_publica',
            createdAt: FieldValue.serverTimestamp(),
            // Financials for Upfront Payment
            pago_estado: data.paymentStatus || 'pendiente', // 'pending_payment', 'pending', 'paid'
            anticipo_esperado: data.amountDue || 0,
            saldo_pendiente: data.totalAmount && data.amountDue ? (data.totalAmount - data.amountDue) : (data.totalAmount || totalPrice),
            requiere_pago_anticipado: (data.amountDue || 0) > 0
        };

        const resRef = await db.collection('reservas').add(reservationData);

        return { success: true, reservationId: resRef.id };

    } catch (error: any) {
        console.error("Error creating reservation:", error);
        return { error: error.message };
    }
}
