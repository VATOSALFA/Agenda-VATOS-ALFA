import { logAuditActionServer } from '@/lib/actions/auth-code-actions';

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
    await logAuditActionServer({
      action: entry.action,
      details: entry.details,
      userId: entry.userId,
      userName: entry.userName,
      userRole: entry.userRole,
      authCode: entry.authCode,
      severity: entry.severity,
      entityId: entry.entityId,
      localId: entry.localId,
    });
  } catch (error) {
    console.error('Failed to log audit action:', error);
  }
};
