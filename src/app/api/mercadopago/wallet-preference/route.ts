import { MercadoPagoConfig, Preference } from 'mercadopago';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/lib/firebase-server';
import { checkRateLimit, getRequestIp } from '@/lib/server-auth';
import {
  getClientWalletBalance,
  hasClientLinkedApp,
  normalizeSaldoPaseAlfaConfig,
  validateTopupAmountRules,
} from '@/lib/wallet-config';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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
  } catch {
    // Fallback to environment variables
  }

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

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const ip = await getRequestIp();
    const rl = checkRateLimit(`mp_wallet_pref:${ip}`, 15, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Demasiadas solicitudes de recarga. Intenta en ${rl.retryAfterSec}s.` },
        { status: 429, headers: CORS_HEADERS }
      );
    }

    const body = await req.json().catch(() => ({}));
    const clientId = String(body?.clientId || '').trim();
    const rawAmount = Number(body?.amount || 0);
    const requestedLocalId = String(body?.localId || '').trim();

    if (!clientId || !/^[a-zA-Z0-9_-]{4,64}$/.test(clientId)) {
      return NextResponse.json(
        { error: 'Identificador de cliente inválido.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const db = getDb();
    const [paseAlfaDoc, clientDoc] = await Promise.all([
      db.collection('configuracion').doc('pase_alfa').get(),
      db.collection('clientes').doc(clientId).get(),
    ]);

    if (!clientDoc.exists) {
      return NextResponse.json(
        { error: 'No encontramos tu perfil de cliente en VATOS ALFA.' },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const clientData = clientDoc.data() || {};
    let hasApp = hasClientLinkedApp(clientData);
    if (!hasApp) {
      const appResSnap = await db
        .collection('reservas')
        .where('cliente_id', '==', clientId)
        .limit(5)
        .get();
      hasApp = appResSnap.docs.some((d) => {
        const orig = String(d.data()?.origen || d.data()?.canal_reserva || '').toLowerCase();
        return orig.includes('app');
      });
    }

    if (!hasApp) {
      return NextResponse.json(
        {
          error:
            'El Saldo Pase Alfa es exclusivo para miembros con cuenta vinculada en la App Móvil VATOS ALFA.',
        },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const paseAlfaData = paseAlfaDoc.exists ? paseAlfaDoc.data() || {} : {};
    const privilegiosArr = Array.isArray(paseAlfaData.privilegios) ? paseAlfaData.privilegios : [];
    const saldoPriv = privilegiosArr.find(
      (p: any) =>
        p?.id === 'saldo_pase_alfa' ||
        String(p?.titulo || '').toLowerCase().includes('saldo pase alfa')
    );
    const cfg = normalizeSaldoPaseAlfaConfig(paseAlfaData.saldo_pase_alfa_config);
    const isPrivPaused = saldoPriv && saldoPriv.activo === false;

    if (!cfg.activo || isPrivPaused || !cfg.metodos_permitidos.mercadopago_app) {
      return NextResponse.json(
        {
          error:
            'La recarga en línea de Saldo Pase Alfa no está habilitada en este momento. Puedes recargar directamente en recepción.',
        },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const currentBalance = getClientWalletBalance(clientData);
    const validation = validateTopupAmountRules(rawAmount, currentBalance, cfg);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const { cleanAmount, bonusCoins, matchedPackage } = validation;

    // Resolver sucursal para atribución limpia en Caja y Finanzas
    let resolvedLocalId =
      requestedLocalId && requestedLocalId !== 'default'
        ? requestedLocalId
        : String(clientData.local_preferido || clientData.local_id || '').trim();

    if (!resolvedLocalId || resolvedLocalId === 'default') {
      try {
        const localesSnap = await db.collection('locales').limit(1).get();
        if (!localesSnap.empty) {
          resolvedLocalId = localesSnap.docs[0].id;
        } else {
          resolvedLocalId = 'default';
        }
      } catch {
        resolvedLocalId = 'default';
      }
    }

    const accessToken = await getMercadoPagoToken(db);
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Configuración de pasarela Mercado Pago no disponible temporalmente.' },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const clientName = String(clientData.nombre || '').trim() || 'Miembro';
    const clientLastName = String(clientData.apellido || '').trim();
    const fullName = [clientName, clientLastName].filter(Boolean).join(' ').trim();
    const clientEmail = String(clientData.correo || clientData.email || clientData.correo_app || '').trim();
    const clientPhone = String(clientData.telefono || '').replace(/\D/g, '').slice(-10);

    const recargaId = `topup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const recargaRef = db.collection('recargas_monedero').doc(recargaId);

    const bonusLabel = bonusCoins > 0 ? ` (+${bonusCoins} Alfa Coins de regalo)` : '';
    const itemTitle = `Recarga Saldo Pase Alfa $${cleanAmount.toFixed(2)} MXN${bonusLabel}`;

    await recargaRef.set({
      id: recargaId,
      cliente_id: clientId,
      cliente_nombre: fullName,
      cliente_telefono: clientPhone,
      cliente_correo: clientEmail,
      monto: cleanAmount,
      bono_alfa_coins: bonusCoins,
      paquete_id: matchedPackage?.id || null,
      local_id: resolvedLocalId,
      metodo_pago: 'mercadopago',
      origen: 'app_movil',
      estado: 'pendiente',
      acreditado: false,
      creado_en: FieldValue.serverTimestamp(),
      created_at_ms: Date.now(),
    });

    const mpClient = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(mpClient);
    const returnUrl = 'https://vatosalfa.com';

    const prefResult = await preference.create({
      body: {
        items: [
          {
            id: matchedPackage?.id || 'recarga_saldo_pase_alfa',
            title: itemTitle,
            quantity: 1,
            unit_price: Number(cleanAmount),
            category_id: 'services',
            description: `Abono prepago a monedero Saldo Pase Alfa en VATOS ALFA Barber Shop${bonusLabel}`,
          },
        ],
        payer: {
          ...(clientEmail && clientEmail.includes('@') ? { email: clientEmail } : {}),
          ...(clientName.length > 1 ? { name: clientName } : {}),
          ...(clientLastName.length > 1 ? { surname: clientLastName } : {}),
          ...(clientPhone.length === 10
            ? { phone: { area_code: '52', number: clientPhone } }
            : {}),
        },
        external_reference: recargaId,
        statement_descriptor: 'VATOS ALFA',
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        payment_methods: {
          installments: 1,
          excluded_payment_types: [{ id: 'ticket' }],
        },
        back_urls: {
          success: `${returnUrl}/p/${recargaId}?status=approved`,
          failure: `${returnUrl}/p/${recargaId}?status=failure`,
          pending: `${returnUrl}/p/${recargaId}?status=pending`,
        },
        auto_return: 'approved',
        metadata: {
          payment_purpose: 'recarga_monedero',
          recarga_id: recargaId,
          client_id: clientId,
          topup_amount: cleanAmount,
          bonus_alfacoins: bonusCoins,
          local_id: resolvedLocalId,
        },
        notification_url: 'https://vatosalfa.com/api/mercado-pago-webhook',
      },
    });

    if (!prefResult.init_point) {
      return NextResponse.json(
        { error: 'No se pudo inicializar el enlace de pago en Mercado Pago.' },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    await recargaRef
      .update({
        mercado_pago_preference_id: prefResult.id || null,
        init_point: prefResult.init_point,
        link_ts: Date.now(),
      })
      .catch(() => {});

    return NextResponse.json(
      {
        id: recargaId,
        recargaId,
        preferenceId: prefResult.id,
        initPoint: prefResult.init_point,
        init_point: prefResult.init_point,
        sandboxInitPoint: prefResult.sandbox_init_point,
        amount: cleanAmount,
        bonusCoins,
      },
      { headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error('[WalletPreference] Error:', err);
    return NextResponse.json(
      { error: 'Error al generar el enlace de recarga en Mercado Pago.' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
