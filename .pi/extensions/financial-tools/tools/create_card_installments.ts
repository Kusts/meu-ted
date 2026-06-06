/**
 * create_card_installments — Register a purchase with ALL installments at once
 *
 * Unlike create_card_purchase (which registers only 1 installment),
 * this tool registers the full N-installment purchase upfront.
 * Each installment goes to its respective statement.
 *
 * Example: 12x of R$100 starting in July 2026
 *  → creates 12 transactions, one per month
 *  → installments 1-6 in statements 2026-07..2026-12
 *  → installments 7-12 in statements 2027-01..2027-06
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";
import {
  getCreditCardInfo,
  getOrCreateOpenStatement,
  recalculateStatementTotal,
  refreshStatementStatus,
} from "./credit-card";
import {
  calculateInstallments,
  getInstallmentYears,
  type Installment,
} from "./installment-helpers";
import { autoCategorize } from "./categorizer";
import { findDuplicate } from "./duplicate-detector";

interface Params {
  householdId: string;
  accountId: string;
  description: string;
  totalAmountCents: number;  // TOTAL amount (e.g. 120000 = R$ 1200 for 12x of R$100)
  purchaseDate: string;  // Date of first installment
  installmentsTotal: number;  // 1-48
  categoryId?: string;
  sourceMessageId?: string;
  force?: boolean;
}

const schema = Type.Object({
  householdId: Type.String(),
  accountId: Type.String(),
  description: Type.String({ minLength: 1 }),
  totalAmountCents: Type.Integer({ minimum: 100 }),  // min R$ 1
  purchaseDate: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
  installmentsTotal: Type.Integer({ minimum: 1, maximum: 48 }),
  categoryId: Type.Optional(Type.String()),
  sourceMessageId: Type.Optional(Type.String()),
  force: Type.Optional(Type.Boolean()),
});

export const createCardInstallments: ToolDefinition = {
  name: "create_card_installments",
  description:
    "Registra compra parcelada criando TODAS as N parcelas de uma vez, cada uma na sua fatura correspondente. Use para parcelamentos que cruzam meses ou anos.",
  parameters: schema,
  execute: async (params: Params) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      // 1. Validate credit card
      const cardInfo = await getCreditCardInfo(pool, params.accountId);
      if (!cardInfo) {
        return {
          success: false,
          error: "not_credit_card",
          message: "Conta não é um cartão de crédito",
        };
      }

      // 2. Calculate installments
      const installments = calculateInstallments(
        params.purchaseDate,
        params.installmentsTotal,
        params.totalAmountCents,
        cardInfo.closingDay,
        cardInfo.dueDay
      );

      // 3. Auto-categorize if no category provided
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
        } else {
          return {
            success: false,
            error: "no_category",
            message: "Não consegui categorizar automaticamente. Informe categoryId.",
            description: params.description,
          };
        }
      }

      // 4. Check duplicate (only the first installment)
      if (!params.force) {
        const dup = await findDuplicate(pool, {
          householdId: params.householdId,
          kind: "expense",
          description: params.description,
          amountCents: installments[0].amountCents,
          date: params.purchaseDate,
          fromAccountId: params.accountId,
        });
        if (dup) {
          return {
            success: false,
            error: "duplicate",
            message: `Compra similar já existe: ${dup.description}`,
            duplicate: dup,
            hint: "Passe force=true se quiser criar mesmo assim",
          };
        }
      }

      // 5. Insert all installments in a transaction
      const transactionIds: string[] = [];
      const statementIds = new Set<string>();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const inst of installments) {
          // Get or create the statement for this installment
          const stmt = await getOrCreateOpenStatement(
            client,
            params.accountId,
            params.householdId,
            inst.closingDate,
            inst.dueDate
          );
          statementIds.add(stmt.id);

          // Insert the installment
          const idempKey = `card-installment-${params.accountId}-${inst.statementCycle}-${params.description}-${inst.number}-${Date.now()}`;
          const result = await client.query<{ rows: Array<{ id: string }> }>(
            `INSERT INTO transactions (
              id, household_id, from_account_id, description, amount_cents, date,
              kind, category_id, statement_id, is_credit_card_purchase,
              installments_total, installment_number,
              source_message_id, idempotency_key, created_at
            )
            VALUES (
              gen_random_uuid(), $1, $2, $3, $4, $5,
              'expense', $6, $7, true,
              $8, $9,
              $10, $11, NOW()
            )
            RETURNING id`,
            [
              params.householdId,
              params.accountId,
              params.description,
              inst.amountCents,
              inst.closingDate,  // date = statement closing
              categoryId,
              stmt.id,
              params.installmentsTotal,
              inst.number,
              params.sourceMessageId || null,
              idempKey,
            ]
          );
          transactionIds.push(result.rows[0].id);
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }

      // 6. Recalculate totals for all affected statements
      const today = new Date().toISOString().slice(0, 10);
      for (const stmtId of statementIds) {
        await recalculateStatementTotal(pool, stmtId);
        await refreshStatementStatus(pool, stmtId, today);
      }

      // 7. Build response
      const years = getInstallmentYears(installments);
      const crossesYear = years.length > 1;
      const response: any = {
        success: true,
        transactionIds,
        description: params.description,
        totalAmountCents: params.totalAmountCents,
        installmentsTotal: params.installmentsTotal,
        installmentAmount: installments[0].amountCents,
        affectedStatements: statementIds.size,
        crossesYear,
        years: years,
        installments: installments.map((i) => ({
          number: i.number,
          amountCents: i.amountCents,
          statementCycle: i.statementCycle,
          closingDate: i.closingDate,
          dueDate: i.dueDate,
        })),
        message: crossesYear
          ? `💳 Compra parcelada: ${params.description} em ${params.installmentsTotal}x de R$ ${(installments[0].amountCents / 100).toFixed(2)} (cruzando ${years.join("→")})`
          : `💳 Compra parcelada: ${params.description} em ${params.installmentsTotal}x de R$ ${(installments[0].amountCents / 100).toFixed(2)}`,
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
