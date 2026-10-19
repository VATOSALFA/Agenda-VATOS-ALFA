import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export interface DaySchedule {
  enabled: boolean;
  start: string;
  end: string;
}

export type WeeklySchedule = Record<string, DaySchedule | undefined>;

/**
 * Normaliza el nombre del día de la semana en español sin acentos ('lunes' .. 'domingo')
 */
export function getNormalizedDayOfWeek(date: Date): string {
  return format(date, 'eeee', { locale: es })
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Obtiene el horario operativo de una sucursal para un día de la semana específico.
 * Si no está configurado, usa por defecto 10:00-21:00 (lunes a sábado) y 10:00-20:00 (domingo).
 */
export function getLocalDaySchedule(
  localSchedule: WeeklySchedule | undefined,
  dayOfWeek: string
): DaySchedule {
  const configured = localSchedule?.[dayOfWeek] || localSchedule?.lunes;
  const defaultEnd = dayOfWeek === 'domingo' ? '20:00' : '21:00';

  if (!configured) {
    return { enabled: true, start: '10:00', end: defaultEnd };
  }

  return {
    enabled: configured.enabled !== false,
    start: configured.start || '10:00',
    end: configured.end || defaultEnd,
  };
}

/**
 * Recorta el horario regular de un profesional para que siempre respete
 * el horario operativo de apertura y cierre de la sucursal en ese día.
 */
export function clampRegularScheduleToLocal(
  regularSchedule: { enabled?: boolean; start?: string; end?: string } | undefined | null,
  localSchedule: WeeklySchedule | undefined,
  dayOfWeek: string
): DaySchedule | null {
  if (!regularSchedule || !regularSchedule.enabled) {
    return null;
  }

  const localDay = getLocalDaySchedule(localSchedule, dayOfWeek);
  if (!localDay.enabled) {
    return { enabled: false, start: localDay.start, end: localDay.end };
  }

  const regStart = regularSchedule.start || localDay.start;
  const regEnd = regularSchedule.end || localDay.end;

  const clampedStart = regStart < localDay.start ? localDay.start : regStart;
  const clampedEnd = regEnd > localDay.end ? localDay.end : regEnd;

  if (clampedStart >= clampedEnd) {
    return { enabled: false, start: clampedStart, end: clampedEnd };
  }

  return {
    enabled: true,
    start: clampedStart,
    end: clampedEnd,
  };
}

/**
 * Verifica si un rango [start, end] está cubierto por un Horario Especial habilitado
 * ('bloqueos_horario' con type === 'available') o una Jornada Especial ('jornadas_especiales').
 */
export function isTimeRangeCoveredBySpecialSchedule(
  start: string,
  end: string,
  availableBlocks: { hora_inicio: string; hora_fin: string }[],
  profSpecialJourneys: { hora_inicio: string; hora_fin: string }[]
): boolean {
  if (start > end) return false;
  if (start === end) {
    const coveredByBlock = availableBlocks.some(b => b.hora_inicio <= start && b.hora_fin > start);
    const coveredBySpecial = profSpecialJourneys.some(sj => sj.hora_inicio <= start && sj.hora_fin > start);
    return coveredByBlock || coveredBySpecial;
  }
  const coveredByBlock = availableBlocks.some(b => b.hora_inicio <= start && b.hora_fin >= end);
  const coveredBySpecial = profSpecialJourneys.some(sj => sj.hora_inicio <= start && sj.hora_fin >= end);
  return coveredByBlock || coveredBySpecial;
}

/**
 * Calcula las opciones de horas válidas para los selectores de citas respetando
 * el horario de la sucursal y expandiendo únicamente si existen horarios especiales habilitados.
 */
export function computeTimeSelectorOptions(params: {
  date: Date;
  localId?: string;
  localSchedule?: WeeklySchedule;
  specialJourneys?: any[];
  timeBlocks?: any[];
  selectedProfIds?: string[];
}) {
  const {
    date,
    localId,
    localSchedule,
    specialJourneys = [],
    timeBlocks = [],
    selectedProfIds = [],
  } = params;

  const formattedDate = format(date, 'yyyy-MM-dd');
  const dayOfWeek = getNormalizedDayOfWeek(date);
  const localDay = getLocalDaySchedule(localSchedule, dayOfWeek);

  let baseSH = 10, baseSM = 0;
  let baseEH = dayOfWeek === 'domingo' ? 20 : 21, baseEM = 0;
  const baseEnabled = localDay.enabled;

  if (localDay.enabled && localDay.start && localDay.end) {
    const [parsedSH, parsedSM] = localDay.start.split(':').map(Number);
    const [parsedEH, parsedEM] = localDay.end.split(':').map(Number);
    if (!isNaN(parsedSH) && !isNaN(parsedSM)) {
      baseSH = parsedSH;
      baseSM = parsedSM;
    }
    if (!isNaN(parsedEH) && !isNaN(parsedEM)) {
      baseEH = parsedEH;
      baseEM = parsedEM;
    }
  }

  const computeBoundsForProfs = (profIds: string[]) => {
    let sH = baseSH, sM = baseSM;
    let eH = baseEH, eM = baseEM;
    let anyEnabled = baseEnabled;

    const expandBounds = (startStr?: string, endStr?: string) => {
      if (!startStr || !endStr) return;
      const [stH, stM] = startStr.split(':').map(Number);
      const [enH, enM] = endStr.split(':').map(Number);
      if (isNaN(stH) || isNaN(stM) || isNaN(enH) || isNaN(enM)) return;

      if (!anyEnabled) {
        sH = stH; sM = stM;
        eH = enH; eM = enM;
        anyEnabled = true;
      } else {
        if (stH < sH || (stH === sH && stM < sM)) {
          sH = stH; sM = stM;
        }
        if (enH > eH || (enH === eH && enM > eM)) {
          eH = enH; eM = enM;
        }
      }
    };

    // 1. Expandir si existen Jornadas Especiales ('jornadas_especiales') para la fecha, sucursal y profesional(es)
    specialJourneys.forEach((sj: any) => {
      const matchesLocal = !sj.local_id || !localId || sj.local_id === localId;
      const sjProfId = sj.profesionalId || sj.barbero_id;
      const matchesProf = profIds.length === 0 || (sjProfId && profIds.includes(sjProfId));
      if (sj.fecha === formattedDate && matchesLocal && matchesProf) {
        expandBounds(sj.hora_inicio, sj.hora_fin);
      }
    });

    // 2. Expandir si existen Horarios Especiales habilitados desde Agenda ('bloqueos_horario' con type === 'available')
    timeBlocks.forEach((tb: any) => {
      const matchesLocal = !tb.local_id || !localId || tb.local_id === localId;
      const matchesProf = profIds.length === 0 || (tb.barbero_id && profIds.includes(tb.barbero_id));
      if (tb.fecha === formattedDate && tb.type === 'available' && matchesLocal && matchesProf) {
        expandBounds(tb.hora_inicio, tb.hora_fin);
      }
    });

    const maxStartHour = eM > 0 ? eH : Math.max(sH, eH - 1);
    const startHours = Array.from({ length: Math.max(1, maxStartHour - sH + 1) }, (_, i) => sH + i);
    const endHours = Array.from({ length: Math.max(1, eH - sH + 1) }, (_, i) => sH + i);
    return { startHours, endHours };
  };

  const { startHours, endHours } = computeBoundsForProfs(selectedProfIds);
  const getStartHoursForProf = (profId?: string) => {
    return computeBoundsForProfs(profId ? [profId] : selectedProfIds).startHours;
  };

  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  return { hours: startHours, startHours, endHours, getStartHoursForProf, minutes };
}

/**
 * Calcula el horario efectivo de un profesional en una fecha determinada,
 * combinando su horario regular recortado al horario de la sucursal con sus
 * Jornadas Especiales ('jornadas_especiales') para ese día.
 */
export function getEffectiveBarberDaySchedule(params: {
  barber: { id: string; schedule?: Record<string, any> };
  date: Date;
  localSchedule?: Record<string, any>;
  specialJourneys?: any[];
}): any | null {
  const { barber, date, localSchedule, specialJourneys = [] } = params;
  const dateStr = format(date, 'yyyy-MM-dd');
  const dayOfWeek = getNormalizedDayOfWeek(date);

  const regSchedule = barber.schedule ? barber.schedule[dayOfWeek] : null;
  const localDay = localSchedule?.[dayOfWeek];
  const isLocalOpen = localDay ? localDay.enabled !== false : true;

  const barberJourneys = (specialJourneys || []).filter(
    (s: any) => (s.profesionalId === barber.id || s.barbero_id === barber.id) && s.fecha === dateStr
  );

  if (barberJourneys.length > 0) {
    const parseMins = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const fmtMins = (mins: number) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const workingIntervals: { start: number; end: number }[] = [];

    if (regSchedule && regSchedule.enabled && regSchedule.start && regSchedule.end && isLocalOpen) {
      let regStart = parseMins(regSchedule.start);
      let regEnd = parseMins(regSchedule.end);
      if (localDay && localDay.enabled && localDay.start && localDay.end) {
        regStart = Math.max(regStart, parseMins(localDay.start));
        regEnd = Math.min(regEnd, parseMins(localDay.end));
      }
      if (regStart < regEnd) {
        let regSegments: { start: number; end: number }[] = [{ start: regStart, end: regEnd }];
        if (regSchedule.breaks && Array.isArray(regSchedule.breaks)) {
          regSchedule.breaks.forEach((brk: any) => {
            if (!brk.start || !brk.end) return;
            const bStart = parseMins(brk.start);
            const bEnd = parseMins(brk.end);
            if (bStart >= bEnd) return;
            const nextSegs: { start: number; end: number }[] = [];
            regSegments.forEach(seg => {
              if (bEnd <= seg.start || bStart >= seg.end) {
                nextSegs.push(seg);
              } else {
                if (bStart > seg.start) nextSegs.push({ start: seg.start, end: bStart });
                if (bEnd < seg.end) nextSegs.push({ start: bEnd, end: seg.end });
              }
            });
            regSegments = nextSegs;
          });
        }
        workingIntervals.push(...regSegments);
      }
    }

    barberJourneys.forEach((j: any) => {
      if (j.hora_inicio && j.hora_fin) {
        const s = parseMins(j.hora_inicio);
        const e = parseMins(j.hora_fin);
        if (s < e) workingIntervals.push({ start: s, end: e });
      }
    });

    if (workingIntervals.length > 0) {
      workingIntervals.sort((a, b) => a.start - b.start);
      const merged: { start: number; end: number }[] = [];
      workingIntervals.forEach(iv => {
        if (merged.length === 0) {
          merged.push({ ...iv });
        } else {
          const last = merged[merged.length - 1];
          if (iv.start <= last.end) {
            last.end = Math.max(last.end, iv.end);
          } else {
            merged.push({ ...iv });
          }
        }
      });

      const overallStart = fmtMins(merged[0].start);
      const overallEnd = fmtMins(merged[merged.length - 1].end);
      const breaks: { start: string; end: string }[] = [];
      for (let i = 0; i < merged.length - 1; i++) {
        if (merged[i].end < merged[i + 1].start) {
          breaks.push({ start: fmtMins(merged[i].end), end: fmtMins(merged[i + 1].start) });
        }
      }

      return {
        enabled: true,
        start: overallStart,
        end: overallEnd,
        breaks,
      };
    }
  }

  if (!isLocalOpen) {
    return { enabled: false, start: localDay?.start || '10:00', end: localDay?.end || '20:00' };
  }

  if (regSchedule && regSchedule.enabled && regSchedule.start && regSchedule.end && localDay?.enabled && localDay?.start && localDay?.end) {
    const clampedStart = regSchedule.start > localDay.start ? regSchedule.start : localDay.start;
    const clampedEnd = regSchedule.end < localDay.end ? regSchedule.end : localDay.end;
    if (clampedStart >= clampedEnd) {
      return { ...regSchedule, enabled: false };
    }
    return {
      ...regSchedule,
      start: clampedStart,
      end: clampedEnd,
    };
  }

  return regSchedule;
}

