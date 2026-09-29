export interface ReglasReservasConfig {
  // 1. Regla Global de Anticipo por Monto
  anticipo_monto_minimo_activo: boolean;
  anticipo_monto_minimo: number;
  anticipo_porcentaje_defecto: number;

  // 2. Regla Antifraude por Inasistencias (No-Shows)
  penalizacion_inasistencias_activa: boolean;
  max_inasistencias_permitidas: number;
  penalizacion_anticipo_porcentaje: number;

  // 3. Tiempos y Tolerancias
  tiempo_minimo_anticipacion_minutos: number;
  dias_maximos_futuro: number;
  tolerancia_puntualidad_minutos: number;

  actualizado_el?: any;
  actualizado_por?: string;
}

export const DEFAULT_BOOKING_RULES: ReglasReservasConfig = {
  anticipo_monto_minimo_activo: true,
  anticipo_monto_minimo: 190,
  anticipo_porcentaje_defecto: 50,

  penalizacion_inasistencias_activa: true,
  max_inasistencias_permitidas: 2,
  penalizacion_anticipo_porcentaje: 50,

  tiempo_minimo_anticipacion_minutos: 30,
  dias_maximos_futuro: 14,
  tolerancia_puntualidad_minutos: 10,
};

export interface BookingRulesEvaluation {
  requiresDeposit: boolean;
  depositAmount: number;
  depositPercentage: number;
  reason: 'client_history' | 'service_specific' | 'global_threshold' | 'none';
  clientNoShowsCount?: number;
}

/**
 * Evalúa las reglas de reserva respetando la jerarquía de mayor peso:
 * 1. Regla de Cliente (Máxima Prioridad): Si tiene >= N inasistencias o cancelaciones, siempre paga anticipo.
 * 2. Regla de Servicio Específico: Si un servicio tiene regla propia de anticipo, se respeta.
 * 3. Regla General: Si el total supera el monto mínimo configurado (ej. $190), se cobra anticipo.
 * 4. Por defecto: No requiere anticipo.
 */
export function evaluateDepositRequirement({
  totalPrice,
  services,
  clientHistory,
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

    if (totalFaltas >= thresholdFaltas && safeTotal > 0) {
      const pct = Number(mergedRules.penalizacion_anticipo_porcentaje) || 50;
      const penaltyDeposit = Math.round(safeTotal * (pct / 100) * 100) / 100;
      const finalDeposit = Math.max(penaltyDeposit, specificDepositSum);
      const effectivePct = safeTotal > 0 ? Math.round((finalDeposit / safeTotal) * 100) : pct;

      return {
        requiresDeposit: true,
        depositAmount: finalDeposit,
        depositPercentage: effectivePct,
        reason: 'client_history',
        clientNoShowsCount: totalFaltas,
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

  // --- 3. REGLA GENERAL POR DEFECTO (MONTO MÍNIMO) ---
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

  // --- 4. SIN ANTICIPO ---
  return {
    requiresDeposit: false,
    depositAmount: 0,
    depositPercentage: 0,
    reason: 'none',
  };
}
