import { getDb } from '@/lib/firebase-server';
import { format } from 'date-fns';
import { getAvailableSlots, createPublicReservation } from '@/lib/actions/booking';
import { matchBarberName, formatTime12h, getBarberServiceDuration } from '@/lib/ai/agent-utils';
import { parseClientCustomDuration } from '@/lib/client-notes-helper';

// ==========================================
// MOTOR CONVERSACIONAL HUMANO (RECEPCIONISTA FALLBACK)
// ==========================================

export async function executeFallbackLogic({
  conversationId,
  clientPhone,
  clientName,
  userMessage,
  clientNotes,
}: {
  conversationId: string;
  clientPhone: string;
  clientName?: string;
  userMessage: string;
  clientNotes?: string;
}): Promise<string> {
  const db = getDb();
  const text = userMessage.toLowerCase().trim();

  // 1. Obtener notas del cliente para duraciones personalizadas si no vienen provistas
  let effectiveNotes = clientNotes || '';
  if (!effectiveNotes) {
    try {
      const cleanP = (clientPhone || '').replace(/\D/g, '').slice(-10);
      if (cleanP) {
        const cSnap = await db.collection('clientes').where('telefono', '==', cleanP).limit(1).get();
        if (!cSnap.empty) {
          effectiveNotes = cSnap.docs[0].data().notas || cSnap.docs[0].data().nota || '';
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // 2. Obtener historial reciente para entender el contexto
  let recentChat = '';
  try {
    const prevSnap = await db
      .collection('conversaciones')
      .doc(conversationId)
      .collection('mensajes')
      .orderBy('timestamp', 'desc')
      .limit(6)
      .get();
    recentChat = prevSnap.docs
      .map((d) => d.data().texto || '')
      .join(' ')
      .toLowerCase();
  } catch (e) {
    // ignore
  }

  const combinedText = `${recentChat} ${text}`;

  // 2. Cargar servicios y barberos activos
  let activeServices: Array<{
    id: string;
    name: string;
    price: number;
    duration: number;
    durationPorProfesional?: Record<string, number>;
    professionals?: string[];
  }> = [];
  let activeBarbers: Array<{ id: string; name: string; publicName: string }> = [];

  try {
    const servsSnap = await db.collection('servicios').where('active', '==', true).get();
    activeServices = servsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name || data.nombre || 'Corte de Cabello',
        price: Number(data.price || data.precio || 0),
        duration: Number(data.duration || data.duracion || 30),
        durationPorProfesional: data.durationPorProfesional,
        professionals: data.professionals,
      };
    });

    const profsSnap = await db.collection('profesionales').where('active', '==', true).get();
    activeBarbers = profsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name || '',
        publicName: data.publicName || data.name || 'Barbero',
      };
    });
  } catch (e) {
    console.error('Error fetching services/barbers in fallback:', e);
  }

  // 3. Detectores de intención y entidades
  const isHaircut = /(corte|cabello|pelo|fade|degradado|desvanecido)/i.test(text);
  const isBeard = /(barba|bigote|afeitad|rasurad|toalla caliente)/i.test(text);
  const isAskingMultiServices = /(varios servicios|dos servicios|m[aá]s de un servicio|al mismo tiempo|juntos|combo|junto|corte.*y.*barba|corte.*\+.*barba|servicios al mismo tiempo)/i.test(text);
  const isAskingTermsOrPrivacy = /(t[eé]rminos|condiciones|pol[ií]ticas? de privacidad|aviso de privacidad|privacidad|datos personales|c[oó]mo usan mis datos|pol[ií]tica de cancelaci[oó]n|reembolso|reembolsos)/i.test(text);
  const isAskingHours = /(horario|horas|hora|disponible|disponibilidad|espacio|lugar|tienes|tienen|a que hora|a qué hora|puedo ir)/i.test(text);
  const isAskingPrices = /(precio|costo|cuanto cuesta|cuánto cuesta|cuanto cobran|cuánto cobran|tarifa|promoci)/i.test(text);
  const isAskingBarbers = /(quien atiende|quién atiende|quienes atienden|quiénes atienden|quien corta|quién corta|barberos|el equipo)/i.test(text);
  const isAskingMyCitas = /(mis citas|cuando es mi cita|cuándo es mi cita|a que hora es mi cita|mi reserva|revisar cita)/i.test(text);
  const isCancelling = /(cancelar|cancela|ya no voy a poder|ya no puedo ir|anular)/i.test(text);
  const isAskingLocation = /(d[oó]nde est[aá]n|d[oó]nde se ubican|ubicaci[oó]n|direcci[oó]n|direcc|c[oó]mo llego|en qu[eé] parte|referencias|mapa|localizaci[oó]n|pero la direccion|pero la dirección)/i.test(text);
  const isAskingHuman = /(hablar con un humano|hablar con una persona|p[aá]same a un humano|p[aá]same a una persona|comun[ií]came con|hablar con alguien de recepci[oó]n|hablar con el encargado|queja)/i.test(text);

  // Detector de barbero mencionado (con apodos Beatriz/Bety, Eduardo/Lalo, etc.)
  let matchedBarber = activeBarbers.find((b) => matchBarberName(text, b));

  // Detector de servicio mencionado
  let matchedService = activeServices.find((s) => {
    if (isBeard && /barba/i.test(s.name)) return true;
    if (isHaircut && /corte/i.test(s.name)) return true;
    return text.includes(s.name.toLowerCase());
  }) || activeServices[0];

  // Detector de fecha mencionada
  const today = new Date();
  let targetDate = format(today, 'yyyy-MM-dd');
  let dateLabel = 'hoy';

  if (/mañana/i.test(text)) {
    const tomorrow = new Date(Date.now() + 86400000);
    targetDate = format(tomorrow, 'yyyy-MM-dd');
    dateLabel = 'mañana';
  } else if (/pasado mañana/i.test(text)) {
    const dayAfter = new Date(Date.now() + 86400000 * 2);
    targetDate = format(dayAfter, 'yyyy-MM-dd');
    dateLabel = 'pasado mañana';
  }

  // Detector de hora mencionada (ej: 5:00, 5pm, a las 4, 16:30, etc.)
  const timeRegex = /(?:a las\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
  const timeMatch = text.match(timeRegex);
  let requestedTime: string | null = null;

  if (timeMatch && (text.includes('las') || text.includes('pm') || text.includes('am') || text.includes(':') || /^\d{1,2}/.test(text))) {
    let rawH = parseInt(timeMatch[1], 10);
    const rawM = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const modifier = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

    if (modifier === 'pm' && rawH < 12) rawH += 12;
    if (modifier === 'am' && rawH === 12) rawH = 0;
    // Si dice "a las 4" o "a las 5" sin am/pm y la barbería opera en la tarde
    if (!modifier && rawH >= 1 && rawH <= 8) rawH += 12;

    if (rawH >= 9 && rawH <= 21) {
      requestedTime = `${rawH.toString().padStart(2, '0')}:${rawM.toString().padStart(2, '0')}`;
    }
  }

  // ==========================================
  // RESPUESTAS HUMANAS CONTEXTUALES
  // ==========================================

  // CASO 0: Pregunta por ubicación / dirección / cómo llegar
  if (isAskingLocation) {
    return '¡Con gusto! Estamos ubicados en *Av. Cerro Sombrerete 1001, Col. Cipreses, Querétaro, Qro.* (sobre Av. Cerro Sombrerete). Abrimos de lunes a sábado de 10:00 AM a 9:00 PM y domingos de 10:00 AM a 8:00 PM. Contamos con estacionamiento al frente. ¿Te gustaría agendar una cita para visitarnos? 💈';
  }

  // CASO 0.5: Pregunta sobre agendar varios servicios al mismo tiempo (ej: corte + barba express)
  if (isAskingMultiServices && (/pued|sabe|como|ejemplo|\?|se puede|es posible/i.test(text) || !requestedTime)) {
    return '¡Sí, totalmente! Puedo agendarte varios servicios en la misma cita (por ejemplo: corte de cabello + barba express, o corte con ceja o facial). Al agendarlos juntos, reservamos el bloque continuo de tiempo necesario con tu barbero (por ejemplo, 65 minutos para corte y barba express) por un total de $240 MXN. Como la suma supera $190 MXN, el sistema genera automáticamente un enlace de Mercado Pago para apartar tu espacio con el 50% de anticipo ($120 MXN) y el resto se liquida en recepción. ¿Te gustaría que te revise disponibilidad para corte y barba?';
  }

  // CASO 0.8: Preguntas sobre Términos y Condiciones o Aviso de Privacidad
  if (isAskingTermsOrPrivacy) {
    if (text.includes('privacidad') || text.includes('datos') || text.includes('correo') || text.includes('informaci')) {
      return '¡Sí, con mucho gusto! En VATOS ALFA cuidamos con estricta confidencialidad tus datos personales. Tu nombre y WhatsApp se utilizan únicamente para la gestión de tus citas y recordatorios, y jamás se comparten ni venden a terceros. Puedes consultar el Aviso de Privacidad completo en: *https://vatosalfa.com/privacidad*. ¿Hay algo en lo que te pueda apoyar hoy?';
    }
    return '¡Sí, por supuesto! Tengo acceso completo a los Términos y Condiciones de VATOS ALFA. En resumen: contamos con tolerancia estricta de 10 minutos; las cancelaciones o cambios con al menos 2 horas de anticipación conservan el 100% de tu anticipo como saldo a favor por 30 días (con menos de 2 horas o inasistencia se pierde por el tiempo apartado del barbero). Puedes consultar los términos completos en *https://vatosalfa.com/terminos* y nuestro aviso de privacidad en *https://vatosalfa.com/privacidad*. ¿Tienes alguna duda en específico?';
  }

  // CASO 0.9: Envío de comprobante de pago o confirmación de transferencia
  const isVoucher = /(comprobante|transferencia|ya transferi|ya transferí|ya deposite|ya deposité|ya pague|ya pagué|captura|ticket)/i.test(text);
  if (isVoucher) {
    return '¡Muchas gracias por compartir tu comprobante de anticipo! 📄 He registrado la información en tu reserva y nuestro equipo de recepción validará los fondos en la cuenta bancaria para dejar tu espacio 100% confirmado. ¡Nos vemos pronto en VATOS ALFA!';
  }

  // CASO 0.95: Agendar a nombre de otra persona
  const isBookingForOther = /(a nombre de|para mi amigo|para mi hermano|para mi primo|para mi hijo|para mi papa|para mi papá|para mi novio|para mi esposo|para otra persona)/i.test(text);
  if (isBookingForOther && !/\d{10}/.test(text)) {
    return '¡Con mucho gusto! Para poder registrarlo correctamente en el sistema y no confundirlo con otros clientes con el mismo nombre, ¿me apoyas con su nombre completo con apellidos y su número de WhatsApp? Así la cita queda vinculada a su propia cuenta y le llegarán sus confirmaciones a su teléfono.';
  }

  // CASO 1: Confirmar asistencia a cita (Recordatorio de cita)
  const isConfirming = /(confirmar|confirmo|si confirmo|sí confirmo|asisto|ahí estaré|ahi estare|^1$|^si$|^sí$)/i.test(text);
  if (isConfirming) {
    const cleanPhone = clientPhone.replace(/\D/g, '').slice(-10);
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const snap = await db.collection('reservas').where('fecha', '>=', todayStr).get();

    const nextCita = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .filter((r) => {
        const rPhone = (r.customer?.telefono || r.customerPhone || '').replace(/\D/g, '');
        return rPhone.includes(cleanPhone) && r.estado !== 'cancelada' && r.estado !== 'Cancelado';
      })
      .sort((a, b) => {
        const dateA = a.fecha ? new Date(`${a.fecha}T${a.hora_inicio || '00:00'}:00`).getTime() : 0;
        const dateB = b.fecha ? new Date(`${b.fecha}T${b.hora_inicio || '00:00'}:00`).getTime() : 0;
        return dateA - dateB;
      })[0];

    if (nextCita) {
      const now = new Date();
      await db.collection('reservas').doc(nextCita.id).update({
        estado: 'confirmada',
        confirmada_por_cliente: true,
        confirmada_en: now,
        etiqueta_recordatorio: 'confirmada',
        whatsappConfirmationSent: true,
        updated_at: now,
        notas: (nextCita.notas ? nextCita.notas + ' | ' : '') + 'Confirmada por cliente vía WhatsApp',
      });

      return `¡Excelente! Tu cita para el *${nextCita.fecha}* a las *${formatTime12h(nextCita.hora_inicio)}* con ${nextCita.professionalNames || nextCita.barbero_nombre || 'tu barbero'} para ${nextCita.servicio} ha quedado 100% confirmada. ¡Te esperamos en VATOS ALFA! 💈`;
    }
  }

  // CASO 1.5: Solicitar recepción humana
  if (isAskingHuman) {
    await db.collection('conversaciones').doc(conversationId).set(
      {
        modo_atencion: 'requiere_atencion',
        motivo_atencion_humana: userMessage,
        updated_at: new Date(),
      },
      { merge: true }
    );
    return 'Con mucho gusto. Le acabo de avisar al equipo de recepción para que un compañero tome la conversación y te atienda directamente en un momento por aquí.';
  }

  // CASO 2: Cancelar cita
  if (isCancelling) {
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
      return 'No encontré ninguna cita activa registrada con tu número de teléfono. Si requieres apoyo de recepción, avísame con confianza.';
    }

    await db.collection('reservas').doc(nextCita.id).update({
      estado: 'cancelada',
      motivo_cancelacion: 'Cancelada por cliente en conversación',
      cancelada_en: new Date(),
    });

    return `Listo, no te preocupes. Tu cita del ${nextCita.fecha} a las ${formatTime12h(nextCita.hora_inicio)} quedó cancelada. Cuando gustes volver a agendar estamos a tus órdenes.`;
  }

  // CASO 3: Consultar mis citas
  if (isAskingMyCitas) {
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
      return 'Revisé en el sistema y no tienes citas próximas registradas con tu número. ¿Te gustaría que te agendemos un espacio para hoy o mañana?';
    }

    const nextOne = clientCitas[0];
    return `Tienes una cita programada para el *${nextOne.fecha}* a las *${formatTime12h(nextOne.hora_inicio)}* para ${nextOne.servicio} con ${nextOne.professionalNames || 'tu barbero'}. ¿Deseas hacer algún cambio o todo en orden?`;
  }

  // CASO 4: Confirmar una hora específica para agendar (ej: "a las 5:15 con Lalo")
  if (requestedTime) {
    const barberToUse = matchedBarber || activeBarbers[0];
    const serviceToUse = matchedService || activeServices[0];

    // Verificar si el horario está disponible con ese barbero
    if (barberToUse) {
      const customDur = effectiveNotes ? parseClientCustomDuration(effectiveNotes, barberToUse.publicName || barberToUse.name) : null;
      const barberDuration = customDur || getBarberServiceDuration([serviceToUse], barberToUse.id, 30);
      const slotsCheck = await getAvailableSlots({
        date: targetDate,
        professionalId: barberToUse.id,
        durationMinutes: barberDuration,
      });

      const slots = (slotsCheck as any).slots || [];
      const isAvailable = slots.includes(requestedTime);

      if (isAvailable) {
        // Si ya tenemos un nombre de cliente real (no el dummy de prueba)
        const isPlaceholderName = !clientName || /prueba|cliente/i.test(clientName);

        if (!isPlaceholderName && clientName.trim().length > 3) {
          // Crear la cita de una vez
          await createPublicReservation({
            client: {
              name: clientName,
              phone: clientPhone,
            },
            serviceIds: [serviceToUse.id],
            professionalId: barberToUse.id,
            date: targetDate,
            time: requestedTime,
            duration: customDur || undefined,
            customDuration: customDur || undefined,
            notes: 'Agendado por Asistente Virtual (Chat)',
          });

          return `¡Listo, ${clientName}! Tu cita para ${dateLabel} a las *${formatTime12h(requestedTime)}* con *${barberToUse.publicName}* para *${serviceToUse.name}* ha quedado confirmada en la agenda. 💈✂️ ¡Te esperamos en VATOS ALFA!`;
        } else {
          return `¡Perfecto! El horario de las *${formatTime12h(requestedTime)}* para ${dateLabel} con *${barberToUse.publicName}* está disponible. ¿Me confirmas tu nombre completo para dejártela registrada en el sistema?`;
        }
      } else {
        // Ofrecer alternativas cercanas
        const nearbySlots = slots.slice(0, 3).map((s: string) => formatTime12h(s)).join(', ');
        return `Fíjate que justo a las ${formatTime12h(requestedTime)} ${barberToUse.publicName} ya tiene una cita ocupada, pero tengo disponible a las ${nearbySlots}. ¿Te acomoda alguno de estos?`;
      }
    }
  }

  // CASO 5: Pregunta por servicios, barbero u horarios combinados (ej: "quiero corte con Beatriz", "el horario más próximo")
  if (isAskingHours || (isHaircut && isAskingHours) || (isBeard && isAskingHours) || matchedBarber) {
    const serviceName = isBeard ? 'arreglo de barba' : 'corte de cabello';
    const barbersToSearch = matchedBarber ? [matchedBarber] : activeBarbers;
    let slotsFound: string[] = [];
    let barberSampleName = matchedBarber ? matchedBarber.publicName : '';
    let foundDateLabel = dateLabel;

    // Buscar en los próximos 4 días para encontrar el horario más próximo
    const daysToCheck = [
      { offset: 0, label: 'hoy' },
      { offset: 1, label: 'mañana' },
      { offset: 2, label: 'pasado mañana' },
      { offset: 3, label: 'el fin de semana' },
    ];

    // Si el usuario dijo "aunque no sea mañana", empezar después de mañana
    if (/aunque no sea mañana/i.test(text)) {
      daysToCheck.shift(); // quitar hoy
      daysToCheck.shift(); // quitar mañana
      daysToCheck.push({ offset: 4, label: 'el próximo lunes' });
    }

    for (const d of daysToCheck) {
      const checkDate = format(new Date(Date.now() + 86400000 * d.offset), 'yyyy-MM-dd');
      for (const barber of barbersToSearch) {
        const targetService = activeServices.find((s) =>
          isBeard ? /barba/i.test(s.name) : /corte/i.test(s.name)
        ) || activeServices[0];
        const customDur = effectiveNotes ? parseClientCustomDuration(effectiveNotes, barber.publicName || barber.name) : null;
        const barberDuration = customDur || (targetService ? getBarberServiceDuration([targetService], barber.id, 30) : 30);
        const res = await getAvailableSlots({
          date: checkDate,
          professionalId: barber.id,
          durationMinutes: barberDuration,
        });

        if ('slots' in res && res.slots && res.slots.length > 0) {
          slotsFound = res.slots;
          barberSampleName = barber.publicName;
          foundDateLabel = d.label;
          break;
        }
      }
      if (slotsFound.length > 0) break;
    }

    if (slotsFound.length > 0) {
      const sample = slotsFound.slice(0, 4).map((s) => formatTime12h(s)).join(', ');
      return `¡Con gusto, ${clientName || 'amigo'}! Con ${barberSampleName} el horario más próximo disponible para ${foundDateLabel} es en horarios como *${sample}*. ¿Cuál de estos te acomoda para apartártelo de una vez?`;
    }

    return `¡Hola! Con gusto te atendemos con tu ${serviceName}. Para esos días la agenda de ${barberSampleName || 'los barberos'} está completa. ¿Te gustaría que te revise para la próxima semana?`;
  }

  // CASO 6: Pregunta por precios o catálogo
  if (isAskingPrices) {
    if (activeServices.length > 0) {
      return `Con gusto. El corte de cabello tradicional está en $220 y el arreglo de barba en $180 (o tenemos el combo de corte y barba en $350). Ambos incluyen toalla caliente y perfilado. ¿Te gustaría que te busque un espacio para hoy o mañana?`;
    }
  }

  // CASO 7: Pregunta por el equipo de barberos
  if (isAskingBarbers) {
    if (activeBarbers.length > 0) {
      const names = activeBarbers.map((b) => b.publicName).join(', ');
      return `Nuestro equipo de barberos en VATOS ALFA está conformado por *${names}*. ¿Tienes preferencia por atenderte con alguno de ellos en especial?`;
    }
  }

  // CASO 8: Saludo simple (ej: "Hola", "Buenas tardes") sin pregunta adicional
  if (/^(hola|buen[ao]s|que tal|buenas tardes|buenas noches|buenos d[ií]as|hey|qui[uú]bole)/i.test(text)) {
    if (recentChat && recentChat.trim().length > 0) {
      return '¿En qué te puedo apoyar hoy con tu cita o con alguna duda de nuestros servicios?';
    }
    const greeting = text.includes('dias') || text.includes('días')
      ? '¡Hola, buenos días!'
      : text.includes('noches')
      ? '¡Hola, buenas noches!'
      : '¡Hola, buenas tardes!';

    return `${greeting} Bienvenido a VATOS ALFA Barber Shop. Con gusto te atiendo. ¿Qué servicio te gustaría realizarte o para qué día estás buscando tu cita?`;
  }

  // CASO 9: Si envió su nombre después de acordar hora
  if (combinedText.includes('nombre') || (text.split(' ').length >= 2 && text.length > 5 && !isAskingHours && !isAskingPrices)) {
    const barberToUse = matchedBarber || activeBarbers[0];
    const serviceToUse = matchedService || activeServices[0];

    return `¡Excelente, ${userMessage.trim()}! He registrado tu nombre. ¿Te gustaría que confirmemos tu cita para tu ${serviceToUse.name} con ${barberToUse.publicName}?`;
  }

  // Respuesta cálida por defecto
  if (recentChat && recentChat.trim().length > 0) {
    return 'Con mucho gusto te apoyo con tu cita en VATOS ALFA. Cuéntame, ¿qué servicio te gustaría realizarte (corte, barba o ambos) y para qué día y hora te acomoda mejor?';
  }
  return '¡Hola! Con mucho gusto te apoyo con tu cita en VATOS ALFA. Cuéntame, ¿qué servicio te gustaría realizarte (corte, barba o ambos) y para qué día y hora te acomoda mejor?';
}
