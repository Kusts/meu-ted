/**
 * pay_statement — Pay a credit card statement (total or partial)
 *
 * Updates paid_cents on the statement.
 * If fully paid → status becomes 'paid'.
 * If partial → status becomes 'partial' (or 'overdue' if past due_date).
 * Also creates an "outgoing" transaction from the payment account to "pay" the credit card.
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";
import { refreshStatementStatus, getStatementPurchases } from "./credit-card";
import { findDuplicate } from "./duplicate-detector";

interface Params {
  householdId: string;
  statementId: string;
  amountCents: number;  // partial amount, or full if not specified
  fromAccountId: string;  // account that pays (debit/conta)
  sourceMessageId?: string;
  force?: boolean;
}

const schema = Type.Object({
  householdId: Type.String(),
  statementId: Type.String(),
  amountCents: Type.Integer({ minimum: 1 }),
  fromAccountId: Type.String(),
  sourceMessageId: Type.Optional(Type.String()),
  force: Type.Optional(Type.Boolean()),
});

export const payStatement: ToolDefinition = {
  name: "pay_statement",
  description: "Paga (total ou parcial) uma fatura de cartão de crédito. amountCents é o valor pago.",
  parameters: schema,
  execute: async (params: Params) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      // 1. Get statement
      const stmtResult = await pool.query<{ rows: Array<{
        id: string;
        account_id: string;
        cycle_year_month: string;
        closing_date: string;
        due_date: string;
        total_cents: string;
        paid_cents: string;
        status: string;
      }> }>(
        `SELECT id, account_id, cycle_year_month, closing_date::text, due_date::text,
                total_cents, paid_cents, status
         FROM statements WHERE id = $1`,
        [params.statementId]
      );
      if (stmtResult.rows.length === 0) {
        return { success: false, error: "statement_not_found" };
      }
      const stmt = stmtResult.rows[0];
      const totalCents = parseInt(stmt.total_cents, 10);
      const currentPaidCents = parseInt(stmt.paid_cents, 10);
      const remaining = totalCents - currentPaidCents;

      if (remaining <= 0) {
        return {
          success: false,
          error: "already_paid",
          message: "Fatura já está totalmente paga",
        };
      }

      // 2. Validate amount
      if (params.amountCents > remaining) {
        return {
          success: false,
          error: "overpayment",
          message: `Valor R$ ${(params.amountCents / 100).toFixed(2)} excede saldo R$ ${(remaining / 100).toFixed(2)}`,
          hint: "Passe amountCents = saldo restante para pagar total",
        };
      }

      // 3. Check duplicate
      if (!params.force) {
        const dup = await findDuplicate(pool, "expense", params.householdId, {
          description: `Pagamento fatura ${stmt.cycle_year_month}`,
          amountCents: params.amountCents,
          date: new Date().toISOString().slice(0, 10),
        });
        if (dup) {
          return {
            success: false,
            error: "duplicate",
            message: `Pagamento similar já existe: ${dup.description} (R$ ${(dup.amount_cents / 100).toFixed(2)})`,
            duplicate: dup,
            hint: "Passe force=true se quiser pagar mesmo assim",
          };
        }
      }

      // 4. Update statement
      const newPaidCents = currentPaidCents + params.amountCents;
      await pool.query(
        `UPDATE statements SET paid_cents = $1, updated_at = NOW() WHERE id = $2`,
        [newPaidCents, params.statementId]
      );

      // 5. Refresh status
      const today = new Date().toISOString().slice(0, 10);
      const newStatus = await refreshStatementStatus(pool, params.statementId, today);

      // 6. Create outgoing transaction (debit from payment account)
      const idempKey = `paystmt-${params.statementId}-${Date.now()}`;
      const txResult = await pool.query<{ rows: Array<{ id: string }> }>(
        `INSERT INTO transactions (
          id, household_id, from_account_id, description, amount_cents, date,
          kind, source_message_id, idempotency_key, created_at
        )
        VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5,
          'expense', $6, $7, NOW()
        )
        RETURNING id`,
        [
          params.householdId,
          params.fromAccountId,
          `Pagamento fatura ${stmt.cycle_year_month}`,
          params.amountCents,
          today,
          params.sourceMessageId || null,
          idempKey,
        ]
      );

      const stillRemaining = totalCents - newPaidCents;
      const isFullPayment = newPaidCents >= totalCents;
      return {
        success: true,
        id: txResult.rows[0].id,
        statementId: params.statementId,
        amountPaid: params.amountCents,
        totalStatement: totalCents,
        newPaidTotal: newPaidCents,
        remaining: stillRemaining,
        status: newStatus,
        message: isFullPayment
          ? `✅ Fatura ${stmt.cycle_year_month} paga: R$ ${(params.amountCents / 100).toFixed(2)}`
          : `✅ Pagamento parcial fatura ${stmt.cycle_year_month}: R$ ${(params.amountCents / 100).toFixed(2)} (saldo R$ ${(stillRemaining / 100).toFixed(2)})`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
