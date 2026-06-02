// ─────────────────────────────────────────────────────────────────────────────
// PendingOperation - Entity and Types
// Supports multi-step financial operations pending user confirmation
// ─────────────────────────────────────────────────────────────────────────────

export type OperationType = 'expense' | 'income' | 'transfer' | 'card_purchase';
export type OperationStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired';
export type TargetType = 'payable_bill' | 'account_debit' | 'card_charge';
export type RecurrencePeriod = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export interface DraftPayload {
  // Common fields
  amountCents?: number;
  description?: string;
  date?: string;
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  categoryId?: string;
  cardId?: string;
  installmentsCount?: number;
  firstDate?: string;

  // Recurrence specific
  period?: RecurrencePeriod;
  targetType?: TargetType;

  // For pending field collection
  [key: string]: unknown;
}

export interface PendingOperation {
  id: string;
  householdId: string;
  chatId: string;
  userPhone: string;
  operationType: OperationType;
  draftPayload: DraftPayload;
  missingFields: string[];
  confirmationLevel: number; // 0=novo, 1=confirmação simples, 2=valor alto
  idempotencyKey: string | null;
  status: OperationStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreatePendingOperationInput {
  householdId: string;
  chatId: string;
  userPhone: string;
  operationType: OperationType;
  draftPayload: DraftPayload;
  idempotencyKey?: string;
}

export interface AppendFieldInput {
  field: string;
  value: unknown;
}

export interface FindPendingByChatInput {
  householdId: string;
  chatId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface IPendingOperationRepository {
  create(operation: PendingOperation): Promise<PendingOperation>;
  findById(id: string): Promise<PendingOperation | null>;
  update(id: string, updates: Partial<PendingOperation>): Promise<PendingOperation | null>;
  delete(id: string): Promise<boolean>;
  findByChat(householdId: string, chatId: string): Promise<PendingOperation | null>;
  findExpiredBefore(before: string): Promise<PendingOperation[]>;
  findByIdempotencyKey(householdId: string, key: string): Promise<PendingOperation | null>;
}