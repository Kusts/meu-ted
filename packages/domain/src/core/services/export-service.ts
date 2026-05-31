// ─────────────────────────────────────────────────────────────────────────────
// Export Service - CSV export (REQ-033)
// ─────────────────────────────────────────────────────────────────────────────

import type { IFinancialRecordRepository } from '../repositories/financial-record-repository.js';
import type { ILedgerRepository } from '../repositories/ledger-repository.js';
import type { IAccountRepository } from '../repositories/account-repository.js';
import type { ICategoryRepository } from '../repositories/category-repository.js';
import type { IBudgetRepository } from '../repositories/budget-repository.js';

export type ExportFormat = 'csv';

export interface ExportRecordsInput {
  householdId: string;
  dateFrom?: string;
  dateTo?: string;
  type?: 'income' | 'expense' | 'transfer';
  accountId?: string;
  categoryId?: string;
  format: ExportFormat;
}

export interface ExportResult {
  success: boolean;
  data?: string;
  filename?: string;
  reason?: string;
}

export class ExportService {
  constructor(private deps: {
    recordRepository: IFinancialRecordRepository;
    ledgerRepository: ILedgerRepository;
    accountRepository: IAccountRepository;
    categoryRepository: ICategoryRepository;
    budgetRepository?: IBudgetRepository;
  }) {}

  /**
   * Export financial records to CSV
   */
  async exportRecords(input: ExportRecordsInput): Promise<ExportResult> {
    try {
      const result = await this.deps.recordRepository.findByHouseholdIdFiltered(
        input.householdId,
        {
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          type: input.type,
          accountId: input.accountId,
          categoryId: input.categoryId,
        }
      );

      const records = result.records;

      const accounts = await this.deps.accountRepository.findByHouseholdId(input.householdId);
      const categories = await this.deps.categoryRepository.findByHouseholdId(input.householdId);

      const accountMap = new Map(accounts.map(a => [a.id, a.name]));
      const categoryMap = new Map(categories.map(c => [c.id, c.name]));

      const rows = records.map(r => ({
        id: r.id,
        date: r.date.split('T')[0],
        type: r.type,
        description: r.description,
        amount: (r.amountCents / 100).toFixed(2),
        account: accountMap.get(r.accountId ?? '') ?? '',
        category: categoryMap.get(r.categoryId ?? '') ?? '',
        status: r.status,
        source: r.source,
      }));

      return this.toCsv(rows, 'records.csv');
    } catch (err) {
      return { success: false, reason: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }

  /**
   * Export account balances summary
   */
  async exportAccountBalances(householdId: string): Promise<ExportResult> {
    try {
      const accounts = await this.deps.accountRepository.findByHouseholdId(householdId);
      const ledgerByAccount = await Promise.all(
        accounts.map(a => this.deps.ledgerRepository.findByAccountId(a.id).then(ledgers => [a.id, ledgers] as const))
      );

      const rows = ledgerByAccount.map(([accountId, ledgers]) => {
        const account = accounts.find(a => a.id === accountId)!;
        const debits = ledgers.filter(e => e.direction === 'debit').reduce((sum, e) => sum + e.amountCents, 0);
        const credits = ledgers.filter(e => e.direction === 'credit').reduce((sum, e) => sum + e.amountCents, 0);
        const balance = (account.initialBalanceCents ?? 0) + credits - debits;

        return {
          account: account.name,
          type: account.type,
          initialBalance: ((account.initialBalanceCents ?? 0) / 100).toFixed(2),
          debit: (debits / 100).toFixed(2),
          credit: (credits / 100).toFixed(2),
          currentBalance: (balance / 100).toFixed(2),
        };
      });

      return this.toCsv(rows, 'balances.csv');
    } catch (err) {
      return { success: false, reason: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }

  /**
   * Export budget vs actual comparison
   */
  async exportBudgetVsActual(householdId: string): Promise<ExportResult> {
    if (!this.deps.budgetRepository) {
      return { success: false, reason: 'BudgetRepository não disponível' };
    }

    try {
      const budgets = await this.deps.budgetRepository.findByHouseholdId(householdId);
      const categories = await this.deps.categoryRepository.findByHouseholdId(householdId);
      const categoryMap = new Map(categories.map(c => [c.id, c.name]));

      const recordsResult = await this.deps.recordRepository.findByHouseholdIdFiltered(householdId, {});
      const records = recordsResult.records;

      const rows = budgets.map(budget => {
        const relevant = records.filter(r => {
          if (budget.targetType === 'category' && budget.targetId) {
            return r.categoryId === budget.targetId;
          }
          return true;
        });

        const spentCents = relevant.reduce((sum: number, r: any) => sum + r.amountCents, 0);
        const remainingCents = budget.amountCents - spentCents;
        const percentage = budget.amountCents > 0 ? Math.round((spentCents / budget.amountCents) * 100) : 0;

        return {
          name: budget.name,
          type: budget.budgetType,
          target: budget.targetType === 'category' ? categoryMap.get(budget.targetId ?? '') ?? '' : '',
          budgeted: (budget.amountCents / 100).toFixed(2),
          spent: (spentCents / 100).toFixed(2),
          remaining: (remainingCents / 100).toFixed(2),
          percentage: `${percentage}%`,
          status: remainingCents < 0 ? 'OVER_BUDGET' : remainingCents < budget.amountCents * 0.2 ? 'WARNING' : 'OK',
        };
      });

      return this.toCsv(rows, 'budgets.csv');
    } catch (err) {
      return { success: false, reason: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }

  private toCsv(rows: Record<string, string | number | null | undefined>[], filename: string): ExportResult {
    if (rows.length === 0) {
      return { success: false, reason: 'Nenhum dado para exportar' };
    }

    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(';'),
      ...rows.map(row =>
        headers.map(h => {
          const val = String(row[h] ?? '');
          return val.includes(';') || val.includes('"') || val.includes('\n')
            ? `"${val.replace(/"/g, '""')}"`
            : val;
        }).join(';')
      ),
    ];

    return {
      success: true,
      data: '\ufeff' + lines.join('\n'), // BOM for Excel UTF-8
      filename,
    };
  }
}