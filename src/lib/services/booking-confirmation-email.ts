import { Resend } from 'resend';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { Timestamp } from 'firebase-admin/firestore';
import { escapeHtml } from '@/lib/server-auth';

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

export async function sendBookingConfirmation(
  reservation: any,
  db: any,
  clientEmail: string,
  professionalId: string
) {
  if (!clientEmail && !professionalId) return;

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY is missing in server environment.');
  }
  const resend = new Resend(resendApiKey);

  const [emailConfigDoc, websiteSettingsDoc, empresaSnap, professionalDoc, localDoc, clientDoc] =
    await Promise.all([
      db.collection('configuracion').doc('emails').get(),
      db.collection('settings').doc('website').get(),
      db.collection('empresa').limit(1).get(),
      professionalId
        ? db.collection('profesionales').doc(professionalId).get()
        : Promise.resolve({ exists: false, data: () => ({}) }),
      reservation.local_id
        ? db.collection('locales').doc(reservation.local_id).get()
        : Promise.resolve({ exists: false, data: () => ({}) }),
      reservation.cliente_id
        ? db.collection('clientes').doc(reservation.cliente_id).get()
        : Promise.resolve({ exists: false, data: () => ({}) }),
    ]);

  const emailConfig = emailConfigDoc.exists ? emailConfigDoc.data() : {};
  const websiteSettings = websiteSettingsDoc.exists ? websiteSettingsDoc.data() : {};
  const empresaConfig = !empresaSnap.empty ? empresaSnap.docs[0].data() : {};
  const professional = professionalDoc.exists ? professionalDoc.data() : {};
  const localData = localDoc.exists ? localDoc.data() : {};
  const clientData = clientDoc.exists ? clientDoc.data() : {};

  const ccAdminsConfig = websiteSettings.ccAdminsConfig || {};
  let resolvedBcc: string[] = [];

  try {
    const bccCollect: string[] = [];

    if (ccAdminsConfig.notifyGeneralAdmin) {
      const generalAdminsSnap = await db
        .collection('usuarios')
        .where('role', '==', 'Administrador general')
        .limit(5)
        .get();
      generalAdminsSnap.forEach((adminDoc: any) => {
        const u = adminDoc.data();
        if (u.email && u.email.includes('@')) bccCollect.push(u.email);
      });
    }

    if (ccAdminsConfig.notifyLocalAdmin && reservation.local_id) {
      const localAdminsSnap = await db
        .collection('usuarios')
        .where('role', '==', 'Administrador local')
        .where('local_id', '==', reservation.local_id)
        .limit(5)
        .get();
      localAdminsSnap.forEach((adminDoc: any) => {
        const u = adminDoc.data();
        if (u.email && u.email.includes('@')) bccCollect.push(u.email);
      });
    }

    resolvedBcc = [...new Set(bccCollect)].filter((e) => e !== professional.email);
    console.log(`[Email-Pro] BCC list: ${resolvedBcc.join(', ') || 'empty'}`);
  } catch (bccError) {
    console.error('[Email-Pro] Error building BCC list:', bccError);
  }

  const senderName = String(empresaConfig.name || 'VATOS ALFA Barber Shop');
  const safeSenderName = escapeHtml(senderName);
  const senderEmail = 'contacto@vatosalfa.com';
  const logoUrl = safeHttpUrl(
    empresaConfig.logo_url || empresaConfig.icon_url,
    'https://vatosalfa.com/logo.png'
  );
  const secondaryColor = safeCssHex(empresaConfig.theme?.secondaryColor, '#314177');

  let fromEmail = `${senderName} <${senderEmail}>`;
  if (emailConfig.senders && Array.isArray(emailConfig.senders)) {
    const primary = emailConfig.senders.find((s: any) => s.isPrimary && s.confirmed);
    const anyConfirmed = emailConfig.senders.find((s: any) => s.confirmed);
    const sender = primary || anyConfirmed;
    if (sender) fromEmail = `${senderName} <${sender.email}>`;
  }

  const itemsList = reservation.items || [{ servicio: reservation.servicio || 'Servicio' }];
  const itemsListHtml = itemsList
    .map(
      (i: any) =>
        `<div style="margin-bottom: 8px; font-family: 'Roboto', Arial, sans-serif; font-size: 1.4em; font-weight: 700; color: #333;">${escapeHtml(i.nombre || i.servicio || 'Servicio')}</div>`
    )
    .join('');

  let dateStr = String(reservation.fecha || '');
  try {
    if (dateStr && dateStr.includes('-')) {
      const dateObj = parse(dateStr, 'yyyy-MM-dd', new Date());
      dateStr = format(dateObj, "EEEE, d 'de' MMMM, yyyy", { locale: es });
    }
  } catch (e) {
    console.log('Date parsing skipped:', e);
  }

  const timeStr = String(reservation.hora_inicio || '00:00');
  const localAddress = String(localData.address || localData.direccion || 'Sucursal Principal');
  const localPhone = String(localData.phone || localData.telefono || '');
  const waPhone = localPhone.replace(/\D/g, '');
  const whatsappLink = waPhone ? `https://wa.me/${waPhone}` : '#';

  // --- CLIENT EMAIL ---
  const clientConfig = websiteSettings.confirmationEmailConfig || {};
  const isClientEnabled = clientEmail && clientConfig.enabled !== false;

  if (isClientEnabled) {
    const tpl = websiteSettings.confirmationEmailTemplate || {};
    const subject = `${tpl.subject || 'Confirmación de Cita'} - ${senderName}`;

    const showDate = clientConfig.showDate !== false;
    const showTime = clientConfig.showTime !== false;
    const showProfessional = clientConfig.showProfessional !== false;
    const showLocation = clientConfig.showLocation !== false;
    const showServices = clientConfig.showServices !== false;
    const yellowNote = escapeHtml(
      websiteSettings.predefinedNotes || 'Favor de llegar 5 minutos antes de la hora de tu cita.'
    );

    const quickActions = websiteSettings.quickActionsConfig || {};
    const isQuickActionsEnabled = quickActions.enabled === true;
    const appBaseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://vatosalfa.com';
    const actionApiUrl = `${appBaseUrl}/api/cita/action`;
    const confirmLink = reservation.actionToken
      ? `${actionApiUrl}?token=${encodeURIComponent(String(reservation.actionToken))}&action=confirm`
      : `https://wa.me/${waPhone}?text=${encodeURIComponent(`¡Hola! Confirmo mi cita para el ${dateStr} a las ${timeStr}.`)}`;
    const rescheduleLink = `https://wa.me/${waPhone}?text=${encodeURIComponent(`¡Hola! Requiero reagendar mi cita del ${dateStr} a las ${timeStr}.`)}`;
    const cancelLink = reservation.actionToken
      ? `${actionApiUrl}?token=${encodeURIComponent(String(reservation.actionToken))}&action=cancel`
      : `https://wa.me/${waPhone}?text=${encodeURIComponent(`¡Hola! Deseo cancelar mi cita del ${dateStr} a las ${timeStr}.`)}`;

    const headlineText = String(tpl.headline || '¡Hola {nombre}, tu cita está confirmada!')
      .replace('{nombre}', clientData.nombre || reservation.cliente_nombre || '')
      .replace(/  +/g, ' ');

    const html = `
            <div style="font-family: 'Roboto', Arial, sans-serif; color: #333; max-width: 100%; padding: 20px; background-color: #f4f4f4;">
            <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet">
            
            <div style="max-width: 400px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div style="background-color: #ffffff; padding: 25px 20px 10px 20px; text-align: center;">
                    <img src="${logoUrl}" alt="${safeSenderName}" style="width: 100%; max-width: 280px; height: auto; object-fit: contain;" />
                </div>

                <div style="padding: 25px;">
                    <h2 style="color: ${secondaryColor}; text-align: center; margin-top: 5px; margin-bottom: 5px; font-family: 'Roboto', Arial, sans-serif; font-weight: 700; font-size: 24px; line-height: 1.2;">${escapeHtml(headlineText)}</h2>
                    
                    ${showServices ? `<div style="margin-bottom: 25px; text-align: center;">${itemsListHtml}</div>` : ''}

                    <table style="width: 100%; border-collapse: separate; border-spacing: 0 12px;">
                            ${showDate ? `<tr>
                            <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/2693/2693507.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td> 
                            <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${escapeHtml(dateStr)}</td>
                            </tr>` : ''}
                            
                            ${showTime ? `<tr>
                            <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/2972/2972531.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                            <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${escapeHtml(timeStr)}</td>
                            </tr>` : ''}

                            ${showProfessional ? `<tr>
                                <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/1077/1077114.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                                <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${escapeHtml(professional.publicName || professional.name || 'Profesional')}</td>
                            </tr>` : ''}

                            ${showLocation ? `<tr>
                                <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/535/535239.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                                <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${escapeHtml(localAddress)}</td>
                            </tr>` : ''}
                    </table>

                    <div style="background-color: #ffffff; color: #333; padding: 15px; border-radius: 8px; font-size: 0.9em; margin-top: 25px; text-align: center; border: 1px solid #000000;">
                        ${yellowNote.replace(/\n/g, '<br/>')}
                    </div>

                    ${isQuickActionsEnabled ? `
                    <div style="margin-top: 25px; text-align: center;">
                        <div style="display: block; width: 100%;">
                            ${quickActions.showConfirm ? `
                            <a href="${escapeHtml(confirmLink)}" style="display: inline-block; background-color: #22c55e; color: white; padding: 10px 14px; border-radius: 8px; text-decoration: none; font-size: 11px; font-weight: bold; margin: 5px; font-family: 'Roboto', Arial, sans-serif;">CONFIRMAR</a>` : ''}
                            ${quickActions.showReschedule ? `
                            <a href="${escapeHtml(rescheduleLink)}" style="display: inline-block; background-color: #314177; color: white; padding: 10px 14px; border-radius: 8px; text-decoration: none; font-size: 11px; font-weight: bold; margin: 5px; font-family: 'Roboto', Arial, sans-serif;">REAGENDAR</a>` : ''}
                            ${quickActions.showCancel ? `
                            <a href="${escapeHtml(cancelLink)}" style="display: inline-block; background-color: #ef4444; color: white; padding: 10px 14px; border-radius: 8px; text-decoration: none; font-size: 11px; font-weight: bold; margin: 5px; font-family: 'Roboto', Arial, sans-serif;">CANCELAR</a>` : ''}
                        </div>
                    </div>` : ''}

                    <div style="margin-top: 25px; text-align: left;">
                        <div style="margin-bottom: 12px; padding-left: 2px;">
                            <a href="${whatsappLink}" style="text-decoration: none; color: #333; display: inline-flex; align-items: center;">
                                <img src="https://cdn-icons-png.flaticon.com/512/3670/3670051.png" width="20" style="margin-right: 12px;" alt="WhatsApp" />
                                <span style="font-weight: 700; font-size: 1em;">${escapeHtml(tpl.whatsappText || 'Contáctanos por WhatsApp')}</span>
                            </a>
                        </div>
                        <div style="display: flex; align-items: center; color: #333; padding-left: 2px;">
                                <img src="https://cdn-icons-png.flaticon.com/512/724/724664.png" width="20" style="margin-right: 12px; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);" alt="Teléfono" />
                                <span style="font-weight: 700; font-size: 1em;">${escapeHtml(localPhone)}</span>
                        </div>
                    </div>
                </div>
                
                <div style="background-color: #ffffff; padding: 20px; text-align: center; font-size: 0.75em; color: #bbb; border-top: 1px solid #f9f9f9;">
                    ${emailConfig.signature ? escapeHtml(emailConfig.signature).replace(/\n/g, '<br/>') : safeSenderName}
                </div>
            </div>
        </div>`;

    await resend.emails.send({
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

    try {
      if (reservation.id) {
        await db.collection('reservas').doc(reservation.id).update({
          'notifications.email_confirmation_sent': true,
          'notifications.email_confirmation_sent_at': Timestamp.now(),
        });
      }
    } catch (updateError) {
      console.error('Failed to track email status:', updateError);
    }

    console.log(`[Email] Client confirmation sent to ${clientEmail}`);
  } else {
    console.log(
      `[Email] Skipping Client Email. Email: ${clientEmail}, Enabled: ${clientConfig.enabled}`
    );
  }

  // --- PROFESSIONAL EMAIL ---
  const profConfig = websiteSettings.professionalConfirmationEmailConfig || {};
  let isProfEnabled = professional.email && profConfig.enabled !== false;

  if (isProfEnabled) {
    try {
      const timeZone = localData.timezone || 'America/Mexico_City';
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('es-MX', {
        timeZone,
        weekday: 'long',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const dayName =
        parts
          .find((p) => p.type === 'weekday')
          ?.value.toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') || '';
      const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
      const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
      const currentMinutes = hour * 60 + minute;
      const summaryTimeMinutes = 8 * 60;

      const schedule = localData.schedule || {};
      const scheduleDay = schedule[dayName];

      if (scheduleDay && scheduleDay.enabled && scheduleDay.end) {
        const [endH, endM] = scheduleDay.end.split(':').map(Number);
        const endMinutes = endH * 60 + endM;

        if (currentMinutes < summaryTimeMinutes || currentMinutes > endMinutes) {
          console.log(
            `[Email-Pro] Quiet Hours enforced (Current: ${hour}:${minute}, Window: 08:00-${scheduleDay.end}). Skipping email.`
          );
          isProfEnabled = false;
        }
      } else {
        console.log(`[Email-Pro] Shop Closed or No Schedule for ${dayName}. Skipping email.`);
        isProfEnabled = false;
      }
    } catch (e) {
      console.error('Error checking quiet hours:', e);
    }
  }

  if (isProfEnabled) {
    const profTpl = websiteSettings.professionalConfirmationEmailTemplate || {};
    const subject = String(profTpl.subject || 'Nueva Cita - {cliente}').replace(
      '{cliente}',
      clientData.nombre || reservation.cliente_nombre || 'Cliente'
    );

    const showDate = profConfig.showDate !== false;
    const showTime = profConfig.showTime !== false;
    const showClientName = profConfig.showClientName !== false;
    const showLocation = profConfig.showLocation !== false;
    const showServices = profConfig.showServices !== false;
    const note = escapeHtml(profConfig.note || '');

    const headline = escapeHtml(
      String(profTpl.headline || '¡{profesional}, tienes una nueva cita!').replace(
        '{profesional}',
        professional.name || 'Profesional'
      )
    );

    const html = `
                <div style="font-family: 'Roboto', Arial, sans-serif; color: #333; max-width: 100%; padding: 20px; background-color: #f4f4f4;">
                <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet">
                
                <div style="max-width: 400px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <div style="background-color: #ffffff; padding: 25px 20px 10px 20px; text-align: center;">
                        <img src="${logoUrl}" alt="${safeSenderName}" style="width: 100%; max-width: 280px; height: auto; object-fit: contain;" />
                    </div>

                    <div style="padding: 25px;">
                        <h2 style="color: ${secondaryColor}; text-align: center; margin-top: 5px; margin-bottom: 5px; font-family: 'Roboto', Arial, sans-serif; font-weight: 700; font-size: 24px; line-height: 1.2;">${headline}</h2>
                        
                        ${showServices ? `<div style="margin-bottom: 25px; text-align: center;">${itemsListHtml}</div>` : ''}

                        <table style="width: 100%; border-collapse: separate; border-spacing: 0 12px;">
                            ${showDate ? `<tr>
                                <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/2693/2693507.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td> 
                                <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${escapeHtml(dateStr)}</td>
                            </tr>` : ''}
                            
                            ${showTime ? `<tr>
                                <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/2972/2972531.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                                <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${escapeHtml(timeStr)}</td>
                            </tr>` : ''}

                            ${showClientName ? `<tr>
                                    <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/1077/1077114.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                                    <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${escapeHtml(clientData.nombre || reservation.cliente_nombre || 'Cliente')} ${escapeHtml(clientData.apellido || '')}</td>
                                </tr>` : ''}

                            ${showLocation ? `<tr>
                                    <td style="width: 24px; vertical-align: middle;"><img src="https://cdn-icons-png.flaticon.com/512/535/535239.png" width="20" style="display: block; filter: invert(21%) sepia(35%) saturate(6970%) hue-rotate(209deg) brightness(93%) contrast(101%);"></td>
                                    <td style="font-weight: 600; font-size: 1em; color: #444; vertical-align: middle; padding-left: 12px;">${escapeHtml(localAddress)}</td>
                                </tr>` : ''}
                        </table>

                        ${note ? `
                        <div style="background-color: #ffffff; color: #333; padding: 15px; border-radius: 8px; font-size: 0.9em; margin-top: 25px; text-align: center; border: 1px solid #000000;">
                            ${note.replace(/\n/g, '<br/>')}
                        </div>` : ''}
                    </div>
                    
                    <div style="background-color: #ffffff; padding: 20px; text-align: center; font-size: 0.75em; color: #bbb; border-top: 1px solid #f9f9f9;">
                        ${emailConfig.signature ? escapeHtml(emailConfig.signature).replace(/\n/g, '<br/>') : safeSenderName}
                    </div>
                </div>
                </div>
                `;

    await resend.emails.send({
      from: fromEmail,
      to: professional.email,
      bcc: resolvedBcc.length > 0 ? resolvedBcc : undefined,
      subject,
      html,
      headers: {
        'X-Priority': '1',
        Importance: 'high',
        Priority: 'urgent',
      },
    });
    console.log(
      `[Email] Professional confirmation sent to ${professional.email}${resolvedBcc.length > 0 ? ` (BCC: ${resolvedBcc.join(', ')})` : ''}`
    );
  } else {
    console.log(
      `[Email] Skipping Professional Email. Email: ${professional.email}, Enabled: ${profConfig.enabled}`
    );
  }
}
