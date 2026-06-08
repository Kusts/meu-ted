/** update_transaction — Pi tool */
import { Type } from "typebox";
async function query<T extends { rows: unknown[] }>(text: string, params?: unknown[]): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { const r = await pool.query(text, params); return r as T; }
  finally { await pool.end(); }
}
function isUUID(s: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }
function isDate(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)); }

export const updateTransactionTool = {
  name: "update_transaction",
  label: "Update Transaction",
  description: "Update a transaction's description, amount_cents, date, category_id, or from_account_id. Cannot change kind.",
  parameters: Type.Object({
    transactionId: Type.String(),
    householdId: Type.String(),
    description: Type.Optional(Type.String()),
    amountCents: Type.Optional(Type.Number()),
    date: Type.Optional(Type.String()),
    categoryId: Type.Optional(Type.String()),
    fromAccountId: Type.Optional(Type.String()),
  }),
  async execute(_id: string, params: any, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!isUUID(params.transactionId)) throw new Error("transaction_id must be a valid UUID");
    if (!isUUID(params.householdId)) throw new Error("household_id must be a valid UUID");
    if (params.description !== undefined && !params.description?.trim()) throw new Error("description cannot be empty");
    if (params.amountCents !== undefined && (!Number.isInteger(params.amountCents) || params.amountCents <= 0)) throw new Error("amount_cents must be positive");
    if (params.date !== undefined && !isDate(params.date)) throw new Error("date must be YYYY-MM-DD");
    if (params.categoryId !== undefined && !isUUID(params.categoryId)) throw new Error("category_id must be a valid UUID");
    if (params.fromAccountId !== undefined && !isUUID(params.fromAccountId)) throw new Error("from_account_id must be a valid UUID");

    const ex = await query<{ rows: { id: string }[] }>(`SELECT id FROM transactions WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`, [params.transactionId, params.householdId]);
    if (!ex.rows.length) throw new Error("Transaction not found or already deleted");

    if (params.categoryId) {
      const cat = await query<{ rows: { id: string }[] }>(`SELECT id FROM categories WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`, [params.categoryId, params.householdId]);
      if (!cat.rows.length) throw new Error("Category not found or inactive");
    }
    if (params.fromAccountId) {
      const acc = await query<{ rows: { id: string }[] }>(`SELECT id FROM accounts WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`, [params.fromAccountId, params.householdId]);
      if (!acc.rows.length) throw new Error("Account not found or inactive");
    }

    const sets: string[] = [];
    const par: unknown[] = [];
    let i = 1;
    if (params.description !== undefined) { sets.push(`description = $${i++}`); par.push(params.description.trim()); }
    if (params.amountCents !== undefined) { sets.push(`amount_cents = $${i++}`); par.push(params.amountCents); }
    if (params.date !== undefined) { sets.push(`date = $${i++}`); par.push(params.date); }
    if (params.categoryId !== undefined) { sets.push(`category_id = $${i++}`); par.push(params.categoryId); }
    if (params.fromAccountId !== undefined) { sets.push(`from_account_id = $${i++}`); par.push(params.fromAccountId); }
    par.push(params.transactionId, params.householdId);

    const r = await query<{ rows: { id: string }[] }>(
      `UPDATE transactions SET ${sets.join(", ")} WHERE id = $${i++} AND household_id = $${i} AND deleted_at IS NULL RETURNING id`,
      par
    );
    if (!r.rows.length) throw new Error("Transaction not found or already deleted");

    onUpdate?.({ content: [{ type: "text", text: "Atualizando transação..." }] });
    return {
        success: true,
        transactionId: r.rows[0].id,
 content: [{ type: "text", text: `✅ Transação atualizada.` }], details: { transaction_id: r.rows[0].id } };
  },
};