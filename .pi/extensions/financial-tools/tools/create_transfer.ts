/**
 * create_transfer — Pi tool
 *
 * Detects duplicates before inserting. Returns `duplicate_detected` when a
 * similar transfer (same accounts, same amount, nearby date) is found.
 */

import { Type } from "typebox";
import { randomUUID } from "node:crypto";
import { findDuplicate, formatDuplicateWarning } from "./duplicate-detector.js";

async function query<T extends { rows: unknown[] }>(text: string, params?: unknown[]): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { const r = await pool.query(text, params); return r as T; }
  finally { await pool.end(); }
}
function isUUID(s: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }
function isDate(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)); }

export const createTransferTool = {
  name: "create_transfer",
  label: "Create Transfer",
  description: "Transfer money between two accounts. Cannot transfer to the same account. Detects duplicates (idempotency_key or semantic similarity) and asks the user to confirm. Pass force=true to override.",
  parameters: Type.Object({
    fromAccountId: Type.String(),
    toAccountId: Type.String(),
    amountCents: Type.Number(),
    description: Type.String(),
    date: Type.String(),
    householdId: Type.String(),
    sourceMessageId: Type.Optional(Type.String()),
    idempotencyKey: Type.Optional(Type.String()),
    force: Type.Optional(Type.Boolean({ description: "Skip duplicate detection." })),
  }),

  async execute(_id: string, params: any, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!isUUID(params.fromAccountId)) throw new Error("from_account_id must be a valid UUID");
    if (!isUUID(params.toAccountId)) throw new Error("to_account_id must be a valid UUID");
    if (params.fromAccountId === params.toAccountId) throw new Error("from_account_id and to_account_id must be different");
    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) throw new Error("amount_cents must be positive");
    if (!params.description?.trim()) throw new Error("description cannot be empty");
    if (!isDate(params.date)) throw new Error("date must be YYYY-MM-DD");
    if (!isUUID(params.householdId)) throw new Error("household_id must be a valid UUID");

    // Duplicate detection (unless force=true)
    if (!params.force) {
      const { default: pg } = await import("pg");
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      try {
        const dup = await findDuplicate(pool, {
          householdId: params.householdId,
          kind: "transfer",
          description: params.description,
          amountCents: params.amountCents,
          date: params.date,
          fromAccountId: params.fromAccountId,
          toAccountId: params.toAccountId,
          idempotencyKey: params.idempotencyKey,
        });
        if (dup) {
          const warning = formatDuplicateWarning(dup, params.description);
          return {
            content: [{ type: "text", text: warning }],
            details: {
              duplicate_detected: true,
              existing_transaction_id: dup.id,
              match_type: dup.match_type,
              similarity: dup.similarity,
              hint: "Ask the user to confirm. If they want to register anyway, retry with force=true.",
            },
          };
        }
      } finally {
        await pool.end();
      }
    }

    const accounts = await query<{ rows: { id: string }[] }>(
      `SELECT id FROM accounts WHERE household_id = $1 AND id IN ($2, $3) AND deleted_at IS NULL`,
      [params.householdId, params.fromAccountId, params.toAccountId]
    );
    if (accounts.rows.length !== 2) throw new Error("One or both accounts not found or inactive");

    const rid = randomUUID();
    const r = await query<{ rows: { id: string }[] }>(
      `INSERT INTO transactions (id, household_id, kind, amount_cents, description, from_account_id, to_account_id, date, status, source_message_id, idempotency_key, created_at)
       VALUES ($1, $2, 'transfer', $3, $4, $5, $6, $7, 'confirmed', $8, $9, NOW()) RETURNING id`,
      [rid, params.householdId, params.amountCents, params.description.trim(), params.fromAccountId, params.toAccountId, params.date, params.sourceMessageId ?? null, params.idempotencyKey ?? null]
    );

    onUpdate?.({ content: [{ type: "text", text: "Registrando transferência..." }] });
    return {
      content: [{ type: "text", text: `✅ Transferência registrada: ${params.description} — R$ ${(params.amountCents / 100).toFixed(2)} em ${params.date}` }],
      details: { transaction_id: r.rows[0].id },
    };
  },
};