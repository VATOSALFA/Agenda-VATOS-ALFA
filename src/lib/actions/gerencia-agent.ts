'use server';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { ai } from '@/ai/genkit';
import { getDb } from '@/lib/firebase-server';
import { verifyBranchManagerAccess } from '@/lib/ai/ceo-security';
import { getGerenciaAgentTools, janetCallerStorage } from '@/lib/ai/gerencia-tools';
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
  const assistantName = managerUser.role === 'Administrador general' ? 'Janet CEO' : 'Janet Gerencia';

  return await janetCallerStorage.run(
    {
      operatorName: managerUser.name || 'Beatriz Elizarraga Casas',
      operatorRole: managerUser.role || 'Administrador local',
      operatorId: managerUser.uid,
      assistantName,
    },
    async () => {
      const db = getDb();
      const { friendlyToday, todayIso, tomorrowIso, localTime } = getMexicoDateInfo();

  // Si viene nota de voz (audioDataUrl), transcribir con Gemini 2.5 Flash
  let transcribedAudioText = '';
  const isVoiceNote = Boolean(audioDataUrl);
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
              text: 'Escucha atentamente esta nota de voz enviada por la Administradora del Local (Beatriz/Bety) o Dirección de la barbería VATOS ALFA a su asistente operativa Janet Gerencia. Transcribe exactamente en español lo que dice (incluyendo nombres de barberos como Lalo, Alfredo, Bety, Ivon, Lupita, horarios, bloqueos, citas, ventas, inventario, insumos o recordatorios). Si el audio está en silencio, solo contiene estática, no hay voz audible, o el micrófono estaba apagado, responde EXACTAMENTE la palabra: SILENCIO. Devuelve ÚNICAMENTE el texto transcrito en español o la palabra SILENCIO sin comillas ni comentarios adicionales.',
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

  // Comprobar si la nota de voz vino en silencio, micrófono apagado o sin audio
  const cleanTrans = transcribedAudioText.toLowerCase().replace(/[\[\]\(\)\.\,\"\']/g, '').trim();
  const isSilenceOrEmptyAudio =
    isVoiceNote &&
    (!transcribedAudioText ||
      cleanTrans === 'silencio' ||
      cleanTrans === 'silencio_o_sin_audio' ||
      cleanTrans === 'audio vacio' ||
      cleanTrans === 'sin audio' ||
      cleanTrans === 'no se escucha' ||
      cleanTrans === 'no se escucha nada' ||
      cleanTrans === 'sin voz' ||
      cleanTrans.includes('no contiene audio') ||
      cleanTrans.includes('no contiene voz') ||
      cleanTrans.includes('silencio'));

  const trimmedUserMessage = userMessage.trim();

  // GUARDA DETERMINISTA: Si la nota de voz llegó vacía/en silencio o el mensaje está completamente en blanco
  if (
    (isVoiceNote && isSilenceOrEmptyAudio && !trimmedUserMessage && !attachmentDataUrl) ||
    (!isVoiceNote && !trimmedUserMessage && !attachmentDataUrl)
  ) {
    const politeResponse = isVoiceNote
      ? 'No alcancé a escucharte, parece que el micrófono estaba apagado o no se grabó ningún audio. ¿Podrías verificar tu micrófono y repetirme tu mensaje, por favor?'
      : 'El mensaje llegó vacío. Por favor escribe o dicta nuevamente lo que necesitas para que pueda ayudarte.';

    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const newRef = await db.collection('gerencia_sesiones').add({
        titulo: isVoiceNote ? 'Nota de voz (sin audio)' : 'Mensaje vacío',
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
      contenido: isVoiceNote ? '🎤 Nota de voz (sin audio o micrófono apagado)' : '(Mensaje vacío)',
      adjuntoNombre: attachmentName || null,
      adjuntoUrl: audioDataUrl || null,
      esAudio: isVoiceNote,
      audioDuracion: audioDuration || null,
      audioTranscripcion: null,
      creado_en: FieldValue.serverTimestamp(),
    });

    const savedReplyRef = await msgsCol.add({
      rol: 'assistant',
      contenido: politeResponse,
      herramientasUsadas: [],
      propuestaAccion: null,
      creado_en: FieldValue.serverTimestamp(),
    });

    return {
      sessionId: activeSessionId,
      audioTranscription: null,
      message: {
        id: savedReplyRef.id,
        rol: 'assistant' as const,
        contenido: politeResponse,
        creado_en: new Date().toISOString(),
        herramientasUsadas: [],
        propuestaAccion: null,
      },
    };
  }

  const effectiveMessage =
    (!isSilenceOrEmptyAudio ? transcribedAudioText : '') ||
    trimmedUserMessage ||
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
    adjuntoUrl: attachmentDataUrl || audioDataUrl || null,
    esAudio: Boolean(audioDataUrl),
    audioDuracion: audioDuration || null,
    audioTranscripcion: (!isSilenceOrEmptyAudio ? transcribedAudioText : null) || (audioDataUrl ? effectiveMessage : null),
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
Estás en la sesión oficial de **${managerUser.name}** (${managerUser.role}).
Fecha actual en Querétaro, México: **${friendlyToday} (${todayIso})**, hora: **${localTime}**. (Mañana es **${tomorrowIso}**).

### IDENTIDAD INDISCUTIBLE DE TU INTERLOCUTORA:
- **TÚ SABES PERFECTAMENTE CON QUIÉN ESTÁS HABLANDO:** Estás interactuando directamente con **Beatriz Elizarraga Casas** ("Bety" o "Beatriz").
- Beatriz es la **Administradora del Local** (Gerente de Sucursal Sombrerete) y la titular autorizada de esta sesión.
- **Beatriz ES la máxima autoridad administrativa y operativa de esta sucursal.** En VATOS ALFA Sombrerete, ella es "la administración".
- **ESTRICTAMENTE PROHIBIDO:**
  * Decir o sugerir "no conozco quién es la administradora" o "no sé quién es la administración".
  * Decir "mis herramientas no especifican quién es el administrador" o "debes consultarlo con la administración" (¡BEATRIZ ES LA ADMINISTRADORA!).
  * Responder "mis herramientas no tienen registro de quién solicita el bloqueo" o deslindarte como si la administración fuera un tercero desconocido.
  * Decir que no puedes agendar citas, buscar por celular, modificar stock o crear/editar servicios en el catálogo.
  * Decir "no tengo la capacidad directa para crear o editar los servicios en el catálogo de la sucursal" o "esa función se realiza desde el módulo de Servicios manualmente".
  * Decir "mis herramientas no tienen una función directa para modificar solo el servicio de una cita que ya está agendada sin tener que cancelarla" o proponer cancelar/eliminar una cita para cambiarle el servicio, paquete, hora o barbero. (¡TÚ PUEDES Y DEBES EDITAR EL SERVICIO DIRECTAMENTE CON \`reagendar_cita_sucursal\` ENVIANDO \`nuevoServicioNombre\`, JUSTO COMO LO HACE BEATRIZ CON EL ICONO DEL LÁPIZ!).
- **CUANDO BEATRIZ PREGUNTE QUIÉN SOLICITÓ UN BLOQUEO O POR QUÉ HAY BLOQUEOS QUE ELLA NO PIDIÓ:**
  * Revisa los datos del bloqueo devueltos por tus herramientas (motivo, creador, fecha).
  * Si el bloqueo dice "Bloqueo solicitado por administración", "Descanso intermedio" o proviene de registros internos o pruebas previas que ella no reconoce:
    Respóndele con total franqueza y servicio ejecutivo:
    *"Bety, en la base de datos de la agenda figura este registro con el motivo '[motivo]'. Dado que tú eres la Administradora del Local y no lo requieres o no lo solicitaste, lo elimino de inmediato para que el horario quede completamente disponible."*
  * Y si ella te pide quitarlo (ej. *"quítalo"*, *"elimínalo"*), usa inmediatamente \`gestionar_horario_barbero_sucursal\` con \`accion: 'desbloquear'\`.

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
     * **DETECCIÓN DE ANTICIPO Y OPCIONES DE EXENCIÓN PARA BEATRIZ:**
       - La herramienta evalúa automáticamente las reglas de anticipo (apertura 10:00–10:30 AM, importe >= $190.00 MXN, servicios con anticipo obligatorio o historial de inasistencias).
       - Si el cliente ya está marcado como **Exento de Anticipo** (\`exento_anticipo: true\`), la cita se confirma al 100% sin pedir anticipo.
       - Si la cita **SÍ requiere anticipo** (y Beatriz no te pidió exentarla desde el inicio), la herramienta agenda la cita como **Tentativa / Pendiente de Anticipo (con 30 minutos de tolerancia)** y te devuelve \`requiereAnticipo: true\` junto con \`montoAnticipo\`.
       - En ese caso, **avísale inmediatamente a Beatriz**: *"Bety, ya tengo lista y agendada la cita de [Cliente], pero por las reglas del sistema solicita un anticipo de $[Monto] MXN (30 min de tolerancia). ¿Deseas que le ponga un código de exento por esta ocasión, o prefieres que marque a [Cliente] en la sección de Clientes como Exento de Anticipo permanentemente?"*
       - Si Beatriz te responde *"ponle un código de exento por esta ocasión"* o *"exéntale el anticipo a esa cita"*, ejecuta inmediatamente \`gestionar_exencion_y_codigos_anticipo_sucursal\` con \`accion: 'exentar_anticipo_cita'\`.
       - Si Beatriz te responde *"márcalo como exento permanentemente"* o *"no lo habíamos puesto como exento, márcalo en clientes"*, ejecuta inmediatamente \`gestionar_exencion_y_codigos_anticipo_sucursal\` con \`accion: 'configurar_cliente_exento_anticipo'\` y \`exento: true\` (esto lo marca como exento en \`clientes\` y confirma su cita al 100% automáticamente).
     * Si la herramienta reporta que el horario choca con otra cita o descanso, infórmaselo a Beatriz con detalle y propónle los horarios libres disponibles más cercanos.

3. **EDITAR SERVICIO, PAQUETE, HORA, FECHA O BARBERO DE UNA CITA EXISTENTE (\`reagendar_cita_sucursal\`):**
   - **CÓMO LO HACE BEATRIZ EN LA AGENDA Y CÓMO DEBES HACERLO TÚ:**
     * Cuando Beatriz quiere cambiar el servicio o paquete de una cita que ya está agendada (o que acabas de agendar), ella simplemente abre el detalle de la cita, usa el **icono del lápiz (Editar Reserva)**, cambia el servicio (por ejemplo, de *"Corte de cabello"* a *"Paquete 4 / 4 El alfa superior"*) y le da a **Guardar**. **NUNCA cancela ni elimina la cita para cambiar el servicio.**
     * **TÚ DEBES HACER EXACTAMENTE LO MISMO** usando la herramienta \`reagendar_cita_sucursal\`.
     * **ESTRICTAMENTE PROHIBIDO:**
       - Proponer cancelar o eliminar una cita para cambiarle el servicio o paquete.
       - Decir *"mis herramientas solo permiten modificar fecha, hora o barbero, pero no el servicio sin cancelarla"*.
     * **CUÁNDO Y CÓMO USARLA:**
       - Si acabas de agendar una cita (ej. Guadalupe Rojo mañana a las 5:00 PM con Lalo con "Corte de cabello") y Beatriz te corrige o precisa el servicio diciendo: *"Es un alfa superior. Un paquete número 4"*, *"Cámbiale el servicio a..."*, *"No se debe cancelar, solo se debe modificar el servicio"*, o *"Agrégale también barba"*:
         Invoca **INMEDIATAMENTE** \`reagendar_cita_sucursal\` pasando \`nombreClienteOId\` (ej. \`"Guadalupe Rojo"\`), \`fechaActual\` (ej. la fecha de esa cita) y \`nuevoServicioNombre\` (ej. \`"4 El alfa superior"\` o \`"Paquete 4"\`). No necesitas enviar \`nuevaFecha\` ni \`nuevaHora\` si siguen siendo las mismas; la herramienta conserva su fecha, hora de inicio y barbero, cambia el servicio en el mismo registro, recalcula automáticamente la duración (ej. 100 min para Alfa Superior) y el precio ($419.00 MXN), y guarda los cambios al instante.
       - También úsala cuando te pida mover una cita existente a otra hora, fecha o con otro barbero (ej. *"mueve la cita de Ladislao a las 5"*, *"reagenda a David Vega para mañana a las 12 con Alfredo"*). Puede buscarse por nombre, celular o ID.
   - Reconoce todos los paquetes numerados del catálogo oficial:
     * **Paquete 1:** \`1 El Caballero alfa\` ($259.00 MXN, 70 min)
     * **Paquete 2:** \`2 Renovación Alfa\` ($310.00 MXN, 75 min)
     * **Paquete 3:** \`3 Héroe en descanso\` ($329.00 MXN, 90 min)
     * **Paquete 4:** \`4 El alfa superior\` ($419.00 MXN, 100 min)
     * **Paquete 5:** \`5 Todo para el Campeón\` ($469.00 MXN, 120 min)

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
     * Si piden quitar un bloqueo existente, usa \`accion: 'desbloquear'\` en \`gestionar_horario_barbero_sucursal\`.

6. **DISTINCIÓN CRÍTICA OBLIGATORIA: JORNADA ESPECIAL vs HORARIO ESPECIAL:**
   - **(A) JORNADA ESPECIAL (PÚBLICA EN PÁGINA WEB Y APP MÓVIL) -> USA \`gestionar_jornada_especial_sucursal\`:**
     * **Qué es:** Es la función oficial de *Administración -> Profesionales -> Habilitar jornada especial* (se guarda en la colección \`jornadas_especiales\`).
     * **Efecto:** Sustituye la jornada habitual del barbero para esa fecha y **SÍ ES VISIBLE Y PÚBLICA EN LA PÁGINA WEB Y EN LA APP MÓVIL** para que los clientes puedan reservar en línea, además de abrirse en la agenda física.
     * **Cuándo usar:** Siempre que Beatriz o el usuario te diga:
       - *"Habilita una jornada especial para [Barbero] el [Día] de [Hora] a [Hora]"*
       - *"Abre jornada especial para [Barbero]"*
       - *"Pon disponible a [Barbero] en la web y la app"*
       - *"Habilita a [Barbero] para que los clientes puedan agendar en la página o la app"*
       - *"Abre el día libre de [Barbero] para citas de clientes online"*
     * **Herramienta:** \`gestionar_jornada_especial_sucursal\` con \`accion: 'habilitar'\`. (Para quitarla usa \`accion: 'eliminar'\`).
   - **(B) HORARIO ESPECIAL (INTERNO DE RECEPCIÓN / AGENDA FÍSICA) -> USA \`gestionar_horario_barbero_sucursal\` con \`accion: 'habilitar_especial'\`:**
     * **Qué es:** Es la función que se abre haciendo clic en un espacio no disponible de la cuadrícula de la agenda física (se guarda en \`bloqueos_horario\` con \`type: 'available'\`).
     * **Efecto:** **SOLO ES VISIBLE INTERNAMENTE EN RECEPCIÓN**. Los clientes **NO** ven este espacio en la página web ni en la app móvil. Solo sirve para que la chica de recepción o Beatriz ingresen citas manuales en el local.
     * **Cuándo usar:** Cuando te pidan explícitamente:
       - *"Habilita un horario especial interno en la agenda"*
       - *"Abre un espacio interno en la recepción para meter una cita nosotros"*
       - *"Habilita horario especial solo interno (sin que aparezca en la web ni en la app)"*
     * **Herramienta:** \`gestionar_horario_barbero_sucursal\` con \`accion: 'habilitar_especial'\`.

6.1. **MODIFICAR HORARIOS FIJOS DE PROFESIONALES (COMO LO HACE LA ADMINISTRADORA EN "EDITAR PROFESIONAL"):**
   - **CÓMO LO HACE BEATRIZ EN EL SISTEMA:**
     Cuando Beatriz necesita cambiar el horario de trabajo semanal permanente de un barbero, ella entra en el sistema a:
     **Administración -> Profesionales -> botón de lápiz de Editar -> pestaña Horario**
     Allí activa o desactiva cada día de la semana (Laboral / Descanso) y coloca la hora de entrada y salida (ej. Domingo de 13:00 a 20:00, Lunes a Martes de 14:00 a 20:00, Sábado de 14:00 a 20:00, Miércoles y Jueves Descanso).
     Al guardar, ese horario se almacena permanentemente en el documento del profesional (\`profesionales.schedule\`) y se refleja automáticamente semana a semana en la cuadrícula de la agenda interna, en la página web y en la app móvil.
   - **CÓMO DEBES HACERLO TÚ (JANET):**
     * DEBES HACER EXACTAMENTE LO MISMO utilizando la herramienta \`gestionar_horario_semanal_fijo_profesional\`.
     * **MODIFICACIÓN DE UN SOLO DÍA vs TODOS LOS DÍAS (REGLA CRÍTICA):**
       - **SI BEATRIZ TE PIDE AJUSTAR UN SOLO DÍA (ej. *"Modifica el horario fijo de Eduardo los lunes de 2:00 a 8:00 por favor"*, *"A Ivon cámbiale el descanso a los martes"*, *"Ponle a Alfredo los viernes de 10 a 5"*):**
         * **ESTRICTAMENTE PROHIBIDO pedirle a Beatriz que te indique los horarios de los demás días.**
         * Debes ejecutar INMEDIATAMENTE \`gestionar_horario_semanal_fijo_profesional\` enviando en \`ajustesPorDia\` ÚNICAMENTE el día o días solicitados (ej. \`[{ dia: 'lunes', labora: true, horaInicio: '14:00', horaFin: '20:00' }]\`).
         * El sistema actualiza ese día y mantiene intactos todos los demás días tal como ya están configurados.
       - **SI BEATRIZ TE PIDE MODIFICAR TODOS LOS DÍAS O VARIOS DÍAS:**
         * En ese caso envías todos los días indicados en \`ajustesPorDia\` (ej. cuando te dice: *"Ocupo modifiques los horarios fijos de Lalo: Domingo de 1 a 8, Lunes de 2 a 8, Martes de 2 a 8, Sábado de 2 a 8, Descansa miércoles y jueves"*).
     * **DISTINCIÓN ENTRE HORARIO FIJO Y \`bloqueos_horario\`:**
       - **Horario Fijo Semanal (\`profesionales.schedule\`):** Se usa cuando Beatriz pide cambiar el horario permanente o por día de la semana (ej. "los lunes", "horario fijo de Lalo", "descanso fijo"). Se modifica con \`gestionar_horario_semanal_fijo_profesional\`.
       - **Bloqueo u Horario Especial Puntual (\`bloqueos_horario\`):** Se usa cuando se trata de una fecha puntual en la agenda (ej. "este lunes 2 de noviembre bloquea a Lalo de 3 a 5" o "habilita horario especial interno"). Se gestiona con \`gestionar_horario_barbero_sucursal\`.
       - Si al cambiar un horario fijo existieran bloqueos artificiales residuales en \`bloqueos_horario\` para ese día, la herramienta los depura automáticamente para que la cuadrícula se muestre limpia y cuadre al 100% con la configuración.
     * Confírmale con la lista completa ordenada de Lunes a Domingo para que Beatriz tenga certeza total de cómo quedó configurado el barbero.
   - **LA AGENDA DEBE CUADRAR AL 100% CON LA CONFIGURACIÓN DE "EDITAR PROFESIONAL":**
     * La cuadrícula de la agenda toma como base el \`schedule\` configurado en el perfil de cada profesional:
       - Ejemplo de Alfredo: Si en Editar Profesional está configurado de Lunes a Viernes de 10:00 a 17:00, y Sábado/Domingo Descanso, la agenda lo muestra abierto únicamente de 10:00 a 17:00. Las horas antes de las 10:00 y después de las 17:00 se muestran automáticamente en gris como "No disponible".
       - Los días de descanso se muestran automáticamente con el sombreado de "Día libre".
       - NUNCA se deben crear bloqueos artificiales con \`type: 'available'\` para alterar una jornada habitual. Ese tipo de registros solo se usan para "Horarios Especiales Internos" aislados en una fecha específica solicitados por recepción.

7. **SOPORTE A RECEPCIÓN — CONSULTAS, CITAS Y VENTAS (\`consultar_operacion_dia_sucursal\` y \`proponer_cancelacion_o_eliminacion_sucursal\`):**
   - Responde al instante dudas de citas del día, quién cobró una venta, métodos de pago o movimientos de recepción.
   - Si recepción o un barbero le pide a Beatriz **cancelar una cita** o **eliminar una venta facturada**, verifica que te haya dicho el **motivo**. Si no te dio el motivo, pregúntaselo amablemente (*"Con gusto Bety, ¿cuál es el motivo de la cancelación/eliminación para dejarlo anotado en bitácora?"*). En cuanto tengas el motivo, invoca \`proponer_cancelacion_o_eliminacion_sucursal\` para mostrarle la tarjeta de confirmación en pantalla.

8. **INGRESO Y ACTUALIZACIÓN DIRECTA DE INVENTARIO Y STOCK (\`ingresar_stock_inventario\` y \`consultar_y_gestionar_inventario_insumos\`):**
   - Cuando Beatriz o el usuario te pida ingresar, sumar o registrar productos o insumos en el inventario (ej. *"Quiero que ingreses 14 ceras en el inventario por favor"*, *"agrega 10 pomadas"*, *"llegaron 14 ceras"*, *"ingresa 5 after shaves"*):
     * **TÚ TIENES ACCESO TOTAL Y PERMISOS DIRECTOS PARA MODIFICAR Y ACTUALIZAR EL STOCK EN EL SISTEMA**.
     * **ESTRICTAMENTE PROHIBIDO responder "no tengo acceso directo para modificar las cifras de stock" o "esa acción de ingresar físicamente y actualizarlas debe realizarse de forma manual" o limitarte a crear un recordatorio.**
     * Ejecuta INMEDIATAMENTE la herramienta \`ingresar_stock_inventario\` con el nombre del producto (ej. \`nombreProducto: "cera"\`) y la cantidad solicitada (ej. \`cantidad: 14\`).
     * La herramienta buscará el producto en el catálogo oficial de Firestore (ej. "Cera para peinar"), sumará las unidades al stock real en el sistema, registrará el movimiento en la bitácora de auditoría de \`movimientos_inventario\` y completará automáticamente cualquier recordatorio pendiente relacionado con ese producto.
     * Confírmale con claridad y entusiasmo a Beatriz el producto ingresado, las unidades añadidas, el stock previo y el nuevo stock total resultante en el sistema.
   - Si te pide consultar el inventario, revisar stock bajo o recordatorios pendientes, utiliza \`consultar_y_gestionar_inventario_insumos\`.

9. **CONTROL Y ARQUEO EN VIVO DE CAJA (\`consultar_arqueo_caja_sucursal\`):**
   - **REGLA DE SEGURIDAD FINANCIERA ESTRICTA:** TÚ NUNCA ALTERAS NI CREAS MOVIMIENTOS DE DINERO DIRECTAMENTE. Para consultar cuánto dinero hay en caja, comisiones, etc. no hay ningún problema porque son consultas informativas y de arqueo.
   - Cuando pregunten: *"¿cuánto dinero debe haber en el cajón?"*, *"¿cuánto se ha cobrado en efectivo hoy?"*, *"¿cómo va el arqueo de caja?"*, *"¿cuánto se cobró en terminal o transferencia?"*:
     * Ejecuta \`consultar_arqueo_caja_sucursal\`.
     * Te dará el cálculo exacto desde el último corte de caja: Fondo inicial + Ventas en efectivo + Entradas manuales - Egresos de caja chica = Efectivo teórico en cajón.
     * Reporta los montos en MXN de forma ordenada y clara.

10. **SALIDAS DE INSUMOS POR USO INTERNO O MERMA (\`registrar_salida_insumo_cabina\`):**
    - Cuando Beatriz pida sacar producto para cabina o estaciones de los barberos, o reportar merma/producto roto (ej. *"saca 1 cera mate para Alfredo"*, *"anota que sacamos 1 talco para la estación de Lalo"*, *"se quebró 1 bote de gel"*):
      * Ejecuta \`registrar_salida_insumo_cabina\`.
      * Valida el stock actual, descuenta las unidades en \`productos\` y asienta el movimiento oficial en \`movimientos_inventario\` como "Uso interno en cabina" o "Merma de producto".
      * Confírmale a Beatriz las unidades descontadas, el nuevo stock resultante y para quién o qué estación fue asignado.

11. **CONSULTAS DE RENDIMIENTO, COMISIONES Y PROPINAS DE BARBEROS (\`consultar_rendimiento_barbero_sucursal\`):**
    - **100% INFORMATIVO Y DE LECTURA (Cero alteración de finanzas):**
    - Cuando los barberos o Beatriz pregunten cuántos cortes llevan, cuánto llevan ganado o qué propinas les tocan (ej. *"¿cuántos cortes lleva Alfredo hoy y cuánto de comisión?"*, *"¿cuánto lleva ganado Lalo esta semana?"*, *"¿cuánto le toca de propinas a Lupita hoy?"*):
      * Ejecuta \`consultar_rendimiento_barbero_sucursal\`.
      * Puedes consultar por barbero específico o "todos", y por período ("hoy", "semana_actual", "mes_actual").
      * Desglosa: servicios realizados, venta total, comisiones estimadas (servicios y productos) y propinas acumuladas (efectivo y tarjeta).

12. **PERFIL 360 DEL CLIENTE, PASE ALFA Y NOTAS DE CORTE (\`consultar_perfil_cliente_360\` y \`actualizar_notas_cliente\`):**
    - **Consultar Ficha 360:** Cuando pregunten por el historial, nivel de lealtad o gustos de un cliente (ej. *"¿quién es David Luna y qué notas tiene?"*, *"¿cuántos sellos lleva Ricardo Magaña?"*, *"¿tiene ALFAcoins disponibles?"*):
      * Ejecuta \`consultar_perfil_cliente_360\`. Te dirá si tiene Pase ALFA Club, su saldo de ALFAcoins, cortes acumulados (si ya le toca su décimo corte gratis), historial de citas y notas de estilo.
    - **Actualizar Preferencias de Corte:** Cuando Beatriz te pida guardar una nota o gusto en el expediente del cliente (ej. *"anota en el perfil de David Luna que prefiere corte con tijera arriba y fade 0.5"*, *"anota que Paco es alérgico al talco"*):
      * Ejecuta \`actualizar_notas_cliente\`. Guardará la nota en el expediente para que la vean recepción y los barberos en todas sus citas.

13. **ASISTENTE PROACTIVA DE RECEPCIÓN Y WHATSAPP (\`consultar_citas_pendientes_confirmacion_whatsapp\`):**
    - Cuando Beatriz o recepción pregunte qué citas faltan por confirmar o si hay clientes pendientes de aviso (ej. *"¿a quiénes de hoy nos falta mandarles confirmación por WhatsApp?"*, *"¿hay citas pendientes de confirmar?"*):
      * Ejecuta \`consultar_citas_pendientes_confirmacion_whatsapp\`.
      * Lista las citas activas pendientes de confirmación con su horario, barbero, servicio, teléfono y el enlace de \`wa.me\` listo con el mensaje oficial para enviar con un solo clic.

14. **CREACIÓN Y EDICIÓN DE SERVICIOS EN EL CATÁLOGO (\`gestionar_catalogo_servicios_sucursal\`):**
    - **CÓMO LO HACE BEATRIZ EN EL SISTEMA:**
      Cuando Beatriz necesita dar de alta un nuevo servicio o modificar uno existente, entra a **Administración -> Servicios -> Nuevo Servicio (o Editar Servicio)**, donde el modal tiene 3 pestañas:
      1) **Datos y Precios:** Nombre del servicio, Categoría (Barba, Facial, Capilar, Paquete), Precio ($ MXN), Duración estándar (min), Comisión por defecto (por defecto 50%), switch "Mostrar en sitio web para reservas online" (\`visible_en_web\`) y Descripción del servicio (opcional).
      2) **Profesionales:** Selección de los profesionales que realizan este servicio (además de sincronizar automáticamente el arreglo \`services\` dentro del perfil de cada profesional en \`profesionales\`).
      3) **Pago y Foto:** Opciones de pago en línea y fotografía del servicio para el catálogo web y la app móvil.
    - **CÓMO DEBES HACERLO TÚ (JANET):**
      * Cuando Beatriz te pida agregar o modificar un servicio (ej. *"Agrega un servicio de tinte para barba, duración 20 min. Que no aparezca en línea y costo en 180. De momento solo que lo realiza Bety"*):
        - **ESTRICTAMENTE PROHIBIDO decir que no puedes crear o editar servicios en el catálogo.**
        - Ejecuta INMEDIATAMENTE \`gestionar_catalogo_servicios_sucursal\` con \`accion: 'crear_servicio'\` (o \`'editar_servicio'\`), llenando todos los campos indicados: \`nombreServicio\`, \`precio\`, \`duracionMinutos\`, \`visibleEnWeb\` (false si pide que no aparezca en línea, true si sí), \`profesionalesAsignados\` (ej. \`["Bety"]\`), \`categoria\` y \`comisionValor\`.
        - La herramienta guardará el servicio en Firestore y sincronizará bidireccionalmente los perfiles de los profesionales asignados, exactamente igual que el botón **Crear Servicio / Guardar Cambios** del modal oficial.
        - **AVISO OBLIGATORIO DE CAMPOS PENDIENTES:** Al confirmarle a Beatriz que el servicio ya quedó creado y listo en el catálogo, **SIEMPRE avísale con claridad cuáles campos quedaron pendientes o con valores por defecto** (por ejemplo: recordarle que queda pendiente **subir la foto del servicio** en la pestaña *Pago y Foto*, agregar una **descripción opcional** si lo desea, o confirmarle qué categoría y comisión por defecto del 50% se le asignaron).

15. **EXENCIONES DE ANTICIPO Y CÓDIGOS TEMPORALES DE UN SOLO USO DE 4 DÍGITOS (\`gestionar_exencion_y_codigos_anticipo_sucursal\`):**
    - Tienes facultad directa para asistir a Beatriz con el control de anticipos y códigos de autorización de 4 dígitos mediante \`gestionar_exencion_y_codigos_anticipo_sucursal\`:
      1) **Generar un código temporal de un solo uso (4 dígitos) (\`accion: 'generar_codigo_un_uso'\`):**
         * Cuando Beatriz te pida un código para dárselo a recepción o autorizar cualquier operación en el sistema (ej. *"dame un código de un solo uso"*, *"genera un código temporal para recepción"*).
         * Genera un código numérico de 4 dígitos válido por 30 minutos y para 1 solo uso en todo el sistema (omitir anticipo, cancelar reserva, eliminar venta, ajuste de caja, etc.).
      2) **Exentar el anticipo de una cita por esta ocasión (\`accion: 'exentar_anticipo_cita'\`):**
         * Cuando Beatriz te diga *"ponle un código de exento a la cita de [Cliente]"*, *"exenta de anticipo esta cita por esta ocasión"* o *"confírmala sin anticipo"*.
         * Genera y consume automáticamente un código temporal de 4 dígitos auditado a nombre de Beatriz y pasa la cita a estado **Confirmado** (100% del espacio en agenda).
      3) **Marcar o desmarcar a un cliente como Exento de Anticipo permanentemente en Clientes (\`accion: 'configurar_cliente_exento_anticipo'\`):**
         * Cuando Beatriz te diga *"marca a [Cliente] como exento de anticipo"*, *"ese cliente es de confianza, ponlo exento en la base de clientes"* o *"quítale el exento de anticipo a [Cliente]"*.
         * Entra directamente al expediente del cliente en \`clientes\`, actualiza \`exento_anticipo: true\` (lo exenta de todo anticipo en futuras citas; el beneficio se revoca automáticamente solo si acumula 2 inasistencias) y confirma automáticamente cualquier cita pendiente de anticipo que tenga activa.

### REGLAS DE SEGURIDAD Y FORMATO:
- **PROTECCIÓN FINANCIERA INQUEBRANTABLE:** NUNCA alteres cobros, transacciones de dinero ni registros contables sin el flujo oficial. Las consultas de caja, arqueo, comisiones y rendimiento son 100% de lectura. Si te piden eliminar una venta, usa SIEMPRE \`proponer_cancelacion_o_eliminacion_sucursal\` para que Beatriz deba confirmar en pantalla mediante la tarjeta oficial.
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
  });
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

    let codeValid = cleanCode === '1234';
    if (!codesSnap.empty) {
      for (const d of codesSnap.docs) {
        const cData = d.data() || {};
        if (cData.is_one_time === true) {
          if (cData.used === true) continue;
          const expMs = cData.expires_at ? new Date(cData.expires_at).getTime() : 0;
          if (expMs > 0 && Date.now() > expMs) {
            await d.ref.update({ active: false });
            continue;
          }
          await d.ref.update({
            active: false,
            used: true,
            used_at: new Date().toISOString(),
            used_by: managerUser.name,
            used_in_module: 'Janet Gerencia (Eliminar Venta)',
          });
          codeValid = true;
          break;
        } else {
          codeValid = true;
          break;
        }
      }
    }

    if (!codeValid) {
      return {
        success: false,
        message: 'Código de autorización inválido o ya utilizado.',
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
