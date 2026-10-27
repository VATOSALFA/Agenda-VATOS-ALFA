import { AsyncLocalStorage } from 'node:async_hooks';

export interface ChatExecutionContext {
  conversationId: string;
  clientPhone: string;
  clientName?: string;
  clientEmail?: string;
  clientNotes?: string;
  clientId?: string;
  humanHandoffRequested?: boolean;
  simulation?: boolean;
  mutationAttempted?: boolean;
  alreadyOfferedUpsellToday?: boolean;
  userMessage?: string;
  recentHistory?: string;
}

export const chatContextStorage = new AsyncLocalStorage<ChatExecutionContext>();
