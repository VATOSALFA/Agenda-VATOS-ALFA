export interface PaqueteRecargaSaldo {
  id: string;
  monto: number;
  bono_alfa_coins: number;
  etiqueta?: string;
  activo: boolean;
}

export interface SaldoPaseAlfaConfig {
  activo: boolean;
  paquetes: PaqueteRecargaSaldo[];
  permitir_monto_libre: boolean;
  monto_minimo: number;
  monto_maximo: number;
  tope_saldo_acumulado: number;
  bono_escalon_en_monto_libre: boolean;
  metodos_permitidos: {
    mercadopago_app: boolean;
    efectivo_sucursal: boolean;
    terminal_sucursal: boolean;
    transferencia_sucursal: boolean;
  };
  aplicable_en: 'ambos' | 'servicios';
  permitir_pago_citas_app: boolean;
}

export const DEFAULT_SALDO_PASE_ALFA_CONFIG: SaldoPaseAlfaConfig = {
  activo: true,
  paquetes: [
    {
      id: 'recarga_500',
      monto: 500,
      bono_alfa_coins: 200,
      etiqueta: 'Básico',
      activo: true,
    },
    {
      id: 'recarga_1000',
      monto: 1000,
      bono_alfa_coins: 500,
      etiqueta: 'Más Popular',
      activo: true,
    },
    {
      id: 'recarga_2000',
      monto: 2000,
      bono_alfa_coins: 1200,
      etiqueta: 'VIP',
      activo: true,
    },
  ],
  permitir_monto_libre: true,
  monto_minimo: 200,
  monto_maximo: 5000,
  tope_saldo_acumulado: 10000,
  bono_escalon_en_monto_libre: true,
  metodos_permitidos: {
    mercadopago_app: true,
    efectivo_sucursal: true,
    terminal_sucursal: true,
    transferencia_sucursal: true,
  },
  aplicable_en: 'ambos',
  permitir_pago_citas_app: true,
};

export function normalizeSaldoPaseAlfaConfig(
  raw?: Partial<SaldoPaseAlfaConfig> | null
): SaldoPaseAlfaConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_SALDO_PASE_ALFA_CONFIG,
      paquetes: DEFAULT_SALDO_PASE_ALFA_CONFIG.paquetes.map((p) => ({ ...p })),
      metodos_permitidos: { ...DEFAULT_SALDO_PASE_ALFA_CONFIG.metodos_permitidos },
    };
  }

  const paquetesRaw = Array.isArray(raw.paquetes)
    ? raw.paquetes
    : DEFAULT_SALDO_PASE_ALFA_CONFIG.paquetes;

  const paquetes: PaqueteRecargaSaldo[] = paquetesRaw
    .map((p: any, idx: number) => ({
      id: String(p?.id || `recarga_${idx + 1}`),
      monto: Math.max(1, Math.round(Number(p?.monto || 0) * 100) / 100),
      bono_alfa_coins: Math.max(0, Math.floor(Number(p?.bono_alfa_coins ?? p?.bono_coins ?? 0))),
      etiqueta: p?.etiqueta ? String(p.etiqueta).trim() : '',
      activo: p?.activo !== false,
    }))
    .filter((p) => p.monto > 0)
    .sort((a, b) => a.monto - b.monto);

  const montoMin = Math.max(10, Number(raw.monto_minimo ?? DEFAULT_SALDO_PASE_ALFA_CONFIG.monto_minimo));
  const montoMax = Math.max(montoMin, Number(raw.monto_maximo ?? DEFAULT_SALDO_PASE_ALFA_CONFIG.monto_maximo));
  const topeAcum = Math.max(
    montoMax,
    Number(raw.tope_saldo_acumulado ?? DEFAULT_SALDO_PASE_ALFA_CONFIG.tope_saldo_acumulado)
  );

  return {
    activo: raw.activo !== false,
    paquetes,
    permitir_monto_libre: raw.permitir_monto_libre !== false,
    monto_minimo: montoMin,
    monto_maximo: montoMax,
    tope_saldo_acumulado: topeAcum,
    bono_escalon_en_monto_libre: raw.bono_escalon_en_monto_libre !== false,
    metodos_permitidos: {
      mercadopago_app: raw.metodos_permitidos?.mercadopago_app !== false,
      efectivo_sucursal: raw.metodos_permitidos?.efectivo_sucursal !== false,
      terminal_sucursal: raw.metodos_permitidos?.terminal_sucursal !== false,
      transferencia_sucursal: raw.metodos_permitidos?.transferencia_sucursal !== false,
    },
    aplicable_en: raw.aplicable_en === 'servicios' ? 'servicios' : 'ambos',
    permitir_pago_citas_app: raw.permitir_pago_citas_app !== false,
  };
}

export function getClientWalletBalance(clientData?: any): number {
  if (!clientData) return 0;
  const val = Number(
    clientData.saldo_monedero ??
      clientData.saldoMonedero ??
      clientData.saldo_pase_alfa ??
      0
  );
  if (!Number.isFinite(val) || val <= 0) return 0;
  return Math.round(val * 100) / 100;
}

/**
 * Verifica sin dependencias de cliente si un documento `clientes/{id}` corresponde
 * a un miembro con App Móvil vinculada (Pase Alfa activo).
 */
export function hasClientLinkedApp(clientData?: any): boolean {
  if (!clientData) return false;
  if (clientData.appVinculada === true || clientData.appInstalada === true) return true;
  if (clientData.ultimoAccesoApp) return true;
  if (clientData.authUid && String(clientData.authUid).trim().length > 0) return true;
  const origen = String(clientData.origen || '').toLowerCase();
  if (
    origen.includes('app_movil') ||
    origen.includes('app_store_reviewer') ||
    origen.includes('app vatos alfa')
  ) {
    return true;
  }
  if (clientData.fecha_registro_app || clientData.correo_app || clientData.fcmToken) {
    return true;
  }
  return false;
}

/**
 * Calcula únicamente el BONO PROMOCIONAL de Alfa Coins aplicable a una recarga de Saldo Pase Alfa.
 * Regla oficial: recargar saldo NUNCA otorga Alfa Coins regulares por gasto ($1 = 1 coin);
 * esos se otorgan conforme el cliente consume servicios reales.
 */
export function calculateTopupBonusCoins(
  amount: number,
  rawCfg?: Partial<SaldoPaseAlfaConfig> | null
): { bonusCoins: number; matchedPackage: PaqueteRecargaSaldo | null } {
  const cfg = normalizeSaldoPaseAlfaConfig(rawCfg);
  const cleanAmt = Math.round(Number(amount || 0) * 100) / 100;
  if (!cfg.activo || cleanAmt <= 0) {
    return { bonusCoins: 0, matchedPackage: null };
  }

  const activePackages = cfg.paquetes
    .filter((p) => p.activo && p.monto > 0)
    .sort((a, b) => a.monto - b.monto);

  // 1. Coincidencia exacta de paquete
  const exact = activePackages.find((p) => Math.abs(p.monto - cleanAmt) < 0.01);
  if (exact) {
    return { bonusCoins: Math.max(0, exact.bono_alfa_coins), matchedPackage: exact };
  }

  // 2. Si es monto libre y está activo el bono por escalón alcanzado, tomar el mayor escalón <= cleanAmt
  if (cfg.permitir_monto_libre && cfg.bono_escalon_en_monto_libre) {
    let bestTier: PaqueteRecargaSaldo | null = null;
    for (const pkg of activePackages) {
      if (cleanAmt + 0.001 >= pkg.monto) {
        bestTier = pkg;
      }
    }
    if (bestTier) {
      return { bonusCoins: Math.max(0, bestTier.bono_alfa_coins), matchedPackage: bestTier };
    }
  }

  return { bonusCoins: 0, matchedPackage: null };
}

/**
 * Valida si un monto solicitado cumple las reglas de paquetes o rango personalizado vigente.
 */
export function validateTopupAmountRules(
  amount: number,
  currentBalance: number,
  rawCfg?: Partial<SaldoPaseAlfaConfig> | null
): { ok: true; cleanAmount: number; bonusCoins: number; matchedPackage: PaqueteRecargaSaldo | null } | { ok: false; error: string } {
  const cfg = normalizeSaldoPaseAlfaConfig(rawCfg);
  if (!cfg.activo) {
    return { ok: false, error: 'El programa Saldo Pase Alfa se encuentra temporalmente pausado.' };
  }

  const cleanAmount = Math.round(Number(amount || 0) * 100) / 100;
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    return { ok: false, error: 'Ingresa un monto de recarga válido mayor a $0.00 MXN.' };
  }

  const activePackages = cfg.paquetes.filter((p) => p.activo && p.monto > 0);
  const exactPackage = activePackages.find((p) => Math.abs(p.monto - cleanAmount) < 0.01);

  if (!exactPackage) {
    if (!cfg.permitir_monto_libre) {
      return {
        ok: false,
        error: 'Por el momento únicamente se permiten recargas mediante los paquetes oficiales vigentes.',
      };
    }
    if (cleanAmount + 0.001 < cfg.monto_minimo) {
      return {
        ok: false,
        error: `El monto mínimo de recarga personalizada es de $${cfg.monto_minimo.toFixed(2)} MXN.`,
      };
    }
    if (cleanAmount - 0.001 > cfg.monto_maximo) {
      return {
        ok: false,
        error: `El monto máximo por recarga es de $${cfg.monto_maximo.toFixed(2)} MXN.`,
      };
    }
  }

  const cleanCurrent = Math.max(0, Math.round(Number(currentBalance || 0) * 100) / 100);
  if (cleanCurrent + cleanAmount - 0.01 > cfg.tope_saldo_acumulado) {
    return {
      ok: false,
      error: `El tope máximo acumulable en Saldo Pase Alfa es de $${cfg.tope_saldo_acumulado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN (saldo actual: $${cleanCurrent.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN).`,
    };
  }

  const { bonusCoins, matchedPackage } = calculateTopupBonusCoins(cleanAmount, cfg);
  return {
    ok: true,
    cleanAmount,
    bonusCoins,
    matchedPackage,
  };
}

export function buildDefaultSaldoDescripcion(
  rawCfg?: Partial<SaldoPaseAlfaConfig> | null
): string {
  const cfg = normalizeSaldoPaseAlfaConfig(rawCfg);
  const activeWithBonus = cfg.paquetes.filter((p) => p.activo && p.bono_alfa_coins > 0);
  const bonusHighlight =
    activeWithBonus.length > 0
      ? ` Recarga por ejemplo $${activeWithBonus[0].monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN y recibe +${activeWithBonus[0].bono_alfa_coins} Alfa Coins de bono inmediato.`
      : '';
  const scopeLabel =
    cfg.aplicable_en === 'servicios'
      ? 'todos tus servicios en sucursal'
      : 'todos tus servicios y productos en sucursal';
  return `Abona saldo prepago a tu cuenta Pase Alfa desde la App Móvil o en recepción y paga ${scopeLabel} o tus citas sin usar efectivo ni tarjeta en cada visita.${bonusHighlight} Tus sellos y Alfa Coins por visita se acreditan conforme consumes tus servicios.`;
}

export function buildDefaultSaldoTerminos(
  rawCfg?: Partial<SaldoPaseAlfaConfig> | null
): string {
  const cfg = normalizeSaldoPaseAlfaConfig(rawCfg);
  const activePkgs = cfg.paquetes.filter((p) => p.activo);
  const pkgLines =
    activePkgs.length > 0
      ? activePkgs
          .map((p) => {
            const m = `$${p.monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
            return p.bono_alfa_coins > 0
              ? `  - Recarga de ${m}: acredita ${m} de saldo disponible + ${p.bono_alfa_coins} Alfa Coins de regalo promocional.`
              : `  - Recarga de ${m}: acredita ${m} de saldo disponible.`;
          })
          .join('\n')
      : '  - Montos disponibles directamente en la App Móvil y en recepción.';

  const methodsList: string[] = [];
  if (cfg.metodos_permitidos.mercadopago_app) {
    methodsList.push(
      'en línea desde la App Móvil (Tarjeta de crédito/débito o Transferencia SPEI automática vía Mercado Pago)'
    );
  }
  const branchMethods: string[] = [];
  if (cfg.metodos_permitidos.efectivo_sucursal) branchMethods.push('Efectivo');
  if (cfg.metodos_permitidos.terminal_sucursal) branchMethods.push('Terminal Point');
  if (cfg.metodos_permitidos.transferencia_sucursal) branchMethods.push('Transferencia verificada');
  if (branchMethods.length > 0) {
    methodsList.push(`directamente en recepción (${branchMethods.join(', ')})`);
  }

  const scopeText =
    cfg.aplicable_en === 'servicios'
      ? 'servicios de barbería (no aplicable a productos ni propinas)'
      : 'servicios de barbería y productos de tienda (las propinas se cubren por separado en efectivo, tarjeta o transferencia)';

  return `Términos y Condiciones — SALDO PASE ALFA (Monedero Prepago)
1. Exclusividad de Miembros. El Saldo Pase Alfa es exclusivo para clientes registrados con cuenta activa en la App Móvil oficial de VATOS ALFA Barber Shop.
2. Paquetes y Bonos Vigentes.
${pkgLines}
${cfg.permitir_monto_libre ? `  - Monto personalizado permitido desde $${cfg.monto_minimo.toFixed(2)} MXN hasta $${cfg.monto_maximo.toFixed(2)} MXN por operación (tope máximo acumulable de $${cfg.tope_saldo_acumulado.toFixed(2)} MXN).` : '  - Únicamente recargas mediante los paquetes oficiales vigentes.'}
3. Acreditación de Alfa Coins y Sellos. Al realizar una recarga de saldo únicamente se abona el dinero recargado y, cuando corresponda, el bono promocional de Alfa Coins del paquete elegido. Los Alfa Coins regulares por consumo, los sellos de "La Décima va por la Casa" y el avance de Nivel Pase Alfa se generan en el momento en que el cliente consume sus servicios reales pagando con su saldo.
4. Medios de Recarga Autorizados. Puedes abonar saldo ${methodsList.join(' o ')}.
5. Uso del Saldo y Pagos Combinados. El saldo es válido para pagar ${scopeText}${cfg.permitir_pago_citas_app ? ', así como para cubrir anticipos o liquidar citas al agendar en la App Móvil' : ''}. Si el saldo disponible es menor al total del servicio, puede combinarse con efectivo, tarjeta o transferencia.
6. Vigencia y Políticas de Uso. El saldo prepagado es personal, intransferible, no genera intereses y no es reembolsable en efectivo; únicamente es canjeable dentro de las sucursales y canales oficiales de VATOS ALFA Barber Shop.`;
}
