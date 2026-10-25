export type CondicionMomentoTipo =
  | 'dias_semana'           // Días de la semana específicos (ej. Fin de semana)
  | 'monto_minimo'          // Total de la cita alcanza o supera $X
  | 'cantidad_servicios'    // Cita contiene N o más servicios combinados
  | 'duracion_minima'       // Duración total de la cita >= N minutos
  | 'horario_estelar'       // Franja horaria (ej. Citas después de las 18:00)
  | 'cliente_nuevo'         // Clientes en su primera reserva
  | 'categoria_servicio';   // Servicios de una categoría específica (ej. Paquetes)

export type ConsecuenciaTipo =
  | 'exigir_anticipo'       // Exigir anticipo (% porcentaje o $ monto fijo)
  | 'bloquear_online'       // Bloquear reserva por web/app (contactar sucursal)
  | 'anticipacion_minima'   // Exigir mayor tiempo de anticipación (ej. 24h)
  | 'aviso_informativo';    // Mostrar aviso/advertencia especial al cliente

export interface ReglaPersonalizada {
  id: string;
  nombre: string;
  descripcion?: string;
  activa: boolean;

  // ¿En qué momento se aplica? (Condición / Disparador)
  condicion: {
    tipo: CondicionMomentoTipo;
    dias?: string[]; // ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
    monto_minimo?: number;
    cantidad_minima_servicios?: number;
    duracion_minima_minutos?: number;
    hora_inicio?: string; // ej. '17:00'
    hora_fin?: string; // ej. '21:00'
    categoria?: string; // ej. 'Paquetes' o 'Tratamientos'
  };

  // ¿Qué consecuencia tiene? (Acción / Resultado)
  consecuencia: {
    tipo: ConsecuenciaTipo;
    tipo_anticipo?: 'porcentaje' | 'monto_fijo';
    valor_anticipo?: number; // ej. 50 (%) o 150 ($)
    tiempo_anticipacion_horas?: number; // ej. 2 o 24
    mensaje_cliente?: string; // Mensaje mostrado al cliente durante la reserva
  };

  creada_el?: string;
}

export type TipoAvisoAgenda =
  | 'recordatorio_whatsapp'     // Recordatorio por WhatsApp para citas próximas
  | 'cita_atrasada_asistencia'  // Alerta de cita retrasada sin registrar asistencia
  | 'anticipo_pendiente'        // Alerta de cita con anticipo pendiente por cobrar o validar
  | 'cliente_nuevo'             // Aviso de cliente en primera visita para bienvenida/ficha
  | 'servicio_especial'         // Aviso para citas con servicios de larga duración o paquetes
  | 'personalizado';            // Aviso personalizado configurable

export interface ReglaAvisoAgenda {
  id: string;
  nombre: string;
  descripcion?: string;
  activa: boolean;
  tipo: TipoAvisoAgenda;
  tiempo_anticipacion_minutos?: number; // ej. 120 (2 horas antes)
  tiempo_urgente_minutos?: number;       // ej. 60 (1 hora antes)
  tolerancia_retraso_minutos?: number;   // ej. 10 (10 min tras hora de inicio)
  omitir_si_creada_en_minutos?: number;  // ej. 45 (si se creó con <= 45 min antes, omitir recordatorio)
  canal?: 'whatsapp' | 'pantalla' | 'ambos';
  es_sistema?: boolean; // Para las reglas nativas (WhatsApp y Atrasadas)
  creada_el?: string;
}

export const DEFAULT_AVISOS_AGENDA_RULES: ReglaAvisoAgenda[] = [
  {
    id: 'aviso_recordatorio_whatsapp',
    nombre: 'Recordatorio Preventivo de Cita por WhatsApp',
    descripcion:
      'Notifica en la ventana de recepción cuando faltan 2 horas (o 1 hora si la cita está próxima) para enviar el recordatorio manual de WhatsApp al cliente y confirmar su asistencia a tiempo. Se omite automáticamente si la cita fue creada con 45 minutos o menos de anticipación (citas de último momento o vía telefónica).',
    activa: true,
    tipo: 'recordatorio_whatsapp',
    tiempo_anticipacion_minutos: 120, // 2 horas antes
    tiempo_urgente_minutos: 60,       // 1 hora antes
    omitir_si_creada_en_minutos: 45,  // Omitir recordatorio si se agendó <= 45 min antes
    canal: 'whatsapp',
    es_sistema: true,
  },
  {
    id: 'aviso_cita_atrasada',
    nombre: 'Alerta de Citas Atrasadas sin Registrar Asistencia',
    descripcion:
      'Alerta al recepcionista cuando una cita inició hace más de 10 minutos de cortesía y aún no se ha marcado si el cliente Asistió, No Asistió o Canceló, evitando citas olvidadas.',
    activa: true,
    tipo: 'cita_atrasada_asistencia',
    tolerancia_retraso_minutos: 10,   // 10 min de tolerancia
    canal: 'pantalla',
    es_sistema: true,
  },
];

/**
 * Determina si una cita fue agendada con muy poca anticipación respecto a su hora de inicio
 * (ej. agendada vía telefónica o WhatsApp 30 o 45 minutos antes de la hora).
 * Para estas citas NO se requiere recordatorio (solo confirmación).
 */
export function isShortNoticeAppointment(
  res: {
    fecha?: string;
    hora_inicio?: string;
    creado_en?: any;
    createdAt?: any;
    creada_el?: any;
    whatsappReminderNotNeeded?: boolean;
    whatsappReminderSent?: boolean;
  } | null | undefined,
  thresholdMinutes: number = 45
): boolean {
  if (!res) return false;
  if (res.whatsappReminderNotNeeded) return true;
  if (!res.fecha || !res.hora_inicio) return false;

  try {
    const [hStr, mStr] = res.hora_inicio.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) return false;

    const parts = res.fecha.split('-').map(Number);
    if (parts.length < 3) return false;
    const [year, month, day] = parts;
    const aptDate = new Date(year, month - 1, day, h, m, 0);

    let createdDate: Date | null = null;
    const rawCreated = res.creado_en || res.createdAt || res.creada_el;
    if (rawCreated) {
      if (typeof rawCreated.toDate === 'function') {
        createdDate = rawCreated.toDate();
      } else if (typeof rawCreated.seconds === 'number') {
        createdDate = new Date(rawCreated.seconds * 1000);
      } else if (typeof rawCreated === 'string' || typeof rawCreated === 'number') {
        createdDate = new Date(rawCreated);
      }
    }

    if (createdDate && !isNaN(createdDate.getTime())) {
      const diffMinutes = (aptDate.getTime() - createdDate.getTime()) / (1000 * 60);
      // Si la cita fue creada a 45 minutos o menos de su inicio
      if (diffMinutes <= thresholdMinutes) {
        return true;
      }
    }
  } catch (e) {
    console.error('Error calculando anticipación de cita:', e);
  }

  return false;
}

/**
 * Determina si una reserva se encuentra actualmente esperando el pago de su anticipo
 * (estado preliminar de 20 minutos de tolerancia).
 */
export function isPendingDepositReservation(res: any): boolean {
  if (!res) return false;

  if (
    res.anticipo_en_sucursal === true ||
    res.tolerancia_anticipo_extendida === true ||
    res.exento_anticipo === true
  ) {
    return false;
  }

  const estado = String(res.estado || '').trim();
  if (
    estado === 'Cancelado' ||
    estado === 'Cancelada' ||
    estado === 'No asiste' ||
    estado === 'Completado' ||
    estado === 'Venta completada' ||
    estado === 'Asiste' ||
    estado === 'Confirmado' ||
    estado === 'En espera'
  ) {
    return false;
  }

  const pagoEstado = String(res.pago_estado || '').trim();
  if (pagoEstado === 'Pagado') return false;

  const isExplicitlyUnpaid =
    pagoEstado === 'pendiente_anticipo' ||
    pagoEstado === 'pending_payment' ||
    pagoEstado === 'Pendiente' ||
    pagoEstado === 'pendiente';

  const isDepositPaid =
    pagoEstado === 'deposit_paid' ||
    pagoEstado === 'anticipo_pagado' ||
    (!isExplicitlyUnpaid &&
      Number(
        res.anticipo_pagado ||
          res.anticipoPagado ||
          res.monto_pagado_real ||
          res.monto_pagado ||
          0
      ) > 0);

  if (isDepositPaid) return false;

  return Boolean(
    res.requiere_pago_anticipado === true ||
      res.requiere_anticipo === true ||
      Number(res.anticipo_esperado || 0) > 0 ||
      pagoEstado === 'pendiente_anticipo' ||
      pagoEstado === 'pending_payment' ||
      estado === 'Pendiente de pago' ||
      estado === 'Pendiente de Pago' ||
      estado === 'pendiente de pago'
  );
}

/**
 * Calcula el tiempo transcurrido y si ya vencieron los 20 minutos de tolerancia
 * para una cita con anticipo pendiente.
 */
export function getPendingDepositTiming(
  res: any,
  nowMs: number = Date.now(),
  toleranceMinutes: number = 20
): {
  isPendingDeposit: boolean;
  createdMs: number | null;
  diffMinutes: number;
  depositMinutesRemaining: number;
  depositExpired: boolean;
} {
  const isPending = isPendingDepositReservation(res);
  if (!isPending) {
    return {
      isPendingDeposit: false,
      createdMs: null,
      diffMinutes: 0,
      depositMinutesRemaining: 0,
      depositExpired: false,
    };
  }

  const rawCreated = res?.creado_en || res?.createdAt || res?.creada_el;
  let createdMs: number | null = null;

  if (typeof rawCreated?.toMillis === 'function') {
    createdMs = rawCreated.toMillis();
  } else if (typeof rawCreated?.toDate === 'function') {
    createdMs = rawCreated.toDate().getTime();
  } else if (typeof rawCreated?.seconds === 'number') {
    createdMs = rawCreated.seconds * 1000;
  } else if (typeof rawCreated === 'string' || typeof rawCreated === 'number') {
    const parsed = new Date(rawCreated).getTime();
    if (!isNaN(parsed)) createdMs = parsed;
  }

  const diffMinutes = createdMs ? (nowMs - createdMs) / (1000 * 60) : 0;
  const depositMinutesRemaining = createdMs
    ? Math.max(0, Math.ceil(toleranceMinutes - diffMinutes))
    : toleranceMinutes;
  const depositExpired = Boolean(createdMs && diffMinutes >= toleranceMinutes);

  return {
    isPendingDeposit: true,
    createdMs,
    diffMinutes,
    depositMinutesRemaining,
    depositExpired,
  };
}

/**
 * Devuelve true si la cita requería anticipo, no ha sido pagada y ya superó los 20 minutos de tolerancia.
 */
export function isExpiredPendingDepositReservation(
  res: any,
  nowMs: number = Date.now(),
  toleranceMinutes: number = 20
): boolean {
  return getPendingDepositTiming(res, nowMs, toleranceMinutes).depositExpired;
}


export interface ReglasReservasConfig {
  // 1. Regla Global de Anticipo por Monto
  anticipo_monto_minimo_activo: boolean;
  anticipo_monto_minimo: number;
  anticipo_porcentaje_defecto: number;
  anticipo_monto_minimo_descripcion?: string;

  // 1.5. Regla de Anticipo Obligatorio en Horario de Apertura (10:00 a 10:30 AM)
  anticipo_horario_apertura_activo: boolean;
  anticipo_horario_apertura_hora: string;
  anticipo_horario_apertura_hora_fin?: string;
  anticipo_horario_apertura_porcentaje: number;
  anticipo_horario_apertura_descripcion?: string;

  // 2. Regla Antifraude por Inasistencias (No-Shows)
  penalizacion_inasistencias_activa: boolean;
  max_inasistencias_permitidas: number;
  penalizacion_anticipo_porcentaje: number;
  penalizacion_inasistencias_descripcion?: string;

  // 3. Política de Cancelaciones y Retención de Anticipo
  cancelacion_politica_activa: boolean;
  cancelacion_tiempo_minimo_horas: number;
  cancelacion_retencion_anticipo_porcentaje: number;
  cancelacion_saldo_favor_vigencia_dias: number;
  cancelacion_politica_descripcion?: string;

  // 4. Tiempos y Tolerancias
  tiempo_minimo_anticipacion_minutos: number;
  dias_maximos_futuro: number;
  tolerancia_puntualidad_minutos: number;
  tolerancia_anticipo_minutos?: number;
  intervalo_horarios_minutos?: number;

  // 5. Reglas Personalizadas Dinámicas
  reglas_personalizadas?: ReglaPersonalizada[];

  // 6. Reglas para Avisos de Agenda / Recepción
  reglas_avisos_agenda?: ReglaAvisoAgenda[];

  actualizado_el?: any;
  actualizado_por?: string;
}

export const DEFAULT_BOOKING_RULES: ReglasReservasConfig = {
  anticipo_monto_minimo_activo: true,
  anticipo_monto_minimo: 190,
  anticipo_porcentaje_defecto: 50,
  anticipo_monto_minimo_descripcion:
    'Exige anticipo obligatorio en línea del 50% cuando el monto total de los servicios reservados alcance o supere los $190 MXN.',

  anticipo_horario_apertura_activo: true,
  anticipo_horario_apertura_hora: '10:00',
  anticipo_horario_apertura_hora_fin: '10:30',
  anticipo_horario_apertura_porcentaje: 50,
  anticipo_horario_apertura_descripcion:
    'Todas las citas que inicien dentro de la franja de apertura (de 10:00 a 10:30 AM), ya sea desde la página web, desde la aplicación móvil o desde la misma agenda, requieren obligatoriamente un anticipo de garantía del 50% para asegurar el primer turno del día.',

  penalizacion_inasistencias_activa: true,
  max_inasistencias_permitidas: 2,
  penalizacion_anticipo_porcentaje: 50,
  penalizacion_inasistencias_descripcion:
    'Si un cliente acumula 2 o más inasistencias previas (citas marcadas como No Asistió) o faltas, el sistema le exigirá obligatoriamente un anticipo de garantía del 50% para sus siguientes citas, sin importar el monto del servicio, protegiendo el tiempo y las ganancias de los barberos.',

  cancelacion_politica_activa: true,
  cancelacion_tiempo_minimo_horas: 2,
  cancelacion_retencion_anticipo_porcentaje: 100,
  cancelacion_saldo_favor_vigencia_dias: 30,
  cancelacion_politica_descripcion:
    'Si el cliente cancela o reagenda con un mínimo de 2 horas de anticipación a su cita, el 100% de su anticipo se conserva como saldo a favor en su cuenta (vigencia de 30 días naturales). Si cancela con menos de 2 horas de anticipación o no se presenta (No-Show), se retiene el 100% del anticipo como compensación por el tiempo reservado del barbero y costos operativos, de acuerdo con los Términos y Condiciones oficiales.',

  tiempo_minimo_anticipacion_minutos: 30,
  dias_maximos_futuro: 14,
  tolerancia_puntualidad_minutos: 10,
  tolerancia_anticipo_minutos: 20,
  intervalo_horarios_minutos: 30,

  reglas_personalizadas: [],
  reglas_avisos_agenda: DEFAULT_AVISOS_AGENDA_RULES,
};

/**
 * Verifica si una hora dada (ej. '10:00', '10:10', '10:30') corresponde a la franja del horario de apertura (por defecto de 10:00 a 10:30 AM).
 */
export function isOpeningHourTime(
  time?: string | null,
  openingHour: string = '10:00',
  closingHour: string = '10:30'
): boolean {
  if (!time || typeof time !== 'string') return false;
  const raw = time.trim().toLowerCase();

  // Extraer HH:mm de formatos como "10:00", "10:10 am", "10:00:00"
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return false;

  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (raw.includes('pm') && h < 12) h += 12;
  if (raw.includes('am') && h === 12) h = 0;

  const currentMinutes = h * 60 + m;

  const openMatch = (openingHour || '10:00').trim().match(/^(\d{1,2}):(\d{2})/);
  const openH = openMatch ? parseInt(openMatch[1], 10) : 10;
  const openM = openMatch ? parseInt(openMatch[2], 10) : 0;
  const openMinutes = openH * 60 + openM;

  let endMinutes = openMinutes + 30; // 30 min de margen por defecto
  const closeMatch = (closingHour || '10:30').trim().match(/^(\d{1,2}):(\d{2})/);
  if (closeMatch) {
    endMinutes = parseInt(closeMatch[1], 10) * 60 + parseInt(closeMatch[2], 10);
  }

  return currentMinutes >= openMinutes && currentMinutes <= endMinutes;
}

export interface BookingRulesEvaluation {
  requiresDeposit: boolean;
  depositAmount: number;
  depositPercentage: number;
  reason: 'client_history' | 'service_specific' | 'opening_hour' | 'custom_rule' | 'global_threshold' | 'same_day_accumulation' | 'none';
  clientNoShowsCount?: number;
  sameDayActiveCount?: number;
  sameDayActiveTotal?: number;
  sameDayAccumulatedTotal?: number;
  customRuleName?: string;
  customRuleMessage?: string;
  blockedOnline?: boolean;
  blockedReason?: string;
}

/**
 * Evalúa las reglas de reserva respetando la jerarquía de mayor peso:
 * 1. Regla de Cliente (Máxima Prioridad): Si tiene >= N inasistencias o cancelaciones, siempre paga anticipo.
 * 2. Regla de Servicio Específico: Si un servicio tiene regla propia de anticipo, se respeta.
 * 2.5. Regla de Horario de Apertura (10:00 AM): Toda cita en el horario de apertura requiere anticipo.
 * 3. Regla General: Si el total supera el monto mínimo configurado (ej. $190), se cobra anticipo.
 * 4. Por defecto: No requiere anticipo.
 */
export function evaluateDepositRequirement({
  totalPrice,
  services,
  clientHistory,
  date,
  time,
  totalDurationMinutes,
  isNewClient,
  sameDayActiveCount,
  sameDayActiveTotal,
  rules = DEFAULT_BOOKING_RULES,
}: {
  totalPrice: number;
  services?: Array<{
    id?: string;
    price?: number;
    payment_type?: string;
    payment_amount_type?: string;
    payment_amount_value?: number;
    requiereAnticipo?: boolean;
    montoAnticipo?: number;
  }>;
  clientHistory?: {
    citas_canceladas?: number;
    citas_no_asistidas?: number;
  } | null;
  date?: string; // 'YYYY-MM-DD'
  time?: string; // 'HH:mm'
  totalDurationMinutes?: number;
  isNewClient?: boolean;
  sameDayActiveCount?: number;
  sameDayActiveTotal?: number;
  rules?: Partial<ReglasReservasConfig>;
}): BookingRulesEvaluation {
  const mergedRules: ReglasReservasConfig = {
    ...DEFAULT_BOOKING_RULES,
    ...rules,
  };

  const safeTotal = Number(totalPrice) || 0;

  // --- CÁLCULO DE ANTICIPO POR SERVICIOS ESPECÍFICOS ---
  let specificDepositSum = 0;
  let hasSpecificServiceDeposit = false;

  if (services && services.length > 0) {
    services.forEach((s) => {
      const price = Number(s.price) || 0;
      const pType = s.payment_type || (s.requiereAnticipo ? 'online-deposit' : 'no-payment');

      if (pType === 'online-deposit') {
        hasSpecificServiceDeposit = true;
        const amountType = s.payment_amount_type || (s.montoAnticipo ? '$' : '%');
        const amountVal = Number(s.payment_amount_value ?? s.montoAnticipo ?? 0);

        if (amountType === '$' && amountVal > 0) {
          specificDepositSum += Math.min(amountVal, price);
        } else if (amountType === '%' && amountVal > 0) {
          specificDepositSum += price * (amountVal / 100);
        } else {
          specificDepositSum += price * 0.5; // 50% fallback
        }
      } else if (pType === 'full-payment') {
        hasSpecificServiceDeposit = true;
        specificDepositSum += price;
      }
    });
  }

  // --- 1. REGLA DE CLIENTE (MÁXIMA PRIORIDAD - ESCUDO ANTIFRAUDE) ---
  if (mergedRules.penalizacion_inasistencias_activa && clientHistory) {
    const canceladas = Number(clientHistory.citas_canceladas) || 0;
    const noAsistidas = Number(clientHistory.citas_no_asistidas) || 0;
    const totalFaltas = canceladas + noAsistidas;

    const thresholdFaltas = Number(mergedRules.max_inasistencias_permitidas) || 2;

    if ((noAsistidas >= thresholdFaltas || totalFaltas >= thresholdFaltas) && safeTotal > 0) {
      const pct = Number(mergedRules.penalizacion_anticipo_porcentaje) || 50;
      const penaltyDeposit = Math.round(safeTotal * (pct / 100) * 100) / 100;
      const finalDeposit = Math.max(penaltyDeposit, specificDepositSum);
      const effectivePct = safeTotal > 0 ? Math.round((finalDeposit / safeTotal) * 100) : pct;

      return {
        requiresDeposit: true,
        depositAmount: finalDeposit,
        depositPercentage: effectivePct,
        reason: 'client_history',
        clientNoShowsCount: Math.max(noAsistidas, totalFaltas),
      };
    }
  }

  // --- 2. REGLA POR SERVICIO ESPECÍFICO (PRIORIDAD MEDIA) ---
  if (hasSpecificServiceDeposit && specificDepositSum > 0) {
    const deposit = Math.round(specificDepositSum * 100) / 100;
    const pct = safeTotal > 0 ? Math.round((deposit / safeTotal) * 100) : 50;
    return {
      requiresDeposit: true,
      depositAmount: deposit,
      depositPercentage: pct,
      reason: 'service_specific',
    };
  }

  // --- 2.5. REGLA DE HORARIO DE APERTURA (10:00 A 10:30 AM - ALTA PRIORIDAD) ---
  if (mergedRules.anticipo_horario_apertura_activo !== false && safeTotal > 0) {
    const targetOpeningHour = mergedRules.anticipo_horario_apertura_hora || '10:00';
    const targetClosingHour = mergedRules.anticipo_horario_apertura_hora_fin || '10:30';
    if (isOpeningHourTime(time, targetOpeningHour, targetClosingHour)) {
      const pct = Number(mergedRules.anticipo_horario_apertura_porcentaje || mergedRules.anticipo_porcentaje_defecto) || 50;
      const deposit = Math.round(safeTotal * (pct / 100) * 100) / 100;
      return {
        requiresDeposit: true,
        depositAmount: deposit,
        depositPercentage: pct,
        reason: 'opening_hour',
        customRuleName: `Anticipo en Franja de Apertura (${targetOpeningHour} - ${targetClosingHour} AM)`,
        customRuleMessage: `Todas las citas agendadas en la franja de apertura (${targetOpeningHour} a ${targetClosingHour} AM) requieren un anticipo del ${pct}% ($${deposit.toFixed(2)} MXN) para asegurar el primer turno del día.`,
      };
    }
  }

  // --- 3. REGLAS PERSONALIZADAS DINÁMICAS (ALTA PRIORIDAD) ---
  if (mergedRules.reglas_personalizadas && Array.isArray(mergedRules.reglas_personalizadas)) {
    for (const rule of mergedRules.reglas_personalizadas) {
      if (!rule.activa) continue;

      let applies = false;
      const c = rule.condicion;

      switch (c.tipo) {
        case 'dias_semana': {
          if (date && c.dias && c.dias.length > 0) {
            const [y, m, d] = date.split('-').map(Number);
            const dateObj = new Date(y, m - 1, d);
            const daysMap = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
            const dayName = daysMap[dateObj.getDay()];
            if (c.dias.includes(dayName)) {
              applies = true;
            }
          }
          break;
        }
        case 'monto_minimo': {
          if (c.monto_minimo && safeTotal >= c.monto_minimo) {
            applies = true;
          }
          break;
        }
        case 'cantidad_servicios': {
          const count = services?.length || 1;
          if (c.cantidad_minima_servicios && count >= c.cantidad_minima_servicios) {
            applies = true;
          }
          break;
        }
        case 'duracion_minima': {
          const dur = totalDurationMinutes || 0;
          if (c.duracion_minima_minutos && dur >= c.duracion_minima_minutos) {
            applies = true;
          }
          break;
        }
        case 'horario_estelar': {
          if (time && c.hora_inicio && c.hora_fin) {
            if (time >= c.hora_inicio && time <= c.hora_fin) {
              applies = true;
            }
          }
          break;
        }
        case 'cliente_nuevo': {
          if (isNewClient) {
            applies = true;
          }
          break;
        }
        case 'categoria_servicio': {
          if (c.categoria && services && services.length > 0) {
            const matchesCat = services.some((s: any) =>
              (s.category || s.categoria || '').toLowerCase().includes(c.categoria!.toLowerCase())
            );
            if (matchesCat) applies = true;
          }
          break;
        }
      }

      if (applies) {
        const cons = rule.consecuencia;
        if (cons.tipo === 'bloquear_online') {
          return {
            requiresDeposit: false,
            depositAmount: 0,
            depositPercentage: 0,
            reason: 'custom_rule',
            customRuleName: rule.nombre,
            customRuleMessage: cons.mensaje_cliente,
            blockedOnline: true,
            blockedReason: cons.mensaje_cliente || `Reserva online no disponible para esta regla (${rule.nombre}).`,
          };
        } else if (cons.tipo === 'exigir_anticipo') {
          let deposit = 0;
          let pct = 50;

          if (cons.tipo_anticipo === 'monto_fijo' && Number(cons.valor_anticipo) > 0) {
            deposit = Math.min(Number(cons.valor_anticipo), safeTotal);
            pct = safeTotal > 0 ? Math.round((deposit / safeTotal) * 100) : 50;
          } else {
            pct = Number(cons.valor_anticipo) || 50;
            deposit = Math.round(safeTotal * (pct / 100) * 100) / 100;
          }

          return {
            requiresDeposit: true,
            depositAmount: deposit,
            depositPercentage: pct,
            reason: 'custom_rule',
            customRuleName: rule.nombre,
            customRuleMessage: cons.mensaje_cliente,
          };
        }
      }
    }
  }

  // --- 3.5. ESCUDO ANTI-FRAGMENTACIÓN Y ACUMULADO DIARIO (ALTA PRIORIDAD) ---
  // Si el cliente ya cuenta con citas activas en la misma fecha, evitamos que evada
  // el anticipo dividiendo servicios en reservas individuales.
  if (mergedRules.anticipo_monto_minimo_activo && (sameDayActiveCount || 0) > 0) {
    const existingDayTotal = Number(sameDayActiveTotal) || 0;
    const accumulatedDayTotal = existingDayTotal + safeTotal;
    const minThreshold = Number(mergedRules.anticipo_monto_minimo) || 190;
    const defaultPercent = Number(mergedRules.anticipo_porcentaje_defecto) || 50;

    // Si al sumar la nueva cita alcanza/supera el umbral ($190) O si ya tiene 1 o más citas activas en el día
    if (accumulatedDayTotal >= minThreshold || (sameDayActiveCount || 0) >= 1) {
      const deposit = Math.round(safeTotal * (defaultPercent / 100) * 100) / 100;
      return {
        requiresDeposit: true,
        depositAmount: deposit,
        depositPercentage: defaultPercent,
        reason: 'same_day_accumulation',
        sameDayActiveCount,
        sameDayActiveTotal: existingDayTotal,
        sameDayAccumulatedTotal: accumulatedDayTotal,
        customRuleMessage: `Detectamos que ya cuentas con ${sameDayActiveCount} cita(s) previa(s) para este día ($${existingDayTotal.toFixed(2)} MXN). Al acumular $${accumulatedDayTotal.toFixed(2)} MXN en la fecha, se requiere un anticipo del ${defaultPercent}% ($${deposit.toFixed(2)} MXN) de garantía.`,
      };
    }
  }

  // --- 4. REGLA GENERAL POR DEFECTO (MONTO MÍNIMO) ---
  if (mergedRules.anticipo_monto_minimo_activo) {
    const minThreshold = Number(mergedRules.anticipo_monto_minimo) || 190;
    const defaultPercent = Number(mergedRules.anticipo_porcentaje_defecto) || 50;

    if (minThreshold > 0 && safeTotal >= minThreshold) {
      const deposit = Math.round(safeTotal * (defaultPercent / 100) * 100) / 100;
      return {
        requiresDeposit: true,
        depositAmount: deposit,
        depositPercentage: defaultPercent,
        reason: 'global_threshold',
      };
    }
  }

  // --- 5. SIN ANTICIPO ---
  return {
    requiresDeposit: false,
    depositAmount: 0,
    depositPercentage: 0,
    reason: 'none',
  };
}

export interface CancellationEvaluation {
  allowedWithoutPenalty: boolean;
  isLate: boolean;
  diffHours: number;
  minHoursRequired: number;
  retainDeposit: boolean;
  retainedAmount: number;
  balanceToCredit: number;
  vigenciaDias: number;
  message: string;
}

/**
 * Evalúa las condiciones de cancelación de una cita y la aplicación de la retención
 * de anticipo según los Términos y Condiciones oficiales y las Reglas de Reserva.
 */
export function evaluateCancellationPolicy({
  appointmentDate,
  appointmentTime,
  cancelDateTime = new Date(),
  depositPaid = 0,
  rules = DEFAULT_BOOKING_RULES,
}: {
  appointmentDate: string; // 'YYYY-MM-DD'
  appointmentTime: string; // 'HH:mm'
  cancelDateTime?: Date;
  depositPaid?: number;
  rules?: Partial<ReglasReservasConfig>;
}): CancellationEvaluation {
  const mergedRules = { ...DEFAULT_BOOKING_RULES, ...rules };

  if (!mergedRules.cancelacion_politica_activa) {
    return {
      allowedWithoutPenalty: true,
      isLate: false,
      diffHours: 999,
      minHoursRequired: 0,
      retainDeposit: false,
      retainedAmount: 0,
      balanceToCredit: depositPaid,
      vigenciaDias: mergedRules.cancelacion_saldo_favor_vigencia_dias || 30,
      message: 'Política de retención de anticipo inactiva.',
    };
  }

  let aptDate: Date | null = null;
  try {
    const [y, m, d] = appointmentDate.split('-').map(Number);
    const [h, min] = appointmentTime.split(':').map(Number);
    aptDate = new Date(y, m - 1, d, h, min, 0);
  } catch {
    aptDate = null;
  }

  if (!aptDate || isNaN(aptDate.getTime())) {
    return {
      allowedWithoutPenalty: true,
      isLate: false,
      diffHours: 999,
      minHoursRequired: mergedRules.cancelacion_tiempo_minimo_horas || 2,
      retainDeposit: false,
      retainedAmount: 0,
      balanceToCredit: depositPaid,
      vigenciaDias: mergedRules.cancelacion_saldo_favor_vigencia_dias || 30,
      message: 'Fecha u hora de cita no disponible para evaluar penalización.',
    };
  }

  const diffMs = aptDate.getTime() - cancelDateTime.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  const minHours = Number(mergedRules.cancelacion_tiempo_minimo_horas) || 2;
  const retainPct = Number(mergedRules.cancelacion_retencion_anticipo_porcentaje) || 100;
  const isLate = diffHours < minHours;

  const safeDeposit = Math.max(0, Number(depositPaid) || 0);
  const retainedAmount = isLate ? Math.round(safeDeposit * (retainPct / 100) * 100) / 100 : 0;
  const balanceToCredit = Math.max(0, safeDeposit - retainedAmount);

  return {
    allowedWithoutPenalty: !isLate,
    isLate,
    diffHours: Math.round(diffHours * 10) / 10,
    minHoursRequired: minHours,
    retainDeposit: isLate && retainedAmount > 0,
    retainedAmount,
    balanceToCredit,
    vigenciaDias: mergedRules.cancelacion_saldo_favor_vigencia_dias || 30,
    message: isLate
      ? `Cancelación tardía (a menos de ${minHours}h de la cita). Aplica retención del ${retainPct}% del anticipo ($${retainedAmount} MXN).`
      : `Cancelación a tiempo (con más de ${minHours}h de anticipación). Anticipo de $${balanceToCredit} MXN acreditable como saldo a favor (vigencia de ${mergedRules.cancelacion_saldo_favor_vigencia_dias} días).`,
  };
}

