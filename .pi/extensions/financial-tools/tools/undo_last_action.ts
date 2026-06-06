/** undo_last_action — Pi tool */
import { Type } from "typebox";
async function query<T extends { rows: unknown[] }>(text: string, params?: unknown[]): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { const r = await pool.query(text, params); return r as T; }
  finally { await pool.end(); }
}
function isUUID(s: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }

export const undoLastActionTool = {
  name: "undo_last_action",
  label: "Undo Last Action",
  description: "Undo the most recent account/category/transaction creation, update, or deletion. Only affects non-deleted records.",
  parameters: Type.Object({ householdId: Type.String() }),
  async execute(_id: string, params: { householdId: string }, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!isUUID(params.householdId)) throw new Error("householdId must be a valid UUID");

    const lastLog = await query<{ rows: { id: string; action: string; entity_type: string; entity_id: string; before_json: Record<string, unknown> | null }[] }>(
      `SELECT id, action, entity_type, entity_id, before_json
       FROM audit_logs WHERE household_id = $1 AND action IN ('CREATE', 'UPDATE', 'DELETE')
       ORDER BY created_at DESC LIMIT 1`,
      [params.householdId]
    );
    if (!lastLog.rows.length) return { content: [{ type: "text", text: "Nenhuma ação para desfazer." }], details: {} };

    const log = lastLog.rows[0];
    let undone = false;

    if (log.action === "CREATE" && log.entity_type === "transaction") {
      await query(`UPDATE transactions SET deleted_at = NOW() WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`, [log.entity_id, params.householdId]);
      undone = true;
    } else if (log.action === "DELETE" && log.entity_type === "transaction" && log.before_json) {
      const d = log.before_json as Record<string, unknown>;
      await query(
        `UPDATE transactions SET deleted_at = NULL WHERE id = $1 AND household_id = $2`,
        [log.entity_id, params.householdId]
      );
      undone = true;
    } else if (log.action === "UPDATE" && log.before_json) {
      const d = log.before_json as Record<string, unknown>;
      const table = log.entity_type === "account" ? "accounts" : log.entity_type === "category" ? "categories" : "transactions";
      const sets = Object.keys(d).filter(k => k !== "id" && k !== "household_id").map(k => `${k} = $${1 + Object.keys(d).indexOf(k)}`);
      if (sets.length) {
        const vals = Object.keys(d).filter(k => k !== "id" && k !== "household_id").map(k => d[k]);
        vals.push(log.entity_id, params.householdId);
        await query(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = $${vals.length - 1} AND household_id = $${vals.length} AND deleted_at IS NULL`, vals);
      }
      undone = true;
    }

    onUpdate?.({ content: [{ type: "text", text: "Desfazendo ação..." }] });
    return {
      content: [{ type: "text", text: undone ? `✅ Ação desfeita: ${log.action} ${log.entity_type}` : `⚠️ Não foi possível desfazer: ${log.action} ${log.entity_type}` }],
      details: { undone, log_id: log.id, action: log.action, entity_type: log.entity_type, entity_id: log.entity_id },
    };
  },
};