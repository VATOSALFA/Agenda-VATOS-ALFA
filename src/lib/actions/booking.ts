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

        // --- EMAIL NOTIFICATIONS ---
        let emailWarning = null;
        try {
            // Await execution to ensure delivery in Serverless environment (Next.js Server Actions)
            await sendBookingConfirmation(reservationData, db, data.client.email, data.professionalId);
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

        await sendBookingConfirmation(reservation, db, clientEmail, professionalId);
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
                        ${yellowNote}
                    </div>

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
                            ${note}
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
            subject: subject,
            html: html
        });
        console.log(`[Email] Professional confirmation sent to ${professional.email}`);
    } else {
        console.log(`[Email] Skipping Professional Email. Email: ${professional.email}, Enabled: ${profConfig.enabled}`);
    }
}
