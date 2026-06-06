/**
 * create_installment_plan — Universal installment plan creator
 *
 * Supports two types:
 * - "credit_card": installments are added to card statements (no interest usually)
 * - "out_of_card": direct installments from any account (can have interest)
 *
 * Examples:
 * - "12x de R$100 na fatura do cartão" → credit_card
 * - "12x de R$120 no boleto (com juros)" → out_of_card
 * - "Parcelei em 3x no carnê da loja" → out_of_card
 *
 * Generates N transactions, all linked by installment_plan_id.
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";
import {
  buildInstallmentSchedule,
  buildPlanSummary,
  getScheduleYears,
  formatPlanSummary,
  type PlanType,
} from "./installment-plan";
import { autoCategorize } from "./categorizer";
import { findDuplicate } from "./duplicate-detector";

interface Params {
  householdId: string;
  accountId: string;
  description: string;
  totalAmountCents: number;
  installmentsCount: number;  // 1-48
  type: PlanType;  // 'credit_card' or 'out_of_card'
  firstDueDate: string;  // YYYY-MM-DD
  interestRate?: number;  // 0 to 1, e.g. 0.0299 for 2.99%/month
  categoryId?: string;
  sourceMessageId?: string;
  force?: boolean;
}

const schema = Type.Object({
  householdId: Type.String(),
  accountId: Type.String(),
  description: Type.String({ minLength: 1 }),
  totalAmountCents: Type.Integer({ minimum: 100 }),  // min R$ 1
  installmentsCount: Type.Integer({ minimum: 1, maximum: 48 }),
  type: Type.Union([Type.Literal("credit_card"), Type.Literal("out_of_card")]),
  firstDueDate: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
  interestRate: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  categoryId: Type.Optional(Type.String()),
  sourceMessageId: Type.Optional(Type.String()),
  force: Type.Optional(Type.Boolean()),
});

export const createInstallmentPlan: ToolDefinition = {
  name: "create_installment_plan",
  description: "Cria um plano de parcelamento. Pode ser no cartão (vai pra fatura) ou fora (boleto/carnê/financ).",
  parameters: schema,
  execute: async (params: Params) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      // 1. Validate account type
      const accResult = await pool.query<{ rows: Array<{ is_credit_card: boolean; name: string }> }>(
        `SELECT is_credit_card, name FROM accounts WHERE id = $1 AND deleted_at IS NULL`,
        [params.accountId]
      );
      if (accResult.rows.length === 0) {
        return { success: false, error: "account_not_found" };
      }
      const acc = accResult.rows[0];
      if (params.type === "credit_card" && !acc.is_credit_card) {
        return {
          success: false,
          error: "type_mismatch",
          message: `Conta ${acc.name} não é cartão de crédito. Use type=out_of_card.`,
        };
      }

      // 2. Build schedule
      const schedule = buildInstallmentSchedule(
        params.totalAmountCents,
        params.installmentsCount,
        params.firstDueDate,
        params.interestRate || 0
      );

      // 3. Auto-categorize
      let categoryId = params.categoryId;
      let categoryInfo: any = null;
      if (!categoryId) {
        const cat = await autoCategorize(
          pool,
          params.householdId,
          params.description,
          "expense"
        );
        if (cat) {
          categoryId = cat.id;
          categoryInfo = cat.match;
        }
      }

      // 4. Check duplicates
      if (!params.force) {
        const dup = await findDuplicate(pool, {
          householdId: params.householdId,
          kind: "expense",
          description: params.description,
          amountCents: schedule[0].amountCents,
          date: schedule[0].date,
          fromAccountId: params.accountId,
        });
        if (dup) {
          return {
            success: false,
            error: "duplicate",
            message: `Plano similar já existe: ${dup.description}`,
            duplicate: dup,
            hint: "Passe force=true se quiser criar mesmo assim",
          };
        }
      }

      // 5. Insert plan and all installments in transaction
      const transactionIds: string[] = [];
      const client = await pool.connect();
      let planId: string;
      try {
        await client.query("BEGIN");
        const planResult = await client.query<{ rows: Array<{ id: string }> }>(
          `INSERT INTO installment_plans (
            id, household_id, account_id, category_id, description,
            total_amount_cents, installments_count, interest_rate, type,
            first_due_date, start_date, source_message_id, created_at
          )
          VALUES (
            gen_random_uuid(), $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11, NOW()
          )
          RETURNING id`,
          [
            params.householdId,
            params.accountId,
            categoryId,
            params.description,
            params.totalAmountCents,
            params.installmentsCount,
            params.interestRate || 0,
            params.type,
            params.firstDueDate,
            params.firstDueDate,
            params.sourceMessageId || null,
          ]
        );
        planId = planResult.rows[0].id;

        // Insert all installment transactions
        for (const inst of schedule) {
          const idempKey = `plan-${planId}-${inst.number}`;
          const txResult = await client.query<{ rows: Array<{ id: string }> }>(
            `INSERT INTO transactions (
              id, household_id, from_account_id, description, amount_cents, date,
              kind, category_id, installment_plan_id, installments_total, installment_number,
              is_credit_card_purchase, installment_status, idempotency_key, created_at
            )
            VALUES (
              gen_random_uuid(), $1, $2, $3, $4, $5,
              'expense', $6, $7, $8, $9,
              $10, $11, $12, NOW()
            )
            RETURNING id`,
            [
              params.householdId,
              params.accountId,
              `${params.description} (${inst.number}/${params.installmentsCount})`,
              inst.amountCents,
              inst.date,
              categoryId,
              planId,
              params.installmentsCount,
              inst.number,
              params.type === "credit_card",
              "scheduled",
              idempKey,
            ]
          );
          transactionIds.push(txResult.rows[0].id);
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }

      // 6. Build response
      const planData = {
        householdId: params.householdId,
        accountId: params.accountId,
        description: params.description,
        totalAmountCents: params.totalAmountCents,
        installmentsCount: params.installmentsCount,
        interestRate: params.interestRate || 0,
        type: params.type,
        firstDueDate: params.firstDueDate,
        startDate: params.firstDueDate,
      };
      const summary = buildPlanSummary(planData, schedule);
      summary.plan = { ...summary.plan, id: planId } as any;

      const totalWithInterest = schedule.reduce((s, x) => s + x.amountCents, 0);
      const totalInterest = schedule.reduce((s, x) => s + x.interestCents, 0);
      const years = getScheduleYears(schedule);

      const response: any = {
        success: true,
        planId,
        transactionIds,
        description: params.description,
        type: params.type,
        installmentsCount: params.installmentsCount,
        totalAmountCents: params.totalAmountCents,
        totalWithInterestCents: totalWithInterest,
        totalInterestCents: totalInterest,
        monthlyPaymentCents: schedule[0].amountCents,
        firstDueDate: params.firstDueDate,
        lastDueDate: schedule[schedule.length - 1].dueDate,
        crossesYear: years.length > 1,
        years,
        affectedMonths: summary.months,
        message:
          params.type === "credit_card"
            ? `💳 Parcelamento no cartão: ${params.description} em ${params.installmentsCount}x de R$ ${(schedule[0].amountCents / 100).toFixed(2)}`
            : `📋 Parcelamento criado: ${params.description} em ${params.installmentsCount}x de R$ ${(schedule[0].amountCents / 100).toFixed(2)}${totalInterest > 0 ? ` (total com juros: R$ ${(totalWithInterest / 100).toFixed(2)})` : ""}`,
        schedule: params.installmentsCount <= 24 ? schedule : undefined,
        formatted: formatPlanSummary(summary),
      };
      if (categoryInfo) {
        response.category = categoryInfo.fullName;
        response.confidence = Math.round(categoryInfo.confidence * 100);
      }
      return response;
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * list_installment_plans — List all active installment plans
 */
export const listInstallmentPlans: ToolDefinition = {
  name: "list_installment_plans",
  description: "Lista todos os planos de parcelamento (cartão e fora).",
  parameters: Type.Object({
    householdId: Type.String(),
    type: Type.Optional(Type.Union([Type.Literal("credit_card"), Type.Literal("out_of_card")])),
    active: Type.Optional(Type.Boolean()),  // still has remaining installments
  }),
  execute: async (params: { householdId: string; type?: PlanType; active?: boolean }) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const conditions = ["p.household_id = $1"];
      const queryParams: any[] = [params.householdId];
      if (params.type) {
        conditions.push(`p.type = $${queryParams.length + 1}`);
        queryParams.push(params.type);
      }

      const result = await pool.query<{ rows: any[] }>(
        `SELECT p.id, p.description, p.total_amount_cents, p.installments_count,
                p.interest_rate, p.type, p.first_due_date::text, p.start_date::text,
                a.name as account_name,
                COALESCE(c.name, 'Sem categoria') as category_name,
                COUNT(t.id) FILTER (WHERE t.installment_status = 'paid' AND t.deleted_at IS NULL) as paid_count,
                COALESCE(SUM(t.amount_cents) FILTER (WHERE t.installment_status = 'paid' AND t.deleted_at IS NULL), 0) as paid_cents,
                COUNT(t.id) FILTER (WHERE t.installment_status = 'scheduled' AND t.deleted_at IS NULL) as scheduled_count
         FROM installment_plans p
         JOIN accounts a ON a.id = p.account_id
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN transactions t ON t.installment_plan_id = p.id
         WHERE ${conditions.join(" AND ")}
         GROUP BY p.id, a.name, c.name
         ORDER BY p.first_due_date DESC`,
        queryParams
      );

      const plans = result.rows.map((r) => {
        const total = parseInt(r.total_amount_cents, 10);
        const paidCents = parseInt(r.paid_cents, 10);
        const paid = parseInt(r.paid_count, 10);
        const scheduled = parseInt(r.scheduled_count, 10);
        const total_inst = r.installments_count;
        const isComplete = paid >= total_inst;
        // Se incompleto, remaining = avg per installment * remaining count
        const avgPerInst = paid > 0 ? Math.round(paidCents / paid) : Math.round(total / total_inst);
        const remaining = isComplete ? 0 : avgPerInst * (total_inst - paid);
        return {
          id: r.id,
          description: r.description,
          type: r.type,
          accountName: r.account_name,
          categoryName: r.category_name,
          totalCents: total,
          installmentsCount: total_inst,
          paidCount: paid,
          scheduledCount: scheduled,
          remainingCount: total_inst - paid,
          paidCents,
          remainingCents: remaining,
          interestRate: parseFloat(r.interest_rate),
          firstDueDate: r.first_due_date,
          startDate: r.start_date,
          isComplete,
        };
      });

      const filtered = params.active === false
        ? plans
        : params.active === true
          ? plans.filter((p) => !p.isComplete)
          : plans;

      // Group by type
      const cardPlans = filtered.filter((p) => p.type === "credit_card");
      const otherPlans = filtered.filter((p) => p.type === "out_of_card");
      const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

      const lines: string[] = [];
      if (cardPlans.length > 0) {
        lines.push(`💳 Cartão de crédito (${cardPlans.length}):`);
        for (const p of cardPlans) {
          const interest = p.interestRate > 0 ? ` (${(p.interestRate * 100).toFixed(2)}% juros)` : "";
          lines.push(`  • ${p.description}: ${p.paidCount}/${p.installmentsCount} pagas — ${fmt(p.remainingCents)} restante${interest}`);
        }
      }
      if (otherPlans.length > 0) {
        lines.push(`📋 Fora do cartão (${otherPlans.length}):`);
        for (const p of otherPlans) {
          const interest = p.interestRate > 0 ? ` (${(p.interestRate * 100).toFixed(2)}% juros)` : "";
          const status = p.isComplete ? "✅ completo" : `⏳ ${p.scheduledCount} agendada(s)`;
          lines.push(`  • ${p.description} (${p.accountName}): ${p.paidCount}/${p.installmentsCount} pagas (${status}) — ${fmt(p.remainingCents)} restante${interest}`);
        }
      }
      if (lines.length === 0) lines.push("Nenhum plano de parcelamento ativo");

      const totalRemaining = filtered.reduce((s, p) => s + p.remainingCents, 0);
      lines.push(`\n💰 Total a pagar: ${fmt(totalRemaining)}`);

      return {
        success: true,
        plans: filtered,
        count: filtered.length,
        totalRemainingCents: totalRemaining,
        message: lines.join("\n"),
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
