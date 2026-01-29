'use server';

import { getAuth, getDb } from '@/lib/firebase-server';
import { sendEmail } from '@/lib/services/email';

export async function inviteUser(userData: {
    email: string;
    name: string;
    role: string;
    permissions?: string[];
    local_id?: string | null;
    avatarUrl?: string;
}) {
    try {
        const auth = getAuth();
        const db = getDb();

        // 1. Check/Create User in Firebase Auth
        let uid;
        try {
            const userRecord = await auth.getUserByEmail(userData.email);
            uid = userRecord.uid;
            // Update profile if exists
            await auth.updateUser(uid, {
                displayName: userData.name,
                photoURL: userData.avatarUrl || undefined,
            });
        } catch (error: any) {
            if (error.code === 'auth/user-not-found') {
                const userRecord = await auth.createUser({
                    email: userData.email,
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
            email: userData.email,
            role: userData.role,
            permissions: userData.permissions || [],
            avatarUrl: userData.avatarUrl || null,
            local_id: userData.local_id || null,
            createdAt: new Date().toISOString(),
            status: 'active'
        }, { merge: true });


        // 3. Generate Password Reset Link
        const link = await auth.generatePasswordResetLink(userData.email);

        // 4. Get Company Branding
        const settingsSnap = await db.collection('settings').doc('website').get();
        const settings = settingsSnap.data() || {};
        const logoUrl = settings.logoUrl || 'https://firebasestorage.googleapis.com/v0/b/agenda-1ae08.firebasestorage.app/o/logo-vatos-alfa.png?alt=media&token=placeholder'; // Fallback or dynamic
        const companyName = settings.companyName || 'VATOS ALFA Barber Shop';
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
                    ${logoUrl && !logoUrl.includes('placeholder')
                ? `<img src="${logoUrl}" alt="${companyName}">`
                : `<h1 style="color: white; margin: 0;">${companyName}</h1>`
            }
                </div>
                <div class="content">
                    <h1 class="h1">¡Bienvenido al Equipo, ${userData.name}!</h1>
                    <p class="p">
                        Has sido invitado a formar parte del equipo de <strong>${companyName}</strong>.
                        Para comenzar, por favor configura tu contraseña segura haciendo clic en el siguiente botón.
                    </p>
                    <a href="${link}" class="btn">Configurar Contraseña</a>
                    <p class="p" style="margin-top: 30px; font-size: 14px; color: #64748b;">
                        Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                        <a href="${link}" style="color: ${primaryColor};">${link}</a>
                    </p>
                </div>
                <div class="footer">
                    &copy; ${new Date().getFullYear()} ${companyName}. Todos los derechos reservados.<br>
                    Este correo fue enviado automáticamente por el sistema de gestión.
                </div>
            </div>
        </body>
        </html>
        `;

        await sendEmail({
            to: userData.email,
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
