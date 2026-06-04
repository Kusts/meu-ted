/** get_pending_operation — Pi tool */
import { Type } from "typebox";
async function query<T extends { rows: unknown[] }>(text: string, params?: unknown[]): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { const r = await pool.query(text, params); return r as T; }
  finally { await pool.end(); }
}

export const getPendingOperationTool = {
  name: "get_pending_operation",
  label: "Get Pending Operation",
  description: "Retrieve the pending high-value operation for a chat. Returns operation details or error if none exists.",
  parameters: Type.Object({ chatId: Type.String() }),
  async execute(_id: string, params: { chatId: string }, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!params.chatId?.trim()) throw new Error("chat_id cannot be empty");

    const r = await query<{ rows: { id: string; operation_type: string; operation_data: Record<string, unknown>; expires_at: Date; created_at: Date }[] }>(
      `SELECT id, operation_type, operation_data, expires_at, created_at
       FROM pending_operations
       WHERE chat_id = $1 AND expires_at > NOW() AND consumed_at IS NULL
       LIMIT 1`,
      [params.chatId]
    );

    if (!r.rows.length) return { content: [{ type: "text", text: "Nenhuma operação pendente encontrada." }], details: { operation: null } };

    const op = r.rows[0];
    onUpdate?.({ content: [{ type: "text", text: "Verificando operação pendente..." }] });
    return {
      content: [{ type: "text", text: `⏳ Operação pendente: ${op.operation_type} — expira em ${new Date(op.expires_at).toLocaleString("pt-BR")}` }],
      details: { id: op.id, operation_type: op.operation_type, operation_data: op.operation_data, expires_at: op.expires_at, created_at: op.created_at },
    };
  },
};