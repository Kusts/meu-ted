/**
 * pay_installment — Mark an installment transaction as paid
 *
 * For out_of_card plans, the user needs to confirm when they pay a specific
 * installment. This tool marks the transaction as 'paid'.
 *
 * For credit_card plans, this is automatic (paying the statement pays the
 * installments), so this tool is for out_of_card use.
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";

interface Params {
  householdId: string;
  transactionId: string;
  paidDate?: string;  // defaults to today
}

const schema = Type.Object({
  householdId: Type.String(),
  transactionId: Type.String(),
  paidDate: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
});

export const payInstallment: ToolDefinition = {
  name: "pay_installment",
  description: "Marca uma parcela específica como paga (para parcelamentos fora do cartão).",
  parameters: schema,
  execute: async (params: Params) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const result = await pool.query<{ rows: Array<{
        id: string;
        description: string;
        amount_cents: string;
        installment_number: number;
        installments_total: number;
        installment_plan_id: string;
        installment_status: string;
      }> }>(
        `SELECT id, description, amount_cents,
                installment_number, installments_total,
                installment_plan_id, installment_status
         FROM transactions
         WHERE id = $1 AND household_id = $2
           AND installment_plan_id IS NOT NULL
           AND deleted_at IS NULL`,
        [params.transactionId, params.householdId]
      );
      if (result.rows.length === 0) {
        return {
          success: false,
          error: "installment_not_found",
          message: "Transação não é uma parcela ou não existe",
        };
      }
      const tx = result.rows[0];
      if (tx.installment_status === "paid") {
        return {
          success: false,
          error: "already_paid",
          message: `Parcela ${tx.installment_number}/${tx.installments_total} já está paga`,
        };
      }

      const paidDate = params.paidDate || new Date().toISOString().slice(0, 10);
      await pool.query(
        `UPDATE transactions
         SET installment_status = 'paid', paid_date = $1
         WHERE id = $2`,
        [paidDate, params.transactionId]
      );

      // Get plan progress
      const progressResult = await pool.query<{ rows: Array<{ paid: string; total: string }> }>(
        `SELECT
           COUNT(*) FILTER (WHERE installment_status = 'paid') as paid,
           COUNT(*) as total
         FROM transactions
         WHERE installment_plan_id = $1 AND deleted_at IS NULL`,
        [tx.installment_plan_id]
      );
      const paid = parseInt(progressResult.rows[0].paid, 10);
      const total = parseInt(progressResult.rows[0].total, 10);

      return {
        success: true,
        transactionId: params.transactionId,
        description: tx.description,
        amountCents: parseInt(tx.amount_cents, 10),
        installmentNumber: tx.installment_number,
        installmentsTotal: tx.installments_total,
        paidDate,
        planProgress: `${paid}/${total} parcelas pagas`,
        isComplete: paid >= total,
        message: `✅ Parcela ${tx.installment_number}/${tx.installments_total} paga: R$ ${(parseInt(tx.amount_cents, 10) / 100).toFixed(2)} (${paid}/${total} no plano)`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * list_due_installments — List all installments that are due (or overdue)
 */
export const listDueInstallments: ToolDefinition = {
  name: "list_due_installments",
  description: "Lista parcelas de parcelamentos fora do cartão que estão próximas do vencimento ou atrasadas.",
  parameters: Type.Object({
    householdId: Type.String(),
    date: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
    daysAhead: Type.Optional(Type.Integer({ minimum: 0, maximum: 30 })),
  }),
  execute: async (params: { householdId: string; date?: string; daysAhead?: number }) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const today = params.date || new Date().toISOString().slice(0, 10);
      const daysAhead = params.daysAhead || 7;
      const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const result = await pool.query<{ rows: any[] }>(
        `SELECT t.id, t.description, t.amount_cents, t.date::text,
                t.installment_number, t.installments_total, t.installment_status,
                p.id as plan_id, p.description as plan_description,
                a.name as account_name
         FROM transactions t
         JOIN installment_plans p ON p.id = t.installment_plan_id
         JOIN accounts a ON a.id = t.from_account_id
         WHERE t.household_id = $1
           AND t.installment_plan_id IS NOT NULL
           AND t.installment_status = 'scheduled'
           AND t.date <= $2
           AND p.type = 'out_of_card'
           AND t.deleted_at IS NULL
         ORDER BY t.date ASC`,
        [params.householdId, futureDate]
      );

      const items = result.rows.map((r) => {
        const amount = parseInt(r.amount_cents, 10);
        const dueDate = new Date(r.date);
        const todayDate = new Date(today);
        const daysUntil = Math.floor((dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
        const isOverdue = daysUntil < 0;
        return {
          transactionId: r.id,
          planDescription: r.plan_description,
          installmentLabel: `${r.installment_number}/${r.installments_total}`,
          amountCents: amount,
          dueDate: r.date,
          daysUntil,
          isOverdue,
          accountName: r.account_name,
          status: r.installment_status,
        };
      });

      const overdue = items.filter((i) => i.isOverdue);
      const upcoming = items.filter((i) => !i.isOverdue);
      const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

      const lines: string[] = [];
      if (overdue.length > 0) {
        lines.push(`🚨 ${overdue.length} ATRASADA(S):`);
        for (const i of overdue) {
          lines.push(`  • ${i.planDescription} (${i.installmentLabel}): ${fmt(i.amountCents)} — venceu há ${Math.abs(i.daysUntil)} dia(s)`);
        }
      }
      if (upcoming.length > 0) {
        lines.push(`📅 ${upcoming.length} vence(m) em ${daysAhead} dias:`);
        for (const i of upcoming) {
          const when = i.daysUntil === 0 ? "hoje" : i.daysUntil === 1 ? "amanhã" : `em ${i.daysUntil} dias`;
          lines.push(`  • ${i.planDescription} (${i.installmentLabel}): ${fmt(i.amountCents)} — ${when} (${i.dueDate})`);
        }
      }
      if (lines.length === 0) lines.push("Nenhuma parcela a vencer");

      const totalDue = items.reduce((s, i) => s + i.amountCents, 0);
      lines.unshift(`💰 Total a pagar: ${fmt(totalDue)}\n`);

      return {
        success: true,
        items,
        overdueCount: overdue.length,
        upcomingCount: upcoming.length,
        totalDueCents: totalDue,
        message: lines.join("\n"),
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
