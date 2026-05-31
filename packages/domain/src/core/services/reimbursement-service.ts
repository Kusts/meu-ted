// ─────────────────────────────────────────────────────────────────────────────
// Reimbursement Service (REQ-029)
// ─────────────────────────────────────────────────────────────────────────────

import type { IReimbursementRepository } from '../repositories/reimbursement-repository.js';
import type { IFinancialRecordRepository } from '../repositories/financial-record-repository.js';
import type { ILedgerRepository } from '../repositories/ledger-repository.js';
import type { IAuditLogRepository } from '../repositories/audit-log-repository.js';
import type { Reimbursement } from '../entities/reimbursement.js';

export interface CreateReimbursementInput {
  householdId: string;
  originalRecordId: string;
  amountCents: number;
  description?: string;
}

export interface CreateReimbursementResult {
  success: boolean;
  reimbursement?: Reimbursement;
  reason?: string;
}

export interface CompleteReimbursementInput {
  householdId: string;
  reimbursementId: string;
  accountId: string;
  date: string;
}

export interface CompleteReimbursementResult {
  success: boolean;
  reimbursement?: Reimbursement;
  record?: any;
  reason?: string;
}

export interface SplitExpenseInput {
  householdId: string;
  recordId: string;
  splits: Array<{ userId: string; amountCents: number }>;
}

export interface SplitExpenseResult {
  success: boolean;
  record?: any;
  reason?: string;
}

export class ReimbursementService {
  constructor(private deps: {
    reimbursementRepository: IReimbursementRepository;
    recordRepository: IFinancialRecordRepository;
    ledgerRepository: ILedgerRepository;
    auditRepository: IAuditLogRepository;
  }) {}

  /**
   * Create a reimbursement request for an expense
   */
  async createReimbursement(input: CreateReimbursementInput): Promise<CreateReimbursementResult> {
    // Check original record exists and belongs to household
    const originalRecord = await this.deps.recordRepository.findById(input.originalRecordId);
    if (!originalRecord) {
      return { success: false, reason: 'Registro original não encontrado' };
    }
    if (originalRecord.householdId !== input.householdId) {
      return { success: false, reason: 'Registro pertence a household diferente' };
    }
    if (originalRecord.type !== 'expense') {
      return { success: false, reason: 'Só pode reembolsar despesas' };
    }
    if (input.amountCents <= 0) {
      return { success: false, reason: 'amountCents deve ser positivo' };
    }
    if (input.amountCents > originalRecord.amountCents) {
      return { success: false, reason: 'Valor do reembolso não pode exceder valor da despesa' };
    }

    // Check if reimbursement already exists
    const existing = await this.deps.reimbursementRepository.findByOriginalRecordId(input.originalRecordId);
    if (existing && existing.status !== 'pending') {
      return { success: false, reason: 'Reembolso já existe para este registro' };
    }

    const now = new Date().toISOString();
    const reimbursement: Reimbursement = {
      id: crypto.randomUUID(),
      householdId: input.householdId,
      originalRecordId: input.originalRecordId,
      reimbursementRecordId: null,
      amountCents: input.amountCents,
      status: input.amountCents === originalRecord.amountCents ? 'pending' : 'partial',
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.deps.reimbursementRepository.create(reimbursement);
    return { success: true, reimbursement: created };
  }

  /**
   * Complete a reimbursement by creating an income record
   */
  async completeReimbursement(input: CompleteReimbursementInput): Promise<CompleteReimbursementResult> {
    const reimbursement = await this.deps.reimbursementRepository.findById(input.reimbursementId);
    if (!reimbursement) {
      return { success: false, reason: 'Reembolso não encontrado' };
    }
    if (reimbursement.householdId !== input.householdId) {
      return { success: false, reason: 'Reembolso pertence a household diferente' };
    }
    if (reimbursement.status === 'completed') {
      return { success: false, reason: 'Reembolso já foi completado' };
    }

    const now = new Date().toISOString();

    // Create income record for the reimbursement
    const incomeRecord = {
      id: crypto.randomUUID(),
      householdId: input.householdId,
      type: 'income' as const,
      amountCents: reimbursement.amountCents,
      date: input.date,
      description: `Reembolso: ${reimbursement.description ?? 'Reembolso'}`,
      accountId: input.accountId,
      fromAccountId: null,
      toAccountId: null,
      cardId: null,
      invoiceId: null,
      categoryId: null,
      createdByUserId: null,
      source: 'reimbursement' as const,
      sourceMessageId: null,
      idempotencyKey: `reimbursement:${reimbursement.id}:${input.date}`,
      status: 'posted' as const,
      recurrenceId: null,
      installmentGroupId: null,
      relatedRecordId: reimbursement.originalRecordId,
      merchantId: null,
      confirmedAt: now,
      metadataJson: JSON.stringify({ reimbursementId: reimbursement.id }),
      createdAt: now,
      updatedAt: now,
    };

    await this.deps.recordRepository.create(incomeRecord);

    // Create ledger entry for the income
    await this.deps.ledgerRepository.create({
      id: crypto.randomUUID(),
      householdId: input.householdId,
      recordId: incomeRecord.id,
      accountId: input.accountId,
      cardId: null,
      invoiceId: null,
      direction: 'credit' as const,
      amountCents: reimbursement.amountCents,
      effectiveDate: input.date,
      entryType: 'reimbursement' as const,
      createdAt: now,
    });

    // Update reimbursement
    const updated = await this.deps.reimbursementRepository.update(reimbursement.id, {
      status: 'completed',
      reimbursementRecordId: incomeRecord.id,
    });

    return { success: true, reimbursement: updated ?? undefined, record: incomeRecord };
  }

  /**
   * List reimbursements by household
   */
  async listByHousehold(householdId: string): Promise<Reimbursement[]> {
    return this.deps.reimbursementRepository.findByHouseholdId(householdId);
  }

  /**
   * Split expense among multiple users (stores in metadataJson)
   */
  async splitExpense(input: SplitExpenseInput): Promise<SplitExpenseResult> {
    const record = await this.deps.recordRepository.findById(input.recordId);
    if (!record) {
      return { success: false, reason: 'Registro não encontrado' };
    }
    if (record.householdId !== input.householdId) {
      return { success: false, reason: 'Registro pertence a household diferente' };
    }

    const totalSplit = input.splits.reduce((sum, s) => sum + s.amountCents, 0);
    if (totalSplit !== record.amountCents) {
      return { success: false, reason: `Soma dos splits (${totalSplit}) deve igualar valor do registro (${record.amountCents})` };
    }

    const metadata = {
      splits: input.splits.map(s => ({
        userId: s.userId,
        amountCents: s.amountCents,
        scope: 'shared' as const,
      })),
    };

    const updated = await this.deps.recordRepository.update(record.id, {
      metadataJson: JSON.stringify(metadata),
    });

    return { success: true, record: updated ?? undefined };
  }
}
