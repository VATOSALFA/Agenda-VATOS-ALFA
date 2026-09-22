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
  const trustedPhone = context?.clientPhone || phone || '';
  const normalized = normalizeClientPhone(trustedPhone);
  if (!normalized) throw new Error('No hay un teléfono válido para identificar al cliente. Solicita apoyo de recepción.');
  const db = getDb();
  const ids = new Set<string>();
  for (const value of new Set([trustedPhone, normalized, `52${normalized}`, `521${normalized}`])) {
    const clients = await db.collection('clientes').where('telefono', '==', value).get();
    clients.docs.forEach(doc => ids.add(doc.id));
  }
  const snapshot = await db.collection('reservas').where('fecha', '>=', getMexicoDateInfo().todayIso).get();
  return snapshot.docs.filter(doc => {
    const data = doc.data();
    return isUpcomingReservation(data) && (reservationMatchesPhone(data, trustedPhone) || ids.has(data.cliente_id));
  }).sort((a, b) => `${a.data().fecha} ${a.data().hora_inicio}`.localeCompare(`${b.data().fecha} ${b.data().hora_inicio}`));
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
