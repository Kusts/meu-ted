/** confirm_pending_operation — Pi tool */
import { Type } from "typebox";
import { randomUUID } from "node:crypto";

async function query<T extends { rows: unknown[] }>(text: string, params?: unknown[]): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { const r = await pool.query(text, params); return r as T; }
  finally { await pool.end(); }
}

export const confirmPendingOperationTool = {
  name: "confirm_pending_operation",
  label: "Confirm Pending Operation",
  description: "Confirm and execute a pending high-value operation. Consumes the pending operation and inserts the transaction.",
  parameters: Type.Object({ chatId: Type.String() }),
  async execute(_id: string, params: { chatId: string }, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!params.chatId?.trim()) throw new Error("chat_id cannot be empty");

    const pending = await query<{ rows: { id: string; operation_data: Record<string, unknown>; operation_type: string }[] }>(
      `SELECT id, operation_data, operation_type
       FROM pending_operations
       WHERE chat_id = $1 AND expires_at > NOW() AND consumed_at IS NULL
       LIMIT 1`,
      [params.chatId]
    );
    if (!pending.rows.length) throw new Error("No pending operation found or it has expired");

    const op = pending.rows[0];
    const data = op.operation_data as { household_id: string; kind: string; amount_cents: number; description: string; category_id?: string; from_account_id?: string; to_account_id?: string; date: string; idempotency_key?: string };

    if (data.idempotency_key) {
      const existing = await query<{ rows: { id: string }[] }>(
        `SELECT id FROM transactions WHERE household_id = $1 AND idempotency_key = $2 AND deleted_at IS NULL LIMIT 1`,
        [data.household_id, data.idempotency_key]
      );
      if (existing.rows.length) {
        await query(`UPDATE pending_operations SET consumed_at = NOW() WHERE id = $1`, [op.id]);
        return { content: [{ type: "text", text: `Operação já executada: ${existing.rows[0].id}` }], details: { transaction_id: existing.rows[0].id, idempotent: true } };
      }
    }

    const rid = randomUUID();
    const cols = ["id", "household_id", "kind", "amount_cents", "description", "date", "status", "created_at"];
    const vals = [rid, data.household_id, data.kind, data.amount_cents, data.description, data.date, "confirmed", "NOW()"];
    const args: unknown[] = [];

    if (data.kind === "expense") {
      if (!data.category_id || !data.from_account_id) throw new Error("expense requires category_id and from_account_id");
      await query(`INSERT INTO transactions (id, household_id, kind, amount_cents, description, category_id, from_account_id, date, status, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', NOW())`,
        [rid, data.household_id, data.kind, data.amount_cents, data.description, data.category_id, data.from_account_id, data.date]);
    } else if (data.kind === "income") {
      if (!data.category_id || !data.to_account_id) throw new Error("income requires category_id and to_account_id");
      await query(`INSERT INTO transactions (id, household_id, kind, amount_cents, description, category_id, to_account_id, date, status, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', NOW())`,
        [rid, data.household_id, data.kind, data.amount_cents, data.description, data.category_id, data.to_account_id, data.date]);
    } else if (data.kind === "transfer") {
      if (!data.from_account_id || !data.to_account_id) throw new Error("transfer requires from_account_id and to_account_id");
      await query(`INSERT INTO transactions (id, household_id, kind, amount_cents, description, from_account_id, to_account_id, date, status, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', NOW())`,
        [rid, data.household_id, data.kind, data.amount_cents, data.description, data.from_account_id, data.to_account_id, data.date]);
    }

    await query(`UPDATE pending_operations SET consumed_at = NOW() WHERE id = $1`, [op.id]);

    onUpdate?.({ content: [{ type: "text", text: "Confirmando operação..." }] });
    return {
      content: [{ type: "text", text: `✅ Operação confirmada e executada: ${data.description} — R$ ${(data.amount_cents / 100).toFixed(2)}` }],
      details: { transaction_id: rid },
    };
  },
};