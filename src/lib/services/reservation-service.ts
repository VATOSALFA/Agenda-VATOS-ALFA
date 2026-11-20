import 'server-only';
import { after } from 'next/server';
import { getDb } from '@/lib/firebase-server';
import { addMinutes, format, parse, set } from 'date-fns';
import { es } from 'date-fns/locale';
import { FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { parseClientCustomDuration } from '@/lib/client-notes-helper';
import {
  DEFAULT_BOOKING_RULES,
  ReglasReservasConfig,
  evaluateDepositRequirement,
  isExpiredPendingDepositReservation,
} from '@/lib/booking-rules';
import { isValidPhoneNumber, normalizePhoneForLookup } from '@/lib/phone-utils';
import { verifyStaffAccess } from '@/lib/server-auth';
import { sendBookingConfirmation } from '@/lib/services/booking-confirmation-email';
import { computeSlotLockIds } from '@/lib/services/agenda-locks';

export interface CreateReservationServerOptions {
  trustedInternalCaller?: boolean;
}

export async function createReservationServer(
  data: any,
  options?: CreateReservationServerOptions
) {
  const trustedInternalCaller = options?.trustedInternalCaller === true;

  try {
    let db;
    try {
      db = getDb();
    } catch (e: any) {
      console.error('Database connection error:', e);
      return { error: 'Error interno: No se pudo conectar con el sistema de reservas.' };
    }

    if (!db) return { error: 'Database connection failed' };

    if (
      !data?.client?.phone ||
      !Array.isArray(data?.serviceIds) ||
      !data.serviceIds.length ||
      !data?.professionalId ||
      !data?.date ||
      !data?.time
    ) {
      return { error: 'Faltan datos requeridos (Servicios, Profesional, Fecha u Hora)' };
    }

    const isSandbox = Boolean(data.isSandbox);
    if (isSandbox && !trustedInternalCaller) {
      try {
        await verifyStaffAccess(undefined, { requireAdmin: true });
      } catch (sandboxAuthErr: any) {
        const msg = String(sandboxAuthErr?.message || '');
        const outsideRequestContext =
          msg.includes('outside a request scope') || msg.includes('headers');
        if (!(outsideRequestContext && process.env.NODE_ENV !== 'production')) {
          return { error: 'Modo sandbox restringido a administradores.' };
        }
      }
    }

    // 1. Check/Create Client
    const clientsRef = db.collection('clientes');
    let clientId: string;

    let validateEmail = true;
    let validatePhone = true;
    let autoClientNumber = true;
    try {
      const settingsSnap = await db.collection('configuracion').doc('clientes').get();
      if (settingsSnap.exists) {
        const s = settingsSnap.data();
        if (s) {
          validateEmail = s.validateEmail !== false;
          validatePhone = s.validatePhone !== false;
          autoClientNumber = s.autoClientNumber !== false;
        }
      }
    } catch {
      console.warn('Could not read client settings, defaulting to validation on');
    }

    let existingDoc: any;

    if (validateEmail && data.client.email) {
      let q = clientsRef.where('correo', '==', data.client.email).limit(1);
      let snap = await q.get();

      if (!snap.empty) {
        existingDoc = snap.docs[0];
      } else {
        q = clientsRef.where('email', '==', data.client.email).limit(1);
        snap = await q.get();
        if (!snap.empty) existingDoc = snap.docs[0];
      }
    }

    if (!existingDoc && validatePhone && data.client.phone) {
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
      const q = clientsRef
        .where('nombre', '==', data.client.name)
        .where('apellido', '==', data.client.lastName)
        .limit(1);
      const snap = await q.get();
      if (!snap.empty) existingDoc = snap.docs[0];
    }

    if (existingDoc) {
      clientId = existingDoc.id;

      if (!isSandbox) {
        const existingData = existingDoc.data();
        const updates: any = {};

        const currentEmail = existingData.correo || existingData.email || '';
        const isInvalidEmail =
          !currentEmail ||
          currentEmail.toLowerCase() === 'no registrado' ||
          currentEmail.trim() === '' ||
          !currentEmail.includes('@');
        const providedEmail = data.client.email;

        if (validateEmail && providedEmail && isInvalidEmail && providedEmail.includes('@')) {
          updates.correo = providedEmail;
        }

        const currentPhone = existingData.telefono || '';
        const isInvalidPhone =
          !currentPhone ||
          currentPhone.toLowerCase() === 'no registrado' ||
          currentPhone.trim() === '';
        const providedPhone = data.client.phone;

        if (validatePhone && providedPhone && isInvalidPhone && isValidPhoneNumber(providedPhone)) {
          updates.telefono = providedPhone;
        }

        if (Object.keys(updates).length > 0) {
          await db.collection('clientes').doc(clientId).update(updates);
          console.log(`[Booking] Enriched existing client ${clientId}:`, updates);
        }
      }
    } else if (isSandbox) {
      clientId = `sandbox_cli_${randomUUID().substring(0, 8)}`;
    } else {
      let nextClientNumber: number | undefined = undefined;

      if (autoClientNumber) {
        nextClientNumber = 1;
        try {
          const maxStringQuery = clientsRef.orderBy('numero_cliente', 'desc').limit(1);
          const maxStringSnap = await maxStringQuery.get();

          const maxNumberQuery = clientsRef
            .where('numero_cliente', '>=', 0)
            .orderBy('numero_cliente', 'desc')
            .limit(1);
          const maxNumberSnap = await maxNumberQuery.get();

          let maxVal = 0;

          if (!maxStringSnap.empty) {
            const val = Number(maxStringSnap.docs[0].data().numero_cliente);
            if (!isNaN(val)) maxVal = Math.max(maxVal, val);
          }

          if (!maxNumberSnap.empty) {
            const val = Number(maxNumberSnap.docs[0].data().numero_cliente);
            if (!isNaN(val)) maxVal = Math.max(maxVal, val);
          }

          nextClientNumber = maxVal + 1;
        } catch (e) {
          console.warn('Could not auto-generate client number:', e);
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
        origen: trustedInternalCaller ? data.origin || 'web_publica' : 'web_publica',
      };

      if (nextClientNumber !== undefined) {
        newClientData.numero_cliente = nextClientNumber;
      }

      const newClientRef = await clientsRef.add(newClientData);
      clientId = newClientRef.id;
    }

    // 2. Fetch Services Details from Firestore (authoritative)
    const uniqueServiceIds = Array.from(new Set(data.serviceIds as string[]));
    const servicesRefs = uniqueServiceIds.map((id: string) => db.collection('servicios').doc(id));
    const servicesDocs = await db.getAll(...servicesRefs);

    const serviceDocMap = new Map(
      servicesDocs.filter((d) => d.exists).map((d) => [d.id, { id: d.id, ...d.data() }])
    );

    const validServices = (data.serviceIds as string[])
      .map((id: string) => serviceDocMap.get(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));

    if (validServices.length === 0) return { error: 'Servicios no encontrados' };

    const profDoc = await db.collection('profesionales').doc(data.professionalId).get();
    if (!profDoc.exists) return { error: 'Profesional no encontrado' };
    const profData = profDoc.data();

    let clientCustomDur: number | null = null;
    if (trustedInternalCaller || isSandbox) {
      if (data.duration && Number(data.duration) > 0) {
        clientCustomDur = Number(data.duration);
      } else if (data.customDuration && Number(data.customDuration) > 0) {
        clientCustomDur = Number(data.customDuration);
      }
    }
    if (!clientCustomDur && existingDoc) {
      const cNotes = existingDoc.data().notas || existingDoc.data().nota || '';
      clientCustomDur = parseClientCustomDuration(cNotes, profData?.publicName || profData?.name);
      if (clientCustomDur) {
        console.log(
          `[Booking] Aplicando duración personalizada desde notas del cliente (${existingDoc.id}): ${clientCustomDur} min`
        );
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
          return sum + (customDur !== undefined ? Number(customDur) : s.duration || 0);
        }, 0);
      }
    } else {
      totalDuration = validServices.reduce((sum: number, s: any) => {
        const customDur = s.durationPorProfesional?.[data.professionalId];
        return sum + (customDur !== undefined ? Number(customDur) : s.duration || 0);
      }, 0);
    }

    const totalPrice = validServices.reduce((sum: number, s: any) => sum + Number(s.price ?? s.precio ?? 0), 0);
    const serviceNames = validServices.map((s: any) => s.name).join(', ');

    const [h, m] = data.time.split(':').map(Number);
    const startTime = set(parse(data.date, 'yyyy-MM-dd', new Date()), { hours: h, minutes: m });
    const endTime = addMinutes(startTime, totalDuration);
    const endTimeStr = format(endTime, 'HH:mm');
    const startTimeStr = data.time;

    const dayName = format(parse(data.date, 'yyyy-MM-dd', new Date()), 'eeee', { locale: es })
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const profServices = profData && Array.isArray(profData.services) ? profData.services : [];
    if (data.serviceIds && data.serviceIds.length > 0) {
      const unsupportedServices = data.serviceIds.filter((id: string) => !profServices.includes(id));

      if (unsupportedServices.length > 0) {
        const unsupportedNames = validServices
          .filter((s: any) => unsupportedServices.includes(s.id))
          .map((s: any) => s.name)
          .join(', ');

        return {
          error: `El profesional no realiza los siguientes servicios: ${unsupportedNames || 'Servicios no válidos para este profesional'}`,
        };
      }
    }

    const specialDaysSnap = await db
      .collection('jornadas_especiales')
      .where('profesionalId', '==', data.professionalId)
      .where('fecha', '==', data.date)
      .get();

    const blocksSnapshot = await db
      .collection('bloqueos_horario')
      .where('fecha', '==', data.date)
      .where('barbero_id', '==', data.professionalId)
      .get();

    const availableBlocks: { start: string; end: string }[] = [];
    const blockingBlocks: { start: string; end: string }[] = [];

    blocksSnapshot.forEach((docSnap) => {
      const bData = docSnap.data();
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

    const isCoveredByAvailable = availableBlocks.some(
      (ab) => ab.start <= startTimeStr && ab.end >= endTimeStr
    );

    let profEffectiveStart = '';
    let profEffectiveEnd = '';
    let isSpecialJourney = false;
    let profBreaks: { start: string; end: string }[] = [];

    if (!specialDaysSnap.empty) {
      const journeys = specialDaysSnap.docs.map((d) => d.data());
      journeys.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

      profEffectiveStart = journeys[0].hora_inicio;
      profEffectiveEnd = journeys.reduce(
        (latest, j) => (j.hora_fin > latest ? j.hora_fin : latest),
        journeys[0].hora_fin
      );
      isSpecialJourney = true;

      for (let i = 0; i < journeys.length - 1; i++) {
        if (journeys[i].hora_fin < journeys[i + 1].hora_inicio) {
          profBreaks.push({ start: journeys[i].hora_fin, end: journeys[i + 1].hora_inicio });
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

    let localData = null;
    let resolvedLocationId = data.locationId && data.locationId !== 'default' ? data.locationId : null;

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
      if (!localScheduleDay || !localScheduleDay.enabled) {
        return { error: 'La sucursal se encuentra cerrada este día.' };
      }
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

    if (!isCoveredByAvailable && (startTimeStr < combinedStart || endTimeStr > combinedEnd)) {
      return { error: 'La hora seleccionada está fuera del horario laboral habilitado.' };
    }

    if (!isCoveredByAvailable && profBreaks && Array.isArray(profBreaks)) {
      const isBreak = profBreaks.some((brk: any) => startTimeStr < brk.end && endTimeStr > brk.start);
      if (isBreak) return { error: 'El horario coincide con el descanso del profesional.' };
    }

    const reservationsSnapshot = await db.collection('reservas').where('fecha', '==', data.date).get();

    const allReservationsToCheck = [...reservationsSnapshot.docs];
    if (isSandbox) {
      try {
        const sandboxSnapshot = await db
          .collection('reservas_sandbox')
          .where('fecha', '==', data.date)
          .get();
        allReservationsToCheck.push(...sandboxSnapshot.docs);
      } catch (sandboxFetchErr) {
        console.warn('[Booking] Error al consultar reservas_sandbox para conflictos:', sandboxFetchErr);
      }
    }

    const nowCheckMs = Date.now();
    const hasReservationConflict = allReservationsToCheck.some((docSnap) => {
      const res = docSnap.data();
      if (res.estado === 'Cancelado' || res.estado === 'No asiste') return false;

      if (isExpiredPendingDepositReservation(res, nowCheckMs, 30)) {
        docSnap.ref
          .update({
            estado: 'Cancelado',
            motivo_cancelacion:
              'Cancelada automáticamente por falta de pago de anticipo en los 30 minutos de tolerancia.',
            cancelada_automaticamente: true,
            cancelado_en: FieldValue.serverTimestamp(),
          })
          .catch(() => {});
        if (!isSandbox && res.cliente_id) {
          db.collection('clientes')
            .doc(res.cliente_id)
            .update({
              citas_canceladas: FieldValue.increment(1),
            })
            .catch(() => {});
        }
        return false;
      }

      const isForProf =
        res.barbero_id === data.professionalId ||
        (res.items && res.items.some((i: any) => i.barbero_id === data.professionalId));
      if (!isForProf) return false;

      return startTimeStr < res.hora_fin && endTimeStr > res.hora_inicio;
    });

    if (hasReservationConflict) return { error: 'Ya existe una reserva en este horario.' };

    const hasBlockConflict = blockingBlocks.some((blk) => {
      if (isCoveredByAvailable) return false;
      return startTimeStr < blk.end && endTimeStr > blk.start;
    });

    if (hasBlockConflict) return { error: 'El profesional tiene un bloqueo en este horario.' };

    const isProfLocked = data.professional_lock !== undefined ? Boolean(data.professional_lock) : true;
    let firstOverridden = false;
    const items: any[] = validServices.map((s: any) => {
      const customDur = s.durationPorProfesional?.[data.professionalId];
      let itemDur = customDur !== undefined ? Number(customDur) : s.duration || 0;
      if (clientCustomDur && !firstOverridden && (s.name?.toLowerCase().includes('corte') || validServices.length === 1)) {
        itemDur = clientCustomDur;
        firstOverridden = true;
      }
      return {
        id: s.id,
        nombre: s.name,
        servicio: s.name,
        precio: Number(s.price ?? s.precio ?? 0),
        duracion: itemDur,
        barbero_id: data.professionalId,
        professional_lock: isProfLocked,
        tipo: 'servicio',
      };
    });

    // Validate product prices from Firestore catalog
    let productsTotal = 0;
    if (Array.isArray(data.productItems) && data.productItems.length > 0) {
      const rawProducts = data.productItems.slice(0, 20);
      const productIds: string[] = Array.from(
        new Set<string>(rawProducts.map((p: any) => String(p?.id || '').trim()).filter(Boolean))
      );
      const productMap = new Map<string, any>();
      if (productIds.length > 0) {
        const prodSnaps = await db.getAll(
          ...productIds.map((pid) => db.collection('productos').doc(pid))
        );
        for (const ps of prodSnaps) {
          if (ps.exists) productMap.set(ps.id, ps.data());
        }
      }

      for (const p of rawProducts) {
        const pid = String(p?.id || '').trim();
        const prodDocData = pid ? productMap.get(pid) : null;
        const rawQty = Number(p?.cantidad ?? p?.quantity ?? 1);
        const prodQty = Number.isFinite(rawQty) ? Math.max(1, Math.min(20, Math.floor(rawQty))) : 1;

        const authoritativePrice = prodDocData
          ? Number(prodDocData.price ?? prodDocData.precio ?? 0)
          : trustedInternalCaller || isSandbox
          ? Number(p?.precio ?? p?.price ?? 0)
          : -1;

        if (authoritativePrice < 0) continue;

        productsTotal += authoritativePrice * prodQty;
        items.push({
          id: pid || `prod_${Date.now()}`,
          nombre: prodDocData?.name || prodDocData?.nombre || p?.nombre || p?.name || 'Producto',
          precio: authoritativePrice,
          cantidad: prodQty,
          tipo: 'producto',
          barbero_id: data.professionalId,
        });
      }
    }

    const computedTotal = totalPrice + productsTotal;
    const grandTotal =
      (trustedInternalCaller || isSandbox) && Number(data.totalAmount) > 0
        ? Number(data.totalAmount)
        : computedTotal;

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
      console.error('Error reading booking rules in createReservationServer:', e);
    }

    try {
      const timeZone = 'America/Mexico_City';
      const nowRaw = new Date();
      const mexicoDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(nowRaw);
      const queryDateObj = parse(data.date, 'yyyy-MM-dd', new Date());
      const nowDateObj = parse(mexicoDateStr, 'yyyy-MM-dd', new Date());
      const daysDiff = Math.round((queryDateObj.getTime() - nowDateObj.getTime()) / (1000 * 60 * 60 * 24));
      const maxDaysFuture = Number(bookingRules.dias_maximos_futuro) || 14;
      if (daysDiff < 0) {
        return { error: 'No es posible agendar en fechas u horarios pasados.' };
      }
      if (daysDiff > maxDaysFuture) {
        return {
          error: `La fecha seleccionada supera la ventana máxima de reserva permitida (${maxDaysFuture} días a futuro).`,
        };
      }
    } catch (dateErr) {
      console.warn('Error validando ventana máxima de fecha:', dateErr);
    }

    let clientHistory = null;
    const targetClientId = clientId || existingDoc?.id;
    const rawPhone = data.client?.phone || existingDoc?.data()?.telefono;
    const phoneLookup = normalizePhoneForLookup(rawPhone);

    if (existingDoc || targetClientId || phoneLookup.isValid) {
      const cData = existingDoc ? existingDoc.data() || {} : {};
      const canceladas = Number(cData.citas_canceladas) || 0;
      const noAsistidas = Number(cData.citas_no_asistidas) || 0;

      let realReservationsNoShows = 0;
      try {
        if (targetClientId) {
          const snapId = await db
            .collection('reservas')
            .where('cliente_id', '==', targetClientId)
            .where('estado', '==', 'No asiste')
            .get();
          realReservationsNoShows = Math.max(realReservationsNoShows, snapId.size);
        }
        if (phoneLookup.primary && phoneLookup.isValid) {
          const snapPhone = await db
            .collection('reservas')
            .where('cliente_telefono', '==', phoneLookup.primary)
            .where('estado', '==', 'No asiste')
            .get();
          realReservationsNoShows = Math.max(realReservationsNoShows, snapPhone.size);
        }
      } catch (err) {
        console.warn('[Booking] Error comprobando inasistencias en reservas:', err);
      }

      const trueNoShows = Math.max(noAsistidas, realReservationsNoShows);

      if (existingDoc && trueNoShows > (Number(cData.citas_no_asistidas) || 0)) {
        existingDoc.ref
          .update({
            citas_no_asistidas: trueNoShows,
            actualizado_el: new Date(),
          })
          .catch(() => {});
      }

      clientHistory = {
        citas_canceladas: canceladas,
        citas_no_asistidas: trueNoShows,
        exento_anticipo: Boolean(cData.exento_anticipo),
        faltas_desde_exencion: Number(cData.faltas_desde_exencion) || 0,
      };
    }

    let sameDayActiveCount = 0;
    let sameDayActiveTotal = 0;
    try {
      const clientPhoneLookup = normalizePhoneForLookup(data.client?.phone);

      allReservationsToCheck.forEach((docSnap) => {
        const r = docSnap.data();
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
      console.warn('[Booking] Error calculando acumulado diario de citas:', sameDayCheckErr);
    }

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

    const originChannel = trustedInternalCaller
      ? data.canal_reserva || data.origin || 'web_publica'
      : 'web_publica';
    const isPaid =
      trustedInternalCaller && (data.paymentStatus === 'deposit_paid' || data.paymentStatus === 'paid');

    if (originChannel === 'web_publica' && evalResult.blockedOnline) {
      return {
        error:
          evalResult.blockedReason ||
          'Esta cita no está disponible para reserva online. Favor de comunicarse directamente a la sucursal.',
        blockedOnline: true,
      };
    }

    if (originChannel === 'web_publica' && requiresDeposit && !isPaid) {
      const ruleDetail =
        evalResult.reason === 'client_history'
          ? ` debido a que registras ${evalResult.clientNoShowsCount} inasistencia(s) previa(s)`
          : evalResult.reason === 'same_day_accumulation'
          ? ` (Escudo Anti-Fragmentación: ya cuentas con ${evalResult.sameDayActiveCount} cita(s) activa(s) en esta fecha y tu total acumulado diario alcanza $${(evalResult.sameDayAccumulatedTotal || grandTotal).toFixed(2)} MXN)`
          : evalResult.reason === 'opening_hour'
          ? ` por tratarse de la franja de apertura (${bookingRules.anticipo_horario_apertura_hora || '10:00'} a ${bookingRules.anticipo_horario_apertura_hora_fin || '10:30'} AM)`
          : evalResult.customRuleMessage
          ? ` (${evalResult.customRuleMessage})`
          : '';
      return {
        error: `Esta reserva requiere un anticipo del ${depositPercentage}% ($${calculatedDeposit} MXN)${ruleDetail}. Por favor realiza el pago en línea para confirmar tu cita.`,
        requiresPayment: true,
        depositAmount: calculatedDeposit,
      };
    }

    const finalAmountDue =
      trustedInternalCaller || isSandbox
        ? data.amountDue !== undefined && Number(data.amountDue) >= calculatedDeposit
          ? Number(data.amountDue)
          : requiresDeposit
          ? calculatedDeposit
          : Number(data.amountDue) || 0
        : requiresDeposit
        ? calculatedDeposit
        : 0;

    const finalRequiresDeposit = requiresDeposit || finalAmountDue > 0;

    const authoritativeEstado = trustedInternalCaller
      ? data.status || (finalRequiresDeposit && !isPaid ? 'Pendiente de pago' : 'Reservado')
      : finalRequiresDeposit
      ? 'Pendiente de pago'
      : 'Reservado';

    const authoritativePagoEstado = trustedInternalCaller
      ? data.paymentStatus || (finalRequiresDeposit && !isPaid ? 'pending_payment' : 'pendiente')
      : finalRequiresDeposit
      ? 'pending_payment'
      : 'pendiente';

    const reservationData = {
      cliente_id: clientId,
      cliente_telefono: data.client.phone || '',
      cliente_nombre: `${data.client.name || ''} ${data.client.lastName || ''}`.trim(),
      barbero_id: data.professionalId,
      professional_lock: isProfLocked,
      fecha: data.date,
      hora_inicio: data.time,
      hora_fin: endTimeStr,
      estado: authoritativeEstado,
      servicio: serviceNames,
      local_id: resolvedLocationId || 'default',
      items,
      total: grandTotal,
      origen: originChannel,
      canal_reserva: originChannel,
      createdAt: FieldValue.serverTimestamp(),
      pago_estado: authoritativePagoEstado,
      anticipo_esperado: finalAmountDue,
      saldo_pendiente: isPaid ? Math.max(0, grandTotal - finalAmountDue) : grandTotal,
      requiere_pago_anticipado: finalRequiresDeposit,
      ...(evalResult.isClientExempt
        ? {
            exento_anticipo: true,
            exento_por: existingDoc?.data()?.exento_anticipo_por || 'Cliente Exento de Anticipo',
            exento_motivo:
              existingDoc?.data()?.exento_anticipo_motivo ||
              'Cliente exento de anticipo en base de datos',
          }
        : {}),
    };

    if (isSandbox) {
      let sandboxId = `SANDBOX-${Math.floor(100000 + Math.random() * 900000)}`;
      try {
        const sRef = await db.collection('reservas_sandbox').add({
          ...reservationData,
          isSandbox: true,
          creado_en: FieldValue.serverTimestamp(),
          simulatedAt: FieldValue.serverTimestamp(),
        });
        sandboxId = sRef.id;
      } catch (sandboxErr) {
        console.warn('[SANDBOX] Guardado en reservas_sandbox omitido:', sandboxErr);
      }

      console.log(
        `[SANDBOX BOOKING] Reserva de prueba completada exitosamente sin afectar la agenda real (ID: ${sandboxId})`
      );
      return {
        success: true,
        reservationId: sandboxId,
        isSandbox: true,
        warning:
          'Modo Pruebas: Cita simulada correctamente (no afectó la agenda de la barbería ni envió correos).',
      };
    }

    const resRef = db.collection('reservas').doc();
    const actionToken = randomUUID();
    const slotLockIds = computeSlotLockIds(data.professionalId, data.date, startTimeStr, endTimeStr);

    try {
      await db.runTransaction(async (tx) => {
        const lockRefs = slotLockIds.map((id) => db.collection('agenda_locks').doc(id));
        const [sameDayTxSnap] = await Promise.all([
          tx.get(db.collection('reservas').where('fecha', '==', data.date)),
          ...lockRefs.map((ref) => tx.get(ref)),
        ]);

        const txNowMs = Date.now();
        const txConflict = sameDayTxSnap.docs.some((docSnap) => {
          const res = docSnap.data();
          if (res.estado === 'Cancelado' || res.estado === 'Cancelada' || res.estado === 'No asiste') {
            return false;
          }
          if (isExpiredPendingDepositReservation(res, txNowMs, 30)) {
            return false;
          }
          const isForProf =
            res.barbero_id === data.professionalId ||
            (res.items && res.items.some((i: any) => i.barbero_id === data.professionalId));
          if (!isForProf) return false;
          return startTimeStr < res.hora_fin && endTimeStr > res.hora_inicio;
        });

        if (txConflict) {
          throw new Error('SLOT_CONFLICT');
        }

        tx.set(resRef, {
          ...reservationData,
          actionToken,
        });

        for (const lockRef of lockRefs) {
          tx.set(lockRef, {
            reservationId: resRef.id,
            barbero_id: data.professionalId,
            fecha: data.date,
            hora_inicio: startTimeStr,
            hora_fin: endTimeStr,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });
    } catch (txErr: any) {
      if (txErr?.message === 'SLOT_CONFLICT') {
        return { error: 'Ya existe una reserva en este horario.' };
      }
      throw txErr;
    }

    const emailTask = async () => {
      try {
        await sendBookingConfirmation(
          { ...reservationData, id: resRef.id, actionToken },
          db,
          data.client.email,
          data.professionalId
        );
      } catch (emailError: any) {
        console.error('Failed to send confirmation emails:', emailError);
      }
    };

    try {
      after(emailTask);
    } catch {
      // Fallback when invoked outside a Next.js request lifecycle (e.g. background jobs/tests)
      void emailTask();
    }

    return { success: true, reservationId: resRef.id, warning: null };
  } catch (error: any) {
    console.error('Error creating reservation:', error);
    return { error: error.message };
  }
}
