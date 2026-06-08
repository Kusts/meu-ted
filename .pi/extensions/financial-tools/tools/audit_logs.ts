/** audit_logs — Pi tool */
import { Type } from "typebox";
async function query<T extends { rows: unknown[] }>(text: string, params?: unknown[]): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { const r = await pool.query(text, params); return r as T; }
  finally { await pool.end(); }
}
function isUUID(s: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }

interface LogRow { id: string; entity_type: string; entity_id: string | null; action: string; before_json: Record<string, unknown> | null; after_json: Record<string, unknown> | null; created_at: Date; }

export const auditLogsTool = {
  name: "audit_logs",
  label: "Audit Logs",
  description: "List the most recent audit log entries for a household, optionally filtered by entity_type and entity_id.",
  parameters: Type.Object({
    householdId: Type.String(),
    limit: Type.Optional(Type.Number()),
    entityType: Type.Optional(Type.String()),
    entityId: Type.Optional(Type.String()),
  }),
  async execute(_id: string, params: { householdId: string; limit?: number; entityType?: string; entityId?: string }, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!isUUID(params.householdId)) throw new Error("householdId must be a valid UUID");
    const limit = Math.min(params.limit ?? 20, 100);

    let sql = `SELECT id, entity_type, entity_id, action, before_json, after_json, created_at
               FROM audit_logs WHERE household_id = $1`;
    const args: unknown[] = [params.householdId];

    if (params.entityType) { sql += ` AND entity_type = $${args.length + 1}`; args.push(params.entityType); }
    if (params.entityId) { sql += ` AND entity_id = $${args.length + 1}`; args.push(params.entityId); }
    sql += ` ORDER BY created_at DESC LIMIT $${args.length + 1}`;
    args.push(limit);

    const r = await query<{ rows: LogRow[] }>(sql, args);

    if (!r.rows.length) return {
        success: true,
 content: [{ type: "text", text: "Nenhum registro de auditoria encontrado." }], details: { logs: [] } };

    const text = r.rows.map(l => {
      const before = l.before_json ? JSON.stringify(l.before_json).slice(0, 60) : "";
      const after = l.after_json ? `→ ${JSON.stringify(l.after_json).slice(0, 60)}` : "";
      return `• [${new Date(l.created_at).toISOString().slice(0, 16)}] ${l.action} ${l.entity_type}${l.entity_id ? ` (${l.entity_id})` : ""}${before ? ` — ${before}` : ""}${after ? ` ${after}` : ""}`;
    }).join("\n");

    onUpdate?.({ content: [{ type: "text", text: "Carregando logs de auditoria..." }] });
    return {
        success: true,
        logs: r.rows,
 content: [{ type: "text", text }], details: { logs: r.rows } };
  },
};