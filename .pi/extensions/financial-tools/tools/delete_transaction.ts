/** delete_transaction — Pi tool */
import { Type } from "typebox";
async function query<T extends { rows: unknown[] }>(text: string, params?: unknown[]): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { const r = await pool.query(text, params); return r as T; }
  finally { await pool.end(); }
}
function isUUID(s: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }

export const deleteTransactionTool = {
  name: "delete_transaction",
  label: "Delete Transaction",
  description: "Soft-delete a transaction (sets deleted_at). Data is preserved.",
  parameters: Type.Object({ transactionId: Type.String(), householdId: Type.String() }),
  async execute(_id: string, params: any, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!isUUID(params.transactionId)) throw new Error("transaction_id must be a valid UUID");
    if (!isUUID(params.householdId)) throw new Error("household_id must be a valid UUID");

    const ex = await query<{ rows: { id: string }[] }>(`SELECT id FROM transactions WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`, [params.transactionId, params.householdId]);
    if (!ex.rows.length) throw new Error("Transaction not found or already deleted");

    const r = await query<{ rows: { id: string }[] }>(`UPDATE transactions SET deleted_at = NOW() WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL RETURNING id`, [params.transactionId, params.householdId]);

    onUpdate?.({ content: [{ type: "text", text: "Deletando transação..." }] });
    return { content: [{ type: "text", text: `✅ Transação deletada (soft delete).` }], details: { transaction_id: r.rows[0].id } };
  },
};