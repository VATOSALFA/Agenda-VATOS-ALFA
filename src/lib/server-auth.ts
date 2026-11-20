import { cookies, headers } from 'next/headers';
import { getAuth, getDb } from '@/lib/firebase-server';

export const STAFF_AUTH_COOKIE = 'va_staff_token';

export const GENERAL_ADMIN_UIDS = new Set<string>(['JxK6BLZPOBcBpjnuVZPsgmIHbZ12']);
export const GENERAL_ADMIN_EMAILS = new Set<string>(['vatosalfa@gmail.com']);

export interface VerifiedStaffContext {
  uid: string;
  email: string | null;
  name: string;
  role: string;
  isGeneralAdmin: boolean;
  isAdmin: boolean;
  localId?: string;
}

/**
 * Escapa caracteres HTML especiales para prevenir XSS e inyección HTML en plantillas y vistas.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Rate limiter en memoria por clave (IP, conversación o UID) para endpoints públicos y PINs.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();

  if (rateLimitStore.size > 2000) {
    for (const [k, entry] of rateLimitStore.entries()) {
      if (entry.resetAt <= now) {
        rateLimitStore.delete(k);
      }
    }
  }

  const existing = rateLimitStore.get(key);
  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

/**
 * Obtiene la IP del solicitante desde los encabezados HTTP de Next.js.
 */
export async function getRequestIp(): Promise<string> {
  try {
    const hdrs = await headers();
    const forwarded = hdrs.get('x-forwarded-for');
    if (forwarded) {
      const first = forwarded.split(',')[0]?.trim();
      if (first) return first;
    }
    const realIp = hdrs.get('x-real-ip')?.trim();
    if (realIp) return realIp;
  } catch {
    // Contexto sin headers (ej. scripts o pruebas unitarias)
  }
  return 'unknown';
}

async function resolveBearerOrCookieToken(explicitIdToken?: string | null): Promise<string | null> {
  if (explicitIdToken && typeof explicitIdToken === 'string' && explicitIdToken.trim().length >= 20) {
    return explicitIdToken.trim();
  }

  try {
    const hdrs = await headers();
    const authHeader = hdrs.get('authorization') || hdrs.get('Authorization') || '';
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token.length >= 20) return token;
    }
  } catch {
    // Ignore when headers() is unavailable
  }

  try {
    const cookieStore = await cookies();
    const cookieToken = cookieStore.get(STAFF_AUTH_COOKIE)?.value;
    if (cookieToken && cookieToken.trim().length >= 20) {
      return cookieToken.trim();
    }
  } catch {
    // Ignore when cookies() is unavailable
  }

  return null;
}

/**
 * Verifica criptográficamente el token Firebase del solicitante y valida su rol real contra Firestore.
 */
export async function verifyStaffAccess(
  explicitIdToken?: string | null,
  options?: { requireAdmin?: boolean; requireGeneralAdmin?: boolean }
): Promise<VerifiedStaffContext> {
  const token = await resolveBearerOrCookieToken(explicitIdToken);
  if (!token) {
    throw new Error('Acceso denegado: sesión no autenticada.');
  }

  const auth = getAuth();
  const db = getDb();

  const decoded = await auth.verifyIdToken(token, true);
  if (
    decoded.firebase?.sign_in_provider === 'anonymous' ||
    decoded.email?.toLowerCase() === 'app_client_sync@vatosalfa.com'
  ) {
    throw new Error('Acceso denegado: sesión sin privilegios de personal.');
  }

  const emailLower = decoded.email ? decoded.email.toLowerCase().trim() : '';
  const isHardcodedGeneralAdmin =
    GENERAL_ADMIN_UIDS.has(decoded.uid) ||
    (Boolean(emailLower) && GENERAL_ADMIN_EMAILS.has(emailLower));

  let staffData: Record<string, any> | null = null;
  let staffDocExists = false;
  let fromProfesionales = false;

  const userByUid = await db.collection('usuarios').doc(decoded.uid).get();
  if (userByUid.exists) {
    staffDocExists = true;
    staffData = userByUid.data() || null;
  } else if (decoded.email) {
    const byExactEmail = await db
      .collection('usuarios')
      .where('email', '==', decoded.email)
      .limit(1)
      .get();
    if (!byExactEmail.empty) {
      staffDocExists = true;
      staffData = byExactEmail.docs[0].data() || null;
    } else if (emailLower && emailLower !== decoded.email) {
      const byLowerEmail = await db
        .collection('usuarios')
        .where('email', '==', emailLower)
        .limit(1)
        .get();
      if (!byLowerEmail.empty) {
        staffDocExists = true;
        staffData = byLowerEmail.docs[0].data() || null;
      }
    }
  }

  if (!staffDocExists) {
    const profByUid = await db.collection('profesionales').doc(decoded.uid).get();
    if (profByUid.exists) {
      staffDocExists = true;
      fromProfesionales = true;
      staffData = profByUid.data() || null;
    } else if (decoded.email) {
      const profByEmail = await db
        .collection('profesionales')
        .where('email', '==', decoded.email)
        .limit(1)
        .get();
      if (!profByEmail.empty) {
        staffDocExists = true;
        fromProfesionales = true;
        staffData = profByEmail.docs[0].data() || null;
      } else if (emailLower && emailLower !== decoded.email) {
        const profByLower = await db
          .collection('profesionales')
          .where('email', '==', emailLower)
          .limit(1)
          .get();
        if (!profByLower.empty) {
          staffDocExists = true;
          fromProfesionales = true;
          staffData = profByLower.docs[0].data() || null;
        }
      }
    }
  }

  if (!isHardcodedGeneralAdmin && !staffDocExists) {
    throw new Error('Acceso denegado: usuario sin permisos de personal.');
  }

  if (staffData?.status === 'inactive') {
    throw new Error('Acceso denegado: cuenta de personal inactiva.');
  }

  const role = isHardcodedGeneralAdmin
    ? 'Administrador general'
    : fromProfesionales
      ? 'Staff (Sin edición)'
      : String(staffData?.role || staffData?.rol || 'Staff (Sin edición)');

  const roleLower = role.toLowerCase().trim();
  const isGeneralAdmin = isHardcodedGeneralAdmin || roleLower === 'administrador general';
  const isAdmin =
    isGeneralAdmin || roleLower === 'administrador local' || roleLower === 'admin';

  if (options?.requireGeneralAdmin && !isGeneralAdmin) {
    throw new Error('Acceso denegado: se requiere Administrador General.');
  }

  if (options?.requireAdmin && !isAdmin) {
    throw new Error('Acceso denegado: se requieren permisos de Administrador.');
  }

  return {
    uid: decoded.uid,
    email: decoded.email || staffData?.email || null,
    name: String(staffData?.name || staffData?.nombre || decoded.name || 'Staff'),
    role,
    isGeneralAdmin,
    isAdmin,
    localId: staffData?.local_id ? String(staffData.local_id) : undefined,
  };
}
