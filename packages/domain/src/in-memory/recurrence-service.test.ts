import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryRecurrenceRepository } from './recurrence-repository.js';
import { InMemoryRecurrenceOccurrenceRepository } from './recurrence-occurrence-repository.js';
import { InMemoryFinancialRecordRepository } from './financial-record-repository.js';
import { InMemoryLedgerRepository } from './ledger-repository.js';
import { InMemoryAuditLogRepository } from './audit-log-repository.js';
import { InMemoryCreditCardRepository } from './credit-card-repository.js';
import { InMemoryInvoiceRepository } from './invoice-repository.js';
import { InMemoryInstallmentGroupRepository } from './installment-group-repository.js';
import { InMemoryBillRepository } from './bill-repository.js';
import { InMemoryAccountRepository } from './account-repository.js';
import { RecurrenceService } from '../core/services/recurrence-service.js';
import type { RecurrencePeriod, RecurrenceTargetType } from '../core/entities/recurrence.js';

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 1: Create recurrence with 12 occurrences (REQ-014)
// RED FIRST: should create recurrence + 12 future occurrences
// ─────────────────────────────────────────────────────────────────────────────

describe('RecurrenceService - Create Recurrence', () => {
  let occurrenceRepo: InMemoryRecurrenceOccurrenceRepository;
  let recordRepo: InMemoryFinancialRecordRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let billRepo: InMemoryBillRepository;
  let cardRepo: InMemoryCreditCardRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let installmentRepo: InMemoryInstallmentGroupRepository;
  let accountRepo: InMemoryAccountRepository;
  let recurrenceRepo: InMemoryRecurrenceRepository;
  let service: RecurrenceService;

  beforeEach(() => {
    occurrenceRepo = new InMemoryRecurrenceOccurrenceRepository();
    recordRepo = new InMemoryFinancialRecordRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditRepo = new InMemoryAuditLogRepository();
    billRepo = new InMemoryBillRepository();
    cardRepo = new InMemoryCreditCardRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    installmentRepo = new InMemoryInstallmentGroupRepository();
    accountRepo = new InMemoryAccountRepository();
    recurrenceRepo = new InMemoryRecurrenceRepository();
    service = new RecurrenceService({
      recurrenceRepository: recurrenceRepo,
      occurrenceRepository: occurrenceRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      billRepository: billRepo,
      cardRepository: cardRepo,
      invoiceRepository: invoiceRepo,
      installmentGroupRepository: installmentRepo,
      accountRepository: accountRepo,
    });
  });

  it('REQ-014 RED: should create recurrence with at least 12 future occurrences', async () => {
    const input = {
      householdId: 'household-1',
      description: 'Netflix',
      amountCents: 5500,
      period: 'monthly' as RecurrencePeriod,
      targetType: 'payable_bill' as RecurrenceTargetType,
      firstDate: new Date('2026-06-01').toISOString(),
      accountId: null,
      cardId: null,
      categoryId: null,
    };

    const result = await service.createRecurrence(input);

    expect(result.success).toBe(true);
    expect(result.recurrence).toBeDefined();
    expect(result.recurrence!.period).toBe('monthly');
    expect(result.occurrences?.length ?? 0).toBeGreaterThanOrEqual(12);
  });

  it('REQ-014: monthly recurrence creates one occurrence per month', async () => {
    const result = await service.createRecurrence({
      householdId: 'household-1',
      description: 'Aluguel',
      amountCents: 150000,
      period: 'monthly',
      targetType: 'account_debit',
      firstDate: new Date('2026-06-01').toISOString(),
      accountId: 'account-1',
    });

    expect(result.success).toBe(true);
    expect(result.occurrences?.length ?? 0).toBeGreaterThanOrEqual(12);

    // Check first occurrence is June 2026
    const sorted = [...(result.occurrences ?? [])].sort(
      (a, b) => new Date(a.occurrenceDate).getTime() - new Date(b.occurrenceDate).getTime()
    );
    expect(sorted[0].occurrenceDate).toContain('2026-06');
    expect(sorted[1].occurrenceDate).toContain('2026-07');
    expect(sorted[11].occurrenceDate).toContain('2027-05'); // 12 months later
  });

  it('REQ-014: weekly recurrence creates occurrences for horizon', async () => {
    const result = await service.createRecurrence({
      householdId: 'household-1',
      description: 'Academia semanal',
      amountCents: 12000,
      period: 'weekly',
      targetType: 'account_debit',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    expect(result.success).toBe(true);
    // Weekly creates at least horizon_months worth
    expect(result.occurrences?.length ?? 0).toBeGreaterThanOrEqual(12);
  });

  it('REQ-014: daily recurrence creates occurrences for horizon', async () => {
    const result = await service.createRecurrence({
      householdId: 'household-1',
      description: 'Cantina diária',
      amountCents: 1500,
      period: 'daily',
      targetType: 'payable_bill',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    expect(result.success).toBe(true);
    // Daily creates at least horizon_months worth
    expect(result.occurrences?.length ?? 0).toBeGreaterThanOrEqual(12);
  });

  it('REQ-014: yearly recurrence creates occurrences for horizon', async () => {
    const result = await service.createRecurrence({
      householdId: 'household-1',
      description: 'IPVA',
      amountCents: 250000,
      period: 'yearly',
      targetType: 'payable_bill',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    expect(result.success).toBe(true);
    // Yearly creates at least horizon_months worth
    expect(result.occurrences?.length ?? 0).toBeGreaterThanOrEqual(12);
  });

  it('REQ-014: biweekly recurrence creates occurrences for horizon', async () => {
    const result = await service.createRecurrence({
      householdId: 'household-1',
      description: 'Celular',
      amountCents: 7500,
      period: 'biweekly',
      targetType: 'account_debit',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    expect(result.success).toBe(true);
    // Biweekly creates at least horizon_months worth
    expect(result.occurrences?.length ?? 0).toBeGreaterThanOrEqual(12);
  });

  it('REQ-014: each occurrence has unique recurrenceId+occurrenceDate', async () => {
    const result = await service.createRecurrence({
      householdId: 'household-1',
      description: 'Test',
      amountCents: 1000,
      period: 'monthly',
      targetType: 'payable_bill',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    const dates = (result.occurrences ?? []).map(o => o.occurrenceDate);
    const uniqueDates = new Set(dates);
    expect(uniqueDates.size).toBe(dates.length); // All unique
  });

  it('REQ-014: occurrences should be stored in repository', async () => {
    const result = await service.createRecurrence({
      householdId: 'household-1',
      description: 'Test',
      amountCents: 1000,
      period: 'monthly',
      targetType: 'payable_bill',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    const stored = await occurrenceRepo.findByRecurrenceId(result.recurrence!.id);
    expect(stored.length).toBe(result.occurrences?.length ?? 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 2: Maintain Horizon idempotent (REQ-015)
// RED FIRST: maintainHorizon should create only missing occurrences
// ─────────────────────────────────────────────────────────────────────────────

describe('RecurrenceService - Maintain Horizon', () => {
  let occurrenceRepo: InMemoryRecurrenceOccurrenceRepository;
  let recordRepo: InMemoryFinancialRecordRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let billRepo: InMemoryBillRepository;
  let cardRepo: InMemoryCreditCardRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let installmentRepo: InMemoryInstallmentGroupRepository;
  let accountRepo: InMemoryAccountRepository;
  let recurrenceRepo: InMemoryRecurrenceRepository;
  let service: RecurrenceService;

  beforeEach(() => {
    occurrenceRepo = new InMemoryRecurrenceOccurrenceRepository();
    recordRepo = new InMemoryFinancialRecordRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditRepo = new InMemoryAuditLogRepository();
    billRepo = new InMemoryBillRepository();
    cardRepo = new InMemoryCreditCardRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    installmentRepo = new InMemoryInstallmentGroupRepository();
    accountRepo = new InMemoryAccountRepository();
    recurrenceRepo = new InMemoryRecurrenceRepository();
    service = new RecurrenceService({
      recurrenceRepository: recurrenceRepo,
      occurrenceRepository: occurrenceRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      billRepository: billRepo,
      cardRepository: cardRepo,
      invoiceRepository: invoiceRepo,
      installmentGroupRepository: installmentRepo,
      accountRepository: accountRepo,
    });
  });

  it('REQ-015 RED: maintainHorizon should be idempotent - run twice no duplicate', async () => {
    const createResult = await service.createRecurrence({
      householdId: 'household-1',
      description: 'Netflix',
      amountCents: 5500,
      period: 'monthly',
      targetType: 'payable_bill',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    // First maintain
    const maintain1 = await service.maintainHorizon(createResult.recurrence!.id);
    expect(maintain1.success).toBe(true);

    // Second maintain - should be idempotent
    const maintain2 = await service.maintainHorizon(createResult.recurrence!.id);
    expect(maintain2.success).toBe(true);

    // Should NOT have duplicate occurrences
    const allOccurrences = await occurrenceRepo.findByRecurrenceId(createResult.recurrence!.id);
    const dates = allOccurrences.map(o => o.occurrenceDate);
    const uniqueDates = new Set(dates);
    expect(uniqueDates.size).toBe(dates.length);
  });

  it('REQ-015: maintainHorizon creates only missing future occurrences', async () => {
    const createResult = await service.createRecurrence({
      householdId: 'household-1',
      description: 'Test',
      amountCents: 1000,
      period: 'monthly',
      targetType: 'payable_bill',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    const recurrenceId = createResult.recurrence!.id;
    const initialCount = (await occurrenceRepo.findByRecurrenceId(recurrenceId)).length;

    // Advance time 6 months - maintain should add ~6 more
    // For this test, we simulate by just calling maintain again
    await service.maintainHorizon(recurrenceId);
    
    // Should not create duplicate of existing occurrences
    const afterCount = (await occurrenceRepo.findByRecurrenceId(recurrenceId)).length;
    expect(afterCount).toBe(initialCount); // No change since no time passed
  });

  it('REQ-015: when occurrence is processed, maintainHorizon creates next to keep horizon', async () => {
    const createResult = await service.createRecurrence({
      householdId: 'household-1',
      description: 'Test',
      amountCents: 1000,
      period: 'monthly',
      targetType: 'payable_bill',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    const recurrenceId = createResult.recurrence!.id;
    const initialOccurrences = await occurrenceRepo.findByRecurrenceId(recurrenceId);

    // Mark first pending occurrence as processed
    const pending = initialOccurrences.filter(o => o.status === 'pending');
    await occurrenceRepo.update(pending[0].id, { status: 'processed' });

    // Maintain horizon should create next occurrence
    const result = await service.maintainHorizon(recurrenceId);
    
    expect(result.success).toBe(true);
    // Should have created at least one new occurrence
    expect(result.createdCount).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 3: Process occurrence creates records (REQ-016, REQ-017)
// ─────────────────────────────────────────────────────────────────────────────

describe('RecurrenceService - Process Occurrence', () => {
  let occurrenceRepo: InMemoryRecurrenceOccurrenceRepository;
  let recordRepo: InMemoryFinancialRecordRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let billRepo: InMemoryBillRepository;
  let cardRepo: InMemoryCreditCardRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let installmentRepo: InMemoryInstallmentGroupRepository;
  let accountRepo: InMemoryAccountRepository;
  let recurrenceRepo: InMemoryRecurrenceRepository;
  let service: RecurrenceService;

  beforeEach(() => {
    occurrenceRepo = new InMemoryRecurrenceOccurrenceRepository();
    recordRepo = new InMemoryFinancialRecordRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditRepo = new InMemoryAuditLogRepository();
    billRepo = new InMemoryBillRepository();
    cardRepo = new InMemoryCreditCardRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    installmentRepo = new InMemoryInstallmentGroupRepository();
    accountRepo = new InMemoryAccountRepository();
    recurrenceRepo = new InMemoryRecurrenceRepository();
    service = new RecurrenceService({
      recurrenceRepository: recurrenceRepo,
      occurrenceRepository: occurrenceRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      billRepository: billRepo,
      cardRepository: cardRepo,
      invoiceRepository: invoiceRepo,
      installmentGroupRepository: installmentRepo,
      accountRepository: accountRepo,
    });
  });

  it('REQ-016 RED: payable_bill occurrence creates bill + record', async () => {
    const createResult = await service.createRecurrence({
      householdId: 'household-1',
      description: 'Energia',
      amountCents: 15000,
      period: 'monthly',
      targetType: 'payable_bill',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    const occurrence = (await occurrenceRepo.findByRecurrenceId(createResult.recurrence!.id))
      .sort((a, b) => new Date(a.occurrenceDate).getTime() - new Date(b.occurrenceDate).getTime())[0];

    const processResult = await service.processOccurrence(occurrence.id);

    expect(processResult.success).toBe(true);
    expect(processResult.bill).toBeDefined();
    expect(processResult.bill!.amountCents).toBe(15000);
    expect(processResult.bill!.status).toBe('pending');

    // Verify bill is stored
    const storedBill = await billRepo.findById(processResult.bill!.id);
    expect(storedBill).not.toBeNull();
  });

  it('REQ-016: overdue unpaid bill rolls to next month view', async () => {
    // Create recurrence
    const createResult = await service.createRecurrence({
      householdId: 'household-1',
      description: 'Internet',
      amountCents: 12000,
      period: 'monthly',
      targetType: 'payable_bill',
      firstDate: new Date('2026-05-01').toISOString(),
    });

    const occurrence = (await occurrenceRepo.findByRecurrenceId(createResult.recurrence!.id))
      .find(o => o.occurrenceDate.includes('2026-05'));

    // Process it to create bill
    await service.processOccurrence(occurrence!.id);

    // Mark bill as overdue
    const bills = await billRepo.findByRecurrenceId(createResult.recurrence!.id);
    await billRepo.update(bills[0].id, { status: 'overdue' });

    // Check overdue bills
    const overdueBills = await billRepo.findOverdueByHouseholdId('household-1');
    expect(overdueBills.length).toBeGreaterThan(0);
    expect(overdueBills[0].status).toBe('overdue');
  });

  it('REQ-017: late payment with extra creates interest record', async () => {
    const createResult = await service.createRecurrence({
      householdId: 'household-1',
      description: 'Test',
      amountCents: 10000,
      period: 'monthly',
      targetType: 'payable_bill',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    const occurrence = (await occurrenceRepo.findByRecurrenceId(createResult.recurrence!.id))[0];
    await service.processOccurrence(occurrence.id);

    const bills = await billRepo.findByRecurrenceId(createResult.recurrence!.id);

    // Pay with extra (late fee)
    const payResult = await service.payBill({
      householdId: 'household-1',
      billId: bills[0].id,
      paymentAccountId: 'account-1',
      amountCents: 10500, // Extra 500
      paymentDate: new Date('2026-06-15').toISOString(),
    });

    expect(payResult.success).toBe(true);
    
    // Check interest record was created
    const records = await recordRepo.findByHouseholdId('household-1');
    const interestRecords = records.filter(r => r.type === 'interest');
    expect(interestRecords.length).toBeGreaterThan(0);
    expect(interestRecords[0].amountCents).toBe(500); // The extra 500
  });

  it('REQ-016: account_debit occurrence creates expense + ledger debit', async () => {
    // Create account first
    await accountRepo.create({
      id: 'account-1',
      householdId: 'household-1',
      name: 'Conta Corrente',
      type: 'checking' as any,
      scope: 'shared' as any,
      ownerUserId: null,
      initialBalanceCents: 100000,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const createResult = await service.createRecurrence({
      householdId: 'household-1',
      description: 'Spotify',
      amountCents: 5500,
      period: 'monthly',
      targetType: 'account_debit',
      accountId: 'account-1',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    const occurrence = (await occurrenceRepo.findByRecurrenceId(createResult.recurrence!.id))[0];
    const processResult = await service.processOccurrence(occurrence.id);

    expect(processResult.success).toBe(true);
    expect(processResult.record).toBeDefined();
    expect(processResult.record!.type).toBe('expense');
    expect(processResult.record!.accountId).toBe('account-1');

    // Verify ledger entry
    const ledgerEntries = await ledgerRepo.findByRecordId(processResult.record!.id);
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0].direction).toBe('debit');
    expect(ledgerEntries[0].accountId).toBe('account-1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 4: Edit occurrence scopes (REQ-018)
// ─────────────────────────────────────────────────────────────────────────────

describe('RecurrenceService - Edit Occurrence', () => {
  let occurrenceRepo: InMemoryRecurrenceOccurrenceRepository;
  let recordRepo: InMemoryFinancialRecordRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let billRepo: InMemoryBillRepository;
  let cardRepo: InMemoryCreditCardRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let installmentRepo: InMemoryInstallmentGroupRepository;
  let accountRepo: InMemoryAccountRepository;
  let recurrenceRepo: InMemoryRecurrenceRepository;
  let service: RecurrenceService;

  beforeEach(() => {
    occurrenceRepo = new InMemoryRecurrenceOccurrenceRepository();
    recordRepo = new InMemoryFinancialRecordRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditRepo = new InMemoryAuditLogRepository();
    billRepo = new InMemoryBillRepository();
    cardRepo = new InMemoryCreditCardRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    installmentRepo = new InMemoryInstallmentGroupRepository();
    accountRepo = new InMemoryAccountRepository();
    recurrenceRepo = new InMemoryRecurrenceRepository();
    service = new RecurrenceService({
      recurrenceRepository: recurrenceRepo,
      occurrenceRepository: occurrenceRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      billRepository: billRepo,
      cardRepository: cardRepo,
      invoiceRepository: invoiceRepo,
      installmentGroupRepository: installmentRepo,
      accountRepository: accountRepo,
    });
  });

  it('REQ-018 RED: edit single occurrence changes only that one', async () => {
    const createResult = await service.createRecurrence({
      householdId: 'household-1',
      description: 'Test',
      amountCents: 1000,
      period: 'monthly',
      targetType: 'payable_bill',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    const recurrenceId = createResult.recurrence!.id;
    const occurrences = await occurrenceRepo.findByRecurrenceId(recurrenceId);
    const sorted = [...occurrences].sort(
      (a, b) => new Date(a.occurrenceDate).getTime() - new Date(b.occurrenceDate).getTime()
    );

    // Edit only the 3rd occurrence (future)
    const editResult = await service.editOccurrence({
      occurrenceId: sorted[2].id,
      amountCents: 2000,
      description: 'Changed',
    });

    expect(editResult.success).toBe(true);

    // Check only 3rd occurrence changed
    const afterOccurrences = await occurrenceRepo.findByRecurrenceId(recurrenceId);
    const afterSorted = [...afterOccurrences].sort(
      (a, b) => new Date(a.occurrenceDate).getTime() - new Date(b.occurrenceDate).getTime()
    );

    expect(afterSorted[0].amountCents).toBe(1000); // Unchanged
    expect(afterSorted[1].amountCents).toBe(1000); // Unchanged
    expect(afterSorted[2].amountCents).toBe(2000); // Changed
    expect(afterSorted[3].amountCents).toBe(1000); // Future unchanged
  });

  it('REQ-018: edit future occurrences changes from that point onward', async () => {
    const createResult = await service.createRecurrence({
      householdId: 'household-1',
      description: 'Test',
      amountCents: 1000,
      period: 'monthly',
      targetType: 'payable_bill',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    const recurrenceId = createResult.recurrence!.id;
    const occurrences = await occurrenceRepo.findByRecurrenceId(recurrenceId);
    const sorted = [...occurrences].sort(
      (a, b) => new Date(a.occurrenceDate).getTime() - new Date(b.occurrenceDate).getTime()
    );

    // Edit all future from 4th occurrence onwards
    const editResult = await service.editFutureOccurrences({
      fromOccurrenceId: sorted[3].id,
      amountCents: 3000,
    });

    expect(editResult.success).toBe(true);
    expect(editResult.editedCount).toBeGreaterThan(0);

    // Check occurrences after edit
    const afterOccurrences = await occurrenceRepo.findByRecurrenceId(recurrenceId);
    const afterSorted = [...afterOccurrences].sort(
      (a, b) => new Date(a.occurrenceDate).getTime() - new Date(b.occurrenceDate).getTime()
    );

    expect(afterSorted[0].amountCents).toBe(1000); // Before edit point
    expect(afterSorted[1].amountCents).toBe(1000); // Before edit point
    expect(afterSorted[2].amountCents).toBe(1000); // Before edit point
    expect(afterSorted[3].amountCents).toBe(3000); // Changed and forward
  });

  it('REQ-018: edit all occurrences changes entire series', async () => {
    const createResult = await service.createRecurrence({
      householdId: 'household-1',
      description: 'Test',
      amountCents: 1000,
      period: 'monthly',
      targetType: 'payable_bill',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    const recurrenceId = createResult.recurrence!.id;

    // Edit all occurrences
    const editResult = await service.editAllOccurrences({
      recurrenceId,
      description: 'Updated Series',
    });

    expect(editResult.success).toBe(true);

    // Check all occurrences changed
    const afterOccurrences = await occurrenceRepo.findByRecurrenceId(recurrenceId);
    for (const occ of afterOccurrences) {
      expect(occ.description).toBe('Updated Series');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 5: TedCronPlanner contract
// ─────────────────────────────────────────────────────────────────────────────

describe('RecurrenceService - Cron Planner Integration', () => {
  let occurrenceRepo: InMemoryRecurrenceOccurrenceRepository;
  let recordRepo: InMemoryFinancialRecordRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let billRepo: InMemoryBillRepository;
  let cardRepo: InMemoryCreditCardRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let installmentRepo: InMemoryInstallmentGroupRepository;
  let accountRepo: InMemoryAccountRepository;
  let recurrenceRepo: InMemoryRecurrenceRepository;
  let service: RecurrenceService;

  beforeEach(() => {
    occurrenceRepo = new InMemoryRecurrenceOccurrenceRepository();
    recordRepo = new InMemoryFinancialRecordRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditRepo = new InMemoryAuditLogRepository();
    billRepo = new InMemoryBillRepository();
    cardRepo = new InMemoryCreditCardRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    installmentRepo = new InMemoryInstallmentGroupRepository();
    accountRepo = new InMemoryAccountRepository();
    recurrenceRepo = new InMemoryRecurrenceRepository();
    service = new RecurrenceService({
      recurrenceRepository: recurrenceRepo,
      occurrenceRepository: occurrenceRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      billRepository: billRepo,
      cardRepository: cardRepo,
      invoiceRepository: invoiceRepo,
      installmentGroupRepository: installmentRepo,
      accountRepository: accountRepo,
    });
  });

  it('cron: should create plan for overdue occurrences', async () => {
    // Create recurrence
    const createResult = await service.createRecurrence({
      householdId: 'household-1',
      description: 'Test',
      amountCents: 1000,
      period: 'monthly',
      targetType: 'payable_bill',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    // Mark first occurrence as processed and overdue
    const occurrences = await occurrenceRepo.findByRecurrenceId(createResult.recurrence!.id);
    await occurrenceRepo.update(occurrences[0].id, { status: 'overdue' });

    // Cron planner should detect overdue
    const overdueOccurrences = await occurrenceRepo.findOverdueByHouseholdId('household-1');
    expect(overdueOccurrences.length).toBeGreaterThan(0);
  });

  it('cron: processOccurrence is idempotent - run twice same result', async () => {
    const createResult = await service.createRecurrence({
      householdId: 'household-1',
      description: 'Test',
      amountCents: 1000,
      period: 'monthly',
      targetType: 'payable_bill',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    const occurrence = (await occurrenceRepo.findByRecurrenceId(createResult.recurrence!.id))[0];

    // First process
    const result1 = await service.processOccurrence(occurrence.id);

    // Second process - should be idempotent
    const result2 = await service.processOccurrence(occurrence.id);

    // Both should succeed
    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    // Should not create duplicate bills
    const bills = await billRepo.findByRecurrenceId(createResult.recurrence!.id);
    expect(bills.length).toBe(1);
  });

  it('cron: failure returns success=false without partial', async () => {
    // Process non-existent occurrence
    const result = await service.processOccurrence('non-existent-id');

    expect(result.success).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.record ?? null).toBeNull(); // No partial record
  });
});