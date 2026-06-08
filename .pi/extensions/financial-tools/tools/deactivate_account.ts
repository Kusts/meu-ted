/** deactivate_account — Pi tool */
import { Type } from "typebox";
async function query<T extends { rows: unknown[] }>(text: string, params?: unknown[]): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { const r = await pool.query(text, params); return r as T; }
  finally { await pool.end(); }
}
function isUUID(s: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }

export const deactivateAccountTool = {
  name: "deactivate_account",
  label: "Deactivate Account",
  description: "Soft-delete an account. Only allowed if account has no active transactions.",
  parameters: Type.Object({ accountId: Type.String(), householdId: Type.String() }),
  async execute(_id: string, params: any, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!isUUID(params.accountId)) throw new Error("account_id must be a valid UUID");
    if (!isUUID(params.householdId)) throw new Error("household_id must be a valid UUID");

    const ex = await query<{ rows: { id: string }[] }>(`SELECT id FROM accounts WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`, [params.accountId, params.householdId]);
    if (!ex.rows.length) throw new Error("Account not found or already deactivated");

    const tx = await query<{ rows: { cnt: string }[] }>(
      `SELECT COUNT(*) as cnt FROM transactions WHERE (from_account_id = $1 OR to_account_id = $1) AND household_id = $2 AND deleted_at IS NULL`,
      [params.accountId, params.householdId]
    );
    if (parseInt(tx.rows[0].cnt, 10) > 0) throw new Error("Account has transactions and cannot be deactivated");

    const r = await query<{ rows: { id: string }[] }>(`UPDATE accounts SET deleted_at = NOW(), active = false WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL RETURNING id`, [params.accountId, params.householdId]);

    onUpdate?.({ content: [{ type: "text", text: "Desativando conta..." }] });
    return {
        success: true,
        accountId: r.rows[0].id,
 content: [{ type: "text", text: `✅ Conta desativada.` }], details: { account_id: r.rows[0].id } };
  },
};