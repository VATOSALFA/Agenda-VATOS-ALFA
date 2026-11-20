'use server';

import { getAuth, getDb } from '@/lib/firebase-server';
import { GENERAL_ADMIN_UIDS, verifyStaffAccess } from '@/lib/server-auth';

export async function deleteUser(userId: string, idToken?: string) {
    try {
        const caller = await verifyStaffAccess(idToken, { requireAdmin: true });
        const targetUid = String(userId || '').trim();
        if (!targetUid) {
            return { success: false, error: 'ID de usuario inválido.' };
        }
        if (targetUid === caller.uid) {
            return { success: false, error: 'No puedes eliminar tu propia cuenta.' };
        }
        if (GENERAL_ADMIN_UIDS.has(targetUid)) {
            return { success: false, error: 'No se puede eliminar al Administrador General.' };
        }

        const auth = getAuth();
        const db = getDb();

        const targetDoc = await db.collection('usuarios').doc(targetUid).get();
        if (targetDoc.exists) {
            const targetRole = String(targetDoc.data()?.role || targetDoc.data()?.rol || '').trim().toLowerCase();
            if (
                !caller.isGeneralAdmin &&
                (targetRole === 'administrador general' || targetRole === 'admin' || targetRole === 'administrador local')
            ) {
                return { success: false, error: 'Solo el Administrador General puede eliminar cuentas de administrador.' };
            }
        }

        // 1. Delete from Firestore
        await db.collection('usuarios').doc(targetUid).delete();

        // 2. Delete from Firebase Auth
        await auth.deleteUser(targetUid);

        return { success: true };
    } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
            const db = getDb();
            await db.collection('usuarios').doc(String(userId || '').trim()).delete();
            return { success: true };
        }
        console.error("Error deleting user:", error);
        return { success: false, error: error.message };
    }
}
