// API Route for email quick actions (confirm/cancel appointments)
// GET is strictly read-only (redirects to /cita/accion confirmation page so email security scanners cannot cancel appointments)
// POST performs the actual transactional update.

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDb } from '@/lib/firebase-server';
import { checkRateLimit, getRequestIp } from '@/lib/server-auth';
import { sendBookingCancellation } from '@/lib/services/booking-cancellation-email';

function getAppBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'https://vatosalfa.com';
  return raw.replace(/\/+$/, '');
}

function getTodayMexicoIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = String(searchParams.get('token') || '').trim();
  const action = String(searchParams.get('action') || '').trim(); // 'confirm' | 'cancel'

  const baseUrl = getAppBaseUrl();

  if (!token || !['confirm', 'cancel'].includes(action)) {
    return NextResponse.redirect(`${baseUrl}/cita/accion?status=error&message=Enlace+inválido`);
  }

  const db = getDb();
  if (!db) {
    return NextResponse.redirect(`${baseUrl}/cita/accion?status=error&message=Servicio+no+disponible`);
  }

  try {
    const snapshot = await db
      .collection('reservas')
      .where('actionToken', '==', token)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.redirect(
        `${baseUrl}/cita/accion?status=error&message=Enlace+expirado+o+inválido`
      );
    }

    const reserva = snapshot.docs[0].data() || {};
    const todayIso = getTodayMexicoIso();
    if (reserva.fecha && String(reserva.fecha) < todayIso) {
      return NextResponse.redirect(`${baseUrl}/cita/accion?status=error&message=Esta+cita+ya+pasó`);
    }

    const currentStatus = reserva.status || reserva.estado || 'Reservado';
    const completedStatuses = ['Completado', 'Venta completada', 'No asiste'];
    if (completedStatuses.includes(currentStatus)) {
      return NextResponse.redirect(
        `${baseUrl}/cita/accion?status=error&message=Esta+cita+ya+fue+procesada`
      );
    }

    if (action === 'confirm' && currentStatus === 'Confirmado') {
      return NextResponse.redirect(
        `${baseUrl}/cita/accion?status=already&action=confirm&nombre=${encodeURIComponent(reserva.cliente_nombre || '')}`
      );
    }
    if (action === 'cancel' && currentStatus === 'Cancelado') {
      return NextResponse.redirect(
        `${baseUrl}/cita/accion?status=already&action=cancel&nombre=${encodeURIComponent(reserva.cliente_nombre || '')}`
      );
    }

    // Redirect to interactive confirmation page (never mutate state on GET!)
    const params = new URLSearchParams({
      status: 'pending',
      action,
      token,
      nombre: String(reserva.cliente_nombre || ''),
      fecha: String(reserva.fecha || ''),
      hora: String(reserva.hora_inicio || ''),
    });

    return NextResponse.redirect(`${baseUrl}/cita/accion?${params.toString()}`);
  } catch (error) {
    console.error('[Cita Action GET] Error:', error);
    return NextResponse.redirect(`${baseUrl}/cita/accion?status=error&message=Error+interno`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = await getRequestIp();
    const rl = checkRateLimit(`cita_action:${ip}`, 15, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { status: 'error', message: `Demasiadas solicitudes. Intenta en ${rl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || '').trim();
    const action = String(body?.action || '').trim();

    if (!token || !['confirm', 'cancel'].includes(action)) {
      return NextResponse.json(
        { status: 'error', message: 'Solicitud inválida.' },
        { status: 400 }
      );
    }

    const db = getDb();
    if (!db) {
      return NextResponse.json(
        { status: 'error', message: 'Servicio no disponible.' },
        { status: 503 }
      );
    }

    const snapshot = await db
      .collection('reservas')
      .where('actionToken', '==', token)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json(
        { status: 'error', message: 'Enlace expirado o inválido.' },
        { status: 404 }
      );
    }

    const reservaRef = snapshot.docs[0].ref;
    const reservaId = snapshot.docs[0].id;
    const todayIso = getTodayMexicoIso();

    const txOutcome = await db.runTransaction(async (tx) => {
      const freshDoc = await tx.get(reservaRef);
      if (!freshDoc.exists) {
        return { kind: 'error' as const, message: 'La cita ya no existe.' };
      }
      const reserva = freshDoc.data() || {};
      if (reserva.actionToken !== token) {
        return { kind: 'error' as const, message: 'Este enlace ya fue utilizado o expiró.' };
      }
      if (reserva.fecha && String(reserva.fecha) < todayIso) {
        return { kind: 'error' as const, message: 'Esta cita ya pasó.' };
      }

      const currentStatus = reserva.status || reserva.estado || 'Reservado';
      const completedStatuses = ['Completado', 'Venta completada', 'No asiste'];
      if (completedStatuses.includes(currentStatus)) {
        return { kind: 'error' as const, message: 'Esta cita ya fue procesada.' };
      }

      if (action === 'confirm' && currentStatus === 'Confirmado') {
        return {
          kind: 'already' as const,
          action,
          nombre: reserva.cliente_nombre || '',
          fecha: reserva.fecha || '',
          hora: reserva.hora_inicio || '',
        };
      }
      if (action === 'cancel' && currentStatus === 'Cancelado') {
        return {
          kind: 'already' as const,
          action,
          nombre: reserva.cliente_nombre || '',
          fecha: reserva.fecha || '',
          hora: reserva.hora_inicio || '',
        };
      }

      const newStatus = action === 'confirm' ? 'Confirmado' : 'Cancelado';
      const historyEntry = {
        action: newStatus,
        by: 'Cliente (vía Email)',
        at: Timestamp.now(),
        previousStatus: currentStatus,
      };

      tx.update(reservaRef, {
        status: newStatus,
        estado: newStatus,
        statusHistory: (reserva.statusHistory || []).concat(historyEntry),
        ...(action === 'cancel'
          ? {
              actionToken: null,
              motivo_cancelacion: 'Cancelado por el cliente desde el correo',
              cancelado_en: Timestamp.now(),
            }
          : {}),
      });

      if (action === 'cancel' && reserva.cliente_id) {
        tx.update(db.collection('clientes').doc(reserva.cliente_id), {
          citas_canceladas: FieldValue.increment(1),
          actualizado_el: Timestamp.now(),
        });
      }

      return {
        kind: 'success' as const,
        action,
        reserva,
        nombre: reserva.cliente_nombre || '',
        fecha: reserva.fecha || '',
        hora: reserva.hora_inicio || '',
      };
    });

    if (txOutcome.kind === 'error') {
      return NextResponse.json({ status: 'error', message: txOutcome.message }, { status: 400 });
    }

    if (txOutcome.kind === 'already') {
      return NextResponse.json({
        status: 'already',
        action: txOutcome.action,
        nombre: txOutcome.nombre,
        fecha: txOutcome.fecha,
        hora: txOutcome.hora,
      });
    }

    if (action === 'cancel') {
      sendBookingCancellation({
        reservationId: reservaId,
        reservation: { ...txOutcome.reserva, id: reservaId, estado: 'Cancelado' },
        reason: 'Cancelado por el cliente desde el correo',
      }).catch((err) => {
        console.error('[Cita Action POST] Error enviando correo de cancelación:', err);
      });
    }

    return NextResponse.json({
      status: 'success',
      action: txOutcome.action,
      nombre: txOutcome.nombre,
      fecha: txOutcome.fecha,
      hora: txOutcome.hora,
    });
  } catch (error) {
    console.error('[Cita Action POST] Error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Error interno al procesar la solicitud.' },
      { status: 500 }
    );
  }
}
