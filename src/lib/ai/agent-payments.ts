import { getDb } from '@/lib/firebase-server';
import { MercadoPagoConfig, Preference } from 'mercadopago';

export interface AnticipoCalculation {
  requiereAnticipo: boolean;
  montoTotal: number;
  montoAnticipo: number;
  porcentajeAnticipo: number;
  saldoPendiente: number;
  motivo: string;
}

export async function calcularAnticipoParaServicios(
  services: Array<any>,
  extraProductsAmount: number = 0
): Promise<AnticipoCalculation> {
  const db = getDb();
  let total = Number(extraProductsAmount || 0);
  let upfrontFromServices = 0;

  for (const s of services) {
    const price = Number(s.price || s.precio || 0);
    total += price;

    const pType = s.payment_type || (s.requiere_anticipo ? 'online-deposit' : 'no-payment');
    if (pType === 'online-deposit') {
      const amountType = s.payment_amount_type || s.tipo_anticipo || '%';
      const amountValue = Number(s.payment_amount_value || s.monto_anticipo || 50);

      if (amountType === '$' && amountValue > 0) {
        upfrontFromServices += amountValue;
      } else if (amountType === '%' && amountValue > 0) {
        upfrontFromServices += price * (amountValue / 100);
      } else {
        upfrontFromServices += price * 0.5;
      }
    } else if (pType === 'full-payment') {
      upfrontFromServices += price;
    }
  }

  // Regla Global: Consultar configuracion/servicios en Firestore
  let globalMinThreshold = 190;
  let globalDefaultPercent = 50;
  let globalActive = true;

  try {
    const cfgDoc = await db.collection('configuracion').doc('servicios').get();
    if (cfgDoc.exists) {
      const cfg = cfgDoc.data()!;
      if (typeof cfg.anticipo_monto_minimo_activo === 'boolean') {
        globalActive = cfg.anticipo_monto_minimo_activo;
      }
      if (Number(cfg.anticipo_monto_minimo) > 0) {
        globalMinThreshold = Number(cfg.anticipo_monto_minimo);
      }
      if (Number(cfg.anticipo_porcentaje_defecto) > 0) {
        globalDefaultPercent = Number(cfg.anticipo_porcentaje_defecto);
      }
    }
  } catch (err) {
    console.error('Error fetching global servicios config:', err);
  }

  let finalUpfront = upfrontFromServices;
  let motivo = '';

  if (globalActive && total >= globalMinThreshold) {
    const thresholdUpfront = total * (globalDefaultPercent / 100);
    if (finalUpfront < thresholdUpfront) {
      finalUpfront = thresholdUpfront;
      motivo = `Aplica anticipo del ${globalDefaultPercent}% por monto total ($${total} MXN) igual o superior al umbral de $${globalMinThreshold} MXN.`;
    }
  }

  finalUpfront = Math.round(finalUpfront * 100) / 100;
  const requiereAnticipo = finalUpfront > 0;
  const saldoPendiente = Math.max(0, total - finalUpfront);
  const porcentaje = total > 0 ? Math.round((finalUpfront / total) * 100) : 0;

  return {
    requiereAnticipo,
    montoTotal: total,
    montoAnticipo: finalUpfront,
    porcentajeAnticipo: porcentaje,
    saldoPendiente,
    motivo: motivo || (requiereAnticipo ? `Anticipo requerido: $${finalUpfront} MXN (${porcentaje}%)` : 'No requiere anticipo'),
  };
}

export async function crearPreferenciaMercadoPagoChat({
  reservationId,
  title,
  amount,
  clientName,
  clientPhone,
}: {
  reservationId: string;
  title: string;
  amount: number;
  clientName?: string;
  clientPhone?: string;
}): Promise<{ id: string; initPoint: string } | null> {
  try {
    const accessToken =
      process.env.MERCADO_PAGO_ACCESS_TOKEN ||
      process.env.MP_WEB_ACCESS_TOKEN ||
      process.env.MP_ACCESS_TOKEN ||
      '';

    if (!accessToken || accessToken.length < 10) {
      console.error('[MP Chat] Access token is missing or invalid.');
      return null;
    }

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    let baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://vatosalfa.com';
    if (!baseUrl || baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
      baseUrl = 'https://vatosalfa.com';
    }
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    const returnUrl = baseUrl;

    const backUrls = {
      success: `${returnUrl}/`,
      failure: `${returnUrl}/reserva/fallida`,
      pending: `${returnUrl}/`,
    };

    const nameParts = (clientName || 'Cliente').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Cliente';
    const lastName = nameParts.slice(1).join(' ') || 'Alfa';
    const cleanPhone = (clientPhone || '').replace(/\D/g, '').slice(-10);

    const bodyData = {
      items: [
        {
          id: 'deposit',
          title: `Anticipo: ${title}`.substring(0, 250),
          description: `Anticipo para reserva en VATOS ALFA Barber Shop (${title})`.substring(0, 250),
          category_id: 'services',
          quantity: 1,
          currency_id: 'MXN',
          unit_price: Math.round(amount * 100) / 100,
        },
      ],
      payer: {
        name: firstName,
        surname: lastName,
        ...(cleanPhone.length === 10
          ? {
              phone: {
                area_code: '52',
                number: cleanPhone,
              },
            }
          : {}),
      },
      external_reference: reservationId,
      statement_descriptor: 'VATOS ALFA',
      expires: true,
      date_of_expiration: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      payment_methods: {
        installments: 1,
        excluded_payment_types: [{ id: 'ticket' }],
      },
      back_urls: backUrls,
      auto_return: 'approved' as const,
      metadata: {
        reservation_id: reservationId,
        origin: 'chatbot',
      },
      notification_url: 'https://agenda-1ae08.web.app/api/mercado-pago-webhook',
    };

    const result = await preference.create({ body: bodyData });
    const initPoint = result.init_point || result.sandbox_init_point || '';
    return {
      id: result.id || '',
      initPoint,
    };
  } catch (err) {
    console.error('Error creating Mercado Pago preference for chat:', err);
    return null;
  }
}
