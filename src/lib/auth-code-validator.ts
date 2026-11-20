import type { Firestore } from 'firebase/firestore';
import {
  createOneTimeAuthCodeServer,
  validateAndConsumeAuthCodeServer,
  type AuthPermissionModule as ServerAuthPermissionModule,
} from '@/lib/actions/auth-code-actions';

export type AuthPermissionModule = ServerAuthPermissionModule;

export interface ValidateAuthCodeOptions {
  db?: Firestore;
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
  codeDocId?: string;
  codeName?: string;
  isOneTime?: boolean;
}

export const WEAK_BLOCKED_AUTH_CODES = new Set<string>([
  '1234',
  '4321',
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
  '1212',
  '0123',
  '12345',
  '123456',
]);

/**
 * Delega la validación y consumo atómico de códigos de autorización al servidor,
 * evitando exposición o manipulación directa de `codigos_autorizacion` en cliente.
 */
export async function validateAndConsumeAuthCode(
  options: ValidateAuthCodeOptions
): Promise<ValidateAuthCodeResult> {
  const { db: _ignoredDb, ...serializableOptions } = options;
  return await validateAndConsumeAuthCodeServer(serializableOptions);
}

export async function createOneTimeAuthCode(options: {
  db?: Firestore;
  createdBy: string;
  purpose?: string;
  expirationMinutes?: number;
  expiresInMinutes?: number;
}): Promise<{ id: string; code: string; expiresAt: string }> {
  const { db: _ignoredDb, ...serializableOptions } = options;
  return await createOneTimeAuthCodeServer(serializableOptions);
}
