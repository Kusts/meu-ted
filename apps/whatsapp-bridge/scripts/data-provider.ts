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

export interface DueInstallment {
  transactionId: string;
  planDescription: string;
  installmentLabel: string;
  amountCents: number;
  dueDate: string;
  daysUntil: number;
  isOverdue: boolean;
  accountName: string;
}

export interface WeeklyData {
  accounts: AccountSummary[];
  weekTransactions: TransactionRow[];
  currentMonthSummary: MonthSummary;
  dueInstallments: DueInstallment[];
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

    const [txResult, dueInstallments] = await Promise.all([
      listRecentTransactions(householdId, showDays),
      getDueInstallments(householdId, showDays),
    ]);

    return {
      accounts: accountBalances,
      weekTransactions: txResult.transactions ?? [],
      dueInstallments,
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

async function getDueInstallments(householdId: string, daysAhead: number): Promise<DueInstallment[]> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(
      `SELECT t.id, t.amount_cents, t.date::text as due,
              t.installment_number, t.installments_total,
              p.description as plan_description,
              a.name as account_name
       FROM transactions t
       JOIN installment_plans p ON p.id = t.installment_plan_id
       JOIN accounts a ON a.id = t.from_account_id
       WHERE t.household_id = $1
         AND t.installment_plan_id IS NOT NULL
         AND t.installment_status = 'scheduled'
         AND p.type = 'out_of_card'
         AND t.deleted_at IS NULL
         AND t.date <= CURRENT_DATE + $2 * INTERVAL '1 day'
       ORDER BY t.date ASC
       LIMIT 10`,
      [householdId, daysAhead]
    );

    const today = new Date(new Date().toISOString().slice(0, 10));
    return result.rows.map((r: any) => {
      const due = new Date(r.due);
      const daysUntil = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return {
        transactionId: r.id,
        planDescription: r.plan_description,
        installmentLabel: `${r.installment_number}/${r.installments_total}`,
        amountCents: parseInt(r.amount_cents, 10),
        dueDate: r.due,
        daysUntil,
        isOverdue: daysUntil < 0,
        accountName: r.account_name,
      };
    });
  } finally {
    await pool.end();
  }
}

export class FakeDataProvider {
  constructor(private data: WeeklyData) {}

  async getWeeklyData(): Promise<WeeklyData> {
    return this.data;
  }
}
