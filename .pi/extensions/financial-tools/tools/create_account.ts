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
  description: "Create a new account for a household with an initial balance.",
  parameters: Type.Object({
    name: Type.String(),
    initialBalanceCents: Type.Number(),
    householdId: Type.String(),
  }),

  async execute(_id: string, params: any, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!params.name?.trim()) throw new Error("name cannot be empty");
    if (!Number.isInteger(params.initialBalanceCents) || params.initialBalanceCents < 0) throw new Error("initial_balance_cents must be a non-negative integer");
    if (!isUUID(params.householdId)) throw new Error("household_id must be a valid UUID");

    const existing = await query<{ rows: { id: string }[] }>(
      `SELECT id FROM accounts WHERE household_id = $1 AND LOWER(name) = LOWER($2) AND deleted_at IS NULL LIMIT 1`,
      [params.householdId, params.name.trim()]
    );
    if (existing.rows.length) throw new Error(`Account with name="${params.name.trim()}" already exists in this household`);

    const rid = randomUUID();
    const r = await query<{ rows: { id: string }[] }>(
      `INSERT INTO accounts (id, household_id, name, initial_balance_cents, active, created_at)
       VALUES ($1, $2, $3, $4, true, NOW()) RETURNING id`,
      [rid, params.householdId, params.name.trim(), params.initialBalanceCents]
    );

    onUpdate?.({ content: [{ type: "text", text: "Criando conta..." }] });
    return {
      content: [{ type: "text", text: `✅ Conta criada: ${params.name.trim()} com saldo inicial de R$ ${(params.initialBalanceCents / 100).toFixed(2)}` }],
      details: { account_id: r.rows[0].id },
    };
  },
};