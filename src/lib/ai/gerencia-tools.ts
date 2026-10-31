import { z } from 'zod';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { ai } from '@/ai/genkit';
import { getDb } from '@/lib/firebase-server';
import { sanitizeExternalUntrustedText } from '@/lib/ai/ceo-security';
import { getMexicoDateInfo } from '@/lib/ai/agent-utils';
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
        tipo: b.type === 'available' ? 'Horario Especial Habilitado' : 'Horario Bloqueado',
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
  query?: string
): Promise<{ id: string; name: string; price: number; duration: number }> {
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
        allServices.find((s) => s.name?.includes('Caballero alfa')) ||
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

  return {
    id: matched?.id || 's56EgUXPyLpZbjCf2Ung',
    name: matched?.name || 'Corte de cabello',
    price: Number(matched?.price ?? 140),
    duration: Number(matched?.duration ?? 40),
  };
}

async function resolveOrCreateClientForGerencia(
  db: any,
  nombreCliente: string,
  telefonoCliente?: string
): Promise<{ id: string; nombre: string; telefono: string; correo: string }> {
  const cleanPhone = (telefonoCliente || '').replace(/\D/g, '');
  let resolvedId = '';
  let resolvedName = nombreCliente.trim();
  let resolvedPhone = cleanPhone;
  let resolvedEmail = '';

  // 1. Buscar por teléfono si tiene 7 o más dígitos
  if (cleanPhone && cleanPhone.length >= 7) {
    const phoneSnap = await db.collection('clientes').where('telefono', '==', cleanPhone).limit(1).get();
    if (!phoneSnap.empty) {
      const cd = phoneSnap.docs[0].data();
      resolvedId = phoneSnap.docs[0].id;
      resolvedName = `${cd.nombre || ''} ${cd.apellido || ''}`.trim() || resolvedName;
      resolvedPhone = cd.telefono || cleanPhone;
      resolvedEmail = cd.correo || cd.email || '';
    }
  }

  // 2. Si no se encontró por teléfono, buscar por nombre
  if (!resolvedId && resolvedName) {
    const nameNorm = normalizeName(resolvedName);
    const cliSnap = await db.collection('clientes').limit(80).get();
    for (const d of cliSnap.docs) {
      const cd = d.data();
      const fullName = normalizeName(`${cd.nombre || ''} ${cd.apellido || ''}`);
      if (fullName === nameNorm || (fullName && fullName.includes(nameNorm)) || (nameNorm && nameNorm.includes(fullName))) {
        resolvedId = d.id;
        resolvedName = `${cd.nombre || ''} ${cd.apellido || ''}`.trim();
        resolvedPhone = cd.telefono || resolvedPhone || '';
        resolvedEmail = cd.correo || cd.email || '';
        break;
      }
    }
  }

  // 3. Si no existe, crear registro en clientes
  if (!resolvedId) {
    const nameParts = resolvedName.split(/\s+/);
    const firstName = nameParts[0] || 'Cliente';
    const lastName = nameParts.slice(1).join(' ') || '';
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
  }

  return {
    id: resolvedId,
    nombre: resolvedName,
    telefono: resolvedPhone,
    correo: resolvedEmail,
  };
}

// ============================================================================
// 2. AGENDAR CITA EN LA AGENDA (FACULTAD COMPLETA DE ADMINISTRADORA LOCAL)
// ============================================================================
export const agendarCitaSucursalTool = ai.defineTool(
  {
    name: 'agendar_cita_sucursal',
    description:
      'Agenda o crea una cita directamente en la cuadrícula de la agenda de VATOS ALFA a solicitud de Beatriz (Administradora del Local). Valida la disponibilidad del barbero, asocia cliente y servicio, y registra la reserva en tiempo real.',
    inputSchema: z.object({
      nombreCliente: z
        .string()
        .describe('Nombre del cliente (ej. "Carlos Morales", "Pedro Gómez", "Juan").'),
      telefonoCliente: z
        .string()
        .optional()
        .describe('Teléfono de contacto del cliente a 10 dígitos (opcional).'),
      barberoNombre: z
        .string()
        .describe('Nombre o apodo del barbero (ej. "Lalo", "Eduardo", "Alfredo", "Ivon", "Lupita", "Beatriz").'),
      fecha: z
        .string()
        .optional()
        .describe('Fecha de la cita en formato YYYY-MM-DD. Si se omite, se usa el día de hoy en Querétaro.'),
      hora: z
        .string()
        .describe('Hora de inicio de la cita (ej. "16:00", "4:00 PM", "11:30").'),
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
        .describe('Si es true, permite agendar sobrecupo o fuera de turno si Beatriz lo autoriza explícitamente.'),
    }),
  },
  async ({
    nombreCliente,
    telefonoCliente,
    barberoNombre,
    fecha,
    hora,
    servicioNombre,
    notas,
    forzarSobrecupo,
  }) => {
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

    // 2. Resolver servicio y duración
    const service = await resolveServiceForGerencia(db, servicioNombre);
    const startMins = timeToMinutes(horaInicio);
    const endMins = startMins + service.duration;
    const horaFin = minutesToTime(endMins);

    // 3. Validar disponibilidad del barbero en la agenda
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

    // 4. Resolver o registrar cliente
    const client = await resolveOrCreateClientForGerencia(db, nombreCliente, telefonoCliente);

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
      servicios: [service.id],
      items: [
        {
          id: service.id,
          nombre: service.name,
          servicio: service.name,
          tipo: 'servicio',
          barbero_id: prof.id,
          precio: service.price,
          duracion: service.duration,
          cantidad: 1,
          professional_lock: true,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
        },
      ],
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
      canal_reserva: 'agenda',
      creada_por: 'Janet Gerencia (Beatriz)',
      creado_en: Timestamp.now(),
      notas: notas || '',
      nota_interna: 'Agendada por Janet Gerencia a petición de Beatriz',
      professional_lock: true,
      isSandbox: false,
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
      action: 'Crear Cita (Janet Gerencia)',
      details: `Cita agendada para ${client.nombre} con ${barberDisplayName} el ${targetDate} de ${horaInicio} a ${horaFin} (${service.name} - $${service.price.toFixed(2)})`,
      userId: 'janet_gerencia',
      userName: 'Janet Gerencia (Asistente de Sucursal)',
      userRole: 'Administrador local',
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
      barbero: barberDisplayName,
      fecha: targetDate,
      horario: `${horaInicio} a ${horaFin}`,
      duracionMinutos: service.duration,
      servicio: service.name,
      precio: service.price,
      mensaje: `¡Listo Bety! La cita quedó agendada con éxito en la agenda:\n\n• **Cliente:** ${client.nombre}${client.telefono ? ` (${client.telefono})` : ''}\n• **Barbero:** ${barberDisplayName}\n• **Fecha:** ${targetDate}\n• **Horario:** ${horaInicio} a ${horaFin} (${service.duration} min)\n• **Servicio:** ${service.name}\n• **Total a liquidar en caja:** $${service.price.toFixed(2)} MXN\n\nYa aparece visible en la cuadrícula de la agenda para todo el equipo.`,
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
    }),
  },
  async ({
    nombreClienteOId,
    fechaActual,
    nuevaFecha,
    nuevaHora,
    nuevoBarberoNombre,
    motivo,
  }) => {
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
      if (clientName === queryNorm || clientName.includes(queryNorm) || queryNorm.includes(clientName)) {
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
    const durationMins = Number(resData.duracion || 40);
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
      hora_inicio: parsedHour,
      hora_fin: nuevaHoraFin,
    }));

    await matchedDoc.ref.update({
      fecha: nuevaFecha,
      hora_inicio: parsedHour,
      hora_fin: nuevaHoraFin,
      barbero_id: targetProf.id,
      professionalNames: barberDisplayName,
      items: updatedItems.length > 0 ? updatedItems : resData.items,
      reagendada_en: Timestamp.now(),
      reagendada_por: 'Janet Gerencia (Beatriz)',
      motivo_reagendacion: motivo || 'Solicitado por Beatriz',
    });

    // 5. Auditoría
    await db.collection('audit_logs').add({
      action: 'Reagendar Cita (Janet Gerencia)',
      details: `Cita de ${resData.cliente_nombre} movida al ${nuevaFecha} a las ${parsedHour} con ${barberDisplayName}. Motivo: ${motivo || 'Recepción'}`,
      userId: 'janet_gerencia',
      userName: 'Janet Gerencia (Asistente de Sucursal)',
      userRole: 'Administrador local',
      severity: 'info',
      entityId: matchedDoc.id,
      localId: targetProf.local_id || 'rkbEgvwP67JliXQ1Qeyj',
      timestamp: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      reservaId: matchedDoc.id,
      cliente: resData.cliente_nombre,
      nuevaFecha,
      nuevoHorario: `${parsedHour} a ${nuevaHoraFin}`,
      barbero: barberDisplayName,
      mensaje: `¡Listo Bety! La cita de **${resData.cliente_nombre}** ha sido reagendada con éxito:\n\n• **Nueva Fecha:** ${nuevaFecha}\n• **Nuevo Horario:** ${parsedHour} a ${nuevaHoraFin}\n• **Barbero:** ${barberDisplayName}\n\nYa quedó actualizada en la agenda.`,
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
      duracionMinutos: z
        .number()
        .optional()
        .describe('Duración del servicio en minutos (por defecto 40 minutos para un corte estándar).'),
    }),
  },
  async ({ fecha, barberoNombre, duracionMinutos = 40 }) => {
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
      const schedule = await getBarberScheduleForDay({
        db,
        barber,
        dateStr: targetDate,
        localId: barber.local_id || defaultLocalId,
      });

      const freeSlots = calculateBarberFreeSlots(schedule, duracionMinutos);

      disponibilidad.push({
        barbero: schedule.displayName,
        barberoId: schedule.barberId,
        diaSemana: schedule.diaSemana,
        laboraHoy: schedule.isWorkingDay,
        jornada: schedule.workingHours ? `${schedule.workingHours.start} - ${schedule.workingHours.end}` : 'Día libre',
        horariosLibresDisponibles: freeSlots,
        totalEspaciosLibres: freeSlots.length,
        resumen: schedule.isWorkingDay
          ? freeSlots.length > 0
            ? `${schedule.displayName} tiene ${freeSlots.length} horario(s) disponible(s) entre ${freeSlots[0]} y ${freeSlots[freeSlots.length - 1]}.`
            : `${schedule.displayName} tiene su jornada completa ocupada o bloqueada hoy.`
          : `${schedule.displayName} no labora los ${schedule.diaSemana}s (día libre).`,
      });
    }

    return {
      fecha: targetDate,
      duracionServicioConsultada: `${duracionMinutos} minutos`,
      disponibilidad,
    };
  }
);

// ============================================================================
// 5. GESTIONAR HORARIO DE BARBERO (BLOQUEAR / HABILITAR ESPECIAL / DESBLOQUEAR)
// ============================================================================
export const gestionarHorarioBarberoSucursalTool = ai.defineTool(
  {
    name: 'gestionar_horario_barbero_sucursal',
    description:
      'Gestiona bloqueos y horarios especiales en la agenda de los barberos. Respeta las reglas de la agenda: no encima bloques duplicados sobre horarios que ya están bloqueados o descansando, respeta las horas no laborales, y valida citas antes de bloquear.',
    inputSchema: z.object({
      accion: z
        .enum(['bloquear', 'habilitar_especial', 'desbloquear'])
        .describe('Acción a realizar en la agenda del barbero.'),
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
        action: 'Bloquear Horario (Janet Gerencia)',
        details: `Horario bloqueado para ${displayName} el ${fecha} de ${effectiveStart} a ${effectiveEnd}. Motivo: ${cleanMotivo}`,
        userId: 'janet_gerencia',
        userName: 'Janet Gerencia (Asistente de Sucursal)',
        userRole: 'Administrador local',
        severity: 'info',
        entityId: blockRef.id,
        localId: defaultLocalId,
        timestamp: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        bloqueoId: blockRef.id,
        mensaje: `Listo Bety: quedó bloqueado el horario de **${displayName}** el día **${fecha}** de **${effectiveStart} a ${effectiveEnd}** con motivo "${cleanMotivo}". Ya se refleja limpiamente en la agenda.`,
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
        motivo: motivo || 'Horario Habilitado',
        type: 'available',
        created_at: new Date(),
      });

      await db.collection('audit_logs').add({
        action: 'Habilitar Horario Especial (Janet Gerencia)',
        details: `Horario especial habilitado para ${displayName} el ${fecha} de ${start} a ${end}. Motivo: ${motivo}`,
        userId: 'janet_gerencia',
        userName: 'Janet Gerencia (Asistente de Sucursal)',
        userRole: 'Administrador local',
        severity: 'info',
        entityId: enableRef.id,
        localId: defaultLocalId,
        timestamp: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        bloqueoId: enableRef.id,
        mensaje: `Listo Bety: se habilitó el horario especial para **${displayName}** el día **${fecha}** de **${start} a ${end}**. Ya puede recibir citas en ese rango.`,
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
      action: 'Desbloquear Horario (Janet Gerencia)',
      details: `Se eliminaron ${toDelete.length} bloqueo(s) de ${displayName} el ${fecha}: ${motivosEliminados.join(', ')}. Motivo: ${motivo}`,
      userId: 'janet_gerencia',
      userName: 'Janet Gerencia (Asistente de Sucursal)',
      userRole: 'Administrador local',
      severity: 'info',
      localId: defaultLocalId,
      timestamp: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      eliminados: toDelete.length,
      mensaje: `Listo Bety: se eliminaron ${toDelete.length} bloqueo(s) de **${displayName}** para el día **${fecha}** (${motivosEliminados.join(', ')}). Su horario vuelve a estar disponible en la agenda.`,
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
        mensaje: 'Se generó la tarjeta de confirmación en pantalla para que Beatriz autorice la cancelación con 1 clic.',
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
        'Se generó la tarjeta de confirmación en pantalla para que Beatriz ingrese su código de autorización y elimine la venta dejando el motivo registrado.',
    };
  }
);

// ============================================================================
// 4. INVENTARIO DE PRODUCTOS, INSUMOS Y RECORDATORIOS DE GERENCIA
// ============================================================================
export const consultarYGestionarInventarioInsumosTool = ai.defineTool(
  {
    name: 'consultar_y_gestionar_inventario_insumos',
    description:
      'Revisa el stock actual de productos para detectar faltantes, muestra los recordatorios pendientes de Beatriz (conteo físico de inventario, compra de insumos como navajas, papel cuello, toallas, limpieza o consignas de Dirección) y permite crear o completar recordatorios.',
    inputSchema: z.object({
      accion: z
        .enum(['consultar', 'crear_recordatorio', 'completar_recordatorio'])
        .describe('Acción a realizar sobre el inventario y recordatorios de sucursal.'),
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
    categoriaRecordatorio,
    tituloRecordatorio,
    detalleRecordatorio,
    recordatorioIdACompletar,
  }) => {
    const db = getDb();

    if (accion === 'crear_recordatorio' && tituloRecordatorio) {
      const ref = await db.collection('gerencia_recordatorios').add({
        categoria: categoriaRecordatorio || 'insumos',
        prioridad: 'normal',
        titulo: tituloRecordatorio.trim(),
        detalle: (detalleRecordatorio || 'Recordatorio operativo de sucursal').trim(),
        origen: 'Janet Gerencia (Beatriz)',
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

export function getGerenciaAgentTools() {
  return [
    consultarOperacionDiaSucursalTool,
    consultarDisponibilidadBarberosSucursalTool,
    agendarCitaSucursalTool,
    reagendarCitaSucursalTool,
    gestionarHorarioBarberoSucursalTool,
    proponerCancelacionOEliminacionSucursalTool,
    consultarYGestionarInventarioInsumosTool,
  ];
}
