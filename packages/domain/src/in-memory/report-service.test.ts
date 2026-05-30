import { describe, it, expect, beforeEach } from 'vitest';
import { ReportService } from '../core/services/report-service';
import { InMemoryFinancialRecordRepository } from './financial-record-repository';
import { InMemoryLedgerRepository } from './ledger-repository';
import { InMemoryAccountRepository } from './account-repository';
import { InMemoryCategoryRepository } from './category-repository';
import { InMemoryBudgetRepository } from './budget-repository';
import { InMemoryInvoiceRepository } from './invoice-repository';
import { InMemoryBillRepository } from './bill-repository';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Test fixtures - using actual domain types
const makeRecord = (overrides: any = {}) => ({
  id: uuid(),
  householdId: 'house-1',
  accountId: 'acc-1',
  categoryId: 'cat-1',
  type: 'expense',
  amountCents: 1000,
  description: 'Test',
  date: new Date().toISOString(),
  source: 'manual',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const makeAccount = (overrides: any = {}) => ({
  id: uuid(),
  householdId: 'house-1',
  name: 'Conta Corrente',
  type: 'checking',
  scope: 'shared',
  initialBalanceCents: 50000,
  currency: 'BRL',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const makeCategory = (overrides: any = {}) => ({
  id: uuid(),
  householdId: 'house-1',
  name: 'Alimentação',
  kind: 'expense',
  parentId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const makeBudget = (overrides: any = {}) => {
  const now = new Date();
  return {
    id: uuid(),
    householdId: 'house-1',
    name: 'Alimentação Janeiro',
    budgetType: 'category_monthly',
    targetId: 'cat-1',
    targetType: 'category',
    amountCents: 200000,
    periodStart: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString(),
    active: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
};

const makeInvoice = (overrides: any = {}) => {
  const now = new Date();
  return {
    id: uuid(),
    householdId: 'house-1',
    cardId: 'card-1',
    periodMonth: now.getMonth() + 1,
    periodYear: now.getFullYear(),
    status: 'open',
    closesAt: new Date(now.getFullYear(), now.getMonth(), 20).toISOString(),
    dueAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    totalCents: 15000,
    paidAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
};

const makeLedgerEntry = (overrides: any = {}) => ({
  id: uuid(),
  householdId: 'house-1',
  recordId: uuid(),
  accountId: 'acc-1',
  cardId: null,
  invoiceId: null,
  direction: 'credit' as const,
  amountCents: 1000,
  description: 'Test entry',
  entryType: 'cash' as const,
  occurredAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('ReportService', () => {
  let recordRepo: InMemoryFinancialRecordRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let accountRepo: InMemoryAccountRepository;
  let categoryRepo: InMemoryCategoryRepository;
  let budgetRepo: InMemoryBudgetRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let billRepo: InMemoryBillRepository;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: ReportService;

  beforeEach(() => {
    recordRepo = new InMemoryFinancialRecordRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    accountRepo = new InMemoryAccountRepository();
    categoryRepo = new InMemoryCategoryRepository();
    budgetRepo = new InMemoryBudgetRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    billRepo = new InMemoryBillRepository();
    service = new ReportService({
      recordRepository: recordRepo as any,
      ledgerRepository: ledgerRepo as any,
      accountRepository: accountRepo as any,
      categoryRepository: categoryRepo as any,
      budgetRepository: budgetRepo as any,
      invoiceRepository: invoiceRepo as any,
      billRepository: billRepo as any,
    });
  });

  describe('currentMonthSummary', () => {
    it('sums income and expense for the current month', async () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const monthStr = String(month).padStart(2, '0');
      
      await recordRepo.create(makeRecord({ type: 'expense', amountCents: 5000, date: `${year}-${monthStr}-15T12:00:00.000Z` }));
      await recordRepo.create(makeRecord({ type: 'expense', amountCents: 3000, date: `${year}-${monthStr}-20T12:00:00.000Z` }));
      await recordRepo.create(makeRecord({ type: 'income', amountCents: 10000, date: `${year}-${monthStr}-10T12:00:00.000Z` }));

      const summary = await service.currentMonthSummary('house-1');
      
      expect(summary.expenseCents).toBe(8000);
      expect(summary.incomeCents).toBe(10000);
      expect(summary.netCents).toBe(2000);
      expect(summary.recordCount).toBe(3);
    });

    it('returns zeros for month with no records', async () => {
      const summary = await service.currentMonthSummary('house-1');
      
      expect(summary.incomeCents).toBe(0);
      expect(summary.expenseCents).toBe(0);
      expect(summary.netCents).toBe(0);
      expect(summary.recordCount).toBe(0);
    });
  });

  describe('categoryBreakdown', () => {
    it('groups records by category and calculates percentage', async () => {
      await categoryRepo.create(makeCategory({ id: 'cat-1', name: 'Alimentação' }));
      await categoryRepo.create(makeCategory({ id: 'cat-2', name: 'Transporte' }));
      
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const monthStr = String(month).padStart(2, '0');
      
      await recordRepo.create(makeRecord({ categoryId: 'cat-1', amountCents: 6000, date: `${year}-${monthStr}-15T12:00:00.000Z` }));
      await recordRepo.create(makeRecord({ categoryId: 'cat-1', amountCents: 4000, date: `${year}-${monthStr}-20T12:00:00.000Z` }));
      await recordRepo.create(makeRecord({ categoryId: 'cat-2', amountCents: 5000, date: `${year}-${monthStr}-18T12:00:00.000Z` }));

      const breakdown = await service.categoryBreakdown('house-1', {
        dateFrom: `${year}-${monthStr}-01T00:00:00.000Z`,
        dateTo: `${year}-${monthStr}-31T23:59:59.999Z`,
        type: 'expense',
      });
      
      expect(breakdown).toHaveLength(2);
      
      const alimentacao = breakdown.find(b => b.categoryId === 'cat-1');
      expect(alimentacao?.amountCents).toBe(10000);
      expect(alimentacao?.recordCount).toBe(2);
      expect(alimentacao?.percentage).toBe(66.67);
      
      const transporte = breakdown.find(b => b.categoryId === 'cat-2');
      expect(transporte?.amountCents).toBe(5000);
      expect(transporte?.percentage).toBe(33.33);
    });

    it('returns empty array when no records in period', async () => {
      const breakdown = await service.categoryBreakdown('house-1', {
        dateFrom: '2020-01-01T00:00:00.000Z',
        dateTo: '2020-01-31T23:59:59.999Z',
        type: 'expense',
      });
      
      expect(breakdown).toHaveLength(0);
    });
  });

  describe('accountBalances', () => {
    it('calculates balance from initial + credits - debits', async () => {
      await accountRepo.create(makeAccount({ id: 'acc-1', name: 'Conta Corrente', initialBalanceCents: 50000 }));
      await accountRepo.create(makeAccount({ id: 'acc-2', name: 'Poupança', initialBalanceCents: 20000 }));

      await ledgerRepo.create(makeLedgerEntry({ accountId: 'acc-1', direction: 'credit', amountCents: 3000 }));
      await ledgerRepo.create(makeLedgerEntry({ accountId: 'acc-1', direction: 'debit', amountCents: 1000 }));
      await ledgerRepo.create(makeLedgerEntry({ accountId: 'acc-2', direction: 'credit', amountCents: 500 }));

      const balances = await service.accountBalances('house-1');
      
      expect(balances).toHaveLength(2);
      
      const contaCorrente = balances.find(b => b.accountId === 'acc-1');
      expect(contaCorrente?.initialBalanceCents).toBe(50000);
      expect(contaCorrente?.creditCents).toBe(3000);
      expect(contaCorrente?.debitCents).toBe(1000);
      expect(contaCorrente?.currentBalanceCents).toBe(52000);
    });
  });

  describe('budgetVsActual', () => {
    it('returns under_budget when spent < limit', async () => {
      await budgetRepo.create(makeBudget({ amountCents: 200000, targetId: 'cat-1' }));
      
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const monthStr = String(month).padStart(2, '0');
      
      await recordRepo.create(makeRecord({ categoryId: 'cat-1', amountCents: 100000, date: `${year}-${monthStr}-15T12:00:00.000Z` }));

      const comparison = await service.budgetVsActual('house-1');
      
      expect(comparison).toHaveLength(1);
      expect(comparison[0].status).toBe('under_budget');
      expect(comparison[0].spentCents).toBe(100000);
      expect(comparison[0].remainingCents).toBe(100000);
      expect(comparison[0].percentage).toBe(50);
    });
  });

  describe('invoicesDue', () => {
    it('returns open invoices with days until due', async () => {
      await invoiceRepo.create(makeInvoice({ dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), totalCents: 15000 }));

      const invoices = await service.invoicesDue('house-1');
      
      expect(invoices).toHaveLength(1);
      expect(invoices[0].totalCents).toBe(15000);
      expect(invoices[0].daysUntilDue).toBeGreaterThanOrEqual(4);
      expect(invoices[0].daysUntilDue).toBeLessThanOrEqual(6);
    });

    it('excludes paid invoices', async () => {
      await invoiceRepo.create(makeInvoice({ dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), status: 'paid' }));

      const invoices = await service.invoicesDue('house-1');
      
      expect(invoices).toHaveLength(0);
    });
  });
});