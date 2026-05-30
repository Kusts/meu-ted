import type { IRecurrenceRepository } from '../repositories/recurrence-repository.js';
import type { IRecurrenceOccurrenceRepository } from '../repositories/recurrence-occurrence-repository.js';
import type { IFinancialRecordRepository } from '../repositories/financial-record-repository.js';
import type { ILedgerRepository } from '../repositories/ledger-repository.js';
import type { IAuditLogRepository } from '../repositories/audit-log-repository.js';
import type { IBillRepository } from '../repositories/bill-repository.js';
import type { ICreditCardRepository } from '../repositories/credit-card-repository.js';
import type { IInvoiceRepository } from '../repositories/invoice-repository.js';
import type { IInstallmentGroupRepository } from '../repositories/installment-group-repository.js';
import type { IAccountRepository } from '../repositories/account-repository.js';
import type { Recurrence, RecurrenceOccurrence, RecurrencePeriod } from '../entities/recurrence.js';
import type { Bill } from '../entities/bill.js';
import type { FinancialRecord } from '../entities/financial-record.js';

// ─────────────────────────────────────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateRecurrenceInput {
  householdId: string;
  description: string;
  amountCents: number;
  period: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  targetType: 'payable_bill' | 'account_debit' | 'card_charge';
  firstDate: string;
  accountId?: string | null;
  cardId?: string | null;
  categoryId?: string | null;
}

export interface EditOccurrenceInput {
  occurrenceId: string;
  amountCents?: number;
  description?: string;
  date?: string;
}

export interface EditFutureOccurrencesInput {
  fromOccurrenceId: string;
  amountCents?: number;
  description?: string;
}

export interface EditAllOccurrencesInput {
  recurrenceId: string;
  amountCents?: number;
  description?: string;
}

export interface PayBillInput {
  householdId: string;
  billId: string;
  paymentAccountId?: string | null;
  amountCents: number;
  paymentDate: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Result Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateRecurrenceResult {
  success: boolean;
  recurrence?: Recurrence;
  occurrences?: RecurrenceOccurrence[];
  reason?: string;
}

export interface ProcessOccurrenceResult {
  success: boolean;
  record?: FinancialRecord;
  bill?: Bill;
  reason?: string;
}

export interface MaintainHorizonResult {
  success: boolean;
  createdCount: number;
  reason?: string;
}

export interface EditOccurrenceResult {
  success: boolean;
  editedCount: number;
  reason?: string;
}

export interface PayBillResult {
  success: boolean;
  record?: FinancialRecord;
  interestRecord?: FinancialRecord;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recurrence Service (REQ-014, REQ-015, REQ-016, REQ-017, REQ-018)
// ─────────────────────────────────────────────────────────────────────────────

export class RecurrenceService {
  public deps: {
    recurrenceRepository: IRecurrenceRepository;
    occurrenceRepository: IRecurrenceOccurrenceRepository;
    recordRepository: IFinancialRecordRepository;
    ledgerRepository: ILedgerRepository;
    auditRepository: IAuditLogRepository;
    billRepository: IBillRepository;
    cardRepository: ICreditCardRepository;
    invoiceRepository: IInvoiceRepository;
    installmentGroupRepository: IInstallmentGroupRepository;
    accountRepository: IAccountRepository;
  };

  constructor(deps: {
    recurrenceRepository: IRecurrenceRepository;
    occurrenceRepository: IRecurrenceOccurrenceRepository;
    recordRepository: IFinancialRecordRepository;
    ledgerRepository: ILedgerRepository;
    auditRepository: IAuditLogRepository;
    billRepository: IBillRepository;
    cardRepository: ICreditCardRepository;
    invoiceRepository: IInvoiceRepository;
    installmentGroupRepository: IInstallmentGroupRepository;
    accountRepository: IAccountRepository;
  }) {
    this.deps = deps;
  }

  /**
   * Create recurrence with 12 future occurrences (REQ-014)
   */
  async createRecurrence(input: CreateRecurrenceInput): Promise<CreateRecurrenceResult> {
    const now = new Date().toISOString();
    const recurrenceId = crypto.randomUUID();

    // Create recurrence
    const recurrence: Recurrence = {
      id: recurrenceId,
      householdId: input.householdId,
      description: input.description,
      amountCents: input.amountCents,
      period: input.period,
      targetType: input.targetType,
      accountId: input.accountId ?? null,
      cardId: input.cardId ?? null,
      categoryId: input.categoryId ?? null,
      firstDate: input.firstDate,
      horizonMonths: 12,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    await this.deps.recurrenceRepository.create(recurrence);

    // Generate occurrences
    const occurrences = this.generateOccurrences(recurrence, 12);

    // Store occurrences
    for (const occ of occurrences) {
      await this.deps.occurrenceRepository.create(occ);
    }

    return { success: true, recurrence, occurrences };
  }

  /**
   * Generate N future occurrences based on period
   */
  private generateOccurrences(recurrence: Recurrence, count: number): RecurrenceOccurrence[] {
    const occurrences: RecurrenceOccurrence[] = [];
    let currentDate = new Date(recurrence.firstDate);
    const now = new Date();

    for (let i = 0; i < count; i++) {
      const occurrenceDate = new Date(currentDate);
      
      // Skip past occurrences
      if (occurrenceDate > now) {
        occurrences.push({
          id: crypto.randomUUID(),
          householdId: recurrence.householdId,
          recurrenceId: recurrence.id,
          occurrenceDate: occurrenceDate.toISOString(),
          amountCents: recurrence.amountCents,
          description: recurrence.description,
          recordId: null,
          billId: null,
          status: 'pending',
          editedPolicy: 'none',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      currentDate = this.addPeriod(recurrence.period, currentDate);
    }

    return occurrences;
  }

  /**
   * Add period to date
   */
  private addPeriod(period: RecurrencePeriod, date: Date): Date {
    const result = new Date(date);
    switch (period) {
      case 'daily':
        result.setDate(result.getDate() + 1);
        break;
      case 'weekly':
        result.setDate(result.getDate() + 7);
        break;
      case 'biweekly':
        result.setDate(result.getDate() + 14);
        break;
      case 'monthly':
        result.setMonth(result.getMonth() + 1);
        break;
      case 'yearly':
        result.setFullYear(result.getFullYear() + 1);
        break;
    }
    return result;
  }

  /**
   * Maintain horizon - create missing future occurrences (REQ-015)
   * Idempotent: running twice doesn't duplicate
   */
  async maintainHorizon(recurrenceId: string): Promise<MaintainHorizonResult> {
    const recurrence = await this.deps.recurrenceRepository.findById(recurrenceId);
    if (!recurrence) {
      return { success: false, createdCount: 0, reason: 'Recorrência não encontrada' };
    }

    const existingOccurrences = await this.deps.occurrenceRepository.findByRecurrenceId(recurrenceId);
    const now = new Date();

    // Count how many future pending occurrences we need
    const futurePending = existingOccurrences.filter(
      o => new Date(o.occurrenceDate) > now && o.status === 'pending'
    ).length;

    // Calculate horizon end date
    const horizonEnd = new Date();
    horizonEnd.setMonth(horizonEnd.getMonth() + recurrence.horizonMonths);

    // Generate needed occurrences
    let currentDate = this.getLastOccurrenceDate(existingOccurrences);
    let createdCount = 0;

    while (futurePending + createdCount < 12 && currentDate < horizonEnd) {
      currentDate = this.addPeriod(recurrence.period, currentDate);

      // Check if already exists
      const exists = existingOccurrences.some(
        o => o.occurrenceDate === currentDate.toISOString()
      );

      if (!exists && currentDate > now) {
        await this.deps.occurrenceRepository.create({
          id: crypto.randomUUID(),
          householdId: recurrence.householdId,
          recurrenceId,
          occurrenceDate: currentDate.toISOString(),
          amountCents: recurrence.amountCents,
          description: recurrence.description,
          recordId: null,
          billId: null,
          status: 'pending',
          editedPolicy: 'none',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        createdCount++;
      }
    }

    return { success: true, createdCount };
  }

  /**
   * Get the last occurrence date from existing occurrences
   */
  private getLastOccurrenceDate(occurrences: RecurrenceOccurrence[]): Date {
    if (occurrences.length === 0) {
      return new Date();
    }
    const sorted = [...occurrences].sort(
      (a, b) => new Date(b.occurrenceDate).getTime() - new Date(a.occurrenceDate).getTime()
    );
    return new Date(sorted[0].occurrenceDate);
  }

  /**
   * Process occurrence - creates bill or expense based on target type (REQ-016)
   */
  async processOccurrence(occurrenceId: string): Promise<ProcessOccurrenceResult> {
    const occurrence = await this.deps.occurrenceRepository.findById(occurrenceId);
    if (!occurrence) {
      return { success: false, reason: 'Ocorrência não encontrada' };
    }

    // Idempotent: if already processed, return existing
    if (occurrence.status === 'processed') {
      const existingRecord = occurrence.recordId
        ? await this.deps.recordRepository.findById(occurrence.recordId)
        : null;
      return { success: true, record: existingRecord ?? undefined };
    }

    const recurrence = await this.deps.recurrenceRepository.findById(occurrence.recurrenceId);
    if (!recurrence) {
      return { success: false, reason: 'Recorrência não encontrada' };
    }

    const now = new Date().toISOString();
    const amountCents = occurrence.amountCents;
    const description = occurrence.description;

    // Create based on target type
    if (recurrence.targetType === 'payable_bill') {
      // Create bill
      const bill: Bill = {
        id: crypto.randomUUID(),
        householdId: recurrence.householdId,
        description,
        amountCents,
        dueDate: occurrence.occurrenceDate,
        paidAt: null,
        status: 'pending',
        recordId: null,
        recurrenceId: recurrence.id,
        occurrenceId: occurrence.id,
        interestRecordId: null,
        originalAmountCents: null,
        paidAmountCents: null,
        createdAt: now,
        updatedAt: now,
      };

      await this.deps.billRepository.create(bill);
      await this.deps.occurrenceRepository.update(occurrenceId, { billId: bill.id, status: 'processed' });

      return { success: true, bill };
    }

    if (recurrence.targetType === 'account_debit') {
      // Create expense + ledger entry
      const record: FinancialRecord = {
        id: crypto.randomUUID(),
        householdId: recurrence.householdId,
        type: 'expense',
        amountCents,
        date: occurrence.occurrenceDate,
        description,
        accountId: recurrence.accountId,
        fromAccountId: null,
        toAccountId: null,
        cardId: null,
        invoiceId: null,
        categoryId: recurrence.categoryId,
        createdByUserId: null,
        source: 'cron',
        sourceMessageId: null,
        idempotencyKey: `rec:${recurrence.id}:${occurrence.occurrenceDate}`,
        status: 'posted',
        recurrenceId: recurrence.id,
        installmentGroupId: null,
        relatedRecordId: null,
        merchantId: null,
        confirmedAt: null,
        metadataJson: null,
        createdAt: now,
        updatedAt: now,
      };

      await this.deps.recordRepository.create(record);

      // Ledger entry
      await this.deps.ledgerRepository.create({
        id: crypto.randomUUID(),
        householdId: recurrence.householdId,
        recordId: record.id,
        accountId: recurrence.accountId,
        cardId: null,
        invoiceId: null,
        direction: 'debit',
        amountCents,
        effectiveDate: occurrence.occurrenceDate,
        entryType: 'recurrence',
        createdAt: now,
      });

      await this.deps.occurrenceRepository.update(occurrenceId, { recordId: record.id, status: 'processed' });

      return { success: true, record };
    }

    if (recurrence.targetType === 'card_charge') {
      // Card charge requires CardInvoiceService integration - returns failure without partial
      return { success: false, reason: 'card_charge requer CardInvoiceService' };
    }

    return { success: false, reason: 'Tipo de alvo não suportado' };
  }

  /**
   * Edit single occurrence (REQ-018)
   */
  async editOccurrence(input: EditOccurrenceInput): Promise<EditOccurrenceResult> {
    const occurrence = await this.deps.occurrenceRepository.findById(input.occurrenceId);
    if (!occurrence) {
      return { success: false, editedCount: 0, reason: 'Ocorrência não encontrada' };
    }

    await this.deps.occurrenceRepository.update(input.occurrenceId, {
      amountCents: input.amountCents ?? undefined,
      description: input.description ?? undefined,
      editedPolicy: 'single',
    });

    return { success: true, editedCount: 1 };
  }

  /**
   * Edit future occurrences from a point (REQ-018)
   */
  async editFutureOccurrences(input: EditFutureOccurrencesInput): Promise<EditOccurrenceResult> {
    const fromOccurrence = await this.deps.occurrenceRepository.findById(input.fromOccurrenceId);
    if (!fromOccurrence) {
      return { success: false, editedCount: 0, reason: 'Ocorrência não encontrada' };
    }

    const allOccurrences = await this.deps.occurrenceRepository.findByRecurrenceId(fromOccurrence.recurrenceId);
    const fromDate = new Date(fromOccurrence.occurrenceDate);

    let editedCount = 0;
    for (const occ of allOccurrences) {
      const occDate = new Date(occ.occurrenceDate);
      if (occDate >= fromDate && occ.status === 'pending') {
        await this.deps.occurrenceRepository.update(occ.id, {
          amountCents: input.amountCents ?? undefined,
          description: input.description ?? undefined,
          editedPolicy: 'future',
        });
        editedCount++;
      }
    }

    return { success: true, editedCount };
  }

  /**
   * Edit all occurrences (REQ-018)
   */
  async editAllOccurrences(input: EditAllOccurrencesInput): Promise<EditOccurrenceResult> {
    const recurrence = await this.deps.recurrenceRepository.findById(input.recurrenceId);
    if (!recurrence) {
      return { success: false, editedCount: 0, reason: 'Recorrência não encontrada' };
    }

    // Update recurrence
    await this.deps.recurrenceRepository.update(input.recurrenceId, {
      amountCents: input.amountCents ?? undefined,
      description: input.description ?? undefined,
    });

    // Update all pending occurrences
    const occurrences = await this.deps.occurrenceRepository.findPendingByRecurrenceId(input.recurrenceId);
    for (const occ of occurrences) {
      await this.deps.occurrenceRepository.update(occ.id, {
        amountCents: input.amountCents ?? undefined,
        description: input.description ?? undefined,
        editedPolicy: 'all',
      });
    }

    return { success: true, editedCount: occurrences.length };
  }

  /**
   * Pay bill with late interest if overpaid (REQ-017)
   */
  async payBill(input: PayBillInput): Promise<PayBillResult> {
    const bill = await this.deps.billRepository.findById(input.billId);
    if (!bill) {
      return { success: false, reason: 'Conta não encontrada' };
    }
    if (bill.householdId !== input.householdId) {
      return { success: false, reason: 'Conta pertence a household diferente' };
    }
    if (bill.status === 'paid') {
      return { success: false, reason: 'Conta já está paga' };
    }

    const now = new Date().toISOString();
    const hasInterest = input.amountCents > bill.amountCents;
    const interestCents = hasInterest ? input.amountCents - bill.amountCents : 0;

    // Create payment record
    const record: FinancialRecord = {
      id: crypto.randomUUID(),
      householdId: input.householdId,
      type: 'expense',
      amountCents: input.amountCents,
      date: input.paymentDate,
      description: `Pagamento: ${bill.description}`,
      accountId: input.paymentAccountId ?? null,
      fromAccountId: null,
      toAccountId: null,
      cardId: null,
      invoiceId: null,
      categoryId: null,
      createdByUserId: null,
      source: 'cron',
      sourceMessageId: null,
      idempotencyKey: null,
      status: 'posted',
      recurrenceId: bill.recurrenceId,
      installmentGroupId: null,
      relatedRecordId: null,
      merchantId: null,
      confirmedAt: null,
      metadataJson: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.deps.recordRepository.create(record);

    // Update bill
    await this.deps.billRepository.update(input.billId, {
      status: 'paid',
      paidAt: input.paymentDate,
      recordId: record.id,
      paidAmountCents: input.amountCents,
      originalAmountCents: hasInterest ? bill.amountCents : null,
    });

    // Create interest record if overpaid (REQ-017)
    let interestRecord: FinancialRecord | undefined;
    if (hasInterest && interestCents > 0) {
      interestRecord = {
        id: crypto.randomUUID(),
        householdId: input.householdId,
        type: 'interest',
        amountCents: interestCents,
        date: input.paymentDate,
        description: `Juros/Multa: ${bill.description}`,
        accountId: input.paymentAccountId ?? null,
        fromAccountId: null,
        toAccountId: null,
        cardId: null,
        invoiceId: null,
        categoryId: null,
        createdByUserId: null,
        source: 'cron',
        sourceMessageId: null,
        idempotencyKey: null,
        status: 'posted',
        recurrenceId: bill.recurrenceId,
        installmentGroupId: null,
        relatedRecordId: record.id,
        merchantId: null,
        confirmedAt: null,
        metadataJson: null,
        createdAt: now,
        updatedAt: now,
      };

      await this.deps.recordRepository.create(interestRecord);
      await this.deps.billRepository.update(input.billId, { interestRecordId: interestRecord.id });
    }

    return { success: true, record, interestRecord };
  }
}