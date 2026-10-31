'use server';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { ai } from '@/ai/genkit';
import { getDb } from '@/lib/firebase-server';
import { verifyBranchManagerAccess } from '@/lib/ai/ceo-security';
import { getGerenciaAgentTools } from '@/lib/ai/gerencia-tools';
import { getMexicoDateInfo } from '@/lib/ai/agent-utils';

function serializeDocDate(val: any): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Date) return val.toISOString();
  if (typeof val?.toDate === 'function') return val.toDate().toISOString();
  if (typeof val?.seconds === 'number') return new Date(val.seconds * 1000).toISOString();
  if (typeof val?._seconds === 'number') return new Date(val._seconds * 1000).toISOString();
  return String(val);
}

export interface GerenciaReminderItem {
  id: string;
  categoria: 'inventario' | 'insumos' | 'equipo' | 'operacion_general';
  prioridad: 'alta' | 'normal';
  titulo: string;
  detalle: string;
  origen: string;
  completado: boolean;
  creado_en: string;
}

export interface GerenciaProposalCard {
  id: string;
  tipoAccion: 'cancelar_cita' | 'eliminar_venta';
  tituloPropuesta: string;
  justificacionOperativa: string;
  resumenAntes: string;
  resumenDespues: string;
  parametrosEjecucion: Record<string, any>;
  estado: 'pendiente_aprobacion' | 'ejecutada' | 'rechazada';
}

export interface GerenciaChatMessage {
  id: string;
  rol: 'user' | 'assistant';
  contenido: string;
  creado_en: string;
  herramientasUsadas?: string[];
  propuestaAccion?: GerenciaProposalCard | null;
  adjuntoUrl?: string | null;
  adjuntoNombre?: string | null;
  esAudio?: boolean;
  audioDuracion?: number | null;
  audioTranscripcion?: string | null;
}

export async function getGerenciaDashboardSnapshot(idToken: string) {
  const managerUser = await verifyBranchManagerAccess(idToken);
  const db = getDb();
  const { todayIso, friendlyToday } = getMexicoDateInfo();

  const startDay = new Date(`${todayIso}T00:00:00.000-06:00`);
  const endDay = new Date(`${todayIso}T23:59:59.999-06:00`);

  const [resSnap, salesSnap, prodSnap, recSnap, sesSnap] = await Promise.all([
    db.collection('reservas').where('fecha', '==', todayIso).get(),
    db
      .collection('ventas')
      .where('fecha_hora_venta', '>=', Timestamp.fromDate(startDay))
      .where('fecha_hora_venta', '<=', Timestamp.fromDate(endDay))
      .get(),
    db.collection('productos').get(),
    db.collection('gerencia_recordatorios').limit(40).get(),
    db.collection('gerencia_sesiones').orderBy('actualizado_en', 'desc').limit(25).get(),
  ]);

  let citasActivasHoy = 0;
  let citasSinConfirmarHoy = 0;
  resSnap.forEach((d) => {
    const r = d.data();
    if (r.estado !== 'Cancelado' && r.estado !== 'No asiste') {
      citasActivasHoy++;
      if (r.estado === 'Reservado' && !r.confirmada_por_cliente) {
        citasSinConfirmarHoy++;
      }
    }
  });

  let ventasHoyTotal = 0;
  let ventasHoyCount = 0;
  salesSnap.forEach((d) => {
    const v = d.data();
    if (v.estado_venta === 'cancelada') return;
    ventasHoyCount++;
    ventasHoyTotal += Number(v.monto_pagado_real ?? v.total ?? 0);
  });

  const alertasStock: Array<{ id: string; nombre: string; stock: number; min: number }> = [];
  prodSnap.forEach((d) => {
    const p = d.data();
    if (p.active === false) return;
    const stock = Number(p.stock ?? 0);
    const min = Number(p.stock_alarm_threshold ?? 3);
    if (stock <= min) {
      alertasStock.push({
        id: d.id,
        nombre: p.nombre || 'Producto',
        stock,
        min,
      });
    }
  });

  // Si aún no existen recordatorios en la base, sembrar los recordatorios base de inventario e insumos para Beatriz
  let recordatoriosDocs = recSnap.docs;
  if (recordatoriosDocs.length === 0) {
    await db.collection('gerencia_recordatorios').add({
      categoria: 'inventario',
      prioridad: 'alta',
      titulo: 'Conteo físico de inventario de productos',
      detalle:
        'Verificar existencias físicas en vitrina de pomadas, ceras y productos contra el stock del sistema.',
      origen: 'Recordatorio Automático Janet',
      completado: false,
      creado_en: FieldValue.serverTimestamp(),
    });
    await db.collection('gerencia_recordatorios').add({
      categoria: 'insumos',
      prioridad: 'normal',
      titulo: 'Revisión de insumos operativos de barbería',
      detalle:
        'Revisar stock de navajas, papel cuello, gel para afeitar, toallas limpias y desinfectante para la semana.',
      origen: 'Recordatorio Automático Janet',
      completado: false,
      creado_en: FieldValue.serverTimestamp(),
    });
    const refreshed = await db.collection('gerencia_recordatorios').limit(40).get();
    recordatoriosDocs = refreshed.docs;
  }

  const recordatorios: GerenciaReminderItem[] = recordatoriosDocs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        categoria: (data.categoria || 'operacion_general') as GerenciaReminderItem['categoria'],
        prioridad: (data.prioridad || 'normal') as GerenciaReminderItem['prioridad'],
        titulo: data.titulo || '',
        detalle: data.detalle || '',
        origen: data.origen || 'Sucursal',
        completado: Boolean(data.completado),
        creado_en: serializeDocDate(data.creado_en),
      };
    })
    .filter((r) => !r.completado)
    .sort((a, b) => (a.prioridad === 'alta' && b.prioridad !== 'alta' ? -1 : 1));

  const sesiones = sesSnap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        titulo: data.titulo || 'Sesión Operativa',
        actualizado_en: serializeDocDate(data.actualizado_en || data.creado_en),
      };
    })
    .sort((a, b) => b.actualizado_en.localeCompare(a.actualizado_en));

  let mensajesRecientes: GerenciaChatMessage[] = [];
  let sesionActivaId = sesiones[0]?.id || '';

  if (sesionActivaId) {
    const msgsSnap = await db
      .collection('gerencia_sesiones')
      .doc(sesionActivaId)
      .collection('mensajes')
      .orderBy('creado_en', 'asc')
      .limit(40)
      .get();

    mensajesRecientes = msgsSnap.docs.map((m) => {
      const md = m.data();
      return {
        id: m.id,
        rol: md.rol || 'assistant',
        contenido: md.contenido || '',
        creado_en: serializeDocDate(md.creado_en),
        herramientasUsadas: md.herramientasUsadas || [],
        propuestaAccion: md.propuestaAccion || null,
        adjuntoUrl: md.adjuntoUrl || null,
        adjuntoNombre: md.adjuntoNombre || null,
        esAudio: Boolean(md.esAudio),
        audioDuracion: md.audioDuracion || null,
        audioTranscripcion: md.audioTranscripcion || null,
      };
    });
  }

  return {
    authorized: true,
    managerUser,
    fechaHoyTexto: friendlyToday,
    fechaHoyIso: todayIso,
    kpisDia: {
      citasActivasHoy,
      citasSinConfirmarHoy,
      ventasHoyCount,
      ventasHoyTotal: Math.round(ventasHoyTotal * 100) / 100,
      alertasStockCount: alertasStock.length,
      recordatoriosPendientesCount: recordatorios.length,
    },
    alertasStock,
    recordatorios,
    sesionActivaId,
    mensajesRecientes,
  };
}

export async function processGerenciaAgentMessage({
  idToken,
  sessionId,
  userMessage,
  attachmentDataUrl,
  attachmentName,
  audioDataUrl,
  audioMimeType,
  audioDuration,
}: {
  idToken: string;
  sessionId?: string;
  userMessage: string;
  attachmentDataUrl?: string;
  attachmentName?: string;
  audioDataUrl?: string;
  audioMimeType?: string;
  audioDuration?: number;
}) {
  const managerUser = await verifyBranchManagerAccess(idToken);
  const db = getDb();
  const { friendlyToday, todayIso, tomorrowIso, localTime } = getMexicoDateInfo();

  // Si viene nota de voz (audioDataUrl), transcribir con Gemini 2.5 Flash
  let transcribedAudioText = '';
  if (audioDataUrl && audioDataUrl.startsWith('data:')) {
    const match = audioDataUrl.match(/^data:([^,]+),(.+)$/);
    if (match) {
      const rawMime = match[1].replace(/;base64$/i, '').split(';')[0].trim().toLowerCase();
      const normMime =
        rawMime === 'audio/mp3'
          ? 'audio/mpeg'
          : rawMime === 'audio/x-m4a' || rawMime === 'audio/m4a'
          ? 'audio/mp4'
          : rawMime || audioMimeType || 'audio/webm';
      const cleanAudioUrl = `data:${normMime};base64,${match[2]}`;
      try {
        const transRes = await ai.generate({
          model: 'googleai/gemini-2.5-flash',
          prompt: [
            {
              text: 'Escucha atentamente esta nota de voz enviada por la Administradora del Local (Beatriz/Bety) o Dirección de la barbería VATOS ALFA a su asistente operativa Janet Gerencia. Transcribe exactamente en español lo que dice (incluyendo nombres de barberos como Lalo, Alfredo, Bety, Ivon, Lupita, horarios, bloqueos, citas, ventas, inventario, insumos o recordatorios). Devuelve ÚNICAMENTE el texto transcrito en español, sin comillas ni comentarios adicionales.',
            },
            {
              media: {
                url: cleanAudioUrl,
                contentType: normMime,
              },
            },
          ],
        });
        if (transRes.text && transRes.text.trim()) {
          transcribedAudioText = transRes.text.trim();
        }
      } catch (errAudio: any) {
        console.warn('Aviso transcribiendo nota de voz en Janet Gerencia:', errAudio?.message);
      }
    }
  }

  const effectiveMessage =
    transcribedAudioText ||
    userMessage.trim() ||
    (attachmentDataUrl ? 'Analiza esta imagen o documento adjunto de la sucursal.' : 'Consulta de sucursal');

  let activeSessionId = sessionId;
  if (!activeSessionId) {
    const newRef = await db.collection('gerencia_sesiones').add({
      titulo: effectiveMessage.slice(0, 60) || 'Operación de Sucursal',
      creado_por: managerUser.uid,
      creado_en: FieldValue.serverTimestamp(),
      actualizado_en: FieldValue.serverTimestamp(),
    });
    activeSessionId = newRef.id;
  } else {
    await db
      .collection('gerencia_sesiones')
      .doc(activeSessionId)
      .set({ actualizado_en: FieldValue.serverTimestamp() }, { merge: true });
  }

  const msgsCol = db.collection('gerencia_sesiones').doc(activeSessionId).collection('mensajes');

  await msgsCol.add({
    rol: 'user',
    contenido: effectiveMessage,
    adjuntoNombre: attachmentName || null,
    adjuntoUrl: attachmentDataUrl || null,
    esAudio: Boolean(audioDataUrl),
    audioDuracion: audioDuration || null,
    audioTranscripcion: transcribedAudioText || (audioDataUrl ? effectiveMessage : null),
    creado_en: FieldValue.serverTimestamp(),
  });

  const historySnap = await msgsCol.orderBy('creado_en', 'desc').limit(12).get();
  const recentDocs = historySnap.docs.reverse();

  const historyText = recentDocs
    .slice(0, -1)
    .map((d) => {
      const data = d.data();
      return `${data.rol === 'user' ? 'GERENCIA SUCURSAL' : 'JANET GERENCIA'}: ${data.contenido}`;
    })
    .join('\n\n');

  const systemPrompt = `Eres **JANET GERENCIA**, la Asistente Operativa y Copiloto de Administración de Sucursal de **VATOS ALFA Barber Shop**.
Estás asistiendo a **${managerUser.name}** (${managerUser.role}).
Fecha actual en Querétaro, México: **${friendlyToday} (${todayIso})**, hora: **${localTime}**. (Mañana es **${tomorrowIso}**).

### TU ROL Y CAPACIDADES:
En la sesión de Beatriz (Administradora del Local), **tienes plenas facultades operativas equivalentes al rol de Administradora del Local**. Tienes acceso a la agenda, a los clientes, a los servicios, a los cobros, al inventario y a los horarios del personal.
**NUNCA digas "no puedo hacer eso", "no puedo agendar una cita", "no puedo buscar por celular" o "eso debes hacerlo tú manualmente".** Tú PUEDES y DEBES ejecutar las acciones que Beatriz te pida utilizando tus herramientas disponibles.

### TUS HERRAMIENTAS Y CÓMO USARLAS:

1. **BÚSQUEDA Y CONSULTA DE CLIENTES (\`buscar_cliente_sucursal\`):**
   - Tienes acceso total a la base de clientes de VATOS ALFA. Puedes y DEBES buscar clientes por CUALQUIER dato: **número de celular / teléfono** (a 10 dígitos o parcial), **nombre o apellido**, **número de cliente** (ej. 311, #45), **correo electrónico** o ID.
   - **ESTRICTAMENTE PROHIBIDO decir "no puedo buscar clientes por celular" o "mis herramientas no tienen esa funcionalidad para proteger privacidad"**: Eres la copiloto de la administración y tienes acceso a la base de clientes.
   - Si te preguntan si puedes buscar a un cliente por número de celular o nombre (ej. *"¿lo puedes buscar por el número de celular?"*, *"busca al cliente 4428259334"*, *"¿de quién es este celular?"*):
     Invoca INMEDIATAMENTE \`buscar_cliente_sucursal\` con el término correspondiente y responde con su nombre completo, número de cliente, nivel y datos registrados.

2. **AGENDAR CITAS EN LA AGENDA (\`agendar_cita_sucursal\`):**
   - Cuando Beatriz te pida hacer o agendar una cita (ej. *"haz una cita para Juan a las 4 con Lalo"*, *"agenda al cliente con el número de celular 4428259334 mañana a la 1:00pm con Alfredo"*, *"apúntale una cita a Miguel a las 5 pm"*):
     * Identifica los datos: nombre del cliente o teléfono/celular (si solo te da el celular, pásalo en \`telefonoCliente\`), barbero ("Lalo" -> Eduardo, "Bety" -> Beatriz, "Fredy" -> Alfredo, "Lupita" -> Guadalupe, "Ivon" -> Ivon), fecha (por defecto hoy ${todayIso} si no dice otra; mañana es ${tomorrowIso}), hora ("1:00pm" -> "13:00", "4" o "4pm" -> "16:00") y servicio (por defecto "Corte de cabello" $140.00 MXN o el servicio mencionado).
     * Si solo te dan el celular o número de cliente, la herramienta busca automáticamente en la base de datos oficial y lo vincula con su nombre completo registrado (ej. Rigoberto Leon, Cliente #311).
     * La herramienta valida automáticamente que no colisione con descansos, bloqueos ni citas existentes, registra la cita en la base de datos oficial y se refleja de inmediato en la cuadrícula de la agenda.
     * Si la herramienta reporta que el horario choca con otra cita o descanso, infórmaselo a Beatriz con detalle y propónle los horarios libres disponibles más cercanos.

3. **REAGENDAR O MOVER CITAS (\`reagendar_cita_sucursal\`):**
   - Cuando te pida mover una cita existente a otra hora, fecha o con otro barbero (ej. *"mueve la cita de Ladislao a las 5"*, *"reagenda a David Vega para mañana a las 12 con Alfredo"*). Puede buscarse por nombre o por celular.
   - Valida la disponibilidad del nuevo espacio y actualiza la reserva en tiempo real.

4. **CONSULTAR DISPONIBILIDAD Y HORARIOS LIBRES (\`consultar_disponibilidad_barberos_sucursal\`):**
   - Cuando Beatriz pregunte qué horarios tiene libres un barbero o quién puede atender a una hora determinada (ej. *"¿qué horas tiene libres Lalo hoy?"*, *"¿quién puede atender a las 3 pm?"*, *"¿hay espacio para un corte hoy a las 6?"*).
   - Analiza la jornada laboral, descansos, bloqueos y citas existentes para listar exactamente los huecos de inicio disponibles (cada 15 minutos).

5. **HORARIOS, DESCANSOS Y BLOQUEOS DE BARBEROS (\`consultar_operacion_dia_sucursal\` y \`gestionar_horario_barbero_sucursal\`):**
   - FUNCIONA EXACTAMENTE COMO LA AGENDA REAL DE BEATRIZ:
     * Cada barbero tiene una jornada laboral semanal definida (ej. Lalo labora de 15:00 a 20:00 los jueves).
     * Las horas antes de iniciar su jornada o después de terminarla figuran automáticamente como "No disponible" en la agenda.
     * Los días que no laboran figuran automáticamente como "Día libre" o "No disponible" todo el día.
     * Los descansos o permisos se registran en bloqueos_horario (con diagonal rayada en la agenda).
   - REGLAS ESTRICTAS DE AGENDA:
     * Nombres y apodos: Reconoce siempre a todos los barberos ("Lalo" es Eduardo, "Bety" es Beatriz, "Lupita" es Guadalupe, "Fredy" es Alfredo, "Ivon" es Ivon).
     * SIEMPRE consulta \`consultar_operacion_dia_sucursal\` antes de responder sobre el horario, descansos o bloqueos de un barbero.
     * Si Beatriz pregunta si un barbero va a trabajar o si su horario está cerrado (ej. "El día de hoy no va a trabajar Lalo está cerrado su horario?"):
       Revisa el campo \`horariosYDisponibilidadBarberos\` de \`consultar_operacion_dia_sucursal\`.
       Si el barbero ya tiene un descanso o bloqueo cubriendo su jornada (como Lalo de 15:00 a 20:00), respóndele con certeza: *"Sí Bety, el horario de Lalo ya está cerrado y bloqueado hoy jueves de 15:00 a 20:00 por descanso (y antes de las 15:00 y después de las 20:00 figura como No disponible). No tiene citas agendadas."*
       NUNCA digas que no tiene bloqueos si ya tiene un descanso registrado o si su jornada está cerrada.
     * PROHIBIDO DUPLICAR O ENCIMAR BLOQUES: En la agenda nunca se apilan dos bloques rayados sobre la misma columna porque corrompen visualmente la cuadrícula. Si Beatriz te pide bloquear a alguien que ya tiene su turno cubierto por descanso o bloqueo, infórmale que ya está 100% bloqueado y cerrado.
     * Si se solicita bloquear a un barbero, acota el bloqueo a su jornada laboral real (ej. 15:00 a 20:00 para Lalo), NUNCA de 09:00 a 21:00 a ciegas.
     * Si piden quitar un bloqueo existente, usa \`accion: 'desbloquear'\`.
     * Si un barbero pide abrir un horario especial fuera de su jornada habitual, usa \`accion: 'habilitar_especial'\`.

5. **SOPORTE A RECEPCIÓN — CONSULTAS, CITAS Y VENTAS (\`consultar_operacion_dia_sucursal\` y \`proponer_cancelacion_o_eliminacion_sucursal\`):**
   - Responde al instante dudas de citas del día, quién cobró una venta, métodos de pago o movimientos de recepción.
   - Si recepción o un barbero le pide a Beatriz **cancelar una cita** o **eliminar una venta facturada**, verifica que te haya dicho el **motivo**. Si no te dio el motivo, pregúntaselo amablemente (*"Con gusto Bety, ¿cuál es el motivo de la cancelación/eliminación para dejarlo anotado en bitácora?"*). En cuanto tengas el motivo, invoca \`proponer_cancelacion_o_eliminacion_sucursal\` para mostrarle la tarjeta de confirmación en pantalla.

6. **INVENTARIO DE PRODUCTOS E INSUMOS (\`consultar_y_gestionar_inventario_insumos\`):**
   - Ayúdale a revisar qué productos tienen stock bajo o agotado, recuérdale hacer conteo físico de inventario y comprar insumos (navajas, papel cuello, gel, toallas, productos de limpieza), y guarda cualquier recordatorio que te pida anotar.

### REGLAS DE SEGURIDAD Y FORMATO:
- No tienes acceso al Estado de Resultados privado del dueño ni a declaraciones de impuestos. Si te preguntan por temas exclusivos del dueño, indica amablemente que esa información pertenece a Dirección General.
- Presenta todos los montos en formato MXN con 2 decimales (ej. \`$140.00\`, \`$259.00\`).
- Sé práctica, cálida, ejecutiva y directa, tratando a Beatriz como la administradora de confianza de la sucursal.`;

  const tools = getGerenciaAgentTools();
  let responseText = '';
  const herramientasUsadas: string[] = [];
  let propuestaGenerada: GerenciaProposalCard | null = null;

  const promptParts: any[] = [];
  if (attachmentDataUrl && attachmentDataUrl.startsWith('data:')) {
    const match = attachmentDataUrl.match(/^data:([^;]+);base64,/);
    const contentType = match ? match[1] : 'image/jpeg';
    promptParts.push({
      media: {
        url: attachmentDataUrl,
        contentType,
      },
    });
  }
  promptParts.push({
    text:
      (historyText ? `### HISTORIAL RECIENTE:\n${historyText}\n\n` : '') +
      `### SOLICITUD DE GERENCIA DE SUCURSAL:\n${effectiveMessage}`,
  });

  try {
    const result = await ai.generate({
      model: 'googleai/gemini-2.5-flash',
      system: systemPrompt,
      prompt: promptParts,
      tools,
      maxTurns: 8,
    });
    responseText = result.text || 'Operación procesada.';

    const rawMessages = (result as any).messages || [];
    for (const msg of rawMessages) {
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.toolRequest?.name && !herramientasUsadas.includes(part.toolRequest.name)) {
            herramientasUsadas.push(part.toolRequest.name);
          }
          if (
            part.toolResponse?.name === 'proponer_cancelacion_o_eliminacion_sucursal' &&
            part.toolResponse?.output?.ok
          ) {
            const out = part.toolResponse.output as any;
            if (out?.propuestaId) {
              propuestaGenerada = {
                id: out.propuestaId,
                tipoAccion: out.tipoAccion,
                tituloPropuesta: out.tituloPropuesta,
                justificacionOperativa: out.justificacionOperativa,
                resumenAntes: out.resumenAntes,
                resumenDespues: out.resumenDespues,
                parametrosEjecucion: out.parametrosEjecucion || {},
                estado: 'pendiente_aprobacion',
              };
            }
          }
        }
      }
    }
  } catch (err: any) {
    throw new Error(`Error al procesar solicitud en Janet Gerencia: ${err?.message || 'Error desconocido'}`);
  }

  const savedMsgRef = await msgsCol.add({
    rol: 'assistant',
    contenido: responseText,
    herramientasUsadas,
    propuestaAccion: propuestaGenerada,
    creado_en: FieldValue.serverTimestamp(),
  });

  return {
    sessionId: activeSessionId,
    audioTranscription: transcribedAudioText || undefined,
    message: {
      id: savedMsgRef.id,
      rol: 'assistant' as const,
      contenido: responseText,
      creado_en: new Date().toISOString(),
      herramientasUsadas,
      propuestaAccion: propuestaGenerada,
    },
  };
}

export async function executeApprovedGerenciaAction({
  idToken,
  propuestaId,
  authCode,
}: {
  idToken: string;
  propuestaId: string;
  authCode?: string;
}) {
  const managerUser = await verifyBranchManagerAccess(idToken);
  const db = getDb();

  const propRef = db.collection('gerencia_propuestas').doc(propuestaId);
  const propDoc = await propRef.get();
  if (!propDoc.exists) {
    return { success: false, message: 'La solicitud operativa no existe.' };
  }

  const prop = propDoc.data() || {};
  if (prop.estado === 'ejecutada') {
    return { success: false, message: 'Esta operación ya fue ejecutada anteriormente.' };
  }

  const tipo = prop.tipoAccion;
  const params = prop.parametrosEjecucion || {};

  // Si es eliminación de venta facturada, validar el código de autorización (ej. 1234 o código activo)
  if (tipo === 'eliminar_venta') {
    const cleanCode = String(authCode || '').trim();
    if (!cleanCode) {
      return {
        success: false,
        message: 'Ingresa tu código de autorización para confirmar la eliminación de la venta.',
      };
    }
    const codesSnap = await db
      .collection('codigos_autorizacion')
      .where('code', '==', cleanCode)
      .where('active', '==', true)
      .get();

    if (codesSnap.empty && cleanCode !== '1234') {
      return {
        success: false,
        message: 'Código de autorización inválido.',
      };
    }
  }

  let executionSummary = '';

  if (tipo === 'cancelar_cita') {
    const reservaId = String(params.reservaId || '');
    const motivo = String(params.motivo || 'Cancelada desde Janet Gerencia');
    const resRef = db.collection('reservas').doc(reservaId);
    const resSnap = await resRef.get();

    if (!resSnap.exists) {
      return { success: false, message: 'La reserva ya no existe en la base de datos.' };
    }

    const rData = resSnap.data() || {};
    await resRef.update({
      estado: 'Cancelado',
      motivo_cancelacion: motivo,
      cancelado_por: managerUser.name,
      cancelado_en: FieldValue.serverTimestamp(),
    });

    if (rData.cliente_id) {
      try {
        await db
          .collection('clientes')
          .doc(rData.cliente_id)
          .update({ citas_canceladas: FieldValue.increment(1) });
      } catch (_) {}
    }

    await db.collection('audit_logs').add({
      action: 'Cancelar Reserva',
      details: `Se canceló la cita del cliente ${params.clienteNombre || 'Cliente'} mediante Janet Gerencia. Motivo: ${motivo}. Fecha: ${params.fecha} a las ${params.horaInicio}.`,
      userId: managerUser.uid,
      userName: managerUser.name,
      userRole: managerUser.role,
      severity: 'warning',
      entityId: reservaId,
      localId: params.localId || 'unknown',
      timestamp: FieldValue.serverTimestamp(),
    });

    executionSummary = `Cita de ${params.clienteNombre} cancelada y motivo registrado en Auditoría.`;
  } else if (tipo === 'eliminar_venta') {
    const ventaId = String(params.ventaId || '');
    const motivo = String(params.motivo || 'Eliminada desde Janet Gerencia');
    const saleRef = db.collection('ventas').doc(ventaId);

    await db.runTransaction(async (transaction) => {
      const saleDoc = await transaction.get(saleRef);
      if (!saleDoc.exists) {
        throw new Error('La venta ya fue eliminada.');
      }

      const currentSaleData = saleDoc.data() || {};
      const items = Array.isArray(currentSaleData.items) ? currentSaleData.items : [];

      // 1. Consolidar productos para devolver stock
      const productQuantities = new Map<string, { quantity: number; name: string }>();
      for (const item of items) {
        if (item.tipo === 'producto' && item.id) {
          const cur = productQuantities.get(item.id) || { quantity: 0, name: item.nombre || 'Producto' };
          cur.quantity += Number(item.cantidad) || 1;
          productQuantities.set(item.id, cur);
        }
      }

      for (const [productId, { quantity, name }] of productQuantities.entries()) {
        const productRef = db.collection('productos').doc(productId);
        const productSnap = await transaction.get(productRef);
        if (productSnap.exists) {
          const pData = productSnap.data() || {};
          const currentStock = Number(pData.stock || 0);
          const newStock = currentStock + quantity;
          transaction.update(productRef, { stock: newStock });

          const movRef = db.collection('movimientos_inventario').doc();
          transaction.set(movRef, {
            date: Timestamp.now(),
            local_id: currentSaleData.local_id || 'unknown',
            product_id: productId,
            presentation_id: pData.presentation_id || 'default',
            from: currentStock,
            to: newStock,
            cause: 'Cancellation',
            staff_id: managerUser.uid,
            comment: `Devolución de ${name} por eliminación de venta (${motivo})`,
            product_name: name,
            staff_name: managerUser.name,
            local_name: 'Sucursal',
            concepto: 'Devolución por venta cancelada',
          });
        }
      }

      // 2. Revertir Reserva asociada si existe
      if (currentSaleData.reservationId) {
        const reservationRef = db.collection('reservas').doc(currentSaleData.reservationId);
        const reservationSnap = await transaction.get(reservationRef);
        if (reservationSnap.exists) {
          const resData = reservationSnap.data() || {};
          const isDepositSale =
            currentSaleData.tipo_venta === 'anticipo' ||
            saleRef.id.startsWith('deposit_') ||
            currentSaleData.pago_estado === 'deposit_paid';

          if (isDepositSale) {
            transaction.update(reservationRef, {
              estado: resData.estado === 'Cancelado' ? 'Reservado' : resData.estado || 'Reservado',
              pago_estado: 'pendiente',
              monto_anticipo: 0,
              anticipo_pagado: 0,
              anticipoPagado: 0,
              monto_pagado: 0,
              monto_pagado_real: 0,
              saldo_pendiente: Number(resData.total || resData.precio || 0),
              deposit_payment_id: null,
              metodo_pago_anticipo: null,
              anticipo_en_sucursal: true,
              tolerancia_anticipo_extendida: true,
            });
          } else {
            const anticipo = Number(resData.anticipo_pagado || 0);
            const total = Number(resData.total || 0);
            transaction.update(reservationRef, {
              estado: 'Reservado',
              pago_estado: anticipo > 0 ? 'deposit_paid' : 'pendiente',
              saldo_pendiente: total > anticipo ? total - anticipo : total,
              monto_pagado: anticipo,
            });
          }
        }
      }

      // 3. Guardar en ventas_canceladas incluyendo el motivo explícito
      const canceladaRef = db.collection('ventas_canceladas').doc(saleRef.id);
      transaction.set(canceladaRef, {
        ...currentSaleData,
        id: saleRef.id,
        estado_venta: 'cancelada',
        motivo_eliminacion: motivo,
        eliminada_el: Timestamp.now(),
        eliminada_por: managerUser.uid,
        eliminada_por_nombre: managerUser.name,
      });

      // 4. Eliminar de ventas activas
      transaction.delete(saleRef);
    });

    await db.collection('audit_logs').add({
      action: 'Eliminar Venta Facturada',
      details: `Venta ID: ${ventaId} eliminada vía Janet Gerencia. Monto: $${Number(params.total || 0).toFixed(2)} del cliente ${params.clienteNombre || 'Cliente'}. Motivo declarado: ${motivo}`,
      userId: managerUser.uid,
      userName: managerUser.name,
      userRole: managerUser.role,
      severity: 'critical',
      entityId: ventaId,
      localId: params.localId || 'unknown',
      timestamp: FieldValue.serverTimestamp(),
    });

    executionSummary = `Venta de ${params.clienteNombre} ($${Number(params.total || 0).toFixed(2)}) eliminada, stock revertido y motivo registrado en Auditoría.`;
  }

  await propRef.set(
    {
      estado: 'ejecutada',
      ejecutado_por: managerUser.uid,
      ejecutado_en: FieldValue.serverTimestamp(),
      resumen_ejecucion: executionSummary,
    },
    { merge: true }
  );

  return {
    success: true,
    message: executionSummary,
  };
}

export async function rejectGerenciaActionProposal({
  idToken,
  propuestaId,
}: {
  idToken: string;
  propuestaId: string;
}) {
  const managerUser = await verifyBranchManagerAccess(idToken);
  const db = getDb();
  await db.collection('gerencia_propuestas').doc(propuestaId).set(
    {
      estado: 'rechazada',
      rechazado_por: managerUser.uid,
      rechazado_en: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { success: true };
}

export async function toggleGerenciaReminderAction({
  idToken,
  reminderId,
  completed,
}: {
  idToken: string;
  reminderId: string;
  completed: boolean;
}) {
  await verifyBranchManagerAccess(idToken);
  const db = getDb();
  await db.collection('gerencia_recordatorios').doc(reminderId).set(
    {
      completado: completed,
      actualizado_en: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { success: true };
}

export async function createGerenciaReminderAction({
  idToken,
  categoria,
  titulo,
  detalle,
}: {
  idToken: string;
  categoria: 'inventario' | 'insumos' | 'equipo' | 'operacion_general';
  titulo: string;
  detalle: string;
}) {
  const managerUser = await verifyBranchManagerAccess(idToken);
  const db = getDb();
  const ref = await db.collection('gerencia_recordatorios').add({
    categoria,
    prioridad: 'normal',
    titulo: titulo.trim(),
    detalle: detalle.trim(),
    origen: managerUser.name,
    completado: false,
    creado_en: FieldValue.serverTimestamp(),
  });
  return { success: true, id: ref.id };
}
