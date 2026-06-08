/**
 * list_accounts — Pi tool implementation
 * List all active accounts for a household.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

interface AccountRow {
  id: string;
  name: string;
  initial_balance_cents: string;
  active: boolean;
  created_at: Date;
}

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

export const listAccountsTool = {
  name: "list_accounts",
  label: "List Accounts",
  description: "List all active accounts for a household. Returns account name, current balance (calculated from initial_balance + transactions), and status.",
  parameters: Type.Object({
    householdId: Type.String({
      description: "Household UUID",
    }),
  }),

  async execute(
    _toolCallId: string,
    params: { householdId: string },
    _signal: AbortSignal,
    onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined,
    _ctx: unknown,
  ) {
    if (!isValidUUID(params.householdId)) {
      throw new Error("householdId must be a valid UUID");
    }

    const result = await query<{ rows: AccountRow[] }>(
      `SELECT id, name, initial_balance_cents, active, created_at
       FROM accounts
       WHERE household_id = $1 AND active = true AND deleted_at IS NULL
       ORDER BY name`,
      [params.householdId]
    );

    // Calculate balance for each account
    const txResult = await query<{ rows: { from_account_id: string | null; to_account_id: string | null; kind: string; amount_cents: string }[] }>(
      `SELECT from_account_id, to_account_id, kind, amount_cents
       FROM transactions
       WHERE household_id = $1 AND deleted_at IS NULL`,
      [params.householdId]
    );

    const accounts = result.rows.map((row) => {
      let balance = parseInt(row.initial_balance_cents, 10);
      for (const tx of txResult.rows) {
        const cents = parseInt(tx.amount_cents, 10);
        if (tx.from_account_id === row.id) {
          if (tx.kind === "expense" || tx.kind === "transfer") balance -= cents;
        }
        if (tx.to_account_id === row.id) {
          if (tx.kind === "income" || tx.kind === "transfer") balance += cents;
        }
      }
      return {
        id: row.id,
        name: row.name,
        balance_cents: balance,
        active: row.active,
      };
    });

    const text = accounts.length === 0
      ? "Nenhuma conta encontrada neste household."
      : accounts
          .map((a) => `• ${a.name}: R$ ${(a.balance_cents / 100).toFixed(2)} (${a.active ? "ativa" : "inativa"})`)
          .join("\n");

    onUpdate?.({ content: [{ type: "text", text: "Carregando contas..." }] });

    return {
        success: true,
        accounts,
      content: [{ type: "text", text }],
      details: { accounts },
    };
  },
};