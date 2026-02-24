import { db } from '@/lib/firebase-client';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditLogEntry {
    action: string;
    details: string;
    userId: string;
    userName: string;
    userRole?: string;
    authCode?: string;
    severity: AuditSeverity;
    entityId?: string;
    localId?: string;
    timestamp?: any;
    metadata?: Record<string, any>;
}

export const logAuditAction = async (entry: Omit<AuditLogEntry, 'timestamp'>) => {
    try {
        if (!db) {
            console.warn('Audit Logger: Firestore not initialized');
            return;
        }

        await addDoc(collection(db, 'audit_logs'), {
            ...entry,
            timestamp: serverTimestamp(),
        });
    } catch (error) {
        console.error('Failed to log audit action:', error);
        // Important: Logging failure should not crash the app, so we catch and ignore in UI, 
        // but in production you might want a fallback.
    }
};
