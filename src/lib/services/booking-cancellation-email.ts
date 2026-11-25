import { Resend } from 'resend';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from '@/lib/firebase-server';
import { escapeHtml } from '@/lib/server-auth';

export interface SendBookingCancellationParams {
  reservationId?: string;
  reservation?: any;
  reason?: string;
  clientEmail?: string;
  forceSend?: boolean;
}

function safeHttpUrl(raw: unknown, fallback: string): string {
  const val = String(raw || '').trim();
  if (/^https?:\/\//i.test(val)) return escapeHtml(val);
  return escapeHtml(fallback);
}

function safeCssHex(raw: unknown, fallback: string): string {
  const val = String(raw || '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(val)) return val;
  return fallback;
}

export async function sendBookingCancellation(params: SendBookingCancellationParams) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error('[Email Cancellation] RESEND_API_KEY is missing in server environment.');
    return { error: 'RESEND_API_KEY missing' };
  }
  const resend = new Resend(resendApiKey);

  const db = getDb();
  if (!db) {
    return { error: 'Database not available' };
  }

  try {
    let reservation = params.reservation || null;
    const reservationId = params.reservationId || (reservation ? reservation.id : null);

    if (reservationId && (!reservation || !reservation.fecha)) {
      const resDoc = await db.collection('reservas').doc(reservationId).get();
      if (resDoc.exists) {
        reservation = { ...resDoc.data(), id: resDoc.id };
      }
    }

    if (!reservation) {
      return { error: 'Reserva no encontrada para enviar correo de cancelación' };
    }

    if (!params.forceSend && reservation.notifications?.email_cancellation_sent) {
      console.log(`[Email Cancellation] Already sent for reservation ${reservation.id || reservationId}`);
      return { success: true, skipped: true, reason: 'Already sent' };
    }

    const [emailConfigDoc, websiteSettingsDoc, empresaSnap] = await Promise.all([
      db.collection('configuracion').doc('emails').get(),
      db.collection('settings').doc('website').get(),
      db.collection('empresa').limit(1).get(),
    ]);

    const emailConfig: any = emailConfigDoc.exists ? emailConfigDoc.data() : {};
    const websiteSettings: any = websiteSettingsDoc.exists ? websiteSettingsDoc.data() : {};
    const empresaConfig: any = !empresaSnap.empty ? empresaSnap.docs[0].data() : {};

    const cancelConfig = websiteSettings.cancellationEmailConfig || {};
    if (cancelConfig.enabled === false && !params.forceSend) {
      console.log('[Email Cancellation] Cancellation emails are disabled in configuration.');
      return { success: true, skipped: true, reason: 'Disabled in config' };
    }

    let clientEmail =
      params.clientEmail ||
      reservation.cliente_email ||
      reservation.customer?.correo ||
      reservation.customer?.email ||
      '';
    let clientName = reservation.cliente_nombre || reservation.customer?.nombre || '';

    if (!clientEmail && reservation.cliente_id) {
      try {
        const clientDoc = await db.collection('clientes').doc(reservation.cliente_id).get();
        if (clientDoc.exists) {
          const cData = clientDoc.data() || {};
          clientEmail = cData.correo || cData.email || '';
          if (!clientName) clientName = cData.nombre || '';
        }
      } catch (err) {
        console.error('[Email Cancellation] Error fetching client doc:', err);
      }
    }

    if (!clientEmail) {
      console.log(`[Email Cancellation] No client email found for reservation ${reservation.id || reservationId}. Skipping.`);
      return { success: true, skipped: true, reason: 'No client email' };
    }

    const professionalId =
      reservation.barbero_id ||
      (reservation.items && reservation.items[0] ? reservation.items[0].barbero_id : '');
    const [profDoc, locDoc] = await Promise.all([
      professionalId
        ? db.collection('profesionales').doc(professionalId).get()
        : Promise.resolve({ exists: false, data: () => ({}) }),
      reservation.local_id
        ? db.collection('locales').doc(reservation.local_id).get()
        : Promise.resolve({ exists: false, data: () => ({}) }),
    ]);
    const professional: any = profDoc.exists ? profDoc.data() : {};
    const localData: any = locDoc.exists ? locDoc.data() : {};

    const professionalName = professional.publicName || professional.name || reservation.barbero_nombre || 'Profesional';
    const localAddress = localData.address || localData.direccion || 'Sucursal Principal';
    const localPhone = localData.phone || localData.telefono || '';
    const whatsappDigits = String(localPhone || '').replace(/\D/g, '');
    const whatsappLink = whatsappDigits ? `https://wa.me/${whatsappDigits}` : '#';

    const senderName = empresaConfig.name || 'VATOS ALFA Barber Shop';
    const defaultSenderEmail = 'contacto@vatosalfa.com';
    let fromEmail = `${senderName} <${defaultSenderEmail}>`;

    if (emailConfig.senders && Array.isArray(emailConfig.senders)) {
      const primary = emailConfig.senders.find((s: any) => s.isPrimary && s.confirmed);
      const anyConfirmed = emailConfig.senders.find((s: any) => s.confirmed);
      const sender = primary || anyConfirmed;
      if (sender) fromEmail = `${senderName} <${sender.email}>`;
    }

    const logoUrl = safeHttpUrl(
      empresaConfig.logo_url || empresaConfig.icon_url,
      'https://vatosalfa.com/logo.png'
    );
    const secondaryColor = safeCssHex(empresaConfig.theme?.secondaryColor, '#314177');

    let dateStr = reservation.fecha || '';
    try {
      if (dateStr && typeof dateStr === 'string' && dateStr.includes('-')) {
        const dateObj = parse(dateStr, 'yyyy-MM-dd', new Date());
        dateStr = format(dateObj, "EEEE, d 'de' MMMM, yyyy", { locale: es });
      }
    } catch (e) {
      console.log('Date parsing skipped:', e);
    }
    const timeStr = reservation.hora_inicio || '00:00';

    const itemsList = reservation.items || [{ servicio: reservation.servicio || 'Servicio' }];
    const itemsListHtml = itemsList
      .map(
        (i: any) =>
          `<div style="margin-bottom: 4px; font-family: 'Roboto', Arial, sans-serif; font-size: 1.35em; font-weight: 700; color: #1e293b;">${escapeHtml(i.nombre || i.servicio || 'Servicio')}</div>`
      )
      .join('');

    const tpl = websiteSettings.cancellationEmailTemplate || {};
    const subject = `${String(tpl.subject || 'Cancelación de Cita')} - ${senderName}`;
    const rawHeadline = String(tpl.headline || '¡Hola {nombre}, tu cita ha sido cancelada!');
    const headline = escapeHtml(
      rawHeadline
        .replace('{nombre}', clientName || 'Estimado(a) Cliente')
        .replace(/  +/g, ' ')
    );

    const cancellationNote = escapeHtml(
      tpl.note ||
        'Lamentamos informarte que tu cita ha sido cancelada. Si deseas volver a agendar con nosotros, puedes reservar una nueva cita en línea cuando gustes.'
    );
    const buttonText = escapeHtml(tpl.buttonText || 'AGENDAR NUEVA CITA');
    const buttonUrl = safeHttpUrl(tpl.buttonUrl, 'https://vatosalfa.com/reservar');
    const whatsappText = escapeHtml(tpl.whatsappText || 'Contáctanos por WhatsApp');

    const showDate = cancelConfig.showDate !== false;
    const showTime = cancelConfig.showTime !== false;
    const showProfessional = cancelConfig.showProfessional !== false;
    const showLocation = cancelConfig.showLocation !== false;
    const showServices = cancelConfig.showServices !== false;
    const showReason = cancelConfig.showReason !== false;
    const showButton = cancelConfig.showButton !== false;

    const cancellationReason = escapeHtml(params.reason || reservation.motivo_cancelacion || '');
    const safeSenderName = escapeHtml(senderName);

    const html = `
        <div style="font-family: 'Roboto', Arial, sans-serif; color: #1e293b; max-width: 100%; padding: 25px 12px; background-color: #f1f5f9;">
            <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;600;700&display=swap" rel="stylesheet">
            
            <div style="max-width: 420px; margin: 0 auto; background-color: #ffffff; border-radius: 18px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
                <div style="background-color: #ffffff; padding: 25px 25px 12px 25px; text-align: center;">
                    <img src="${logoUrl}" alt="${safeSenderName}" style="display: block; margin: 0 auto; width: 100%; max-width: 250px; height: auto; object-fit: contain;" />
                </div>

                <div style="padding: 10px 26px 26px 26px;">
                    <div style="text-align: center; margin-bottom: 12px;">
                        <span style="display: inline-block; background-color: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; font-size: 11px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; padding: 4px 12px; border-radius: 9999px;">CITA CANCELADA</span>
                    </div>

                    <h2 style="color: #0f172a; text-align: center; margin-top: 0px; margin-bottom: 8px; font-family: 'Roboto', Arial, sans-serif; font-weight: 700; font-size: 22px; line-height: 1.25;">
                        ${headline}
                    </h2>
                    
                    ${showServices ? `<div style="margin-bottom: 20px; text-align: center;">${itemsListHtml}</div>` : ''}

                    <table style="width: 100%; border-collapse: separate; border-spacing: 0 10px; margin-bottom: 15px;">
                        ${showDate ? `<tr>
                            <td style="width: 26px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/2693/2693507.png" width="20" height="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td> 
                            <td style="font-weight: 600; font-size: 0.98em; color: #334155; vertical-align: middle; padding-left: 12px;">${escapeHtml(dateStr)}</td>
                        </tr>` : ''}
                        
                        ${showTime ? `<tr>
                            <td style="width: 26px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/2972/2972531.png" width="20" height="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                            <td style="font-weight: 600; font-size: 0.98em; color: #334155; vertical-align: middle; padding-left: 12px;">${escapeHtml(timeStr)}</td>
                        </tr>` : ''}

                        ${showProfessional ? `<tr>
                            <td style="width: 26px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/1077/1077114.png" width="20" height="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                            <td style="font-weight: 600; font-size: 0.98em; color: #334155; vertical-align: middle; padding-left: 12px;">${escapeHtml(professionalName)}</td>
                        </tr>` : ''}

                        ${showLocation ? `<tr>
                            <td style="width: 26px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/535/535239.png" width="20" height="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                            <td style="font-weight: 600; font-size: 0.98em; color: #334155; vertical-align: middle; padding-left: 12px;">${escapeHtml(localAddress)}</td>
                        </tr>` : ''}
                    </table>

                    <div style="background-color: #f8fafc; color: #334155; padding: 16px; border-radius: 10px; font-size: 0.9em; margin-top: 18px; text-align: center; border: 1px solid #e2e8f0; line-height: 1.45;">
                        ${showReason && cancellationReason ? `
                        <div style="font-weight: 700; color: #b91c1c; margin-bottom: 6px; font-size: 0.95em;">
                            Motivo: <span style="font-weight: 500; color: #475569;">${cancellationReason}</span>
                        </div>` : ''}
                        <div style="color: #475569;">
                            ${cancellationNote.replace(/\n/g, '<br/>')}
                        </div>
                    </div>

                    ${showButton ? `
                    <div style="margin-top: 24px; text-align: center;">
                        <a href="${buttonUrl}" style="display: inline-block; background-color: ${secondaryColor}; color: #ffffff; padding: 13px 26px; border-radius: 8px; text-decoration: none; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; font-family: 'Roboto', Arial, sans-serif;">
                            ${buttonText}
                        </a>
                    </div>` : ''}

                    <div style="margin-top: 24px; text-align: left; padding-top: 18px; border-top: 1px solid #f1f5f9;">
                        <div style="margin-bottom: 12px; padding-left: 2px;">
                            <a href="${whatsappLink}" style="text-decoration: none; color: #1e293b; display: inline-flex; align-items: center;">
                                <img src="https://cdn-icons-png.flaticon.com/512/3670/3670051.png" width="20" height="20" style="margin-right: 12px; display: inline-block; vertical-align: middle;" alt="WhatsApp" />
                                <span style="font-weight: 700; font-size: 0.95em;">${whatsappText}</span>
                            </a>
                        </div>
                        ${localPhone ? `
                        <div style="display: flex; align-items: center; color: #1e293b; padding-left: 2px;">
                            <img src="https://cdn-icons-png.flaticon.com/512/724/724664.png" width="20" height="20" style="margin-right: 12px; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%); display: inline-block; vertical-align: middle;" alt="Teléfono" />
                            <span style="font-weight: 700; font-size: 0.95em;">${escapeHtml(localPhone)}</span>
                        </div>` : ''}
                    </div>
                </div>
                
                <div style="background-color: #fbfbfc; padding: 18px; text-align: center; font-size: 0.75em; color: #94a3b8; border-top: 1px solid #f1f5f9;">
                    ${emailConfig.signature ? escapeHtml(emailConfig.signature).replace(/\n/g, '<br/>') : safeSenderName}
                </div>
            </div>
        </div>
        `;

    const resendResponse = await resend.emails.send({
      from: fromEmail,
      to: clientEmail,
      subject,
      html,
      headers: {
        'X-Priority': '1',
        Importance: 'high',
        Priority: 'urgent',
      },
    });

    if (resendResponse.error) {
      console.error('[Email Cancellation] Resend error:', resendResponse.error);
      return { error: resendResponse.error.message };
    }

    const finalResId = reservation.id || reservationId;
    if (finalResId && !params.forceSend) {
      try {
        await db.collection('reservas').doc(finalResId).update({
          'notifications.email_cancellation_sent': true,
          'notifications.email_cancellation_sent_at': Timestamp.now(),
        });
      } catch (err) {
        console.error('[Email Cancellation] Failed to update reservation flags:', err);
      }
    }

    console.log(`[Email Cancellation] Successfully sent to ${clientEmail}. Resend ID: ${resendResponse.data?.id}`);
    return { success: true, id: resendResponse.data?.id };
  } catch (error: any) {
    console.error('[Email Cancellation] Unhandled error:', error);
    return { error: error.message || 'Error al enviar correo de cancelación' };
  }
}
