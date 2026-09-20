'use server';

import { getDb } from '@/lib/firebase-server';

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
  staffName,
  pauseBot = false,
}: {
  conversationId: string;
  messageText: string;
  imageUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
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
    const tipo = audioUrl ? 'audio' : imageUrl ? 'imagen' : 'texto';
    await msgRef.set({
      id: msgRef.id,
      conversation_id: conversationId,
      de: 'recepcion',
      texto: messageText,
      timestamp: now,
      tipo,
      mediaUrl: audioUrl || imageUrl || null,
      estado: 'enviado',
      metadata: {
        staffName: staffName || 'Recepción',
        ...(audioDuration ? { duration: audioDuration } : {}),
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
}: {
  phone?: string;
  clientId?: string;
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
      const directSnap = await db.collection('clientes').where('telefono', '==', phone).limit(1).get();
      if (!directSnap.empty) {
        clientDoc = directSnap.docs[0];
      } else {
        const cleanSnap = await db.collection('clientes').where('telefono', '==', cleanPhone).limit(1).get();
        if (!cleanSnap.empty) {
          clientDoc = cleanSnap.docs[0];
        } else {
          const clientsSnap = await db.collection('clientes').get();
          clientDoc = clientsSnap.docs.find((d) => {
            const p = (d.data().telefono || '').replace(/\D/g, '');
            return p.includes(cleanPhone);
          });
        }
      }
    }

    const resolvedClientId = clientDoc?.id || clientId;
    const clientData = clientDoc ? { id: clientDoc.id, ...clientDoc.data() } : null;

    // 3. Cargar profesionales para nombres legibles
    const profsSnap = await db.collection('profesionales').get();
    const profMap: Record<string, string> = {};
    profsSnap.docs.forEach((p) => {
      const pd = p.data();
      profMap[p.id] = pd.publicName || pd.name || 'Barbero';
    });

    // 4. Buscar todas las reservas del cliente
    let clientReservas: Array<any> = [];

    if (resolvedClientId) {
      const byClientSnap = await db.collection('reservas').where('cliente_id', '==', resolvedClientId).get();
      clientReservas = byClientSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    // Si también hay reservas registradas por teléfono sin cliente_id
    if (cleanPhone) {
      const allResSnap = await db.collection('reservas').get();
      const additional = allResSnap.docs
        .filter((d) => {
          const r = d.data();
          if (resolvedClientId && r.cliente_id === resolvedClientId) return false;
          const rp = (r.customer?.telefono || r.customerPhone || r.telefono || '').replace(/\D/g, '');
          return rp && rp.includes(cleanPhone);
        })
        .map((d) => ({ id: d.id, ...d.data() }));

      clientReservas = [...clientReservas, ...additional];
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

    return {
      success: true,
      client: sanitizeFirestoreData(enrichedClient),
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
