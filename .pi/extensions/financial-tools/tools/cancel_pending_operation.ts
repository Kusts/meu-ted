/** cancel_pending_operation — Pi tool */
import { Type } from "typebox";
async function query<T extends { rows: unknown[] }>(text: string, params?: unknown[]): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { const r = await pool.query(text, params); return r as T; }
  finally { await pool.end(); }
}

export const cancelPendingOperationTool = {
  name: "cancel_pending_operation",
  label: "Cancel Pending Operation",
  description: "Cancel and discard a pending high-value operation.",
  parameters: Type.Object({ chatId: Type.String() }),
  async execute(_id: string, params: { chatId: string }, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!params.chatId?.trim()) throw new Error("chat_id cannot be empty");

    const r = await query<{ rows: { id: string }[] }>(
      `UPDATE pending_operations SET status = 'cancelled' WHERE chat_id = $1 AND status = 'awaiting_confirmation' AND expires_at > NOW() RETURNING id`,
      [params.chatId]
    );

    onUpdate?.({ content: [{ type: "text", text: "Cancelando operação..." }] });
    if (!r.rows.length) return {
        success: true,
 content: [{ type: "text", text: "Nenhuma operação pendente para cancelar." }], details: {} };
    return {
        success: true,
 content: [{ type: "text", text: `✅ Operação cancelada.` }], details: {} };
  },
};