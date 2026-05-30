import type { IFinancialRecordRepository } from '../repositories/financial-record-repository.js';
import type { ILedgerRepository } from '../repositories/ledger-repository.js';
import type { IAccountRepository } from '../repositories/account-repository.js';
import type { ICategoryRepository } from '../repositories/category-repository.js';
import type { IBudgetRepository } from '../repositories/budget-repository.js';
import type { IInvoiceRepository } from '../repositories/invoice-repository.js';
import type { IBillRepository } from '../repositories/bill-repository.js';

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

interface ReportServiceDeps {
  recordRepository: IFinancialRecordRepository;
  ledgerRepository: ILedgerRepository;
  accountRepository: IAccountRepository;
  categoryRepository: ICategoryRepository;
  budgetRepository: IBudgetRepository;
  invoiceRepository: IInvoiceRepository;
  billRepository: IBillRepository;
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
}