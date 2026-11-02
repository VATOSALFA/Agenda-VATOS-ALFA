import { z } from 'zod';
import { AsyncLocalStorage } from 'node:async_hooks';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ai } from '@/ai/genkit';
import { getDb } from '@/lib/firebase-server';
import { sanitizeExternalUntrustedText } from '@/lib/ai/ceo-security';
import { getMexicoDateInfo } from '@/lib/ai/agent-utils';
import { parseClientCustomDuration } from '@/lib/client-notes-helper';
import {
  findBarber,
  matchesBarber,
  getBarberScheduleForDay,
  getDayOfWeekKey,
  timeToMinutes,
  minutesToTime,
  parseTimeToHHmm,
  calculateBarberFreeSlots,
  normalizeName,
  BarberDayScheduleInfo,
} from '@/lib/ai/barber-schedule-helper';

export interface JanetCallerContext {
  operatorName: string;
  operatorRole: string;
  operatorId: string;
  assistantName: string;
}

export const janetCallerStorage = new AsyncLocalStorage<JanetCallerContext>();

export function getCallerInfo(quienSolicita?: string) {
  const store = janetCallerStorage.getStore();
  let rawName = quienSolicita?.trim() || store?.operatorName || 'Alejandro Pacheco';
  rawName = rawName.replace(/\s+/g, ' ').trim();
  const lower = rawName.toLowerCase();
  const operatorName =
    lower.includes('alejandro') || lower.includes('alex') || lower.includes('dueño')
      ? 'Alejandro Pacheco'
      : lower.includes('beatriz') || lower.includes('bety')
      ? 'Beatriz'
      : rawName;

  const assistantName =
    store?.assistantName ||
    (store?.operatorRole === 'Administrador general' || operatorName.includes('Alejandro')
      ? 'Janet CEO'
      : 'Janet Gerencia');
  const creatorDisplay = `${assistantName} (${operatorName})`;
  const auditUserId =
    store?.operatorId ||
    (operatorName.includes('Alejandro')
      ? 'JxK6BLZPOBcBpjnuVZPsgmIHbZ12'
      : 'hNeyJQv56jfJgXnGbzqeDo9L4u73');
  const auditUserRole =
    store?.operatorRole ||
    (operatorName.includes('Alejandro') ? 'Administrador general' : 'Administrador local');

  return {
    operatorName,
    assistantName,
    creatorDisplay,
    auditUserId,
    auditUserRole,
  };
}

function toDateSafe(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val?.toDate === 'function') {
    const d = val.toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d : null;
  }
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  if (typeof val?._seconds === 'number') {
    return new Date(val._seconds * 1000);
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatTimeMx(val: any): string {
  const d = toDateSafe(val);
  if (!d) return 'Sin hora';
  return d.toLocaleTimeString('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ============================================================================
// 1. CONSULTAR OPERACIÓN DEL DÍA (CITAS, VENTAS, HORARIOS Y MOVIMIENTOS)
// ============================================================================
export const consultarOperacionDiaSucursalTool = ai.defineTool(
  {
    name: 'consultar_operacion_dia_sucursal',
    description:
      'Consulta las citas/reservas, las ventas facturadas, los horarios, descansos y bloqueos de los barberos, y los movimientos operativos de una fecha específica (por defecto hoy). Úsala SIEMPRE que pregunten si un barbero está bloqueado, si su horario está cerrado, si tiene citas, o cómo va la operación del día.',
    inputSchema: z.object({
      fecha: z
        .string()
        .optional()
        .describe('Fecha a consultar en formato YYYY-MM-DD. Si se omite, consulta el día de hoy en Querétaro.'),
      filtroClienteOBarbero: z
        .string()
        .optional()
        .describe('Opcional: nombre o apodo del barbero (ej. "Lalo", "Bety", "Lupita", "Alfredo") o nombre del cliente.'),
    }),
  },
  async ({ fecha, filtroClienteOBarbero }) => {
    const db = getDb();
    const { todayIso } = getMexicoDateInfo();
    const targetDate = (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha.trim())) ? fecha.trim() : todayIso;
    const filterNorm = (filtroClienteOBarbero || '').toLowerCase().trim();

    const startDay = new Date(`${targetDate}T00:00:00.000-06:00`);
    const endDay = new Date(`${targetDate}T23:59:59.999-06:00`);

    const [profSnap, resSnap, blocksSnap, salesSnap, journeySnap, localesSnap] = await Promise.all([
      db.collection('profesionales').get(),
      db.collection('reservas').where('fecha', '==', targetDate).get(),
      db.collection('bloqueos_horario').where('fecha', '==', targetDate).get(),
      db
        .collection('ventas')
        .where('fecha_hora_venta', '>=', Timestamp.fromDate(startDay))
        .where('fecha_hora_venta', '<=', Timestamp.fromDate(endDay))
        .get(),
      db.collection('jornadas_especiales').where('fecha', '==', targetDate).get(),
      db.collection('locales').limit(5).get(),
    ]);

    const activeProfessionals: any[] = [];
    const profMap = new Map<string, { id: string; nombre: string; publicName: string; localId: string; raw: any }>();

    profSnap.forEach((d) => {
      const p = d.data();
      if (!p.deleted) {
        const item = {
          id: d.id,
          name: p.name || '',
          publicName: p.publicName || p.name || 'Barbero',
          displayName: p.publicName || p.name || 'Barbero',
          localId: p.local_id || '',
          raw: { id: d.id, ...p },
        };
        profMap.set(d.id, {
          id: d.id,
          nombre: item.displayName,
          publicName: item.publicName,
          localId: item.localId,
          raw: item.raw,
        });
        if (p.active !== false) {
          activeProfessionals.push(item.raw);
        }
      }
    });

    // Check if query targets a specific barber
    const targetedBarber = filterNorm ? findBarber(filterNorm, activeProfessionals) : null;

    // Build comprehensive schedule status for barbers
    const barbersToAnalyze = targetedBarber
      ? [targetedBarber]
      : activeProfessionals.filter((p) => !filterNorm || matchesBarber(p, filterNorm));

    const defaultLocalId = activeProfessionals[0]?.local_id || localesSnap.docs[0]?.id || '';

    const horariosYDisponibilidadBarberos: any[] = [];
    for (const b of barbersToAnalyze) {
      const s = await getBarberScheduleForDay({
        db,
        barber: b,
        dateStr: targetDate,
        localId: b.local_id || defaultLocalId,
      });

      horariosYDisponibilidadBarberos.push({
        barbero: s.displayName,
        barberoId: s.barberId,
        nombreReal: s.name,
        diaSemana: s.diaSemana,
        laboraHoy: s.isWorkingDay,
        jornadaLaboral: s.workingHours ? `${s.workingHours.start} - ${s.workingHours.end}` : 'Día libre (no labora)',
        horariosNoDisponibles: [
          s.nonWorkBefore ? `Antes de ${s.nonWorkBefore.end}` : null,
          s.nonWorkAfter ? `Después de ${s.nonWorkAfter.start}` : null,
        ].filter(Boolean),
        descansosProgramados: s.scheduleBreaks.map((br) => `${br.start} - ${br.end}`),
        bloqueosRegistradosEnAgenda: s.existingBlocks.map((blk) => ({
          id: blk.id,
          horario: `${blk.hora_inicio} - ${blk.hora_fin}`,
          motivo: blk.motivo,
        })),
        horariosEspecialesHabilitados: s.specialAvailableHours.map((sp) => `${sp.hora_inicio} - ${sp.hora_fin}`),
        citasActivasDelBarbero: s.activeReservations.map((r) => ({
          reservaId: r.id,
          cliente: r.cliente,
          horario: `${r.hora_inicio} - ${r.hora_fin}`,
          servicio: r.servicio,
          estado: r.estado,
        })),
        estaTotalmenteBloqueadoOCerrado: s.isEntireDayCovered,
        resumenEstadoAgenda: s.statusDescription,
      });
    }

    const reservasDelDia: any[] = [];
    resSnap.forEach((doc) => {
      const r = doc.data();
      const profInfo = profMap.get(r.barbero_id);
      const barberoNombre = profInfo?.nombre || r.professionalNames || 'Barbero';
      const clienteNombre = sanitizeExternalUntrustedText(
        r.customer?.nombre || r.cliente_nombre || 'Cliente',
        70
      );

      const matchesFilter =
        !filterNorm ||
        clienteNombre.toLowerCase().includes(filterNorm) ||
        barberoNombre.toLowerCase().includes(filterNorm) ||
        (profInfo?.raw && matchesBarber(profInfo.raw, filterNorm));

      if (!matchesFilter) return;

      reservasDelDia.push({
        reservaId: doc.id,
        cliente: clienteNombre,
        telefono: r.customer?.telefono || '',
        barbero: barberoNombre,
        barberoId: r.barbero_id,
        horario: `${r.hora_inicio || ''} - ${r.hora_fin || ''}`,
        servicio: r.servicio || (Array.isArray(r.items) ? r.items.map((i: any) => i.nombre).join(', ') : 'Servicio'),
        estado: r.estado || 'Reservado',
        pagoEstado: r.pago_estado || 'pendiente',
        anticipoPagado: round2(Number(r.anticipo_pagado || r.monto_anticipo || 0)),
        saldoPendiente: round2(Number(r.saldo_pendiente ?? r.total ?? 0)),
        total: round2(Number(r.total || r.precio || 0)),
      });
    });

    reservasDelDia.sort((a, b) => a.horario.localeCompare(b.horario));

    const bloqueosYExcepciones: any[] = [];

    // Jornadas especiales (públicas en web y app)
    journeySnap.forEach((doc) => {
      const j = doc.data();
      const profInfo = profMap.get(j.profesionalId);
      const barberoNombre = profInfo?.nombre || j.profesionalName || 'Barbero';

      const matchesFilter =
        !filterNorm ||
        barberoNombre.toLowerCase().includes(filterNorm) ||
        (profInfo?.raw && matchesBarber(profInfo.raw, filterNorm));

      if (!matchesFilter) return;

      bloqueosYExcepciones.push({
        bloqueoId: doc.id,
        barbero: barberoNombre,
        barberoId: j.profesionalId,
        horario: `${j.hora_inicio} - ${j.hora_fin}`,
        tipo: 'Jornada Especial (PÚBLICA en Web y App Móvil)',
        motivo: sanitizeExternalUntrustedText(j.motivo || 'Jornada especial habilitada para reservas en línea y agenda', 80),
      });
    });

    // Bloqueos y horarios especiales internos
    blocksSnap.forEach((doc) => {
      const b = doc.data();
      const profInfo = profMap.get(b.barbero_id);
      const barberoNombre = profInfo?.nombre || 'Barbero';

      const matchesFilter =
        !filterNorm ||
        barberoNombre.toLowerCase().includes(filterNorm) ||
        (profInfo?.raw && matchesBarber(profInfo.raw, filterNorm));

      if (!matchesFilter) return;

      bloqueosYExcepciones.push({
        bloqueoId: doc.id,
        barbero: barberoNombre,
        barberoId: b.barbero_id,
        horario: `${b.hora_inicio} - ${b.hora_fin}`,
        tipo: b.type === 'available' ? 'Horario Especial Interno (Agenda Recepción, NO visible en Web/App)' : 'Horario Bloqueado',
        motivo: sanitizeExternalUntrustedText(b.motivo || 'Sin motivo', 80),
      });
    });

    const ventasDelDia: any[] = [];
    let totalEfectivoDia = 0;
    let totalTarjetaDia = 0;
    let totalTransferenciaDia = 0;

    salesSnap.forEach((doc) => {
      const v = doc.data();
      if (v.estado_venta === 'cancelada') return;
      const clienteNombre = sanitizeExternalUntrustedText(
        v.cliente_nombre || v.client?.nombre || 'Cliente',
        70
      );
      const items = Array.isArray(v.items) ? v.items : [];
      const primaryBarberId = items[0]?.barbero_id || v.barbero_id;
      const profInfo = profMap.get(primaryBarberId);
      const barberoPrincipal = profInfo?.nombre || v.professionalNames || 'General';

      const matchesFilter =
        !filterNorm ||
        clienteNombre.toLowerCase().includes(filterNorm) ||
        barberoPrincipal.toLowerCase().includes(filterNorm) ||
        (profInfo?.raw && matchesBarber(profInfo.raw, filterNorm));

      if (!matchesFilter) return;

      const monto = round2(Number(v.monto_pagado_real ?? v.total ?? 0));
      const metodo = String(v.metodo_pago || 'efectivo').toLowerCase();
      if (metodo.includes('efectivo')) totalEfectivoDia += monto;
      else if (metodo.includes('tarjeta') || metodo.includes('terminal') || metodo.includes('mercado'))
        totalTarjetaDia += monto;
      else if (metodo.includes('transferencia')) totalTransferenciaDia += monto;

      ventasDelDia.push({
        ventaId: doc.id,
        hora: formatTimeMx(v.fecha_hora_venta),
        cliente: clienteNombre,
        profesional: barberoPrincipal,
        concepto: items.map((i: any) => i.nombre || 'Item').join(', ') || v.tipo_venta || 'Venta',
        metodoPago: v.metodo_pago || 'efectivo',
        totalCobrado: monto,
        reservaAsociadaId: v.reservationId || null,
      });
    });

    return {
      fechaConsultada: targetDate,
      resumenCitas: {
        totalCitas: reservasDelDia.length,
        activasOPendientes: reservasDelDia.filter(
          (r) => r.estado !== 'Cancelado' && r.estado !== 'No asiste' && r.estado !== 'Pagado'
        ).length,
        pagadas: reservasDelDia.filter((r) => r.estado === 'Pagado').length,
        canceladas: reservasDelDia.filter((r) => r.estado === 'Cancelado').length,
      },
      resumenCajaSucursal: {
        numeroTransacciones: ventasDelDia.length,
        cobradoEfectivo: round2(totalEfectivoDia),
        cobradoTarjetaYTerminal: round2(totalTarjetaDia),
        cobradoTransferencia: round2(totalTransferenciaDia),
        totalCobradoDia: round2(totalEfectivoDia + totalTarjetaDia + totalTransferenciaDia),
      },
      horariosYDisponibilidadBarberos,
      bloqueosYHorariosEspeciales: bloqueosYExcepciones,
      citas: reservasDelDia.slice(0, 40),
      ventasFacturadas: ventasDelDia.slice(0, 40),
    };
  }
);

// ============================================================================
// HELPERS PARA AGENDAR Y CLIENTES EN GERENCIA
// ============================================================================
async function resolveServiceForGerencia(
  db: any,
  query?: string,
  barberId?: string,
  clientNotes?: string,
  barberName?: string
): Promise<{
  id: string;
  name: string;
  price: number;
  duration: number;
  serviceIds: string[];
  items: Array<{
    id: string;
    nombre: string;
    servicio: string;
    tipo: string;
    barbero_id: string;
    precio: number;
    duracion: number;
    cantidad: number;
    professional_lock: boolean;
  }>;
  rawService?: any;
}> {
  const servSnap = await db.collection('servicios').where('active', '==', true).get();
  const allServices: any[] = [];
  servSnap.forEach((d: any) => allServices.push({ id: d.id, ...d.data() }));

  const q = normalizeName(query || 'corte');

  // 1. Coincidencia exacta de nombre
  let matched = allServices.find((s) => normalizeName(s.name) === q);

  // 2. Coincidencia por palabras clave
  if (!matched) {
    if (q.includes('corte') && (q.includes('barba') || q.includes('combo') || q.includes('completo'))) {
      matched =
        allServices.find((s) => s.name?.includes('Caballero alfa') || s.name?.includes('1 El Caballero alfa')) ||
        allServices.find((s) => s.name === 'Corte de cabello');
    } else if (q.includes('barba') || q.includes('afeitado')) {
      matched =
        allServices.find((s) => s.name?.includes('Arreglo de barba expres')) ||
        allServices.find((s) => s.name?.toLowerCase().includes('barba'));
    } else if (q.includes('corte')) {
      matched =
        allServices.find((s) => s.name === 'Corte de cabello') ||
        allServices.find((s) => s.name?.toLowerCase().includes('corte'));
    } else if (q.includes('greca')) {
      matched = allServices.find((s) => s.name?.toLowerCase().includes('greca'));
    } else if (q.includes('ceja')) {
      matched = allServices.find((s) => s.name?.toLowerCase().includes('ceja'));
    } else if (q.includes('facial')) {
      matched = allServices.find((s) => s.name?.toLowerCase().includes('facial'));
    } else if (q.includes('decolor')) {
      matched = allServices.find((s) => s.name?.toLowerCase().includes('decolor'));
    } else if (q.includes('rizado')) {
      matched = allServices.find((s) => s.name?.toLowerCase().includes('rizado'));
    }
  }

  if (!matched) {
    matched = allServices.find((s) => s.name === 'Corte de cabello') || allServices[0];
  }

  const baseDuration = Number(matched?.duration ?? 40);
  let finalDuration = baseDuration;

  // 1. Ajuste prioritario por barbero según durationPorProfesional configurado en el servicio
  if (
    barberId &&
    matched?.durationPorProfesional &&
    typeof matched.durationPorProfesional === 'object' &&
    matched.durationPorProfesional[barberId] !== undefined &&
    matched.durationPorProfesional[barberId] !== null &&
    matched.durationPorProfesional[barberId] !== ''
  ) {
    const custom = Number(matched.durationPorProfesional[barberId]);
    if (!isNaN(custom) && custom > 0) {
      finalDuration = custom;
    }
  }

  // 2. Ajuste complementario por expediente / notas del cliente si especifica duración especial (ej. "Cliente de 45 min", "Lupita realiza en 45 min")
  if (clientNotes) {
    const clientCustomDur = parseClientCustomDuration(clientNotes, barberName);
    if (clientCustomDur && clientCustomDur > 0) {
      finalDuration = clientCustomDur;
    }
  }

  const sId = matched?.id || 's56EgUXPyLpZbjCf2Ung';
  const sName = matched?.name || 'Corte de cabello';
  const sPrice = Number(matched?.price ?? 140);

  return {
    id: sId,
    name: sName,
    price: sPrice,
    duration: finalDuration,
    serviceIds: [sId],
    items: [
      {
        id: sId,
        nombre: sName,
        servicio: sName,
        tipo: 'servicio',
        barbero_id: barberId || '',
        precio: sPrice,
        duracion: finalDuration,
        cantidad: 1,
        professional_lock: true,
      },
    ],
    rawService: matched,
  };
}

async function resolveOrCreateClientForGerencia(
  db: any,
  nombreCliente?: string,
  telefonoCliente?: string,
  numeroCliente?: string
): Promise<{
  id: string;
  nombre: string;
  telefono: string;
  correo: string;
  numeroCliente?: string;
  notas?: string;
  fueEncontrado: boolean;
}> {
  const cleanPhone = (telefonoCliente || '').replace(/\D/g, '');
  const rawQuery = (nombreCliente || '').trim();
  const qNumClean = (numeroCliente || rawQuery).replace(/^cliente\s*#?|^#/, '').trim();

  let resolvedId = '';
  let resolvedName = rawQuery;
  let resolvedPhone = cleanPhone;
  let resolvedEmail = '';
  let resolvedNum = '';
  let resolvedNotas = '';
  let fueEncontrado = false;

  // 1. Buscar directamente por teléfono si tiene al menos 7 dígitos (probando variantes 10 dígitos, con 52, con +52)
  if (cleanPhone && cleanPhone.length >= 7) {
    const last10 = cleanPhone.slice(-10);
    const variants = [cleanPhone, last10, `52${last10}`, `+52${last10}`, `521${last10}`];
    for (const v of variants) {
      const pSnap = await db.collection('clientes').where('telefono', '==', v).limit(1).get();
      if (!pSnap.empty) {
        const cd = pSnap.docs[0].data();
        resolvedId = pSnap.docs[0].id;
        resolvedName = `${cd.nombre || ''} ${cd.apellido || ''}`.trim() || resolvedName;
        resolvedPhone = cd.telefono || cleanPhone;
        resolvedEmail = cd.correo || cd.email || '';
        resolvedNum = String(cd.numero_cliente ?? cd.numeroCliente ?? '');
        resolvedNotas = cd.notas || cd.nota || '';
        fueEncontrado = true;
        break;
      }
    }
  }

  // 2. Si no se encontró y hay número de cliente (ej. 311)
  if (!resolvedId && qNumClean && /^\d+$/.test(qNumClean)) {
    const numSnap = await db.collection('clientes').where('numero_cliente', '==', qNumClean).limit(1).get();
    if (!numSnap.empty) {
      const cd = numSnap.docs[0].data();
      resolvedId = numSnap.docs[0].id;
      resolvedName = `${cd.nombre || ''} ${cd.apellido || ''}`.trim() || resolvedName;
      resolvedPhone = cd.telefono || resolvedPhone || '';
      resolvedEmail = cd.correo || cd.email || '';
      resolvedNum = String(cd.numero_cliente ?? cd.numeroCliente ?? '');
      resolvedNotas = cd.notas || cd.nota || '';
      fueEncontrado = true;
    }
  }

  // 3. Si no se encontró por índice directo, escanear la base de clientes (búsqueda inteligente)
  if (!resolvedId && (cleanPhone.length >= 7 || rawQuery || qNumClean)) {
    const qNorm = normalizeName(rawQuery);
    const snap = await db.collection('clientes').get();
    let bestDoc: any = null;
    let highestScore = 0;

    snap.forEach((d: any) => {
      const cd = d.data();
      if (cd.activo === false) return;

      const cFullName = `${cd.nombre || ''} ${cd.apellido || ''}`.trim();
      const cFullNameNorm = normalizeName(cFullName);
      const cDigits = String(cd.telefono || '').replace(/\D/g, '');
      const cNum = String(cd.numero_cliente ?? cd.numeroCliente ?? '').trim();

      let score = 0;

      // Coincidencia por teléfono
      if (cleanPhone.length >= 7 && cDigits.length >= 7) {
        if (cDigits === cleanPhone || cDigits.slice(-10) === cleanPhone.slice(-10)) score += 100;
        else if (cDigits.endsWith(cleanPhone) || cleanPhone.endsWith(cDigits)) score += 90;
        else if (cDigits.includes(cleanPhone) || cleanPhone.includes(cDigits)) score += 70;
      }

      // Coincidencia por número de cliente
      if (qNumClean && cNum === qNumClean) {
        score += 95;
      }

      // Coincidencia por nombre completo o tokens
      if (qNorm && cFullNameNorm) {
        if (cFullNameNorm === qNorm) score += 100;
        else if (cFullNameNorm.includes(qNorm)) score += 80;
        else {
          const tokens = qNorm.split(/\s+/).filter((t: string) => t.length > 1);
          if (tokens.length > 0 && tokens.every((t: string) => cFullNameNorm.includes(t))) {
            score += 75;
          }
        }
      }

      if (score > highestScore && score >= 70) {
        highestScore = score;
        bestDoc = { id: d.id, ...cd, fullName: cFullName };
      }
    });

    if (bestDoc) {
      resolvedId = bestDoc.id;
      resolvedName = bestDoc.fullName || resolvedName;
      resolvedPhone = bestDoc.telefono || resolvedPhone || '';
      resolvedEmail = bestDoc.correo || bestDoc.email || '';
      resolvedNum = String(bestDoc.numero_cliente ?? bestDoc.numeroCliente ?? '');
      resolvedNotas = bestDoc.notas || bestDoc.nota || '';
      fueEncontrado = true;
    }
  }

  // 4. Si después de buscar no existe ningún registro previo, crear nuevo cliente
  if (!resolvedId) {
    let firstName = 'Cliente';
    let lastName = '';
    if (resolvedName) {
      const parts = resolvedName.split(/\s+/);
      firstName = parts[0] || 'Cliente';
      lastName = parts.slice(1).join(' ') || '';
    } else if (cleanPhone) {
      firstName = 'Cliente';
      lastName = `Tel ${cleanPhone.slice(-4)}`;
    }

    const newDoc = await db.collection('clientes').add({
      nombre: firstName,
      apellido: lastName,
      telefono: resolvedPhone || '',
      correo: resolvedEmail || '',
      origen: 'agenda_janet',
      creado_en: Timestamp.now(),
      activo: true,
      numero_cliente: String(Date.now()).slice(-4),
    });
    resolvedId = newDoc.id;
    resolvedName = `${firstName} ${lastName}`.trim();
    resolvedNum = String(Date.now()).slice(-4);
    fueEncontrado = false;
  }

  return {
    id: resolvedId,
    nombre: resolvedName,
    telefono: resolvedPhone,
    correo: resolvedEmail,
    numeroCliente: resolvedNum,
    notas: resolvedNotas,
    fueEncontrado,
  };
}

// ============================================================================
// 2. BUSCAR CLIENTES EN LA BASE DE DATOS (POR CELULAR, NOMBRE, # CLIENTE, EMAIL)
// ============================================================================
export const buscarClienteSucursalTool = ai.defineTool(
  {
    name: 'buscar_cliente_sucursal',
    description:
      'Busca clientes en la base de datos oficial de VATOS ALFA por cualquier criterio: número de celular o teléfono (10 dígitos o parcial), nombre o apellido (búsqueda difusa/aproximada sin acentos), número de cliente (ej. 311, #45), correo electrónico o ID. Devuelve el perfil completo del cliente (nombre, teléfono, correo, número de cliente, nivel Pase Alfa Club, AlfaCoins, cortes acumulados, citas asistidas y notas) para agendar citas, verificar información o resolver dudas de la administración.',
    inputSchema: z.object({
      termino: z
        .string()
        .describe(
          'Término de búsqueda: puede ser número de teléfono/celular (ej. "4428259334"), nombre o apellido del cliente (ej. "Rigoberto", "Leon", "Carlos"), número de cliente (ej. "311", "#45"), o correo electrónico.'
        ),
      limite: z
        .number()
        .optional()
        .describe('Cantidad máxima de resultados a devolver (por defecto 10).'),
    }),
  },
  async ({ termino, limite = 10 }) => {
    const db = getDb();
    const query = termino.trim();
    if (!query) {
      return {
        encontrados: 0,
        mensaje: 'Por favor proporciona un nombre, número de celular o número de cliente para buscar.',
        clientes: [],
      };
    }

    const qNorm = normalizeName(query);
    const qDigits = query.replace(/\D/g, '');
    const qNumClean = qNorm.replace(/^cliente\s*#?|^#/, '').trim();

    const snap = await db.collection('clientes').get();
    const results: any[] = [];

    snap.forEach((d) => {
      const c = d.data();
      if (c.activo === false) return;

      const fullName = `${c.nombre || ''} ${c.apellido || ''}`.trim();
      const fullNameNorm = normalizeName(fullName);
      const clientDigits = String(c.telefono || '').replace(/\D/g, '');
      const clientNum = String(c.numero_cliente ?? c.numeroCliente ?? '').trim();
      const emailNorm = normalizeName(c.correo || c.email || '');

      let match = false;
      let score = 0;

      // 1. Coincidencia por teléfono / celular
      if (qDigits.length >= 4 && clientDigits.length >= 4) {
        if (clientDigits === qDigits || (qDigits.length >= 10 && clientDigits.slice(-10) === qDigits.slice(-10))) {
          match = true;
          score += 100;
        } else if (clientDigits.endsWith(qDigits) || qDigits.endsWith(clientDigits)) {
          match = true;
          score += 90;
        } else if (clientDigits.includes(qDigits) || qDigits.includes(clientDigits)) {
          match = true;
          score += 70;
        }
      }

      // 2. Coincidencia por número de cliente
      if (clientNum) {
        if (clientNum === qNumClean || (qDigits && clientNum === qDigits)) {
          match = true;
          score += 95;
        }
      }

      // 3. Coincidencia por correo
      if (emailNorm && (emailNorm === qNorm || emailNorm.includes(qNorm))) {
        match = true;
        score += 85;
      }

      // 4. Coincidencia por nombre completo o palabras individuales
      if (fullNameNorm) {
        if (fullNameNorm === qNorm) {
          match = true;
          score += 100;
        } else if (fullNameNorm.includes(qNorm)) {
          match = true;
          score += 80;
        } else {
          const tokens = qNorm.split(/\s+/).filter((t) => t.length > 1);
          if (tokens.length > 0 && tokens.every((t) => fullNameNorm.includes(t))) {
            match = true;
            score += 75;
          }
        }
      }

      // 5. Coincidencia por ID de documento
      if (d.id === query) {
        match = true;
        score += 100;
      }

      if (match) {
        const stamps = Number(c.cortes_acumulados ?? c.cortesAcumulados ?? 0);
        const nivel =
          c.nivel ||
          (stamps >= 8 ? 'Alfa Black VIP' : stamps >= 4 ? 'Alfa Gold' : 'Alfa Member');
        results.push({
          id: d.id,
          nombre: c.nombre || '',
          apellido: c.apellido || '',
          nombreCompleto: fullName || 'Cliente',
          telefono: c.telefono || 'Sin registrar',
          correo: c.correo || c.email || 'Sin registrar',
          numeroCliente: clientNum || 'N/A',
          nivel,
          alfaCoins: Number(c.alfaCoins ?? c.alfa_coins ?? 0),
          cortesAcumulados: stamps,
          citasAsistidas: Number(c.citas_asistidas ?? stamps),
          notas: c.notas || '',
          score,
        });
      }
    });

    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, Math.min(limite, 20));

    if (topResults.length === 0) {
      return {
        encontrados: 0,
        mensaje: `No se encontró ningún cliente registrado con el término "${query}".`,
        clientes: [],
      };
    }

    return {
      encontrados: topResults.length,
      mensaje:
        topResults.length === 1
          ? `Se encontró al cliente: **${topResults[0].nombreCompleto}** (Cliente #${topResults[0].numeroCliente}, Celular: ${topResults[0].telefono}). Nivel: ${topResults[0].nivel}, Cortes: ${topResults[0].cortesAcumulados}.`
          : `Se encontraron ${topResults.length} clientes coincidentes. El más relevante es **${topResults[0].nombreCompleto}** (Cliente #${topResults[0].numeroCliente}, Celular: ${topResults[0].telefono}).`,
      clientes: topResults,
    };
  }
);

// ============================================================================
// 3. AGENDAR CITA EN LA AGENDA (FACULTAD COMPLETA DE ADMINISTRADORA LOCAL)
// ============================================================================
export const agendarCitaSucursalTool = ai.defineTool(
  {
    name: 'agendar_cita_sucursal',
    description:
      'Agenda o crea una cita directamente en la cuadrícula de la agenda de VATOS ALFA a solicitud de la Administración (Beatriz o Administrador General). Valida la disponibilidad del barbero, asocia o busca automáticamente al cliente por nombre, celular o número de cliente, asocia el servicio y registra la reserva en tiempo real.',
    inputSchema: z.object({
      nombreCliente: z
        .string()
        .optional()
        .describe(
          'Nombre del cliente si se conoce. Si se omite, el sistema lo buscará automáticamente por telefonoCliente o numeroCliente en la base de datos.'
        ),
      telefonoCliente: z
        .string()
        .optional()
        .describe(
          'Teléfono o celular de contacto del cliente a 10 dígitos (ej. "4428259334"). Si se proporciona sin nombre, el sistema busca automáticamente al cliente en la base de datos.'
        ),
      numeroCliente: z
        .string()
        .optional()
        .describe('Número de cliente en la base de datos (ej. "311").'),
      quienSolicita: z
        .string()
        .optional()
        .describe(
          'Nombre de quien solicita agendar la cita (ej. "Alejandro Pacheco", "Beatriz"). Si se omite, se usa el operador autenticado en la sesión.'
        ),
      barberoNombre: z
        .string()
        .describe('Nombre o apodo del barbero (ej. "Lalo", "Eduardo", "Alfredo", "Fredy", "Ivon", "Lupita", "Beatriz").'),
      fecha: z
        .string()
        .optional()
        .describe('Fecha de la cita en formato YYYY-MM-DD. Si se omite, se usa el día de hoy en Querétaro.'),
      hora: z
        .string()
        .describe('Hora de inicio de la cita (ej. "13:00", "1:00 PM", "16:00", "4:00 PM", "11:30").'),
      servicioNombre: z
        .string()
        .optional()
        .describe('Nombre del servicio (ej. "Corte de cabello", "Arreglo de barba", "Corte y barba", "1 El Caballero alfa", etc.). Por defecto "Corte de cabello" ($140.00 MXN, 40 min).'),
      notas: z
        .string()
        .optional()
        .describe('Notas adicionales de la cita (ej. "Puntual", "Cliente de Bety", etc.).'),
      forzarSobrecupo: z
        .boolean()
        .optional()
        .describe('Si es true, permite agendar sobrecupo o fuera de turno si la administración lo autoriza explícitamente.'),
    }),
  },
  async ({
    nombreCliente,
    telefonoCliente,
    numeroCliente,
    quienSolicita,
    barberoNombre,
    fecha,
    hora,
    servicioNombre,
    notas,
    forzarSobrecupo,
  }) => {
    const caller = getCallerInfo(quienSolicita);
    const db = getDb();
    const { todayIso } = getMexicoDateInfo();
    const targetDate = (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha.trim())) ? fecha.trim() : todayIso;

    const parsedHour = parseTimeToHHmm(hora);
    if (!parsedHour) {
      return {
        ok: false,
        mensaje: `La hora "${hora}" no tiene un formato reconocido. Por favor indícame la hora como "16:00" o "4:00 PM".`,
      };
    }
    const horaInicio = parsedHour;

    // 1. Resolver barbero
    const profSnap = await db.collection('profesionales').get();
    const activeProfessionals: any[] = [];
    profSnap.forEach((doc) => {
      const p = doc.data();
      if (!p.deleted && p.active !== false) {
        activeProfessionals.push({ id: doc.id, ...p });
      }
    });

    const prof = findBarber(barberoNombre, activeProfessionals);
    if (!prof) {
      return {
        ok: false,
        mensaje: `No encontré un barbero activo que coincida con "${barberoNombre}". Los barberos de la sucursal son: ${activeProfessionals.map((p) => p.publicName || p.name).join(', ')}.`,
      };
    }
    const barberDisplayName = prof.publicName || prof.name || 'Barbero';
    const defaultLocalId = prof.local_id || prof.localId || 'rkbEgvwP67JliXQ1Qeyj';

    // 2. Resolver o registrar cliente
    const client = await resolveOrCreateClientForGerencia(
      db,
      nombreCliente,
      telefonoCliente,
      numeroCliente
    );

    // 3. Resolver servicio y duración considerando la duración personalizada por barbero (durationPorProfesional) y notas de cliente
    const service = await resolveServiceForGerencia(
      db,
      servicioNombre,
      prof.id,
      client?.notas,
      barberDisplayName
    );
    const startMins = timeToMinutes(horaInicio);
    const endMins = startMins + service.duration;
    const horaFin = minutesToTime(endMins);

    // 4. Validar disponibilidad del barbero en la agenda
    const barberSchedule = await getBarberScheduleForDay({
      db,
      barber: prof,
      dateStr: targetDate,
      localId: defaultLocalId,
    });

    if (!forzarSobrecupo) {
      // Validar si labora ese día
      if (!barberSchedule.isWorkingDay) {
        return {
          ok: false,
          diaNoLaboral: true,
          mensaje: `**${barberDisplayName}** no labora los ${barberSchedule.diaSemana}s (figura como "Día libre" en la agenda). ¿Deseas agendarlo con otro barbero disponible hoy o que le habilite un horario especial?`,
        };
      }

      // Validar si la hora cae dentro de su turno habitual o horario especial
      const shiftStartM = timeToMinutes(barberSchedule.workingHours?.start || '10:00');
      const shiftEndM = timeToMinutes(barberSchedule.workingHours?.end || '21:00');

      const hasSpecialOpening = barberSchedule.specialAvailableHours.some(
        (sp) => timeToMinutes(sp.hora_inicio) <= startMins && timeToMinutes(sp.hora_fin) >= endMins
      );

      if (!hasSpecialOpening && (startMins < shiftStartM || endMins > shiftEndM)) {
        return {
          ok: false,
          fueraDeTurno: true,
          mensaje: `El horario solicitado (${horaInicio} a ${horaFin}) queda fuera del turno laboral de **${barberDisplayName}** (su horario hoy es de ${barberSchedule.workingHours?.start} a ${barberSchedule.workingHours?.end}). Si deseas agendarlo fuera de turno, pídemelo explícitamente indicando forzar cita o habilitar horario especial.`,
        };
      }

      // Validar conflicto con descansos o bloqueos registrados
      const bloqConflict = barberSchedule.existingBlocks.find(
        (blk) => blk.type !== 'available' && horaInicio < blk.hora_fin && horaFin > blk.hora_inicio
      );
      if (bloqConflict) {
        return {
          ok: false,
          conflictoBloqueo: true,
          mensaje: `No se puede agendar a las ${horaInicio} porque **${barberDisplayName}** tiene un bloqueo registrado en la agenda de **${bloqConflict.hora_inicio} a ${bloqConflict.hora_fin}** (motivo: "${bloqConflict.motivo}").`,
        };
      }

      // Validar conflicto con citas activas
      const resConflict = barberSchedule.activeReservations.find(
        (r) => horaInicio < r.hora_fin && horaFin > r.hora_inicio
      );
      if (resConflict) {
        return {
          ok: false,
          conflictoCita: true,
          mensaje: `A esa hora (${horaInicio} a ${horaFin}) **${barberDisplayName}** ya tiene una cita agendada con **${resConflict.cliente}** de **${resConflict.hora_inicio} a ${resConflict.hora_fin}** (${resConflict.servicio}). ¿Deseas buscar el horario libre más cercano o agendar con otro barbero?`,
        };
      }
    }

    // 5. Crear la reserva en la base de datos oficial
    const newResRef = await db.collection('reservas').add({
      cliente_id: client.id,
      cliente_nombre: client.nombre,
      cliente_telefono: client.telefono,
      cliente_email: client.correo,
      customer: {
        id: client.id,
        nombre: client.nombre,
        telefono: client.telefono,
        correo: client.correo,
      },
      barbero_id: prof.id,
      professionalNames: barberDisplayName,
      fecha: targetDate,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      duracion: service.duration,
      servicio: service.name,
      servicios: service.serviceIds,
      items: service.items.map((it) => ({
        ...it,
        barbero_id: prof.id,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
      })),
      precio: service.price,
      total: service.price,
      saldo_pendiente: service.price,
      monto_pagado: 0,
      monto_pagado_real: 0,
      anticipo_pagado: 0,
      anticipoPagado: 0,
      anticipo_esperado: 0,
      requiere_anticipo: false,
      estado: 'Reservado',
      pago_estado: 'Pendiente',
      local_id: defaultLocalId,
      canal_reserva: 'janet',
      origen: 'janet_gerencia',
      creada_por: caller.creatorDisplay,
      creado_en: Timestamp.now(),
      notas: notas || '',
      nota_interna: `Agendada por ${caller.assistantName} a petición de ${caller.operatorName}`,
      professional_lock: true,
      isSandbox: false,
      whatsappConfirmationSent: false,
      whatsappReminderNotNeeded: false,
      whatsappReminderSent: false,
      notifications: {
        whatsapp_notification: true,
        whatsapp_reminder: true,
        email_notification: Boolean(client.correo),
      },
    });

    // 6. Auditoría institucional
    await db.collection('audit_logs').add({
      action: `Crear Cita (${caller.assistantName})`,
      details: `Cita agendada para ${client.nombre} con ${barberDisplayName} el ${targetDate} de ${horaInicio} a ${horaFin} (${service.name} - $${service.price.toFixed(2)})`,
      userId: caller.auditUserId,
      userName: `${caller.creatorDisplay} (${caller.auditUserRole})`,
      userRole: caller.auditUserRole,
      severity: 'info',
      entityId: newResRef.id,
      localId: defaultLocalId,
      timestamp: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      reservaId: newResRef.id,
      cliente: client.nombre,
      telefono: client.telefono,
      numeroCliente: client.numeroCliente,
      clienteIdentificadoPreviamente: client.fueEncontrado,
      barbero: barberDisplayName,
      fecha: targetDate,
      horario: `${horaInicio} a ${horaFin}`,
      duracionMinutos: service.duration,
      servicio: service.name,
      precio: service.price,
      mensaje: `¡Listo! La cita quedó agendada con éxito en la agenda:\n\n• **Cliente:** ${client.nombre}${client.numeroCliente ? ` (Cliente #${client.numeroCliente})` : ''}${client.telefono ? ` - Celular: ${client.telefono}` : ''}\n• **Barbero:** ${barberDisplayName}\n• **Fecha:** ${targetDate}\n• **Horario:** ${horaInicio} a ${horaFin} (${service.duration} min)\n• **Servicio:** ${service.name}\n• **Total a liquidar en caja:** $${service.price.toFixed(2)} MXN\n\nYa aparece visible en la cuadrícula de la agenda para todo el equipo.`,
    };
  }
);

// ============================================================================
// 3. REAGENDAR O MOVER CITA EN LA AGENDA
// ============================================================================
export const reagendarCitaSucursalTool = ai.defineTool(
  {
    name: 'reagendar_cita_sucursal',
    description:
      'Permite a Beatriz (Administradora Local) mover o cambiar la fecha, hora o barbero de una cita existente en la agenda cuando un cliente o recepción lo solicita.',
    inputSchema: z.object({
      nombreClienteOId: z
        .string()
        .describe('Nombre del cliente o ID exacto de la cita a reagendar.'),
      fechaActual: z
        .string()
        .optional()
        .describe('Fecha actual de la cita (por defecto hoy en Querétaro).'),
      nuevaFecha: z
        .string()
        .describe('Nueva fecha para la cita en formato YYYY-MM-DD.'),
      nuevaHora: z
        .string()
        .describe('Nueva hora de inicio para la cita (ej. "17:00", "5:00 PM").'),
      nuevoBarberoNombre: z
        .string()
        .optional()
        .describe('Opcional: nombre o apodo del barbero si también se desea cambiar de barbero.'),
      motivo: z
        .string()
        .optional()
        .describe('Motivo del cambio de horario o día.'),
      quienSolicita: z
        .string()
        .optional()
        .describe(
          'Nombre de quien solicita mover o reagendar la cita (ej. "Alejandro Pacheco", "Beatriz"). Si se omite, se usa el operador autenticado en la sesión.'
        ),
    }),
  },
  async ({
    nombreClienteOId,
    fechaActual,
    nuevaFecha,
    nuevaHora,
    nuevoBarberoNombre,
    motivo,
    quienSolicita,
  }) => {
    const caller = getCallerInfo(quienSolicita);
    const db = getDb();
    const { todayIso } = getMexicoDateInfo();
    const targetDateCurrent = (fechaActual && /^\d{4}-\d{2}-\d{2}$/.test(fechaActual.trim()))
      ? fechaActual.trim()
      : todayIso;

    const parsedHour = parseTimeToHHmm(nuevaHora);
    if (!parsedHour) {
      return {
        ok: false,
        mensaje: `La nueva hora "${nuevaHora}" no tiene un formato válido (ej. "17:00" o "5:00 PM").`,
      };
    }

    // 1. Buscar la cita existente
    const resSnap = await db.collection('reservas').where('fecha', '==', targetDateCurrent).get();
    const queryNorm = normalizeName(nombreClienteOId);
    let matchedDoc: any = null;

    resSnap.forEach((doc) => {
      if (matchedDoc) return;
      if (doc.id === nombreClienteOId.trim()) {
        matchedDoc = doc;
        return;
      }
      const data = doc.data();
      if (data.estado === 'Cancelado' || data.estado === 'No asiste') return;
      const clientName = normalizeName(data.cliente_nombre || data.customer?.nombre || '');
      const clientPhoneDigits = String(data.cliente_telefono || data.customer?.telefono || '').replace(/\D/g, '');
      const queryDigits = nombreClienteOId.replace(/\D/g, '');

      if (
        clientName === queryNorm ||
        clientName.includes(queryNorm) ||
        queryNorm.includes(clientName) ||
        (queryDigits.length >= 7 && (clientPhoneDigits === queryDigits || clientPhoneDigits.endsWith(queryDigits)))
      ) {
        matchedDoc = doc;
      }
    });

    if (!matchedDoc) {
      return {
        ok: false,
        mensaje: `No encontré una cita activa para "${nombreClienteOId}" en la fecha ${targetDateCurrent}. Verifica el nombre del cliente o la fecha.`,
      };
    }

    const resData = matchedDoc.data();
    const profSnap = await db.collection('profesionales').get();
    const activeProfessionals: any[] = [];
    profSnap.forEach((d) => {
      const p = d.data();
      if (!p.deleted && p.active !== false) activeProfessionals.push({ id: d.id, ...p });
    });

    // 2. Determinar barbero (nuevo o actual)
    let targetProf = activeProfessionals.find((p) => p.id === resData.barbero_id);
    if (nuevoBarberoNombre && nuevoBarberoNombre.trim()) {
      const found = findBarber(nuevoBarberoNombre, activeProfessionals);
      if (found) targetProf = found;
    }

    if (!targetProf) {
      return {
        ok: false,
        mensaje: 'No pude determinar el profesional asignado para reagendar la cita.',
      };
    }

    const barberDisplayName = targetProf.publicName || targetProf.name || 'Barbero';

    // Determinar la duración considerando la duración personalizada por barbero (durationPorProfesional)
    let durationMins = Number(resData.duracion || 40);
    const serviceName = resData.servicio || resData.items?.[0]?.nombre || resData.items?.[0]?.servicio;

    if (serviceName) {
      try {
        const resolvedServ = await resolveServiceForGerencia(
          db,
          serviceName,
          targetProf.id,
          resData.customer?.notas || resData.notas,
          barberDisplayName
        );
        if (resolvedServ?.duration && resolvedServ.duration > 0) {
          durationMins = resolvedServ.duration;
        }
      } catch (err) {
        console.warn('Error resolviendo duración en reagendación:', err);
      }
    }

    const startMins = timeToMinutes(parsedHour);
    const endMins = startMins + durationMins;
    const nuevaHoraFin = minutesToTime(endMins);

    // 3. Validar disponibilidad del barbero en la nueva fecha y hora
    const barberSchedule = await getBarberScheduleForDay({
      db,
      barber: targetProf,
      dateStr: nuevaFecha,
      localId: targetProf.local_id || 'rkbEgvwP67JliXQ1Qeyj',
    });

    if (!barberSchedule.isWorkingDay) {
      return {
        ok: false,
        mensaje: `**${barberDisplayName}** no labora los ${barberSchedule.diaSemana}s (figura como día libre en la agenda). No se puede mover a esa fecha con ese barbero.`,
      };
    }

    const bloqConflict = barberSchedule.existingBlocks.find(
      (blk) => blk.type !== 'available' && parsedHour < blk.hora_fin && nuevaHoraFin > blk.hora_inicio
    );
    if (bloqConflict) {
      return {
        ok: false,
        mensaje: `No se puede mover a las ${parsedHour} porque **${barberDisplayName}** tiene un bloqueo registrado de **${bloqConflict.hora_inicio} a ${bloqConflict.hora_fin}** (motivo: "${bloqConflict.motivo}").`,
      };
    }

    const resConflict = barberSchedule.activeReservations.find(
      (r) => r.id !== matchedDoc.id && parsedHour < r.hora_fin && nuevaHoraFin > r.hora_inicio
    );
    if (resConflict) {
      return {
        ok: false,
        mensaje: `A esa hora (${parsedHour} a ${nuevaHoraFin}) **${barberDisplayName}** ya tiene agendado a **${resConflict.cliente}** de **${resConflict.hora_inicio} a ${resConflict.hora_fin}**.`,
      };
    }

    // 4. Actualizar la reserva
    const updatedItems = (Array.isArray(resData.items) ? resData.items : []).map((item: any) => ({
      ...item,
      barbero_id: targetProf.id,
      duracion: durationMins,
      hora_inicio: parsedHour,
      hora_fin: nuevaHoraFin,
    }));

    await matchedDoc.ref.update({
      fecha: nuevaFecha,
      hora_inicio: parsedHour,
      hora_fin: nuevaHoraFin,
      duracion: durationMins,
      barbero_id: targetProf.id,
      professionalNames: barberDisplayName,
      items: updatedItems.length > 0 ? updatedItems : resData.items,
      whatsappConfirmationSent: false,
      reagendada_en: Timestamp.now(),
      reagendada_por: caller.creatorDisplay,
      motivo_reagendacion: motivo || `Solicitado por ${caller.operatorName}`,
    });

    // 5. Auditoría
    await db.collection('audit_logs').add({
      action: `Reagendar Cita (${caller.assistantName})`,
      details: `Cita de ${resData.cliente_nombre} movida al ${nuevaFecha} a las ${parsedHour} con ${barberDisplayName}. Motivo: ${motivo || 'Recepción'}`,
      userId: caller.auditUserId,
      userName: `${caller.creatorDisplay} (${caller.auditUserRole})`,
      userRole: caller.auditUserRole,
      severity: 'info',
      entityId: matchedDoc.id,
      localId: targetProf.local_id || 'rkbEgvwP67JliXQ1Qeyj',
      timestamp: FieldValue.serverTimestamp(),
    });

    const saludoOperador = caller.operatorName.includes('Alejandro') ? 'Alejandro' : 'Bety';

    return {
      ok: true,
      reservaId: matchedDoc.id,
      cliente: resData.cliente_nombre,
      nuevaFecha,
      nuevoHorario: `${parsedHour} a ${nuevaHoraFin}`,
      barbero: barberDisplayName,
      mensaje: `¡Listo ${saludoOperador}! La cita de **${resData.cliente_nombre}** ha sido reagendada con éxito:\n\n• **Nueva Fecha:** ${nuevaFecha}\n• **Nuevo Horario:** ${parsedHour} a ${nuevaHoraFin}\n• **Barbero:** ${barberDisplayName}\n\nYa quedó actualizada en la agenda.`,
    };
  }
);

// ============================================================================
// 4. CONSULTAR DISPONIBILIDAD Y ESPACIOS LIBRES DE BARBEROS
// ============================================================================
export const consultarDisponibilidadBarberosSucursalTool = ai.defineTool(
  {
    name: 'consultar_disponibilidad_barberos_sucursal',
    description:
      'Consulta los espacios libres y horarios disponibles para agendar citas de cualquier barbero o de todo el equipo en una fecha específica. Úsala cuando Beatriz pregunte qué horas tiene libres un barbero o quién puede atender una cita.',
    inputSchema: z.object({
      fecha: z
        .string()
        .optional()
        .describe('Fecha a consultar en formato YYYY-MM-DD. Si se omite, se usa el día de hoy en Querétaro.'),
      barberoNombre: z
        .string()
        .optional()
        .describe('Opcional: nombre o apodo del barbero (ej. "Lalo", "Alfredo", "Ivon", "Lupita", "Beatriz"). Si se omite, analiza a todos.'),
      servicioNombre: z
        .string()
        .optional()
        .describe('Opcional: nombre del servicio a consultar (ej. "Corte de cabello", "Barba"). Permite calcular la duración exacta según el tiempo personalizado de cada barbero.'),
      duracionMinutos: z
        .number()
        .optional()
        .describe('Duración manual en minutos. Si se omite, se calcula automáticamente según la configuración personalizada del barbero para el servicio.'),
    }),
  },
  async ({ fecha, barberoNombre, servicioNombre, duracionMinutos }) => {
    const db = getDb();
    const { todayIso } = getMexicoDateInfo();
    const targetDate = (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha.trim())) ? fecha.trim() : todayIso;

    const profSnap = await db.collection('profesionales').get();
    const activeProfessionals: any[] = [];
    profSnap.forEach((doc) => {
      const p = doc.data();
      if (!p.deleted && p.active !== false) {
        activeProfessionals.push({ id: doc.id, ...p });
      }
    });

    let targetBarbers = activeProfessionals;
    if (barberoNombre && barberoNombre.trim()) {
      const match = findBarber(barberoNombre, activeProfessionals);
      if (match) {
        targetBarbers = [match];
      }
    }

    const defaultLocalId = activeProfessionals[0]?.local_id || 'rkbEgvwP67JliXQ1Qeyj';
    const disponibilidad: any[] = [];

    for (const barber of targetBarbers) {
      let barberDuration = duracionMinutos;
      if (!barberDuration) {
        const resolvedServ = await resolveServiceForGerencia(
          db,
          servicioNombre || 'Corte de cabello',
          barber.id,
          undefined,
          barber.publicName || barber.name
        );
        barberDuration = resolvedServ.duration || 40;
      }

      const schedule = await getBarberScheduleForDay({
        db,
        barber,
        dateStr: targetDate,
        localId: barber.local_id || defaultLocalId,
      });

      const freeSlots = calculateBarberFreeSlots(schedule, barberDuration);

      disponibilidad.push({
        barbero: schedule.displayName,
        barberoId: schedule.barberId,
        diaSemana: schedule.diaSemana,
        duracionServicioMinutos: barberDuration,
        laboraHoy: schedule.isWorkingDay,
        jornada: schedule.workingHours ? `${schedule.workingHours.start} - ${schedule.workingHours.end}` : 'Día libre',
        horariosLibresDisponibles: freeSlots,
        totalEspaciosLibres: freeSlots.length,
        resumen: schedule.isWorkingDay
          ? freeSlots.length > 0
            ? `${schedule.displayName} tiene ${freeSlots.length} horario(s) disponible(s) de ${barberDuration} min entre ${freeSlots[0]} y ${freeSlots[freeSlots.length - 1]}.`
            : `${schedule.displayName} tiene su jornada completa ocupada o bloqueada hoy.`
          : `${schedule.displayName} no labora los ${schedule.diaSemana}s (día libre).`,
      });
    }

    return {
      fecha: targetDate,
      servicioConsultado: servicioNombre || 'Corte de cabello',
      duracionServicioConsultada: duracionMinutos ? `${duracionMinutos} minutos (manual)` : 'Personalizada según barbero',
      disponibilidad,
    };
  }
);

// ============================================================================
// 5. GESTIONAR HORARIO DE BARBERO (BLOQUEAR / HABILITAR ESPECIAL INTERNO / DESBLOQUEAR)
// ============================================================================
export const gestionarHorarioBarberoSucursalTool = ai.defineTool(
  {
    name: 'gestionar_horario_barbero_sucursal',
    description:
      'Gestiona bloqueos de horario y HORARIOS ESPECIALES INTERNOS en la agenda física de recepción. REGLA CLAVE: "habilitar_especial" aquí es ESTRICTAMENTE INTERNO para el local (los clientes NO lo ven en la web ni en la app móvil). Para habilitar una JORNADA ESPECIAL PÚBLICA que sea visible en la web y en la app móvil para que los clientes reserven en línea, usa la herramienta "gestionar_jornada_especial_sucursal".',
    inputSchema: z.object({
      accion: z
        .enum(['bloquear', 'habilitar_especial', 'desbloquear', 'habilitar_jornada_especial'])
        .describe('Acción: "bloquear" (cierra turno/rango), "habilitar_especial" (horario especial interno solo para recepción en la agenda física), "desbloquear" (elimina bloqueos), o "habilitar_jornada_especial" (pública en web y app).'),
      nombreBarbero: z
        .string()
        .describe('Nombre o apodo del barbero (ej. "Lalo", "Eduardo", "Alfredo", "Ivon", "Lupita", "Beatriz").'),
      fecha: z.string().describe('Fecha en formato YYYY-MM-DD.'),
      horaInicio: z
        .string()
        .optional()
        .describe('Hora de inicio en formato 24h HH:mm (ej. "15:00"). Si se omite al bloquear todo el día, se usa el inicio de su jornada.'),
      horaFin: z
        .string()
        .optional()
        .describe('Hora de fin en formato 24h HH:mm (ej. "20:00"). Si se omite al bloquear todo el día, se usa el fin de su jornada.'),
      motivo: z
        .string()
        .describe('Motivo claro del bloqueo o del horario especial (ej. "Permiso personal autorizado por Bety").'),
    }),
  },
  async ({ accion, nombreBarbero, fecha, horaInicio, horaFin, motivo }) => {
    const caller = getCallerInfo();
    const saludoOperador = caller.operatorName.includes('Alejandro') ? 'Alejandro' : 'Bety';
    const db = getDb();
    const profSnap = await db.collection('profesionales').get();
    const activeProfessionals: any[] = [];

    profSnap.forEach((doc) => {
      const p = doc.data();
      if (!p.deleted && p.active !== false) {
        activeProfessionals.push({ id: doc.id, ...p });
      }
    });

    const prof = findBarber(nombreBarbero, activeProfessionals);

    if (!prof) {
      return {
        ok: false,
        mensaje: `No encontré un barbero activo que coincida con "${nombreBarbero}". Verifica el nombre (ej. Lalo, Alfredo, Ivon, Lupita, Bety).`,
      };
    }

    let defaultLocalId = prof.local_id || prof.localId || '';
    if (!defaultLocalId) {
      const localesSnap = await db.collection('locales').limit(1).get();
      if (!localesSnap.empty) defaultLocalId = localesSnap.docs[0].id;
    }

    const barberSchedule = await getBarberScheduleForDay({
      db,
      barber: prof,
      dateStr: fecha,
      localId: defaultLocalId,
    });

    const displayName = barberSchedule.displayName;

    // Si se solicitó habilitar jornada especial o si el motivo hace referencia a jornada pública/web/app,
    // enrutar de forma segura a jornadas_especiales para garantizar que sea visible a clientes en la web y app
    const isJornadaEspecialRequest =
      accion === 'habilitar_jornada_especial' ||
      (accion === 'habilitar_especial' &&
        (/(jornada\s*especial|p[uú]blic|web|app\s*m[oó]vil|clientes\s*agend)/i.test(motivo || '')));

    if (isJornadaEspecialRequest) {
      const start = horaInicio || '10:00';
      const end = horaFin || '18:00';
      if (end <= start) {
        return {
          ok: false,
          mensaje: `La hora de fin (${end}) debe ser posterior a la hora de inicio (${start}).`,
        };
      }

      const existingSnap = await db
        .collection('jornadas_especiales')
        .where('profesionalId', '==', prof.id)
        .where('fecha', '==', fecha)
        .get();

      let jornadaId = '';
      const cleanMotivo = (motivo || 'Jornada especial solicitada por gerencia').trim().slice(0, 100);

      if (!existingSnap.empty) {
        const docRef = existingSnap.docs[0].ref;
        jornadaId = existingSnap.docs[0].id;
        await docRef.update({
          hora_inicio: start,
          hora_fin: end,
          motivo: cleanMotivo,
          actualizado_en: Timestamp.now(),
          actualizado_por: caller.creatorDisplay,
        });
      } else {
        const newDocRef = await db.collection('jornadas_especiales').add({
          profesionalId: prof.id,
          profesionalName: prof.name || displayName,
          local_id: defaultLocalId,
          fecha,
          hora_inicio: start,
          hora_fin: end,
          creado_en: Timestamp.now(),
          creado_por: caller.creatorDisplay || 'Janet Gerencia',
          motivo: cleanMotivo,
        });
        jornadaId = newDocRef.id;
      }

      // Limpiar bloqueos de tipo 'available' internos huérfanos para esa fecha si existieran
      try {
        const blocksSnap = await db
          .collection('bloqueos_horario')
          .where('barbero_id', '==', prof.id)
          .where('fecha', '==', fecha)
          .where('type', '==', 'available')
          .get();

        for (const bDoc of blocksSnap.docs) {
          await bDoc.ref.delete();
        }
      } catch (err) {
        console.warn('Error limpiando bloqueos available residuales:', err);
      }

      await db.collection('audit_logs').add({
        action: `Habilitar Jornada Especial (${caller.assistantName})`,
        details: `Jornada especial PÚBLICA habilitada para ${displayName} el ${fecha} de ${start} a ${end}. Visible en Web y App Móvil. Motivo: ${cleanMotivo}`,
        userId: caller.auditUserId,
        userName: `${caller.creatorDisplay} (${caller.auditUserRole})`,
        userRole: caller.auditUserRole,
        severity: 'info',
        entityId: jornadaId,
        localId: defaultLocalId,
        timestamp: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        jornadaId,
        mensaje: `Listo ${saludoOperador}: quedó habilitada la **Jornada Especial** para **${displayName}** el día **${fecha}** de **${start} a ${end}** (motivo: "${cleanMotivo}"). Este horario ya es **público y 100% visible para que los clientes agenden en la página web y en la app móvil**, además de mostrarse en la cuadrícula de la agenda.`,
      };
    }

    if (accion === 'bloquear') {
      // 1. Validar si el barbero labora ese día
      if (!barberSchedule.isWorkingDay) {
        return {
          ok: false,
          yaCerrado: true,
          mensaje: `${displayName} no labora los ${barberSchedule.diaSemana}s. En la agenda ya figura automáticamente como "Día libre" / "No disponible" todo el día. No es necesario ni posible agregar un bloqueo adicional.`,
        };
      }

      // 2. Determinar horario a bloquear acotado a su jornada laboral real
      const shiftStart = barberSchedule.workingHours?.start || '10:00';
      const shiftEnd = barberSchedule.workingHours?.end || '21:00';

      let effectiveStart = (horaInicio && horaInicio.trim()) || shiftStart;
      let effectiveEnd = (horaFin && horaFin.trim()) || shiftEnd;

      // Si se envió un rango genérico como 09:00 a 21:00, ajustarlo a la jornada real del barbero
      if (timeToMinutes(effectiveStart) < timeToMinutes(shiftStart)) {
        effectiveStart = shiftStart;
      }
      if (timeToMinutes(effectiveEnd) > timeToMinutes(shiftEnd)) {
        effectiveEnd = shiftEnd;
      }

      if (effectiveEnd <= effectiveStart) {
        return {
          ok: false,
          mensaje: `La hora de fin (${effectiveEnd}) debe ser posterior a la hora de inicio (${effectiveStart}).`,
        };
      }

      // 3. Validar si su jornada ya está 100% bloqueada/cubierta en la agenda
      if (barberSchedule.isEntireShiftBlocked) {
        const descBloqueos = barberSchedule.existingBlocks
          .map((b) => `${b.hora_inicio}-${b.hora_fin} ("${b.motivo}")`)
          .join(', ');
        return {
          ok: false,
          yaBloqueado: true,
          mensaje: `El horario de ${displayName} para el ${fecha} ya está totalmente CERRADO/BLOQUEADO en la agenda (${descBloqueos || 'descanso registrado'}). Fuera de su turno (${shiftStart} a ${shiftEnd}) ya figura como "No disponible". Para no encimar bloques ni duplicar franjas en la agenda, no se agregó otro bloqueo.`,
        };
      }

      // 4. Validar traslape con bloqueos existentes en ese rango exacto
      const bloqSolapados = barberSchedule.existingBlocks.filter((b) => {
        return effectiveStart < b.hora_fin && effectiveEnd > b.hora_inicio;
      });

      if (bloqSolapados.length > 0) {
        const solapado = bloqSolapados[0];
        return {
          ok: false,
          empalmeBloqueo: true,
          mensaje: `No se puede bloquear de ${effectiveStart} a ${effectiveEnd} porque se empalma con un bloqueo existente de ${displayName} de ${solapado.hora_inicio} a ${solapado.hora_fin} (motivo: "${solapado.motivo}"). En la agenda de VATOS ALFA está prohibido encimar bloques. Si deseas reemplazarlo, primero desbloquea el horario anterior.`,
        };
      }

      // 5. Validar conflicto con citas activas de clientes
      const resSnap = await db.collection('reservas').where('fecha', '==', fecha).get();
      const conflictos: any[] = [];
      resSnap.forEach((doc) => {
        const r = doc.data();
        if (r.estado === 'Cancelado' || r.estado === 'No asiste') return;
        const isForBarber =
          r.barbero_id === prof.id ||
          (Array.isArray(r.items) && r.items.some((item: any) => item?.barbero_id === prof.id));
        if (!isForBarber) return;

        if (effectiveStart < r.hora_fin && effectiveEnd > r.hora_inicio) {
          conflictos.push({
            reservaId: doc.id,
            cliente: r.customer?.nombre || r.cliente_nombre || 'Cliente',
            horario: `${r.hora_inicio} - ${r.hora_fin}`,
            servicio: r.servicio || 'Servicio',
          });
        }
      });

      if (conflictos.length > 0) {
        return {
          ok: false,
          tieneConflictos: true,
          conflictos,
          mensaje: `No se puede bloquear directamente porque ${displayName} ya tiene ${conflictos.length} cita(s) activa(s) en ese horario (${conflictos.map((c) => `${c.cliente} de ${c.horario}`).join(', ')}). Primero debemos reagendar o cancelar esa(s) cita(s).`,
        };
      }

      // 6. Crear bloqueo limpio en bloqueos_horario
      const cleanMotivo = motivo.trim().slice(0, 50);
      const blockRef = await db.collection('bloqueos_horario').add({
        barbero_id: prof.id,
        motivo: cleanMotivo,
        fecha,
        hora_inicio: effectiveStart,
        hora_fin: effectiveEnd,
        creado_en: Timestamp.now(),
        local_id: defaultLocalId,
      });

      await db.collection('audit_logs').add({
        action: `Bloquear Horario (${caller.assistantName})`,
        details: `Horario bloqueado para ${displayName} el ${fecha} de ${effectiveStart} a ${effectiveEnd}. Motivo: ${cleanMotivo}`,
        userId: caller.auditUserId,
        userName: `${caller.creatorDisplay} (${caller.auditUserRole})`,
        userRole: caller.auditUserRole,
        severity: 'info',
        entityId: blockRef.id,
        localId: defaultLocalId,
        timestamp: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        bloqueoId: blockRef.id,
        mensaje: `Listo ${saludoOperador}: quedó bloqueado el horario de **${displayName}** el día **${fecha}** de **${effectiveStart} a ${effectiveEnd}** con motivo "${cleanMotivo}". Ya se refleja limpiamente en la agenda.`,
      };
    }

    if (accion === 'habilitar_especial') {
      const start = horaInicio || '10:00';
      const end = horaFin || '21:00';
      if (end <= start) {
        return {
          ok: false,
          mensaje: `La hora de fin (${end}) debe ser posterior a la hora de inicio (${start}).`,
        };
      }

      const enableRef = await db.collection('bloqueos_horario').add({
        barbero_id: prof.id,
        local_id: defaultLocalId,
        fecha,
        hora_inicio: start,
        hora_fin: end,
        motivo: motivo || 'Horario Habilitado (Interno)',
        type: 'available',
        created_at: new Date(),
      });

      await db.collection('audit_logs').add({
        action: `Habilitar Horario Especial Interno (${caller.assistantName})`,
        details: `Horario especial INTERNO habilitado para ${displayName} el ${fecha} de ${start} a ${end}. Solo visible en recepción. Motivo: ${motivo}`,
        userId: caller.auditUserId,
        userName: `${caller.creatorDisplay} (${caller.auditUserRole})`,
        userRole: caller.auditUserRole,
        severity: 'info',
        entityId: enableRef.id,
        localId: defaultLocalId,
        timestamp: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        bloqueoId: enableRef.id,
        mensaje: `Listo ${saludoOperador}: se habilitó el **Horario Especial Interno** para **${displayName}** el día **${fecha}** de **${start} a ${end}** (motivo: "${motivo}"). Este horario es **únicamente visible dentro de recepción en la agenda física** para permitir citas manuales en el local (los clientes NO lo ven en la página web ni en la app móvil).`,
      };
    }

    // accion === 'desbloquear'
    const blocksSnap = await db
      .collection('bloqueos_horario')
      .where('barbero_id', '==', prof.id)
      .where('fecha', '==', fecha)
      .get();

    const checkStart = horaInicio || '00:00';
    const checkEnd = horaFin || '23:59';

    const toDelete = blocksSnap.docs.filter((d) => {
      const b = d.data();
      if (b.type === 'available') return false;
      return b.hora_inicio < checkEnd && b.hora_fin > checkStart;
    });

    if (toDelete.length === 0) {
      return {
        ok: false,
        mensaje: `No encontré bloqueos de horario activos para ${displayName} el ${fecha} en ese rango.`,
      };
    }

    const motivosEliminados: string[] = [];
    for (const d of toDelete) {
      motivosEliminados.push(`${d.data().hora_inicio}-${d.data().hora_fin} ("${d.data().motivo}")`);
      await d.ref.delete();
    }

    await db.collection('audit_logs').add({
      action: `Desbloquear Horario (${caller.assistantName})`,
      details: `Se eliminaron ${toDelete.length} bloqueo(s) de ${displayName} el ${fecha}: ${motivosEliminados.join(', ')}. Motivo: ${motivo}`,
      userId: caller.auditUserId,
      userName: `${caller.creatorDisplay} (${caller.auditUserRole})`,
      userRole: caller.auditUserRole,
      severity: 'info',
      localId: defaultLocalId,
      timestamp: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      eliminados: toDelete.length,
      mensaje: `Listo ${saludoOperador}: se eliminaron ${toDelete.length} bloqueo(s) de **${displayName}** para el día **${fecha}** (${motivosEliminados.join(', ')}). Su horario vuelve a estar disponible en la agenda.`,
    };
  }
);

// ============================================================================
// 5.1 GESTIONAR JORNADA ESPECIAL DE PROFESIONAL (PÚBLICA EN WEB Y APP MÓVIL)
// ============================================================================
export const gestionarJornadaEspecialSucursalTool = ai.defineTool(
  {
    name: 'gestionar_jornada_especial_sucursal',
    description:
      'Habilita o elimina una Jornada Especial de un profesional (la misma función que se activa desde Administración -> Profesionales). Una Jornada Especial es PÚBLICA y 100% VISIBLE en la página web y en la app móvil para que los clientes puedan agendar en línea, y sustituye el horario laboral regular del barbero para esa fecha. Úsala siempre que te pidan "habilitar jornada especial", "abrir jornada especial", "poner disponible en la web/app" o abrir un día para citas públicas de clientes. (Para horarios internos que solo recepción debe ver en la agenda física sin mostrar a clientes online, usa gestionar_horario_barbero_sucursal con habilitar_especial).',
    inputSchema: z.object({
      accion: z
        .enum(['habilitar', 'eliminar'])
        .describe('Acción a realizar: "habilitar" para abrir jornada especial pública en web y app móvil, o "eliminar" para quitarla y volver al horario habitual/libre.'),
      nombreBarbero: z
        .string()
        .describe('Nombre o apodo del barbero/profesional (ej. "Lupita", "Alfredo", "Lalo", "Beatriz", "Ivon").'),
      fecha: z
        .string()
        .describe('Fecha en formato YYYY-MM-DD para la cual se habilitará o eliminará la jornada especial.'),
      horaInicio: z
        .string()
        .optional()
        .describe('Hora de inicio de la jornada en formato 24h HH:mm (ej. "10:00"). Requerido al habilitar.'),
      horaFin: z
        .string()
        .optional()
        .describe('Hora de fin de la jornada en formato 24h HH:mm (ej. "14:00" o "18:00"). Requerido al habilitar.'),
      motivo: z
        .string()
        .optional()
        .describe('Motivo de la jornada especial (ej. "Jornada especial solicitada por Beatriz").'),
    }),
  },
  async ({ accion, nombreBarbero, fecha, horaInicio, horaFin, motivo }) => {
    const caller = getCallerInfo();
    const saludoOperador = caller.operatorName.includes('Alejandro') ? 'Alejandro' : 'Bety';
    const db = getDb();
    const profSnap = await db.collection('profesionales').get();
    const activeProfessionals: any[] = [];

    profSnap.forEach((doc) => {
      const p = doc.data();
      if (!p.deleted && p.active !== false) {
        activeProfessionals.push({ id: doc.id, ...p });
      }
    });

    const prof = findBarber(nombreBarbero, activeProfessionals);

    if (!prof) {
      return {
        ok: false,
        mensaje: `No encontré un barbero activo que coincida con "${nombreBarbero}". Verifica el nombre (ej. Lupita, Alfredo, Lalo, Ivon, Bety).`,
      };
    }

    const displayName = prof.publicName || prof.name || 'Barbero';
    let defaultLocalId = prof.local_id || prof.localId || '';
    if (!defaultLocalId) {
      const localesSnap = await db.collection('locales').limit(1).get();
      if (!localesSnap.empty) defaultLocalId = localesSnap.docs[0].id;
    }

    if (accion === 'habilitar') {
      const start = (horaInicio && horaInicio.trim()) || '10:00';
      const end = (horaFin && horaFin.trim()) || '18:00';

      if (timeToMinutes(end) <= timeToMinutes(start)) {
        return {
          ok: false,
          mensaje: `La hora de fin (${end}) debe ser posterior a la hora de inicio (${start}).`,
        };
      }

      // 1. Revisar si ya existe una jornada especial para este profesional y fecha
      const existingSnap = await db
        .collection('jornadas_especiales')
        .where('profesionalId', '==', prof.id)
        .where('fecha', '==', fecha)
        .get();

      let jornadaId = '';
      const cleanMotivo = (motivo || 'Jornada especial solicitada por gerencia').trim().slice(0, 100);

      if (!existingSnap.empty) {
        const docRef = existingSnap.docs[0].ref;
        jornadaId = existingSnap.docs[0].id;
        await docRef.update({
          hora_inicio: start,
          hora_fin: end,
          motivo: cleanMotivo,
          actualizado_en: Timestamp.now(),
          actualizado_por: caller.creatorDisplay,
        });
      } else {
        const newDocRef = await db.collection('jornadas_especiales').add({
          profesionalId: prof.id,
          profesionalName: prof.name || displayName,
          local_id: defaultLocalId,
          fecha,
          hora_inicio: start,
          hora_fin: end,
          creado_en: Timestamp.now(),
          creado_por: caller.creatorDisplay || 'Janet Gerencia',
          motivo: cleanMotivo,
        });
        jornadaId = newDocRef.id;
      }

      // 2. Limpiar bloqueos de tipo 'available' internos huérfanos para esa fecha si existieran
      try {
        const blocksSnap = await db
          .collection('bloqueos_horario')
          .where('barbero_id', '==', prof.id)
          .where('fecha', '==', fecha)
          .where('type', '==', 'available')
          .get();

        for (const bDoc of blocksSnap.docs) {
          await bDoc.ref.delete();
        }
      } catch (err) {
        console.warn('Error limpiando bloqueos available residuales:', err);
      }

      // 3. Registrar auditoría
      await db.collection('audit_logs').add({
        action: `Habilitar Jornada Especial (${caller.assistantName})`,
        details: `Jornada especial PÚBLICA habilitada para ${displayName} el ${fecha} de ${start} a ${end}. Visible en Web y App Móvil. Motivo: ${cleanMotivo}`,
        userId: caller.auditUserId,
        userName: `${caller.creatorDisplay} (${caller.auditUserRole})`,
        userRole: caller.auditUserRole,
        severity: 'info',
        entityId: jornadaId,
        localId: defaultLocalId,
        timestamp: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        jornadaId,
        mensaje: `Listo ${saludoOperador}: quedó habilitada la **Jornada Especial** para **${displayName}** el día **${fecha}** de **${start} a ${end}** (motivo: "${cleanMotivo}"). Este horario ya es **público y 100% visible para que los clientes agenden en la página web y en la app móvil**, además de quedar abierto en la agenda física.`,
      };
    }

    // accion === 'eliminar'
    const snap = await db
      .collection('jornadas_especiales')
      .where('profesionalId', '==', prof.id)
      .where('fecha', '==', fecha)
      .get();

    if (snap.empty) {
      return {
        ok: false,
        mensaje: `No se encontró ninguna jornada especial registrada para ${displayName} en la fecha ${fecha}.`,
      };
    }

    for (const doc of snap.docs) {
      await doc.ref.delete();
    }

    await db.collection('audit_logs').add({
      action: `Eliminar Jornada Especial (${caller.assistantName})`,
      details: `Se eliminó la jornada especial de ${displayName} para el ${fecha}. Motivo: ${motivo || 'Solicitud de gerencia'}`,
      userId: caller.auditUserId,
      userName: `${caller.creatorDisplay} (${caller.auditUserRole})`,
      userRole: caller.auditUserRole,
      severity: 'info',
      localId: defaultLocalId,
      timestamp: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      mensaje: `Listo ${saludoOperador}: se eliminó la jornada especial de **${displayName}** para el **${fecha}**. Su disponibilidad vuelve a regirse por su horario habitual regular (o día libre si no labora ese día).`,
    };
  }
);

// ============================================================================
// 3. PROPONER CANCELACIÓN DE CITA O ELIMINACIÓN DE VENTA (CON TARJETA DE CONFIRMACIÓN)
// ============================================================================
export const proponerCancelacionOEliminacionSucursalTool = ai.defineTool(
  {
    name: 'proponer_cancelacion_o_eliminacion_sucursal',
    description:
      'Prepara una Tarjeta de Confirmación Operativa para cancelar una cita/reserva o eliminar una venta facturada cuando recepción o un barbero se lo solicita a Beatriz. Exige siempre un motivo claro para el registro de auditoría.',
    inputSchema: z.object({
      tipoOperacion: z
        .enum(['cancelar_cita', 'eliminar_venta'])
        .describe('Si se desea cancelar una cita de la agenda o eliminar una venta facturada.'),
      idExacto: z
        .string()
        .optional()
        .describe('ID exacto de la reserva o venta (si ya se consultó previamente).'),
      nombreCliente: z
        .string()
        .describe('Nombre del cliente asociado a la cita o venta.'),
      fecha: z
        .string()
        .optional()
        .describe('Fecha de la cita o venta en formato YYYY-MM-DD (por defecto hoy).'),
      motivoObligatorio: z
        .string()
        .describe('Motivo detallado por el cual Beatriz autoriza cancelar la cita o eliminar la venta.'),
    }),
  },
  async ({ tipoOperacion, idExacto, nombreCliente, fecha, motivoObligatorio }) => {
    const db = getDb();
    const { todayIso } = getMexicoDateInfo();
    const targetDate = (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha.trim())) ? fecha.trim() : todayIso;
    const clientNorm = nombreCliente.toLowerCase().trim();

    if (!motivoObligatorio || motivoObligatorio.trim().length < 4) {
      return {
        ok: false,
        mensaje: 'Es obligatorio indicar el motivo claro de la cancelación o eliminación para el registro de auditoría.',
      };
    }

    if (tipoOperacion === 'cancelar_cita') {
      let targetDoc: FirebaseFirestore.DocumentSnapshot | null = null;
      if (idExacto) {
        const snap = await db.collection('reservas').doc(idExacto).get();
        if (snap.exists) targetDoc = snap;
      }

      if (!targetDoc) {
        const resSnap = await db.collection('reservas').where('fecha', '==', targetDate).get();
        const matches = resSnap.docs.filter((d) => {
          const r = d.data();
          if (r.estado === 'Cancelado') return false;
          const cName = String(r.customer?.nombre || r.cliente_nombre || '').toLowerCase();
          return cName.includes(clientNorm);
        });

        if (matches.length === 0) {
          return {
            ok: false,
            mensaje: `No encontré ninguna cita activa para "${nombreCliente}" en la fecha ${targetDate}.`,
          };
        }
        if (matches.length > 1) {
          return {
            ok: false,
            coincidencias: matches.map((m) => ({
              reservaId: m.id,
              cliente: m.data().customer?.nombre || m.data().cliente_nombre,
              horario: `${m.data().hora_inicio} - ${m.data().hora_fin}`,
              servicio: m.data().servicio,
            })),
            mensaje: `Encontré ${matches.length} citas para "${nombreCliente}" el ${targetDate}. Indica cuál horario deseas cancelar.`,
          };
        }
        targetDoc = matches[0];
      }

      const rData = targetDoc.data() || {};
      const cName = rData.customer?.nombre || rData.cliente_nombre || nombreCliente;
      const horario = `${rData.hora_inicio || ''} - ${rData.hora_fin || ''}`;
      const servicio = rData.servicio || 'Servicio';

      const propRef = await db.collection('gerencia_propuestas').add({
        tipoAccion: 'cancelar_cita',
        tituloPropuesta: `Cancelar cita de ${cName} (${rData.fecha || targetDate} ${horario})`,
        justificacionOperativa: `Motivo registrado: ${motivoObligatorio.trim()}`,
        resumenAntes: `Estado actual: ${rData.estado || 'Reservado'} · ${servicio}`,
        resumenDespues: `Estado nuevo: Cancelado (con registro en Auditoría)`,
        parametrosEjecucion: {
          reservaId: targetDoc.id,
          clienteId: rData.cliente_id || '',
          clienteNombre: cName,
          fecha: rData.fecha || targetDate,
          horaInicio: rData.hora_inicio || '',
          motivo: motivoObligatorio.trim(),
          localId: rData.local_id || 'unknown',
        },
        estado: 'pendiente_aprobacion',
        creado_en: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        propuestaId: propRef.id,
        tipoAccion: 'cancelar_cita',
        tituloPropuesta: `Cancelar cita de ${cName} (${rData.fecha || targetDate} ${horario})`,
        justificacionOperativa: `Motivo registrado: ${motivoObligatorio.trim()}`,
        resumenAntes: `Estado actual: ${rData.estado || 'Reservado'} · ${servicio}`,
        resumenDespues: `Estado nuevo: Cancelado`,
        estado: 'pendiente_aprobacion',
        mensaje: 'Se generó la tarjeta de confirmación en pantalla para autorizar la cancelación con 1 clic.',
      };
    }

    // tipoOperacion === 'eliminar_venta'
    let saleDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    if (idExacto) {
      const snap = await db.collection('ventas').doc(idExacto).get();
      if (snap.exists) saleDoc = snap;
    }

    if (!saleDoc) {
      const startDay = new Date(`${targetDate}T00:00:00.000-06:00`);
      const endDay = new Date(`${targetDate}T23:59:59.999-06:00`);
      const salesSnap = await db
        .collection('ventas')
        .where('fecha_hora_venta', '>=', Timestamp.fromDate(startDay))
        .where('fecha_hora_venta', '<=', Timestamp.fromDate(endDay))
        .get();

      const matches = salesSnap.docs.filter((d) => {
        const v = d.data();
        const cName = String(v.cliente_nombre || v.client?.nombre || '').toLowerCase();
        return cName.includes(clientNorm);
      });

      if (matches.length === 0) {
        return {
          ok: false,
          mensaje: `No encontré ninguna venta facturada activa para "${nombreCliente}" en la fecha ${targetDate}.`,
        };
      }
      if (matches.length > 1) {
        return {
          ok: false,
          coincidencias: matches.map((m) => ({
            ventaId: m.id,
            cliente: m.data().cliente_nombre || m.data().client?.nombre,
            total: m.data().total,
            metodoPago: m.data().metodo_pago,
            hora: formatTimeMx(m.data().fecha_hora_venta),
          })),
          mensaje: `Encontré ${matches.length} ventas para "${nombreCliente}" el ${targetDate}. Indica el ID o monto exacto de la venta que deseas eliminar.`,
        };
      }
      saleDoc = matches[0];
    }

    const vData = saleDoc.data() || {};
    const cName = vData.cliente_nombre || vData.client?.nombre || nombreCliente;
    const monto = round2(Number(vData.total ?? vData.monto_pagado_real ?? 0));
    const metodo = vData.metodo_pago || 'efectivo';

    const propRef = await db.collection('gerencia_propuestas').add({
      tipoAccion: 'eliminar_venta',
      tituloPropuesta: `Eliminar Venta Facturada de ${cName} ($${monto.toFixed(2)})`,
      justificacionOperativa: `Motivo obligatorio registrado: ${motivoObligatorio.trim()}`,
      resumenAntes: `Venta activa #${saleDoc.id.slice(0, 8)} · $${monto.toFixed(2)} (${metodo})`,
      resumenDespues: `Eliminada de caja, stock revertido y motivo auditado`,
      parametrosEjecucion: {
        ventaId: saleDoc.id,
        clienteNombre: cName,
        total: monto,
        metodoPago: metodo,
        motivo: motivoObligatorio.trim(),
        localId: vData.local_id || 'unknown',
      },
      estado: 'pendiente_aprobacion',
      creado_en: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      propuestaId: propRef.id,
      tipoAccion: 'eliminar_venta',
      tituloPropuesta: `Eliminar Venta Facturada de ${cName} ($${monto.toFixed(2)})`,
      justificacionOperativa: `Motivo obligatorio registrado: ${motivoObligatorio.trim()}`,
      resumenAntes: `Venta activa #${saleDoc.id.slice(0, 8)} · $${monto.toFixed(2)} (${metodo})`,
      resumenDespues: `Eliminada de caja y registrada con motivo en Auditoría`,
      estado: 'pendiente_aprobacion',
      mensaje:
        'Se generó la tarjeta de confirmación en pantalla para autorizar la eliminación de la venta dejando el motivo registrado.',
    };
  }
);

// ============================================================================
// 4. INVENTARIO DE PRODUCTOS, INSUMOS Y RECORDATORIOS DE GERENCIA
// ============================================================================

function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function findMatchingCatalogProduct(
  searchTerm: string,
  products: Array<{ id: string; nombre: string; stock?: number; [key: string]: any }>
) {
  const normSearch = normalizeSearchText(searchTerm);
  if (!normSearch) return null;

  // 1. Coincidencia exacta directa
  const exact = products.find((p) => normalizeSearchText(p.nombre) === normSearch);
  if (exact) return exact;

  // 2. Singularización básica en español (ej. "ceras" -> "cera", "pomadas" -> "pomada", "botes" -> "bote", "shampoos" -> "shampoo")
  const singularSearch = normSearch.replace(/s$/, '');

  // 3. Coincidencia de subcadena o palabras clave
  const matches = products.filter((p) => {
    const normName = normalizeSearchText(p.nombre);
    return (
      normName.includes(normSearch) ||
      (singularSearch.length >= 3 && normName.includes(singularSearch)) ||
      normSearch.split(/\s+/).some((w) => w.length >= 3 && normName.includes(w))
    );
  });

  if (matches.length === 1) return matches[0];

  if (matches.length > 1) {
    // Priorizar el producto cuyo nombre empiece con la búsqueda o contenga la raíz singular completa
    const best =
      matches.find((p) => {
        const normName = normalizeSearchText(p.nombre);
        return normName.startsWith(normSearch) || (singularSearch.length >= 3 && normName.startsWith(singularSearch));
      }) ||
      matches.find((p) => {
        const normName = normalizeSearchText(p.nombre);
        return normName.includes(normSearch) || (singularSearch.length >= 3 && normName.includes(singularSearch));
      });
    return best || matches[0];
  }

  return null;
}

export async function ejecutarIngresoStockInventario({
  nombreProducto,
  cantidad,
  motivo,
  productoIdExacto,
  caller,
  db,
}: {
  nombreProducto: string;
  cantidad: number;
  motivo?: string;
  productoIdExacto?: string;
  caller: ReturnType<typeof getCallerInfo>;
  db: FirebaseFirestore.Firestore;
}) {
  const prodSnap = await db.collection('productos').get();
  const productos: any[] = [];
  prodSnap.forEach((doc) => {
    const data = doc.data();
    if (data.active !== false) {
      productos.push({ id: doc.id, ...data });
    }
  });

  let targetProduct = productoIdExacto
    ? productos.find((p) => p.id === productoIdExacto)
    : null;

  if (!targetProduct) {
    targetProduct = findMatchingCatalogProduct(nombreProducto, productos);
  }

  if (!targetProduct) {
    return {
      ok: false,
      error: `No encontré ningún producto en el catálogo que coincida con "${nombreProducto}".`,
      productosDisponibles: productos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        stockActual: Number(p.stock ?? 0),
      })),
    };
  }

  const currentStock = Number(targetProduct.stock ?? 0);
  const unitsToAdd = Math.max(1, Math.round(Number(cantidad) || 1));
  const newStock = currentStock + unitsToAdd;

  // Actualizar stock oficial en el producto
  await db.collection('productos').doc(targetProduct.id).update({
    stock: newStock,
    updated_at: FieldValue.serverTimestamp(),
  });

  // Registrar movimiento en movimientos_inventario para auditoría
  const auditMotivo = motivo?.trim() || 'Ingreso de mercancía por Gerencia';
  await db.collection('movimientos_inventario').add({
    date: Timestamp.now(),
    local_id: 'rkbEgvwP67JliXQ1Qeyj', // Suc. Sombrerete
    product_id: targetProduct.id,
    presentation_id: targetProduct.presentation_id || 'default',
    from: currentStock,
    to: newStock,
    cause: auditMotivo,
    staff_id: caller.auditUserId,
    staff_name: caller.operatorName,
    local_name: 'Suc. Sombrerete',
    concepto: `Ingreso de mercancía por ${caller.assistantName}`,
    comment: `${unitsToAdd} unidad(es) ingresada(s) al inventario a solicitud de ${caller.operatorName}`,
    product_name: targetProduct.nombre,
  });

  // Si había recordatorios pendientes sobre ingresar este producto, completarlos automáticamente
  try {
    const recSnap = await db
      .collection('gerencia_recordatorios')
      .where('completado', '==', false)
      .limit(30)
      .get();

    const normTarget = normalizeSearchText(targetProduct.nombre);
    for (const recDoc of recSnap.docs) {
      const recData = recDoc.data();
      const normTitle = normalizeSearchText(recData.titulo || '');
      if (
        (normTarget.includes('cera') && normTitle.includes('cera')) ||
        normTitle.includes(normTarget)
      ) {
        await recDoc.ref.set(
          {
            completado: true,
            completado_en: FieldValue.serverTimestamp(),
            completado_por: caller.creatorDisplay,
          },
          { merge: true }
        );
      }
    }
  } catch (errRec: any) {
    console.warn('Aviso completando recordatorio de inventario:', errRec?.message);
  }

  return {
    ok: true,
    mensaje: `Se ingresaron exitosamente ${unitsToAdd} unidades de "${targetProduct.nombre}" al inventario oficial. El stock anterior era de ${currentStock} unidades y ahora el nuevo stock total es de ${newStock} unidades.`,
    producto: {
      id: targetProduct.id,
      nombre: targetProduct.nombre,
      stockAnterior: currentStock,
      unidadesIngresadas: unitsToAdd,
      nuevoStockTotal: newStock,
    },
  };
}

export const ingresarStockInventarioTool = ai.defineTool(
  {
    name: 'ingresar_stock_inventario',
    description:
      'Ingresa, suma o ajusta unidades de productos o insumos directamente al inventario oficial en el sistema (ej. "ingresar 14 ceras", "llegaron 10 pomadas", "agrega 5 ceras al stock"). Actualiza el stock real en Firestore y registra el movimiento de inventario para auditoría.',
    inputSchema: z.object({
      nombreProducto: z
        .string()
        .describe('Nombre o término de búsqueda del producto (ej. "cera", "cera para peinar", "shampoo", "after shave").'),
      cantidad: z
        .number()
        .int()
        .positive()
        .describe('Cantidad positiva de unidades a ingresar o sumar al inventario (ej. 14).'),
      motivo: z
        .string()
        .optional()
        .describe('Motivo u observación del ingreso (ej. "Ingreso de mercancía por Bety", "Resurtido de proveedor").'),
      productoIdExacto: z
        .string()
        .optional()
        .describe('ID exacto del documento de producto en Firestore si ya se conoce.'),
    }),
  },
  async ({ nombreProducto, cantidad, motivo, productoIdExacto }) => {
    const caller = getCallerInfo();
    const db = getDb();
    return await ejecutarIngresoStockInventario({
      nombreProducto,
      cantidad,
      motivo,
      productoIdExacto,
      caller,
      db,
    });
  }
);

export const consultarYGestionarInventarioInsumosTool = ai.defineTool(
  {
    name: 'consultar_y_gestionar_inventario_insumos',
    description:
      'Revisa el stock actual de productos para detectar faltantes, ingresa productos al stock del sistema cuando llegan unidades (ej. 14 ceras), muestra los recordatorios pendientes y permite crear o completar recordatorios.',
    inputSchema: z.object({
      accion: z
        .enum(['consultar', 'ingresar_stock', 'crear_recordatorio', 'completar_recordatorio'])
        .describe('Acción a realizar sobre el inventario y recordatorios de sucursal.'),
      nombreProducto: z
        .string()
        .optional()
        .describe('Nombre del producto o insumo al ingresar stock (ej. "cera", "cera para peinar").'),
      cantidadStock: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Cantidad de unidades a ingresar al stock (ej. 14).'),
      motivoIngreso: z
        .string()
        .optional()
        .describe('Motivo u observación del ingreso al inventario.'),
      categoriaRecordatorio: z
        .enum(['inventario', 'insumos', 'equipo', 'operacion_general'])
        .optional()
        .describe('Categoría cuando se crea un nuevo recordatorio.'),
      tituloRecordatorio: z
        .string()
        .optional()
        .describe('Título del recordatorio o insumo por comprar (ej. "Comprar cajas de navajas y papel cuello").'),
      detalleRecordatorio: z
        .string()
        .optional()
        .describe('Detalle o fecha sugerida para el recordatorio.'),
      recordatorioIdACompletar: z
        .string()
        .optional()
        .describe('ID del recordatorio si se desea marcar como completado.'),
    }),
  },
  async ({
    accion,
    nombreProducto,
    cantidadStock,
    motivoIngreso,
    categoriaRecordatorio,
    tituloRecordatorio,
    detalleRecordatorio,
    recordatorioIdACompletar,
  }) => {
    const caller = getCallerInfo();
    const db = getDb();

    if (accion === 'ingresar_stock' && nombreProducto) {
      return await ejecutarIngresoStockInventario({
        nombreProducto,
        cantidad: cantidadStock || 1,
        motivo: motivoIngreso,
        caller,
        db,
      });
    }

    if (accion === 'crear_recordatorio' && tituloRecordatorio) {
      const ref = await db.collection('gerencia_recordatorios').add({
        categoria: categoriaRecordatorio || 'insumos',
        prioridad: 'normal',
        titulo: tituloRecordatorio.trim(),
        detalle: (detalleRecordatorio || 'Recordatorio operativo de sucursal').trim(),
        origen: caller.creatorDisplay,
        completado: false,
        creado_en: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        recordatorioId: ref.id,
        mensaje: `Recordatorio guardado: "${tituloRecordatorio}". Te lo mantendré visible en tu lista de pendientes de sucursal.`,
      };
    }

    if (accion === 'completar_recordatorio' && recordatorioIdACompletar) {
      await db.collection('gerencia_recordatorios').doc(recordatorioIdACompletar).set(
        {
          completado: true,
          completado_en: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        ok: true,
        mensaje: 'Recordatorio marcado como completado.',
      };
    }

    const [prodSnap, recSnap] = await Promise.all([
      db.collection('productos').get(),
      db.collection('gerencia_recordatorios').limit(30).get(),
    ]);

    const productosAgotados: any[] = [];
    const productosStockBajo: any[] = [];
    const catalogoActivo: any[] = [];

    prodSnap.forEach((doc) => {
      const p = doc.data();
      if (p.active === false) return;
      const stock = Number(p.stock ?? 0);
      const min = Number(p.stock_alarm_threshold ?? 3);
      const item = {
        id: doc.id,
        nombre: p.nombre || 'Producto',
        stockActual: stock,
        minimoAlerta: min,
        precioPublico: round2(Number(p.public_price || 0)),
      };
      catalogoActivo.push(item);
      if (stock <= 0) productosAgotados.push(item);
      else if (stock <= min) productosStockBajo.push(item);
    });

    const recordatoriosPendientes = recSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((r) => !r.completado)
      .map((r) => ({
        id: r.id,
        categoria: r.categoria || 'operacion_general',
        prioridad: r.prioridad || 'normal',
        titulo: r.titulo || '',
        detalle: r.detalle || '',
        origen: r.origen || 'Sucursal',
      }));

    return {
      resumenInventario: {
        totalProductosActivos: catalogoActivo.length,
        productosAgotadosCount: productosAgotados.length,
        productosStockBajoCount: productosStockBajo.length,
      },
      productosAgotados,
      productosStockBajo,
      catalogoCompletoParaConteo: catalogoActivo,
      recordatoriosPendientesSucursal: recordatoriosPendientes,
    };
  }
);

// ============================================================================
// 7. CONSULTAR ARQUEO Y DINERO EN CAJA EN VIVO (SOLO LECTURA SEGURA)
// ============================================================================
export const consultarArqueoCajaSucursalTool = ai.defineTool(
  {
    name: 'consultar_arqueo_caja_sucursal',
    description:
      'Consulta el estado del dinero en caja en vivo de la sucursal (cálculo de arqueo exacto entre fondo inicial, cobros en efectivo e ingresos/egresos menores de caja chica). Esta herramienta es ESTRICTAMENTE DE LECTURA y CÁLCULO INFORMATIVO: NO altera, NO modifica y NO agrega transacciones de dinero. Úsala cuando pregunten cuánto efectivo debe haber en el cajón en este momento, cuánto se ha cobrado en tarjeta/transferencia en el turno, o para verificar el arqueo de caja.',
    inputSchema: z.object({
      localId: z
        .string()
        .optional()
        .describe('ID opcional del local. Por defecto consulta Suc. Sombrerete.'),
    }),
  },
  async ({ localId }) => {
    const db = getDb();
    const targetLocalId = localId || 'rkbEgvwP67JliXQ1Qeyj'; // Suc. Sombrerete

    // 1. Obtener último corte de caja
    const cutsSnap = await db
      .collection('cortes_caja')
      .where('local_id', '==', targetLocalId)
      .orderBy('fecha_corte', 'desc')
      .limit(1)
      .get();

    let liveStartDate: Date;
    let baseCash = 0;
    let fechaUltimoCorteStr = 'Inicio del día (sin corte previo registrado hoy)';

    if (!cutsSnap.empty) {
      const lastCut = cutsSnap.docs[0].data();
      liveStartDate = lastCut.fecha_corte?.toDate ? lastCut.fecha_corte.toDate() : new Date();
      fechaUltimoCorteStr = liveStartDate.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
      if (lastCut.total_sistema !== undefined) {
        baseCash = Number(lastCut.total_sistema);
      } else if (lastCut.total_calculado !== undefined && Number(lastCut.monto_entregado) < 0) {
        baseCash = Number(lastCut.total_calculado);
      } else {
        baseCash = Number(lastCut.fondo_base || 0);
      }
    } else {
      const { todayIso } = getMexicoDateInfo();
      liveStartDate = new Date(`${todayIso}T00:00:00.000-06:00`);
    }

    // 2. Traer transacciones desde el inicio del día del corte
    const dayStart = new Date(liveStartDate);
    dayStart.setHours(0, 0, 0, 0);

    const [salesSnap, ingresosSnap, egresosSnap] = await Promise.all([
      db
        .collection('ventas')
        .where('local_id', '==', targetLocalId)
        .where('fecha_hora_venta', '>=', Timestamp.fromDate(dayStart))
        .get(),
      db
        .collection('ingresos_manuales')
        .where('local_id', '==', targetLocalId)
        .where('fecha', '>=', Timestamp.fromDate(dayStart))
        .get(),
      db
        .collection('egresos')
        .where('local_id', '==', targetLocalId)
        .where('fecha', '>=', Timestamp.fromDate(dayStart))
        .get(),
    ]);

    const isAfterCut = (dateVal: any) => {
      if (!dateVal) return false;
      const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
      return d > liveStartDate;
    };

    let salesCash = 0;
    let salesTarjeta = 0;
    let salesTransferencia = 0;
    let salesAlfaCoins = 0;
    let propinasTotal = 0;
    let totalVentasCount = 0;

    salesSnap.forEach((doc) => {
      const s = doc.data();
      if (s.estado_venta === 'cancelada') return;
      if (!isAfterCut(s.fecha_hora_venta)) return;

      totalVentasCount++;
      const metodo = (s.metodo_pago || '').toLowerCase();
      const totalVenta = Number(s.total || 0);

      const priorDeposit =
        s.deposit_paid_at && !isAfterCut(s.deposit_paid_at)
          ? Number(s.anticipoPagado || s.monto_anticipo || 0)
          : 0;

      if (metodo === 'efectivo') {
        const amount =
          s.monto_pagado_real !== undefined && s.monto_pagado_real < totalVenta
            ? Number(s.monto_pagado_real)
            : Math.max(0, totalVenta - priorDeposit);
        salesCash += amount;
      } else if (metodo === 'combinado') {
        const combCash = Number(s.detalle_pago_combinado?.efectivo || 0);
        salesCash += Math.max(0, combCash - priorDeposit);
        salesTarjeta += Number(s.detalle_pago_combinado?.tarjeta || s.detalle_pago_combinado?.terminal || 0);
        salesTransferencia += Number(s.detalle_pago_combinado?.transferencia || 0);
      } else if (
        metodo.includes('tarjeta') ||
        metodo.includes('terminal') ||
        metodo.includes('mercadopago') ||
        metodo.includes('point')
      ) {
        salesTarjeta += totalVenta;
      } else if (metodo.includes('transferencia')) {
        salesTransferencia += totalVenta;
      } else if (metodo.includes('alfa') || metodo.includes('coin')) {
        salesAlfaCoins += totalVenta;
      }

      if (s.propina) {
        propinasTotal += Number(s.propina || 0);
      }
    });

    let ingresosCash = 0;
    ingresosSnap.forEach((doc) => {
      const i = doc.data();
      if (isAfterCut(i.fecha)) {
        ingresosCash += Number(i.monto || 0);
      }
    });

    let egresosCash = 0;
    const egresosDetalle: Array<{ concepto: string; monto: number }> = [];
    const financeConcepts = ['pago de renta', 'insumos', 'publicidad', 'internet', 'costos fijos', 'nómina', 'nomina'];

    egresosSnap.forEach((doc) => {
      const e = doc.data();
      if (!isAfterCut(e.fecha)) return;
      if (e.source === 'finanzas') return;
      const conceptoLower = (e.concepto || '').toLowerCase();
      if (financeConcepts.some((fc) => conceptoLower.includes(fc))) return;

      const m = Number(e.monto || 0);
      egresosCash += m;
      egresosDetalle.push({
        concepto: e.concepto || 'Egreso de caja chica',
        monto: m,
      });
    });

    const efectivoTeoricoEnCaja = round2(baseCash + salesCash + ingresosCash - egresosCash);

    return {
      ok: true,
      informativoSoloLectura: true,
      seguridadDatosDinero: 'Esta herramienta no modifica ni crea movimientos financieros.',
      fechaUltimoCorte: fechaUltimoCorteStr,
      arqueoEnVivo: {
        fondoBaseInicial: round2(baseCash),
        ventasEfectivoCobrado: round2(salesCash),
        ingresosManualesCaja: round2(ingresosCash),
        egresosCajaChica: round2(egresosCash),
        efectivoTeoricoEnCajon: efectivoTeoricoEnCaja,
      },
      otrosMetodosCobro: {
        ventasTarjetaTerminal: round2(salesTarjeta),
        ventasTransferencia: round2(salesTransferencia),
        ventasAlfaCoins: round2(salesAlfaCoins),
      },
      propinasRegistradas: round2(propinasTotal),
      totalVentasRealizadas: totalVentasCount,
      egresosDetallados: egresosDetalle,
      mensaje: `Arqueo en vivo de caja: El efectivo que debe haber físicamente en el cajón es de **$${efectivoTeoricoEnCaja.toFixed(
        2
      )} MXN** (Fondo inicial: $${baseCash.toFixed(2)} + Efectivo cobrado: $${salesCash.toFixed(
        2
      )} + Ingresos manuales: $${ingresosCash.toFixed(2)} - Gastos menores: $${egresosCash.toFixed(
        2
      )}). Además se cobraron $${salesTarjeta.toFixed(2)} en tarjeta/terminal y $${salesTransferencia.toFixed(
        2
      )} en transferencias.`,
    };
  }
);

// ============================================================================
// 8. REGISTRAR SALIDA DE INSUMOS POR USO INTERNO EN CABINA O MERMA
// ============================================================================
export const registrarSalidaInsumoCabinaTool = ai.defineTool(
  {
    name: 'registrar_salida_insumo_cabina',
    description:
      'Registra la salida física de productos o insumos del inventario para uso diario en cabina de los barberos (ej. ceras, geles, talcos, navajas entregadas a una estación) o por merma/producto dañado. Descuenta el stock y registra el movimiento oficial en la bitácora de inventario.',
    inputSchema: z.object({
      nombreProducto: z
        .string()
        .describe('Nombre del producto o insumo (ej. "Cera para peinar", "Talco", "Aftershave").'),
      cantidad: z.number().int().positive().describe('Cantidad de unidades a descontar (ej. 1, 2).'),
      tipoSalida: z
        .enum(['uso_interno_cabina', 'merma_o_danado'])
        .describe('Tipo de salida: "uso_interno_cabina" o "merma_o_danado".'),
      destinatarioOArea: z
        .string()
        .optional()
        .describe('Barbero o área a la que se destina el insumo (ej. "Alfredo", "Lalo", "Cabina 1", "Recepción").'),
      motivo: z
        .string()
        .optional()
        .describe('Detalle opcional (ej. "Para uso en estación de Alfredo", "Bote quebrado al desempacar").'),
    }),
  },
  async ({ nombreProducto, cantidad, tipoSalida, destinatarioOArea, motivo }) => {
    const caller = getCallerInfo();
    const saludoOperador = caller.operatorName.includes('Alejandro') ? 'Alejandro' : 'Bety';
    const db = getDb();

    const prodSnap = await db.collection('productos').get();
    const productos: any[] = [];
    prodSnap.forEach((doc) => {
      const data = doc.data();
      if (data.active !== false) {
        productos.push({ id: doc.id, ...data });
      }
    });

    const targetProduct = findMatchingCatalogProduct(nombreProducto, productos);

    if (!targetProduct) {
      return {
        ok: false,
        mensaje: `No encontré en el catálogo ningún producto que coincida con "${nombreProducto}".`,
        productosDisponibles: productos.map((p) => p.nombre),
      };
    }

    const currentStock = Number(targetProduct.stock ?? 0);
    const unitsToSub = Math.max(1, Math.round(Number(cantidad) || 1));

    if (currentStock < unitsToSub) {
      return {
        ok: false,
        stockInsuficiente: true,
        mensaje: `No hay suficiente stock para descontar ${unitsToSub} unidad(es) de "${targetProduct.nombre}". Actualmente solo hay ${currentStock} unidad(es) en existencia.`,
      };
    }

    const newStock = currentStock - unitsToSub;

    // Actualizar stock oficial en el producto
    await db.collection('productos').doc(targetProduct.id).update({
      stock: newStock,
      updated_at: FieldValue.serverTimestamp(),
    });

    const conceptoTexto =
      tipoSalida === 'uso_interno_cabina' ? 'Uso interno en cabina' : 'Merma de producto';
    const causaTexto =
      motivo?.trim() ||
      (tipoSalida === 'uso_interno_cabina'
        ? `Uso interno para ${destinatarioOArea || 'cabina de barbería'}`
        : 'Producto dañado o merma');

    // Registrar en movimientos_inventario para trazabilidad oficial
    const movRef = await db.collection('movimientos_inventario').add({
      date: Timestamp.now(),
      local_id: 'rkbEgvwP67JliXQ1Qeyj', // Suc. Sombrerete
      product_id: targetProduct.id,
      presentation_id: targetProduct.presentation_id || 'default',
      from: currentStock,
      to: newStock,
      cause: causaTexto,
      staff_id: caller.auditUserId,
      staff_name: caller.operatorName,
      local_name: 'Suc. Sombrerete',
      concepto: conceptoTexto,
      comment: `${unitsToSub} unidad(es) descontada(s) por ${conceptoTexto.toLowerCase()}${
        destinatarioOArea ? ` para ${destinatarioOArea}` : ''
      } a solicitud de ${caller.operatorName}`,
      product_name: targetProduct.nombre,
    });

    // Auditoría
    await db.collection('audit_logs').add({
      action: `Salida Insumo (${caller.assistantName})`,
      details: `${unitsToSub} unidad(es) de "${targetProduct.nombre}" descontadas del stock (${currentStock} -> ${newStock}) por ${conceptoTexto}. Motivo: ${causaTexto}`,
      userId: caller.auditUserId,
      userName: `${caller.creatorDisplay} (${caller.auditUserRole})`,
      userRole: caller.auditUserRole,
      severity: 'info',
      entityId: movRef.id,
      localId: 'rkbEgvwP67JliXQ1Qeyj',
      timestamp: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      producto: targetProduct.nombre,
      unidadesDescontadas: unitsToSub,
      stockAnterior: currentStock,
      nuevoStock: newStock,
      tipoSalida: conceptoTexto,
      mensaje: `Listo ${saludoOperador}: se registraron **${unitsToSub} unidad(es)** de **${targetProduct.nombre}** como salida por **${conceptoTexto}**${
        destinatarioOArea ? ` para **${destinatarioOArea}**` : ''
      }. El stock disponible pasó de ${currentStock} a **${newStock} unidad(es)** y quedó registrado en el historial oficial de movimientos de stock.`,
    };
  }
);

// ============================================================================
// 9. CONSULTAR RENDIMIENTO, COMISIONES Y PROPINAS DE BARBEROS (SOLO LECTURA)
// ============================================================================
export const consultarRendimientoBarberoSucursalTool = ai.defineTool(
  {
    name: 'consultar_rendimiento_barbero_sucursal',
    description:
      'Consulta informativa del rendimiento, servicios realizados, comisiones ganadas y propinas de los barberos en un día, semana o período. Esta herramienta es ESTRICTAMENTE DE LECTURA y CÁLCULO INFORMATIVO: NO modifica comisiones, NO genera pagos y NO altera finanzas. Úsala cuando pregunten cuántos cortes lleva un barbero, cuánto lleva de comisión o cuánto le toca de propinas.',
    inputSchema: z.object({
      nombreBarbero: z
        .string()
        .optional()
        .describe('Nombre o apodo del barbero (ej. "Lalo", "Alfredo", "Lupita", "Ivon", "Beatriz", o "todos").'),
      periodo: z
        .enum(['hoy', 'semana_actual', 'mes_actual', 'fecha_especifica'])
        .optional()
        .describe('Período a consultar. Por defecto "hoy".'),
      fecha: z
        .string()
        .optional()
        .describe('Fecha en formato YYYY-MM-DD si el período es "fecha_especifica" o "hoy".'),
    }),
  },
  async ({ nombreBarbero, periodo = 'hoy', fecha }) => {
    const db = getDb();
    const { todayIso } = getMexicoDateInfo();
    const targetDateStr = (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha.trim())) ? fecha.trim() : todayIso;

    let startDate: Date;
    let endDate: Date;
    const baseDate = parseISO(targetDateStr);

    if (periodo === 'semana_actual') {
      startDate = startOfWeek(baseDate, { weekStartsOn: 1 });
      endDate = endOfWeek(baseDate, { weekStartsOn: 1 });
    } else if (periodo === 'mes_actual') {
      startDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
      endDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0, 23, 59, 59, 999);
    } else {
      // hoy o fecha_especifica
      startDate = startOfDay(baseDate);
      endDate = endOfDay(baseDate);
    }

    // 1. Cargar barberos activos
    const [profSnap, servSnap, prodSnap, salesSnap] = await Promise.all([
      db.collection('profesionales').get(),
      db.collection('servicios').get(),
      db.collection('productos').get(),
      db
        .collection('ventas')
        .where('fecha_hora_venta', '>=', Timestamp.fromDate(startDate))
        .where('fecha_hora_venta', '<=', Timestamp.fromDate(endDate))
        .get(),
    ]);

    const activeProfessionals: any[] = [];
    const profMap = new Map<string, any>();
    profSnap.forEach((doc) => {
      const p = doc.data();
      if (!p.deleted) {
        const item = { id: doc.id, ...p, displayName: p.publicName || p.name || 'Barbero' };
        profMap.set(doc.id, item);
        if (p.active !== false) activeProfessionals.push(item);
      }
    });

    const servMap = new Map<string, any>();
    servSnap.forEach((doc) => servMap.set(doc.id, { id: doc.id, ...doc.data() }));

    const prodMap = new Map<string, any>();
    prodSnap.forEach((doc) => prodMap.set(doc.id, { id: doc.id, ...doc.data() }));

    // Determinar profesional objetivo o todos
    const isAll = !nombreBarbero || nombreBarbero.toLowerCase() === 'todos';
    let targetProfId: string | null = null;
    let targetProfName = 'Todos los barberos';

    if (!isAll) {
      const found = findBarber(nombreBarbero, activeProfessionals);
      if (found) {
        targetProfId = found.id;
        targetProfName = found.displayName || found.name;
      }
    }

    // Agrupación por barbero
    const statsByBarber = new Map<
      string,
      {
        id: string;
        nombre: string;
        serviciosRealizados: number;
        productosVendidos: number;
        ventasServiciosTotal: number;
        ventasProductosTotal: number;
        comisionServicios: number;
        comisionProductos: number;
        propinasTotal: number;
        propinasEfectivo: number;
        propinasTarjeta: number;
      }
    >();

    const getOrInitStats = (profId: string) => {
      if (!statsByBarber.has(profId)) {
        const pInfo = profMap.get(profId);
        statsByBarber.set(profId, {
          id: profId,
          nombre: pInfo?.displayName || pInfo?.name || 'Barbero',
          serviciosRealizados: 0,
          productosVendidos: 0,
          ventasServiciosTotal: 0,
          ventasProductosTotal: 0,
          comisionServicios: 0,
          comisionProductos: 0,
          propinasTotal: 0,
          propinasEfectivo: 0,
          propinasTarjeta: 0,
        });
      }
      return statsByBarber.get(profId)!;
    };

    salesSnap.forEach((doc) => {
      const s = doc.data();
      if (s.estado_venta === 'cancelada') return;

      const items = Array.isArray(s.items) ? s.items : [];
      const primaryBarberId = s.barbero_id || items[0]?.barbero_id;

      items.forEach((item: any) => {
        const itemBarberId = item.barbero_id || primaryBarberId;
        if (!itemBarberId) return;
        if (targetProfId && itemBarberId !== targetProfId) return;

        const profObj = profMap.get(itemBarberId);
        if (!profObj) return;

        const stats = getOrInitStats(itemBarberId);
        const itemPrice = Number(item.subtotal || item.precio || 0);
        const itemDiscount = Number(item.descuento?.monto || 0);
        const realAmount = Math.max(0, itemPrice - itemDiscount);

        if (item.tipo === 'producto') {
          stats.productosVendidos += Number(item.cantidad || 1);
          stats.ventasProductosTotal += realAmount;
          const productCfg = prodMap.get(item.id);
          const commCfg =
            profObj.comisionesPorProducto?.[item.id] ||
            productCfg?.commission ||
            profObj.defaultCommission || { type: '%', value: 10 };
          const commVal =
            commCfg.type === '%' ? realAmount * (Number(commCfg.value) / 100) : Number(commCfg.value || 0);
          stats.comisionProductos += commVal;
        } else {
          // Servicio
          stats.serviciosRealizados += 1;
          stats.ventasServiciosTotal += realAmount;
          const servCfg = servMap.get(item.id);
          const commCfg =
            profObj.comisionesPorServicio?.[item.id] ||
            servCfg?.defaultCommission ||
            profObj.defaultCommission || { type: '%', value: 50 };
          const commVal =
            commCfg.type === '%' ? realAmount * (Number(commCfg.value) / 100) : Number(commCfg.value || 0);
          stats.comisionServicios += commVal;
        }
      });

      // Propinas
      const tipAmount = Number(s.propina || 0);
      if (tipAmount > 0) {
        const sellers = Array.from(new Set(items.map((i: any) => i.barbero_id).filter(Boolean)));
        const relevantSellers = sellers.filter((id) => profMap.has(id as string)) as string[];
        const splitCount = relevantSellers.length > 0 ? relevantSellers.length : 1;
        const tipPerBarber = tipAmount / splitCount;

        relevantSellers.forEach((sId) => {
          if (targetProfId && sId !== targetProfId) return;
          const stats = getOrInitStats(sId);
          stats.propinasTotal += tipPerBarber;
          const metodo = (s.metodo_pago || '').toLowerCase();
          if (metodo === 'efectivo') {
            stats.propinasEfectivo += tipPerBarber;
          } else {
            stats.propinasTarjeta += tipPerBarber;
          }
        });
      }
    });

    const resultados = Array.from(statsByBarber.values()).map((st) => {
      const comisionTotal = round2(st.comisionServicios + st.comisionProductos);
      const totalVenta = round2(st.ventasServiciosTotal + st.ventasProductosTotal);
      return {
        barberoId: st.id,
        nombreBarbero: st.nombre,
        serviciosRealizados: st.serviciosRealizados,
        productosVendidos: st.productosVendidos,
        ventasServiciosTotal: round2(st.ventasServiciosTotal),
        ventasProductosTotal: round2(st.ventasProductosTotal),
        ventaTotalGenerada: totalVenta,
        comisionServicios: round2(st.comisionServicios),
        comisionProductos: round2(st.comisionProductos),
        comisionTotalEstimada: comisionTotal,
        propinasTotal: round2(st.propinasTotal),
        propinasEfectivo: round2(st.propinasEfectivo),
        propinasTarjetaTerminal: round2(st.propinasTarjeta),
      };
    });

    const periodoDesc =
      periodo === 'semana_actual'
        ? `semana del ${format(startDate, 'dd/MM/yyyy')} al ${format(endDate, 'dd/MM/yyyy')}`
        : periodo === 'mes_actual'
        ? `mes de ${format(startDate, 'MMMM yyyy', { locale: es })}`
        : `día ${targetDateStr}`;

    return {
      ok: true,
      informativoSoloLectura: true,
      seguridadDatosDinero: 'Esta herramienta no modifica comisiones ni transacciones financieras.',
      periodoConsultado: periodoDesc,
      barberoConsultado: targetProfName,
      totalBarberosConActividad: resultados.length,
      resumenPorBarbero: resultados,
      mensaje: `Rendimiento de ${targetProfName} (${periodoDesc}): ${resultados
        .map(
          (r) =>
            `**${r.nombreBarbero}**: ${r.serviciosRealizados} servicio(s), $${r.ventaTotalGenerada.toFixed(
              2
            )} en ventas, comisión estimada: **$${r.comisionTotalEstimada.toFixed(
              2
            )}** (Servicios: $${r.comisionServicios.toFixed(2)}, Productos: $${r.comisionProductos.toFixed(
              2
            )}) y propinas acumuladas: **$${r.propinasTotal.toFixed(2)}** (Tarjeta: $${r.propinasTarjetaTerminal.toFixed(
              2
            )}, Efectivo: $${r.propinasEfectivo.toFixed(2)}).`
        )
        .join('\n')}`,
    };
  }
);

// ============================================================================
// 10. CONSULTAR PERFIL 360 DEL CLIENTE Y FIDELIZACIÓN (SOLO LECTURA)
// ============================================================================
export const consultarPerfilCliente360Tool = ai.defineTool(
  {
    name: 'consultar_perfil_cliente_360',
    description:
      'Consulta la ficha completa 360 de un cliente: datos de contacto, saldo de ALFAcoins, estatus de Pase ALFA Club, cortes acumulados para la décima por la casa o regalo de cumpleaños, notas de preferencias de corte/estilo e historial de visitas. Herramienta 100% DE LECTURA.',
    inputSchema: z.object({
      terminoBusqueda: z
        .string()
        .describe('Nombre, apellido, número de teléfono o número de cliente a buscar (ej. "David Luna", "4423955988", "311").'),
    }),
  },
  async ({ terminoBusqueda }) => {
    const db = getDb();
    const queryTerm = terminoBusqueda.trim().toLowerCase();
    const cleanPhoneDigits = terminoBusqueda.replace(/\D/g, '');

    const clientSnap = await db.collection('clientes').get();
    const matches: any[] = [];

    clientSnap.forEach((doc) => {
      const data = doc.data();
      const fullName = `${data.nombre || ''} ${data.apellido || ''}`.trim().toLowerCase();
      const phoneDigits = String(data.telefono || '').replace(/\D/g, '');
      const numCliente = String(data.numero_cliente || '').toLowerCase();

      const isMatch =
        fullName.includes(queryTerm) ||
        (cleanPhoneDigits.length >= 7 && phoneDigits.includes(cleanPhoneDigits)) ||
        (queryTerm.length >= 2 && numCliente === queryTerm);

      if (isMatch) {
        matches.push({ id: doc.id, ...data });
      }
    });

    if (matches.length === 0) {
      return {
        ok: false,
        mensaje: `No encontré ningún cliente que coincida con "${terminoBusqueda}".`,
      };
    }

    if (matches.length > 1) {
      return {
        ok: true,
        coincidenciasMultiples: true,
        totalEncontrados: matches.length,
        clientes: matches.slice(0, 5).map((c) => ({
          id: c.id,
          nombreCompleto: `${c.nombre || ''} ${c.apellido || ''}`.trim(),
          telefono: c.telefono || 'Sin teléfono',
          numeroCliente: c.numero_cliente || '',
        })),
        mensaje: `Encontré ${matches.length} clientes con ese nombre. ¿Podrías confirmarme el teléfono o número de cliente para mostrarte el expediente exacto?`,
      };
    }

    const c = matches[0];
    const clientFullName = `${c.nombre || ''} ${c.apellido || ''}`.trim();

    // Consultar últimas 3 reservas del cliente para historial reciente
    let ultimasCitas: Array<{ fecha: string; horario: string; barbero: string; servicio: string; estado: string }> = [];
    try {
      const resSnap = await db
        .collection('reservas')
        .where('cliente_id', '==', c.id)
        .orderBy('fecha', 'desc')
        .limit(3)
        .get();

      ultimasCitas = resSnap.docs.map((d) => {
        const r = d.data();
        return {
          fecha: r.fecha || '',
          horario: `${r.hora_inicio || ''} - ${r.hora_fin || ''}`,
          barbero: r.professionalNames || 'Barbero',
          servicio: r.servicio || 'Corte de cabello',
          estado: r.estado || 'Reservado',
        };
      });
    } catch {
      // Fallback si no hay índice
    }

    const alfaCoins = Number(c.alfaCoins ?? c.alfa_coins ?? 0);
    const cortesAcumulados = Number(c.cortes_acumulados ?? c.cortesAcumulados ?? 0);
    const tieneCorteGratis = Boolean(c.corte_gratis_disponible ?? c.corteGratisDisponible ?? cortesAcumulados >= 10);
    const nivelMembresia = c.nivel || (c.appVinculada ? 'Pase ALFA Club' : 'Cliente Regular');

    return {
      ok: true,
      informativoSoloLectura: true,
      cliente: {
        id: c.id,
        nombreCompleto: clientFullName,
        telefono: c.telefono || 'Sin teléfono',
        correo: c.correo || 'Sin correo',
        numeroCliente: c.numero_cliente || 'N/A',
        programaLealtad: {
          nivel: nivelMembresia,
          alfaCoinsDisponibles: alfaCoins,
          cortesAcumuladosParaDecima: cortesAcumulados,
          tieneCorteGratisDisponible: tieneCorteGratis,
        },
        estadisticasVisitas: {
          citasTotales: Number(c.citas_totales || ultimasCitas.length),
          citasAsistidas: Number(c.citas_asistidas || 0),
          citasCanceladas: Number(c.citas_canceladas || 0),
        },
        notasPreferenciaCorte: c.notas || 'Sin notas registradas en perfil',
        ultimasVisitas: ultimasCitas,
      },
      mensaje: `Ficha 360 de **${clientFullName}** (${c.telefono || 'Sin tel'}): Nivel: **${nivelMembresia}**, Saldo ALFAcoins: **${alfaCoins} ALFAcoins**, Sellos/cortes acumulados: **${cortesAcumulados} de 10** (${
        tieneCorteGratis ? '🎉 ¡Corte gratis disponible!' : 'le faltan ' + Math.max(0, 10 - cortesAcumulados) + ' para el corte de cortesía'
      }). Notas de corte: "${c.notas || 'Sin notas registradas'}".`,
    };
  }
);

// ============================================================================
// 11. ACTUALIZAR NOTAS Y PREFERENCIAS DEL CLIENTE
// ============================================================================
export const actualizarNotasClienteTool = ai.defineTool(
  {
    name: 'actualizar_notas_cliente',
    description:
      'Agrega o actualiza notas internas en el expediente del cliente (preferencias de corte, estilo, alergias al talco, trato preferido, etc.). NO toca dinero, NO toca membresías, únicamente preferencias de atención.',
    inputSchema: z.object({
      terminoBusqueda: z
        .string()
        .describe('Nombre o teléfono del cliente (ej. "David Luna" o "4423955988").'),
      nuevaNota: z
        .string()
        .describe('Preferencia o nota que se desea anotar (ej. "Prefiere corte con tijera arriba, fade 0.5 y sin talco").'),
      modo: z
        .enum(['agregar', 'reemplazar'])
        .optional()
        .describe('Modo de actualización: "agregar" (concatena a lo ya existente) o "reemplazar". Por defecto "agregar".'),
    }),
  },
  async ({ terminoBusqueda, nuevaNota, modo = 'agregar' }) => {
    const caller = getCallerInfo();
    const saludoOperador = caller.operatorName.includes('Alejandro') ? 'Alejandro' : 'Bety';
    const db = getDb();
    const queryTerm = terminoBusqueda.trim().toLowerCase();
    const cleanPhoneDigits = terminoBusqueda.replace(/\D/g, '');

    const clientSnap = await db.collection('clientes').get();
    const matches: any[] = [];

    clientSnap.forEach((doc) => {
      const data = doc.data();
      const fullName = `${data.nombre || ''} ${data.apellido || ''}`.trim().toLowerCase();
      const phoneDigits = String(data.telefono || '').replace(/\D/g, '');

      const isMatch =
        fullName.includes(queryTerm) ||
        (cleanPhoneDigits.length >= 7 && phoneDigits.includes(cleanPhoneDigits));

      if (isMatch) {
        matches.push({ id: doc.id, ...data });
      }
    });

    if (matches.length === 0) {
      return {
        ok: false,
        mensaje: `No encontré ningún cliente que coincida con "${terminoBusqueda}".`,
      };
    }

    if (matches.length > 1) {
      return {
        ok: false,
        coincidenciasMultiples: true,
        mensaje: `Encontré varios clientes con ese nombre (${matches
          .slice(0, 3)
          .map((c) => `${c.nombre} ${c.apellido} - ${c.telefono}`)
          .join(', ')}). Indícame el teléfono para actualizar al cliente correcto.`,
      };
    }

    const targetDoc = matches[0];
    const clientFullName = `${targetDoc.nombre || ''} ${targetDoc.apellido || ''}`.trim();
    const notasPrevias = (targetDoc.notas || '').trim();

    let notasFinales = nuevaNota.trim();
    if (modo === 'agregar' && notasPrevias) {
      notasFinales = `${notasPrevias} | ${nuevaNota.trim()}`;
    }

    await db.collection('clientes').doc(targetDoc.id).update({
      notas: notasFinales,
      actualizado_en: FieldValue.serverTimestamp(),
    });

    await db.collection('audit_logs').add({
      action: `Actualizar Notas Cliente (${caller.assistantName})`,
      details: `Notas actualizadas para ${clientFullName}: "${nuevaNota.trim()}". Modo: ${modo}`,
      userId: caller.auditUserId,
      userName: `${caller.creatorDisplay} (${caller.auditUserRole})`,
      userRole: caller.auditUserRole,
      severity: 'info',
      entityId: targetDoc.id,
      timestamp: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      cliente: clientFullName,
      notasFinales,
      mensaje: `Listo ${saludoOperador}: quedó registrada la preferencia en el expediente de **${clientFullName}**: "${nuevaNota.trim()}". Ahora el equipo de barbería y recepción la tendrán visible en su perfil de citas.`,
    };
  }
);

// ============================================================================
// 12. CONSULTAR CITAS PENDIENTES DE CONFIRMACIÓN POR WHATSAPP (SOLO LECTURA)
// ============================================================================
export const consultarCitasPendientesConfirmacionWhatsAppTool = ai.defineTool(
  {
    name: 'consultar_citas_pendientes_confirmacion_whatsapp',
    description:
      'Identifica las citas del día (o fecha dada) que aún no han recibido mensaje de confirmación por WhatsApp o App Móvil, generando los enlaces directos de wa.me listos con el texto oficial para que recepción envíe la confirmación con un solo clic. Herramienta 100% DE LECTURA.',
    inputSchema: z.object({
      fecha: z
        .string()
        .optional()
        .describe('Fecha en formato YYYY-MM-DD. Si se omite, consulta las citas de hoy.'),
    }),
  },
  async ({ fecha }) => {
    const db = getDb();
    const { todayIso } = getMexicoDateInfo();
    const targetDate = (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha.trim())) ? fecha.trim() : todayIso;

    const [resSnap, profSnap] = await Promise.all([
      db.collection('reservas').where('fecha', '==', targetDate).get(),
      db.collection('profesionales').get(),
    ]);

    const profMap = new Map<string, string>();
    profSnap.forEach((doc) => {
      const p = doc.data();
      profMap.set(doc.id, p.publicName || p.name || 'Barbero');
    });

    const pendientes: Array<{
      reservaId: string;
      cliente: string;
      telefono: string;
      horario: string;
      barbero: string;
      servicio: string;
      enlaceWhatsApp: string;
      mensajeTexto: string;
    }> = [];

    resSnap.forEach((doc) => {
      const r = doc.data();
      if (
        r.estado === 'Cancelado' ||
        r.estado === 'No asiste' ||
        r.estado === 'Completado' ||
        r.estado === 'Venta completada'
      ) {
        return;
      }

      // Si ya se le envió confirmación WhatsApp o por app
      if (r.whatsappConfirmationSent === true || (r as any).confirmationSentViaApp === true) {
        return;
      }

      const clientName = (
        r.customer?.nombre ||
        r.cliente_nombre ||
        r.client?.nombre ||
        'Cliente'
      ).trim();

      if (!clientName || clientName.toLowerCase() === 'undefined' || clientName.toLowerCase() === 'bloqueo') {
        return;
      }

      const rawPhone = String(r.customer?.telefono || r.telefono || '').replace(/\D/g, '');
      const cleanPhone = rawPhone.length === 10 ? rawPhone : rawPhone.startsWith('52') ? rawPhone.slice(2) : rawPhone;
      const barberoName = profMap.get(r.barbero_id) || r.professionalNames || 'Barbero';
      const servicioName =
        r.servicio ||
        (Array.isArray(r.items) ? r.items.map((i: any) => i.nombre).join(', ') : 'Corte de cabello');
      const horario = `${r.hora_inicio || ''} - ${r.hora_fin || ''}`;

      const textoWhatsApp = `¡Hola *${clientName}*, tu cita en VATOS ALFA Sombrerete está confirmada! 🎉\n\n💈 *Servicio(s):* ${servicioName}\n📅 *Fecha:* ${targetDate}\n⏰ *Hora:* ${r.hora_inicio || ''} hrs\n👤 *Profesional:* ${barberoName}\n📍 *Ubicación:* Suc. Sombrerete (Plaza Ubika)\n\n_Favor de llegar 5 minutos antes de tu cita. Podrás cancelar hasta 2 horas antes._`;

      const linkWa = cleanPhone
        ? `https://wa.me/52${cleanPhone}?text=${encodeURIComponent(textoWhatsApp)}`
        : '';

      pendientes.push({
        reservaId: doc.id,
        cliente: clientName,
        telefono: cleanPhone || 'Sin número registrado',
        horario,
        barbero: barberoName,
        servicio: servicioName,
        enlaceWhatsApp: linkWa,
        mensajeTexto: textoWhatsApp,
      });
    });

    pendientes.sort((a, b) => a.horario.localeCompare(b.horario));

    return {
      ok: true,
      informativoSoloLectura: true,
      fechaConsultada: targetDate,
      totalPendientesConfirmacion: pendientes.length,
      citasPendientes: pendientes,
      mensaje:
        pendientes.length === 0
          ? `¡Excelente! Para la fecha ${targetDate} no hay citas pendientes de confirmación por WhatsApp; todas las citas activas ya fueron confirmadas.`
          : `Hay **${pendientes.length} cita(s) pendiente(s) de confirmación** para el ${targetDate}: ${pendientes
              .map(
                (p) =>
                  `\n• **${p.cliente}** (${p.horario}) con **${p.barbero}** - Tel: ${p.telefono} ${
                    p.enlaceWhatsApp ? `[Abrir WhatsApp](${p.enlaceWhatsApp})` : '(Sin número)'
                  }`
              )
              .join('')}`,
    };
  }
);

export function getGerenciaAgentTools() {
  return [
    consultarOperacionDiaSucursalTool,
    buscarClienteSucursalTool,
    consultarDisponibilidadBarberosSucursalTool,
    agendarCitaSucursalTool,
    reagendarCitaSucursalTool,
    gestionarHorarioBarberoSucursalTool,
    gestionarJornadaEspecialSucursalTool,
    proponerCancelacionOEliminacionSucursalTool,
    consultarYGestionarInventarioInsumosTool,
    ingresarStockInventarioTool,
    consultarArqueoCajaSucursalTool,
    registrarSalidaInsumoCabinaTool,
    consultarRendimientoBarberoSucursalTool,
    consultarPerfilCliente360Tool,
    actualizarNotasClienteTool,
    consultarCitasPendientesConfirmacionWhatsAppTool,
  ];
}
