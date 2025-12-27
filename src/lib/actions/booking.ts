'use server';

import { es } from 'date-fns/locale';

// ...

export async function getAvailableSlots({ date, professionalId, durationMinutes }: GetAvailabilityParams) {
    try {
        let db;
        try {
            db = getDb();
        } catch (e: any) {
            console.error("Database connection error:", e);
            return { error: 'Error de conexión con la base de datos. Contacte al administrador.' };
        }

        if (!db) return { error: 'No database connection' };

        // 1. Get Professional Schedule
        const profDoc = await db.collection('profesionales').doc(professionalId).get();
        if (!profDoc.exists) return { error: 'Professional not found' };

        const profData = profDoc.data();
        if (!profData) return { error: 'No data for professional' };

        // Use Spanish locale for day name to match DB keys (lunes, martes...)
        const dayName = format(parse(date, 'yyyy-MM-dd', new Date()), 'eeee', { locale: es }).toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove accents

        const scheduleDay = profData.schedule?.[dayName];

        // ... rest of the logic ...

        if (!scheduleDay || !scheduleDay.enabled) {
            return { slots: [] }; // Day is closed
        }

        const { start: startStr, end: endStr } = scheduleDay; // HH:mm

        // 2. Get Busy Slots (Reservations)
        const reservationsSnapshot = await db.collection('reservas')
            .where('fecha', '==', date)
            // .where('estado', '!=', 'Cancelado') // Admin SDK might not support != with other filters easily without composite index?
            // Actually Firestore supports != now but let's be safe and filter in memory if needed
            .get();

        const busyIntervals: { start: number, end: number }[] = [];

        reservationsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.estado === 'Cancelado') return;

            // Filter by professional (items array or direct barbero_id)
            const isForProf = data.barbero_id === professionalId || (data.items && data.items.some((i: any) => i.barbero_id === professionalId));

            if (isForProf) {
                const [sH, sM] = data.hora_inicio.split(':').map(Number);
                const [eH, eM] = data.hora_fin.split(':').map(Number);
                busyIntervals.push({
                    start: sH * 60 + sM,
                    end: eH * 60 + eM
                });
            }
        });

        // 3. Get Busy Slots (Blocks)
        const blocksSnapshot = await db.collection('bloqueos_horario')
            .where('fecha', '==', date)
            .where('barbero_id', '==', professionalId)
            .get();

        blocksSnapshot.forEach(doc => {
            const data = doc.data();
            const [sH, sM] = data.hora_inicio.split(':').map(Number);
            const [eH, eM] = data.hora_fin.split(':').map(Number);
            busyIntervals.push({
                start: sH * 60 + sM,
                end: eH * 60 + eM
            });
        });

        // 4. Calculate Available Slots
        const [startH, startM] = startStr.split(':').map(Number);
        const [endH, endM] = endStr.split(':').map(Number);
        const startObj = set(new Date(), { hours: startH, minutes: startM, seconds: 0, milliseconds: 0 });
        const endObj = set(new Date(), { hours: endH, minutes: endM, seconds: 0, milliseconds: 0 });

        const availableSlots: string[] = [];
        let current = startObj;

        // Slot interval (e.g., every 30 mins)
        // Should probably align with duration or standard 30 min blocks?
        // Let's us 30 mins for now as standard grid
        const GRID_INTERVAL = 30;

        while (addMinutes(current, durationMinutes) <= endObj) {
            const slotStart = current.getHours() * 60 + current.getMinutes();
            const slotEnd = slotStart + durationMinutes;

            // Check if overlaps with any busy interval
            const isBusy = busyIntervals.some(busy => {
                return (slotStart < busy.end && slotEnd > busy.start);
            });

            if (!isBusy) {
                availableSlots.push(format(current, 'HH:mm'));
            }

            current = addMinutes(current, GRID_INTERVAL);
        }

        return { slots: availableSlots };

    } catch (error: any) {
        console.error('Error fetching availability:', error);
        return { error: error.message };
    }
}

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
        if (!data.client?.phone || !data.serviceId || !data.professionalId || !data.date || !data.time) {
            return { error: 'Faltan datos requeridos' };
        }

        // 1. Check/Create Client
        const clientsRef = db.collection('clientes');
        const q = clientsRef.where('telefono', '==', data.client.phone).limit(1);
        const snapshot = await q.get();

        let clientId;

        if (!snapshot.empty) {
            clientId = snapshot.docs[0].id;
        } else {
            const newClientRef = await clientsRef.add({
                nombre: data.client.name,
                apellido: data.client.lastName,
                telefono: data.client.phone,
                fecha_nacimiento: data.client.birthday || null,
                createdAt: FieldValue.serverTimestamp(),
                origen: 'web_publica'
            });
            clientId = newClientRef.id;
        }

        // 2. Fetch Service Details for Price/Duration
        const serviceDoc = await db.collection('servicios').doc(data.serviceId).get();
        if (!serviceDoc.exists) return { error: 'Servicio no encontrado' };
        const serviceData = serviceDoc.data();

        // 3. Create Reservation
        // Calculate End Time
        const [h, m] = data.time.split(':').map(Number);
        const startTime = set(parse(data.date, 'yyyy-MM-dd', new Date()), { hours: h, minutes: m });
        const endTime = addMinutes(startTime, serviceData?.duration || 30);

        const reservationData = {
            cliente_id: clientId,
            barbero_id: data.professionalId, // Main professional
            fecha: data.date,
            hora_inicio: data.time,
            hora_fin: format(endTime, 'HH:mm'),
            estado: 'Pendiente', // Starts as pending
            servicio: serviceData?.name, // Legacy field
            local_id: data.locationId || 'default', // Fallback
            items: [{
                id: data.serviceId,
                nombre: serviceData?.name,
                servicio: serviceData?.name,
                precio: serviceData?.price,
                duracion: serviceData?.duration,
                barbero_id: data.professionalId
            }],
            total: serviceData?.price,
            origen: 'web_publica',
            createdAt: FieldValue.serverTimestamp()
        };

        const resRef = await db.collection('reservas').add(reservationData);

        return { success: true, reservationId: resRef.id };

    } catch (error: any) {
        console.error("Error creating reservation:", error);
        return { error: error.message };
    }
}
