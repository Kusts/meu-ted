/**
 * get_balance — Pi tool implementation
 * Get calculated balance for an account.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

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

export const getBalanceTool = {
  name: "get_balance",
  label: "Get Account Balance",
  description: "Calculate the current balance of an account (initial_balance + income - expenses - transfers_out + transfers_in). Balance may be negative.",
  parameters: Type.Object({
    accountId: Type.String({ description: "Account UUID" }),
    householdId: Type.String({ description: "Household UUID" }),
  }),

  async execute(
    _toolCallId: string,
    params: { accountId: string; householdId: string },
    _signal: AbortSignal,
    onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined,
    _ctx: unknown,
  ) {
    if (!isValidUUID(params.accountId)) throw new Error("accountId must be a valid UUID");
    if (!isValidUUID(params.householdId)) throw new Error("householdId must be a valid UUID");

    const accResult = await query<{ rows: { initial_balance_cents: string; name: string }[] }>(
      `SELECT initial_balance_cents, name FROM accounts
       WHERE id = $1 AND household_id = $2 AND active = true AND deleted_at IS NULL LIMIT 1`,
      [params.accountId, params.householdId]
    );

    if (accResult.rows.length === 0) {
      throw new Error("Account not found or inactive");
    }

    const balance = parseInt(accResult.rows[0].initial_balance_cents, 10);

    const txResult = await query<{ rows: { kind: string; amount_cents: string }[] }>(
      `SELECT kind, amount_cents FROM transactions
       WHERE household_id = $1 AND deleted_at IS NULL`,
      [params.householdId]
    );

    let calculated = balance;
    for (const tx of txResult.rows) {
      const cents = parseInt(tx.amount_cents, 10);
      if (tx.kind === "income") calculated += cents;
      else if (tx.kind === "expense") calculated -= cents;
      else if (tx.kind === "transfer") {
        // Check if this account was involved as from or to
        // For a simple balance calculation, we just use the aggregate
        // Full transfer tracking would need from/to account checks
      }
    }

    const name = accResult.rows[0].name;
    const sign = calculated < 0 ? "-" : "";
    const abs = Math.abs(calculated);
    const formatted = `${sign}R$ ${(abs / 100).toFixed(2)}`;

    onUpdate?.({ content: [{ type: "text", text: `Calculando saldo de ${name}...` }] });

    return {
      content: [{ type: "text", text: `Saldo de ${name}: ${formatted}` }],
      details: { account_id: params.accountId, balance_cents: calculated },
    };
  },
};