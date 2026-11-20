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

/**
 * Uso exclusivo del servidor: obtiene el perfil 360° de un cliente e historial de citas/lealtad.
 * No debe exponerse directamente sin validación de personal.
 */
export async function getClientDetailsForChatInternal({
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
      const variants = Array.from(
        new Set([phone, cleanPhone, `52${cleanPhone}`, `521${cleanPhone}`].filter(Boolean))
      );
      for (const variant of variants) {
        const snap = await db.collection('clientes').where('telefono', '==', variant).limit(1).get();
        if (!snap.empty) {
          clientDoc = snap.docs[0];
          break;
        }
      }
      if (!clientDoc && cleanPhone.length === 10) {
        const byTenSnap = await db
          .collection('clientes')
          .where('telefono_10', '==', cleanPhone)
          .limit(1)
          .get();
        if (!byTenSnap.empty) {
          clientDoc = byTenSnap.docs[0];
        }
      }
    }

    // 3. Si no se encontró por ID ni teléfono, buscar por correo/email
    if (!clientDoc && email && email.includes('@')) {
      const cleanEmail = email.trim().toLowerCase();
      const emailSnap = await db.collection('clientes').where('correo', '==', cleanEmail).limit(1).get();
      if (!emailSnap.empty) {
        clientDoc = emailSnap.docs[0];
      } else {
        const legacyEmailSnap = await db
          .collection('clientes')
          .where('email', '==', cleanEmail)
          .limit(1)
          .get();
        if (!legacyEmailSnap.empty) {
          clientDoc = legacyEmailSnap.docs[0];
        }
      }
    }

    const resolvedClientId = clientDoc?.id || clientId;
    const clientData = clientDoc ? { id: clientDoc.id, ...clientDoc.data() } : null;

    // Cargar profesionales y configuración de Pase Alfa
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

    // Buscar todas las reservas del cliente (por cliente_id y por cliente_telefono indexado)
    const clientReservas: Array<any> = [];
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

    // Calcular métricas dinámicas exactas coincidentes con la Ficha de Cliente
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

    // Consultar ventas y gasto total
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
        console.error('Error fetching sales in getClientDetailsForChatInternal:', err);
      }
    }

    clientReservas.sort((a, b) => {
      const dateA = a.fecha ? new Date(`${a.fecha}T${a.hora_inicio || '00:00'}:00`).getTime() : 0;
      const dateB = b.fecha ? new Date(`${b.fecha}T${b.hora_inicio || '00:00'}:00`).getTime() : 0;
      return dateB - dateA;
    });

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
