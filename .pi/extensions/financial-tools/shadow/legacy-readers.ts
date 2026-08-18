import pg from "pg";

export type LegacyQuery = (sql: string, params: readonly unknown[]) => Promise<unknown[]>;

export type LegacyReadRequest = {
  householdId: string;
  accountId?: string;
  yearMonth?: string;
  limit?: number;
  offset?: number;
  kind?: string;
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  minAmountCents?: number;
  maxAmountCents?: number;
  query?: string;
  operation?: string;
  eventType?: string;
  actorType?: string;
  entityType?: string;
  entityId?: string;
};

export type LegacyReaders = Record<string, (request: LegacyReadRequest) => Promise<unknown>>;

const int = (value: unknown): number => Number.parseInt(String(value), 10);
const date = (value: unknown): string => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

const projectAccounts = (rows: any[], transactions: any[]) => ({
  accounts: rows.map((row) => {
    let balance = int(row.initial_balance_cents);
    for (const tx of transactions) {
      const amount = int(tx.amount_cents);
      if (tx.from_account_id === row.id && ["expense", "transfer"].includes(tx.kind)) balance -= amount;
      if (tx.to_account_id === row.id && ["income", "transfer"].includes(tx.kind)) balance += amount;
    }
    return { id: row.id, name: row.name, balance_cents: balance, active: row.active };
  }),
});

const readAccounts = async (query: LegacyQuery, request: LegacyReadRequest) => {
  const rows = await query("SELECT id, name, initial_balance_cents, active FROM accounts WHERE household_id = $1 AND active = true AND deleted_at IS NULL ORDER BY name", [request.householdId]);
  const transactions = await query("SELECT from_account_id, to_account_id, kind, amount_cents FROM transactions WHERE household_id = $1 AND deleted_at IS NULL", [request.householdId]);
  return projectAccounts(rows, transactions);
};

const readCategories = async (query: LegacyQuery, request: LegacyReadRequest) => {
  const sql = request.kind
    ? "SELECT id, name, kind, active FROM categories WHERE household_id = $1 AND kind = $2 AND deleted_at IS NULL ORDER BY name"
    : "SELECT id, name, kind, active FROM categories WHERE household_id = $1 AND deleted_at IS NULL ORDER BY name";
  const params = request.kind ? [request.householdId, request.kind] : [request.householdId];
  const rows = await query(sql, params);
  return { categories: rows.map((row: any) => ({ id: row.id, name: row.name, kind: row.kind, status: row.active ? "active" : "inactive" })) }; 
};

const readBalance = async (query: LegacyQuery, request: LegacyReadRequest) => {
  const accounts = await query("SELECT id, name, initial_balance_cents FROM accounts WHERE id = $1 AND household_id = $2 AND active = true AND deleted_at IS NULL LIMIT 1", [request.accountId, request.householdId]);
  const account = accounts[0] as any;
  if (!account) throw new Error("Account not found or inactive");
  const transactions = await query("SELECT from_account_id, to_account_id, kind, amount_cents FROM transactions WHERE household_id = $1 AND deleted_at IS NULL AND (from_account_id = $2 OR to_account_id = $2)", [request.householdId, request.accountId]);
  const projected = projectAccounts([account], transactions).accounts[0];
  return { id: request.accountId, balanceCents: projected.balance_cents };
};

const readMonthSummary = async (query: LegacyQuery, request: LegacyReadRequest) => {
  const rows = await query("SELECT kind, COALESCE(SUM(amount_cents), 0) as total FROM transactions WHERE household_id = $1 AND date >= $2 AND date < ($2::date + INTERVAL '1 month') AND deleted_at IS NULL GROUP BY kind", [request.householdId, `${request.yearMonth}-01`]);
  const income = int((rows.find((row: any) => row.kind === "income") as any)?.total ?? 0);
  const expense = int((rows.find((row: any) => row.kind === "expense") as any)?.total ?? 0);
  return { incomeCents: income, expenseCents: expense, balanceCents: income - expense, yearMonth: request.yearMonth };
};

const readRecentTransactions = async (query: LegacyQuery, request: LegacyReadRequest) => {
  const limit = Math.min(request.limit ?? 10, 100);
  const params: unknown[] = [request.householdId];
  const conditions = ["t.household_id = $1", "t.deleted_at IS NULL"];
  const add = (sql: string, value: unknown): void => { params.push(value); conditions.push(sql.replace(/\$VALUE/g, `$${params.length}`)); };
  if (request.accountId) add("(t.from_account_id = $VALUE OR t.to_account_id = $VALUE)", request.accountId);
  if (request.startDate) add("t.date >= $VALUE", request.startDate);
  if (request.endDate) add("t.date <= $VALUE", request.endDate);
  if (request.categoryId) add("t.category_id = $VALUE", request.categoryId);
  if (request.kind) add("t.kind = $VALUE", request.kind);
  if (request.minAmountCents !== undefined) add("t.amount_cents >= $VALUE", request.minAmountCents);
  if (request.maxAmountCents !== undefined) add("t.amount_cents <= $VALUE", request.maxAmountCents);
  if (request.query) add("t.description ILIKE $VALUE", `%${request.query}%`);
  const offset = request.offset ?? 0;
  params.push(limit, offset);
  const limitPlaceholder = `$${params.length - 1}`;
  const offsetPlaceholder = `$${params.length}`;
  const rows = await query(`SELECT t.id, t.kind, t.amount_cents, t.description, t.date, t.from_account_id AS account_id FROM transactions t WHERE ${conditions.join(" AND ")} ORDER BY t.date DESC, t.created_at DESC LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`, params);
  return {
    transactions: rows.map((row: any) => ({
      id: row.id, kind: row.kind, amount_cents: int(row.amount_cents), description: row.description, date: date(row.date), account_id: row.account_id ?? null,
    })),
  };
};

const readAuditLogs = async (query: LegacyQuery, request: LegacyReadRequest) => {
  const params: unknown[] = [request.householdId];
  const conditions = ["household_id = $1"];
  if (request.entityType) { params.push(request.entityType); conditions.push(`entity_type = $${params.length}`); }
  if (request.entityId) { params.push(request.entityId); conditions.push(`entity_id = $${params.length}`); }
  if (request.operation) { params.push(request.operation); conditions.push(`action = $${params.length}`); }
  if (request.actorType) { params.push(request.actorType === "user" ? true : false); conditions.push(`(user_id IS NOT NULL) = $${params.length}`); }
  params.push(Math.min(request.limit ?? 20, 100));
  const rows = await query(`SELECT id, action, user_id, created_at FROM audit_logs WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${params.length}`, params);
  return { logs: rows.map((row: any) => ({ id: row.id, action: row.action, event_type: `legacy.${row.action}`, actor_id: row.user_id ?? "legacy-unknown", created_at: new Date(row.created_at).toISOString() })) };
};

export const createLegacyReaders = (query: LegacyQuery): LegacyReaders => ({
  list_accounts: (request) => readAccounts(query, request),
  list_categories: (request) => readCategories(query, request),
  get_balance: (request) => readBalance(query, request),
  get_month_summary: (request) => readMonthSummary(query, request),
  list_recent_transactions: (request) => readRecentTransactions(query, request),
  audit_logs: (request) => readAuditLogs(query, request),
});

export const createPostgresLegacyReaders = (): LegacyReaders => {
  const query: LegacyQuery = async (sql, params) => {
    const pool = new pg.Pool({ connectionString: process.env.PI_SHADOW_DATABASE_URL ?? process.env.DATABASE_URL });
    try {
      const result = await pool.query(sql, params as unknown[]);
      return result.rows;
    } finally {
      await pool.end();
    }
  };
  return createLegacyReaders(query);
};
