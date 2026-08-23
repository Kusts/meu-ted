/**
 * duplicate-detector â€” Shared helper
 *
 * Detects semantically duplicate transactions across all create operations.
 * Used by create_expense, create_income, create_transfer, and the account/category
 * create tools to warn the user before registering.
 *
 * Detection strategy:
 * 1. **Idempotency key** (exact match) â€” always wins
 * 2. **Semantic similarity** â€” same household + same kind + similar description
 *    + same amount + same account + within 1 day window
 *
 * When a duplicate is detected, the tool returns a "duplicate_detected" response
 * with the existing record. The agent (TED) should ask the user to confirm
 * before calling again with `force: true`.
 */

import type { Pool } from "pg";

export interface DuplicateCheckParams {
  householdId: string;
  kind: "expense" | "income" | "transfer";
  description: string;
  amountCents: number;
  date: string;
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  /** Existing idempotency key (highest priority) */
  idempotencyKey?: string;
  /** Time window in days for semantic match (default: 1) */
  windowDays?: number;
}

export interface DuplicateMatch {
  id: string;
  kind: string;
  amount_cents: string;
  description: string;
  date: Date;
  from_account_id: string | null;
  to_account_id: string | null;
  created_at: Date;
  match_type: "idempotency_key" | "semantic";
  similarity: number; // 0-1, where 1 is exact match
}

/**
 * Normalize a string for similarity comparison.
 * - Lowercase
 * - Remove accents
 * - Remove extra whitespace
 * - Strip common stopwords (em, no, na, de, da, do, com, etc.)
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(em|no|na|de|da|do|com|para|pra|e|ou|a|o)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compute Jaccard similarity between two normalized strings.
 * Tokens are words; similarity = |intersection| / |union|.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalize(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalize(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) if (tokensB.has(t)) intersection++;
  return intersection / (tokensA.size + tokensB.size - intersection);
}

/**
 * Check if two dates are within N days of each other.
 */
function withinDays(date1: string, date2: Date, days: number): boolean {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diff = Math.abs(d1.getTime() - d2.getTime());
  return diff <= days * 24 * 60 * 60 * 1000;
}

/**
 * Look up an existing transaction that may be a duplicate of the new one.
 * Returns the best match (idempotency key first, then highest similarity >= 0.6)
 * or null if no match found.
 *
 * NOTE: This is the application-level check. The UNIQUE constraint on
 * (household_id, idempotency_key) catches exact-key races at the DB level.
 */
export async function findDuplicate(
  pool: Pool,
  params: DuplicateCheckParams
): Promise<DuplicateMatch | null> {
  const windowDays = params.windowDays ?? 1;
  const minDate = new Date(
    new Date(params.date).getTime() - windowDays * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 10);
  const maxDate = new Date(
    new Date(params.date).getTime() + windowDays * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 10);

  // 1. Exact idempotency key match (highest priority)
  if (params.idempotencyKey) {
    const keyResult = await pool.query(
      `SELECT id, kind, amount_cents, description, date, from_account_id, to_account_id, created_at
       FROM transactions
       WHERE household_id = $1
         AND idempotency_key = $2
         AND deleted_at IS NULL
       LIMIT 1`,
      [params.householdId, params.idempotencyKey]
    );
    if (keyResult.rows.length > 0) {
      const row = keyResult.rows[0] as any;
      return { ...row, match_type: "idempotency_key", similarity: 1.0 };
    }
  }

  // 2. Semantic match: same kind, similar amount, same account, nearby date
  const accountId = params.accountId ?? params.fromAccountId;
  const result = await pool.query(
    `SELECT id, kind, amount_cents, description, date, from_account_id, to_account_id, created_at
     FROM transactions
     WHERE household_id = $1
       AND kind = $2
       AND amount_cents = $3
       AND date BETWEEN $4 AND $5
       AND deleted_at IS NULL
       AND (
         ($6::uuid IS NOT NULL AND (from_account_id = $6 OR to_account_id = $6))
         OR ($6::uuid IS NULL)
       )
     ORDER BY created_at DESC
     LIMIT 20`,
    [params.householdId, params.kind, params.amountCents, minDate, maxDate, accountId ?? null]
  );

  // Compute similarity for each candidate
  let bestMatch: DuplicateMatch | null = null;
  for (const r of result.rows) {
    const row = r as any;
    const sim = jaccardSimilarity(params.description, row.description);
    if (sim >= 0.6 && (!bestMatch || sim > bestMatch.similarity)) {
      bestMatch = { ...row, match_type: "semantic", similarity: sim };
    }
  }

  return bestMatch;
}

/**
 * Format a duplicate match as a human-readable warning for the agent.
 * The agent should present this to the user and ask for confirmation.
 */
export function formatDuplicateWarning(match: DuplicateMatch, newDesc: string): string {
  const dateStr = new Date(match.date).toISOString().slice(0, 10);
  const amount = (parseInt(match.amount_cents, 10) / 100).toFixed(2);
  const simPct = Math.round(match.similarity * 100);

  if (match.match_type === "idempotency_key") {
    return `âš ï¸ JÃ¡ existe um lanÃ§amento com essa chave de idempotÃªncia:
â€¢ ${match.description} â€” R$ ${amount} em ${dateStr}
ID: ${match.id}

Quer registrar mesmo assim? Responda "sim" para confirmar.`;
  }

  return `ðŸ¤” Achei um lanÃ§amento bem parecido:
â€¢ "${match.description}" â€” R$ ${amount} em ${dateStr} (${simPct}% similar)

Seu novo: "${newDesc}"

Ã‰ o mesmo gasto? Se sim, vou sÃ³ atualizar. Se for diferente, responda "sim" pra registrar mesmo assim.`;
}
