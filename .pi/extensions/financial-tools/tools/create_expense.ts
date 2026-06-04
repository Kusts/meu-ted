/**
 * create_expense — Pi tool implementation
 * Register an expense transaction.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { randomUUID } from "node:crypto";

async function query<T extends { rows: unknown[] }>(text: string, params?: unknown[]): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(text, params);
    return result as T;
  } finally {
    await pool.end();
  }
}

function isValidUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

export const createExpenseTool = {
  name: "create_expense",
  label: "Create Expense",
  description: "Register an expense transaction. amount_cents is always positive; sign is encoded as kind='expense'. Idempotent: if idempotency_key matches an existing transaction, returns that transaction instead.",
  parameters: Type.Object({
    description: Type.String({ description: "Description of the expense" }),
    amountCents: Type.Number({ description: "Amount in cents (positive integer)" }),
    categoryId: Type.String({ description: "Category UUID" }),
    accountId: Type.String({ description: "Account UUID" }),
    date: Type.String({ description: "Date in YYYY-MM-DD format" }),
    householdId: Type.String({ description: "Household UUID" }),
    sourceMessageId: Type.Optional(Type.String()),
    idempotencyKey: Type.Optional(Type.String()),
  }),

  async execute(
    _toolCallId: string,
    params: {
      description: string;
      amountCents: number;
      categoryId: string;
      accountId: string;
      date: string;
      householdId: string;
      sourceMessageId?: string;
      idempotencyKey?: string;
    },
    _signal: AbortSignal,
    onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined,
    _ctx: unknown,
  ) {
    // Validate inputs
    if (!params.description?.trim()) throw new Error("description cannot be empty");
    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) throw new Error("amount_cents must be a positive integer");
    if (!isValidUUID(params.categoryId)) throw new Error("category_id must be a valid UUID");
    if (!isValidUUID(params.accountId)) throw new Error("account_id must be a valid UUID");
    if (!isValidUUID(params.householdId)) throw new Error("household_id must be a valid UUID");
    if (!isValidDate(params.date)) throw new Error("date must be in YYYY-MM-DD format");

    // Idempotency check
    if (params.idempotencyKey) {
      const existing = await query<{ rows: { id: string }[] }>(
        `SELECT id FROM transactions WHERE household_id = $1 AND idempotency_key = $2 AND deleted_at IS NULL LIMIT 1`,
        [params.householdId, params.idempotencyKey]
      );
      if (existing.rows.length > 0) {
        return {
          content: [{ type: "text", text: `Despesa já registrada (idempotency): ${existing.rows[0].id}` }],
          details: { transaction_id: existing.rows[0].id, idempotent: true },
        };
      }
    }

    // Verify category exists
    const catCheck = await query<{ rows: { id: string }[] }>(
      `SELECT id FROM categories WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [params.categoryId, params.householdId]
    );
    if (catCheck.rows.length === 0) throw new Error("Category not found or inactive");

    // Verify account exists
    const accCheck = await query<{ rows: { id: string }[] }>(
      `SELECT id FROM accounts WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [params.accountId, params.householdId]
    );
    if (accCheck.rows.length === 0) throw new Error("Account not found or inactive");

    // Insert transaction
    const id = randomUUID();
    const result = await query<{ rows: { id: string }[] }>(
      `INSERT INTO transactions (id, household_id, kind, amount_cents, description, category_id, from_account_id, date, status, source_message_id, idempotency_key, created_at)
       VALUES ($1, $2, 'expense', $3, $4, $5, $6, $7, 'confirmed', $8, $9, NOW())
       RETURNING id`,
      [id, params.householdId, params.amountCents, params.description.trim(), params.categoryId, params.accountId, params.date, params.sourceMessageId ?? null, params.idempotencyKey ?? null]
    );

    onUpdate?.({ content: [{ type: "text", text: "Registrando despesa..." }] });

    return {
      content: [{
        type: "text",
        text: `✅ Despesa registrada: ${params.description} — R$ ${(params.amountCents / 100).toFixed(2)} em ${params.date}`,
      }],
      details: { transaction_id: result.rows[0].id },
    };
  },
};