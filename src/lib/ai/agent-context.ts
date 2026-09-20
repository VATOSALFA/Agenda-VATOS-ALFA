import { AsyncLocalStorage } from 'node:async_hooks';

export interface ChatExecutionContext {
  conversationId: string;
  clientPhone: string;
  clientName?: string;
  clientNotes?: string;
  clientId?: string;
  humanHandoffRequested?: boolean;
  simulation?: boolean;
  mutationAttempted?: boolean;
}

export const chatContextStorage = new AsyncLocalStorage<ChatExecutionContext>();
