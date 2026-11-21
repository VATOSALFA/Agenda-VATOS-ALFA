import { NextRequest, NextResponse } from 'next/server';
import { getAuth, getDb } from '@/lib/firebase-server';
import { checkRateLimit, getRequestIp } from '@/lib/server-auth';
import { getClientWalletBalance } from '@/lib/wallet-config';
import { evaluateCancellationPolicy } from '@/lib/booking-rules';

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
    const rl = checkRateLimit(`wallet_refund_res:${ip}`, 15, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Demasiadas solicitudes. Intenta nuevamente en ${rl.retryAfterSec}s.` },
        { status: 429, headers: CORS_HEADERS }
      );
    }

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return NextResponse.json(
        { error: 'Sesión no autenticada.' },
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
        { error: 'Tu sesión expiró.' },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const body = await req.json().catch(() => ({}));
    const reservationId = String(body?.reservationId || '').trim();
    const folio = String(body?.folio || '').trim();

    const db = getDb();
    let targetResId = reservationId && !reservationId.startsWith('res_') ? reservationId : '';

    if (!targetResId && folio) {
      const qSnap = await db.collection('reservas').where('folio', '==', folio).limit(1).get();
      if (!qSnap.empty) {
        targetResId = qSnap.docs[0].id;
      }
    }

    if (!targetResId || !/^[a-zA-Z0-9_-]{4,64}$/.test(targetResId)) {
      return NextResponse.json(
        { success: true, refundedAmount: 0 },
        { headers: CORS_HEADERS }
      );
    }

    const rulesSnap = await db.collection('configuracion').doc('reglas_reservas').get();
    const rulesData = rulesSnap.exists ? rulesSnap.data() || {} : {};

    let resultPayload = { refundedAmount: 0, newBalance: 0, retainedAmount: 0 };

    await db.runTransaction(async (tx) => {
      const resRef = db.collection('reservas').doc(targetResId);
      const depSaleRef = db.collection('ventas').doc(`deposit_${targetResId}`);
      const [resSnap, depSaleSnap] = await Promise.all([tx.get(resRef), tx.get(depSaleRef)]);

      if (!resSnap.exists) return;
      const rData = resSnap.data() || {};

      const walletPaid = Math.max(
        0,
        Math.round(
          Number(
            rData.pagado_con_monedero ||
              (rData.metodo_pago_anticipo === 'monedero'
                ? rData.anticipo_pagado || rData.anticipoPagado || 0
                : 0)
          ) * 100
        ) / 100
      );

      if (walletPaid <= 0 || rData.monedero_reembolsado === true) {
        return;
      }

      const clientId = String(rData.cliente_id || rData.clienteId || '').trim();
      if (!clientId) return;

      const clientRef = db.collection('clientes').doc(clientId);
      const clientSnap = await tx.get(clientRef);
      if (!clientSnap.exists) return;
      const clientData = clientSnap.data() || {};

      // Verificar identidad del titular o staff
      const tokenUid = String(decodedToken.uid || '');
      const tokenEmail = String(decodedToken.email || '').toLowerCase().trim();
      const tokenPhone = String(decodedToken.phone_number || '').replace(/\D/g, '').slice(-10);
      const clientEmail = String(clientData.correo || clientData.email || clientData.correo_app || '')
        .toLowerCase()
        .trim();
      const clientPhone = String(clientData.telefono || '').replace(/\D/g, '').slice(-10);
      const isAnonSession = decodedToken.firebase?.sign_in_provider === 'anonymous';

      const isOwner =
        tokenUid === clientId ||
        (Boolean(clientData.authUid) && tokenUid === String(clientData.authUid)) ||
        (Boolean(tokenEmail) && Boolean(clientEmail) && tokenEmail === clientEmail) ||
        (tokenPhone.length === 10 && tokenPhone === clientPhone) ||
        (isAnonSession && !clientData.authUid);

      if (!isOwner) {
        const staffSnap = await tx.get(db.collection('users').doc(tokenUid));
        if (!staffSnap.exists) {
          throw new Error('UNAUTHORIZED');
        }
      }

      const evalRes = evaluateCancellationPolicy({
        appointmentDate: String(rData.fecha || ''),
        appointmentTime: String(rData.hora_inicio || rData.hora || '10:00'),
        depositPaid: walletPaid,
        rules: rulesData as any,
      });

      const refundAmount = Math.max(0, Math.round(evalRes.balanceToCredit * 100) / 100);
      const prevBalance = getClientWalletBalance(clientData);
      const newBalance = Math.round((prevBalance + refundAmount) * 100) / 100;
      const nowDate = new Date();

      tx.update(resRef, {
        estado: 'Cancelado',
        cancelado_at: nowDate,
        monedero_reembolsado: true,
        monedero_reembolsado_monto: refundAmount,
        ...(refundAmount >= walletPaid - 0.01 ? { pago_estado: 'Cancelado' } : {}),
      });

      if (depSaleSnap.exists && refundAmount >= walletPaid - 0.01) {
        tx.update(depSaleRef, {
          pago_estado: 'Cancelado',
          estado: 'cancelled',
          status: 'cancelled',
          monedero_reembolsado: true,
        });
      }

      if (refundAmount > 0) {
        tx.update(clientRef, {
          saldo_monedero: newBalance,
          saldoMonedero: newBalance,
          saldo_pase_alfa: newBalance,
        });

        const clientFullName =
          [clientData.nombre, clientData.apellido].filter(Boolean).join(' ').trim() ||
          'Miembro Pase Alfa';
        const movRef = db
          .collection('movimientos_monedero')
          .doc(`mov_refund_${targetResId}_${Date.now()}`);
        tx.set(movRef, {
          id: movRef.id,
          cliente_id: clientId,
          cliente_nombre: clientFullName,
          tipo: 'reembolso_cancelacion',
          es_abono: true,
          monto: refundAmount,
          saldo_anterior: prevBalance,
          saldo_nuevo: newBalance,
          metodo_pago: 'monedero',
          referencia_id: targetResId,
          local_id: rData.local_id || rData.locationId || 'default',
          concepto: `Reembolso a Saldo Pase Alfa por cancelación de cita (${rData.servicio || 'Servicio'})`,
          creado_por_id: tokenUid || clientId,
          creado_por_nombre: 'Reembolso Automático App Móvil',
          fecha: nowDate,
        });
      }

      resultPayload = {
        refundedAmount: refundAmount,
        newBalance,
        retainedAmount: evalRes.retainedAmount,
      };
    });

    return NextResponse.json(
      { success: true, ...resultPayload },
      { headers: CORS_HEADERS }
    );
  } catch (err: any) {
    if (String(err?.message || '') === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403, headers: CORS_HEADERS });
    }
    console.error('[WalletRefundReservation] Error:', err);
    return NextResponse.json(
      { error: 'Error al procesar el reembolso de la cita.' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
