/**
 * create_account — Pi tool
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

export const createAccountTool = {
  name: "create_account",
  label: "Create Account",
  description: "Create a new account for a household with an initial balance. Detects accounts with the same name (case-insensitive) and asks the user to confirm. Pass force=true to override.",
  parameters: Type.Object({
    name: Type.String(),
    initialBalanceCents: Type.Number(),
    householdId: Type.String(),
    force: Type.Optional(Type.Boolean({ description: "Skip duplicate detection." })),
  }),

  async execute(_id: string, params: any, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!params.name?.trim()) throw new Error("name cannot be empty");
    if (!Number.isInteger(params.initialBalanceCents) || params.initialBalanceCents < 0) throw new Error("initial_balance_cents must be a non-negative integer");
    if (!isUUID(params.householdId)) throw new Error("household_id must be a valid UUID");

    if (!params.force) {
      const existing = await query<{ rows: { id: string; name: string; initial_balance_cents: string }[] }>(
        `SELECT id, name, initial_balance_cents FROM accounts
         WHERE household_id = $1
           AND name_normalized = LOWER(UNACCENT($2))
           AND deleted_at IS NULL
         LIMIT 1`,
        [params.householdId, params.name.trim()]
      );
      if (existing.rows.length) {
        const ex = existing.rows[0];
        const exBal = (parseInt(ex.initial_balance_cents, 10) / 100).toFixed(2);
        return {
          success: false,
          content: [{
            type: "text",
            text: `⚠️ Já existe uma conta com esse nome:
• "${ex.name}" — saldo inicial R$ ${exBal}
ID: ${ex.id}

Quer criar mesmo assim? Responda "sim" para confirmar (será criada como conta separada).`,
          }],
          details: {
            duplicate_detected: true,
            existing_account_id: ex.id,
            match_type: "exact_name",
            hint: "Ask the user to confirm. If they want to create a new account with the same name anyway, retry with force=true.",
          },
        };
      }
    }

    const rid = randomUUID();
    const r = await query<{ rows: { id: string }[] }>(
      `INSERT INTO accounts (id, household_id, name, initial_balance_cents, active, created_at)
       VALUES ($1, $2, $3, $4, true, NOW()) RETURNING id`,
      [rid, params.householdId, params.name.trim(), params.initialBalanceCents]
    );

    onUpdate?.({ content: [{ type: "text", text: "Criando conta..." }] });
    return {
      success: true,
        accountId: r.rows[0].id,
      content: [{ type: "text", text: `✅ Conta criada: ${params.name.trim()} com saldo inicial de R$ ${(params.initialBalanceCents / 100).toFixed(2)}` }],
      details: { account_id: r.rows[0].id },
      account_id: r.rows[0].id,
      message: `Conta criada: ${params.name.trim()} com saldo inicial R$ ${(params.initialBalanceCents / 100).toFixed(2)}`,
    };
  },
};