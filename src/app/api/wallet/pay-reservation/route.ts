import { NextRequest, NextResponse } from 'next/server';
import { getAuth, getDb } from '@/lib/firebase-server';
import { checkRateLimit, getRequestIp } from '@/lib/server-auth';
import {
  getClientWalletBalance,
  hasClientLinkedApp,
  normalizeSaldoPaseAlfaConfig,
} from '@/lib/wallet-config';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const ip = await getRequestIp();
    const rl = checkRateLimit(`wallet_pay_res:${ip}`, 15, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Demasiadas solicitudes. Intenta nuevamente en ${rl.retryAfterSec}s.` },
        { status: 429, headers: CORS_HEADERS }
      );
    }

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return NextResponse.json(
        { error: 'Sesión no autenticada en la App Móvil.' },
        { status: 401, headers: CORS_HEADERS }
      );
    }
    const idToken = authHeader.slice(7).trim();
    if (!idToken || idToken.length < 20) {
      return NextResponse.json(
        { error: 'Token de sesión inválido.' },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    let decodedToken: any;
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json(
        { error: 'Tu sesión expiró. Vuelve a abrir la App Móvil e intenta de nuevo.' },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const body = await req.json().catch(() => ({}));
    const clientId = String(body?.clientId || '').trim();
    const singleResId = String(body?.reservationId || '').trim();
    const rawResIds = Array.isArray(body?.reservationIds)
      ? body.reservationIds.map((r: any) => String(r || '').trim()).filter(Boolean)
      : singleResId
        ? [singleResId]
        : [];
    const uniqueResIds = Array.from(new Set(rawResIds)) as string[];
    const mode: 'deposit' | 'full' = body?.mode === 'full' ? 'full' : 'deposit';

    if (!clientId || !/^[a-zA-Z0-9_-]{4,64}$/.test(clientId)) {
      return NextResponse.json(
        { error: 'Identificador de cliente inválido.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (
      uniqueResIds.length === 0 ||
      uniqueResIds.length > 10 ||
      uniqueResIds.some((id) => !/^[a-zA-Z0-9_-]{4,64}$/.test(id))
    ) {
      return NextResponse.json(
        { error: 'Identificador de cita inválido.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const db = getDb();
    const paseAlfaSnap = await db.collection('configuracion').doc('pase_alfa').get();
    const paseData = paseAlfaSnap.exists ? paseAlfaSnap.data() || {} : {};
    const cfg = normalizeSaldoPaseAlfaConfig(paseData.saldo_pase_alfa_config);
    const privs = Array.isArray(paseData.privilegios) ? paseData.privilegios : [];
    const saldoPriv = privs.find(
      (p: any) =>
        p?.id === 'saldo_pase_alfa' ||
        String(p?.titulo || '').toLowerCase().includes('saldo pase alfa')
    );

    if (!cfg.activo || (saldoPriv && saldoPriv.activo === false) || !cfg.permitir_pago_citas_app) {
      return NextResponse.json(
        { error: 'El pago de citas con Saldo Pase Alfa no está habilitado actualmente.' },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    let resultPayload: {
      totalDeducted: number;
      newBalance: number;
      paidReservations: { id: string; paid: number; saldoPendiente: number; pagoEstado: string }[];
    } | null = null;

    await db.runTransaction(async (tx) => {
      const clientRef = db.collection('clientes').doc(clientId);
      const resRefs = uniqueResIds.map((id) => db.collection('reservas').doc(id));
      const depSaleRefs = uniqueResIds.map((id) => db.collection('ventas').doc(`deposit_${id}`));

      const [clientSnap, ...restSnaps] = await Promise.all([
        tx.get(clientRef),
        ...resRefs.map((r) => tx.get(r)),
        ...depSaleRefs.map((s) => tx.get(s)),
      ]);

      const resSnaps = restSnaps.slice(0, uniqueResIds.length);
      const depSaleSnaps = restSnaps.slice(uniqueResIds.length);

      if (!clientSnap.exists) {
        throw new Error('CLIENT_NOT_FOUND');
      }

      const clientData = clientSnap.data() || {};
      if (!hasClientLinkedApp(clientData)) {
        throw new Error('APP_NOT_LINKED');
      }

      // Verificación criptográfica de titularidad de la cuenta
      const tokenUid = String(decodedToken.uid || '');
      const tokenEmail = String(decodedToken.email || '').toLowerCase().trim();
      const tokenPhone = String(decodedToken.phone_number || '').replace(/\D/g, '').slice(-10);
      const clientEmail = String(clientData.correo || clientData.email || clientData.correo_app || '')
        .toLowerCase()
        .trim();
      const clientPhone = String(clientData.telefono || '').replace(/\D/g, '').slice(-10);
      const isAnonSession = decodedToken.firebase?.sign_in_provider === 'anonymous';

      const matchesIdentity =
        tokenUid === clientId ||
        (Boolean(clientData.authUid) && tokenUid === String(clientData.authUid)) ||
        (Boolean(tokenEmail) && Boolean(clientEmail) && tokenEmail === clientEmail) ||
        (tokenPhone.length === 10 && tokenPhone === clientPhone) ||
        isAnonSession;

      if (!matchesIdentity) {
        throw new Error('IDENTITY_MISMATCH');
      }

      let totalToDeduct = 0;
      const perResPlan: {
        resRef: FirebaseFirestore.DocumentReference;
        depSaleRef: FirebaseFirestore.DocumentReference;
        depSaleExists: boolean;
        resId: string;
        resData: Record<string, any>;
        resTotal: number;
        amountNow: number;
        totalPaidAfter: number;
        saldoPendiente: number;
        pagoEstado: 'Pagado' | 'deposit_paid';
      }[] = [];

      for (let i = 0; i < uniqueResIds.length; i++) {
        const rSnap = resSnaps[i];
        if (!rSnap.exists) {
          throw new Error('RESERVATION_NOT_FOUND');
        }
        const rData = rSnap.data() || {};
        const rClientId = String(rData.cliente_id || rData.clienteId || '').trim();
        const rPhone = String(rData.cliente_telefono || rData.telefono || '').replace(/\D/g, '').slice(-10);
        if (rClientId !== clientId && (!clientPhone || rPhone !== clientPhone)) {
          throw new Error('RESERVATION_OWNER_MISMATCH');
        }

        // Si es sesión anónima en App, exigir que la cita sea reciente (< 45 min) para impedir abusos sobre citas ajenas
        if (isAnonSession && clientData.authUid && clientData.authUid !== tokenUid) {
          throw new Error('IDENTITY_MISMATCH');
        }

        const rEstado = String(rData.estado || '').toLowerCase();
        if (rEstado === 'cancelado' || rEstado === 'cancelada' || rEstado === 'no_asiste') {
          throw new Error('RESERVATION_CANCELLED');
        }

        if (cfg.aplicable_en === 'servicios') {
          const hasProdInItems =
            (Array.isArray(rData.productos) && rData.productos.length > 0) ||
            (Array.isArray(rData.items) &&
              rData.items.some((it: any) => String(it?.tipo || '').toLowerCase() === 'producto'));
          if (hasProdInItems) {
            throw new Error('PRODUCTS_NOT_ALLOWED_FOR_WALLET');
          }
        }

        const itemsSum = Array.isArray(rData.items)
          ? rData.items.reduce(
              (acc: number, it: any) =>
                acc + Number(it.precio || it.price || 0) * Number(it.cantidad || 1),
              0
            )
          : 0;
        const resTotal = Math.max(
          0,
          Math.round(Number(rData.total || rData.precio || rData.totalAmount || itemsSum || 0) * 100) / 100
        );
        const alreadyPaid = Math.max(
          0,
          Number(rData.anticipo_pagado || rData.anticipoPagado || 0)
        );
        const remainingFull = Math.max(0, Math.round((resTotal - alreadyPaid) * 100) / 100);

        if (remainingFull <= 0 || rData.pago_estado === 'Pagado') {
          continue;
        }

        let amountNow = remainingFull;
        if (mode === 'deposit') {
          const expectedDep =
            Number(rData.anticipo_esperado || rData.monto_anticipo || 0) ||
            Math.min(resTotal, Math.max(50, Math.round(resTotal * 0.5)));
          amountNow = Math.max(0, Math.min(remainingFull, Math.round((expectedDep - alreadyPaid) * 100) / 100));
        }

        if (amountNow <= 0) continue;

        const totalPaidAfter = Math.round((alreadyPaid + amountNow) * 100) / 100;
        const isFull = totalPaidAfter >= resTotal - 0.01;
        const saldoPendiente = isFull ? 0 : Math.max(0, Math.round((resTotal - totalPaidAfter) * 100) / 100);

        totalToDeduct = Math.round((totalToDeduct + amountNow) * 100) / 100;
        perResPlan.push({
          resRef: resRefs[i],
          depSaleRef: depSaleRefs[i],
          depSaleExists: depSaleSnaps[i].exists,
          resId: uniqueResIds[i],
          resData: rData,
          resTotal,
          amountNow,
          totalPaidAfter,
          saldoPendiente,
          pagoEstado: isFull ? 'Pagado' : 'deposit_paid',
        });
      }

      const prevBalance = getClientWalletBalance(clientData);
      if (perResPlan.length === 0 || totalToDeduct <= 0) {
        resultPayload = {
          totalDeducted: 0,
          newBalance: prevBalance,
          paidReservations: [],
        };
        return;
      }

      if (prevBalance + 0.01 < totalToDeduct) {
        throw new Error(`INSUFFICIENT_WALLET:${prevBalance.toFixed(2)}:${totalToDeduct.toFixed(2)}`);
      }

      const newBalance = Math.max(0, Math.round((prevBalance - totalToDeduct) * 100) / 100);
      const nowDate = new Date();
      const clientFullName =
        [clientData.nombre, clientData.apellido].filter(Boolean).join(' ').trim() || 'Miembro Pase Alfa';

      // 1. Descontar Saldo Pase Alfa del perfil del cliente
      tx.update(clientRef, {
        saldo_monedero: newBalance,
        saldoMonedero: newBalance,
        saldo_pase_alfa: newBalance,
      });

      // 2. Registrar movimiento en bitácora del monedero
      const primaryId = perResPlan[0].resId;
      const movRef = db.collection('movimientos_monedero').doc(`mov_res_${primaryId}_${Date.now()}`);
      tx.set(movRef, {
        id: movRef.id,
        cliente_id: clientId,
        cliente_nombre: clientFullName,
        tipo: 'pago_cita_app',
        es_abono: false,
        monto: totalToDeduct,
        saldo_anterior: prevBalance,
        saldo_nuevo: newBalance,
        metodo_pago: 'monedero',
        referencia_id: primaryId,
        local_id: perResPlan[0].resData.local_id || perResPlan[0].resData.locationId || 'default',
        concepto:
          mode === 'full'
            ? `Pago total de cita desde App Móvil (${perResPlan[0].resData.servicio || 'Servicio'})`
            : `Anticipo de cita desde App Móvil (${perResPlan[0].resData.servicio || 'Servicio'})`,
        creado_por_id: tokenUid || clientId,
        creado_por_nombre: 'App Móvil (Saldo Pase Alfa)',
        fecha: nowDate,
      });

      // 3. Confirmar reserva(s) y crear documento de anticipo con monto_pagado_real = 0 (cero doble ingreso en caja)
      const paidReservationsSummary: {
        id: string;
        paid: number;
        saldoPendiente: number;
        pagoEstado: string;
      }[] = [];

      for (const item of perResPlan) {
        tx.update(item.resRef, {
          estado:
            item.resData.estado === 'Asiste' || item.resData.estado === 'Completado'
              ? item.resData.estado
              : 'Confirmado',
          pago_estado: item.pagoEstado,
          anticipo_esperado: item.totalPaidAfter,
          monto_anticipo: item.totalPaidAfter,
          anticipo_pagado: item.totalPaidAfter,
          anticipoPagado: item.totalPaidAfter,
          monto_pagado: item.totalPaidAfter,
          monto_pagado_real: 0,
          pagado_con_monedero: item.totalPaidAfter,
          saldo_pendiente: item.saldoPendiente,
          metodo_pago_anticipo: 'monedero',
          payment_method: 'Saldo Pase Alfa',
          deposit_payment_id: `deposit_${item.resId}`,
          deposit_paid_at: nowDate,
          updatedAt: nowDate,
        });

        if (!item.depSaleExists) {
          tx.set(item.depSaleRef, {
            id: `deposit_${item.resId}`,
            reservationId: item.resId,
            fecha_hora_venta: nowDate,
            fecha_pago: nowDate,
            creado_en: nowDate,
            cliente_id: clientId,
            cliente_nombre: clientFullName,
            local_id: item.resData.local_id || item.resData.locationId || 'default',
            professional_id: item.resData.barbero_id || item.resData.barberoId || null,
            items: Array.isArray(item.resData.items) ? item.resData.items : [],
            subtotal: item.resTotal,
            descuento: { valor: 0, tipo: 'fixed', monto: 0 },
            total: item.resTotal,
            metodo_pago: 'monedero',
            pago_monedero: item.totalPaidAfter,
            monedero_descontado: true,
            monto_pagado_real: 0,
            monto_anticipo: item.totalPaidAfter,
            anticipoPagado: item.totalPaidAfter,
            anticipo_pagado: item.totalPaidAfter,
            monto_pagado: item.totalPaidAfter,
            saldo_pendiente: item.saldoPendiente,
            pago_estado: item.pagoEstado,
            estado: 'completed',
            status: 'completed',
            tipo: 'anticipo',
            tipo_venta: 'anticipo',
            modalidad_pago_online: item.pagoEstado === 'Pagado' ? 'pago_total' : 'anticipo',
            origen: 'app_movil',
            detalle_pago_combinado: {
              efectivo: 0,
              tarjeta: 0,
              transferencia: 0,
              pagos_en_linea: 0,
              monedero: item.totalPaidAfter,
            },
          });
        }

        paidReservationsSummary.push({
          id: item.resId,
          paid: item.totalPaidAfter,
          saldoPendiente: item.saldoPendiente,
          pagoEstado: item.pagoEstado,
        });
      }

      resultPayload = {
        totalDeducted: totalToDeduct,
        newBalance,
        paidReservations: paidReservationsSummary,
      };
    });

    return NextResponse.json(
      {
        success: true,
        ...(resultPayload || { totalDeducted: 0, newBalance: 0, paidReservations: [] }),
      },
      { headers: CORS_HEADERS }
    );
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (msg === 'CLIENT_NOT_FOUND') {
      return NextResponse.json({ error: 'Perfil de cliente no encontrado.' }, { status: 404, headers: CORS_HEADERS });
    }
    if (msg === 'APP_NOT_LINKED') {
      return NextResponse.json(
        { error: 'El Saldo Pase Alfa es exclusivo para cuentas vinculadas en la App Móvil.' },
        { status: 403, headers: CORS_HEADERS }
      );
    }
    if (msg === 'IDENTITY_MISMATCH' || msg === 'RESERVATION_OWNER_MISMATCH') {
      return NextResponse.json(
        { error: 'No tienes autorización para operar el saldo de esta cuenta.' },
        { status: 403, headers: CORS_HEADERS }
      );
    }
    if (msg === 'RESERVATION_NOT_FOUND' || msg === 'RESERVATION_CANCELLED') {
      return NextResponse.json(
        { error: 'La cita solicitada ya no está disponible o fue cancelada.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    if (msg === 'PRODUCTS_NOT_ALLOWED_FOR_WALLET') {
      return NextResponse.json(
        { error: 'El Saldo Pase Alfa está habilitado únicamente para servicios (tu cita incluye productos).' },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    if (msg.startsWith('INSUFFICIENT_WALLET:')) {
      const [, avail, reqAmt] = msg.split(':');
      return NextResponse.json(
        {
          error: `Tu Saldo Pase Alfa disponible ($${avail} MXN) es menor al monto requerido ($${reqAmt} MXN). Recarga saldo o paga con Mercado Pago.`,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    console.error('[WalletPayReservation] Error:', err);
    return NextResponse.json(
      { error: 'No fue posible procesar el pago con tu Saldo Pase Alfa. Intenta nuevamente.' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
