import { getDb } from '@/lib/firebase-server';
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { chatContextStorage } from './agent-context';
import { cleanSearchStr } from './agent-utils';

export interface ClientLoyaltySummary {
  tierId: 'member' | 'gold' | 'vip';
  tierName: string;
  cashbackPct: number;
  coinUnitValueMxn: number;
  alfaCoinsBalance: number;
  alfaCoinsCashEquivalentMxn: number;
  stampsAccumulated: number;
  stampsRequired: number;
  stampsRemainingForFreeCut: number;
  rewardName: string;
  hasAppLinked: boolean;
  resumenTexto: string;
}

const DEFAULT_TIERS = {
  member: { nombre: 'Alfa Member', cashbackPct: 3, visitasMin: 0, gastoMin: 0 },
  gold: { nombre: 'Alfa Gold', cashbackPct: 5, visitasMin: 4, gastoMin: 1500 },
  vip: { nombre: 'Alfa Black VIP', cashbackPct: 7, visitasMin: 8, gastoMin: 3500 },
};

/**
 * Calcula el resumen exacto del Pase Alfa Club, nivel, sellos y equivalencia en pesos de ALFA COINS
 * para un cliente específico, usando la misma fórmula oficial del punto de venta (NewSaleSheet).
 */
export function computeClientLoyaltySummary(
  clientData: Record<string, any> | null | undefined,
  paseAlfaCfg?: Record<string, any> | null,
  appMovilCfg?: Record<string, any> | null
): ClientLoyaltySummary {
  const rawPase = paseAlfaCfg || appMovilCfg?.pase_alfa || appMovilCfg || {};
  const nivelesCfg =
    appMovilCfg?.niveles_config ||
    rawPase?.niveles_config ||
    paseAlfaCfg?.niveles_config || {
      activo: true,
      criterio: 'ambos_opcional',
      ...DEFAULT_TIERS,
    };

  const stampsRequired = Number(rawPase?.sellosRequeridos) > 0 ? Number(rawPase.sellosRequeridos) : 10;
  const rewardName = rawPase?.recompensa || 'Corte de Cabello 100% Gratis';

  const member = nivelesCfg.member || DEFAULT_TIERS.member;
  const gold = nivelesCfg.gold || DEFAULT_TIERS.gold;
  const vip = nivelesCfg.vip || DEFAULT_TIERS.vip;

  if (!clientData) {
    const pct = Number(member.cashbackPct ?? 3);
    const tName = member.nombre || 'Alfa Member';
    const unitVal = pct / 100;
    return {
      tierId: 'member',
      tierName: tName,
      cashbackPct: pct,
      coinUnitValueMxn: unitVal,
      alfaCoinsBalance: 0,
      alfaCoinsCashEquivalentMxn: 0,
      stampsAccumulated: 0,
      stampsRequired,
      stampsRemainingForFreeCut: stampsRequired,
      rewardName,
      hasAppLinked: false,
      resumenTexto: `Nivel ${tName} (${pct}% bonificación, 1 ALFA COIN = $${unitVal.toFixed(2)} MXN) | Sellos: 0/${stampsRequired} | Saldo: 0 ALFA COINS ($0.00 MXN)`,
    };
  }

  const criterio = nivelesCfg.criterio || 'ambos_opcional';
  const v = Number(clientData.cortes_acumulados ?? clientData.cortesAcumulados ?? 0);
  const g = Number(clientData.consumo_total ?? clientData.gasto_total ?? 0);

  let isVip = clientData.nivel === 'Alfa Black VIP' || clientData.nivel === 'vip';
  let isGold = clientData.nivel === 'Alfa Gold' || clientData.nivel === 'gold';

  if (!isVip && !isGold) {
    if (criterio === 'visitas') {
      isVip = v >= (vip.visitasMin ?? 8);
      isGold = v >= (gold.visitasMin ?? 4);
    } else if (criterio === 'gasto') {
      isVip = g >= (vip.gastoMin ?? 3500);
      isGold = g >= (gold.gastoMin ?? 1500);
    } else {
      isVip = v >= (vip.visitasMin ?? 8) || g >= (vip.gastoMin ?? 3500);
      isGold = v >= (gold.visitasMin ?? 4) || g >= (gold.gastoMin ?? 1500);
    }
  }

  let tierId: 'member' | 'gold' | 'vip' = 'member';
  let tierName = member.nombre || 'Alfa Member';
  let cashbackPct = Number(member.cashbackPct ?? 3);

  if (isVip) {
    tierId = 'vip';
    tierName = vip.nombre || 'Alfa Black VIP';
    cashbackPct = Number(vip.cashbackPct ?? 7);
  } else if (isGold) {
    tierId = 'gold';
    tierName = gold.nombre || 'Alfa Gold';
    cashbackPct = Number(gold.cashbackPct ?? 5);
  }

  const coinUnitValueMxn = cashbackPct / 100;
  const hasAppLinked = Boolean(clientData.appVinculada === true || clientData.fecha_registro_app);
  const rawCoins = Number(
    clientData.alfaCoins ?? clientData.alfa_coins ?? clientData.puntos ?? clientData.puntosLealtad ?? 0
  );
  const alfaCoinsBalance = Math.max(0, rawCoins);
  const alfaCoinsCashEquivalentMxn = Math.round(alfaCoinsBalance * coinUnitValueMxn * 100) / 100;

  const stampsInCurrentCycle = v >= 0 ? v % stampsRequired : 0;
  const stampsRemainingForFreeCut = Math.max(0, stampsRequired - stampsInCurrentCycle);

  const resumenTexto = `Nivel ${tierName} (${cashbackPct}% bonificación, 1 ALFA COIN = $${coinUnitValueMxn.toFixed(2)} MXN) | Sellos Pase Alfa: ${stampsInCurrentCycle}/${stampsRequired} (faltan ${stampsRemainingForFreeCut} para ${rewardName}) | Saldo ALFA COINS: ${alfaCoinsBalance.toLocaleString('es-MX')} monedas (equivalentes a $${alfaCoinsCashEquivalentMxn.toFixed(2)} MXN de descuento en barbería)`;

  return {
    tierId,
    tierName,
    cashbackPct,
    coinUnitValueMxn,
    alfaCoinsBalance,
    alfaCoinsCashEquivalentMxn,
    stampsAccumulated: v,
    stampsRequired,
    stampsRemainingForFreeCut,
    rewardName,
    hasAppLinked,
    resumenTexto,
  };
}

/**
 * Herramienta oficial para que Janet consulte todo sobre el Pase Alfa Club, ALFA COINS,
 * niveles de lealtad, sellos acumulados del cliente y promociones vigentes con sus términos y condiciones.
 */
export const consultarPaseAlfaYPromocionesTool = ai.defineTool(
  {
    name: 'consultar_pase_alfa_y_promociones',
    description:
      'Consulta toda la información oficial sobre el programa de lealtad Pase Alfa Club, cuánto vale un ALFA COIN en pesos según cada nivel (Alfa Member, Alfa Gold, Alfa Black VIP), cómo se ganan y canjean los ALFA COINS, cómo funcionan los sellos para el 10º corte gratis, el beneficio de cumpleaños, los privilegios VIP, las promociones vigentes y sus términos y condiciones exactos, así como el saldo de puntos y sellos del cliente actual.',
    inputSchema: z.object({
      consultaEspecifica: z
        .string()
        .optional()
        .describe('Término opcional si el cliente pregunta por una promoción específica, código, cumpleaños, sellos o AlfaCoins.'),
      telefonoCliente: z
        .string()
        .optional()
        .describe('Teléfono opcional del cliente para consultar sus sellos, nivel y saldo de ALFA COINS.'),
    }),
    outputSchema: z.object({
      paseAlfaClub: z.object({
        titulo: z.string(),
        descripcion: z.string(),
        sellosRequeridos: z.number(),
        recompensaSellos: z.string(),
        terminosSellos: z.string(),
      }),
      alfaCoinsExplicacion: z.object({
        comoSeGanan: z.string(),
        cuantoValeUnAlfaCoin: z.string(),
        nivelesClub: z.array(
          z.object({
            nivel: z.string(),
            requisito: z.string(),
            cashbackPorcentaje: z.number(),
            valorPorCadaAlfaCoinMxn: z.number(),
            ejemplo100CoinsMxn: z.number(),
            ejemplo1000CoinsMxn: z.number(),
          })
        ),
        comoSeCanjean: z.string(),
        terminosAlfaCoins: z.string(),
      }),
      beneficioCumpleanos: z.object({
        titulo: z.string(),
        descripcion: z.string(),
        recompensa: z.string(),
        terminos: z.string(),
      }),
      promocionesYPrivilegiosActivos: z.array(
        z.object({
          titulo: z.string(),
          tipo: z.string(),
          descuentoORecompensa: z.string(),
          descripcion: z.string(),
          vigencia: z.string(),
          codigo: z.string().optional(),
          terminosYCondiciones: z.string(),
        })
      ),
      estadoClienteActual: z
        .object({
          identificado: z.boolean(),
          nombre: z.string().optional(),
          nivelActual: z.string().optional(),
          valorDeSuAlfaCoinMxn: z.number().optional(),
          saldoAlfaCoins: z.number().optional(),
          equivalenteEnPesosMxn: z.number().optional(),
          sellosAcumulados: z.number().optional(),
          sellosParaCorteGratis: z.number().optional(),
          appVinculada: z.boolean().optional(),
        })
        .optional(),
      resumenParaResponder: z.string(),
    }),
  },
  async ({ consultaEspecifica, telefonoCliente }) => {
    const db = getDb();
    const ctx = chatContextStorage.getStore();

    const [paseSnap, appMovilSnap, promosSnap] = await Promise.all([
      db.collection('configuracion').doc('pase_alfa').get().catch(() => null),
      db.collection('configuracion').doc('app_movil').get().catch(() => null),
      db.collection('promociones').get().catch(() => null),
    ]);

    const paseData = paseSnap?.exists ? paseSnap.data() : null;
    const appData = appMovilSnap?.exists ? appMovilSnap.data() : null;
    const rawPase = paseData || appData?.pase_alfa || appData || {};

    const nivelesCfg =
      appData?.niveles_config ||
      rawPase?.niveles_config ||
      paseData?.niveles_config || {
        activo: true,
        criterio: 'ambos_opcional',
        ...DEFAULT_TIERS,
      };

    const memberCfg = nivelesCfg.member || DEFAULT_TIERS.member;
    const goldCfg = nivelesCfg.gold || DEFAULT_TIERS.gold;
    const vipCfg = nivelesCfg.vip || DEFAULT_TIERS.vip;

    const sellosReq = Number(rawPase?.sellosRequeridos) > 0 ? Number(rawPase.sellosRequeridos) : 10;
    const recompensaSellos = rawPase?.recompensa || 'Corte de Cabello 100% Gratis';
    const tituloPase = rawPase?.titulo || `La ${sellosReq}ª Visita va por la Casa`;
    const descPase =
      rawPase?.subtitulo ||
      rawPase?.instrucciones ||
      `Acumula ${sellosReq - 1} visitas en cualquiera de nuestros servicios pagados y tu visita número ${sellosReq} (corte de cabello) es 100% de cortesía.`;
    const terminosSellos =
      rawPase?.terminos ||
      'Aplica en sucursales oficiales de VATOS ALFA para clientes registrados en la App Móvil. Personal e intransferible; no acumulable con otras promociones de corte gratuito en la misma cita.';

    const nivelesClub = [
      {
        nivel: memberCfg.nombre || 'Alfa Member',
        requisito: 'Nivel inicial al registrarte en VATOS ALFA (desde tu primera visita).',
        cashbackPorcentaje: Number(memberCfg.cashbackPct ?? 3),
        valorPorCadaAlfaCoinMxn: Number(memberCfg.cashbackPct ?? 3) / 100,
        ejemplo100CoinsMxn: Number(memberCfg.cashbackPct ?? 3),
        ejemplo1000CoinsMxn: Number(memberCfg.cashbackPct ?? 3) * 10,
      },
      {
        nivel: goldCfg.nombre || 'Alfa Gold',
        requisito: `A partir de ${goldCfg.visitasMin ?? 4} visitas acumuladas o $${Number(goldCfg.gastoMin ?? 1500).toFixed(2)} MXN en consumo acumulado.`,
        cashbackPorcentaje: Number(goldCfg.cashbackPct ?? 5),
        valorPorCadaAlfaCoinMxn: Number(goldCfg.cashbackPct ?? 5) / 100,
        ejemplo100CoinsMxn: Number(goldCfg.cashbackPct ?? 5),
        ejemplo1000CoinsMxn: Number(goldCfg.cashbackPct ?? 5) * 10,
      },
      {
        nivel: vipCfg.nombre || 'Alfa Black VIP',
        requisito: `A partir de ${vipCfg.visitasMin ?? 8} visitas acumuladas o $${Number(vipCfg.gastoMin ?? 3500).toFixed(2)} MXN en consumo acumulado.`,
        cashbackPorcentaje: Number(vipCfg.cashbackPct ?? 7),
        valorPorCadaAlfaCoinMxn: Number(vipCfg.cashbackPct ?? 7) / 100,
        ejemplo100CoinsMxn: Number(vipCfg.cashbackPct ?? 7),
        ejemplo1000CoinsMxn: Number(vipCfg.cashbackPct ?? 7) * 10,
      },
    ];

    // Recopilar privilegios VIP y promociones activas
    const promocionesYPrivilegiosActivos: Array<{
      titulo: string;
      tipo: string;
      descuentoORecompensa: string;
      descripcion: string;
      vigencia: string;
      codigo?: string;
      terminosYCondiciones: string;
    }> = [];

    const rawPrivilegios = Array.isArray(rawPase?.beneficios_detallados)
      ? rawPase.beneficios_detallados
      : Array.isArray(rawPase?.privilegios)
      ? rawPase.privilegios
      : [];

    rawPrivilegios
      .filter((p: any) => p && p.activo !== false)
      .forEach((p: any) => {
        promocionesYPrivilegiosActivos.push({
          titulo: p.titulo || 'Privilegio VIP Pase Alfa',
          tipo: 'Privilegio VIP Pase Alfa Club',
          descuentoORecompensa: p.recompensa || (p.discount ? `${p.discount}% OFF` : 'Beneficio Exclusivo Club Alfa'),
          descripcion: p.descripcion || 'Privilegio exclusivo para miembros del Club Pase Alfa.',
          vigencia: p.fechaLimite ? `Válido hasta el ${p.fechaLimite}` : 'Vigencia Permanente • Pase Alfa Club',
          terminosYCondiciones:
            p.terminos || 'Exclusivo para clientes registrados en la App Móvil de VATOS ALFA. Presentar código QR desde la app en recepción.',
        });
      });

    if (Array.isArray(appData?.promociones)) {
      appData.promociones
        .filter((p: any) => p && p.activo !== false && p.active !== false)
        .forEach((p: any) => {
          promocionesYPrivilegiosActivos.push({
            titulo: p.titulo || p.name || 'Promoción App VATOS ALFA',
            tipo: 'Promoción Exclusiva App',
            descuentoORecompensa: p.recompensa || (p.discount ? `-${p.discount}% OFF` : 'Promoción Especial'),
            descripcion: p.descripcion || p.description || '',
            vigencia: p.fechaLimite || p.endDate ? `Válido hasta ${p.fechaLimite || p.endDate}` : 'Por tiempo limitado',
            codigo: p.codigo || p.code || undefined,
            terminosYCondiciones:
              p.terminos || p.termsAndConditions || 'Válido en sucursales participantes de VATOS ALFA presentando tu cuenta de la App.',
          });
        });
    }

    if (promosSnap && !promosSnap.empty) {
      promosSnap.docs.forEach((doc) => {
        const p = doc.data();
        if (p.active === false || p.activo === false) return;
        const title = p.name || p.titulo || 'Promoción VATOS ALFA';
        if (promocionesYPrivilegiosActivos.some((x) => cleanSearchStr(x.titulo) === cleanSearchStr(title))) return;
        promocionesYPrivilegiosActivos.push({
          titulo: title,
          tipo: 'Promoción Vigente',
          descuentoORecompensa: p.discount ? `-${p.discount}% OFF` : p.recompensa || 'Beneficio Especial',
          descripcion: p.description || p.descripcion || '',
          vigencia: p.endDate ? `Válido hasta el ${p.endDate}` : 'Vigencia activa',
          codigo: p.code || p.codigo || undefined,
          terminosYCondiciones:
            p.termsAndConditions || p.terminos || 'Válido en sucursales oficiales de VATOS ALFA. No acumulable con otras promociones.',
        });
      });
    }

    // Buscar datos del cliente actual si está disponible
    let clientDocData: any = null;
    const targetPhone = (telefonoCliente || ctx?.clientPhone || '').replace(/\D/g, '').slice(-10);
    if (ctx?.clientId) {
      const cSnap = await db.collection('clientes').doc(ctx.clientId).get().catch(() => null);
      if (cSnap?.exists) clientDocData = cSnap.data();
    }
    if (!clientDocData && targetPhone.length === 10) {
      for (const variant of [targetPhone, `52${targetPhone}`, `521${targetPhone}`]) {
        const q = await db.collection('clientes').where('telefono', '==', variant).limit(1).get().catch(() => null);
        if (q && !q.empty) {
          clientDocData = q.docs[0].data();
          break;
        }
      }
    }

    const clientLoyalty = computeClientLoyaltySummary(clientDocData, paseData, appData);

    const estadoClienteActual = clientDocData
      ? {
          identificado: true,
          nombre: `${clientDocData.nombre || ''} ${clientDocData.apellido || ''}`.trim() || 'Cliente',
          nivelActual: clientLoyalty.tierName,
          valorDeSuAlfaCoinMxn: clientLoyalty.coinUnitValueMxn,
          saldoAlfaCoins: clientLoyalty.alfaCoinsBalance,
          equivalenteEnPesosMxn: clientLoyalty.alfaCoinsCashEquivalentMxn,
          sellosAcumulados: clientLoyalty.stampsAccumulated,
          sellosParaCorteGratis: clientLoyalty.stampsRemainingForFreeCut,
          appVinculada: clientLoyalty.hasAppLinked,
        }
      : {
          identificado: false,
        };

    const resumenParaResponder =
      `GUÍA OFICIAL DEL PASE ALFA CLUB Y ALFA COINS:\n` +
      `1. ¿Cómo se ganan los ALFA COINS?: Por cada $1.00 MXN que el cliente paga en servicios o productos en sucursal (teniendo su cuenta de la App vinculada), gana automáticamente 1 ALFA COIN.\n` +
      `2. ¿Cuánto vale 1 ALFA COIN en pesos?: Depende del nivel del cliente en el Club:\n` +
      `   - ${nivelesClub[0].nivel}: ${nivelesClub[0].cashbackPorcentaje}% de cashback -> 1 ALFA COIN = $${nivelesClub[0].valorPorCadaAlfaCoinMxn.toFixed(2)} MXN (100 AlfaCoins = $${nivelesClub[0].ejemplo100CoinsMxn.toFixed(2)} MXN).\n` +
      `   - ${nivelesClub[1].nivel} (${nivelesClub[1].requisito}): ${nivelesClub[1].cashbackPorcentaje}% de cashback -> 1 ALFA COIN = $${nivelesClub[1].valorPorCadaAlfaCoinMxn.toFixed(2)} MXN (100 AlfaCoins = $${nivelesClub[1].ejemplo100CoinsMxn.toFixed(2)} MXN).\n` +
      `   - ${nivelesClub[2].nivel} (${nivelesClub[2].requisito}): ${nivelesClub[2].cashbackPorcentaje}% de cashback -> 1 ALFA COIN = $${nivelesClub[2].valorPorCadaAlfaCoinMxn.toFixed(2)} MXN (100 AlfaCoins = $${nivelesClub[2].ejemplo100CoinsMxn.toFixed(2)} MXN).\n` +
      `3. ¿Cómo se canjean los ALFA COINS?: Se pueden usar directamente al pagar en recepción como dinero electrónico para descontar o liquidar servicios y productos (ceras, polvos de textura, aftershave, bálsamos, cortes, etc.).\n` +
      `4. Tarjeta de Sellos Pase Alfa (${tituloPase}): Cada visita pagada suma 1 sello. Al acumular ${sellosReq - 1} visitas pagadas, la visita #${sellosReq} otorga: ${recompensaSellos}. Términos: ${terminosSellos}\n` +
      `5. Beneficio de Cumpleaños: Corte de cabello de cortesía durante el mes de cumpleaños presentando identificación oficial (INE o pasaporte) en recepción para validar la fecha de nacimiento.\n` +
      (estadoClienteActual.identificado
        ? `6. Estado del cliente en este chat (${estadoClienteActual.nombre}): Nivel ${estadoClienteActual.nivelActual} (cada AlfaCoin suyo vale $${estadoClienteActual.valorDeSuAlfaCoinMxn?.toFixed(2)} MXN), tiene ${estadoClienteActual.saldoAlfaCoins} ALFA COINS acumulados (equivalentes a $${estadoClienteActual.equivalenteEnPesosMxn?.toFixed(2)} MXN) y ${estadoClienteActual.sellosAcumulados} visitas/sellos registrados (le faltan ${estadoClienteActual.sellosParaCorteGratis} para su corte gratis).`
        : '');

    return {
      paseAlfaClub: {
        titulo: tituloPase,
        descripcion: descPase,
        sellosRequeridos: sellosReq,
        recompensaSellos,
        terminosSellos,
      },
      alfaCoinsExplicacion: {
        comoSeGanan:
          'Ganas 1 ALFA COIN por cada $1.00 MXN pagado en tus servicios y productos en sucursal al tener tu cuenta vinculada en la App de VATOS ALFA.',
        cuantoValeUnAlfaCoin:
          `El valor de cada ALFA COIN crece según tu nivel en el Club: en ${nivelesClub[0].nivel} vale $${nivelesClub[0].valorPorCadaAlfaCoinMxn.toFixed(2)} MXN (${nivelesClub[0].cashbackPorcentaje}%), en ${nivelesClub[1].nivel} vale $${nivelesClub[1].valorPorCadaAlfaCoinMxn.toFixed(2)} MXN (${nivelesClub[1].cashbackPorcentaje}%), y en ${nivelesClub[2].nivel} vale $${nivelesClub[2].valorPorCadaAlfaCoinMxn.toFixed(2)} MXN (${nivelesClub[2].cashbackPorcentaje}%).`,
        nivelesClub,
        comoSeCanjean:
          'Puedes canjear tus ALFA COINS directamente en recepción al momento de pagar para descontar o cubrir el total de tus servicios o productos de barbería.',
        terminosAlfaCoins:
          'Los ALFA COINS se acreditan automáticamente al finalizar cada venta pagada a clientes con la App Móvil vinculada. Son personales, intransferibles y no canjeables por dinero en efectivo.',
      },
      beneficioCumpleanos: {
        titulo: 'Corte Gratis en el Mes de tu Cumpleaños',
        descripcion:
          'Durante el mes de tu cumpleaños disfruta de tu corte de cabello de cortesía como miembro del Club VATOS ALFA.',
        recompensa: 'Corte de Cabello de Cumpleaños sin costo',
        terminos:
          'Presentar identificación oficial vigente (INE o pasaporte) en recepción el día de tu cita para validar tu fecha de nacimiento. Válido una vez al año durante el mes de cumpleaños para clientes registrados.',
      },
      promocionesYPrivilegiosActivos,
      estadoClienteActual,
      resumenParaResponder,
    };
  }
);
