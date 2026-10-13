import { getDb } from '@/lib/firebase-server';
import { chatContextStorage } from './agent-context';
import { getMexicoDateInfo, normalizeClientPhone, reservationMatchesPhone, isUpcomingReservation, isValidBookingDate } from './agent-utils';

export function assertLiveAgentMutation() {
  const context = chatContextStorage.getStore();
  if (context) context.mutationAttempted = true;
}

// Identity comes from the conversation, never from a model-supplied reservation ID.
export async function getClientReservations(phone?: string) {
  const context = chatContextStorage.getStore();
  const candidatePhones = [phone, context?.clientPhone].filter((p): p is string => Boolean(p && p.trim()));
  const isWebOrSimPhone = candidatePhones.some(p => p.startsWith('web') || p.startsWith('sim'));
  const normalizedPhones = candidatePhones.map(normalizeClientPhone).filter(Boolean);

  if (normalizedPhones.length === 0 && !isWebOrSimPhone) {
    throw new Error('No hay un teléfono válido para identificar al cliente. Solicita apoyo de recepción.');
  }

  const db = getDb();
  const ids = new Set<string>();
  if (context?.clientId) {
    ids.add(context.clientId);
  }

  for (const norm of normalizedPhones) {
    for (const val of new Set([norm, `52${norm}`, `521${norm}`])) {
      const clients = await db.collection('clientes').where('telefono', '==', val).get();
      clients.docs.forEach(doc => ids.add(doc.id));
    }
  }

  const { todayIso } = getMexicoDateInfo();
  // Consultar concurrentemente reservas reales y reservas_sandbox para soporte completo en simulador y localhost
  const [realSnap, sandboxSnap] = await Promise.all([
    db.collection('reservas').where('fecha', '>=', todayIso).get(),
    db.collection('reservas_sandbox').where('fecha', '>=', todayIso).get(),
  ]);

  const allDocs = [...realSnap.docs, ...sandboxSnap.docs];

  return allDocs.filter(doc => {
    const data = doc.data();
    const phoneMatches = candidatePhones.some(p => reservationMatchesPhone(data, p)) ||
      (isWebOrSimPhone && [
        data.cliente_telefono,
        data.customerPhone,
        data.clientPhone,
        data.customer?.telefono,
        data.customer?.phone,
      ].some(val => candidatePhones.includes(val)));

    const clientIdMatches = ids.size > 0 && Boolean(data.cliente_id && ids.has(data.cliente_id));

    return isUpcomingReservation(data) && (phoneMatches || clientIdMatches);
  }).sort((a, b) => `${a.data().fecha} ${a.data().hora_inicio || a.data().time || ''}`.localeCompare(`${b.data().fecha} ${b.data().hora_inicio || b.data().time || ''}`));
}

export async function getClientReservation(id?: string, phone?: string) {
  assertLiveAgentMutation();
  const reservations = await getClientReservations(phone);
  if (id) {
    const reservation = reservations.find(doc => doc.id === id);
    if (!reservation) throw new Error('No se encontró esa cita activa entre las citas del cliente de esta conversación.');
    return reservation;
  }
  if (reservations.length > 1) throw new Error('El cliente tiene varias citas. Consulta sus citas y pregunta cuál desea modificar antes de continuar.');
  if (!reservations.length) throw new Error('No se encontró ninguna cita próxima activa para este cliente.');
  return reservations[0];
}

export async function validateAgentBooking(date: string, time: string, creating = false) {
  assertLiveAgentMutation();
  if (!isValidBookingDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('La fecha u hora no es válida. Confirma los datos con el cliente.');
  const config = (await getDb().collection('settings').doc('sofia').get()).data() || {};
  if (creating && config.autoCreateAppointments === false) throw new Error('El agendamiento automático está desactivado. Solicita a recepción que registre la cita.');
  const { todayIso } = getMexicoDateInfo();
  const days = (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${todayIso}T12:00:00Z`)) / 86400000;
  if (days < 0 || days > (config.maxDaysInFuture ?? 14)) throw new Error('La fecha está fuera del periodo permitido para agendar.');
  if (Date.parse(`${date}T${time}:00-06:00`) < Date.now() + (config.minReservationBuffer ?? 30) * 60000) throw new Error('Ese horario ya pasó o no cumple la anticipación mínima para reservar.');
}
