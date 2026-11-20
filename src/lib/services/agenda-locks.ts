/**
 * Genera llaves determinísticas de bloqueo por franja de 15 minutos
 * para prevenir condiciones de carrera (double-booking) en `db.runTransaction`.
 */
export function computeSlotLockIds(
  barberoId: string,
  fecha: string,
  horaInicio: string,
  horaFin: string
): string[] {
  const cleanBarber = String(barberoId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanDate = String(fecha || '').trim();
  if (!cleanBarber || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return [];

  const toMins = (t: string): number => {
    const [h, m] = String(t || '').split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
    return h * 60 + m;
  };

  const startMins = toMins(horaInicio);
  const endMins = toMins(horaFin);
  if (startMins < 0 || endMins <= startMins) return [];

  const step = 15;
  const firstBucket = Math.floor(startMins / step) * step;
  const ids: string[] = [];

  for (let cur = firstBucket; cur < endMins; cur += step) {
    const hh = String(Math.floor(cur / 60)).padStart(2, '0');
    const mm = String(cur % 60).padStart(2, '0');
    ids.push(`lock_${cleanBarber}_${cleanDate}_${hh}${mm}`);
  }
  return ids;
}
