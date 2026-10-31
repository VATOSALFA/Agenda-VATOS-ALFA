import { Timestamp } from 'firebase-admin/firestore';

export interface BarberDayScheduleInfo {
  barberId: string;
  name: string;
  publicName: string;
  displayName: string;
  fecha: string;
  diaSemana: string;
  isWorkingDay: boolean;
  workingHours: { start: string; end: string } | null;
  hasSpecialJourney: boolean;
  specialJourneyDetails?: { id: string; start: string; end: string } | null;
  nonWorkBefore: { start: string; end: string } | null;
  nonWorkAfter: { start: string; end: string } | null;
  scheduleBreaks: Array<{ start: string; end: string }>;
  existingBlocks: Array<{
    id: string;
    hora_inicio: string;
    hora_fin: string;
    motivo: string;
    type?: string;
  }>;
  specialAvailableHours: Array<{
    id: string;
    hora_inicio: string;
    hora_fin: string;
    motivo: string;
  }>;
  activeReservations: Array<{
    id: string;
    cliente: string;
    telefono?: string;
    hora_inicio: string;
    hora_fin: string;
    servicio: string;
    estado: string;
  }>;
  isEntireDayCovered: boolean;
  isEntireShiftBlocked: boolean;
  statusDescription: string;
}

const BARBER_ALIASES: Record<string, string[]> = {
  eduardo: ['lalo', 'lalito', 'eduardo', 'mikelalomen'],
  lalo: ['lalo', 'lalito', 'eduardo', 'mikelalomen'],
  beatriz: ['bety', 'betty', 'beatriz'],
  bety: ['bety', 'betty', 'beatriz'],
  guadalupe: ['lupita', 'guadalupe', 'lupe'],
  lupita: ['lupita', 'guadalupe', 'lupe'],
  ivon: ['ivon', 'ivonne', 'ivo'],
  ivonne: ['ivon', 'ivonne', 'ivo'],
  alfredo: ['alfredo', 'fredy', 'freddy', 'alfred'],
  fredy: ['alfredo', 'fredy', 'freddy', 'alfred'],
  cesar: ['cesar', 'césar'],
  césar: ['cesar', 'césar'],
};

export function normalizeName(str: string): string {
  return (str || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function matchesBarber(prof: any, query: string): boolean {
  if (!prof || !query) return false;
  const qNorm = normalizeName(query);
  if (!qNorm) return false;

  const idNorm = normalizeName(prof.id || '');
  if (idNorm === qNorm) return true;

  const nameNorm = normalizeName(prof.name || '');
  const publicNorm = normalizeName(prof.publicName || '');
  const nickNorm = normalizeName(prof.nickname || '');

  const names = [nameNorm, publicNorm, nickNorm].filter(Boolean);

  for (const n of names) {
    if (n === qNorm) return true;
    if (n.includes(qNorm) || qNorm.includes(n)) return true;
  }

  // Check aliases dictionary
  for (const [key, list] of Object.entries(BARBER_ALIASES)) {
    const keyNorm = normalizeName(key);
    const listNorm = list.map(normalizeName);
    const queryMatches = keyNorm === qNorm || listNorm.includes(qNorm);
    const profMatches = names.some((n) => keyNorm === n || listNorm.includes(n));
    if (queryMatches && profMatches) return true;
  }

  return false;
}

export function findBarber(query: string, professionals: any[]): any | null {
  if (!query || !professionals || professionals.length === 0) return null;
  const qNorm = normalizeName(query);

  // Exact ID or publicName / name match first
  for (const p of professionals) {
    if (p.deleted || p.active === false) continue;
    if (normalizeName(p.id) === qNorm) return p;
    if (normalizeName(p.publicName) === qNorm) return p;
    if (normalizeName(p.name) === qNorm) return p;
  }

  // Substring or alias match
  for (const p of professionals) {
    if (p.deleted || p.active === false) continue;
    if (matchesBarber(p, query)) return p;
  }

  return null;
}

export function getDayOfWeekKey(dateStr: string): string {
  // Use noon to avoid timezone shift on YYYY-MM-DD
  const d = new Date(`${dateStr}T12:00:00.000-06:00`);
  const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  return days[d.getDay()] || 'lunes';
}

export function timeToMinutes(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [h = 0, m = 0] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseTimeToHHmm(str: string): string | null {
  if (!str) return null;
  const s = str.trim().toLowerCase();
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = parseInt(m24[1], 10);
    const m = parseInt(m24[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const m = m12[2] ? parseInt(m12[2], 10) : 0;
    const modifier = (m12[3] || '').replace(/\./g, '');
    if (modifier === 'pm' && h < 12) h += 12;
    if (modifier === 'am' && h === 12) h = 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }
  return null;
}

export async function getBarberScheduleForDay({
  db,
  barber,
  dateStr,
  localId,
}: {
  db: any;
  barber: any;
  dateStr: string;
  localId?: string;
}): Promise<BarberDayScheduleInfo> {
  const dayKey = getDayOfWeekKey(dateStr);
  const barberId = barber.id;
  const displayName = barber.publicName || barber.name || 'Barbero';

  // 1. Fetch special journeys, blocks, reservations, and local in parallel
  const [journeySnap, blocksSnap, resSnap, localSnap] = await Promise.all([
    db
      .collection('jornadas_especiales')
      .where('profesionalId', '==', barberId)
      .where('fecha', '==', dateStr)
      .get(),
    db
      .collection('bloqueos_horario')
      .where('barbero_id', '==', barberId)
      .where('fecha', '==', dateStr)
      .get(),
    db.collection('reservas').where('fecha', '==', dateStr).get(),
    localId ? db.collection('locales').doc(localId).get() : Promise.resolve(null),
  ]);

  // Determine local operating bounds for that day
  let localOpen = '10:00';
  let localClose = '21:00';
  if (localSnap && localSnap.exists) {
    const lData = localSnap.data();
    const lDay = lData?.schedule?.[dayKey];
    if (lDay && lDay.enabled) {
      if (lDay.start) localOpen = lDay.start;
      if (lDay.end) localClose = lDay.end;
    }
  }

  // 2. Determine shift from special journeys or regular schedule
  let isWorkingDay = false;
  let workingHours: { start: string; end: string } | null = null;
  let hasSpecialJourney = false;
  let specialJourneyDetails: { id: string; start: string; end: string } | null = null;
  const scheduleBreaks: Array<{ start: string; end: string }> = [];

  if (!journeySnap.empty) {
    hasSpecialJourney = true;
    const jDoc = journeySnap.docs[0];
    const jData = jDoc.data();
    isWorkingDay = true;
    workingHours = {
      start: jData.hora_inicio || localOpen,
      end: jData.hora_fin || localClose,
    };
    specialJourneyDetails = {
      id: jDoc.id,
      start: workingHours.start,
      end: workingHours.end,
    };
  } else {
    const regularSchedule = barber.schedule?.[dayKey] || barber.workSchedule?.[dayKey];
    if (regularSchedule && regularSchedule.enabled) {
      isWorkingDay = true;
      workingHours = {
        start: regularSchedule.start || localOpen,
        end: regularSchedule.end || localClose,
      };
      if (Array.isArray(regularSchedule.breaks)) {
        for (const b of regularSchedule.breaks) {
          if (b.start && b.end) {
            scheduleBreaks.push({ start: b.start, end: b.end });
          }
        }
      }
    } else {
      isWorkingDay = false;
      workingHours = null;
    }
  }

  // 3. Classify blocks
  const existingBlocks: BarberDayScheduleInfo['existingBlocks'] = [];
  const specialAvailableHours: BarberDayScheduleInfo['specialAvailableHours'] = [];

  blocksSnap.forEach((doc: any) => {
    const b = doc.data();
    if (b.type === 'available') {
      specialAvailableHours.push({
        id: doc.id,
        hora_inicio: b.hora_inicio,
        hora_fin: b.hora_fin,
        motivo: b.motivo || 'Horario Habilitado',
      });
    } else {
      existingBlocks.push({
        id: doc.id,
        hora_inicio: b.hora_inicio,
        hora_fin: b.hora_fin,
        motivo: b.motivo || 'Horario Bloqueado',
        type: b.type,
      });
    }
  });

  // Sort blocks chronologically
  existingBlocks.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

  // 4. Classify reservations
  const activeReservations: BarberDayScheduleInfo['activeReservations'] = [];
  resSnap.forEach((doc: any) => {
    const r = doc.data();
    if (r.estado === 'Cancelado' || r.estado === 'No asiste') return;

    const isForBarber =
      r.barbero_id === barberId ||
      (Array.isArray(r.items) && r.items.some((item: any) => item?.barbero_id === barberId));
    if (!isForBarber) return;

    activeReservations.push({
      id: doc.id,
      cliente: r.customer?.nombre || r.cliente_nombre || 'Cliente',
      telefono: r.customer?.telefono || '',
      hora_inicio: r.hora_inicio || '',
      hora_fin: r.hora_fin || '',
      servicio: r.servicio || (Array.isArray(r.items) ? r.items.map((i: any) => i.nombre).join(', ') : 'Servicio'),
      estado: r.estado || 'Reservado',
    });
  });
  activeReservations.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

  // 5. Calculate non-work periods (outside shift)
  let nonWorkBefore: { start: string; end: string } | null = null;
  let nonWorkAfter: { start: string; end: string } | null = null;

  if (isWorkingDay && workingHours) {
    if (timeToMinutes(workingHours.start) > timeToMinutes(localOpen)) {
      nonWorkBefore = { start: localOpen, end: workingHours.start };
    }
    if (timeToMinutes(workingHours.end) < timeToMinutes(localClose)) {
      nonWorkAfter = { start: workingHours.end, end: localClose };
    }
  }

  // 6. Check if entire shift or day is covered / blocked
  let isEntireShiftBlocked = false;
  let isEntireDayCovered = false;

  if (!isWorkingDay) {
    // If not working day, whole day is covered as free/unavailable
    isEntireDayCovered = true;
    isEntireShiftBlocked = true;
  } else if (workingHours) {
    const shiftStartM = timeToMinutes(workingHours.start);
    const shiftEndM = timeToMinutes(workingHours.end);

    // Combine breaks and blocking blocks
    const allCoverages: Array<{ startM: number; endM: number; motivo: string }> = [];
    for (const brk of scheduleBreaks) {
      allCoverages.push({
        startM: timeToMinutes(brk.start),
        endM: timeToMinutes(brk.end),
        motivo: 'Descanso programado',
      });
    }
    for (const blk of existingBlocks) {
      allCoverages.push({
        startM: timeToMinutes(blk.hora_inicio),
        endM: timeToMinutes(blk.hora_fin),
        motivo: blk.motivo,
      });
    }

    // Sort coverages
    allCoverages.sort((a, b) => a.startM - b.startM);

    // Merge overlapping/contiguous coverages
    const merged: Array<{ startM: number; endM: number }> = [];
    for (const cov of allCoverages) {
      // Intersect with shift bounds
      const covStart = Math.max(shiftStartM, cov.startM);
      const covEnd = Math.min(shiftEndM, cov.endM);
      if (covEnd <= covStart) continue;

      if (merged.length === 0) {
        merged.push({ startM: covStart, endM: covEnd });
      } else {
        const last = merged[merged.length - 1];
        if (covStart <= last.endM) {
          last.endM = Math.max(last.endM, covEnd);
        } else {
          merged.push({ startM: covStart, endM: covEnd });
        }
      }
    }

    // Check if total covered time equals shift duration
    const totalCoveredMins = merged.reduce((acc, m) => acc + (m.endM - m.startM), 0);
    const totalShiftMins = shiftEndM - shiftStartM;

    if (totalCoveredMins >= totalShiftMins) {
      isEntireShiftBlocked = true;
      isEntireDayCovered = true;
    }
  }

  // 7. Generate concise human-readable status description
  let statusDescription = '';
  if (!isWorkingDay) {
    statusDescription = `${displayName} no labora los ${dayKey}s (marcado en agenda como Día libre / No disponible todo el día).`;
  } else if (workingHours) {
    const nonWorkParts: string[] = [];
    if (nonWorkBefore) nonWorkParts.push(`antes de ${nonWorkBefore.end} no disponible`);
    if (nonWorkAfter) nonWorkParts.push(`después de ${nonWorkAfter.start} no disponible`);
    const nonWorkText = nonWorkParts.length > 0 ? ` (${nonWorkParts.join(', ')})` : '';

    if (isEntireShiftBlocked) {
      const blockDetails = existingBlocks.map((b) => `${b.hora_inicio}-${b.hora_fin} ("${b.motivo}")`).join(', ');
      statusDescription = `Jornada de ${workingHours.start} a ${workingHours.end}${nonWorkText}. Su horario ya está 100% CERRADO/BLOQUEADO para hoy: ${blockDetails || 'descanso total'}. No tiene citas activas.`;
    } else {
      const parts: string[] = [`Jornada: ${workingHours.start} a ${workingHours.end}${nonWorkText}`];
      if (existingBlocks.length > 0) {
        parts.push(
          `Bloqueos registrados: ${existingBlocks.map((b) => `${b.hora_inicio}-${b.hora_fin} ("${b.motivo}")`).join(', ')}`
        );
      }
      if (scheduleBreaks.length > 0) {
        parts.push(`Descansos: ${scheduleBreaks.map((b) => `${b.start}-${b.end}`).join(', ')}`);
      }
      if (activeReservations.length > 0) {
        parts.push(
          `${activeReservations.length} cita(s) activa(s): ${activeReservations.map((r) => `${r.cliente} ${r.hora_inicio}-${r.hora_fin}`).join(', ')}`
        );
      } else {
        parts.push('Sin citas agendadas');
      }
      statusDescription = parts.join('. ') + '.';
    }
  }

  return {
    barberId,
    name: barber.name || displayName,
    publicName: barber.publicName || displayName,
    displayName,
    fecha: dateStr,
    diaSemana: dayKey,
    isWorkingDay,
    workingHours,
    hasSpecialJourney,
    specialJourneyDetails,
    nonWorkBefore,
    nonWorkAfter,
    scheduleBreaks,
    existingBlocks,
    specialAvailableHours,
    activeReservations,
    isEntireDayCovered,
    isEntireShiftBlocked,
    statusDescription,
  };
}

export function calculateBarberFreeSlots(
  schedule: BarberDayScheduleInfo,
  durationMinutes = 40
): string[] {
  if (!schedule.isWorkingDay || !schedule.workingHours) {
    return [];
  }

  const shiftStartM = timeToMinutes(schedule.workingHours.start);
  const shiftEndM = timeToMinutes(schedule.workingHours.end);

  // Busy intervals
  const busyIntervals: Array<{ startM: number; endM: number }> = [];

  for (const brk of schedule.scheduleBreaks) {
    busyIntervals.push({
      startM: timeToMinutes(brk.start),
      endM: timeToMinutes(brk.end),
    });
  }

  for (const blk of schedule.existingBlocks) {
    if (blk.type === 'available') continue;
    busyIntervals.push({
      startM: timeToMinutes(blk.hora_inicio),
      endM: timeToMinutes(blk.hora_fin),
    });
  }

  for (const res of schedule.activeReservations) {
    if (res.estado === 'Cancelado' || res.estado === 'No asiste') continue;
    busyIntervals.push({
      startM: timeToMinutes(res.hora_inicio),
      endM: timeToMinutes(res.hora_fin),
    });
  }

  const availableSlots: string[] = [];

  // Check every 15 minutes within shift
  for (let m = shiftStartM; m + durationMinutes <= shiftEndM; m += 15) {
    const slotStart = m;
    const slotEnd = m + durationMinutes;

    const collides = busyIntervals.some(
      (b) => slotStart < b.endM && slotEnd > b.startM
    );

    if (!collides) {
      availableSlots.push(minutesToTime(slotStart));
    }
  }

  return availableSlots;
}
