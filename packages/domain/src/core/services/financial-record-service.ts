import type { IAccountRepository } from '../repositories/account-repository.js';
import type { IFinancialRecordRepository } from '../repositories/financial-record-repository.js';
import type { ILedgerRepository } from '../repositories/ledger-repository.js';
import type { IAuditLogRepository } from '../repositories/audit-log-repository.js';
import type { IIdempotencyRepository } from '../repositories/idempotency-repository.js';
import type { FinancialRecord } from '../entities/financial-record.js';
import type { AutoCategorizationService } from './auto-categorization-service.js';
import type { ReviewService } from './review-service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Service Result Types - TED anti-lie pattern (REQ-005)
// ─────────────────────────────────────────────────────────────────────────────

export interface ServiceResult<T = FinancialRecord> {
  success: boolean;
  record?: T;
  reason?: string;
  needsReview?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateExpenseInput {
  householdId: string;
  accountId: string;
  amountCents: number;
  description: string;
  date: string;
  categoryId?: string;
  source: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
  idempotencyKey?: string;
  sourceMessageId?: string;
}

export interface CreateIncomeInput {
  householdId: string;
  accountId: string;
  amountCents: number;
  description: string;
  date: string;
  categoryId?: string;
  source: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
  idempotencyKey?: string;
}

export interface CreateTransferInput {
  householdId: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  description: string;
  date: string;
  source: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
  idempotencyKey?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Financial Record Service
// ─────────────────────────────────────────────────────────────────────────────

export class FinancialRecordService {
  private readonly DEFAULT_HIGH_VALUE_THRESHOLD = 50000; // R$500 in cents

  constructor(private deps: {
    accountRepository: IAccountRepository;
    recordRepository: IFinancialRecordRepository;
    ledgerRepository: ILedgerRepository;
    auditRepository: IAuditLogRepository;
    idempotencyRepository: IIdempotencyRepository;
    autoCategorizationService?: AutoCategorizationService;
    reviewService?: ReviewService;
    highValueThresholdCents?: number;
  }) {}

  private get highValueThreshold(): number {
    return this.deps.highValueThresholdCents ?? this.DEFAULT_HIGH_VALUE_THRESHOLD;
  }

  private isHighValue(amountCents: number): boolean {
    return amountCents > this.highValueThreshold;
  }

  private async submitForHighValueReview(
    householdId: string,
    recordId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (this.deps.reviewService) {
      await this.deps.reviewService.submitForReview({
        householdId,
        recordId,
        reason: 'high_value',
        payload,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Create Expense
  // ─────────────────────────────────────────────────────────────────────────

  async createExpense(input: CreateExpenseInput): Promise<ServiceResult> {
    // Validate account exists and belongs to household
    const account = await this.deps.accountRepository.findById(input.accountId);
    if (!account) {
      return { success: false, reason: 'Conta não encontrada' };
    }
    if (account.householdId !== input.householdId) {
      return { success: false, reason: 'Conta pertence a household diferente' };
    }

    // Check idempotency key first (REQ-032)
    if (input.idempotencyKey) {
      await this.deps.idempotencyRepository.create({
        id: `${input.idempotencyKey}:expense`,
        householdId: input.householdId,
        key: input.idempotencyKey,
        scope: 'expense',
        createdAt: new Date().toISOString(),
        expiresAt: null,
      });
      
      const existingRecord = await this.deps.recordRepository.findByIdempotencyKey(
        input.householdId,
        input.idempotencyKey
      );
      if (existingRecord) {
        return { success: true, record: existingRecord };
      }
    }

    // Check for duplicate candidate (REQ-006)
    const duplicate = await this.deps.recordRepository.findDuplicateCandidate(
      input.householdId,
      input.accountId,
      input.amountCents,
      input.description,
      5
    );
    if (duplicate) {
      const record = await this.createRecord({
        ...input,
        type: 'expense',
        status: 'review',
      });
      return { 
        success: true, 
        record, 
        needsReview: true,
        reason: 'Duplicidade detectada - requer revisao manual' 
      };
    }

    // Check high-value threshold - only applies when reviewService is available
    if (this.deps.reviewService && this.isHighValue(input.amountCents)) {
      const record = await this.createRecord({
        ...input,
        type: 'expense',
        status: 'review',
      });
      await this.submitForHighValueReview(input.householdId, record.id, {
        amountCents: input.amountCents,
        description: input.description,
        accountId: input.accountId,
      });
      return {
        success: true,
        record,
        needsReview: true,
        reason: `Valor alto (R$${(input.amountCents / 100).toFixed(2)}) - requer revisao manual`,
      };
    }

    // Auto-categorize if no categoryId provided
    let categoryId = input.categoryId;
    if (!categoryId && this.deps.autoCategorizationService) {
      const autoCategoryId = await this.deps.autoCategorizationService.categorize(
        input.householdId,
        input.description
      );
      if (autoCategoryId) {
        categoryId = autoCategoryId;
      }
    }

    // Create the record
    const record = await this.createRecord({
      ...input,
      type: 'expense',
      status: 'posted',
      categoryId,
    });

    // Create ledger debit entry (REQ-033)
    await this.createLedgerEntry({
      householdId: input.householdId,
      recordId: record.id,
      accountId: input.accountId,
      direction: 'debit',
      amountCents: input.amountCents,
      effectiveDate: input.date,
      entryType: 'cash',
    });

    // Create audit log (REQ-025)
    await this.createAuditLog({
      householdId: input.householdId,
      action: 'create',
      entityType: 'financial_record',
      entityId: record.id,
      afterJson: record as unknown as Record<string, unknown>,
      source: input.source,
    });

    return { success: true, record };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Create Income
  // ─────────────────────────────────────────────────────────────────────────

  async createIncome(input: CreateIncomeInput): Promise<ServiceResult> {
    // Validate account
    const account = await this.deps.accountRepository.findById(input.accountId);
    if (!account) {
      return { success: false, reason: 'Conta não encontrada' };
    }
    if (account.householdId !== input.householdId) {
      return { success: false, reason: 'Conta pertence a household diferente' };
    }

    // Check idempotency
    if (input.idempotencyKey) {
      await this.deps.idempotencyRepository.create({
        id: `${input.idempotencyKey}:income`,
        householdId: input.householdId,
        key: input.idempotencyKey,
        scope: 'income',
        createdAt: new Date().toISOString(),
        expiresAt: null,
      });
      
      const existingRecord = await this.deps.recordRepository.findByIdempotencyKey(
        input.householdId,
        input.idempotencyKey
      );
      if (existingRecord) {
        return { success: true, record: existingRecord };
      }
    }

    // Check high-value threshold - only applies when reviewService is available
    if (this.deps.reviewService && this.isHighValue(input.amountCents)) {
      const record = await this.createRecord({
        ...input,
        type: 'income',
        status: 'review',
      });
      await this.submitForHighValueReview(input.householdId, record.id, {
        amountCents: input.amountCents,
        description: input.description,
        accountId: input.accountId,
      });
      return {
        success: true,
        record,
        needsReview: true,
        reason: `Valor alto (R$${(input.amountCents / 100).toFixed(2)}) - requer revisao manual`,
      };
    }

    // Auto-categorize if no categoryId provided
    let categoryId = input.categoryId;
    if (!categoryId && this.deps.autoCategorizationService) {
      const autoCategoryId = await this.deps.autoCategorizationService.categorize(
        input.householdId,
        input.description
      );
      if (autoCategoryId) {
        categoryId = autoCategoryId;
      }
    }

    // Create record
    const record = await this.createRecord({
      ...input,
      type: 'income',
      status: 'posted',
      categoryId,
    });

    // Create ledger credit entry
    await this.createLedgerEntry({
      householdId: input.householdId,
      recordId: record.id,
      accountId: input.accountId,
      direction: 'credit',
      amountCents: input.amountCents,
      effectiveDate: input.date,
      entryType: 'cash',
    });

    // Create audit log
    await this.createAuditLog({
      householdId: input.householdId,
      action: 'create',
      entityType: 'financial_record',
      entityId: record.id,
      afterJson: record as unknown as Record<string, unknown>,
      source: input.source,
    });

    return { success: true, record };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Create Transfer
  // ─────────────────────────────────────────────────────────────────────────

  async createTransfer(input: CreateTransferInput): Promise<ServiceResult> {
    // Validate accounts
    const fromAccount = await this.deps.accountRepository.findById(input.fromAccountId);
    const toAccount = await this.deps.accountRepository.findById(input.toAccountId);

    if (!fromAccount) {
      return { success: false, reason: 'Conta origem não encontrada' };
    }
    if (!toAccount) {
      return { success: false, reason: 'Conta destino não encontrada' };
    }
    if (fromAccount.id === toAccount.id) {
      return { success: false, reason: 'Contas origem e destino devem ser diferentes' };
    }
    if (fromAccount.householdId !== input.householdId || toAccount.householdId !== input.householdId) {
      return { success: false, reason: 'Contas pertencem a household diferente' };
    }

    // Check idempotency
    if (input.idempotencyKey) {
      await this.deps.idempotencyRepository.create({
        id: `${input.idempotencyKey}:transfer`,
        householdId: input.householdId,
        key: input.idempotencyKey,
        scope: 'transfer',
        createdAt: new Date().toISOString(),
        expiresAt: null,
      });
      
      const existingRecord = await this.deps.recordRepository.findByIdempotencyKey(
        input.householdId,
        input.idempotencyKey
      );
      if (existingRecord) {
        return { success: true, record: existingRecord };
      }
    }

    // Check high-value threshold - only applies when reviewService is available
    if (this.deps.reviewService && this.isHighValue(input.amountCents)) {
      const record = await this.createRecord({
        householdId: input.householdId,
        type: 'transfer',
        amountCents: input.amountCents,
        date: input.date,
        description: input.description,
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        source: input.source,
        status: 'review',
      });
      await this.submitForHighValueReview(input.householdId, record.id, {
        amountCents: input.amountCents,
        description: input.description,
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
      });
      return {
        success: true,
        record,
        needsReview: true,
        reason: `Valor alto (R$${(input.amountCents / 100).toFixed(2)}) - requer revisao manual`,
      };
    }

    // Create transfer record
    const record = await this.createRecord({
      householdId: input.householdId,
      type: 'transfer',
      amountCents: input.amountCents,
      date: input.date,
      description: input.description,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      source: input.source,
      status: 'posted',
    });

    // Create debit entry (from account)
    await this.createLedgerEntry({
      householdId: input.householdId,
      recordId: record.id,
      accountId: input.fromAccountId,
      direction: 'debit',
      amountCents: input.amountCents,
      effectiveDate: input.date,
      entryType: 'transfer',
    });

    // Create credit entry (to account) - REQ-034
    await this.createLedgerEntry({
      householdId: input.householdId,
      recordId: record.id,
      accountId: input.toAccountId,
      direction: 'credit',
      amountCents: input.amountCents,
      effectiveDate: input.date,
      entryType: 'transfer',
    });

    // Create audit log
    await this.createAuditLog({
      householdId: input.householdId,
      action: 'create',
      entityType: 'financial_record',
      entityId: record.id,
      afterJson: record as unknown as Record<string, unknown>,
      source: input.source,
    });

    return { success: true, record };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Balance calculation from ledger (REQ-033)
  // ─────────────────────────────────────────────────────────────────────────

  async getAccountBalance(accountId: string): Promise<number> {
    const account = await this.deps.accountRepository.findById(accountId);
    if (!account) return 0;

    const entries = await this.deps.ledgerRepository.findByAccountId(accountId);
    const credits = entries.filter(e => e.direction === 'credit').reduce((sum, e) => sum + e.amountCents, 0);
    const debits = entries.filter(e => e.direction === 'debit').reduce((sum, e) => sum + e.amountCents, 0);

    return account.initialBalanceCents + credits - debits;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async createRecord(input: {
    householdId: string;
    type: 'income' | 'expense' | 'transfer' | 'interest' | 'adjustment';
    amountCents: number;
    date: string;
    description: string;
    accountId?: string;
    fromAccountId?: string;
    toAccountId?: string;
    categoryId?: string;
    source: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
    status: 'posted' | 'scheduled' | 'paid' | 'overdue' | 'cancelled' | 'review';
    idempotencyKey?: string;
    sourceMessageId?: string;
    recurrenceId?: string;
    installmentGroupId?: string;
    merchantId?: string;
    metadataJson?: Record<string, unknown>;
  }): Promise<FinancialRecord> {
    const now = new Date().toISOString();
    const record: FinancialRecord = {
      id: crypto.randomUUID(),
      householdId: input.householdId,
      type: input.type,
      amountCents: input.amountCents,
      date: input.date,
      description: input.description,
      accountId: input.accountId ?? null,
      fromAccountId: input.fromAccountId ?? null,
      toAccountId: input.toAccountId ?? null,
      cardId: null,
      invoiceId: null,
      categoryId: input.categoryId ?? null,
      createdByUserId: null,
      source: input.source,
      sourceMessageId: input.sourceMessageId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      status: input.status,
      recurrenceId: input.recurrenceId ?? null,
      installmentGroupId: input.installmentGroupId ?? null,
      relatedRecordId: null,
      merchantId: input.merchantId ?? null,
      confirmedAt: null,
      metadataJson: input.metadataJson ?? null,
      createdAt: now,
      updatedAt: now,
    };

    return this.deps.recordRepository.create(record);
  }

  private async createLedgerEntry(input: {
    householdId: string;
    recordId: string;
    accountId: string | null;
    direction: 'debit' | 'credit';
    amountCents: number;
    effectiveDate: string;
    entryType: 'cash' | 'card_charge' | 'invoice_payment' | 'transfer' | 'interest' | 'adjustment';
  }): Promise<void> {
    await this.deps.ledgerRepository.create({
      id: crypto.randomUUID(),
      householdId: input.householdId,
      recordId: input.recordId,
      accountId: input.accountId,
      direction: input.direction,
      amountCents: input.amountCents,
      effectiveDate: input.effectiveDate,
      entryType: input.entryType,
      cardId: null,
      invoiceId: null,
      createdAt: new Date().toISOString(),
    });
  }

  private async createAuditLog(input: {
    householdId: string;
    action: 'create' | 'update' | 'delete' | 'undo' | 'restore';
    entityType: string;
    entityId: string;
    beforeJson?: Record<string, unknown> | null;
    afterJson?: Record<string, unknown> | null;
    source: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
    actorUserId?: string | null;
  }): Promise<void> {
    await this.deps.auditRepository.create({
      id: crypto.randomUUID(),
      householdId: input.householdId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType as any,
      entityId: input.entityId,
      beforeJson: input.beforeJson ?? null,
      afterJson: input.afterJson ?? null,
      source: input.source,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Update a financial record (REQ-XXX)
   */
  async updateRecord(params: {
    householdId: string;
    recordId: string;
    userId?: string;
    updates: {
      description?: string;
      amountCents?: number;
      date?: string;
      categoryId?: string | null;
      status?: 'posted' | 'scheduled' | 'paid' | 'overdue' | 'cancelled' | 'review';
    };
    source?: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
  }): Promise<ServiceResult> {
    const { householdId, recordId, updates, source = 'dashboard', userId } = params;

    // Find existing record
    const existing = await this.deps.recordRepository.findById(recordId);
    if (!existing || existing.householdId !== householdId) {
      return { success: false, reason: 'Registro não encontrado' };
    }

    // Apply updates
    const updateData: Record<string, unknown> = {};
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.amountCents !== undefined) updateData.amountCents = updates.amountCents;
    if (updates.date !== undefined) updateData.date = updates.date;
    if (updates.categoryId !== undefined) updateData.categoryId = updates.categoryId;
    if (updates.status !== undefined) updateData.status = updates.status;

    // Update record
    const updated = await this.deps.recordRepository.update(recordId, updateData as any);
    if (!updated) {
      return { success: false, reason: 'Falha ao atualizar registro' };
    }

    // Create audit log
    await this.createAuditLog({
      householdId,
      action: 'update',
      entityType: 'financial_record',
      entityId: recordId,
      beforeJson: existing as unknown as Record<string, unknown>,
      afterJson: updated as unknown as Record<string, unknown>,
      source,
      actorUserId: userId,
    });

    // Note: If amountCents changed, ledger entries would need to be updated too.
    // Ledger entries are typically immutable, so in production this might require
    // creating reversal entries and new entries. For now, we just update the record.

    return { success: true, record: updated };
  }

  /**
   * Soft delete a financial record (change status to cancelled)
   */
  async softDeleteRecord(params: {
    householdId: string;
    recordId: string;
    userId?: string;
    source?: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
  }): Promise<ServiceResult> {
    const { householdId, recordId, source = 'dashboard', userId } = params;

    // Find existing record
    const existing = await this.deps.recordRepository.findById(recordId);
    if (!existing || existing.householdId !== householdId) {
      return { success: false, reason: 'Registro não encontrado' };
    }

    // Soft delete - change status to cancelled
    const updated = await this.deps.recordRepository.softDelete(recordId);
    if (!updated) {
      return { success: false, reason: 'Falha ao excluir registro' };
    }

    // Create audit log
    await this.createAuditLog({
      householdId,
      action: 'delete',
      entityType: 'financial_record',
      entityId: recordId,
      beforeJson: existing as unknown as Record<string, unknown>,
      afterJson: updated as unknown as Record<string, unknown>,
      source,
      actorUserId: userId,
    });

    return { success: true, record: updated };
  }
}
