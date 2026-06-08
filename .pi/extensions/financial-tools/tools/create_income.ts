/**
 * create_income — Pi tool
 *
 * Duplicate detection: checks idempotency_key and semantic similarity
 * before inserting. Returns `duplicate_detected` when a match is found.
 */

import { Type } from "typebox";
import { randomUUID } from "node:crypto";
import { findDuplicate, formatDuplicateWarning } from "./duplicate-detector.js";
import { resolveMethod, extractRecipientName, isValidDocument, type TransferMethod } from "./transfer-parser.js";

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
  description: "Register an income transaction. Detects duplicates (idempotency_key or semantic similarity) and asks the user to confirm before registering twice. Pass force=true to override. For incoming transfers (PIX, TED, etc.), set method and recipientName to enable statistics.",
  parameters: Type.Object({
    description: Type.String(),
    amountCents: Type.Number(),
    categoryId: Type.String(),
    accountId: Type.String(),
    date: Type.String(),
    householdId: Type.String(),
    sourceMessageId: Type.Optional(Type.String()),
    idempotencyKey: Type.Optional(Type.String()),
    method: Type.Optional(Type.String({ description: "PIX, TED, DOC, TRANSFER, CASH. Auto-detected from description. Useful for transfer statistics." })),
    senderName: Type.Optional(Type.String({ description: "Sender name for incoming transfers (e.g. PIX received). Auto-extracted from description." })),
    senderDocument: Type.Optional(Type.String({ description: "CPF or CNPJ of sender." })),
    force: Type.Optional(Type.Boolean({ description: "Skip duplicate detection." })),
  }),

  async execute(_id: string, params: any, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!params.description?.trim()) throw new Error("description cannot be empty");
    if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) throw new Error("amount_cents must be positive");
    if (!isUUID(params.categoryId)) throw new Error("category_id must be a valid UUID");
    if (!isUUID(params.accountId)) throw new Error("account_id must be a valid UUID");
    if (!isUUID(params.householdId)) throw new Error("household_id must be a valid UUID");
    if (!isDate(params.date)) throw new Error("date must be YYYY-MM-DD");
    if (params.senderDocument && !isValidDocument(params.senderDocument)) {
      throw new Error("sender_document must be a valid CPF (11 digits) or CNPJ (14 digits)");
    }

    // Resolve method and sender (used for transfer income)
    const method: TransferMethod | null = params.method
      ? resolveMethod(params.description, params.method, "PIX")
      : null;
    const senderName = params.senderName ?? extractRecipientName(params.description);

    // Duplicate detection (unless force=true)
    if (!params.force) {
      const { default: pg } = await import("pg");
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      try {
        const dup = await findDuplicate(pool, {
          householdId: params.householdId,
          kind: "income",
          description: params.description,
          amountCents: params.amountCents,
          date: params.date,
          accountId: params.accountId,
          idempotencyKey: params.idempotencyKey,
        });
        if (dup) {
          const warning = formatDuplicateWarning(dup, params.description);
          return {
        success: false,

        similarity: dup.similarity,
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

    const cat = await query<{ rows: { id: string }[] }>(`SELECT id FROM categories WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`, [params.categoryId, params.householdId]);
    if (!cat.rows.length) throw new Error("Category not found or inactive");

    const acc = await query<{ rows: { id: string }[] }>(`SELECT id FROM accounts WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`, [params.accountId, params.householdId]);
    if (!acc.rows.length) throw new Error("Account not found or inactive");

    const rid = randomUUID();
    const r = await query<{ rows: { id: string }[] }>(
      `INSERT INTO transactions (
        id, household_id, kind, amount_cents, description, category_id,
        to_account_id, date, status, source_message_id, idempotency_key,
        method, recipient_name, recipient_document, created_at
       )
       VALUES ($1, $2, 'income', $3, $4, $5, $6, $7, 'confirmed', $8, $9, $10, $11, $12, NOW()) RETURNING id`,
      [rid, params.householdId, params.amountCents, params.description.trim(), params.categoryId, params.accountId, params.date, params.sourceMessageId ?? null, params.idempotencyKey ?? null, method, senderName, params.senderDocument ?? null]
    );

    onUpdate?.({ content: [{ type: "text", text: "Registrando receita..." }] });
    return {
        success: true,

        transactionId: r.rows[0].id,
        recipient_name: senderName,
      content: [{ type: "text", text: `✅ Receita registrada: ${params.description} — R$ ${(params.amountCents / 100).toFixed(2)} em ${params.date}` }],
      details: {
        transaction_id: r.rows[0].id,
        method,
        recipient_name: senderName,
      },
    };
  },
};