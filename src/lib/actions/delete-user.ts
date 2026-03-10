'use server';

import { getAuth, getDb } from '@/lib/firebase-server';

export async function deleteUser(userId: string) {
    try {
        const auth = getAuth();
        const db = getDb();

        // 1. Delete from Firestore
        await db.collection('usuarios').doc(userId).delete();

        // 2. Delete from Firebase Auth
        await auth.deleteUser(userId);

        return { success: true };
    } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
            // If user not found in Auth but was in Firestore (or vice-versa), consider it a success/cleanup
            const db = getDb();
            await db.collection('usuarios').doc(userId).delete();
            return { success: true };
        }
        console.error("Error deleting user:", error);
        return { success: false, error: error.message };
    }
}
