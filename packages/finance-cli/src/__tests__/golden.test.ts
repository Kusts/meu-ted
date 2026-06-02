// ─────────────────────────────────────────────────────────────────────────────
// Golden Tests - Financial Behavior
// These tests freeze the expected behavior of financial operations
// All tests share the same in-memory repositories for consistency
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FinancialRecordService,
  CardInvoiceService,
  CategoryService,
  ReportService,
  InMemoryAccountRepository,
  InMemoryCategoryRepository,
  InMemoryFinancialRecordRepository,
  InMemoryLedgerRepository,
  InMemoryAuditLogRepository,
  InMemoryIdempotencyRepository,
  InMemoryCreditCardRepository,
  InMemoryInvoiceRepository,
  InMemoryInstallmentGroupRepository,
} from '@pi-financeiro/domain';

// ─────────────────────────────────────────────────────────────────────────────
// Shared Repositories
// ─────────────────────────────────────────────────────────────────────────────

const TEST_HOUSEHOLD = 'test-household-1';

// Each test suite gets its own set of shared repos
interface Repos {
  accountRepo: InMemoryAccountRepository;
  categoryRepo: InMemoryCategoryRepository;
  recordRepo: InMemoryFinancialRecordRepository;
  ledgerRepo: InMemoryLedgerRepository;
  auditRepo: InMemoryAuditLogRepository;
  idempotencyRepo: InMemoryIdempotencyRepository;
  cardRepo: InMemoryCreditCardRepository;
  invoiceRepo: InMemoryInvoiceRepository;
  installmentRepo: InMemoryInstallmentGroupRepository;
}

function createSharedRepos(): Repos {
  return {
    accountRepo: new InMemoryAccountRepository(),
    categoryRepo: new InMemoryCategoryRepository(),
    recordRepo: new InMemoryFinancialRecordRepository(),
    ledgerRepo: new InMemoryLedgerRepository(),
    auditRepo: new InMemoryAuditLogRepository(),
    idempotencyRepo: new InMemoryIdempotencyRepository(),
    cardRepo: new InMemoryCreditCardRepository(),
    invoiceRepo: new InMemoryInvoiceRepository(),
    installmentRepo: new InMemoryInstallmentGroupRepository(),
  };
}

async function seedAccountsAndCategories(repos: Repos, householdId: string) {
  const account = await repos.accountRepo.create({
    id: 'acc-nubank',
    householdId,
    name: 'Nubank',
    type: 'checking' as any,
    scope: 'shared' as any,
    initialBalanceCents: 0,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const account2 = await repos.accountRepo.create({
    id: 'acc-itau',
    householdId,
    name: 'Itau',
    type: 'checking' as any,
    scope: 'shared' as any,
    initialBalanceCents: 0,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const expenseCategory = await repos.categoryRepo.create({
    id: 'cat-alimentacao',
    householdId,
    name: 'Alimentação',
    kind: 'expense' as any,
    color: '#F97316',
    icon: 'utensils',
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const incomeCategory = await repos.categoryRepo.create({
    id: 'cat-salario',
    householdId,
    name: 'Salário',
    kind: 'income' as any,
    color: '#22C55E',
    icon: 'wallet',
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return { account, account2, expenseCategory, incomeCategory };
}

function createRecordService(repos: Repos) {
  return new FinancialRecordService({
    accountRepository: repos.accountRepo,
    recordRepository: repos.recordRepo,
    ledgerRepository: repos.ledgerRepo,
    auditRepository: repos.auditRepo,
    idempotencyRepository: repos.idempotencyRepo,
  });
}

function createReportService(repos: Repos) {
  return new ReportService({
    recordRepository: repos.recordRepo,
    ledgerRepository: repos.ledgerRepo,
    accountRepository: repos.accountRepo,
    categoryRepository: repos.categoryRepo,
    budgetRepository: { findByHouseholdId: async () => [] } as any,
    invoiceRepository: { findByHouseholdId: async () => [] } as any,
    billRepository: { findByHouseholdId: async () => [] } as any,
    recurrenceRepository: { findByHouseholdId: async () => [] } as any,
  });
}

function createCardService(repos: Repos) {
  return new CardInvoiceService({
    cardRepository: repos.cardRepo,
    invoiceRepository: repos.invoiceRepo,
    recordRepository: repos.recordRepo,
    ledgerRepository: repos.ledgerRepo,
    auditRepository: repos.auditRepo,
    installmentGroupRepository: repos.installmentRepo,
    accountRepository: repos.accountRepo,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Golden Tests - Financial Behavior', () => {
  let repos: Repos;
  let ids: { accountId: string; account2Id: string; categoryId: string; incomeCategoryId: string };

  beforeEach(async () => {
    repos = createSharedRepos();
    const seeded = await seedAccountsAndCategories(repos, TEST_HOUSEHOLD);
    ids = {
      accountId: seeded.account.id,
      account2Id: seeded.account2.id,
      categoryId: seeded.expenseCategory.id,
      incomeCategoryId: seeded.incomeCategory.id,
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // 1. Despesa simples com todos os campos
  // ─────────────────────────────────────────────────────────────────────
  it('criar despesa com conta, categoria e valor', async () => {
    const service = createRecordService(repos);

    const result = await service.createExpense({
      householdId: TEST_HOUSEHOLD,
      accountId: ids.accountId,
      categoryId: ids.categoryId,
      amountCents: 3590,
      description: 'carne',
      date: '2026-06-02',
      source: 'whatsapp',
    });

    expect(result.success).toBe(true);
    expect(result.record).toBeDefined();
    expect(result.record!.amountCents).toBe(3590);
    expect(result.record!.description).toBe('carne');
    expect(result.record!.type).toBe('expense');
    expect(result.record!.status).toBe('posted');

    // Verify ledger entry
    const ledgerEntries = await repos.ledgerRepo.findByAccountId(ids.accountId);
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0].direction).toBe('debit');
    expect(ledgerEntries[0].amountCents).toBe(3590);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 2. Despesa sem conta válida
  // ─────────────────────────────────────────────────────────────────────
  it('criar despesa com conta inexistente retorna erro', async () => {
    const service = createRecordService(repos);

    const result = await service.createExpense({
      householdId: TEST_HOUSEHOLD,
      accountId: 'non-existent-account',
      categoryId: ids.categoryId,
      amountCents: 2000,
      description: 'almoço',
      date: '2026-06-02',
      source: 'whatsapp',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason!.toLowerCase()).toContain('não encont');
  });

  // ─────────────────────────────────────────────────────────────────────
  // 3. Receita simples
  // ─────────────────────────────────────────────────────────────────────
  it('criar receita', async () => {
    const service = createRecordService(repos);

    const result = await service.createIncome({
      householdId: TEST_HOUSEHOLD,
      accountId: ids.accountId,
      categoryId: ids.incomeCategoryId,
      amountCents: 500000,
      description: 'salário',
      date: '2026-06-01',
      source: 'whatsapp',
    });

    expect(result.success).toBe(true);
    expect(result.record).toBeDefined();
    expect(result.record!.amountCents).toBe(500000);
    expect(result.record!.type).toBe('income');
    expect(result.record!.status).toBe('posted');

    const ledgerEntries = await repos.ledgerRepo.findByAccountId(ids.accountId);
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0].direction).toBe('credit');
    expect(ledgerEntries[0].amountCents).toBe(500000);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 4. Transferência entre contas
  // ─────────────────────────────────────────────────────────────────────
  it('criar transferência', async () => {
    const service = createRecordService(repos);

    const result = await service.createTransfer({
      householdId: TEST_HOUSEHOLD,
      fromAccountId: ids.accountId,
      toAccountId: ids.account2Id,
      amountCents: 10000,
      description: 'transferência',
      date: '2026-06-02',
      source: 'whatsapp',
    });

    expect(result.success).toBe(true);
    expect(result.record).toBeDefined();
    expect(result.record!.type).toBe('transfer');
    expect(result.record!.fromAccountId).toBe(ids.accountId);
    expect(result.record!.toAccountId).toBe(ids.account2Id);

    // Both ledger entries
    const fromEntries = await repos.ledgerRepo.findByAccountId(ids.accountId);
    const toEntries = await repos.ledgerRepo.findByAccountId(ids.account2Id);
    expect(fromEntries).toHaveLength(1);
    expect(fromEntries[0].direction).toBe('debit');
    expect(fromEntries[0].amountCents).toBe(10000);
    expect(toEntries).toHaveLength(1);
    expect(toEntries[0].direction).toBe('credit');
    expect(toEntries[0].amountCents).toBe(10000);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 5. Relatório do mês
  // ─────────────────────────────────────────────────────────────────────
  it('relatório do mês retorna resumo', async () => {
    const service = createRecordService(repos);
    const reportService = createReportService(repos);

    // Empty month
    const empty = await reportService.currentMonthSummary(TEST_HOUSEHOLD);
    expect(empty.incomeCents).toBe(0);
    expect(empty.expenseCents).toBe(0);
    expect(empty.recordCount).toBe(0);

    // Add data
    await service.createExpense({
      householdId: TEST_HOUSEHOLD,
      accountId: ids.accountId,
      categoryId: ids.categoryId,
      amountCents: 5000,
      description: 'test expense',
      date: new Date().toISOString(),
      source: 'whatsapp',
    });

    await service.createIncome({
      householdId: TEST_HOUSEHOLD,
      accountId: ids.accountId,
      categoryId: ids.incomeCategoryId,
      amountCents: 10000,
      description: 'test income',
      date: new Date().toISOString(),
      source: 'whatsapp',
    });

    // Report with data (SHARED repos)
    const report = await reportService.currentMonthSummary(TEST_HOUSEHOLD);
    expect(report.expenseCents).toBe(5000);
    expect(report.incomeCents).toBe(10000);
    expect(report.recordCount).toBe(2);
    expect(report.month).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────
  // 6. Valor alto sem reviewService - cria normalmente
  // ─────────────────────────────────────────────────────────────────────
  it('valor alto sem reviewService cria normalmente', async () => {
    const service = createRecordService(repos);

    const result = await service.createExpense({
      householdId: TEST_HOUSEHOLD,
      accountId: ids.accountId,
      categoryId: ids.categoryId,
      amountCents: 70000,
      description: 'notebook',
      date: '2026-06-02',
      source: 'whatsapp',
    });

    expect(result.success).toBe(true);
    expect(result.record!.status).toBe('posted');
  });

  // ─────────────────────────────────────────────────────────────────────
  // 7. Idempotência
  // ─────────────────────────────────────────────────────────────────────
  it('idempotencyKey prevê duplicata', async () => {
    const service = createRecordService(repos);

    const key = 'test-key-123';

    const r1 = await service.createExpense({
      householdId: TEST_HOUSEHOLD,
      accountId: ids.accountId,
      categoryId: ids.categoryId,
      amountCents: 3590,
      description: 'teste idempotencia',
      date: '2026-06-02',
      source: 'whatsapp',
      idempotencyKey: key,
    });

    const r2 = await service.createExpense({
      householdId: TEST_HOUSEHOLD,
      accountId: ids.accountId,
      categoryId: ids.categoryId,
      amountCents: 3590,
      description: 'teste idempotencia',
      date: '2026-06-02',
      source: 'whatsapp',
      idempotencyKey: key,
    });

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r2.record!.id).toBe(r1.record!.id);

    const all = await repos.recordRepo.findByHouseholdId(TEST_HOUSEHOLD);
    expect(all.length).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 8. Compra parcelada no cartão
  // ─────────────────────────────────────────────────────────────────────
  it('criar compra parcelada', async () => {
    const card = await repos.cardRepo.create({
      id: 'card-nubank-gold',
      householdId: TEST_HOUSEHOLD,
      name: 'Nubank Gold',
      closingDay: 15,
      dueDay: 25,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const service = createCardService(repos);

    const result = await service.createInstallmentPurchase({
      householdId: TEST_HOUSEHOLD,
      cardId: card.id,
      amountCents: 120000,
      description: 'notebook',
      installmentsCount: 10,
      firstDate: '2026-06-02',
      source: 'whatsapp',
    });

    expect(result.success).toBe(true);
    expect(result.installmentGroup).toBeDefined();
    expect(result.installmentGroup!.installmentsCount).toBe(10);

    const all = await repos.recordRepo.findByHouseholdId(TEST_HOUSEHOLD);
    expect(all.length).toBe(10);

    const firstRecord = all[0];
    expect(firstRecord.amountCents).toBe(12000); // 120000/10
    expect(firstRecord.installmentGroupId).toBe(result.installmentGroup!.id);
  });
});
