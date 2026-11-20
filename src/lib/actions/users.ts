'use server';

import { getAuth, getDb } from '@/lib/firebase-server';
import { sendEmail } from '@/lib/services/email';
import {
    GENERAL_ADMIN_EMAILS,
    GENERAL_ADMIN_UIDS,
    escapeHtml,
    verifyStaffAccess,
} from '@/lib/server-auth';

function safeLogoUrl(raw: unknown, fallback: string): string {
    const val = String(raw || '').trim();
    if (/^https:\/\//i.test(val)) return escapeHtml(val);
    return escapeHtml(fallback);
}

export async function inviteUser(userData: {
    email: string;
    name: string;
    role: string;
    permissions?: string[];
    local_id?: string | null;
    avatarUrl?: string;
    idToken?: string;
}) {
    try {
        const caller = await verifyStaffAccess(userData.idToken, { requireAdmin: true });
        const cleanEmail = String(userData.email || '').trim().toLowerCase();
        const targetRoleLower = String(userData.role || '').trim().toLowerCase();

        if (!cleanEmail || !cleanEmail.includes('@')) {
            return { success: false, error: 'Correo electrónico inválido.' };
        }

        if (!caller.isGeneralAdmin) {
            if (
                targetRoleLower === 'administrador general' ||
                targetRoleLower === 'admin' ||
                targetRoleLower === 'administrador local'
            ) {
                return { success: false, error: 'Solo el Administrador General puede asignar roles de administrador.' };
            }
            if (GENERAL_ADMIN_EMAILS.has(cleanEmail)) {
                return { success: false, error: 'No tienes permisos para modificar esta cuenta.' };
            }
        }

        const auth = getAuth();
        const db = getDb();

        // 1. Check/Create User in Firebase Auth
        let uid;
        try {
            const userRecord = await auth.getUserByEmail(cleanEmail);
            uid = userRecord.uid;
            if (!caller.isGeneralAdmin) {
                if (GENERAL_ADMIN_UIDS.has(uid)) {
                    return { success: false, error: 'No tienes permisos para modificar al Administrador General.' };
                }
                const existingDoc = await db.collection('usuarios').doc(uid).get();
                const existingRole = String(existingDoc.data()?.role || existingDoc.data()?.rol || '').trim().toLowerCase();
                if (
                    existingDoc.exists &&
                    (existingRole === 'administrador general' || existingRole === 'admin' || existingRole === 'administrador local')
                ) {
                    return { success: false, error: 'Solo el Administrador General puede modificar cuentas de administrador.' };
                }
            }
            // Update profile if exists
            await auth.updateUser(uid, {
                displayName: userData.name,
                photoURL: userData.avatarUrl || undefined,
            });
        } catch (error: any) {
            if (error.code === 'auth/user-not-found') {
                const userRecord = await auth.createUser({
                    email: cleanEmail,
                    emailVerified: true, // Mark as verified since we are inviting
                    displayName: userData.name,
                    photoURL: userData.avatarUrl || undefined,
                    disabled: false,
                });
                uid = userRecord.uid;
            } else {
                throw error;
            }
        }

        // 2. Save/Update User in Firestore
        const userRef = db.collection('usuarios').doc(uid);
        await userRef.set({
            name: userData.name,
            email: cleanEmail,
            role: userData.role,
            permissions: userData.permissions || [],
            avatarUrl: userData.avatarUrl || null,
            local_id: userData.local_id || null,
            createdAt: new Date().toISOString(),
            status: 'active'
        }, { merge: true });


        // 3. Generate Password Reset Link
        const link = await auth.generatePasswordResetLink(cleanEmail);

        // 4. Get Company Branding
        const settingsSnap = await db.collection('settings').doc('website').get();
        const settings = settingsSnap.data() || {};
        const rawLogoUrl = settings.logoUrl || 'https://firebasestorage.googleapis.com/v0/b/agenda-1ae08.firebasestorage.app/o/logo-vatos-alfa.png?alt=media&token=placeholder';
        const companyName = String(settings.companyName || 'VATOS ALFA Barber Shop');
        const safeCompanyName = escapeHtml(companyName);
        const safeLogo = safeLogoUrl(rawLogoUrl, 'https://vatosalfa.com/logo.png');
        const primaryColor = '#1e3a8a'; // Azul oscuro de Vatos Alfa

        // 5. Send Email
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Bienvenido al equipo</title>
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .header { background-color: ${primaryColor}; padding: 30px; text-align: center; }
                .header img { max-height: 80px; width: auto; }
                .content { padding: 40px 30px; color: #334155; text-align: center; }
                .h1 { font-size: 24px; font-weight: bold; margin-bottom: 20px; color: #0f172a; }
                .p { font-size: 16px; line-height: 1.6; margin-bottom: 30px; }
                .btn { display: inline-block; background-color: ${primaryColor}; color: #ffffff; font-weight: bold; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 16px; transition: background-color 0.3s; }
                .btn:hover { background-color: #1e40af; }
                .footer { background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <!-- Si no hay logo, mostramos el nombre -->
                    ${rawLogoUrl && !String(rawLogoUrl).includes('placeholder')
                ? `<img src="${safeLogo}" alt="${safeCompanyName}">`
                : `<h1 style="color: white; margin: 0;">${safeCompanyName}</h1>`
            }
                </div>
                <div class="content">
                    <h1 class="h1">¡Bienvenido al Equipo, ${escapeHtml(userData.name)}!</h1>
                    <p class="p">
                        Has sido invitado a formar parte del equipo de <strong>${safeCompanyName}</strong>.
                        Para comenzar, por favor configura tu contraseña segura haciendo clic en el siguiente botón.
                    </p>
                    <a href="${escapeHtml(link)}" class="btn">Configurar Contraseña</a>
                    <p class="p" style="margin-top: 30px; font-size: 14px; color: #64748b;">
                        Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                        <a href="${escapeHtml(link)}" style="color: ${primaryColor};">${escapeHtml(link)}</a>
                    </p>
                </div>
                <div class="footer">
                    &copy; ${new Date().getFullYear()} ${safeCompanyName}. Todos los derechos reservados.<br>
                    Este correo fue enviado automáticamente por el sistema de gestión.
                </div>
            </div>
        </body>
        </html>
        `;

        await sendEmail({
            to: cleanEmail,
            from: 'Agenda VATOS ALFA <contacto@vatosalfa.com>',
            subject: `Invitación para unirte a ${companyName}`,
            html: htmlContent,
            text: `Hola ${userData.name}, has sido invitado a unirte a ${companyName}. Usa este enlace para configurar tu contraseña: ${link}`
        });

        return { success: true };

    } catch (error: any) {
        console.error("Error inviting user:", error);
        return { success: false, error: error.message };
    }
}

export async function resendUserInvitation(email: string, name?: string, idToken?: string) {
    try {
        const caller = await verifyStaffAccess(idToken, { requireAdmin: true });
        const auth = getAuth();
        const db = getDb();

        const cleanEmail = email.trim().toLowerCase();
        if (!caller.isGeneralAdmin && GENERAL_ADMIN_EMAILS.has(cleanEmail)) {
            return { success: false, error: 'No tienes permisos sobre la cuenta del Administrador General.' };
        }
        let userName = name?.trim() || '';

        // 1. Check or fetch user in Auth
        let uid: string;
        try {
            const userRecord = await auth.getUserByEmail(cleanEmail);
            uid = userRecord.uid;
            if (!caller.isGeneralAdmin && GENERAL_ADMIN_UIDS.has(uid)) {
                return { success: false, error: 'No tienes permisos sobre la cuenta del Administrador General.' };
            }
            if (!userName && userRecord.displayName) {
                userName = userRecord.displayName;
            }
        } catch (error: any) {
            if (error.code === 'auth/user-not-found') {
                // If user not in Auth yet, check Firestore or create user in Auth
                const userSnap = await db.collection('usuarios').where('email', '==', cleanEmail).limit(1).get();
                if (!userSnap.empty) {
                    const uData = userSnap.docs[0].data();
                    const uRole = String(uData?.role || uData?.rol || '').trim().toLowerCase();
                    if (!caller.isGeneralAdmin && (uRole === 'administrador general' || uRole === 'admin')) {
                        return { success: false, error: 'No tienes permisos para reenviar invitación a administradores generales.' };
                    }
                    userName = userName || uData.name || 'Miembro del Equipo';
                    const newRec = await auth.createUser({
                        email: cleanEmail,
                        emailVerified: true,
                        displayName: userName,
                        disabled: false,
                    });
                    uid = newRec.uid;
                } else {
                    return { success: false, error: 'No se encontró ningún usuario con ese correo electrónico.' };
                }
            } else {
                throw error;
            }
        }

        if (!caller.isGeneralAdmin) {
            const targetDoc = await db.collection('usuarios').doc(uid).get();
            const targetRole = String(targetDoc.data()?.role || targetDoc.data()?.rol || '').trim().toLowerCase();
            if (targetRole === 'administrador general' || targetRole === 'admin') {
                return { success: false, error: 'No tienes permisos sobre administradores generales.' };
            }
        }

        if (!userName) {
            const userDoc = await db.collection('usuarios').doc(uid).get();
            if (userDoc.exists) {
                userName = userDoc.data()?.name || 'Miembro del Equipo';
            } else {
                userName = 'Miembro del Equipo';
            }
        }

        // 2. Generate Password Reset Link
        const link = await auth.generatePasswordResetLink(cleanEmail);

        // 3. Get Company Branding
        const settingsSnap = await db.collection('settings').doc('website').get();
        const settings = settingsSnap.data() || {};
        const rawLogoUrl = settings.logoUrl || 'https://firebasestorage.googleapis.com/v0/b/agenda-1ae08.firebasestorage.app/o/logo-vatos-alfa.png?alt=media&token=placeholder';
        const companyName = String(settings.companyName || 'VATOS ALFA Barber Shop');
        const safeCompanyName = escapeHtml(companyName);
        const safeLogo = safeLogoUrl(rawLogoUrl, 'https://vatosalfa.com/logo.png');
        const primaryColor = '#202A49';

        // 4. HTML Content
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Invitación a ${safeCompanyName}</title>
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .header { background-color: ${primaryColor}; padding: 30px; text-align: center; }
                .header img { max-height: 80px; width: auto; }
                .content { padding: 40px 30px; color: #334155; text-align: center; }
                .h1 { font-size: 24px; font-weight: bold; margin-bottom: 20px; color: #0f172a; }
                .p { font-size: 16px; line-height: 1.6; margin-bottom: 25px; }
                .btn { display: inline-block; background-color: ${primaryColor}; color: #ffffff; font-weight: bold; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 16px; transition: background-color 0.3s; }
                .btn:hover { background-color: #182038; }
                .footer { background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    ${rawLogoUrl && !String(rawLogoUrl).includes('placeholder')
                        ? `<img src="${safeLogo}" alt="${safeCompanyName}">`
                        : `<h1 style="color: white; margin: 0;">${safeCompanyName}</h1>`
                    }
                </div>
                <div class="content">
                    <h1 class="h1">¡Hola, ${escapeHtml(userName)}!</h1>
                    <p class="p">
                        Te enviamos este correo para que configures tu acceso seguro a la plataforma y a la aplicación móvil de <strong>${safeCompanyName}</strong>.
                    </p>
                    <p class="p">
                        Haz clic en el siguiente botón para establecer tu contraseña e iniciar sesión:
                    </p>
                    <a href="${escapeHtml(link)}" class="btn">Configurar Mi Contraseña</a>
                    <p class="p" style="margin-top: 30px; font-size: 14px; color: #64748b;">
                        Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                        <a href="${escapeHtml(link)}" style="color: ${primaryColor};">${escapeHtml(link)}</a>
                    </p>
                </div>
                <div class="footer">
                    &copy; ${new Date().getFullYear()} ${safeCompanyName}. Todos los derechos reservados.<br>
                    Este correo fue enviado automáticamente por el sistema de gestión.
                </div>
            </div>
        </body>
        </html>
        `;

        await sendEmail({
            to: cleanEmail,
            from: 'Agenda VATOS ALFA <contacto@vatosalfa.com>',
            subject: `Invitación para acceder a ${companyName}`,
            html: htmlContent,
            text: `Hola ${userName}, te enviamos tu enlace para acceder a ${companyName}. Configura tu contraseña aquí: ${link}`
        });

        return { success: true };
    } catch (error: any) {
        console.error("Error resending user invitation:", error);
        return { success: false, error: error.message || 'No se pudo enviar el correo de invitación.' };
    }
}
