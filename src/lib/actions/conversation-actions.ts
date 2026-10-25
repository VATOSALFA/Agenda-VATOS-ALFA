'use server';

import { getDb } from '@/lib/firebase-server';
import { computeClientLoyaltySummary } from '@/lib/ai/agent-loyalty-knowledge';

function sanitizeFirestoreData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data === 'object') {
    if (typeof data.toDate === 'function') {
      return data.toDate().toISOString();
    }
    if (data instanceof Date) {
      return data.toISOString();
    }
    if (Array.isArray(data)) {
      return data.map(sanitizeFirestoreData);
    }
    const result: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      result[key] = sanitizeFirestoreData(data[key]);
    }
    return result;
  }
  return data;
}

export async function sendStaffMessage({
  conversationId,
  messageText,
  imageUrl,
  audioUrl,
  audioDuration,
  fileUrl,
  fileName,
  fileSize,
  fileMimeType,
  staffName,
  pauseBot = false,
}: {
  conversationId: string;
  messageText: string;
  imageUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
  staffName?: string;
  pauseBot?: boolean;
}) {
  try {
    const db = getDb();
    const convRef = db.collection('conversaciones').doc(conversationId);
    const convDoc = await convRef.get();
    const convData = convDoc.exists ? convDoc.data() : null;
    const now = new Date();

    const msgRef = convRef.collection('mensajes').doc();
    const tipo = audioUrl ? 'audio' : imageUrl ? 'imagen' : fileUrl ? 'archivo' : 'texto';
    await msgRef.set({
      id: msgRef.id,
      conversation_id: conversationId,
      de: 'recepcion',
      texto: messageText,
      timestamp: now,
      tipo,
      mediaUrl: audioUrl || imageUrl || fileUrl || null,
      estado: 'enviado',
      metadata: {
        staffName: staffName || 'Recepción',
        ...(audioDuration ? { duration: audioDuration } : {}),
        ...(fileName ? { fileName } : {}),
        ...(fileSize ? { fileSize } : {}),
        ...(fileMimeType ? { fileMimeType } : {}),
      },
    });

    const updatePayload: Record<string, any> = {
      ultimo_mensaje: messageText,
      fecha_ultimo_mensaje: now,
      mensajes_no_leidos: 0,
      updated_at: now,
    };

    // Solo si explícitamente se pide pausar el bot o si estaba en "requiere_atencion",
    // se cambia a "humano_al_mando". Si estaba en "bot_activo" y no se pidió pausar, SE MANTIENE "bot_activo".
    if (pauseBot) {
      updatePayload.modo_atencion = 'humano_al_mando';
    } else if (convData?.modo_atencion === 'requiere_atencion') {
      updatePayload.modo_atencion = 'humano_al_mando';
    }

    await convRef.set(updatePayload, { merge: true });

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
    const now = new Date();

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
        updated_at: new Date(),
      },
      { merge: true }
    );
    return { success: true };
  } catch (error: any) {
    console.error('Error marking conversation as read:', error);
    return { success: false, error: error.message };
  }
}

export async function getClientDetailsForChat({
  phone,
  clientId,
  email,
}: {
  phone?: string;
  clientId?: string;
  email?: string;
}) {
  try {
    const db = getDb();
    const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);

    let clientDoc: any = null;

    // 1. Buscar por ID directo si viene
    if (clientId) {
      const docRef = await db.collection('clientes').doc(clientId).get();
      if (docRef.exists) {
        clientDoc = docRef;
      }
    }

    // 2. Si no se encontró por ID o no venía, buscar por teléfono
    if (!clientDoc && cleanPhone) {
      const variants = Array.from(new Set([phone, cleanPhone, `52${cleanPhone}`, `521${cleanPhone}`].filter(Boolean)));
      for (const variant of variants) {
        const snap = await db.collection('clientes').where('telefono', '==', variant).limit(1).get();
        if (!snap.empty) {
          clientDoc = snap.docs[0];
          break;
        }
      }
      if (!clientDoc) {
        const clientsSnap = await db.collection('clientes').get();
        clientDoc = clientsSnap.docs.find((d) => {
          const p = (d.data().telefono || '').replace(/\D/g, '');
          return p.includes(cleanPhone);
        });
      }
    }

    // 3. Si no se encontró por ID ni teléfono, buscar por correo/email
    if (!clientDoc && email && email.includes('@')) {
      const cleanEmail = email.trim().toLowerCase();
      const emailSnap = await db.collection('clientes').where('correo', '==', cleanEmail).limit(1).get();
      if (!emailSnap.empty) {
        clientDoc = emailSnap.docs[0];
      } else {
        const legacyEmailSnap = await db.collection('clientes').where('email', '==', cleanEmail).limit(1).get();
        if (!legacyEmailSnap.empty) {
          clientDoc = legacyEmailSnap.docs[0];
        }
      }
    }

    const resolvedClientId = clientDoc?.id || clientId;
    const clientData = clientDoc ? { id: clientDoc.id, ...clientDoc.data() } : null;

    // 3. Cargar profesionales y configuración de Pase Alfa
    const [profsSnap, paseAlfaDoc, appMovilDoc] = await Promise.all([
      db.collection('profesionales').get(),
      db.collection('configuracion').doc('pase_alfa').get(),
      db.collection('configuracion').doc('app_movil').get(),
    ]);
    const profMap: Record<string, string> = {};
    profsSnap.docs.forEach((p) => {
      const pd = p.data();
      profMap[p.id] = pd.publicName || pd.name || 'Barbero';
    });

    // 4. Buscar todas las reservas del cliente (por cliente_id y por cliente_telefono indexado)
    let clientReservas: Array<any> = [];
    const seenResIds = new Set<string>();

    if (resolvedClientId) {
      const byClientSnap = await db.collection('reservas').where('cliente_id', '==', resolvedClientId).get();
      byClientSnap.docs.forEach((d) => {
        seenResIds.add(d.id);
        clientReservas.push({ id: d.id, ...d.data() });
      });
    }

    if (cleanPhone) {
      const phoneVariants = Array.from(new Set([cleanPhone, `52${cleanPhone}`, `521${cleanPhone}`]));
      for (const pv of phoneVariants) {
        const byPhoneSnap = await db.collection('reservas').where('cliente_telefono', '==', pv).get();
        byPhoneSnap.docs.forEach((d) => {
          if (!seenResIds.has(d.id)) {
            seenResIds.add(d.id);
            clientReservas.push({ id: d.id, ...d.data() });
          }
        });
      }
    }

    // 5. Calcular métricas dinámicas exactas coincidentes con la Ficha de Cliente
    const totalCitas = clientReservas.length;
    const citasAsistidas = clientReservas.filter((r) =>
      ['Asiste', 'Pagado', 'confirmada', 'Completado', 'asistida'].includes(r.estado)
    ).length;
    const citasNoAsistidas = clientReservas.filter((r) =>
      ['No asiste', 'no_asiste'].includes(r.estado)
    ).length;
    const citasCanceladas = clientReservas.filter((r) =>
      ['Cancelado', 'cancelada'].includes(r.estado)
    ).length;

    // 6. Consultar ventas y gasto total
    let totalSpent = 0;
    let totalCompras = 0;
    if (resolvedClientId) {
      try {
        const salesSnap = await db.collection('ventas').where('cliente_id', '==', resolvedClientId).get();
        const validSales = salesSnap.docs
          .map((d) => d.data())
          .filter((s) => !['Pendiente', 'Anulado', 'Cancelado'].includes(s.pago_estado || ''));
        totalCompras = validSales.length;
        totalSpent = validSales.reduce((acc, s) => {
          const amount =
            s.monto_pagado_real !== undefined && s.monto_pagado_real !== null
              ? Number(s.monto_pagado_real)
              : Number(s.total || 0);
          return acc + amount;
        }, 0);
      } catch (err) {
        console.error('Error fetching sales in getClientDetailsForChat:', err);
      }
    }

    // 7. Ordenar por fecha y hora descendente
    clientReservas.sort((a, b) => {
      const dateA = a.fecha ? new Date(`${a.fecha}T${a.hora_inicio || '00:00'}:00`).getTime() : 0;
      const dateB = b.fecha ? new Date(`${b.fecha}T${b.hora_inicio || '00:00'}:00`).getTime() : 0;
      return dateB - dateA;
    });

    // Enriquecer reservas recientes con nombres de barberos
    const enrichedRecent = clientReservas.slice(0, 10).map((r) => {
      let bName = r.professionalNames || r.barbero_nombre;
      if (!bName) {
        const bId = r.barbero_id || (r.items && r.items[0]?.barbero_id);
        if (bId && profMap[bId]) {
          bName = profMap[bId];
        }
      }
      return {
        ...r,
        professionalNames: bName || 'Barbero',
      };
    });

    // 8. Calcular barbero habitual y servicio más frecuente del cliente
    const barberCounts: Record<string, number> = {};
    const serviceCounts: Record<string, number> = {};
    let lastVisitDate: string | null = null;

    clientReservas.forEach((r) => {
      let bName = r.professionalNames || r.barbero_nombre;
      if (!bName) {
        const bId = r.barbero_id || (r.items && r.items[0]?.barbero_id);
        if (bId && profMap[bId]) bName = profMap[bId];
      }
      if (bName) barberCounts[bName] = (barberCounts[bName] || 0) + 1;

      const sName = r.servicio || (r.items && r.items[0]?.nombre);
      if (sName) serviceCounts[sName] = (serviceCounts[sName] || 0) + 1;

      if (!lastVisitDate && ['Asiste', 'Pagado', 'confirmada', 'Completado'].includes(r.estado) && r.fecha) {
        lastVisitDate = r.fecha;
      }
    });

    let frequentBarber = '';
    let maxBarberVisits = 0;
    for (const [b, count] of Object.entries(barberCounts)) {
      if (count > maxBarberVisits) {
        maxBarberVisits = count;
        frequentBarber = b;
      }
    }

    let frequentService = '';
    let maxServiceCount = 0;
    for (const [s, count] of Object.entries(serviceCounts)) {
      if (count > maxServiceCount) {
        maxServiceCount = count;
        frequentService = s;
      }
    }

    const enrichedClient = clientData
      ? {
          ...clientData,
          citas_totales: totalCitas,
          citas_asistidas: citasAsistidas,
          citas_no_asistidas: citasNoAsistidas,
          citas_canceladas: citasCanceladas,
          gasto_total: totalSpent,
          total_compras: totalCompras,
          barbero_habitual: frequentBarber,
          servicio_habitual: frequentService,
        }
      : null;

    const loyalty = enrichedClient
      ? computeClientLoyaltySummary(
          enrichedClient,
          paseAlfaDoc.exists ? paseAlfaDoc.data() : null,
          appMovilDoc.exists ? appMovilDoc.data() : null
        )
      : null;

    return {
      success: true,
      client: sanitizeFirestoreData(enrichedClient),
      loyalty,
      recentAppointments: sanitizeFirestoreData(enrichedRecent),
      totalSpent,
      totalCompras,
      frequentBarber,
      frequentBarberVisits: maxBarberVisits,
      frequentService,
      lastVisitDate,
      metrics: {
        total: totalCitas,
        asistidas: citasAsistidas,
        noAsistidas: citasNoAsistidas,
        canceladas: citasCanceladas,
      },
    };
  } catch (error: any) {
    console.error('Error getting client details:', error);
    return { success: false, error: error.message };
  }
}

export async function updateConversationTags({
  conversationId,
  tags,
}: {
  conversationId: string;
  tags: string[];
}) {
  try {
    const db = getDb();
    await db.collection('conversaciones').doc(conversationId).set(
      {
        etiquetas: tags,
        updated_at: new Date(),
      },
      { merge: true }
    );
    return { success: true };
  } catch (error: any) {
    console.error('Error updating conversation tags:', error);
    return { success: false, error: error.message };
  }
}

export async function sendInternalStaffNote({
  conversationId,
  noteText,
  staffName,
}: {
  conversationId: string;
  noteText: string;
  staffName?: string;
}) {
  try {
    const db = getDb();
    const convRef = db.collection('conversaciones').doc(conversationId);
    const now = new Date();

    const msgRef = convRef.collection('mensajes').doc();
    await msgRef.set({
      id: msgRef.id,
      conversation_id: conversationId,
      de: 'recepcion',
      texto: noteText,
      timestamp: now,
      tipo: 'nota_interna',
      estado: 'enviado',
      metadata: {
        staffName: staffName || 'Recepción',
        es_nota_interna: true,
      },
    });

    await convRef.set(
      {
        notas_internas: noteText,
        updated_at: now,
      },
      { merge: true }
    );

    return { success: true };
  } catch (error: any) {
    console.error('Error sending staff internal note:', error);
    return { success: false, error: error.message };
  }
}

export async function confirmReservationByStaff({ reservationId, staffName }: { reservationId: string; staffName?: string }) {
  try {
    const db = getDb();
    const now = new Date();
    await db.collection('reservas').doc(reservationId).update({
      estado: 'confirmada',
      confirmada_por_cliente: true,
      confirmada_en: now,
      confirmada_por: staffName || 'Recepción',
      etiqueta_recordatorio: 'confirmada',
      whatsappConfirmationSent: true,
      updated_at: now,
    });
    return { success: true };
  } catch (error: any) {
    console.error('Error confirming reservation by staff:', error);
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
      if (c.notas || c.nota) {
        vcfString += 'NOTE:' + ((c.notas || c.nota).replace(/\r?\n/g, ' ')) + '\r\n';
      }
      vcfString += 'ORG:VATOS ALFA Barber Shop\r\n';
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

export async function deleteConversation(conversationId: string) {
  try {
    const db = getDb();
    const convRef = db.collection('conversaciones').doc(conversationId);

    // Delete all messages in the subcollection
    const messagesSnap = await convRef.collection('mensajes').get();
    const batch = db.batch();
    messagesSnap.docs.forEach((d) => {
      batch.delete(d.ref);
    });
    batch.delete(convRef);
    await batch.commit();

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting conversation:', error);
    return { success: false, error: error.message };
  }
}

export async function handleClientAppointmentAction({
  conversationId,
  messageId,
  reservationId,
  action,
  clientName,
}: {
  conversationId: string;
  messageId: string;
  reservationId: string;
  action: 'confirm' | 'reschedule' | 'cancel';
  clientName?: string;
}) {
  try {
    const db = getDb();
    const now = new Date();
    const convRef = db.collection('conversaciones').doc(conversationId);
    const msgRef = convRef.collection('mensajes').doc(messageId);
    const resRef = db.collection('reservas').doc(reservationId);

    const resDoc = await resRef.get();
    const resData = resDoc.exists ? resDoc.data() : null;

    if (action === 'confirm') {
      // 1. Update reservation status to Confirmado (yellow tag in agenda)
      await resRef.update({
        estado: 'Confirmado',
        confirmada_por_cliente: true,
        confirmada_en: now,
        whatsappConfirmationSent: true,
        updated_at: now,
      });

      // 2. Mark action in message metadata
      await msgRef.update({
        'metadata.selected_action': 'confirm',
        'metadata.answered_at': now,
      });

      // 3. Post reply from Janet (using custom confirmation template from settings if configured)
      const replyMsgRef = convRef.collection('mensajes').doc();
      const horaStr = resData?.hora_inicio || '';
      let replyText = `¡Excelente${clientName ? ` ${clientName}` : ''}! 🎉 Tu cita ha quedado confirmada para el día de hoy${horaStr ? ` a las ${horaStr}` : ''}. Te esperamos con gusto en Vatos Alfa. 💈✂️`;

      try {
        const sofiaSnap = await db.collection('settings').doc('sofia').get();
        if (sofiaSnap.exists && sofiaSnap.data()?.chatConfirmationTemplate) {
          const tpl = sofiaSnap.data()?.chatConfirmationTemplate;
          const profName =
            resData?.customer?.professionalName ||
            resData?.items?.[0]?.barbero_name ||
            resData?.barbero_nombre ||
            'tu barbero';
          const servicesText =
            resData?.items && resData.items.length > 0
              ? resData.items.map((i: any) => i.nombre || i.servicio).join(', ')
              : resData?.servicio || 'Servicio de Barbería';
          const locationStr = 'Av. Cerro Sombrerete 1001, Col. Cipreses (Suc. Sombrerete)';

          replyText = tpl
            .replace(/{nombre}/g, clientName || resData?.cliente_nombre || resData?.customer?.nombre || 'Cliente')
            .replace(/{fecha}/g, resData?.fecha || '')
            .replace(/{hora}/g, resData?.hora_inicio || '')
            .replace(/{profesional}/g, profName)
            .replace(/{servicios}/g, servicesText)
            .replace(/{ubicacion}/g, locationStr);
        }
      } catch (err) {
        console.warn('Could not read chatConfirmationTemplate from settings, using default:', err);
      }

      await replyMsgRef.set({
        id: replyMsgRef.id,
        conversation_id: conversationId,
        de: 'bot',
        texto: replyText,
        timestamp: now,
        tipo: 'texto',
        estado: 'enviado',
      });

      await convRef.update({
        ultimo_mensaje: replyText,
        fecha_ultimo_mensaje: now,
        updated_at: now,
      });

      return {
        success: true,
        action: 'confirm',
        message: 'Cita confirmada correctamente con etiqueta amarilla.',
      };
    } else if (action === 'reschedule') {
      // 1. Mark action in message metadata
      await msgRef.update({
        'metadata.selected_action': 'reschedule',
        'metadata.answered_at': now,
      });

      // 2. Post reply from Janet to initiate rescheduling
      const replyMsgRef = convRef.collection('mensajes').doc();
      const replyText = `¡Hola${clientName ? ` ${clientName}` : ''}! Con gusto te ayudo a reagendar tu cita. 📅✂️\n\n¿Para qué día y en qué horario te gustaría moverla? Indícamelo aquí mismo para consultar la disponibilidad de los barberos.`;

      await replyMsgRef.set({
        id: replyMsgRef.id,
        conversation_id: conversationId,
        de: 'bot',
        texto: replyText,
        timestamp: now,
        tipo: 'texto',
        estado: 'enviado',
      });

      await convRef.update({
        ultimo_mensaje: replyText,
        fecha_ultimo_mensaje: now,
        modo_atencion: 'bot_activo',
        updated_at: now,
      });

      return {
        success: true,
        action: 'reschedule',
        message: 'Reagendamiento iniciado.',
      };
    } else if (action === 'cancel') {
      // 1. Update reservation status to Cancelado
      await resRef.update({
        estado: 'Cancelado',
        cancelada_por_cliente: true,
        cancelada_en: now,
        updated_at: now,
      });

      // 2. Mark action in message metadata
      await msgRef.update({
        'metadata.selected_action': 'cancel',
        'metadata.answered_at': now,
      });

      // 3. Post reply from Janet
      const replyMsgRef = convRef.collection('mensajes').doc();
      const replyText = `Tu cita ha sido cancelada conforme a lo solicitado y el turno ha quedado liberado. 💈\n\nSi deseas agendar en otra ocasión, aquí estaré lista para ayudarte. ¡Hasta pronto!`;

      await replyMsgRef.set({
        id: replyMsgRef.id,
        conversation_id: conversationId,
        de: 'bot',
        texto: replyText,
        timestamp: now,
        tipo: 'texto',
        estado: 'enviado',
      });

      await convRef.update({
        ultimo_mensaje: replyText,
        fecha_ultimo_mensaje: now,
        updated_at: now,
      });

      return {
        success: true,
        action: 'cancel',
        message: 'Cita cancelada y turno liberado.',
      };
    }

    return { success: false, error: 'Acción no válida' };
  } catch (error: any) {
    console.error('Error handling appointment action from chat:', error);
    return { success: false, error: error.message };
  }
}

export async function sendAppointmentChatReminder({
  reservationId,
}: {
  reservationId: string;
}) {
  try {
    const db = getDb();
    const now = new Date();
    const resRef = db.collection('reservas').doc(reservationId);
    const resSnap = await resRef.get();
    if (!resSnap.exists) return { success: false, error: 'Reserva no encontrada' };

    const res = resSnap.data()!;
    if (res.chatReminderSent) {
      return { success: true, message: 'El recordatorio ya fue enviado previamente.' };
    }

    // Load Janet settings from settings/sofia
    let sofiaConfig: any = null;
    const sofiaSnap = await db.collection('settings').doc('sofia').get();
    if (sofiaSnap.exists) {
      sofiaConfig = sofiaSnap.data();
    }

    const tpl =
      sofiaConfig?.chatReminderTemplate ||
      '¡Hola *{nombre}*, te recordamos tu cita en Vatos Alfa! 💈\n\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n👤 *Profesional:* {profesional}\n✂️ *Servicio(s):* {servicios}\n📍 *Ubicación:* {ubicacion}\n\nPor favor confirma tu asistencia presionando una opción abajo:';

    const btnConfirmText = sofiaConfig?.chatButtonConfirmText || 'Confirmar Asistencia';
    const btnRescheduleText = sofiaConfig?.chatButtonRescheduleText || 'Reagendar';
    const btnCancelText = sofiaConfig?.chatButtonCancelText || 'Cancelar';

    // Format text
    const clientName = res.customer?.nombre || res.cliente_nombre || 'Cliente';
    const clientPhone = res.customer?.telefono || res.cliente_telefono || '';
    const profName =
      res.customer?.professionalName ||
      res.items?.[0]?.barbero_name ||
      res.barbero_nombre ||
      'tu barbero';
    const servicesText =
      res.items && res.items.length > 0
        ? res.items.map((i: any) => i.nombre || i.servicio).join(', ')
        : res.servicio || 'Servicio de Barbería';
    const googleMapsUrl = 'https://maps.google.com/?q=VATOS+ALFA+Barber+Shop+Av+Cerro+Sombrerete+1001+Col+Cipreses';
    const locationStr = `[Av. Cerro Sombrerete 1001, Col. Cipreses (Suc. Sombrerete)](${googleMapsUrl})`;

    const formattedMessage = tpl
      .replace(/{nombre}/g, clientName)
      .replace(/{fecha}/g, res.fecha || '')
      .replace(/{hora}/g, res.hora_inicio || '')
      .replace(/{profesional}/g, profName)
      .replace(/{servicios}/g, servicesText)
      .replace(/{ubicacion}/g, locationStr);

    // Find or create conversation for this client (prioritizing 10-digit phone ID used by Mobile App ChatScreen)
    let conversationId = '';
    const cleanPhone = clientPhone.replace(/\D/g, '').slice(-10);

    if (cleanPhone && cleanPhone.length === 10) {
      const directDoc = await db.collection('conversaciones').doc(cleanPhone).get();
      if (directDoc.exists) {
        conversationId = directDoc.id;
      }
    }

    if (!conversationId && res.cliente_id) {
      const convQuery = await db
        .collection('conversaciones')
        .where('cliente_id', '==', res.cliente_id)
        .limit(1)
        .get();
      if (!convQuery.empty) {
        conversationId = convQuery.docs[0].id;
      }
    }

    if (!conversationId && cleanPhone) {
      const phoneQuery = await db
        .collection('conversaciones')
        .where('cliente_telefono', '==', cleanPhone)
        .limit(1)
        .get();
      if (!phoneQuery.empty) {
        conversationId = phoneQuery.docs[0].id;
      }
    }

    if (!conversationId) {
      // Create new conversation using the 10-digit phone as ID when available so Mobile App syncs automatically
      const newConvRef =
        cleanPhone && cleanPhone.length === 10
          ? db.collection('conversaciones').doc(cleanPhone)
          : db.collection('conversaciones').doc();
      conversationId = newConvRef.id;
      await newConvRef.set({
        id: conversationId,
        cliente_id: res.cliente_id || null,
        cliente_nombre: clientName,
        cliente_telefono: cleanPhone,
        cliente_email: res.customer?.correo || res.cliente_email || null,
        canal: 'app',
        modo_atencion: 'bot_activo',
        mensajes_no_leidos: 0,
        ultimo_mensaje: formattedMessage,
        fecha_ultimo_mensaje: now,
        created_at: now,
        updated_at: now,
      });
    }

    const convRef = db.collection('conversaciones').doc(conversationId);
    const msgRef = convRef.collection('mensajes').doc();

    const buttons = [
      { id: 'confirm', label: btnConfirmText, action: 'confirm', variant: 'confirm' },
      { id: 'reschedule', label: btnRescheduleText, action: 'reschedule', variant: 'reschedule' },
      { id: 'cancel', label: btnCancelText, action: 'cancel', variant: 'cancel' },
    ];

    await msgRef.set({
      id: msgRef.id,
      conversation_id: conversationId,
      de: 'bot',
      texto: formattedMessage,
      timestamp: now,
      tipo: 'accion',
      estado: 'enviado',
      metadata: {
        action_type: 'appointment_reminder',
        reservation_id: reservationId,
        buttons,
      },
    });

    await convRef.update({
      ultimo_mensaje: formattedMessage,
      fecha_ultimo_mensaje: now,
      mensajes_no_leidos: 0,
      updated_at: now,
    });

    // Mark reservation as reminder sent in both chat and whatsapp so it's acknowledged
    await resRef.update({
      chatReminderSent: true,
      whatsappReminderSent: true,
      chatReminderDate: now,
    });

    return {
      success: true,
      conversationId,
      messageId: msgRef.id,
    };
  } catch (error: any) {
    console.error('Error sending appointment chat reminder:', error);
    return { success: false, error: error.message };
  }
}

export async function checkAndSendPendingChatReminders() {
  try {
    const db = getDb();
    const sofiaSnap = await db.collection('settings').doc('sofia').get();
    const sofiaConfig = sofiaSnap.exists ? sofiaSnap.data() : null;

    if (sofiaConfig && sofiaConfig.autoChatReminders === false) {
      return { success: true, processed: 0, reason: 'Recordatorios en chat desactivados' };
    }

    const minutesBefore = sofiaConfig?.chatReminderMinutesBefore ?? 120; // 2 horas por defecto

    // Get Mexico time
    const timeZone = 'America/Mexico_City';
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayStr = formatter.format(now); // YYYY-MM-DD

    const timeParts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(now);
    const nowH = parseInt(timeParts.find((x) => x.type === 'hour')!.value, 10);
    const nowM = parseInt(timeParts.find((x) => x.type === 'minute')!.value, 10);
    const nowMinutes = nowH * 60 + nowM;

    // Window: from now to now + minutesBefore
    const windowEndMinutes = nowMinutes + minutesBefore;

    const snapToday = await db.collection('reservas').where('fecha', '==', todayStr).get();

    let processedCount = 0;

    for (const docSnap of snapToday.docs) {
      const res = docSnap.data();
      // Skip if cancelled, finished, or already reminded
      if (
        res.estado === 'Cancelado' ||
        res.estado === 'Cancelada' ||
        res.estado === 'Asiste' ||
        res.estado === 'No asiste'
      )
        continue;
      if (res.chatReminderSent) continue;
      if (!res.hora_inicio) continue;

      const [hStr, mStr] = res.hora_inicio.split(':');
      const aptMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);

      // Check if appointment is within the reminder window
      if (aptMinutes >= nowMinutes && aptMinutes <= windowEndMinutes) {
        await sendAppointmentChatReminder({ reservationId: docSnap.id });
        processedCount++;
      }
    }

    return { success: true, processed: processedCount };
  } catch (error: any) {
    console.error('Error in checkAndSendPendingChatReminders:', error);
    return { success: false, error: error.message };
  }
}

export async function sendTestChatReminder({
  conversationId,
  clientName,
}: {
  conversationId: string;
  clientName?: string;
}) {
  try {
    const db = getDb();
    const now = new Date();
    const convRef = db.collection('conversaciones').doc(conversationId);
    const convSnap = await convRef.get();
    if (!convSnap.exists) return { success: false, error: 'Conversación no encontrada' };

    // Load Janet settings from settings/sofia
    let sofiaConfig: any = null;
    const sofiaSnap = await db.collection('settings').doc('sofia').get();
    if (sofiaSnap.exists) {
      sofiaConfig = sofiaSnap.data();
    }

    const tpl =
      sofiaConfig?.chatReminderTemplate ||
      '¡Hola *{nombre}*, te recordamos tu cita en Vatos Alfa! 💈\n\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n👤 *Profesional:* {profesional}\n✂️ *Servicio(s):* {servicios}\n📍 *Ubicación:* {ubicacion}\n\nPor favor confirma tu asistencia presionando una opción abajo:';

    const btnConfirmText = sofiaConfig?.chatButtonConfirmText || 'Confirmar Asistencia';
    const btnRescheduleText = sofiaConfig?.chatButtonRescheduleText || 'Reagendar';
    const btnCancelText = sofiaConfig?.chatButtonCancelText || 'Cancelar';

    const targetName = clientName || convSnap.data()?.cliente_nombre || 'Cliente';
    const formattedMessage = tpl
      .replace(/{nombre}/g, targetName)
      .replace(/{fecha}/g, new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(now))
      .replace(/{hora}/g, '17:00')
      .replace(/{profesional}/g, 'Carlos Barber')
      .replace(/{servicios}/g, 'Corte de cabello')
      .replace(/{ubicacion}/g, '[Av. Cerro Sombrerete 1001, Col. Cipreses (Suc. Sombrerete)](https://maps.google.com/?q=VATOS+ALFA+Barber+Shop+Av+Cerro+Sombrerete+1001+Col+Cipreses)');

    // Check if client has a real reservation in database
    let reservationId = `test-res-${Date.now()}`;
    const phone = convSnap.data()?.cliente_telefono;
    if (phone) {
      const snapRes = await db
        .collection('reservas')
        .where('cliente_telefono', '==', phone)
        .limit(1)
        .get();
      if (!snapRes.empty) {
        reservationId = snapRes.docs[0].id;
      }
    }

    const msgRef = convRef.collection('mensajes').doc();
    const buttons = [
      { id: 'confirm', label: btnConfirmText, action: 'confirm', variant: 'confirm' },
      { id: 'reschedule', label: btnRescheduleText, action: 'reschedule', variant: 'reschedule' },
      { id: 'cancel', label: btnCancelText, action: 'cancel', variant: 'cancel' },
    ];

    await msgRef.set({
      id: msgRef.id,
      conversation_id: conversationId,
      de: 'bot',
      texto: formattedMessage,
      timestamp: now,
      tipo: 'accion',
      estado: 'enviado',
      metadata: {
        action_type: 'appointment_reminder',
        reservation_id: reservationId,
        buttons,
      },
    });

    await convRef.update({
      ultimo_mensaje: formattedMessage,
      fecha_ultimo_mensaje: now,
      updated_at: now,
    });

    return {
      success: true,
      messageId: msgRef.id,
    };
  } catch (error: any) {
    console.error('Error sending test chat reminder:', error);
    return { success: false, error: error.message };
  }
}
