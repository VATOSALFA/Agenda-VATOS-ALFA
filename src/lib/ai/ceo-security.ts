import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth, getDb } from '@/lib/firebase-server';

// Identificadores exclusivos e inmutables del Administrador General (Dueño)
const ALLOWED_GENERAL_ADMIN_UIDS = new Set<string>([
  'JxK6BLZPOBcBpjnuVZPsgmIHbZ12',
]);

const ALLOWED_GENERAL_ADMIN_EMAILS = new Set<string>([
  'vatosalfa@gmail.com',
]);

export interface VerifiedCeoAdmin {
  uid: string;
  email: string;
  name: string;
  role: string;
  localId?: string;
}

/**
 * Verificación Criptográfica en Servidor para JANET GERENCIA (Administrador Local / General).
 * Permite el acceso únicamente a Administradores Locales (ej. Beatriz) y al Administrador General.
 * Bloquea a recepcionistas, barberos o usuarios externos.
 */
export async function verifyBranchManagerAccess(idToken: string): Promise<VerifiedCeoAdmin> {
  if (!idToken || typeof idToken !== 'string' || idToken.trim().length < 20) {
    throw new Error('ACCESO DENEGADO: Token de autenticación ausente o inválido.');
  }

  const auth = getAuth();
  const db = getDb();

  let decodedToken;
  try {
    decodedToken = await auth.verifyIdToken(idToken, true);
  } catch (err: any) {
    throw new Error('ACCESO DENEGADO: Sesión expirada o firma criptográfica inválida.');
  }

  const uid = decodedToken.uid;
  const email = (decodedToken.email || '').toLowerCase().trim();

  const userDoc = await db.collection('usuarios').doc(uid).get();
  const userData = userDoc.exists ? userDoc.data() : null;
  const dbRole = String(userData?.rol || userData?.role || '').trim();

  const isGeneralOwner =
    ALLOWED_GENERAL_ADMIN_UIDS.has(uid) ||
    ALLOWED_GENERAL_ADMIN_EMAILS.has(email) ||
    dbRole === 'Administrador general';

  const isLocalManager = dbRole === 'Administrador local';

  if (!isGeneralOwner && !isLocalManager) {
    try {
      await db.collection('audit_logs').add({
        action: 'INTENTO_ACCESO_NO_AUTORIZADO_JANET_GERENCIA',
        details: `Intento bloqueado de acceso a Janet Gerencia por UID: ${uid} (${email || 'sin correo'}) con rol: ${dbRole || 'desconocido'}.`,
        userId: uid,
        userName: userData?.nombre || userData?.displayName || email || 'Desconocido',
        userRole: dbRole || 'No autorizado',
        severity: 'warning',
        timestamp: FieldValue.serverTimestamp(),
      });
    } catch (_) {}

    throw new Error('ACCESO DENEGADO (403): Janet Gerencia es exclusiva para Administración de Sucursal.');
  }

  return {
    uid,
    email,
    name: userData?.nombre || userData?.displayName || userData?.name || 'Administración de Sucursal',
    role: isGeneralOwner ? 'Administrador general' : 'Administrador local',
    localId: userData?.local_id || '',
  };
}

/**
 * CAPA 1: Verificación Criptográfica Zero-Trust en Servidor.
 * Ninguna petición a Janet CEO confía en parámetros enviados desde el cliente.
 * Exige un Firebase ID Token vivo, no revocado, que pertenezca exclusivamente
 * al Administrador General tanto en lista blanca como en base de datos.
 */
export async function verifyGeneralAdminAccess(idToken: string): Promise<VerifiedCeoAdmin> {
  if (!idToken || typeof idToken !== 'string' || idToken.trim().length < 20) {
    throw new Error('ACCESO DENEGADO: Token de autenticación ausente o inválido.');
  }

  const auth = getAuth();
  const db = getDb();

  let decodedToken;
  try {
    // checkRevoked = true garantiza que sesiones cerradas o revocadas sean rechazadas al instante
    decodedToken = await auth.verifyIdToken(idToken, true);
  } catch (err: any) {
    throw new Error('ACCESO DENEGADO: Sesión expirada o firma criptográfica inválida.');
  }

  const uid = decodedToken.uid;
  const email = (decodedToken.email || '').toLowerCase().trim();

  const isAllowlisted =
    ALLOWED_GENERAL_ADMIN_UIDS.has(uid) ||
    ALLOWED_GENERAL_ADMIN_EMAILS.has(email);

  // Consultar el documento real en servidor dentro de 'usuarios'
  const userDoc = await db.collection('usuarios').doc(uid).get();
  const userData = userDoc.exists ? userDoc.data() : null;
  const dbRole = String(userData?.rol || userData?.role || '').trim();

  if (!isAllowlisted || dbRole !== 'Administrador general') {
    // Registrar intento de intrusión de forma inmutable
    try {
      await db.collection('audit_logs').add({
        action: 'INTENTO_ACCESO_NO_AUTORIZADO_JANET_CEO',
        details: `Intento bloqueado de acceso a Janet CEO por UID: ${uid} (${email || 'sin correo'}) con rol: ${dbRole || 'desconocido'}.`,
        userId: uid,
        userName: userData?.nombre || userData?.displayName || email || 'Desconocido',
        userRole: dbRole || 'No autorizado',
        severity: 'critical',
        timestamp: FieldValue.serverTimestamp(),
      });

      await db.collection('ceo_alertas').add({
        tipo: 'seguridad_critica',
        titulo: 'Intento de acceso bloqueado a Janet CEO',
        descripcion: `El usuario ${userData?.nombre || email || uid} (${dbRole || 'Sin rol'}) intentó invocar a Janet CEO y fue bloqueado por el escudo criptográfico.`,
        leida: false,
        creado_en: FieldValue.serverTimestamp(),
      });
    } catch (_) {
      // No interrumpir el rechazo por fallo de log
    }

    throw new Error('ACCESO DENEGADO (403): Janet CEO es exclusiva para el Administrador General.');
  }

  return {
    uid,
    email,
    name: userData?.nombre || userData?.displayName || userData?.name || 'José Alejandro Pacheco Bárcenas',
    role: 'Administrador general',
  };
}

/**
 * CAPA 4: Sanitización y Aislamiento contra Indirect Prompt Injection.
 * Limpia cualquier texto escrito por terceros (clientes en WhatsApp, quejas en la App,
 * notas de recepcionistas o motivos de cancelación) para que jamás pueda inyectar
 * comandos ni alterar el comportamiento de Janet CEO.
 */
export function sanitizeExternalUntrustedText(raw: any, maxLength: number = 350): string {
  if (raw === null || raw === undefined) return '';
  let text = String(raw).trim();
  if (!text) return '';

  // Eliminar etiquetas XML/HTML o delimitadores de sistema falsos
  text = text.replace(/<\/?[a-zA-Z0-9_-]+[^>]*>/g, ' ');

  // Neutralizar frases típicas de Prompt Injection en español e inglés
  const injectionPatterns = [
    /ignora\s+(todas\s+)?(tus\s+|las\s+)?instrucciones/gi,
    /olvida\s+(todas\s+)?(tus\s+|las\s+)?instrucciones/gi,
    /ignore\s+(all\s+)?(previous\s+|prior\s+)?instructions/gi,
    /disregard\s+(all\s+)?(previous\s+|prior\s+)?instructions/gi,
    /system\s*prompt/gi,
    /nuevas\s+instrucciones\s+del\s+sistema/gi,
    /ejecuta\s+la\s+herramienta/gi,
    /actúa\s+como\s+administrador/gi,
  ];

  for (const pattern of injectionPatterns) {
    text = text.replace(pattern, '[TEXTO_EXTERNO_FILTRADO]');
  }

  if (text.length > maxLength) {
    text = text.slice(0, maxLength) + '...';
  }

  return text;
}

/**
 * CAPA 3: Verificación de PIN Maestro de Dirección para Poderes Ejecutivos (Escritura).
 * Incluye protección contra fuerza bruta (bloqueo temporal tras 3 intentos fallidos).
 */
function hashPin(pin: string, salt: string): string {
  return crypto.createHash('sha256').update(`${salt}:${pin.trim()}`).digest('hex');
}

export async function verifyMasterExecutivePin(uid: string, pinInput: string): Promise<{ valid: boolean; message?: string }> {
  const cleanPin = String(pinInput || '').trim();
  if (!cleanPin || cleanPin.length < 4) {
    return { valid: false, message: 'Ingresa un PIN o código de autorización válido (mínimo 4 dígitos).' };
  }

  const db = getDb();
  const secRef = db.collection('ceo_config').doc('security');
  const secDoc = await secRef.get();
  const nowMs = Date.now();

  if (secDoc.exists) {
    const data = secDoc.data() || {};
    const lockedUntilMs = Number(data.lockedUntilMs || 0);
    if (lockedUntilMs > nowMs) {
      const minsLeft = Math.ceil((lockedUntilMs - nowMs) / 60000);
      return {
        valid: false,
        message: `Ejecución bloqueada por seguridad tras intentos fallidos. Intenta de nuevo en ${minsLeft} min.`,
      };
    }

    if (data.pinHash && data.pinSalt) {
      const candidateHash = hashPin(cleanPin, data.pinSalt);
      if (candidateHash === data.pinHash) {
        await secRef.set({ failedAttempts: 0, lockedUntilMs: 0, lastVerifiedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { valid: true };
      } else {
        const failed = Number(data.failedAttempts || 0) + 1;
        const lockMs = failed >= 3 ? nowMs + 15 * 60 * 1000 : 0;
        await secRef.set({ failedAttempts: failed, lockedUntilMs: lockMs }, { merge: true });
        return {
          valid: false,
          message: failed >= 3
            ? 'PIN Maestro incorrecto. Por seguridad se bloquearon las acciones ejecutivas por 15 minutos.'
            : `PIN Maestro incorrecto (intento ${failed} de 3).`,
        };
      }
    }
  }

  // Si aún no se ha personalizado un PIN Maestro exclusivo en ceo_config/security,
  // validar contra un código de autorización activo de dirección en 'codigos_autorizacion'
  const codesSnap = await db
    .collection('codigos_autorizacion')
    .where('code', '==', cleanPin)
    .where('active', '==', true)
    .get();

  if (!codesSnap.empty) {
    return { valid: true };
  }

  return { valid: false, message: 'Código de autorización o PIN Maestro inválido.' };
}

export async function configureMasterExecutivePin(uid: string, newPin: string): Promise<{ success: boolean; message: string }> {
  const cleanPin = String(newPin || '').trim();
  if (!/^\d{4,8}$/.test(cleanPin)) {
    return { success: false, message: 'El PIN Maestro debe contener entre 4 y 8 dígitos numéricos.' };
  }

  const db = getDb();
  const salt = crypto.randomBytes(16).toString('hex');
  const pinHash = hashPin(cleanPin, salt);

  await db.collection('ceo_config').doc('security').set(
    {
      pinHash,
      pinSalt: salt,
      failedAttempts: 0,
      lockedUntilMs: 0,
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { success: true, message: 'PIN Maestro de Dirección configurado y cifrado con éxito.' };
}
