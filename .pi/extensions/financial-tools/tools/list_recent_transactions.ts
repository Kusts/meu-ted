/**
 * list_recent_transactions — Pi tool
 */

import { Type } from "typebox";

async function query<T extends { rows: unknown[] }>(text: string, params?: unknown[]): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { const r = await pool.query(text, params); return r as T; }
  finally { await pool.end(); }
}

function isUUID(s: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }

interface TxRow { id: string; kind: string; amount_cents: string; description: string | null; date: Date; category_name: string | null; from_account_name: string | null; to_account_name: string | null; status: string; }

export const listRecentTransactionsTool = {
  name: "list_recent_transactions",
  label: "Recent Transactions",
  description: "List recent transactions for a household, optionally filtered by account_id. Returns up to `limit` transactions.",
  parameters: Type.Object({
    householdId: Type.String(),
    limit: Type.Optional(Type.Number()),
    accountId: Type.Optional(Type.String()),
  }),

  async execute(_id: string, params: { householdId: string; limit?: number; accountId?: string }, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!isUUID(params.householdId)) throw new Error("householdId must be a valid UUID");
    const limit = Math.min(params.limit ?? 10, 100);

    let sql = `SELECT t.id, t.kind, t.amount_cents, t.description, t.date, c.name as category_name,
                     fa.name as from_account_name, ta.name as to_account_name, t.status
              FROM transactions t
              LEFT JOIN categories c ON c.id = t.category_id
              LEFT JOIN accounts fa ON fa.id = t.from_account_id
              LEFT JOIN accounts ta ON ta.id = t.to_account_id
              WHERE t.household_id = $1 AND t.deleted_at IS NULL`;
    const args: unknown[] = [params.householdId];

    if (params.accountId) {
      sql += ` AND (t.from_account_id = $2 OR t.to_account_id = $2)`;
      args.push(params.accountId);
    }
    sql += ` ORDER BY t.date DESC, t.created_at DESC LIMIT $${args.length + 1}`;
    args.push(limit);

    const r = await query<{ rows: TxRow[] }>(sql, args);

    if (!r.rows.length) return { content: [{ type: "text", text: "Nenhuma transação encontrada." }], details: { transactions: [] } };

    const text = r.rows.map(tx => {
      const sign = tx.kind === "expense" ? "-" : tx.kind === "income" ? "+" : "~";
      const fmt = `${sign}R$ ${(parseInt(tx.amount_cents, 10) / 100).toFixed(2)}`;
      return `• [${tx.date.toISOString().slice(0, 10)}] ${fmt} — ${tx.description ?? tx.kind} ${tx.category_name ? `(${tx.category_name})` : ""}`;
    }).join("\n");

    onUpdate?.({ content: [{ type: "text", text: "Listando transações..." }] });

    return { content: [{ type: "text", text }], details: { transactions: r.rows } };
  },
};