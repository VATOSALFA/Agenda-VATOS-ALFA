import type { Client } from "./types";
import { Timestamp } from "firebase/firestore";
import { formatDistanceToNow, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Determina con alta precisión si un cliente tiene y usa la aplicación móvil VATOS ALFA.
 * Detecta:
 * - Flag de app vinculada / instalada
 * - Registro de último acceso a la app
 * - UID de autenticación Firebase Auth generado en la app móvil
 * - Origen de registro 'app_movil' o 'app_store_reviewer'
 * - Tokens push / FCM o fecha de registro en app
 * - Historial de reservas originadas desde la app móvil
 */
export function isClientWithApp(
  client: Client | null | undefined,
  appReservationClientIds?: Set<string>
): boolean {
  if (!client) return false;

  if (client.appVinculada === true || client.appInstalada === true) {
    return true;
  }

  if (client.ultimoAccesoApp) {
    return true;
  }

  if (client.authUid && client.authUid.trim().length > 0) {
    return true;
  }

  const origen = String(client.origen || '').toLowerCase();
  if (origen.includes('app_movil') || origen.includes('app_store_reviewer') || origen.includes('app vatos alfa')) {
    return true;
  }

  if (client.fecha_registro_app || (client as any).correo_app || (client as any).fcmToken) {
    return true;
  }

  if (appReservationClientIds && appReservationClientIds.has(client.id)) {
    return true;
  }

  return false;
}

/**
 * Obtiene la fecha exacta del último acceso registrado a la aplicación móvil.
 */
export function getClientLastAppAccess(client: Client | null | undefined): Date | null {
  if (!client || !client.ultimoAccesoApp) return null;
  const raw = client.ultimoAccesoApp;

  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (raw instanceof Timestamp) return raw.toDate();
  if (raw && typeof raw === 'object' && typeof raw.seconds === 'number') {
    return new Date(raw.seconds * 1000);
  }
  if (typeof raw === 'string') {
    const parsed = parseISO(raw);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof raw === 'number') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Comprueba si el cliente ha ingresado o usado la app en los últimos N días (por defecto 30).
 */
export function isClientActiveInApp(
  client: Client | null | undefined,
  daysThreshold: number = 30,
  appReservationClientIds?: Set<string>
): boolean {
  if (!isClientWithApp(client, appReservationClientIds)) return false;

  const lastAccess = getClientLastAppAccess(client);
  if (!lastAccess) {
    // Si no tiene fecha de último acceso pero se registró recientemente como app_movil
    if (client?.creado_en) {
      let created: Date | null = null;
      if (client.creado_en instanceof Timestamp) created = client.creado_en.toDate();
      else if ((client.creado_en as any)?.seconds) created = new Date((client.creado_en as any).seconds * 1000);
      if (created) {
        const diffMs = Date.now() - created.getTime();
        return diffMs <= daysThreshold * 24 * 60 * 60 * 1000;
      }
    }
    return false;
  }

  const diffMs = Date.now() - lastAccess.getTime();
  return diffMs <= daysThreshold * 24 * 60 * 60 * 1000;
}

/**
 * Devuelve un resumen formateado del estado de la aplicación del cliente.
 */
export function getClientAppInfo(
  client: Client | null | undefined,
  appReservationClientIds?: Set<string>
) {
  const hasApp = isClientWithApp(client, appReservationClientIds);
  const lastAccess = getClientLastAppAccess(client);

  let lastAccessFormatted = 'Sin accesos registrados';
  let relativeTime = '';
  if (lastAccess) {
    try {
      lastAccessFormatted = format(lastAccess, "d 'de' MMMM yyyy, HH:mm 'hrs'", { locale: es });
      relativeTime = formatDistanceToNow(lastAccess, { addSuffix: true, locale: es });
    } catch {
      lastAccessFormatted = 'Fecha no disponible';
    }
  }

  let platformName = 'App Móvil';
  const rawPlat = String(client?.plataformaApp || '').toLowerCase();
  if (rawPlat.includes('android')) platformName = 'Android';
  else if (rawPlat.includes('ios')) platformName = 'iOS (iPhone)';
  else if (rawPlat.includes('web')) platformName = 'PWA / Web';

  return {
    hasApp,
    lastAccess,
    lastAccessFormatted,
    relativeTime,
    platformName,
    alfaCoins: Number(
      client?.alfaCoins ??
      (client as any)?.alfa_coins ??
      client?.puntosLealtad ??
      (client as any)?.puntos_lealtad ??
      client?.puntos ??
      0
    ),
  };
}
