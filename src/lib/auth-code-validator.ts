import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  addDoc,
  doc,
  Timestamp,
  Firestore,
} from 'firebase/firestore';
import { logAuditAction } from '@/lib/audit-logger';

export type AuthPermissionModule = 'reserves' | 'cashbox' | 'download' | 'invoiced_sales' | 'exempt_deposits' | 'any' | string;

export interface ValidateAuthCodeOptions {
  db: Firestore;
  code: string;
  requiredPermission?: AuthPermissionModule;
  userId?: string;
  userName?: string;
  usedBy?: string;
  userRole?: string;
  localId?: string;
  operationDescription?: string;
  usedDetails?: string;
  moduleLabel?: string;
  usedInModule?: string;
}

export interface ValidateAuthCodeResult {
  valid: boolean;
  error?: string;
  errorMessage?: string;
  codeId?: string;
  codeName?: string;
  isOneTime?: boolean;
}

/**
 * Valida un código de autorización (fijo o de 1 solo uso de 4 dígitos).
 * Si es un código de 1 solo uso (`is_one_time === true`), verifica su vigencia
 * y lo consume automáticamente (`active: false, used: true`) para impedir reutilización.
 */
export async function validateAndConsumeAuthCode(
  options: ValidateAuthCodeOptions
): Promise<ValidateAuthCodeResult> {
  const {
    db,
    code,
    requiredPermission = 'any',
    userId = 'unknown',
    userName,
    usedBy,
    userRole = 'Staff',
    localId = 'unknown',
    operationDescription,
    usedDetails,
    moduleLabel,
    usedInModule,
  } = options;

  const effectiveUserName = userName || usedBy || 'Recepción / Staff';
  const effectiveDescription = operationDescription || usedDetails || 'Autorización de operación';
  const effectiveModuleLabel = moduleLabel || usedInModule || 'Sistema';

  const cleanCode = String(code || '').trim();
  if (!cleanCode) {
    const msg = 'Ingresa un código de autorización.';
    return { valid: false, error: msg, errorMessage: msg };
  }

  try {
    const q = query(
      collection(db, 'codigos_autorizacion'),
      where('code', '==', cleanCode),
      where('active', '==', true)
    );

    const snap = await getDocs(q);
    if (snap.empty) {
      const msg = 'Código inválido, inactivo o ya utilizado.';
      return {
        valid: false,
        error: msg,
        errorMessage: msg,
      };
    }

    const nowMs = Date.now();

    for (const codeDoc of snap.docs) {
      const data = codeDoc.data();

      // 1. Si es de un solo uso, revisar si ya fue usado o expiró
      if (data.is_one_time === true) {
        if (data.used === true) {
          await updateDoc(doc(db, 'codigos_autorizacion', codeDoc.id), {
            active: false,
          }).catch(() => {});
          continue;
        }

        const expiresAt = data.expires_at;
        let expiresMs = 0;
        if (expiresAt?.toDate) {
          expiresMs = expiresAt.toDate().getTime();
        } else if (typeof expiresAt?.seconds === 'number') {
          expiresMs = expiresAt.seconds * 1000;
        } else if (typeof expiresAt === 'string' || typeof expiresAt === 'number') {
          expiresMs = new Date(expiresAt).getTime();
        }

        if (expiresMs > 0 && nowMs > expiresMs) {
          await updateDoc(doc(db, 'codigos_autorizacion', codeDoc.id), {
            active: false,
          }).catch(() => {});
          const msg = 'Este código temporal de un solo uso ha expirado. Solicita uno nuevo.';
          return {
            valid: false,
            error: msg,
            errorMessage: msg,
          };
        }
      }

      // 2. Verificar permiso del módulo requerido (los códigos de 1 uso tienen todos los permisos habilitados por defecto)
      const permKey = requiredPermission === 'exempt_deposits' ? 'reserves' : requiredPermission;
      if (permKey !== 'any' && data.is_one_time !== true) {
        if (!data[permKey]) {
          continue;
        }
      }

      // 3. Si es de un solo uso, quemarlo inmediatamente
      if (data.is_one_time === true) {
        await updateDoc(doc(db, 'codigos_autorizacion', codeDoc.id), {
          active: false,
          used: true,
          used_at: Timestamp.now(),
          used_by: effectiveUserName,
          used_in_module: effectiveModuleLabel,
          used_details: effectiveDescription,
        });
      }

      // 4. Registrar en bitácora de auditoría
      await logAuditAction({
        action: data.is_one_time
          ? 'Autorización con Código de 1 Uso (4 Dígitos)'
          : 'Autorización por Código Maestro',
        details: `${effectiveDescription} | Código: ${data.name || 'Temporal 1 Uso'} (${data.is_one_time ? cleanCode : '••••'})`,
        userId,
        userName: effectiveUserName,
        userRole,
        authCode: data.name || (data.is_one_time ? `1-Uso (${cleanCode})` : cleanCode),
        severity: 'warning',
        localId,
      }).catch(() => {});

      return {
        valid: true,
        codeId: codeDoc.id,
        codeName: data.name || (data.is_one_time ? `Código 1 Uso (${cleanCode})` : 'Código Autorizado'),
        isOneTime: Boolean(data.is_one_time),
      };
    }

    const noPermMsg = 'El código ingresado no tiene permisos para autorizar esta operación.';
    return {
      valid: false,
      error: noPermMsg,
      errorMessage: noPermMsg,
    };
  } catch (err: any) {
    console.error('Error validando código de autorización:', err);
    const errMsg = 'Error al verificar el código. Intenta nuevamente.';
    return {
      valid: false,
      error: errMsg,
      errorMessage: errMsg,
    };
  }
}

/**
 * Genera un código aleatorio de 4 dígitos de un solo uso y lo guarda en `codigos_autorizacion`.
 */
export async function createOneTimeAuthCode(options: {
  db: Firestore;
  createdBy: string;
  purpose?: string;
  expirationMinutes?: number;
  expiresInMinutes?: number;
}): Promise<{ id: string; code: string; expiresAt: string }> {
  const {
    db,
    createdBy,
    purpose = 'Autorización general / Exención de anticipo',
    expirationMinutes,
    expiresInMinutes,
  } = options;
  const effectiveExpMinutes = expiresInMinutes ?? expirationMinutes ?? 30;

  // Generar 4 dígitos entre 1000 y 9999 que no colisionen con un código activo
  let generatedCode = String(Math.floor(1000 + Math.random() * 9000));
  try {
    const existingSnap = await getDocs(
      query(collection(db, 'codigos_autorizacion'), where('active', '==', true))
    );
    const activeCodes = new Set(existingSnap.docs.map((d) => String(d.data().code || '').trim()));
    let attempts = 0;
    while (activeCodes.has(generatedCode) && attempts < 20) {
      generatedCode = String(Math.floor(1000 + Math.random() * 9000));
      attempts++;
    }
  } catch (_) {}

  const now = new Date();
  const expiresAt = new Date(now.getTime() + effectiveExpMinutes * 60 * 1000);

  const docRef = await addDoc(collection(db, 'codigos_autorizacion'), {
    name: purpose.trim() || 'Código Temporal (1 Uso)',
    code: generatedCode,
    active: true,
    is_one_time: true,
    used: false,
    reserves: true,
    cashbox: true,
    download: true,
    invoiced_sales: true,
    created_at: Timestamp.fromDate(now),
    expires_at: Timestamp.fromDate(expiresAt),
    created_by: createdBy,
    purpose: purpose.trim() || 'Autorización de un solo uso',
  });

  await logAuditAction({
    action: 'Generación de Código de 1 Uso (4 Dígitos)',
    details: `Código temporal ${generatedCode} generado por ${createdBy}. Motivo: ${purpose}. Vigencia: ${effectiveExpMinutes} min.`,
    userId: createdBy,
    userName: createdBy,
    severity: 'info',
  }).catch(() => {});

  return {
    id: docRef.id,
    code: generatedCode,
    expiresAt: expiresAt.toISOString(),
  };
}
