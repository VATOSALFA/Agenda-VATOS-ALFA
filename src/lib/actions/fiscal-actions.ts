'use server';

import { verifyStaffAccess } from '@/lib/server-auth';
import {
  OFFICIAL_SAT_DECLARATIONS_2026,
  type DeclaracionFiscalData,
} from '@/lib/data/official-sat-declarations';

export async function getOfficialSatDeclarationsAction(): Promise<
  Record<string, DeclaracionFiscalData>
> {
  await verifyStaffAccess(undefined, { requireAdmin: true });
  return OFFICIAL_SAT_DECLARATIONS_2026;
}
