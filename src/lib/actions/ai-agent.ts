'use server';

import { getDb } from '@/lib/firebase-server';
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getAvailableSlots, createPublicReservation } from '@/lib/actions/booking';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// ==========================================
// 1. HERRAMIENTAS / TOOLS PARA GENKIT
// ==========================================

const consultarServiciosTool = ai.defineTool(
  {
    name: 'consultar_servicios',
    description: 'Obtiene el catalogo de servicios activos de VATOS ALFA con sus IDs, nombres, duracion en minutos y precio en pesos mexicanos.',
    inputSchema: z.object({}),
    outputSchema: z.array(
      z.object({
        id: z.string(),
        nombre: z.string(),
        duracion: z.number(),
        precio: z.number(),
      })
    ),
  },
  async () => {
    try {
      const db = getDb();
      const snap = await db.collection('servicios').where('active', '==', true).get();
      return snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          nombre: d.name || d.nombre || 'Servicio',
          duracion: Number(d.duration || d.duracion || 30),
          precio: Number(d.price || d.precio || 0),
        };
      });
    } catch (e: any) {
      console.error('Error in consultar_servicios:', e);
      return [];
    }
  }
);

const consultarBarberosTool = ai.defineTool(
  {
    name: 'consultar_barberos',
    description: 'Obtiene la lista de barberos/profesionales activos en la barberia con sus IDs y nombres.',
    inputSchema: z.object({}),
    outputSchema: z.array(
      z.object({
        id: z.string(),
        nombre: z.string(),
      })
    ),
  },
  async () => {
    try {
      const db = getDb();
      const snap = await db.collection('profesionales').where('active', '==', true).get();
      return snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          nombre: d.publicName || d.name || 'Barbero',
        };
      });
    } catch (e: any) {
      console.error('Error in consultar_barberos:', e);
      return [];
    }
  }
);

const consultarDisponibilidadTool = ai.defineTool(
  {
    name: 'consultar_disponibilidad',
    description: 'Consulta los horarios libres disponibles para un barbero en una fecha especifica (formato AAAA-MM-DD) y con una duracion en minutos.',
    inputSchema: z.object({
      fecha: z.string().describe('Fecha en formato AAAA-MM-DD (ejemplo 2026-09-18)'),
      profesionalId: z.string().describe('ID del barbero'),
      duracionMinutos: z.number().describe('Duracion del servicio en minutos (por defecto 30)'),
    }),
    outputSchema: z.object({
      horariosDisponibles: z.array(z.string()),
      mensaje: z.string().optional(),
    }),
  },
  async ({ fecha, profesionalId, duracionMinutos }) => {
    try {
      const res = await getAvailableSlots({
        date: fecha,
        professionalId: profesionalId,
        durationMinutes: duracionMinutos || 30,
      });

      if ('error' in res && res.error) {
        return { horariosDisponibles: [], mensaje: res.error };
      }

      return {
        horariosDisponibles: (res as any).slots || [],
        mensaje: (res as any).slots?.length ? undefined : 'No hay horarios disponibles para esa fecha o barbero.',
      };
    } catch (e: any) {
      console.error('Error in consultar_disponibilidad:', e);
      return { horariosDisponibles: [], mensaje: e.message };
    }
  }
);

const crearCitaTool = ai.defineTool(
  {
    name: 'crear_cita',
    description: 'Crea y confirma una cita en la agenda de la barberia cuando el cliente ha validado fecha, hora, barbero y servicio.',
    inputSchema: z.object({
      fecha: z.string().describe('Fecha de la cita AAAA-MM-DD'),
      hora: z.string().describe('Hora de inicio en formato HH:mm (ejemplo 15:30)'),
      profesionalId: z.string().describe('ID del barbero'),
      servicioIds: z.array(z.string()).describe('Lista con al menos un ID de servicio'),
      nombreCliente: z.string().describe('Nombre del cliente'),
      telefonoCliente: z.string().describe('Telefono del cliente con lada o 10 digitos'),
      notas: z.string().optional().describe('Notas o peticiones especiales'),
    }),
    outputSchema: z.object({
      exito: z.boolean(),
      citaId: z.string().optional(),
      mensaje: z.string(),
    }),
  },
  async ({ fecha, hora, profesionalId, servicioIds, nombreCliente, telefonoCliente, notas }) => {
    try {
      const res = await createPublicReservation({
        client: {
          name: nombreCliente,
          phone: telefonoCliente,
        },
        serviceIds: servicioIds,
        professionalId: profesionalId,
        date: fecha,
        time: hora,
        notes: notas || 'Agendado por Asistente Virtual AI',
      });

      if ('error' in res && res.error) {
        return { exito: false, mensaje: res.error };
      }

      return {
        exito: true,
        citaId: (res as any).reservationId || (res as any).id,
        mensaje: '¡Cita confirmada y registrada en la agenda con éxito!',
      };
    } catch (e: any) {
      console.error('Error in crear_cita:', e);
      return { exito: false, mensaje: e.message || 'No se pudo crear la cita.' };
    }
  }
);

const consultarCitasClienteTool = ai.defineTool(
  {
    name: 'consultar_citas_cliente',
    description: 'Consulta las citas futuras o programadas que tiene el cliente buscando por su numero de telefono.',
    inputSchema: z.object({
      telefono: z.string().describe('Numero de telefono del cliente'),
    }),
    outputSchema: z.array(
      z.object({
        id: z.string(),
        fecha: z.string(),
        hora: z.string(),
        servicio: z.string(),
        barbero: z.string(),
        estado: z.string(),
      })
    ),
  },
  async ({ telefono }) => {
    try {
      const db = getDb();
      const cleanPhone = telefono.replace(/\D/g, '').slice(-10);
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      const snap = await db
        .collection('reservas')
        .where('fecha', '>=', todayStr)
        .get();

      const filtered = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .filter((r) => {
          const rPhone = (r.customer?.telefono || r.customerPhone || '').replace(/\D/g, '');
          return rPhone.includes(cleanPhone) && r.estado !== 'cancelada';
        })
        .map((r) => ({
          id: r.id,
          fecha: r.fecha,
          hora: r.hora_inicio,
          servicio: r.servicio || 'Servicio',
          barbero: r.professionalNames || r.barbero_nombre || 'Barbero asignado',
          estado: r.estado || 'confirmada',
        }));

      return filtered;
    } catch (e: any) {
      console.error('Error in consultar_citas_cliente:', e);
      return [];
    }
  }
);

const cancelarCitaTool = ai.defineTool(
  {
    name: 'cancelar_cita',
    description: 'Cancela una cita del cliente por su ID.',
    inputSchema: z.object({
      citaId: z.string().describe('ID de la reserva'),
      motivo: z.string().optional().describe('Motivo de la cancelacion'),
    }),
    outputSchema: z.object({
      exito: z.boolean(),
      mensaje: z.string(),
    }),
  },
  async ({ citaId, motivo }) => {
    try {
      const db = getDb();
      const ref = db.collection('reservas').doc(citaId);
      const doc = await ref.get();
      if (!doc.exists) {
        return { exito: false, mensaje: 'La cita no existe o ya fue cancelada.' };
      }

      await ref.update({
        estado: 'cancelada',
        motivo_cancelacion: motivo || 'Cancelada por cliente via Asistente Virtual',
        cancelada_en: Timestamp.now(),
      });

      return { exito: true, mensaje: 'Tu cita ha sido cancelada correctamente.' };
    } catch (e: any) {
      console.error('Error in cancelar_cita:', e);
      return { exito: false, mensaje: e.message || 'Error al cancelar la cita.' };
    }
  }
);

const solicitarRecepcionTool = ai.defineTool(
  {
    name: 'solicitar_recepcion',
    description: 'Notifica y transfiere la conversacion al personal de recepcion humano cuando el cliente tiene una duda compleja o pide hablar con una persona.',
    inputSchema: z.object({
      conversationId: z.string().describe('ID de la conversacion'),
      motivo: z.string().describe('Motivo o duda por la cual requiere atencion humana'),
    }),
    outputSchema: z.object({
      exito: z.boolean(),
      mensaje: z.string(),
    }),
  },
  async ({ conversationId, motivo }) => {
    try {
      const db = getDb();
      await db.collection('conversaciones').doc(conversationId).set(
        {
          modo_atencion: 'requiere_atencion',
          motivo_atencion_humana: motivo,
          updated_at: Timestamp.now(),
        },
        { merge: true }
      );

      return {
        exito: true,
        mensaje: 'He avisado a nuestro equipo de recepción. En breve un recepcionista continuará la conversación contigo.',
      };
    } catch (e: any) {
      console.error('Error in solicitar_recepcion:', e);
      return { exito: false, mensaje: e.message };
    }
  }
);

// ==========================================
// 2. MOTOR CONVERSACIONAL RESILIENTE (FALLBACK)
// ==========================================

async function executeFallbackLogic({
  conversationId,
  clientPhone,
  clientName,
  userMessage,
}: {
  conversationId: string;
  clientPhone: string;
  clientName?: string;
  userMessage: string;
}): Promise<string> {
  const db = getDb();
  const text = userMessage.toLowerCase().trim();

  // 1. Saludo
  if (/^(hola|buen[ao]s|que tal|buenas tardes|buenas noches|buenos d[ií]as|hey|qui[uú]bole)/i.test(text)) {
    const greetingName = clientName ? ' ' + clientName : '';
    return '¡Qué tal' + greetingName + '! Bienvenido a VATOS ALFA Barber Shop 💈✂️\n\n¿En qué te podemos ayudar hoy?\n\n1️⃣ Agendar una cita\n2️⃣ Ver servicios y precios\n3️⃣ Conocer a nuestros barberos\n4️⃣ Consultar o cancelar mis citas\n5️⃣ Hablar con recepción';
  }

  // 2. Servicios / Precios
  if (/(servicio|precio|costo|cuanto cuesta|corte|barba|paquete|que hacen|menu)/i.test(text)) {
    const snap = await db.collection('servicios').where('active', '==', true).get();
    if (snap.empty) {
      return 'Actualmente no tenemos servicios listados. Por favor contacta a recepción.';
    }
    const list = snap.docs
      .map((d) => {
        const data = d.data();
        return '• *' + (data.name || data.nombre) + '* (' + (data.duration || 30) + ' min) - $' + (data.price || data.precio || 0) + ' MXN';
      })
      .join('\n');
    return '💈 *Nuestros Servicios en VATOS ALFA:*\n\n' + list + '\n\n¿Cuál de estos te gustaría agendar y para qué día?';
  }

  // 3. Barberos / Equipo
  if (/(barbero|profesional|quien atiende|personal|equipo|quienes cortan)/i.test(text)) {
    const snap = await db.collection('profesionales').where('active', '==', true).get();
    if (snap.empty) {
      return 'Contamos con un equipo de barberos profesionales. ¿Para qué fecha buscas tu cita?';
    }
    const list = snap.docs
      .map((d) => {
        const data = d.data();
        return '• *' + (data.publicName || data.name) + '*';
      })
      .join('\n');
    return '💈 *Nuestro Equipo de Barberos:*\n\n' + list + '\n\n¿Tienes preferencia por alguno en particular o te asignamos el primer espacio disponible?';
  }

  // 4. Mis Citas
  if (/(mis citas|tengo cita|cuando es mi cita|mi reserva|revisar cita)/i.test(text)) {
    const cleanPhone = clientPhone.replace(/\D/g, '').slice(-10);
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const snap = await db.collection('reservas').where('fecha', '>=', todayStr).get();

    const clientCitas = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .filter((r) => {
        const rPhone = (r.customer?.telefono || r.customerPhone || '').replace(/\D/g, '');
        return rPhone.includes(cleanPhone) && r.estado !== 'cancelada';
      });

    if (clientCitas.length === 0) {
      return 'No encontramos citas activas próximas registradas con tu número de teléfono. ¿Te gustaría agendar una nueva cita?';
    }

    const citasTxt = clientCitas
      .map((c) => '📅 *' + c.fecha + '* a las *' + c.hora_inicio + '*\n💈 Servicio: ' + c.servicio + '\n✂️ Barbero: ' + (c.professionalNames || 'Barbero'))
      .join('\n\n');

    return '📋 *Tus citas próximas en VATOS ALFA:*\n\n' + citasTxt + '\n\nSi deseas cancelar o reagendar alguna, indícanoslo.';
  }

  // 5. Cancelar Cita
  if (/(cancelar cita|cancela mi cita|cancelar mi reserva|ya no voy a poder)/i.test(text)) {
    const cleanPhone = clientPhone.replace(/\D/g, '').slice(-10);
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const snap = await db.collection('reservas').where('fecha', '>=', todayStr).get();

    const nextCita = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .find((r) => {
        const rPhone = (r.customer?.telefono || r.customerPhone || '').replace(/\D/g, '');
        return rPhone.includes(cleanPhone) && r.estado !== 'cancelada';
      });

    if (!nextCita) {
      return 'No encontramos citas activas para cancelar con tu número. Si necesitas ayuda directa, escribe *recepción*.';
    }

    await db.collection('reservas').doc(nextCita.id).update({
      estado: 'cancelada',
      motivo_cancelacion: 'Cancelada por cliente via chatbot',
      cancelada_en: Timestamp.now(),
    });

    return '✅ Tu cita del día *' + nextCita.fecha + '* a las *' + nextCita.hora_inicio + '* ha sido cancelada exitosamente. ¡Esperamos verte pronto de nuevo!';
  }

  // 6. Pedir hablar con humano / recepción
  if (/(recepcion|recepción|humano|persona|hablar con alguien|duda|queja|ayuda)/i.test(text)) {
    await db.collection('conversaciones').doc(conversationId).set(
      {
        modo_atencion: 'requiere_atencion',
        motivo_atencion_humana: userMessage,
        updated_at: Timestamp.now(),
      },
      { merge: true }
    );
    return '🔔 Entendido. He transferido esta conversación a nuestro equipo de recepción. En unos momentos un recepcionista humano te responderá por este mismo medio.';
  }

  // 7. Horarios / Disponibilidad
  if (/(horario|disponible|libre|mañana|hoy|tarde|temprano)/i.test(text)) {
    const dateToSearch = /mañana/i.test(text)
      ? format(new Date(Date.now() + 86400000), 'yyyy-MM-dd')
      : format(new Date(), 'yyyy-MM-dd');

    const profsSnap = await db.collection('profesionales').where('active', '==', true).limit(1).get();
    if (!profsSnap.empty) {
      const p = profsSnap.docs[0];
      const slotsRes = await getAvailableSlots({
        date: dateToSearch,
        professionalId: p.id,
        durationMinutes: 30,
      });

      if ('slots' in slotsRes && slotsRes.slots && slotsRes.slots.length > 0) {
        const sampleSlots = slotsRes.slots.slice(0, 8).join(', ');
        return '🕒 Para el día *' + dateToSearch + '* con *' + (p.data().publicName || p.data().name) + '*, tenemos horarios como:\n' + sampleSlots + '...\n\n¿Qué hora prefieres para confirmar tu cita?';
      }
    }

    return 'Con gusto revisamos disponibilidad para ' + dateToSearch + '. ¿A qué hora te gustaría asistir y con qué barbero?';
  }

  // Respuesta por defecto
  return 'Entendido. Para ayudarte mejor con tu cita en VATOS ALFA, ¿podrías indicarme qué servicio te gustaría realizarte y qué día prefieres venir? (O si prefieres, escribe *recepción* para hablar con nuestro equipo).';
}

// ==========================================
// 3. SERVER ACTIONS PRINCIPALES
// ==========================================

export async function processAgentMessage({
  conversationId,
  clientPhone,
  clientName,
  userMessage,
  channel = 'whatsapp',
}: {
  conversationId: string;
  clientPhone: string;
  clientName?: string;
  userMessage: string;
  channel?: 'whatsapp' | 'simulador';
}) {
  try {
    const db = getDb();
    const convRef = db.collection('conversaciones').doc(conversationId);
    const convDoc = await convRef.get();

    let convData = convDoc.exists ? convDoc.data() : null;
    const now = Timestamp.now();

    // 1. Guardar mensaje del cliente en la subcolección
    const msgRef = convRef.collection('mensajes').doc();
    await msgRef.set({
      id: msgRef.id,
      conversation_id: conversationId,
      de: 'cliente',
      texto: userMessage,
      timestamp: now,
      tipo: 'texto',
      estado: 'enviado',
    });

    // Actualizar datos de la conversación
    const currentMode = convData?.modo_atencion || 'bot_activo';
    await convRef.set(
      {
        id: conversationId,
        cliente_telefono: clientPhone,
        cliente_nombre: clientName || convData?.cliente_nombre || 'Cliente',
        ultimo_mensaje: userMessage,
        fecha_ultimo_mensaje: now,
        mensajes_no_leidos: FieldValue.increment(1),
        modo_atencion: currentMode,
        canal: channel,
        updated_at: now,
        ...(convDoc.exists ? {} : { created_at: now }),
      },
      { merge: true }
    );

    // 2. Si el humano está al mando, el bot no responde automáticamente
    if (currentMode === 'humano_al_mando') {
      return {
        success: true,
        replied: false,
        status: 'humano_al_mando',
        message: 'Mensaje recibido. El personal de recepción responderá en breve.',
      };
    }

    // 3. Intentar generar respuesta con Genkit + Gemini
    let botReplyText = '';
    let toolsUsed: string[] = [];

    try {
      const todayStr = format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es });
      const systemPrompt = `Eres la recepcionista virtual inteligente de VATOS ALFA Barber Shop.
Tu labor es atender cordialmente a los clientes por WhatsApp, resolver sus dudas de servicios, consultar horarios libres y agendar o cancelar citas.
Hoy es: ${todayStr}.
Ubicacion: Querétaro, México.
Cliente: ${clientName || 'Cliente'} (Teléfono: ${clientPhone}).

Instrucciones:
- Sé amable, educado y conciso.
- Para consultar disponibilidad usa la herramienta 'consultar_disponibilidad'.
- Para ver servicios usa 'consultar_servicios'.
- Para ver barberos usa 'consultar_barberos'.
- Cuando el cliente confirme todos los datos (servicio, barbero, fecha, hora), usa la herramienta 'crear_cita'.
- Si el cliente quiere cancelar o ver sus citas, usa 'consultar_citas_cliente' o 'cancelar_cita'.
- Si el cliente solicita hablar con alguien o tiene una duda especial, usa 'solicitar_recepcion'.
- Formatea tus mensajes con negritas y emojis discretos aptos para WhatsApp.`;

      const genkitResponse = await ai.generate({
        system: systemPrompt,
        prompt: userMessage,
        tools: [
          consultarServiciosTool,
          consultarBarberosTool,
          consultarDisponibilidadTool,
          crearCitaTool,
          consultarCitasClienteTool,
          cancelarCitaTool,
          solicitarRecepcionTool,
        ],
      });

      botReplyText = genkitResponse.text || '';
    } catch (aiError: any) {
      console.warn('Genkit generation failed or API key not configured, falling back to resilient engine:', aiError.message);
      botReplyText = await executeFallbackLogic({
        conversationId,
        clientPhone,
        clientName,
        userMessage,
      });
    }

    if (!botReplyText) {
      botReplyText = '¡Gracias por tu mensaje! En VATOS ALFA con gusto te atendemos. ¿En qué servicio estás interesado?';
    }

    // 4. Guardar respuesta del bot en Firestore
    const botMsgRef = convRef.collection('mensajes').doc();
    await botMsgRef.set({
      id: botMsgRef.id,
      conversation_id: conversationId,
      de: 'bot',
      texto: botReplyText,
      timestamp: Timestamp.now(),
      tipo: 'texto',
      estado: 'enviado',
    });

    await convRef.update({
      ultimo_mensaje: botReplyText,
      fecha_ultimo_mensaje: Timestamp.now(),
    });

    return {
      success: true,
      replied: true,
      botReply: botReplyText,
      toolsUsed,
    };
  } catch (error: any) {
    console.error('Error processing agent message:', error);
    return {
      success: false,
      error: error.message || 'Error procesando el mensaje.',
    };
  }
}

export async function sendStaffMessage({
  conversationId,
  messageText,
  staffName,
}: {
  conversationId: string;
  messageText: string;
  staffName?: string;
}) {
  try {
    const db = getDb();
    const convRef = db.collection('conversaciones').doc(conversationId);
    const now = Timestamp.now();

    const msgRef = convRef.collection('mensajes').doc();
    await msgRef.set({
      id: msgRef.id,
      conversation_id: conversationId,
      de: 'recepcion',
      texto: messageText,
      timestamp: now,
      tipo: 'texto',
      estado: 'enviado',
      metadata: {
        staffName: staffName || 'Recepción',
      },
    });

    await convRef.set(
      {
        ultimo_mensaje: messageText,
        fecha_ultimo_mensaje: now,
        mensajes_no_leidos: 0,
        modo_atencion: 'humano_al_mando',
        updated_at: now,
      },
      { merge: true }
    );

    return { success: true };
  } catch (error: any) {
    console.error('Error sending staff message:', error);
    return { success: false, error: error.message };
  }
}

export async function toggleConversationMode({
  conversationId,
  mode,
}: {
  conversationId: string;
  mode: 'bot_activo' | 'humano_al_mando' | 'requiere_atencion';
}) {
  try {
    const db = getDb();
    const convRef = db.collection('conversaciones').doc(conversationId);
    const now = Timestamp.now();

    await convRef.set(
      {
        modo_atencion: mode,
        updated_at: now,
      },
      { merge: true }
    );

    const msgRef = convRef.collection('mensajes').doc();
    const notificationText =
      mode === 'humano_al_mando'
        ? '👤 La recepción tomó el control de la conversación (Bot pausado).'
        : mode === 'bot_activo'
        ? '🤖 Asistente virtual (Bot) reactivado.'
        : '⚠️ Marcado como: Requiere atención de recepción.';

    await msgRef.set({
      id: msgRef.id,
      conversation_id: conversationId,
      de: 'recepcion',
      texto: notificationText,
      timestamp: now,
      tipo: 'sistema',
    });

    return { success: true, mode };
  } catch (error: any) {
    console.error('Error toggling conversation mode:', error);
    return { success: false, error: error.message };
  }
}

export async function markConversationAsRead({ conversationId }: { conversationId: string }) {
  try {
    const db = getDb();
    await db.collection('conversaciones').doc(conversationId).set(
      {
        mensajes_no_leidos: 0,
        updated_at: Timestamp.now(),
      },
      { merge: true }
    );
    return { success: true };
  } catch (error: any) {
    console.error('Error marking conversation as read:', error);
    return { success: false, error: error.message };
  }
}

export async function getClientDetailsForChat({ phone }: { phone: string }) {
  try {
    const db = getDb();
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    const clientsSnap = await db.collection('clientes').get();
    const clientDoc = clientsSnap.docs.find((d) => {
      const p = (d.data().telefono || '').replace(/\D/g, '');
      return p.includes(cleanPhone);
    });

    const client = clientDoc ? { id: clientDoc.id, ...clientDoc.data() } : null;

    const reservasSnap = await db.collection('reservas').orderBy('fecha', 'desc').limit(20).get();
    const clientReservas = reservasSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .filter((r) => {
        const rPhone = (r.customer?.telefono || r.customerPhone || '').replace(/\D/g, '');
        return rPhone.includes(cleanPhone);
      })
      .slice(0, 5);

    return {
      success: true,
      client,
      recentAppointments: clientReservas,
    };
  } catch (error: any) {
    console.error('Error getting client details:', error);
    return { success: false, error: error.message };
  }
}

export async function exportClientsToVCard() {
  try {
    const db = getDb();
    const snap = await db.collection('clientes').get();

    let vcfString = '';
    let count = 0;

    snap.docs.forEach((doc) => {
      const c = doc.data();
      const nombre = (c.nombre || '').trim();
      const apellido = (c.apellido || '').trim();
      const fullName = (nombre + ' ' + apellido).trim() || 'Cliente VATOS ALFA';
      const telefono = (c.telefono || '').replace(/[^0-9+]/g, '');
      const email = (c.correo || c.email || '').trim();

      if (!telefono && !nombre) return;

      count++;
      vcfString += 'BEGIN:VCARD\r\n';
      vcfString += 'VERSION:3.0\r\n';
      vcfString += 'FN:' + fullName + '\r\n';
      vcfString += 'N:' + apellido + ';' + nombre + ';;;\r\n';
      if (telefono) {
        vcfString += 'TEL;TYPE=CELL:' + telefono + '\r\n';
      }
      if (email) {
        vcfString += 'EMAIL:' + email + '\r\n';
      }
      vcfString += 'ORG:VATOS ALFA Barber Shop\r\n';
      vcfString += 'NOTE:Exportado desde Agenda VATOS ALFA\r\n';
      vcfString += 'END:VCARD\r\n';
    });

    return {
      success: true,
      count,
      vcfContent: vcfString,
    };
  } catch (error: any) {
    console.error('Error exporting clients to vCard:', error);
    return { success: false, error: error.message };
  }
}
