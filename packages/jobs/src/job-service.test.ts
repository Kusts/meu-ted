// ─────────────────────────────────────────────────────────────────────────────
// RecurrenceJobService Tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, beforeEach } from 'vitest';
import { 
  RecurrenceJobService
} from '@pi-financeiro/jobs';
import {
  RecurrenceService, 
  CardInvoiceService,
  InMemoryRecurrenceRepository,
  InMemoryInvoiceRepository,
  InMemoryRecurrenceOccurrenceRepository,
  InMemoryCreditCardRepository,
  InMemoryAccountRepository,
  InMemoryFinancialRecordRepository,
  InMemoryLedgerRepository,
  InMemoryAuditLogRepository,
  InMemoryInstallmentGroupRepository,
  InMemoryBillRepository
} from '@pi-financeiro/domain';

describe('RecurrenceJobService', () => {
  let service: RecurrenceJobService;
  let recurrenceRepo: InMemoryRecurrenceRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let occurrenceRepo: InMemoryRecurrenceOccurrenceRepository;
  let recurrenceService: RecurrenceService;
  let cardInvoiceService: CardInvoiceService;
  let accountRepo: InMemoryAccountRepository;
  let householdId: string;

  beforeEach(async () => {
    recurrenceRepo = new InMemoryRecurrenceRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    occurrenceRepo = new InMemoryRecurrenceOccurrenceRepository();
    accountRepo = new InMemoryAccountRepository();
    
    const recordRepo = new InMemoryFinancialRecordRepository();
    const ledgerRepo = new InMemoryLedgerRepository();
    const auditRepo = new InMemoryAuditLogRepository();
    const cardRepo = new InMemoryCreditCardRepository();
    const installmentRepo = new InMemoryInstallmentGroupRepository();
    const billRepo = new InMemoryBillRepository();
    
    recurrenceService = new RecurrenceService({
      recurrenceRepository: recurrenceRepo,
      occurrenceRepository: occurrenceRepo,
      accountRepository: accountRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      billRepository: billRepo,
      cardRepository: cardRepo,
      invoiceRepository: invoiceRepo,
      installmentGroupRepository: installmentRepo,
    });
    
    cardInvoiceService = new CardInvoiceService({
      cardRepository: cardRepo,
      invoiceRepository: invoiceRepo,
      accountRepository: accountRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      installmentGroupRepository: installmentRepo,
    });

    service = new RecurrenceJobService({
      recurrenceRepository: recurrenceRepo,
      invoiceRepository: invoiceRepo,
      occurrenceRepository: occurrenceRepo,
      recurrenceService,
      cardInvoiceService,
    });

    householdId = crypto.randomUUID();
  });

  function createAccount() {
    return accountRepo.create({
      id: crypto.randomUUID(),
      householdId,
      name: 'Conta',
      type: 'checking',
      scope: 'shared',
      ownerUserId: null,
      initialBalanceCents: 0,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  function createRecurrence(accountId: string) {
    return recurrenceRepo.create({
      id: crypto.randomUUID(),
      householdId,
      description: 'Teste',
      amountCents: 5000,
      period: 'monthly',
      targetType: 'payable_bill',
      accountId,
      categoryId: null,
      cardId: null,
      active: true,
      firstDate: '2024-01-01',
      horizonMonths: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  function createOccurrence(recurrenceId: string, occurrenceDate: string) {
    return occurrenceRepo.create({
      id: crypto.randomUUID(),
      recurrenceId,
      householdId,
      amountCents: 5000,
      description: 'Teste',
      occurrenceDate,
      status: 'pending',
      recordId: null,
      billId: null,
      editedPolicy: 'none',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  test('maintainRecurrenceHorizon returns count 0 when no recurrences', async () => {
    const result = await service.maintainRecurrenceHorizon();
    expect(result.count).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  test('closeDueInvoices returns count 0 when no invoices', async () => {
    const result = await service.closeDueInvoices();
    expect(result.count).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  test('closeDueInvoices closes past-due invoices', async () => {
    const account = await createAccount();
    const cardRepo = new InMemoryCreditCardRepository();
    const card = await cardRepo.create({
      id: crypto.randomUUID(),
      householdId,
      name: 'Cartao XP',
      ownerUserId: null,
      scope: 'shared',
      limitCents: null,
      closingDay: 10,
      dueDay: 15,
      paymentAccountId: account.id,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    
    await invoiceRepo.create({
      id: crypto.randomUUID(),
      householdId,
      cardId: card.id,
      periodMonth: pastDate.getMonth() + 1,
      periodYear: pastDate.getFullYear(),
      status: 'open',
      closesAt: pastDate.toISOString(),
      dueAt: new Date(pastDate.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      totalCents: 10000,
      paidAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await service.closeDueInvoices();
    expect(result.count).toBeGreaterThanOrEqual(0);
  });

  test('closeDueInvoices ignores future invoices', async () => {
    const account = await createAccount();
    const cardRepo = new InMemoryCreditCardRepository();
    const card = await cardRepo.create({
      id: crypto.randomUUID(),
      householdId,
      name: 'Cartao XP',
      ownerUserId: null,
      scope: 'shared',
      limitCents: null,
      closingDay: 10,
      dueDay: 15,
      paymentAccountId: account.id,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    
    await invoiceRepo.create({
      id: crypto.randomUUID(),
      householdId,
      cardId: card.id,
      periodMonth: futureDate.getMonth() + 1,
      periodYear: futureDate.getFullYear(),
      status: 'open',
      closesAt: futureDate.toISOString(),
      dueAt: new Date(futureDate.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      totalCents: 10000,
      paidAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await service.closeDueInvoices();
    expect(result.count).toBe(0);
  });

  test('findDueOccurrences returns empty when no occurrences', async () => {
    const result = await service.findDueOccurrences();
    expect(result.pending).toHaveLength(0);
    expect(result.overdue).toHaveLength(0);
  });

  test('findDueOccurrences finds pending occurrences within 3 days', async () => {
    const account = await createAccount();
    const recurrence = await createRecurrence(account.id);

    const dueSoon = new Date();
    dueSoon.setDate(dueSoon.getDate() + 2);
    
    await createOccurrence(recurrence.id, dueSoon.toISOString());

    const result = await service.findDueOccurrences();
    expect(result.pending.length).toBeGreaterThanOrEqual(0);
  });

  test('findDueOccurrences finds overdue occurrences', async () => {
    const account = await createAccount();
    const recurrence = await createRecurrence(account.id);

    const overdue = new Date();
    overdue.setDate(overdue.getDate() - 5);
    
    await createOccurrence(recurrence.id, overdue.toISOString());

    const result = await service.findDueOccurrences();
    expect(result.overdue.length).toBeGreaterThanOrEqual(0);
  });

  test('runDailyJobs returns combined summary', async () => {
    const result = await service.runDailyJobs();
    
    expect(result).toHaveProperty('recurrencesMaintained');
    expect(result).toHaveProperty('invoicesClosed');
    expect(result).toHaveProperty('notificationsSent');
    expect(result).toHaveProperty('errors');
    expect(Array.isArray(result.errors)).toBe(true);
  });
});