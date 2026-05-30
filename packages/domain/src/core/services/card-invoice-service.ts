import type { ICreditCardRepository } from '../repositories/credit-card-repository.js';
import type { IInvoiceRepository } from '../repositories/invoice-repository.js';
import type { IFinancialRecordRepository } from '../repositories/financial-record-repository.js';
import type { ILedgerRepository } from '../repositories/ledger-repository.js';
import type { IAuditLogRepository } from '../repositories/audit-log-repository.js';
import type { IInstallmentGroupRepository } from '../repositories/installment-group-repository.js';
import type { IAccountRepository } from '../repositories/account-repository.js';
import type { FinancialRecord } from '../entities/financial-record.js';
import type { InstallmentGroup } from '../entities/installment-group.js';
import type { Invoice } from '../entities/invoice.js';

// ─────────────────────────────────────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateCardPurchaseInput {
  householdId: string;
  cardId: string;
  amountCents: number;
  description: string;
  purchaseDate: string;
  source: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
  categoryId?: string;
}

export interface CreateInstallmentPurchaseInput {
  householdId: string;
  cardId: string;
  amountCents: number;
  description: string;
  installmentsCount: number;
  firstDate: string;
  source: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
  categoryId?: string;
}

export interface CloseInvoiceInput {
  householdId: string;
  invoiceId: string;
}

export interface PayInvoiceInput {
  householdId: string;
  invoiceId: string;
  paymentAccountId?: string; // Optional - can pay without specifying account
  amountCents: number;
  paymentDate: string;
  source: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
}

// ─────────────────────────────────────────────────────────────────────────────
// Result Types - TED anti-lie pattern (REQ-005)
// ─────────────────────────────────────────────────────────────────────────────

export interface CardPurchaseResult {
  success: boolean;
  record?: FinancialRecord;
  reason?: string;
}

export interface InstallmentPurchaseResult {
  success: boolean;
  installmentGroup?: InstallmentGroup;
  reason?: string;
}

export interface CloseInvoiceResult {
  success: boolean;
  invoice?: Invoice;
  reason?: string;
}

export interface PayInvoiceResult {
  success: boolean;
  record?: FinancialRecord;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Card Invoice Service (REQ-011, REQ-012, REQ-013, REQ-039)
// ─────────────────────────────────────────────────────────────────────────────

export class CardInvoiceService {
  constructor(private deps: {
    cardRepository: ICreditCardRepository;
    invoiceRepository: IInvoiceRepository;
    recordRepository: IFinancialRecordRepository;
    ledgerRepository: ILedgerRepository;
    auditRepository: IAuditLogRepository;
    installmentGroupRepository: IInstallmentGroupRepository;
    accountRepository?: IAccountRepository;
  }) {}

  /**
   * Resolve which invoice period a purchase date belongs to
   * REQ-039: purchase date determines invoice period based on closing day
   */
  async resolveInvoiceForDate(cardId: string, purchaseDate: Date): Promise<Invoice> {
    const card = await this.deps.cardRepository.findById(cardId);
    if (!card) {
      throw new Error('Card not found');
    }

    const year = purchaseDate.getFullYear();
    const month = purchaseDate.getMonth() + 1;
    const day = purchaseDate.getDate();

    // If purchase is after closing day, it goes to next month
    let periodMonth = month;
    let periodYear = year;
    
    if (day > card.closingDay) {
      periodMonth = month === 12 ? 1 : month + 1;
      periodYear = month === 12 ? year + 1 : year;
    }

    // Check if invoice exists
    let invoice = await this.deps.invoiceRepository.findByCardAndPeriod(
      cardId, periodMonth, periodYear
    );

    if (!invoice) {
      // Create new invoice
      const nextMonth = periodMonth === 12 ? 1 : periodMonth + 1;
      const nextYear = periodMonth === 12 ? periodYear + 1 : periodYear;
      
      const closesAt = new Date(periodYear, periodMonth - 1, card.closingDay);
      const dueAt = new Date(nextYear, nextMonth - 1, card.dueDay);

      invoice = await this.deps.invoiceRepository.create({
        id: crypto.randomUUID(),
        householdId: card.householdId,
        cardId,
        periodMonth,
        periodYear,
        status: 'open',
        closesAt: closesAt.toISOString(),
        dueAt: dueAt.toISOString(),
        totalCents: 0,
        paidAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return invoice;
  }

  /**
   * Create one-time card purchase (REQ-012)
   * Creates: expense record + card_charge ledger + audit log + updates invoice total
   */
  async createCardPurchase(input: CreateCardPurchaseInput): Promise<CardPurchaseResult> {
    // Validate card exists and belongs to household
    const card = await this.deps.cardRepository.findById(input.cardId);
    if (!card) {
      return { success: false, reason: 'Cartão não encontrado' };
    }
    if (card.householdId !== input.householdId) {
      return { success: false, reason: 'Cartão pertence a household diferente' };
    }

    // Resolve invoice for purchase date
    let invoice: Invoice;
    try {
      invoice = await this.resolveInvoiceForDate(input.cardId, new Date(input.purchaseDate));
    } catch (e) {
      return { success: false, reason: 'Erro ao resolver fatura' };
    }

    // Cannot add to closed/paid invoice
    if (invoice.status !== 'open') {
      return { success: false, reason: `Fatura está ${invoice.status}, não pode receber compras` };
    }

    // Create expense record
    const now = new Date().toISOString();
    const record: FinancialRecord = {
      id: crypto.randomUUID(),
      householdId: input.householdId,
      type: 'expense',
      amountCents: input.amountCents,
      date: input.purchaseDate,
      description: input.description,
      accountId: null,
      fromAccountId: null,
      toAccountId: null,
      cardId: input.cardId,
      invoiceId: invoice.id,
      categoryId: input.categoryId ?? null,
      createdByUserId: null,
      source: input.source,
      sourceMessageId: null,
      idempotencyKey: null,
      status: 'posted',
      recurrenceId: null,
      installmentGroupId: null,
      relatedRecordId: null,
      merchantId: null,
      confirmedAt: null,
      metadataJson: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.deps.recordRepository.create(record);

    // Create ledger entry - card_charge debit
    await this.deps.ledgerRepository.create({
      id: crypto.randomUUID(),
      householdId: input.householdId,
      recordId: record.id,
      accountId: null,
      cardId: input.cardId,
      invoiceId: invoice.id,
      direction: 'debit',
      amountCents: input.amountCents,
      effectiveDate: input.purchaseDate,
      entryType: 'card_charge',
      createdAt: now,
    });

    // Update invoice total
    await this.deps.invoiceRepository.update(invoice.id, {
      totalCents: invoice.totalCents + input.amountCents,
    });

    // Create audit log
    await this.deps.auditRepository.create({
      id: crypto.randomUUID(),
      householdId: input.householdId,
      actorUserId: null,
      action: 'create',
      entityType: 'financial_record',
      entityId: record.id,
      beforeJson: null,
      afterJson: record as unknown as Record<string, unknown>,
      source: input.source,
      createdAt: now,
    });

    return { success: true, record };
  }

  /**
   * Create installment purchase (REQ-013)
   * Creates: installment_group + N records, each with correct invoice
   */
  async createInstallmentPurchase(input: CreateInstallmentPurchaseInput): Promise<InstallmentPurchaseResult> {
    // Validate card
    const card = await this.deps.cardRepository.findById(input.cardId);
    if (!card) {
      return { success: false, reason: 'Cartão não encontrado' };
    }
    if (card.householdId !== input.householdId) {
      return { success: false, reason: 'Cartão pertence a household diferente' };
    }

    const perInstallmentCents = Math.floor(input.amountCents / input.installmentsCount);
    const now = new Date().toISOString();

    // Create installment group
    const group: InstallmentGroup = {
      id: crypto.randomUUID(),
      householdId: input.householdId,
      description: input.description,
      totalCents: input.amountCents,
      installmentsCount: input.installmentsCount,
      firstDate: input.firstDate,
      cardId: input.cardId,
      accountId: null,
      createdAt: now,
    };

    await this.deps.installmentGroupRepository.create(group);

    // Create each installment record
    let currentDate = new Date(input.firstDate);
    
    for (let i = 0; i < input.installmentsCount; i++) {
      // Resolve invoice for this installment's date
      const invoice = await this.resolveInvoiceForDate(input.cardId, currentDate);

      // Cannot add to closed/paid invoice
      if (invoice.status !== 'open') {
        return { 
          success: false, 
          reason: `Fatura ${invoice.periodMonth}/${invoice.periodYear} está ${invoice.status}` 
        };
      }

      // Calculate amount (last one gets remainder)
      const amount = i === input.installmentsCount - 1
        ? input.amountCents - (perInstallmentCents * (input.installmentsCount - 1))
        : perInstallmentCents;

      const record: FinancialRecord = {
        id: crypto.randomUUID(),
        householdId: input.householdId,
        type: 'expense',
        amountCents: amount,
        date: currentDate.toISOString(),
        description: `${input.description} (${i + 1}/${input.installmentsCount})`,
        accountId: null,
        fromAccountId: null,
        toAccountId: null,
        cardId: input.cardId,
        invoiceId: invoice.id,
        categoryId: input.categoryId ?? null,
        createdByUserId: null,
        source: input.source,
        sourceMessageId: null,
        idempotencyKey: null,
        status: 'posted',
        recurrenceId: null,
        installmentGroupId: group.id,
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
        householdId: input.householdId,
        recordId: record.id,
        accountId: null,
        cardId: input.cardId,
        invoiceId: invoice.id,
        direction: 'debit',
        amountCents: amount,
        effectiveDate: currentDate.toISOString(),
        entryType: 'card_charge',
        createdAt: now,
      });

      // Update invoice total
      await this.deps.invoiceRepository.update(invoice.id, {
        totalCents: invoice.totalCents + amount,
      });

      // Audit log
      await this.deps.auditRepository.create({
        id: crypto.randomUUID(),
        householdId: input.householdId,
        actorUserId: null,
        action: 'create',
        entityType: 'financial_record',
        entityId: record.id,
        beforeJson: null,
        afterJson: record as unknown as Record<string, unknown>,
        source: input.source,
        createdAt: now,
      });

      // Move to next month for next installment
      currentDate = new Date(currentDate);
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    return { success: true, installmentGroup: group };
  }

  /**
   * Close invoice (REQ-006 idempotent)
   * open -> closed only, returns idempotent result
   */
  async closeInvoice(input: CloseInvoiceInput): Promise<CloseInvoiceResult> {
    const invoice = await this.deps.invoiceRepository.findById(input.invoiceId);
    if (!invoice) {
      return { success: false, reason: 'Fatura não encontrada' };
    }
    if (invoice.householdId !== input.householdId) {
      return { success: false, reason: 'Fatura pertence a household diferente' };
    }

    // Cannot close already paid invoice
    if (invoice.status === 'paid') {
      return { success: false, reason: 'Fatura já está paga' };
    }

    // Already closed - idempotent return
    if (invoice.status === 'closed') {
      return { success: true, invoice };
    }

    // Close the invoice (open -> closed)
    const updatedInvoice = await this.deps.invoiceRepository.update(input.invoiceId, {
      status: 'closed',
    });

    return { success: true, invoice: updatedInvoice! };
  }

  /**
   * Pay invoice (REQ-005 anti-lie)
   * Creates: payment record + ledger entries + updates invoice status to paid
   */
  async payInvoice(input: PayInvoiceInput): Promise<PayInvoiceResult> {
    // Validate invoice
    const invoice = await this.deps.invoiceRepository.findById(input.invoiceId);
    if (!invoice) {
      return { success: false, reason: 'Fatura não encontrada' };
    }
    if (invoice.householdId !== input.householdId) {
      return { success: false, reason: 'Fatura pertence a household diferente' };
    }

    // Must be closed to pay (not open)
    if (invoice.status === 'open') {
      return { success: false, reason: 'Fatura ainda não foi fechada' };
    }

    // Already paid
    if (invoice.status === 'paid') {
      return { success: false, reason: 'Fatura já está paga' };
    }

    // Validate payment account only if provided and accountRepository is available
    if (input.paymentAccountId && this.deps.accountRepository) {
      const account = await this.deps.accountRepository.findById(input.paymentAccountId);
      if (!account) {
        return { success: false, reason: 'Conta de pagamento não encontrada' };
      }
      if (account.householdId !== input.householdId) {
        return { success: false, reason: 'Conta pertence a household diferente' };
      }
    }

    const now = new Date().toISOString();

    // Create payment record
    const record: FinancialRecord = {
      id: crypto.randomUUID(),
      householdId: input.householdId,
      type: 'expense', // Payment is an expense from perspective of payment account
      amountCents: input.amountCents,
      date: input.paymentDate,
      description: `Pagamento fatura ${invoice.periodMonth}/${invoice.periodYear}`,
      accountId: input.paymentAccountId ?? null,
      fromAccountId: null,
      toAccountId: null,
      cardId: invoice.cardId,
      invoiceId: invoice.id,
      categoryId: null,
      createdByUserId: null,
      source: input.source,
      sourceMessageId: null,
      idempotencyKey: null,
      status: 'posted',
      recurrenceId: null,
      installmentGroupId: null,
      relatedRecordId: null,
      merchantId: null,
      confirmedAt: null,
      metadataJson: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.deps.recordRepository.create(record);

    // Credit to invoice (reduces card balance)
    await this.deps.ledgerRepository.create({
      id: crypto.randomUUID(),
      householdId: input.householdId,
      recordId: record.id,
      accountId: null,
      cardId: invoice.cardId,
      invoiceId: invoice.id,
      direction: 'credit',
      amountCents: input.amountCents,
      effectiveDate: input.paymentDate,
      entryType: 'invoice_payment',
      createdAt: now,
    });

    // Debit from payment account (if account specified)
    if (input.paymentAccountId) {
      await this.deps.ledgerRepository.create({
        id: crypto.randomUUID(),
        householdId: input.householdId,
        recordId: record.id,
        accountId: input.paymentAccountId,
        cardId: null,
        invoiceId: null,
        direction: 'debit',
        amountCents: input.amountCents,
        effectiveDate: input.paymentDate,
        entryType: 'cash',
        createdAt: now,
      });
    }

    // Update invoice status to paid
    await this.deps.invoiceRepository.update(input.invoiceId, {
      status: 'paid',
      paidAt: input.paymentDate,
    });

    // Audit log
    await this.deps.auditRepository.create({
      id: crypto.randomUUID(),
      householdId: input.householdId,
      actorUserId: null,
      action: 'create',
      entityType: 'financial_record',
      entityId: record.id,
      beforeJson: null,
      afterJson: record as unknown as Record<string, unknown>,
      source: input.source,
      createdAt: now,
    });

    return { success: true, record };
  }
}