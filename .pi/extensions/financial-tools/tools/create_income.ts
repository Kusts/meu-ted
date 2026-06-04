/**
 * create_income — Pi tool
 */

import { Type } from "typebox";
import { randomUUID } from "node:crypto";

async function query<T extends { rows: unknown[] }>(text: string, params?: unknown[]): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { const r = await pool.query(text, params); return r as T; }
  finally { await pool.end(); }
}
function isUUID(s: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }
function isDate(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)); }

export const createIncomeTool = {
  name: "create_income",
  label: "Create Income",
  description: "Register an income transaction. Idempotent via idempotency_key.",
  parameters: Type.Object({
    description: Type.String(),
    amountCents: Type.Number(),
    categoryId: Type.String(),
    accountId: Type.String(),
    date: Type.String(),
    householdId: Type.String(),
    sourceMessageId: Type.Optional(Type.String()),
    idempotencyKey: Type.Optional(Type.String()),
  }),

  async execute(_id: string, params: any, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!params.description?.trim()) throw new Error("description cannot be empty");
    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) throw new Error("amount_cents must be positive");
    if (!isUUID(params.categoryId)) throw new Error("category_id must be a valid UUID");
    if (!isUUID(params.accountId)) throw new Error("account_id must be a valid UUID");
    if (!isUUID(params.householdId)) throw new Error("household_id must be a valid UUID");
    if (!isDate(params.date)) throw new Error("date must be YYYY-MM-DD");

    if (params.idempotencyKey) {
      const ex = await query<{ rows: { id: string }[] }>(
        `SELECT id FROM transactions WHERE household_id = $1 AND idempotency_key = $2 AND deleted_at IS NULL LIMIT 1`,
        [params.householdId, params.idempotencyKey]
      );
      if (ex.rows.length) return { content: [{ type: "text", text: `Receita já registrada (idempotency): ${ex.rows[0].id}` }], details: { transaction_id: ex.rows[0].id, idempotent: true } };
    }

    const cat = await query<{ rows: { id: string }[] }>(`SELECT id FROM categories WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`, [params.categoryId, params.householdId]);
    if (!cat.rows.length) throw new Error("Category not found or inactive");

    const acc = await query<{ rows: { id: string }[] }>(`SELECT id FROM accounts WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`, [params.accountId, params.householdId]);
    if (!acc.rows.length) throw new Error("Account not found or inactive");

    const rid = randomUUID();
    const r = await query<{ rows: { id: string }[] }>(
      `INSERT INTO transactions (id, household_id, kind, amount_cents, description, category_id, to_account_id, date, status, source_message_id, idempotency_key, created_at)
       VALUES ($1, $2, 'income', $3, $4, $5, $6, $7, 'confirmed', $8, $9, NOW()) RETURNING id`,
      [rid, params.householdId, params.amountCents, params.description.trim(), params.categoryId, params.accountId, params.date, params.sourceMessageId ?? null, params.idempotencyKey ?? null]
    );

    onUpdate?.({ content: [{ type: "text", text: "Registrando receita..." }] });
    return {
      content: [{ type: "text", text: `✅ Receita registrada: ${params.description} — R$ ${(params.amountCents / 100).toFixed(2)} em ${params.date}` }],
      details: { transaction_id: r.rows[0].id },
    };
  },
};