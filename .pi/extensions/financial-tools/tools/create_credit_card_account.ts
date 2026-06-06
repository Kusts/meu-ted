/**
 * create_credit_card_account — Create a credit card account
 *
 * Creates a new account with is_credit_card=true, credit limit, closing day, due day.
 * Validates inputs (days 1-31, limit > 0).
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";
import { isValidDay } from "./credit-card";

interface Params {
  householdId: string;
  name: string;
  creditLimitCents: number;
  closingDay: number;
  dueDay: number;
  force?: boolean;
}

const schema = Type.Object({
  householdId: Type.String(),
  name: Type.String({ minLength: 1 }),
  creditLimitCents: Type.Integer({ minimum: 1 }),
  closingDay: Type.Integer({ minimum: 1, maximum: 31 }),
  dueDay: Type.Integer({ minimum: 1, maximum: 31 }),
  force: Type.Optional(Type.Boolean()),
});

export const createCreditCardAccount: ToolDefinition = {
  name: "create_credit_card_account",
  description: "Cria uma conta de cartão de crédito com limite, dia de fechamento e dia de vencimento.",
  parameters: schema,
  execute: async (params: Params) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      if (!isValidDay(params.closingDay)) {
        return { success: false, error: "closingDay deve estar entre 1 e 31" };
      }
      if (!isValidDay(params.dueDay)) {
        return { success: false, error: "dueDay deve estar entre 1 e 31" };
      }
      if (params.creditLimitCents <= 0) {
        return { success: false, error: "creditLimitCents deve ser positivo" };
      }

      // Check duplicates (by name)
      if (!params.force) {
        const dupResult = await pool.query<{ rows: Array<{ id: string; name: string }> }>(
          `SELECT id, name FROM accounts
           WHERE household_id = $1 AND deleted_at IS NULL
             AND name_normalized = LOWER(UNACCENT($2))`,
          [params.householdId, params.name]
        );
        if (dupResult.rows.length > 0) {
          return {
            success: false,
            error: "duplicate",
            message: `Já existe conta com nome similar: ${dupResult.rows[0].name}`,
            hint: "Passe force=true se quiser criar mesmo assim",
          };
        }
      }

      // Check for similar credit card (same closing/due day)
      if (!params.force) {
        const similar = await pool.query<{ rows: Array<{ id: string; name: string; closing_day: number; due_day: number }> }>(
          `SELECT id, name, closing_day, due_day
           FROM accounts
           WHERE household_id = $1 AND is_credit_card = true AND deleted_at IS NULL
             AND closing_day = $2 AND due_day = $3`,
          [params.householdId, params.closingDay, params.dueDay]
        );
        if (similar.rows.length > 0) {
          return {
            success: false,
            error: "similar_card_exists",
            message: `Já existe cartão com mesmo fechamento/vencimento: ${similar.rows[0].name}`,
            hint: "Passe force=true se quiser criar mesmo assim",
          };
        }
      }

      // Create
      const result = await pool.query<{ rows: Array<{ id: string }> }>(
        `INSERT INTO accounts (
          id, household_id, name, name_normalized,
          initial_balance_cents, is_credit_card, credit_limit_cents,
          closing_day, due_day, active, created_at
        )
        VALUES (
          gen_random_uuid(), $1, $2, LOWER(UNACCENT($2)),
          0, true, $3, $4, $5, true, NOW()
        )
        RETURNING id`,
        [params.householdId, params.name, params.creditLimitCents, params.closingDay, params.dueDay]
      );

      const id = result.rows[0].id;
      return {
        success: true,
        id,
        name: params.name,
        creditLimitCents: params.creditLimitCents,
        closingDay: params.closingDay,
        dueDay: params.dueDay,
        message: `✅ Cartão criado: ${params.name}`,
        details: {
          limit: `R$ ${(params.creditLimitCents / 100).toFixed(2)}`,
          closing: `dia ${params.closingDay}`,
          due: `dia ${params.dueDay}`,
        },
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
