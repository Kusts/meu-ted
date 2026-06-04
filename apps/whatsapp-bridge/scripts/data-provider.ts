// ─────────────────────────────────────────────────────────────────────────────
// Weekly summary data provider
// Abstracts DB reads behind a single interface.
// Both the real implementation (uses Pi tool functions) and a fake
// (for tests) implement this contract.
// ─────────────────────────────────────────────────────────────────────────────

import type { TransactionRow } from '../src/tools/types.js';

export interface MonthSummary {
  month: string; // YYYY-MM
  total_income_cents: number;
  total_expense_cents: number;
  net_balance_cents: number;
  transaction_count: number;
}

export interface AccountSummary {
  name: string;
  balance_cents: number;
}

export interface WeeklyData {
  accounts: AccountSummary[];
  weekTransactions: TransactionRow[];
  currentMonthSummary: MonthSummary;
}

// ─────────────────────────────────────────────────────────────────────────────
// Real implementation — calls existing Pi tool functions directly
// ─────────────────────────────────────────────────────────────────────────────

export class RealDataProvider {
  async getWeeklyData(
    householdId: string,
    showDays: number
  ): Promise<WeeklyData> {
    // Lazy imports to avoid circular deps
    const { listAccounts } = await import('../src/tools/runtime/list_accounts.js');
    const { getBalance } = await import('../src/tools/runtime/get_balance.js');
    const { listRecentTransactions } = await import('../src/tools/runtime/list_recent_transactions.js');
    const { getMonthSummary } = await import('../src/tools/runtime/get_month_summary.js');

    const now = new Date();
    const [year, month] = [now.getFullYear(), now.getMonth() + 1];

    const [accountsResult, monthResult] = await Promise.all([
      listAccounts(householdId),
      getMonthSummary(householdId, year, month),
    ]);

    const accountBalances = await Promise.all(
      (accountsResult.accounts ?? []).map(async (acct) => {
        const bal = await getBalance(acct.id, householdId);
        return {
          name: acct.name,
          balance_cents: bal.calculated_balance_cents ?? 0,
        };
      })
    );

    const txResult = await listRecentTransactions(householdId, showDays);

    return {
      accounts: accountBalances,
      weekTransactions: txResult.transactions ?? [],
      currentMonthSummary: {
        month: monthResult.month ?? `${year}-${month.toString().padStart(2, '0')}`,
        total_income_cents: monthResult.total_income_cents ?? 0,
        total_expense_cents: monthResult.total_expense_cents ?? 0,
        net_balance_cents: monthResult.net_balance_cents ?? 0,
        transaction_count: monthResult.transaction_count ?? 0,
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fake implementation — used in tests
// ─────────────────────────────────────────────────────────────────────────────

export class FakeDataProvider {
  constructor(private data: WeeklyData) {}

  async getWeeklyData(): Promise<WeeklyData> {
    return this.data;
  }
}
