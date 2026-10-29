import { z } from 'zod';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { ai } from '@/ai/genkit';
import { getDb } from '@/lib/firebase-server';
import { sanitizeExternalUntrustedText } from '@/lib/ai/ceo-security';
import { getMexicoDateInfo } from '@/lib/ai/agent-utils';

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
      'Consulta las citas/reservas, las ventas facturadas, los bloqueos/horarios especiales de barberos y los movimientos operativos de una fecha específica (por defecto hoy). Úsala cuando Beatriz pregunte por una cita, una venta cobrada por recepción, quién atendió a un cliente o cómo va el día en la sucursal.',
    inputSchema: z.object({
      fecha: z
        .string()
        .optional()
        .describe('Fecha a consultar en formato YYYY-MM-DD. Si se omite, consulta el día de hoy en Querétaro.'),
      filtroClienteOBarbero: z
        .string()
        .optional()
        .describe('Opcional: nombre del cliente o del barbero para filtrar citas y ventas.'),
    }),
  },
  async ({ fecha, filtroClienteOBarbero }) => {
    const db = getDb();
    const { todayIso } = getMexicoDateInfo();
    const targetDate = (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha.trim())) ? fecha.trim() : todayIso;
    const filterNorm = (filtroClienteOBarbero || '').toLowerCase().trim();

    const startDay = new Date(`${targetDate}T00:00:00.000-06:00`);
    const endDay = new Date(`${targetDate}T23:59:59.999-06:00`);

    const [profSnap, resSnap, blocksSnap, salesSnap] = await Promise.all([
      db.collection('profesionales').get(),
      db.collection('reservas').where('fecha', '==', targetDate).get(),
      db.collection('bloqueos_horario').where('fecha', '==', targetDate).get(),
      db
        .collection('ventas')
        .where('fecha_hora_venta', '>=', Timestamp.fromDate(startDay))
        .where('fecha_hora_venta', '<=', Timestamp.fromDate(endDay))
        .get(),
    ]);

    const profMap = new Map<string, { id: string; nombre: string; localId: string }>();
    profSnap.forEach((d) => {
      const p = d.data();
      if (!p.deleted) {
        profMap.set(d.id, {
          id: d.id,
          nombre: p.name || p.publicName || 'Profesional',
          localId: p.local_id || '',
        });
      }
    });

    const reservasDelDia: any[] = [];
    resSnap.forEach((doc) => {
      const r = doc.data();
      const barberoNombre = profMap.get(r.barbero_id)?.nombre || r.professionalNames || 'Barbero';
      const clienteNombre = sanitizeExternalUntrustedText(
        r.customer?.nombre || r.cliente_nombre || 'Cliente',
        70
      );
      if (
        filterNorm &&
        !clienteNombre.toLowerCase().includes(filterNorm) &&
        !barberoNombre.toLowerCase().includes(filterNorm)
      ) {
        return;
      }

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
      const barberoNombre = profMap.get(b.barbero_id)?.nombre || 'Barbero';
      if (filterNorm && !barberoNombre.toLowerCase().includes(filterNorm)) return;
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
      const barberoPrincipal =
        profMap.get(items[0]?.barbero_id || v.barbero_id)?.nombre ||
        v.professionalNames ||
        'General';

      if (
        filterNorm &&
        !clienteNombre.toLowerCase().includes(filterNorm) &&
        !barberoPrincipal.toLowerCase().includes(filterNorm)
      ) {
        return;
      }

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
      citas: reservasDelDia.slice(0, 40),
      bloqueosYHorariosEspeciales: bloqueosYExcepciones,
      ventasFacturadas: ventasDelDia.slice(0, 40),
    };
  }
);

// ============================================================================
// 2. GESTIONAR HORARIO DE BARBERO (BLOQUEAR / HABILITAR ESPECIAL / DESBLOQUEAR)
// ============================================================================
export const gestionarHorarioBarberoSucursalTool = ai.defineTool(
  {
    name: 'gestionar_horario_barbero_sucursal',
    description:
      'Permite a Beatriz (Administradora Local) cerrar/bloquear el horario de un barbero cuando pide permiso, habilitarle un horario especial fuera de su jornada habitual, o eliminar un bloqueo existente en la agenda.',
    inputSchema: z.object({
      accion: z
        .enum(['bloquear', 'habilitar_especial', 'desbloquear'])
        .describe('Acción a realizar en la agenda del barbero.'),
      nombreBarbero: z
        .string()
        .describe('Nombre o apodo del barbero (ej. "Lalo", "Eduardo", "Alfredo", "Ivon", "Lupita", "Beatriz").'),
      fecha: z.string().describe('Fecha en formato YYYY-MM-DD.'),
      horaInicio: z.string().describe('Hora de inicio en formato 24h HH:mm (ej. "10:00").'),
      horaFin: z.string().describe('Hora de fin en formato 24h HH:mm (ej. "14:00" o "20:30").'),
      motivo: z
        .string()
        .describe('Motivo claro del bloqueo o del horario especial (ej. "Permiso personal autorizado por Bety").'),
    }),
  },
  async ({ accion, nombreBarbero, fecha, horaInicio, horaFin, motivo }) => {
    const db = getDb();
    const profSnap = await db.collection('profesionales').get();

    const aliases: Record<string, string[]> = {
      eduardo: ['lalo', 'eduardo'],
      beatriz: ['bety', 'betty', 'beatriz'],
      guadalupe: ['lupita', 'guadalupe'],
      ivon: ['ivon', 'ivonne'],
      alfredo: ['alfredo', 'fredy'],
    };

    const searchNorm = nombreBarbero.toLowerCase().trim();
    let matchedProf: { id: string; name: string; localId: string } | null = null;

    profSnap.forEach((doc) => {
      const p = doc.data();
      if (p.deleted || p.active === false) return;
      const fullName = String(p.name || p.publicName || '').toLowerCase();
      if (fullName.includes(searchNorm) || searchNorm.includes(fullName)) {
        matchedProf = { id: doc.id, name: p.name || p.publicName, localId: p.local_id || '' };
        return;
      }
      for (const [, list] of Object.entries(aliases)) {
        if (list.some((a) => searchNorm.includes(a)) && list.some((a) => fullName.includes(a))) {
          matchedProf = { id: doc.id, name: p.name || p.publicName, localId: p.local_id || '' };
          return;
        }
      }
    });

    if (!matchedProf) {
      return {
        ok: false,
        mensaje: `No encontré un profesional activo que coincida con "${nombreBarbero}". Verifica el nombre.`,
      };
    }

    const prof = matchedProf as { id: string; name: string; localId: string };
    let defaultLocalId = prof.localId;
    if (!defaultLocalId) {
      const localesSnap = await db.collection('locales').limit(1).get();
      if (!localesSnap.empty) defaultLocalId = localesSnap.docs[0].id;
    }

    if (accion === 'bloquear') {
      if (horaFin <= horaInicio) {
        return {
          ok: false,
          mensaje: `La hora de fin (${horaFin}) debe ser posterior a la hora de inicio (${horaInicio}).`,
        };
      }

      // Revisar si el barbero ya tiene citas activas que choquen con ese horario
      const resSnap = await db.collection('reservas').where('fecha', '==', fecha).get();
      const conflictos: any[] = [];
      resSnap.forEach((doc) => {
        const r = doc.data();
        if (r.estado === 'Cancelado' || r.estado === 'No asiste') return;
        const isForBarber =
          r.barbero_id === prof.id ||
          (Array.isArray(r.items) && r.items.some((item: any) => item?.barbero_id === prof.id));
        if (!isForBarber) return;

        if (horaInicio < r.hora_fin && horaFin > r.hora_inicio) {
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
          mensaje: `No se puede bloquear directamente porque ${prof.name} ya tiene ${conflictos.length} cita(s) activa(s) en ese horario (${conflictos.map((c) => `${c.cliente} de ${c.horario}`).join(', ')}). Primero debemos reagendar o cancelar esa(s) cita(s).`,
        };
      }

      const blockRef = await db.collection('bloqueos_horario').add({
        barbero_id: prof.id,
        motivo: motivo.slice(0, 50),
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        creado_en: Timestamp.now(),
        local_id: defaultLocalId,
      });

      await db.collection('audit_logs').add({
        action: 'Bloquear Horario (Janet Gerencia)',
        details: `Horario bloqueado para ${prof.name} el ${fecha} de ${horaInicio} a ${horaFin}. Motivo: ${motivo}`,
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
        mensaje: `Listo: quedó bloqueado el horario de **${prof.name}** el día **${fecha}** de **${horaInicio} a ${horaFin}** con motivo "${motivo}". Ya se refleja en la Agenda.`,
      };
    }

    if (accion === 'habilitar_especial') {
      if (horaFin <= horaInicio) {
        return {
          ok: false,
          mensaje: `La hora de fin (${horaFin}) debe ser posterior a la hora de inicio (${horaInicio}).`,
        };
      }

      const enableRef = await db.collection('bloqueos_horario').add({
        barbero_id: prof.id,
        local_id: defaultLocalId,
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        motivo: motivo || 'Horario Habilitado',
        type: 'available',
        created_at: new Date(),
      });

      await db.collection('audit_logs').add({
        action: 'Habilitar Horario Especial (Janet Gerencia)',
        details: `Horario especial habilitado para ${prof.name} el ${fecha} de ${horaInicio} a ${horaFin}. Motivo: ${motivo}`,
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
        mensaje: `Listo: se habilitó el horario especial para **${prof.name}** el día **${fecha}** de **${horaInicio} a ${horaFin}**. Ya puede recibir citas en ese rango.`,
      };
    }

    // accion === 'desbloquear'
    const blocksSnap = await db
      .collection('bloqueos_horario')
      .where('barbero_id', '==', prof.id)
      .where('fecha', '==', fecha)
      .get();

    const toDelete = blocksSnap.docs.filter((d) => {
      const b = d.data();
      if (b.type === 'available') return false;
      return b.hora_inicio < horaFin && b.hora_fin > horaInicio;
    });

    if (toDelete.length === 0) {
      return {
        ok: false,
        mensaje: `No encontré bloqueos activos para ${prof.name} el ${fecha} entre ${horaInicio} y ${horaFin}.`,
      };
    }

    for (const d of toDelete) {
      await d.ref.delete();
    }

    await db.collection('audit_logs').add({
      action: 'Desbloquear Horario (Janet Gerencia)',
      details: `Se eliminaron ${toDelete.length} bloqueo(s) de horario de ${prof.name} el ${fecha} (${horaInicio} - ${horaFin}). Motivo: ${motivo}`,
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
      mensaje: `Se eliminaron ${toDelete.length} bloqueo(s) de horario de **${prof.name}** para el día **${fecha}**. Su agenda vuelve a estar disponible.`,
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
    gestionarHorarioBarberoSucursalTool,
    proponerCancelacionOEliminacionSucursalTool,
    consultarYGestionarInventarioInsumosTool,
  ];
}
