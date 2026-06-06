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

    const pending = await query<{ rows: {
      id: string;
      household_id: string;
      kind: string;
      amount_cents: string;
      description: string;
      category_id: string | null;
      from_account_id: string | null;
      to_account_id: string | null;
      date: Date;
    }[] }>(
      `SELECT id, household_id, kind, amount_cents, description, category_id,
              from_account_id, to_account_id, date
       FROM pending_operations
       WHERE chat_id = $1 AND expires_at > NOW() AND status = 'awaiting_confirmation'
       LIMIT 1`,
      [params.chatId]
    );
    if (!pending.rows.length) throw new Error("No pending operation found or it has expired");

    const op = pending.rows[0];
    const amountCents = parseInt(op.amount_cents, 10);
    const dateStr = new Date(op.date).toISOString().slice(0, 10);

    const rid = randomUUID();

    if (op.kind === "expense") {
      if (!op.category_id || !op.from_account_id) throw new Error("expense requires category_id and from_account_id");
      await query(`INSERT INTO transactions (id, household_id, kind, amount_cents, description, category_id, from_account_id, date, status, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', NOW())`,
        [rid, op.household_id, op.kind, amountCents, op.description, op.category_id, op.from_account_id, dateStr]);
    } else if (op.kind === "income") {
      if (!op.category_id || !op.to_account_id) throw new Error("income requires category_id and to_account_id");
      await query(`INSERT INTO transactions (id, household_id, kind, amount_cents, description, category_id, to_account_id, date, status, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', NOW())`,
        [rid, op.household_id, op.kind, amountCents, op.description, op.category_id, op.to_account_id, dateStr]);
    } else if (op.kind === "transfer") {
      if (!op.from_account_id || !op.to_account_id) throw new Error("transfer requires from_account_id and to_account_id");
      await query(`INSERT INTO transactions (id, household_id, kind, amount_cents, description, from_account_id, to_account_id, date, status, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', NOW())`,
        [rid, op.household_id, op.kind, amountCents, op.description, op.from_account_id, op.to_account_id, dateStr]);
    }

    await query(`UPDATE pending_operations SET status = 'confirmed' WHERE id = $1`, [op.id]);

    onUpdate?.({ content: [{ type: "text", text: "Confirmando operação..." }] });
    return {
      content: [{ type: "text", text: `✅ Operação confirmada e executada: ${op.description} — R$ ${(amountCents / 100).toFixed(2)}` }],
      details: { transaction_id: rid },
    };
  },
};