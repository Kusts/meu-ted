// ─────────────────────────────────────────────────────────────────────────────
// PendingOperation Mapper
// Maps between Drizzle DB rows and domain PendingOperation type
// Drizzle JSONB columns return `unknown` — this module handles the conversion
// ─────────────────────────────────────────────────────────────────────────────

import type { DraftPayload } from '@pi-financeiro/domain';

interface DbRow {
  id: string;
  householdId: string;
  chatId: string;
  userPhone: string;
  operationType: string;
  draftPayload: unknown;
  missingFields: unknown;
  confirmationLevel: number;
  idempotencyKey: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface DomainPendingOperation {
  id: string;
  householdId: string;
  chatId: string;
  userPhone: string;
  operationType: 'expense' | 'income' | 'transfer' | 'card_purchase';
  draftPayload: DraftPayload;
  missingFields: string[];
  confirmationLevel: number;
  idempotencyKey: string | null;
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired';
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

function safeJsonParse<T>(val: unknown, fallback: T): T {
  if (typeof val === 'object' && val !== null) return val as T;
  if (typeof val === 'string') {
    try { return JSON.parse(val) as T; }
    catch { return fallback; }
  }
  return fallback;
}

function toStringArray(val: unknown): string[] {
  return safeJsonParse(val, []);
}

export function fromDbPendingOperation(row: DbRow): DomainPendingOperation {
  return {
    id: row.id,
    householdId: row.householdId,
    chatId: row.chatId,
    userPhone: row.userPhone,
    operationType: row.operationType as DomainPendingOperation['operationType'],
    draftPayload: safeJsonParse(row.draftPayload, {}),
    missingFields: toStringArray(row.missingFields),
    confirmationLevel: row.confirmationLevel,
    idempotencyKey: row.idempotencyKey,
    status: row.status as DomainPendingOperation['status'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

export interface DbInsertRow {
  id: string;
  householdId: string;
  chatId: string;
  userPhone: string;
  operationType: string;
  draftPayload: unknown;
  missingFields: unknown;
  confirmationLevel: number;
  idempotencyKey: string | null;
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired';
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export function toDbPendingOperation(op: DomainPendingOperation): DbInsertRow {
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
    status: op.status,
    createdAt: new Date(op.createdAt),
    updatedAt: new Date(op.updatedAt),
    expiresAt: new Date(op.expiresAt),
  };
}