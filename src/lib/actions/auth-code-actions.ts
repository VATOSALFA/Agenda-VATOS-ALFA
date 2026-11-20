'use server';

import crypto from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/lib/firebase-server';
import { checkRateLimit, verifyStaffAccess } from '@/lib/server-auth';

export type AuthPermissionModule =
  | 'reserves'
  | 'cashbox'
  | 'download'
  | 'invoiced_sales'
  | 'exempt_deposits'
  | 'any'
  | string;

export interface ValidateAuthCodeServerInput {
  code: string;
  requiredPermission?: AuthPermissionModule;
  userId?: string;
  userName?: string;
  userRole?: string;
  localId?: string;
  operationDescription?: string;
  moduleLabel?: string;
  usedBy?: string;
  usedInModule?: string;
  usedDetails?: string;
}

export interface ValidateAuthCodeServerResult {
  valid: boolean;
  codeId?: string;
  codeDocId?: string;
  codeName?: string;
  isOneTime?: boolean;
  error?: string;
  errorMessage?: string;
}

const WEAK_BLOCKED_CODES = new Set<string>([
  '0000',
  '1111',
  '2222',
  '3333',
  '4444',
  '5555',
  '6666',
  '7777',
  '8888',
  '9999',
  '1234',
  '4321',
  '2345',
  '3456',
  '4567',
  '5678',
  '6789',
  '9876',
  '0123',
  '1212',
  '2024',
  '2025',
  '2026',
]);

function parseExpiresAtMs(expiresAt: any): number {
  if (!expiresAt) return 0;
  if (typeof expiresAt?.toMillis === 'function') return expiresAt.toMillis();
  if (expiresAt instanceof Date) return expiresAt.getTime();
  if (typeof expiresAt === 'number') return expiresAt;
  const parsed = new Date(expiresAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasRequiredPermission(data: Record<string, any>, perm: AuthPermissionModule): boolean {
  if (!perm || perm === 'any') return true;
  if (perm === 'exempt_deposits') {
    return (
      data.exempt_deposits === true ||
      data.reserves === true ||
      data.cashbox === true ||
      data.invoiced_sales === true
    );
  }
  return data[perm] === true;
}

function maskAuthCodeForAudit(rawCode: unknown, codeName?: string, isOneTime?: boolean): string {
  const s = String(rawCode || '').trim();
  if (isOneTime) return '1-USO (****)';
  if (codeName) return `${codeName} (****)`;
  if (!s) return '****';
  return '****';
}

export async function validateAndConsumeAuthCodeServer(
  input: ValidateAuthCodeServerInput
): Promise<ValidateAuthCodeServerResult> {
  const caller = await verifyStaffAccess();
  const rl = checkRateLimit(`auth_code:${caller.uid}`, 10, 60_000);
  if (!rl.allowed) {
    const msg = `Demasiados intentos de código. Espera ${rl.retryAfterSec} segundos.`;
    return { valid: false, error: msg, errorMessage: msg };
  }

  const cleanCode = String(input.code || '').trim();
  if (!cleanCode || cleanCode.length < 4) {
    const msg = 'Ingresa un código de autorización válido.';
    return { valid: false, error: msg, errorMessage: msg };
  }

  if (WEAK_BLOCKED_CODES.has(cleanCode)) {
    const msg = 'Código bloqueado por seguridad. Usa un código válido de autorización.';
    return { valid: false, error: msg, errorMessage: msg };
  }

  const db = getDb();
  const requiredPermission = input.requiredPermission || 'any';
  const snap = await db
    .collection('codigos_autorizacion')
    .where('code', '==', cleanCode)
    .where('active', '==', true)
    .limit(5)
    .get();

  if (snap.empty) {
    const msg = 'Código de autorización incorrecto o inactivo.';
    return { valid: false, error: msg, errorMessage: msg };
  }

  const operatorName = input.usedBy || input.userName || caller.name;
  const moduleName = input.usedInModule || input.moduleLabel || 'Sistema';
  const detailsText =
    input.usedDetails || input.operationDescription || `Autorización en ${moduleName}`;

  let lastFailureReason = 'Código de autorización incorrecto o sin permisos.';

  for (const candidateDoc of snap.docs) {
    try {
      const outcome = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(candidateDoc.ref);
        if (!fresh.exists) {
          return { ok: false as const, reason: 'El código ya no existe.' };
        }
        const data = fresh.data() || {};
        if (data.active !== true) {
          return { ok: false as const, reason: 'Este código fue desactivado.' };
        }
        if (data.is_one_time === true && data.used === true) {
          return { ok: false as const, reason: 'Este código de un solo uso ya fue utilizado.' };
        }
        if (data.expires_at) {
          const expMs = parseExpiresAtMs(data.expires_at);
          if (!expMs || Date.now() > expMs) {
            return { ok: false as const, reason: 'Este código de autorización ha expirado.' };
          }
        }
        if (!hasRequiredPermission(data, requiredPermission)) {
          return {
            ok: false as const,
            reason: `El código no tiene permisos para el módulo "${requiredPermission}".`,
          };
        }

        if (data.is_one_time === true) {
          tx.update(candidateDoc.ref, {
            used: true,
            active: false,
            used_at: new Date().toISOString(),
            used_by: operatorName,
            used_by_uid: caller.uid,
            used_in_module: moduleName,
            used_details: detailsText,
          });
        }

        return {
          ok: true as const,
          codeId: candidateDoc.id,
          codeName: String(data.name || 'Código Maestro'),
          isOneTime: data.is_one_time === true,
        };
      });

      if (outcome.ok) {
        try {
          await db.collection('audit_logs').add({
            action: outcome.isOneTime ? 'Uso Código Temporal (1 Uso)' : 'Autorización con Código',
            details: `${detailsText}. Módulo: ${moduleName}. Código: ${outcome.codeName}.`,
            userId: caller.uid,
            userName: operatorName,
            userRole: caller.role,
            severity: 'info',
            entityId: outcome.codeId,
            localId: input.localId || caller.localId || 'unknown',
            authCode: maskAuthCodeForAudit(cleanCode, outcome.codeName, outcome.isOneTime),
            timestamp: FieldValue.serverTimestamp(),
          });
        } catch (auditErr) {
          console.error('[auth-code-actions] Audit log failed:', auditErr);
        }

        return {
          valid: true,
          codeId: outcome.codeId,
          codeDocId: outcome.codeId,
          codeName: outcome.codeName,
          isOneTime: outcome.isOneTime,
        };
      }

      lastFailureReason = outcome.reason;
    } catch (txErr) {
      console.error('[auth-code-actions] Transaction error:', txErr);
      lastFailureReason = 'Error al verificar código de autorización.';
    }
  }

  return { valid: false, error: lastFailureReason, errorMessage: lastFailureReason };
}

export async function createOneTimeAuthCodeServer(input: {
  createdBy?: string;
  purpose?: string;
  expirationMinutes?: number;
  expiresInMinutes?: number;
}): Promise<{ id: string; code: string; expiresAt: string }> {
  const caller = await verifyStaffAccess(undefined, { requireAdmin: true });
  const db = getDb();

  const rawMins = Number(input.expiresInMinutes ?? input.expirationMinutes ?? 30);
  const mins = Number.isFinite(rawMins) && rawMins > 0 ? Math.min(rawMins, 1440) : 30;
  const purpose = String(input.purpose || 'Autorización general / Exención de anticipo').slice(0, 200);

  let code = '';
  for (let i = 0; i < 15; i++) {
    const candidate = String(crypto.randomInt(1000, 10000));
    if (WEAK_BLOCKED_CODES.has(candidate)) continue;
    const existing = await db
      .collection('codigos_autorizacion')
      .where('code', '==', candidate)
      .where('active', '==', true)
      .limit(1)
      .get();
    if (existing.empty) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    do {
      code = String(crypto.randomInt(1000, 10000));
    } while (WEAK_BLOCKED_CODES.has(code));
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + mins * 60 * 1000).toISOString();

  const docRef = await db.collection('codigos_autorizacion').add({
    name: `Código 1 Uso (${purpose.slice(0, 40)})`,
    code,
    active: true,
    reserves: true,
    cashbox: true,
    download: true,
    invoiced_sales: true,
    exempt_deposits: true,
    is_one_time: true,
    used: false,
    created_at: now.toISOString(),
    created_by: caller.name || input.createdBy || 'Administrador',
    created_by_uid: caller.uid,
    expires_at: expiresAt,
    purpose,
  });

  await db.collection('audit_logs').add({
    action: 'Generar Código 1 Uso',
    details: `Código temporal válido por ${mins} min generado. Motivo: ${purpose}`,
    userId: caller.uid,
    userName: caller.name,
    userRole: caller.role,
    severity: 'info',
    entityId: docRef.id,
    localId: caller.localId || 'unknown',
    authCode: '1-USO (****)',
    timestamp: FieldValue.serverTimestamp(),
  });

  return { id: docRef.id, code, expiresAt };
}

export async function logAuditActionServer(entry: {
  action: string;
  details: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  severity?: 'info' | 'warning' | 'critical';
  entityId?: string;
  localId?: string;
  authCode?: string;
}): Promise<void> {
  try {
    const caller = await verifyStaffAccess();
    const db = getDb();
    const maskedCode = entry.authCode
      ? entry.authCode.includes('1 uso') || entry.authCode.includes('1-USO')
        ? '1-USO (****)'
        : '****'
      : undefined;

    await db.collection('audit_logs').add({
      action: String(entry.action || '').slice(0, 160),
      details: String(entry.details || '').slice(0, 1500),
      userId: caller.uid,
      userName: caller.name || entry.userName || 'Usuario',
      userRole: caller.role || entry.userRole || 'Staff',
      severity: entry.severity || 'info',
      ...(entry.entityId ? { entityId: String(entry.entityId) } : {}),
      ...(entry.localId ? { localId: String(entry.localId) } : {}),
      ...(maskedCode ? { authCode: maskedCode } : {}),
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[logAuditActionServer] Error logging audit action:', err);
  }
}
