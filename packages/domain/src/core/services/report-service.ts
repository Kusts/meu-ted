import type { IFinancialRecordRepository } from '../repositories/financial-record-repository.js';
import type { ILedgerRepository } from '../repositories/ledger-repository.js';
import type { IAccountRepository } from '../repositories/account-repository.js';
import type { ICategoryRepository } from '../repositories/category-repository.js';
import type { IBudgetRepository } from '../repositories/budget-repository.js';
import type { IInvoiceRepository } from '../repositories/invoice-repository.js';
import type { IBillRepository } from '../repositories/bill-repository.js';
import type { IRecurrenceRepository } from '../repositories/recurrence-repository.js';

// ─────────────────────────────────────────────────────────────────────────────
// Interface Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MonthSummary {
  householdId: string;
  month: string;
  incomeCents: number;
  expenseCents: number;
  transferCents: number;
  netCents: number;
  recordCount: number;
}

export interface CategoryBreakdown {
  categoryId: string;
  categoryName: string;
  parentCategoryName?: string;
  amountCents: number;
  recordCount: number;
  percentage: number;
}

export interface AccountBalance {
  accountId: string;
  accountName: string;
  initialBalanceCents: number;
  debitCents: number;
  creditCents: number;
  currentBalanceCents: number;
}

export interface BudgetComparison {
  budgetId: string;
  budgetName: string;
  budgetType: string;
  limitCents: number;
  spentCents: number;
  remainingCents: number;
  percentage: number;
  status: 'under_budget' | 'warning' | 'over_budget';
}

export interface InvoiceDue {
  invoiceId: string;
  cardName: string;
  periodMonth: number;
  periodYear: number;
  totalCents: number;
  dueAt: string;
  status: string;
  daysUntilDue: number;
}

export interface MonthlyProjection {
  month: string; // 'YYYY-MM'
  projectedIncomeCents: number;
  projectedExpenseCents: number;
  netCents: number;
}

interface ReportServiceDeps {
  recordRepository: IFinancialRecordRepository;
  ledgerRepository: ILedgerRepository;
  accountRepository: IAccountRepository;
  categoryRepository: ICategoryRepository;
  budgetRepository: IBudgetRepository;
  invoiceRepository: IInvoiceRepository;
  billRepository: IBillRepository;
  recurrenceRepository?: IRecurrenceRepository;
}

// ─────────────────────────────────────────────────────────────────────────────
// ReportService
// ─────────────────────────────────────────────────────────────────────────────

export class ReportService {
  constructor(private readonly deps: ReportServiceDeps) {}

  async currentMonthSummary(householdId: string): Promise<MonthSummary> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    const dateFrom = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
    const dateTo = `${year}-${String(month).padStart(2, '0')}-31T23:59:59.999Z`;
    
    const { records } = await this.deps.recordRepository.findByHouseholdIdFiltered(householdId, {
      dateFrom,
      dateTo,
    });
    
    let incomeCents = 0;
    let expenseCents = 0;
    let transferCents = 0;
    
    for (const record of records) {
      if (record.type === 'income') {
        incomeCents += record.amountCents;
      } else if (record.type === 'expense') {
        expenseCents += record.amountCents;
      } else if (record.type === 'transfer') {
        transferCents += record.amountCents;
      }
    }
    
    return {
      householdId,
      month: `${year}-${String(month).padStart(2, '0')}`,
      incomeCents,
      expenseCents,
      transferCents,
      netCents: incomeCents - expenseCents,
      recordCount: records.length,
    };
  }

  async categoryBreakdown(
    householdId: string,
    params: { dateFrom: string; dateTo: string; type: 'income' | 'expense' }
  ): Promise<CategoryBreakdown[]> {
    const { records } = await this.deps.recordRepository.findByHouseholdIdFiltered(householdId, {
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      type: params.type,
    });
    
    // Group by categoryId (filter out null categoryId)
    const grouped: Record<string, { amountCents: number; recordCount: number }> = {};
    for (const record of records) {
      if (!record.categoryId) continue;
      if (!grouped[record.categoryId]) {
        grouped[record.categoryId] = { amountCents: 0, recordCount: 0 };
      }
      grouped[record.categoryId].amountCents += record.amountCents;
      grouped[record.categoryId].recordCount += 1;
    }
    
    // Calculate total for percentage
    const total = records.reduce((sum, r) => sum + r.amountCents, 0);
    
    // Get category names
    const result: CategoryBreakdown[] = [];
    for (const [categoryId, data] of Object.entries(grouped)) {
      const category = await this.deps.categoryRepository.findById(categoryId);
      const percentage = total > 0 ? Math.round((data.amountCents / total) * 10000) / 100 : 0;
      
      result.push({
        categoryId,
        categoryName: category?.name ?? 'Desconhecida',
        amountCents: data.amountCents,
        recordCount: data.recordCount,
        percentage,
      });
    }
    
    // Sort by amount descending
    result.sort((a, b) => b.amountCents - a.amountCents);
    
    return result;
  }

  async accountBalances(householdId: string): Promise<AccountBalance[]> {
    const accounts = await this.deps.accountRepository.findByHouseholdId(householdId);
    
    const result: AccountBalance[] = [];
    
    for (const account of accounts) {
      // Get all ledger entries for this account
      const ledgerEntries = await this.deps.ledgerRepository.findByAccountId(account.id);
      
      let creditCents = 0;
      let debitCents = 0;
      
      for (const entry of ledgerEntries) {
        if (entry.direction === 'credit') {
          creditCents += entry.amountCents;
        } else {
          debitCents += entry.amountCents;
        }
      }
      
      result.push({
        accountId: account.id,
        accountName: account.name,
        initialBalanceCents: account.initialBalanceCents,
        creditCents,
        debitCents,
        currentBalanceCents: account.initialBalanceCents + creditCents - debitCents,
      });
    }
    
    return result;
  }

  async budgetVsActual(householdId: string): Promise<BudgetComparison[]> {
    const budgets = await this.deps.budgetRepository.findByHouseholdId(householdId);
    
    const result: BudgetComparison[] = [];
    
    for (const budget of budgets) {
      // Calculate spent in budget period
      let spentCents = 0;
      
      if (budget.periodStart && budget.periodEnd && budget.targetId && budget.targetType === 'category') {
        const { records } = await this.deps.recordRepository.findByHouseholdIdFiltered(
          householdId,
          {
            dateFrom: budget.periodStart,
            dateTo: budget.periodEnd,
            categoryId: budget.targetId,
            type: 'expense',
          }
        );
        
        // Sum up spending for this category
        for (const record of records) {
          spentCents += record.amountCents;
        }
      }
      
      const remainingCents = budget.amountCents - spentCents;
      const percentage = Math.round((spentCents / budget.amountCents) * 100);
      
      let status: 'under_budget' | 'warning' | 'over_budget';
      if (remainingCents < 0) {
        status = 'over_budget';
      } else if (percentage >= 80) {
        status = 'warning';
      } else {
        status = 'under_budget';
      }
      
      result.push({
        budgetId: budget.id,
        budgetName: budget.name,
        budgetType: budget.budgetType,
        limitCents: budget.amountCents,
        spentCents,
        remainingCents,
        percentage,
        status,
      });
    }
    
    return result;
  }

  async invoicesDue(householdId: string): Promise<InvoiceDue[]> {
    const invoices = await this.deps.invoiceRepository.findByHouseholdId(householdId);
    
    const result: InvoiceDue[] = [];
    const now = new Date();
    
    for (const invoice of invoices) {
      // Only include open or closed invoices (not paid)
      if (invoice.status === 'paid') continue;
      
      const dueDate = new Date(invoice.dueAt);
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      result.push({
        invoiceId: invoice.id,
        cardName: 'Cartão', // Would need card repo to get actual name
        periodMonth: invoice.periodMonth,
        periodYear: invoice.periodYear,
        totalCents: invoice.totalCents,
        dueAt: invoice.dueAt,
        status: invoice.status,
        daysUntilDue,
      });
    }
    
    // Sort by due date
    result.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    
    return result;
  }

  /**
   * Generate 12-month projection based on recurrences + historical averages (REQ-020)
   */
  async twelveMonthProjection(householdId: string): Promise<MonthlyProjection[]> {
    const results: MonthlyProjection[] = [];
    const now = new Date();

    // Fetch active recurrences
    let recurrenceIncomeCents = 0;
    let recurrenceExpenseCents = 0;

    if (this.deps.recurrenceRepository) {
      const recurrences = await this.deps.recurrenceRepository.findByHouseholdId(householdId);
      const active = recurrences.filter(r => r.active);

      for (const rec of active) {
        // Add monthly equivalent based on period
        const monthlyAmount = rec.amountCents * this.getPeriodMultiplier(rec.period);

        if (rec.targetType === 'payable_bill') {
          recurrenceExpenseCents += monthlyAmount;
        } else if (rec.targetType === 'account_debit') {
          // Could be income or expense depending on direction
          recurrenceExpenseCents += monthlyAmount;
        }
      }
    }

    // Calculate historical average from last 3 months
    const last3Months: { income: number; expense: number }[] = [];
    for (let i = 1; i <= 3; i++) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const result = await this.deps.recordRepository.findByHouseholdIdFiltered(householdId, {
        dateFrom: start.toISOString(),
        dateTo: end.toISOString(),
      });

      const records = result.records;
      const income = records
        .filter(r => r.type === 'income')
        .reduce((sum, r) => sum + r.amountCents, 0);
      const expense = records
        .filter(r => r.type === 'expense')
        .reduce((sum, r) => sum + r.amountCents, 0);

      last3Months.push({ income, expense });
    }

    const avgIncome = last3Months.reduce((s, m) => s + m.income, 0) / 3;
    const avgExpense = last3Months.reduce((s, m) => s + m.expense, 0) / 3;

    // Project next 12 months
    for (let i = 1; i <= 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      const projectedIncomeCents = Math.round(recurrenceIncomeCents + avgIncome * 0.5);
      const projectedExpenseCents = Math.round(recurrenceExpenseCents + avgExpense * 0.5);

      results.push({
        month,
        projectedIncomeCents,
        projectedExpenseCents,
        netCents: projectedIncomeCents - projectedExpenseCents,
      });
    }

    return results;
  }

  private getPeriodMultiplier(period: string): number {
    switch (period) {
      case 'daily': return 30;
      case 'weekly': return 4;
      case 'biweekly': return 2;
      case 'monthly': return 1;
      case 'yearly': return 1 / 12;
      default: return 1;
    }
  }
}