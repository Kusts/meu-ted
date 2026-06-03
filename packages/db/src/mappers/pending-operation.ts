// ─────────────────────────────────────────────────────────────────────────────
// PendingOperation Mapper
// Maps between Drizzle DB rows and domain PendingOperation type
// ─────────────────────────────────────────────────────────────────────────────

import type { DraftPayload } from '@pi-financeiro/domain';
import type { pendingOperations } from '../schema/index.js';

export interface DbPendingOperation {
  id: string;
  householdId: string;
  chatId: string;
  userPhone: string;
  operationType: string;
  draftPayload: DraftPayload;
  missingFields: string[];
  confirmationLevel: number;
  idempotencyKey: string | null;
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired';
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export function fromDbPendingOperation(row: DbPendingOperation) {
  return {
    id: row.id,
    householdId: row.householdId,
    chatId: row.chatId,
    userPhone: row.userPhone,
    operationType: row.operationType as 'expense' | 'income' | 'transfer' | 'card_purchase',
    draftPayload: row.draftPayload as DraftPayload,
    missingFields: row.missingFields as string[],
    confirmationLevel: row.confirmationLevel,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

export function toDbPendingOperation(op: {
  id: string;
  householdId: string;
  chatId: string;
  userPhone: string;
  operationType: string;
  draftPayload: DraftPayload;
  missingFields: string[];
  confirmationLevel: number;
  idempotencyKey: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}): Omit<DbPendingOperation, never> {
  return {
    id: op.id,
    householdId: op.householdId,
    chatId: op.chatId,
    userPhone: op.userPhone,
    operationType: op.operationType,
    draftPayload: op.draftPayload,
    missingFields: op.missingFields,
    confirmationLevel: op.confirmationLevel,
    idempotencyKey: op.idempotencyKey,
    status: op.status as 'pending' | 'confirmed' | 'cancelled' | 'expired',
    createdAt: new Date(op.createdAt),
    updatedAt: new Date(op.updatedAt),
    expiresAt: new Date(op.expiresAt),
  };
}