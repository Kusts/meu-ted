/**
 * Analytics data sources (item 14, etapa A).
 *
 * Transaction aggregates run in the database on Postgres
 * (`createSqlAnalyticsSource`, canonical and legacy dialects) and as plain
 * loops on the in-memory backend (`createStoreAnalyticsSource`). Small
 * entity lists always come from the existing domain stores so backend
 * behavior (status filters, computed balances, statement totals) is reused
 * instead of reimplemented.
 */

import type { Account, BudgetStatus, Category, RecurringPurchase, Statement, Subscription } from '../types/domain.js';
import type { ReadModelStore } from '../read-models/store.js';
import type { BudgetStore } from '../budgets/store.js';
import type { CardStore } from '../cards/store.js';
import type { SubscriptionStore } from '../subscriptions/store.js';

/** Minimal query surface (compatible with pg.Pool and the route pool type). */
export type AnalyticsPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
};

export type KindSum = { incomeCents: number; expenseCents: number };
export type DailySum = { date: string; incomeCents: number; expenseCents: number };
export type CategorySum = { categoryId: string; totalCents: number };
export type MonthlyFlow = { month: string; incomeCents: number; expenseCents: number };

export type DomainLists = {
  bankAccounts: Account[];
  cards: Account[];
  categories: Category[];
  statements: Statement[];
  subscriptions: Subscription[];
  budgets: BudgetStatus[];
  recurring: RecurringPurchase[];
};

export type AnalyticsSource = {
  loadLists(householdId: string): Promise<DomainLists>;
  sumByKind(householdId: string, from: string, to: string, accountId?: string): Promise<KindSum>;
  dailySums(householdId: string, from: string, to: string, accountId?: string): Promise<DailySum[]>;
  categorySums(
    householdId: string,
    from: string,
    to: string,
    kind: 'expense' | 'income',
    accountId?: string,
  ): Promise<CategorySum[]>;
  monthlyFlows(householdId: string, sinceMonth: string): Promise<MonthlyFlow[]>;
};

export type StoreBackedDeps = {
  store: ReadModelStore;
  cardStore?: CardStore;
  budgetStore?: BudgetStore;
  subscriptionStore?: SubscriptionStore;
};

type Row = Record<string, unknown>;

export const createStoreAnalyticsSource = (deps: StoreBackedDeps): AnalyticsSource => {
  const loadLists = async (householdId: string): Promise<DomainLists> => {
    const [accounts, categories, statements, subscriptions, budgets, recurring, cards] = await Promise.all([
      deps.store.listAccounts(householdId),
      deps.store.listCategories(householdId),
      deps.cardStore ? deps.cardStore.listStatements(householdId) : Promise.resolve([]),
      deps.subscriptionStore ? deps.subscriptionStore.listSubscriptions(householdId, 'active') : Promise.resolve([]),
      deps.budgetStore ? deps.budgetStore.listBudgets(householdId) : Promise.resolve([]),
      deps.cardStore ? deps.cardStore.listRecurringPurchases(householdId, { status: 'active' }) : Promise.resolve([]),
      deps.cardStore ? deps.cardStore.listCreditCardAccounts(householdId) : Promise.resolve([]),
    ]);
    return { bankAccounts: accounts, cards, categories, statements, subscriptions, budgets, recurring };
  };

  // Range-bounded reads page through the 200-row filter limit instead of
  // fetching everything at once.
  const rangeTransactions = async (householdId: string, from: string, to: string, accountId?: string) => {
    const items: Awaited<ReturnType<ReadModelStore['listTransactions']>>['items'] = [];
    for (let offset = 0; ; offset += 200) {
      const page = await deps.store.listTransactions(householdId, {
        startDate: from,
        endDate: to,
        ...(accountId ? { accountId } : {}),
        limit: 200,
        offset,
      });
      items.push(...page.items);
      if (page.items.length < 200) break;
    }
    return items;
  };

  return {
    loadLists,
    async sumByKind(householdId, from, to, accountId) {
      const items = await rangeTransactions(householdId, from, to, accountId);
      let incomeCents = 0;
      let expenseCents = 0;
      for (const tx of items) {
        if (tx.kind === 'income') incomeCents += tx.amountCents;
        else if (tx.kind === 'expense') expenseCents += tx.amountCents;
      }
      return { incomeCents, expenseCents };
    },
    async dailySums(householdId, from, to, accountId) {
      const items = await rangeTransactions(householdId, from, to, accountId);
      const byDay = new Map<string, DailySum>();
      for (const tx of items) {
        if (tx.kind !== 'income' && tx.kind !== 'expense') continue;
        const slot = byDay.get(tx.date) ?? { date: tx.date, incomeCents: 0, expenseCents: 0 };
        if (tx.kind === 'income') slot.incomeCents += tx.amountCents;
        else slot.expenseCents += tx.amountCents;
        byDay.set(tx.date, slot);
      }
      return [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
    },
    async categorySums(householdId, from, to, kind, accountId) {
      const items = await rangeTransactions(householdId, from, to, accountId);
      const totals = new Map<string, number>();
      for (const tx of items) {
        if (tx.kind !== kind || !tx.categoryId) continue;
        totals.set(tx.categoryId, (totals.get(tx.categoryId) ?? 0) + tx.amountCents);
      }
      return [...totals.entries()].map(([categoryId, totalCents]) => ({ categoryId, totalCents }));
    },
    async monthlyFlows(householdId, sinceMonth) {
      const items: Awaited<ReturnType<ReadModelStore['listTransactions']>>['items'] = [];
      for (let offset = 0; ; offset += 200) {
        const page = await deps.store.listTransactions(householdId, {
          startDate: `${sinceMonth}-01`,
          limit: 200,
          offset,
        });
        items.push(...page.items);
        if (page.items.length < 200) break;
      }
      const byMonth = new Map<string, MonthlyFlow>();
      for (const tx of items) {
        if (tx.kind !== 'income' && tx.kind !== 'expense') continue;
        const month = tx.date.slice(0, 7);
        const slot = byMonth.get(month) ?? { month, incomeCents: 0, expenseCents: 0 };
        if (tx.kind === 'income') slot.incomeCents += tx.amountCents;
        else slot.expenseCents += tx.amountCents;
        byMonth.set(month, slot);
      }
      return [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
    },
  };
};

/**
 * Aggregate SQL implementation. `legacy=true` switches account scoping to
 * the legacy from/to_account_id columns; the canonical schema uses
 * account_id. Both share household + soft-delete + date filters.
 */
export const createSqlAnalyticsSource = (
  pool: AnalyticsPool,
  opts: { legacy?: boolean; stores: StoreBackedDeps },
): AnalyticsSource => {
  const fallback = createStoreAnalyticsSource(opts.stores);
  const accountFilter = (alias: string, index: number, accountId?: string): { clause: string; values: unknown[] } => {
    if (!accountId) return { clause: '', values: [] };
    if (opts.legacy) {
      return { clause: `AND (${alias}.from_account_id = $${index} OR ${alias}.to_account_id = $${index})`, values: [accountId] };
    }
    return { clause: `AND ${alias}.account_id = $${index}`, values: [accountId] };
  };

  return {
    loadLists: fallback.loadLists,
    async sumByKind(householdId, from, to, accountId) {
      const filter = accountFilter('t', 4, accountId);
      const res = await pool.query(
        `SELECT t.kind AS kind, SUM(t.amount_cents)::text AS total
           FROM transactions t
          WHERE t.household_id = $1 AND t.deleted_at IS NULL
            AND t.date >= $2 AND t.date <= $3 ${filter.clause}
          GROUP BY t.kind`,
        [householdId, from, to, ...filter.values],
      );
      let incomeCents = 0;
      let expenseCents = 0;
      for (const row of res.rows) {
        if (row['kind'] === 'income') incomeCents = Number(row['total'] ?? 0);
        else if (row['kind'] === 'expense') expenseCents = Number(row['total'] ?? 0);
      }
      return { incomeCents, expenseCents };
    },
    async dailySums(householdId, from, to, accountId) {
      const filter = accountFilter('t', 4, accountId);
      const res = await pool.query(
        `SELECT t.date::text AS date,
                SUM(CASE WHEN t.kind = 'income' THEN t.amount_cents ELSE 0 END)::text AS income,
                SUM(CASE WHEN t.kind = 'expense' THEN t.amount_cents ELSE 0 END)::text AS expense
           FROM transactions t
          WHERE t.household_id = $1 AND t.deleted_at IS NULL
            AND t.date >= $2 AND t.date <= $3 ${filter.clause}
          GROUP BY t.date ORDER BY t.date`,
        [householdId, from, to, ...filter.values],
      );
      return res.rows.map((row) => ({
        date: String(row['date']).slice(0, 10),
        incomeCents: Number(row['income'] ?? 0),
        expenseCents: Number(row['expense'] ?? 0),
      }));
    },
    async categorySums(householdId, from, to, kind, accountId) {
      const filter = accountFilter('t', 5, accountId);
      const res = await pool.query(
        `SELECT t.category_id AS category_id, SUM(t.amount_cents)::text AS total
           FROM transactions t
          WHERE t.household_id = $1 AND t.deleted_at IS NULL
            AND t.date >= $2 AND t.date <= $3 AND t.kind = $4
            AND t.category_id IS NOT NULL ${filter.clause}
          GROUP BY t.category_id`,
        [householdId, from, to, kind, ...filter.values],
      );
      return res.rows.map((row) => ({ categoryId: String(row['category_id']), totalCents: Number(row['total'] ?? 0) }));
    },
    async monthlyFlows(householdId, sinceMonth) {
      const res = await pool.query(
        `SELECT to_char(t.date, 'YYYY-MM') AS month,
                SUM(CASE WHEN t.kind = 'income' THEN t.amount_cents ELSE 0 END)::text AS income,
                SUM(CASE WHEN t.kind = 'expense' THEN t.amount_cents ELSE 0 END)::text AS expense
           FROM transactions t
          WHERE t.household_id = $1 AND t.deleted_at IS NULL AND t.date >= $2
          GROUP BY 1 ORDER BY 1`,
        [householdId, `${sinceMonth}-01`],
      );
      return res.rows.map((row) => ({
        month: String(row['month']),
        incomeCents: Number(row['income'] ?? 0),
        expenseCents: Number(row['expense'] ?? 0),
      }));
    },
  };
};
