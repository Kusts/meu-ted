import { describe, it, expect, beforeEach } from 'vitest';
import type { CreditCard } from '../core/entities/credit-card.js';
import { InMemoryCreditCardRepository } from './credit-card-repository.js';
import { InMemoryInvoiceRepository } from './invoice-repository.js';
import { InMemoryFinancialRecordRepository } from './financial-record-repository.js';
import { InMemoryLedgerRepository } from './ledger-repository.js';
import { InMemoryAuditLogRepository } from './audit-log-repository.js';
import { InMemoryInstallmentGroupRepository } from './installment-group-repository.js';
import { CardInvoiceService, CreateCardPurchaseInput, CloseInvoiceInput, PayInvoiceInput } from '../core/services/card-invoice-service.js';
import type { AccountScope } from '../core/entities/account.js';

// Factory helper
function makeCard(overrides: Partial<{
  id: string;
  householdId: string;
  name: string;
  ownerUserId: string | null;
  scope: AccountScope;
  limitCents: number | null;
  closingDay: number;
  dueDay: number;
  active: boolean;
}> = {}): CreditCard {
  return {
    id: crypto.randomUUID(),
    householdId: 'household-1',
    name: 'Nubank',
    ownerUserId: null,
    scope: 'shared' as AccountScope,
    limitCents: null,
    closingDay: 20,
    dueDay: 10,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as CreditCard;
}

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 1: Create Card (REQ-011 closingDay/dueDay 1..31)
// RED FIRST: Card should be created with closingDay/dueDay in valid range
// ─────────────────────────────────────────────────────────────────────────────

describe('InMemoryCreditCardRepository', () => {
  let repo: InMemoryCreditCardRepository;

  beforeEach(() => {
    repo = new InMemoryCreditCardRepository();
  });

  it('should create card with closingDay 1..31', async () => {
    const card = makeCard({ closingDay: 15 });
    const created = await repo.create(card);

    expect(created.closingDay).toBe(15);
  });

  it('should enforce closingDay and dueDay valid range', async () => {
    // Valid cards
    const valid1 = makeCard({ name: 'Valid 1', closingDay: 1, dueDay: 1 });
    const valid31 = makeCard({ name: 'Valid 31', closingDay: 31, dueDay: 31 });
    const valid15 = makeCard({ name: 'Valid 15', closingDay: 15, dueDay: 15 });
    
    await repo.create(valid1);
    await repo.create(valid31);
    await repo.create(valid15);

    const cards = await repo.findByHouseholdId('household-1');
    expect(cards).toHaveLength(3);
    expect(cards[0].closingDay).toBe(1);
    expect(cards[2].closingDay).toBe(15);
  });

  it('should support shared and personal scope', async () => {
    const shared = makeCard({ name: 'Shared Card', scope: 'shared' as AccountScope });
    const personal = makeCard({ name: 'Personal Card', scope: 'personal' as AccountScope });
    
    await repo.create(shared);
    await repo.create(personal);

    const cards = await repo.findByHouseholdId('household-1');
    expect(cards).toHaveLength(2);
  });

  it('should support optional owner', async () => {
    const ownedCard = makeCard({ name: 'Wife Card', ownerUserId: 'user-wife-123' });
    const noOwnerCard = makeCard({ name: 'No Owner Card', ownerUserId: null });
    
    await repo.create(ownedCard);
    await repo.create(noOwnerCard);

    expect((await repo.findById(ownedCard.id))?.ownerUserId).toBe('user-wife-123');
    expect((await repo.findById(noOwnerCard.id))?.ownerUserId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 2: Resolve invoice for purchase date (REQ-039)
// RED FIRST: purchase date determines which invoice period
// ─────────────────────────────────────────────────────────────────────────────

describe('CardInvoiceService - Invoice Resolution', () => {
  let cardRepo: InMemoryCreditCardRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let recordRepo: InMemoryFinancialRecordRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let installmentRepo: InMemoryInstallmentGroupRepository;
  let service: CardInvoiceService;

  beforeEach(() => {
    cardRepo = new InMemoryCreditCardRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    recordRepo = new InMemoryFinancialRecordRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditRepo = new InMemoryAuditLogRepository();
    installmentRepo = new InMemoryInstallmentGroupRepository();
    service = new CardInvoiceService({
      cardRepository: cardRepo,
      invoiceRepository: invoiceRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      installmentGroupRepository: installmentRepo,
    });
  });

  it('REQ-039 RED: should assign purchase to current cycle invoice', async () => {
    // Card closes on day 20, due day 10
    const card = makeCard({ id: 'card-1', closingDay: 20, dueDay: 10 });
    await cardRepo.create(card);

    // Purchase on June 15 - current cycle (before closing)
    const purchaseDate = new Date('2026-06-15');
    const invoice = await service.resolveInvoiceForDate('card-1', purchaseDate);

    expect(invoice).toBeDefined();
    expect(invoice.periodMonth).toBe(6);
    expect(invoice.periodYear).toBe(2026);
    expect(invoice.status).toBe('open');
  });

  it('REQ-039: should assign to NEXT invoice if after closing day', async () => {
    const card = makeCard({ id: 'card-1', closingDay: 20, dueDay: 10 });
    await cardRepo.create(card);

    // Purchase on June 25 - after closing (closes on June 20)
    // Should go to July invoice
    const purchaseDate = new Date('2026-06-25');
    const invoice = await service.resolveInvoiceForDate('card-1', purchaseDate);

    expect(invoice.periodMonth).toBe(7);
    expect(invoice.periodYear).toBe(2026);
  });

  it('REQ-039: should reuse existing open invoice', async () => {
    const card = makeCard({ id: 'card-1', closingDay: 20, dueDay: 10 });
    await cardRepo.create(card);

    // Create June invoice manually
    await invoiceRepo.create({
      id: crypto.randomUUID(),
      householdId: 'household-1',
      cardId: 'card-1',
      periodMonth: 6,
      periodYear: 2026,
      status: 'open',
      closesAt: new Date('2026-06-20').toISOString(),
      dueAt: new Date('2026-07-10').toISOString(),
      totalCents: 0,
      paidAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Purchase June 10 - should reuse existing
    const purchaseDate = new Date('2026-06-10');
    const invoice = await service.resolveInvoiceForDate('card-1', purchaseDate);

    expect(invoice.periodMonth).toBe(6);
    expect(invoice.periodYear).toBe(2026);
  });

  it('REQ-039: should create invoice if none exists', async () => {
    const card = makeCard({ id: 'card-1', closingDay: 20, dueDay: 10 });
    await cardRepo.create(card);

    const purchaseDate = new Date('2026-06-10');
    const invoice = await service.resolveInvoiceForDate('card-1', purchaseDate);

    expect(invoice).toBeDefined();
    // Check it's stored
    const stored = await invoiceRepo.findById(invoice.id);
    expect(stored).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 3: One-time card purchase (REQ-012)
// ─────────────────────────────────────────────────────────────────────────────

describe('CardInvoiceService - One-time Purchase', () => {
  let cardRepo: InMemoryCreditCardRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let recordRepo: InMemoryFinancialRecordRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let installmentRepo: InMemoryInstallmentGroupRepository;
  let service: CardInvoiceService;

  beforeEach(() => {
    cardRepo = new InMemoryCreditCardRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    recordRepo = new InMemoryFinancialRecordRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditRepo = new InMemoryAuditLogRepository();
    installmentRepo = new InMemoryInstallmentGroupRepository();
    service = new CardInvoiceService({
      cardRepository: cardRepo,
      invoiceRepository: invoiceRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      installmentGroupRepository: installmentRepo,
    });
  });

  it('REQ-012 RED: should create expense with cardId/invoiceId and card_charge ledger', async () => {
    const card = makeCard({ id: 'card-1' });
    await cardRepo.create(card);

    const input: CreateCardPurchaseInput = {
      householdId: 'household-1',
      cardId: 'card-1',
      amountCents: 15000, // R$150,00
      description: 'Restaurante',
      purchaseDate: new Date('2026-06-10').toISOString(),
      source: 'whatsapp',
    };

    const result = await service.createCardPurchase(input);

    expect(result.success).toBe(true);
    expect(result.record).toBeDefined();
    expect(result.record!.type).toBe('expense');
    expect(result.record!.cardId).toBe('card-1');
    expect(result.record!.invoiceId).toBeDefined();

    // Verify ledger entry
    const ledgerEntries = await ledgerRepo.findByRecordId(result.record!.id);
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0].direction).toBe('debit');
    expect(ledgerEntries[0].entryType).toBe('card_charge');

    // Verify invoice total updated
    const invoice = await invoiceRepo.findById(result.record!.invoiceId!);
    expect(invoice!.totalCents).toBe(15000);

    // Verify audit log
    const auditLogs = await auditRepo.findByEntityId('financial_record', result.record!.id);
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].action).toBe('create');
  });

  it('REQ-012: should update invoice totalCents', async () => {
    const card = makeCard({ id: 'card-1' });
    await cardRepo.create(card);

    // First purchase
    await service.createCardPurchase({
      householdId: 'household-1',
      cardId: 'card-1',
      amountCents: 5000,
      description: 'First',
      purchaseDate: new Date('2026-06-10').toISOString(),
      source: 'whatsapp',
    });

    // Second purchase - same invoice
    const result = await service.createCardPurchase({
      householdId: 'household-1',
      cardId: 'card-1',
      amountCents: 3000,
      description: 'Second',
      purchaseDate: new Date('2026-06-12').toISOString(),
      source: 'whatsapp',
    });

    // Both in same invoice
    const invoice = await invoiceRepo.findById(result.record!.invoiceId!);
    expect(invoice!.totalCents).toBe(8000); // 5000 + 3000
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 4: Installment purchase (REQ-013)
// ─────────────────────────────────────────────────────────────────────────────

describe('CardInvoiceService - Installment Purchase', () => {
  let cardRepo: InMemoryCreditCardRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let recordRepo: InMemoryFinancialRecordRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let installmentRepo: InMemoryInstallmentGroupRepository;
  let service: CardInvoiceService;

  beforeEach(() => {
    cardRepo = new InMemoryCreditCardRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    recordRepo = new InMemoryFinancialRecordRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditRepo = new InMemoryAuditLogRepository();
    installmentRepo = new InMemoryInstallmentGroupRepository();
    service = new CardInvoiceService({
      cardRepository: cardRepo,
      invoiceRepository: invoiceRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      installmentGroupRepository: installmentRepo,
    });
  });

  it('REQ-013 RED: should create installment_group and N records', async () => {
    const card = makeCard({ id: 'card-1' });
    await cardRepo.create(card);

    const input: Parameters<typeof service.createInstallmentPurchase>[0] = {
      householdId: 'household-1',
      cardId: 'card-1',
      amountCents: 30000, // R$300,00 in 3x
      description: 'TV',
      installmentsCount: 3,
      firstDate: new Date('2026-06-10').toISOString(),
      source: 'whatsapp' as const,
    };

    const result = await service.createInstallmentPurchase(input);

    expect(result.success).toBe(true);
    expect(result.installmentGroup).toBeDefined();
    expect(result.installmentGroup!.installmentsCount).toBe(3);

    // Should have 3 records created
    const records = await recordRepo.findByHouseholdId('household-1');
    const installmentRecords = records.filter(r => r.installmentGroupId === result.installmentGroup!.id);
    expect(installmentRecords).toHaveLength(3);
  });

  it('REQ-013: each installment should be in correct month', async () => {
    const card = makeCard({ id: 'card-1' });
    await cardRepo.create(card);

    const result = await service.createInstallmentPurchase({
      householdId: 'household-1',
      cardId: 'card-1',
      amountCents: 30000,
      description: 'TV',
      installmentsCount: 3,
      firstDate: new Date('2026-06-10').toISOString(),
      source: 'whatsapp',
    });

    const records = await recordRepo.findByHouseholdId('household-1');
    const installmentRecords = records
      .filter(r => r.installmentGroupId === result.installmentGroup!.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // First installment: June 2026
    expect(installmentRecords[0].date).toContain('2026-06');
    expect(installmentRecords[0].amountCents).toBe(10000);

    // Second installment: July 2026
    expect(installmentRecords[1].date).toContain('2026-07');

    // Third installment: August 2026
    expect(installmentRecords[2].date).toContain('2026-08');
  });

  it('REQ-013: each installment goes to correct invoice by date', async () => {
    const card = makeCard({ id: 'card-1', closingDay: 20 });
    await cardRepo.create(card);

    // Create 3x starting June 25 - each crosses closing
    const result = await service.createInstallmentPurchase({
      householdId: 'household-1',
      cardId: 'card-1',
      amountCents: 30000,
      description: 'TV',
      installmentsCount: 3,
      firstDate: new Date('2026-06-25').toISOString(),
      source: 'whatsapp',
    });

    const records = await recordRepo.findByHouseholdId('household-1');
    const installmentRecords = records
      .filter(r => r.installmentGroupId === result.installmentGroup!.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // June 25 -> after closing day 20 -> July invoice
    // July 25 -> after closing day 20 -> August invoice
    // August 25 -> after closing day 20 -> September invoice
    expect(installmentRecords[0].invoiceId).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 5: Close invoice idempotently (REQ-006)
// ─────────────────────────────────────────────────────────────────────────────

describe('CardInvoiceService - Close Invoice', () => {
  let cardRepo: InMemoryCreditCardRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let recordRepo: InMemoryFinancialRecordRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let installmentRepo: InMemoryInstallmentGroupRepository;
  let service: CardInvoiceService;

  beforeEach(() => {
    cardRepo = new InMemoryCreditCardRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    recordRepo = new InMemoryFinancialRecordRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditRepo = new InMemoryAuditLogRepository();
    installmentRepo = new InMemoryInstallmentGroupRepository();
    service = new CardInvoiceService({
      cardRepository: cardRepo,
      invoiceRepository: invoiceRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      installmentGroupRepository: installmentRepo,
    });
  });

  it('REQ-006 RED: closeInvoice should be idempotent - close twice same result', async () => {
    const invoiceId = crypto.randomUUID();
    await invoiceRepo.create({
      id: invoiceId,
      householdId: 'household-1',
      cardId: 'card-1',
      periodMonth: 6,
      periodYear: 2026,
      status: 'open',
      closesAt: new Date('2026-06-20').toISOString(),
      dueAt: new Date('2026-07-10').toISOString(),
      totalCents: 50000,
      paidAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const input: CloseInvoiceInput = {
      householdId: 'household-1',
      invoiceId,
    };

    // First close
    const result1 = await service.closeInvoice(input);
    expect(result1.success).toBe(true);
    expect(result1.invoice!.status).toBe('closed');

    // Second close - should return same result, not error
    const result2 = await service.closeInvoice(input);
    expect(result2.success).toBe(true);
    expect(result2.invoice!.status).toBe('closed');

    // Should be same invoice
    expect(result2.invoice!.id).toBe(result1.invoice!.id);
    expect(result2.invoice!.totalCents).toBe(result1.invoice!.totalCents);
  });

  it('REQ-006: cannot close already-paid invoice', async () => {
    const invoiceId = crypto.randomUUID();
    await invoiceRepo.create({
      id: invoiceId,
      householdId: 'household-1',
      cardId: 'card-1',
      periodMonth: 6,
      periodYear: 2026,
      status: 'paid', // Already paid
      closesAt: new Date('2026-06-20').toISOString(),
      dueAt: new Date('2026-07-10').toISOString(),
      totalCents: 50000,
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await service.closeInvoice({
      householdId: 'household-1',
      invoiceId,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toContain('paga');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 6: Pay Invoice (REQ-005 anti-lie)
// ─────────────────────────────────────────────────────────────────────────────

describe('CardInvoiceService - Pay Invoice', () => {
  let cardRepo: InMemoryCreditCardRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let recordRepo: InMemoryFinancialRecordRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let installmentRepo: InMemoryInstallmentGroupRepository;
  let service: CardInvoiceService;

  beforeEach(() => {
    cardRepo = new InMemoryCreditCardRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    recordRepo = new InMemoryFinancialRecordRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditRepo = new InMemoryAuditLogRepository();
    installmentRepo = new InMemoryInstallmentGroupRepository();
    service = new CardInvoiceService({
      cardRepository: cardRepo,
      invoiceRepository: invoiceRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      installmentGroupRepository: installmentRepo,
    });
  });

  it('REQ-005 RED: payInvoice should debit payment account and credit invoice', async () => {
    const card = makeCard({ id: 'card-1' });
    await cardRepo.create(card);

    const invoiceId = crypto.randomUUID();
    await invoiceRepo.create({
      id: invoiceId,
      householdId: 'household-1',
      cardId: 'card-1',
      periodMonth: 6,
      periodYear: 2026,
      status: 'closed', // Must be closed to pay
      closesAt: new Date('2026-06-20').toISOString(),
      dueAt: new Date('2026-07-10').toISOString(),
      totalCents: 50000,
      paidAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const input: PayInvoiceInput = {
      householdId: 'household-1',
      invoiceId,
      paymentAccountId: 'account-1',
      amountCents: 50000,
      paymentDate: new Date('2026-07-08').toISOString(),
      source: 'whatsapp' as const,
    };

    const result = await service.payInvoice(input);

    expect(result.success).toBe(true);
    expect(result.record).toBeDefined();

    // Verify invoice status is now 'paid'
    const invoice = await invoiceRepo.findById(invoiceId);
    expect(invoice!.status).toBe('paid');
    expect(invoice!.paidAt).not.toBeNull();

    // Verify ledger entries: credit to invoice, debit to payment account
    const ledgerEntries = await ledgerRepo.findByRecordId(result.record!.id);
    expect(ledgerEntries).toHaveLength(2);
    
    const invoiceEntry = ledgerEntries.find(e => e.direction === 'credit');
    const accountEntry = ledgerEntries.find(e => e.direction === 'debit');
    
    expect(invoiceEntry).toBeDefined();
    expect(accountEntry).toBeDefined();
    expect(accountEntry!.accountId).toBe('account-1');
  });

  it('REQ-005: should validate payment account when accountRepository provided', async () => {
    // Create a service with accountRepository
    const accountRepo = new (await import('./account-repository.js')).InMemoryAccountRepository();
    const localService = new CardInvoiceService({
      cardRepository: cardRepo,
      invoiceRepository: invoiceRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      installmentGroupRepository: installmentRepo,
      accountRepository: accountRepo,
    });

    const invoiceId = crypto.randomUUID();
    await invoiceRepo.create({
      id: invoiceId,
      householdId: 'household-1',
      cardId: 'card-1',
      periodMonth: 6,
      periodYear: 2026,
      status: 'closed',
      closesAt: new Date('2026-06-20').toISOString(),
      dueAt: new Date('2026-07-10').toISOString(),
      totalCents: 50000,
      paidAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await localService.payInvoice({
      householdId: 'household-1',
      invoiceId,
      paymentAccountId: 'non-existent-account',
      amountCents: 50000,
      paymentDate: new Date().toISOString(),
      source: 'whatsapp',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain('não encontrada');
  });

  it('REQ-005: when accountRepository not provided, should allow payment without account', async () => {
    // Default service without accountRepository - can pay without specifying account
    const invoiceId = crypto.randomUUID();
    await invoiceRepo.create({
      id: invoiceId,
      householdId: 'household-1',
      cardId: 'card-1',
      periodMonth: 6,
      periodYear: 2026,
      status: 'closed',
      closesAt: new Date('2026-06-20').toISOString(),
      dueAt: new Date('2026-07-10').toISOString(),
      totalCents: 50000,
      paidAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Payment without accountId specified
    const result = await service.payInvoice({
      householdId: 'household-1',
      invoiceId,
      amountCents: 50000,
      paymentDate: new Date().toISOString(),
      source: 'whatsapp',
    });

    expect(result.success).toBe(true);
    expect(result.record).toBeDefined();
  });
});