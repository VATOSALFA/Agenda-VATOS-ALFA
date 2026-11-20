'use server';

import crypto from 'node:crypto';
import { checkRateLimit, verifyStaffAccess } from '@/lib/server-auth';

const SERVER_BENEFIT_SIGN_SALT =
  process.env.VATOS_BENEFIT_SIGN_SALT ||
  'VA_SECURE_TOKEN_SALT_2026_VATOS_ALFA_SECURITY_KEY';

function timingSafeStrEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export async function verifyBenefitSignatureServer(
  clientId: string,
  folio: string,
  benefitId: string,
  year: number,
  signature?: string,
  fallbackBenefitId?: string
): Promise<boolean> {
  const staff = await verifyStaffAccess();
  const rl = checkRateLimit(`qr_verify:${staff.uid}`, 60, 60_000);
  if (!rl.allowed) {
    throw new Error(`Demasiadas verificaciones de QR. Espera ${rl.retryAfterSec}s.`);
  }

  const normalizedSig = String(signature || '').trim().toUpperCase();
  if (!normalizedSig) return false;

  const candidates = Array.from(
    new Set(
      [
        benefitId,
        fallbackBenefitId,
        'regalo_cumpleanos',
        'decimo_corte',
        'juntos_es_mejor',
        'invita_amigo',
        'beneficio_alfa',
      ].filter(Boolean)
    )
  ) as string[];

  for (const candidateId of candidates) {
    const rawString = `${clientId}:${folio}:${candidateId}:${year}:${SERVER_BENEFIT_SIGN_SALT}`;

    // 1. Formato estándar SHA-256 (16 hex chars en mayúscula)
    const expectedShaToken = crypto
      .createHash('sha256')
      .update(rawString)
      .digest('hex')
      .toUpperCase()
      .slice(0, 16);
    if (timingSafeStrEqual(expectedShaToken, normalizedSig)) {
      return true;
    }

    // 2. Fallback determinista compatible con Hermes en App Móvil (8 hex chars en mayúscula)
    let hash = 0;
    for (let i = 0; i < rawString.length; i++) {
      hash = (hash << 5) - hash + rawString.charCodeAt(i);
      hash |= 0;
    }
    const fallbackToken = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
    if (timingSafeStrEqual(fallbackToken, normalizedSig)) {
      return true;
    }
  }

  return false;
}
