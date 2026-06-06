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

    const r = await query<{ rows: {
      id: string;
      kind: string;
      amount_cents: string;
      description: string;
      category_id: string | null;
      from_account_id: string | null;
      to_account_id: string | null;
      date: Date;
      expires_at: Date;
      created_at: Date;
    }[] }>(
      `SELECT id, kind, amount_cents, description, category_id, from_account_id,
              to_account_id, date, expires_at, created_at
       FROM pending_operations
       WHERE chat_id = $1 AND expires_at > NOW() AND status = 'awaiting_confirmation'
       LIMIT 1`,
      [params.chatId]
    );

    if (!r.rows.length) return { content: [{ type: "text", text: "Nenhuma operação pendente encontrada." }], details: { operation: null } };

    const op = r.rows[0];
    const amount = (parseInt(op.amount_cents, 10) / 100).toFixed(2);
    onUpdate?.({ content: [{ type: "text", text: "Verificando operação pendente..." }] });
    return {
      content: [{ type: "text", text: `⏳ Operação pendente: ${op.kind} (R$ ${amount}) — ${op.description} — expira em ${new Date(op.expires_at).toLocaleString("pt-BR")}` }],
      details: { ...op },
    };
  },
};