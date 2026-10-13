// API Route for email quick actions (confirm/cancel appointments)

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-server';
import { sendBookingCancellation } from '@/lib/actions/booking';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    const action = searchParams.get('action'); // 'confirm' | 'cancel'

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9003';

    // Validate input
    if (!token || !action || !['confirm', 'cancel'].includes(action)) {
        return NextResponse.redirect(`${baseUrl}/cita/accion?status=error&message=Enlace+inválido`);
    }

    const db = getDb();
    if (!db) {
        return NextResponse.redirect(`${baseUrl}/cita/accion?status=error&message=Servicio+no+disponible`);
    }

    try {
        // Find the reservation by its action token
        const snapshot = await db.collection('reservas')
            .where('actionToken', '==', token)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return NextResponse.redirect(`${baseUrl}/cita/accion?status=error&message=Enlace+expirado+o+inválido`);
        }

        const reservaDoc = snapshot.docs[0];
        const reserva = reservaDoc.data();
        const reservaId = reservaDoc.id;

        // Security: check if the appointment date hasn't passed
        const now = new Date();
        if (reserva.fecha) {
            try {
                const [year, month, day] = reserva.fecha.split('-').map(Number);
                const appointmentDate = new Date(year, month - 1, day, 23, 59, 59);
                if (now > appointmentDate) {
                    return NextResponse.redirect(`${baseUrl}/cita/accion?status=error&message=Esta+cita+ya+pasó`);
                }
            } catch (e) {
                // If date parsing fails, continue anyway
                console.warn('[Cita Action] Could not parse date:', reserva.fecha);
            }
        }

        // Check current status allows this action
        const currentStatus = reserva.status || reserva.estado || 'Reservado';
        const completedStatuses = ['Completado', 'Venta completada', 'No asiste'];
        if (completedStatuses.includes(currentStatus)) {
            return NextResponse.redirect(`${baseUrl}/cita/accion?status=error&message=Esta+cita+ya+fue+procesada`);
        }

        // Prevent double-action
        if (action === 'confirm' && currentStatus === 'Confirmado') {
            return NextResponse.redirect(`${baseUrl}/cita/accion?status=already&action=confirm&nombre=${encodeURIComponent(reserva.cliente_nombre || '')}`);
        }
        if (action === 'cancel' && currentStatus === 'Cancelado') {
            return NextResponse.redirect(`${baseUrl}/cita/accion?status=already&action=cancel&nombre=${encodeURIComponent(reserva.cliente_nombre || '')}`);
        }

        // Perform the action
        const newStatus = action === 'confirm' ? 'Confirmado' : 'Cancelado';
        const { Timestamp, FieldValue } = await import('firebase-admin/firestore');

        const historyEntry = {
            action: newStatus,
            by: 'Cliente (vía Email)',
            at: Timestamp.now(),
            previousStatus: currentStatus
        };

        await db.collection('reservas').doc(reservaId).update({
            status: newStatus,
            estado: newStatus,
            [`statusHistory`]: (reserva.statusHistory || []).concat(historyEntry),
            // Invalidate the token after use (one-time use for cancel)
            ...(action === 'cancel' ? { actionToken: null } : {})
        });

        // Si la acción fue cancelar, actualizar contador de cancelaciones del cliente
        if (action === 'cancel' && reserva.cliente_id) {
            db.collection('clientes').doc(reserva.cliente_id).update({
                citas_canceladas: FieldValue.increment(1),
                actualizado_el: Timestamp.now()
            }).catch(err => console.warn('[Cita Action] Error updating client canceladas:', err));
        }

        // Si la acción fue cancelar, enviar correo de cancelación al cliente
        if (action === 'cancel') {
            sendBookingCancellation({
                reservationId: reservaId,
                reservation: { ...reserva, id: reservaId, estado: 'Cancelado' },
                reason: 'Cancelado por el cliente desde el correo'
            }).catch(err => {
                console.error('[Cita Action] Error enviando correo de cancelación:', err);
            });
        }

        // Redirect to success page
        const clientName = reserva.cliente_nombre || '';
        const fecha = reserva.fecha || '';
        const hora = reserva.hora_inicio || '';

        return NextResponse.redirect(
            `${baseUrl}/cita/accion?status=success&action=${action}&nombre=${encodeURIComponent(clientName)}&fecha=${encodeURIComponent(fecha)}&hora=${encodeURIComponent(hora)}`
        );

    } catch (error: any) {
        console.error('[Cita Action] Error:', error);
        return NextResponse.redirect(`${baseUrl}/cita/accion?status=error&message=Error+interno`);
    }
}
