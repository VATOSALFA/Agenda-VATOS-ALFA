'use server';

import { getAuth, getDb } from '@/lib/firebase-server';
import { allPermissions, initialRoles } from '@/lib/permissions';

export interface ServerResolvedUserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  role: string;
  permissions: string[];
  local_id?: string;
  avatarUrl?: string | null;
  audio_settings?: Record<string, any>;
}

export type ResolveAuthSessionResult =
  | { status: 'ok'; profile: ServerResolvedUserProfile }
  | { status: 'access_denied'; email: string | null }
  | { status: 'outside_hours' }
  | { status: 'invalid_token'; message: string };

function checkBranchScheduleMexico(schedule: Record<string, any> | undefined): boolean {
  if (!schedule) return true;

  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const weekdayEn = parts.find(p => p.type === 'weekday')?.value || '';
  const hourStr = parts.find(p => p.type === 'hour')?.value || '12';
  const minuteStr = parts.find(p => p.type === 'minute')?.value || '0';

  const dayMap: Record<string, string> = {
    Sun: 'domingo',
    Mon: 'lunes',
    Tue: 'martes',
    Wed: 'miercoles',
    Thu: 'jueves',
    Fri: 'viernes',
    Sat: 'sabado',
  };

  const currentDay = dayMap[weekdayEn] || 'lunes';
  const dayConfig = schedule[currentDay];
  if (!dayConfig || dayConfig.enabled === false) return false;

  const currentHour = Number(hourStr) % 24;
  const currentMinute = Number(minuteStr);
  const currentTimeInMins = currentHour * 60 + currentMinute;

  // Límite estricto 11:00 PM
  const hardEndLimitInMins = 23 * 60;
  if (currentTimeInMins > hardEndLimitInMins) {
    return false;
  }

  // Permitido desde 30 minutos antes de abrir
  const startTimeStr = dayConfig.start || '10:00';
  const [startH, startM] = String(startTimeStr).split(':').map(Number);
  const startTimeInMins = (startH || 0) * 60 + (startM || 0);
  const allowedStartInMins = startTimeInMins - 30;

  if (currentTimeInMins < allowedStartInMins) {
    return false;
  }

  return true;
}

/**
 * Resuelve de forma segura en el servidor el perfil, rol y permisos de un usuario autenticado
 * verificando criptográficamente su Firebase ID Token mediante Firebase Admin SDK.
 * Evita falsos errores de "Missing or insufficient permissions" cuando el canal WebChannel o
 * IndexedDB del cliente aún está propagando el token recién emitido tras signInWithPopup o al despertar la PWA.
 */
export async function resolveAuthenticatedUserAction(idToken: string): Promise<ResolveAuthSessionResult> {
  if (!idToken || typeof idToken !== 'string' || idToken.trim().length < 20) {
    return { status: 'invalid_token', message: 'Token ausente o inválido.' };
  }

  const adminAuth = getAuth();
  const db = getDb();

  let decoded: { uid: string; email?: string; name?: string; picture?: string };
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch (err: any) {
    return { status: 'invalid_token', message: err?.message || 'Token expirado o inválido.' };
  }

  const uid = decoded.uid;
  const authEmail = decoded.email || null;
  const normalizedEmail = authEmail ? authEmail.toLowerCase().trim() : '';

  let customData: Record<string, any> | null = null;
  let userRole = 'Staff (Sin edición)';

  // 1. Buscar en 'usuarios' por UID
  const userByUidSnap = await db.collection('usuarios').doc(uid).get();
  if (userByUidSnap.exists) {
    customData = userByUidSnap.data() || null;
    userRole = customData?.role || customData?.rol || 'Staff (Sin edición)';
  }

  // 1.5. Fallback en 'usuarios' por correo exacto o insensible a mayúsculas
  if (!customData && authEmail) {
    const exactSnap = await db.collection('usuarios').where('email', '==', authEmail).limit(1).get();
    if (!exactSnap.empty) {
      customData = exactSnap.docs[0].data();
      userRole = customData?.role || customData?.rol || 'Staff (Sin edición)';
    } else if (normalizedEmail) {
      const allUsersSnap = await db.collection('usuarios').get();
      const matched = allUsersSnap.docs.find(
        d => String(d.data()?.email || '').toLowerCase().trim() === normalizedEmail
      );
      if (matched) {
        customData = matched.data();
        userRole = customData?.role || customData?.rol || 'Staff (Sin edición)';
      }
    }
  }

  // 2. Fallback en 'profesionales' por UID o correo
  if (!customData) {
    const profByUidSnap = await db.collection('profesionales').doc(uid).get();
    if (profByUidSnap.exists) {
      customData = profByUidSnap.data() || null;
      userRole = 'Staff (Sin edición)';
    } else if (authEmail) {
      const exactProfSnap = await db.collection('profesionales').where('email', '==', authEmail).limit(1).get();
      if (!exactProfSnap.empty) {
        customData = exactProfSnap.docs[0].data();
        userRole = 'Staff (Sin edición)';
      } else if (normalizedEmail) {
        const allProsSnap = await db.collection('profesionales').get();
        const matchedPro = allProsSnap.docs.find(
          d => String(d.data()?.email || '').toLowerCase().trim() === normalizedEmail
        );
        if (matchedPro) {
          customData = matchedPro.data();
          userRole = 'Staff (Sin edición)';
        }
      }
    }
  }

  // 3. Usuario no registrado en la plataforma
  if (!customData) {
    return { status: 'access_denied', email: authEmail };
  }

  // 4. Resolver permisos según el rol
  let userPermissions: string[] = [];
  if (userRole === 'Administrador general') {
    userPermissions = allPermissions.map(p => p.key);
  } else {
    const roleId = userRole.toLowerCase().replace(/ /g, '_');
    const roleDoc = await db.collection('roles').doc(roleId).get();
    if (roleDoc.exists) {
      userPermissions = Array.isArray(roleDoc.data()?.permissions) ? roleDoc.data()!.permissions : [];
    } else {
      const initialRole = initialRoles.find(r => r.title === userRole);
      userPermissions = initialRole ? initialRole.permissions : [];
    }
  }

  // 5. Validar restricción horaria para Recepcionistas
  const localId = customData.local_id ? String(customData.local_id) : undefined;
  if (userRole === 'Recepcionista' && localId) {
    try {
      const localDoc = await db.collection('locales').doc(localId).get();
      if (localDoc.exists) {
        const withinHours = checkBranchScheduleMexico(localDoc.data()?.schedule);
        if (!withinHours) {
          return { status: 'outside_hours' };
        }
      }
    } catch (e) {
      console.error('Error checking branch schedule in server action:', e);
    }
  }

  let safeAudioSettings: Record<string, any> | undefined = undefined;
  if (customData.audio_settings && typeof customData.audio_settings === 'object') {
    try {
      safeAudioSettings = JSON.parse(JSON.stringify(customData.audio_settings));
    } catch {
      safeAudioSettings = undefined;
    }
  }

  return {
    status: 'ok',
    profile: {
      uid,
      displayName: customData.name || customData.nombre || decoded.name || null,
      email: customData.email || authEmail,
      role: userRole,
      permissions: userPermissions,
      local_id: localId,
      avatarUrl: customData.avatarUrl || decoded.picture || null,
      audio_settings: safeAudioSettings,
    },
  };
}
