/** update_account — Pi tool */
import { Type } from "typebox";
async function query<T extends { rows: unknown[] }>(text: string, params?: unknown[]): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { const r = await pool.query(text, params); return r as T; }
  finally { await pool.end(); }
}
function isUUID(s: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }

export const updateAccountTool = {
  name: "update_account",
  label: "Update Account",
  description: "Update an account's name. initial_balance_cents is immutable.",
  parameters: Type.Object({
    accountId: Type.String(),
    name: Type.String(),
    householdId: Type.String(),
  }),
  async execute(_id: string, params: any, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!isUUID(params.accountId)) throw new Error("account_id must be a valid UUID");
    if (!params.name?.trim()) throw new Error("name cannot be empty");
    if (!isUUID(params.householdId)) throw new Error("household_id must be a valid UUID");

    const ex = await query<{ rows: { id: string; active: boolean }[] }>(
      `SELECT id, active FROM accounts WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [params.accountId, params.householdId]
    );
    if (!ex.rows.length) throw new Error("Account not found or inactive");
    if (!ex.rows[0].active) throw new Error("Account is not active");

    const dup = await query<{ rows: { id: string }[] }>(
      `SELECT id FROM accounts WHERE household_id = $1 AND LOWER(name) = LOWER($2) AND id != $3 AND deleted_at IS NULL LIMIT 1`,
      [params.householdId, params.name.trim(), params.accountId]
    );
    if (dup.rows.length) throw new Error(`Account with name="${params.name.trim()}" already exists in this household`);

    const r = await query<{ rows: { id: string }[] }>(
      `UPDATE accounts SET name = $1, updated_at = NOW() WHERE id = $2 AND household_id = $3 AND deleted_at IS NULL RETURNING id`,
      [params.name.trim(), params.accountId, params.householdId]
    );

    onUpdate?.({ content: [{ type: "text", text: "Atualizando conta..." }] });
    return { content: [{ type: "text", text: `✅ Conta atualizada: ${params.name.trim()}` }], details: { account_id: r.rows[0].id } };
  },
};