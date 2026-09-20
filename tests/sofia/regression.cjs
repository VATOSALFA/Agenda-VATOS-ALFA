// Isolated regression tests: no Firebase credentials, network, or real reservations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
let records = {};
let slots = ['16:00'];
let bookingCalls = 0;
let lastBooking;
let settings = {};
let catalog = {};
const originalError = console.error;
console.error = (...args) => { if (!String(args[0]).startsWith('Error in ')) originalError(...args); };
const snapshot = (id) => ({ id, exists: !!records[id], data: () => records[id], ref: ref(id) });
function ref(id) {
  return { id, get: async () => snapshot(id), update: async value => Object.assign(records[id], value), set: async value => { records[id] = { ...records[id], ...value }; } };
}
const db = {
  collection(name) {
    return {
      doc: id => name === 'reservas' ? ref(id) : ({ get: async () => ({ exists: true, data: () => settings }), set: async () => {} }),
      where() { return this; },
      get: async () => ({ docs: name === 'reservas' ? Object.keys(records).map(snapshot) : (catalog[name] || []).map(value => ({ id: value.id, data: () => value })), empty: name !== 'reservas' }),
    };
  },
  runTransaction: async fn => fn({ get: target => target.get(), update: (target, value) => target.update(value) }),
};
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '@/lib/firebase-server') return { getDb: () => db };
  if (request === '@/ai/genkit') return { ai: { defineTool: (_schema, fn) => fn } };
  if (request === '@/lib/actions/booking') return { getAvailableSlots: async () => ({ slots }), createPublicReservation: async data => { bookingCalls++; lastBooking = data; return { error: 'Horario ocupado' }; } };
  if (request.startsWith('@/')) request = path.join(root, 'src', request.slice(2));
  return originalLoad.call(this, request, parent, isMain);
};
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  module._compile(compiled.outputText, filename);
};
const utils = require(path.join(root, 'src/lib/ai/agent-utils.ts'));
const { chatContextStorage } = require(path.join(root, 'src/lib/ai/agent-context.ts'));
const tools = require(path.join(root, 'src/lib/ai/agent-tools.ts'));
const reservations = require(path.join(root, 'src/lib/ai/agent-reservations.ts'));
const { executeFallbackLogic } = require(path.join(root, 'src/lib/ai/agent-fallback.ts'));
const phone = '4421234567';
const tomorrow = utils.getMexicoDateInfo().tomorrowIso;
const appointment = (extra = {}) => ({ cliente_telefono: `+52${phone}`, fecha: tomorrow, hora_inicio: '12:00', hora_fin: '12:45', estado: 'Reservado', barbero_id: 'barber-1', items: [], ...extra });
const test = async (name, fn) => { await fn(); console.log(`PASS ${name}`); };
(async () => {
 await test('Querétaro date and time at UTC midnight and year boundary', () => {
   const date = utils.getMexicoDateInfo(new Date('2027-01-01T02:00:00Z'));
   assert.equal(date.todayIso, '2026-12-31'); assert.equal(date.tomorrowIso, '2027-01-01'); assert.equal(date.localTime, '20:00'); assert.match(date.friendlyToday, /2026/);
 });
 await test('Past and impossible dates rejected instead of silently rescheduled', () => {
   assert.equal(utils.isValidBookingDate('2027-02-30'), false);
   assert.throws(() => utils.resolveTargetDates({ fechaInput: '2020-01-01' }));
 });
 await test('Invalid times are rejected', () => {
   for (const value of ['', '25:00', '17:65', 'a cualquier hora', '13pm']) assert.equal(utils.normalizeTimeTo24h(value), '');
   assert.equal(utils.normalizeTimeTo24h('5:30 PM'), '17:30');
 });
 await test('Payment links stay intact', () => {
   const url = 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=123-abc';
   assert.ok(utils.sanitizeBotMessage(`Paga aquí ${url}`).split('\n').includes(url));
 });
 await test('Empty or partial phone never matches a reservation', () => {
   for (const value of ['', '1234']) assert.equal(utils.reservationMatchesPhone(appointment(), value), false);
   assert.equal(utils.reservationMatchesPhone(appointment(), `521${phone}`), true);
 });
 await test('Human takeover does not match personal or personas', () => {
   assert.equal(utils.requestsHuman('cuidado personal para dos personas', 'humano, persona'), false);
   assert.equal(utils.requestsHuman('quiero hablar con recepción', 'recepcion'), true);
 });
 await test('Unknown service cannot silently become a haircut', () => {
   const allServices = [{ id: 'cut', name: 'Corte de cabello', duration: 30, price: 140 }];
   assert.throws(() => utils.resolveServices({ allServices, servicesNames: ['Corte de cabello', 'servicio inexistente'] }));
   assert.equal(utils.resolveServices({ allServices, servicesNames: ['Corte de cabello', 'Corte de cabello'] }).totalDuration, 60);
 });
 await chatContextStorage.run({ conversationId: 'test', clientPhone: phone }, async () => {
   await test('Cannot cancel another customer reservation by ID', async () => {
     records = { other: appointment({ cliente_telefono: '4429999999' }) };
     assert.equal((await tools.cancelarCitaTool({ citaId: 'other' })).exito, false); assert.equal(records.other.estado, 'Reservado');
   });
   await test('Ambiguous reservations require a choice', async () => {
     records = { a: appointment(), b: appointment({ hora_inicio: '17:00' }) };
     assert.equal((await tools.cancelarCitaTool({ telefono: phone })).exito, false); assert.equal(records.a.estado, 'Reservado');
   });
   await test('Cancel uses canonical agenda status', async () => {
     records = { a: appointment() };
     assert.equal((await tools.cancelarCitaTool({ telefono: phone })).exito, true); assert.equal(records.a.estado, 'Cancelado');
   });
   await test('Attendance confirmation does not bypass unpaid deposit', async () => {
     records = { a: appointment({ estado: 'Pendiente de pago', pago_estado: 'pending_payment' }) };
     assert.equal((await tools.confirmarCitaClienteTool({ telefono: phone })).exito, false); assert.equal(records.a.estado, 'Pendiente de pago');
   });
   await test('Reschedule keeps duration and updates end time', async () => {
     records = { a: appointment() }; slots = ['16:00'];
     assert.equal((await tools.reagendarCitaTool({ citaId: 'a', nuevaFecha: tomorrow, nuevaHora: '16:00' })).exito, true);
     assert.equal(records.a.hora_fin, '16:45'); assert.equal(records.a.barbero_id, 'barber-1');
   });
   await test('Unavailable reschedule leaves original appointment intact', async () => {
     records = { a: appointment() }; slots = [];
     assert.equal((await tools.reagendarCitaTool({ citaId: 'a', nuevaFecha: tomorrow, nuevaHora: '16:00' })).exito, false); assert.equal(records.a.hora_inicio, '12:00');
   });
   await test('Transaction catches a slot taken after availability check', async () => {
     records = { a: appointment(), b: appointment({ cliente_telefono: '4429999999', hora_inicio: '16:15', hora_fin: '17:00' }) }; slots = ['16:00'];
     assert.equal((await tools.reagendarCitaTool({ citaId: 'a', nuevaFecha: tomorrow, nuevaHora: '16:00' })).exito, false); assert.equal(records.a.hora_inicio, '12:00');
   });
   bookingCalls = 0;
   await test('Fallback does not guess and falsely announce a new booking', async () => {
     const reply = await executeFallbackLogic({ conversationId: 'test', clientPhone: phone, clientName: 'Juan Pérez', userMessage: 'a las 5:00' });
     assert.match(reply, /todavía no he creado/); assert.equal(bookingCalls, 0);
   });
 });
 await chatContextStorage.run({ conversationId: 'test', clientPhone: phone }, async () => {
   const booking = { fecha: tomorrow, hora: '16:00', profesionalId: 'barber-1', serviciosNombres: ['Corte de cabello', 'Arreglo de ceja'], nombreCliente: 'Juan Pérez', telefonoCliente: phone };
   catalog = { servicios: [{ id: 'cut', name: 'Corte de cabello', duration: 30, price: 140 }, { id: 'brow', name: 'Arreglo de ceja', duration: 5, price: 30 }], profesionales: [{ id: 'barber-1', name: 'Barbero' }] };
   await test('Create checks returned booking failure and does not announce success', async () => {
     const result = await tools.crearCitaTool(booking);
     assert.equal(result.exito, false);
     assert.equal(lastBooking.duration, 30); // Shared booking adds the other 5 minutes itself.
   });
   await test('Repeated services keep full duration without double counting extras', async () => {
     await tools.crearCitaTool({ ...booking, serviciosNombres: ['Corte de cabello', 'Corte de cabello', 'Arreglo de ceja'], duracionMinutos: 65 });
     assert.equal(lastBooking.duration, 30); assert.equal(lastBooking.serviceIds.length, 3);
   });
   await test('Disabled automatic creation does not write a booking', async () => {
     settings = { autoCreateAppointments: false }; const before = bookingCalls;
     assert.equal((await tools.crearCitaTool(booking)).exito, false); assert.equal(bookingCalls, before); settings = {};
   });
   await test('Cancelled appointments cannot be confirmed again', async () => {
     records = { a: appointment({ estado: 'Cancelado' }) };
     assert.equal((await tools.confirmarCitaClienteTool({ telefono: phone, citaId: 'a' })).exito, false); assert.equal(records.a.estado, 'Cancelado');
   });
 });
 await test('Simulator cannot mutate real appointments', async () => {
   await chatContextStorage.run({ conversationId: 'sim-sandbox-test', clientPhone: phone, simulation: true }, async () => {
     records = { a: appointment() };
     assert.equal((await tools.cancelarCitaTool({ citaId: 'a' })).exito, false); assert.equal(records.a.estado, 'Reservado');
     await assert.rejects(() => reservations.validateAgentBooking(tomorrow, '16:00', true), /simulador/);
   });
 });
 console.log('All Sofía regression tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
