import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { getDb } from '@/lib/firebase-server';

let cachedMpToken: { token: string; expiresAt: number } | null = null;

async function getMercadoPagoToken(db: FirebaseFirestore.Firestore): Promise<string> {
  if (cachedMpToken && Date.now() < cachedMpToken.expiresAt) {
    return cachedMpToken.token;
  }
  let accessToken = '';
  try {
    const configDoc = await db.collection('configuracion').doc('mercadopago').get();
    if (configDoc.exists) {
      const fsToken = configDoc.data()?.accessToken;
      if (fsToken && typeof fsToken === 'string' && fsToken.trim().length > 10) {
        accessToken = fsToken.trim();
      }
    }
  } catch (_) {}

  if (!accessToken) {
    accessToken =
      process.env.MP_WEB_ACCESS_TOKEN ||
      process.env.MERCADO_PAGO_ACCESS_TOKEN ||
      process.env.MP_ACCESS_TOKEN ||
      '';
  }

  if (accessToken && accessToken.length >= 10) {
    cachedMpToken = { token: accessToken, expiresAt: Date.now() + 5 * 60 * 1000 };
  }
  return accessToken;
}

function renderStatusHtml(title: string, message: string, ctaText: string, ctaUrl: string) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} • VATOS ALFA Barber Shop</title>
  <meta property="og:title" content="${title} • VATOS ALFA Barber Shop" />
  <meta property="og:description" content="${message}" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at top, #111D38 0%, #0A1224 55%, #070D1B 100%);
      color: #FFFFFF;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 24px;
    }
    .card {
      max-width: 420px;
      width: 100%;
      background: rgba(15, 23, 42, 0.9);
      border: 1.5px solid rgba(56, 189, 248, 0.45);
      border-radius: 22px;
      padding: 32px 24px;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.65), 0 0 25px rgba(37, 99, 235, 0.25);
    }
    .badge {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 999px;
      background: rgba(37, 99, 235, 0.22);
      border: 1px solid rgba(56, 189, 248, 0.5);
      color: #38BDF8;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 21px;
      font-weight: 900;
      margin-bottom: 12px;
      line-height: 1.3;
    }
    p {
      font-size: 14px;
      color: #CBD5E1;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    a.btn {
      display: inline-block;
      width: 100%;
      padding: 14px 20px;
      border-radius: 14px;
      background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
      border: 1px solid rgba(96, 165, 250, 0.55);
      color: #FFFFFF;
      font-weight: 800;
      font-size: 14px;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">VATOS ALFA BARBER SHOP</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a class="btn" href="${ctaUrl}">${ctaText}</a>
  </div>
</body>
</html>`;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await Promise.resolve(context.params);
    const reservationId = String(resolvedParams.id || '').trim();
    const mode = req.nextUrl.searchParams.get('m') === 'full' ? 'full' : 'deposit';
    const wantsJson = req.nextUrl.searchParams.get('format') === 'json';

    if (!reservationId) {
      return new NextResponse(
        renderStatusHtml(
          'Enlace no válido',
          'No se encontró la referencia de la cita solicitada.',
          'Ir a VATOS ALFA',
          'https://vatosalfa.com'
        ),
        { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    // Si es el bot de vista previa de WhatsApp / redes sociales, devolver metadatos limpios sin crear preferencia nueva
    const ua = (req.headers.get('user-agent') || '').toLowerCase();
    if (
      ua.includes('whatsapp') ||
      ua.includes('facebookexternalhit') ||
      ua.includes('telegrambot') ||
      ua.includes('twitterbot')
    ) {
      return new NextResponse(
        renderStatusHtml(
          'Pago Seguro de Anticipo',
          'Confirma tu cita en VATOS ALFA Barber Shop con SPEI o tarjeta.',
          'Continuar al pago',
          `https://vatosalfa.com/p/${reservationId}`
        ),
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    const db = getDb();
    const resDoc = await db.collection('reservas').doc(reservationId).get();

    if (!resDoc.exists) {
      return new NextResponse(
        renderStatusHtml(
          'Cita no disponible',
          'Esta cita ya no se encuentra activa en el sistema o el tiempo de tolerancia para el anticipo venció.',
          'Agendar nueva cita',
          'https://vatosalfa.com/reservar'
        ),
        { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    const resData = resDoc.data() || {};
    const estado = String(resData.estado || '').trim();
    const pagoEstado = String(resData.pago_estado || '').trim();

    if (estado === 'Cancelado' || estado === 'Cancelada' || estado === 'No_asiste') {
      return new NextResponse(
        renderStatusHtml(
          'Enlace Caducado',
          'El tiempo de tolerancia de 30 minutos para realizar el anticipo venció y el horario fue liberado automáticamente.',
          'Agendar nuevo horario',
          'https://vatosalfa.com/reservar'
        ),
        { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    if (
      mode === 'deposit' &&
      (pagoEstado === 'Pagado' || pagoEstado === 'deposit_paid' || pagoEstado === 'anticipo_pagado')
    ) {
      return new NextResponse(
        renderStatusHtml(
          '¡Anticipo ya confirmado!',
          'El anticipo de tu cita ya fue registrado exitosamente. ¡Te esperamos en VATOS ALFA!',
          'Ver detalles',
          `https://vatosalfa.com/reserva/confirmada?reservation_id=${reservationId}`
        ),
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    // Si ya existe un link generado hace menos de 25 minutos, reutilizarlo de inmediato
    const existingLink =
      mode === 'full'
        ? resData.mercado_pago_link_total
        : resData.mercado_pago_link || resData.link_pago_anticipo;
    const linkCreatedAtMs = Number(
      mode === 'full' ? resData.mercado_pago_link_total_ts : resData.mercado_pago_link_ts
    ) || 0;

    if (existingLink && linkCreatedAtMs > 0 && Date.now() - linkCreatedAtMs < 25 * 60 * 1000) {
      if (wantsJson) {
        return NextResponse.json({
          id: mode === 'full' ? resData.mercado_pago_preference_id_total || reservationId : resData.mercado_pago_preference_id || reservationId,
          initPoint: existingLink,
        });
      }
      return NextResponse.redirect(existingLink, 302);
    }

    // Generar una preferencia fresca de Mercado Pago al vuelo
    const accessToken = await getMercadoPagoToken(db);
    if (!accessToken) {
      if (existingLink) {
        return NextResponse.redirect(existingLink, 302);
      }
      return new NextResponse(
        renderStatusHtml(
          'Error temporal de conexión',
          'No se pudo conectar con la pasarela de pago en este momento. Intenta de nuevo en unos segundos.',
          'Reintentar',
          `https://vatosalfa.com/p/${reservationId}`
        ),
        { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    const itemsSum = Array.isArray(resData.items)
      ? resData.items.reduce(
          (acc: number, it: any) =>
            acc + Number(it.precio || it.price || 0) * Number(it.cantidad || 1),
          0
        )
      : 0;
    const totalAmount = Number(resData.total || resData.precio || itemsSum || 0);
    const depositAmount =
      Number(resData.anticipo_esperado || resData.monto_anticipo || 0) ||
      Math.round(totalAmount * 0.5) ||
      100;
    const targetAmount = mode === 'full' && totalAmount > 0 ? totalAmount : depositAmount;

    const servicesText =
      Array.isArray(resData.items) && resData.items.length > 0
        ? resData.items.map((i: any) => i.nombre || i.servicio).join(', ')
        : resData.servicio || 'Servicio de Barbería';

    const clientName = resData.customer?.nombre || resData.cliente_nombre || 'Cliente';
    const clientLastName = resData.customer?.apellido || '';
    const clientEmail = resData.customer?.correo || resData.cliente_email || '';
    const clientPhone = String(resData.customer?.telefono || resData.cliente_telefono || '').replace(
      /\D/g,
      ''
    );

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);
    const returnUrl = 'https://vatosalfa.com';

    const prefResult = await preference.create({
      body: {
        items: [
          {
            id: mode === 'full' ? 'full_payment' : 'deposit',
            title: `${mode === 'full' ? 'Pago Total Cita' : 'Anticipo Cita'} - ${servicesText}`,
            quantity: 1,
            unit_price: Number(targetAmount),
            category_id: 'services',
            description: servicesText,
          },
        ],
        payer: {
          ...(clientEmail && clientEmail.includes('@') ? { email: clientEmail } : {}),
          ...(clientName && clientName.length > 2 ? { name: clientName } : {}),
          ...(clientLastName && clientLastName.length > 2 ? { surname: clientLastName } : {}),
          ...(clientPhone.length === 10
            ? { phone: { area_code: '52', number: clientPhone } }
            : {}),
        },
        external_reference: reservationId,
        statement_descriptor: 'VATOS ALFA',
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        payment_methods: {
          installments: 1,
          excluded_payment_types: [{ id: 'ticket' }],
        },
        back_urls: {
          success: `${returnUrl}/reserva/confirmada`,
          failure: `${returnUrl}/reserva/fallida`,
          pending: `${returnUrl}/reserva/pendiente`,
        },
        auto_return: 'approved',
        metadata: {
          reservation_id: reservationId,
        },
        notification_url: 'https://vatosalfa.com/api/mercado-pago-webhook',
      },
    });

    if (prefResult.init_point) {
      await db
        .collection('reservas')
        .doc(reservationId)
        .update({
          ...(mode === 'full'
            ? {
                mercado_pago_link_total: prefResult.init_point,
                mercado_pago_preference_id_total: prefResult.id,
                mercado_pago_link_total_ts: Date.now(),
              }
            : {
                mercado_pago_link: prefResult.init_point,
                mercado_pago_preference_id: prefResult.id,
                mercado_pago_link_ts: Date.now(),
              }),
          anticipo_esperado: depositAmount,
          requiere_anticipo: true,
        })
        .catch(() => {});

      if (wantsJson) {
        return NextResponse.json({
          id: prefResult.id || reservationId,
          initPoint: prefResult.init_point,
          sandboxInitPoint: prefResult.sandbox_init_point,
        });
      }

      return NextResponse.redirect(prefResult.init_point, 302);
    }

    return new NextResponse(
      renderStatusHtml(
        'Error al abrir pasarela',
        'No fue posible inicializar el enlace de pago. Por favor intenta nuevamente.',
        'Reintentar',
        `https://vatosalfa.com/p/${reservationId}`
      ),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  } catch (err: any) {
    console.error('[ShortPayRedirect] Error:', err);
    return new NextResponse(
      renderStatusHtml(
        'Error inesperado',
        'Ocurrió un inconveniente al abrir el enlace de pago.',
        'Ir a VATOS ALFA',
        'https://vatosalfa.com'
      ),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}
