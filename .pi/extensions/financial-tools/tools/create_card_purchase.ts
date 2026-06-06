/**
 * create_card_purchase — Register a purchase on a credit card
 *
 * Validates that account is a credit card.
 * Auto-categorizes the description.
 * Adds purchase to the appropriate statement (open or next).
 * Supports installments (installments_total + installment_number).
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";
import {
  getCreditCardInfo,
  getClosingDate,
  getDueDate,
  getOrCreateOpenStatement,
  recalculateStatementTotal,
  refreshStatementStatus,
} from "./credit-card";
import { autoCategorize } from "./categorizer";
import { findDuplicate } from "./duplicate-detector";
import { getLimitStatus } from "./limit-guard";

interface Params {
  householdId: string;
  accountId: string;
  description: string;
  amountCents: number;
  date: string;
  categoryId?: string;  // optional, will auto-categorize if missing
  installmentsTotal?: number;
  installmentNumber?: number;
  sourceMessageId?: string;
  force?: boolean;
}

const schema = Type.Object({
  householdId: Type.String(),
  accountId: Type.String(),
  description: Type.String({ minLength: 1 }),
  amountCents: Type.Integer({ minimum: 1 }),
  date: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
  categoryId: Type.Optional(Type.String()),
  installmentsTotal: Type.Optional(Type.Integer({ minimum: 1, maximum: 48 })),
  installmentNumber: Type.Optional(Type.Integer({ minimum: 1, maximum: 48 })),
  sourceMessageId: Type.Optional(Type.String()),
  force: Type.Optional(Type.Boolean()),
});

export const createCardPurchase: ToolDefinition = {
  name: "create_card_purchase",
  description: "Registra uma compra no cartão de crédito. Vai para a fatura aberta correspondente.",
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

      // 2. Validate installments
      if (params.installmentsTotal && !params.installmentNumber) {
        params.installmentNumber = 1; // default first installment
      }
      if (params.installmentNumber && !params.installmentsTotal) {
        return {
          success: false,
          error: "installments_mismatch",
          message: "Se informar installmentNumber, precisa informar installmentsTotal",
        };
      }
      if (
        params.installmentNumber &&
        params.installmentsTotal &&
        params.installmentNumber > params.installmentsTotal
      ) {
        return {
          success: false,
          error: "installments_invalid",
          message: "installmentNumber não pode ser maior que installmentsTotal",
        };
      }

      // 3. Auto-categorize if no category provided
      let categoryId = params.categoryId;
      let categoryInfo: any = null;
      if (!categoryId) {
        const cat = await autoCategorize(pool, params.householdId, params.description, "expense");
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

      // 4. Check duplicates
      if (!params.force) {
        const dup = await findDuplicate(pool, {
          householdId: params.householdId,
          kind: "expense",
          description: params.description,
          amountCents: params.amountCents,
          date: params.date,
          fromAccountId: params.accountId,
        });
        if (dup) {
          return {
            success: false,
            error: "duplicate",
            message: `Compra similar já existe: ${dup.description} (R$ ${(dup.amount_cents / 100).toFixed(2)})`,
            duplicate: dup,
            hint: "Passe force=true se quiser criar mesmo assim",
          };
        }
      }

      // 5. Find or create the statement
      const closing = getClosingDate(params.date, cardInfo.closingDay);
      const due = getDueDate(closing, cardInfo.dueDay);
      const stmt = await getOrCreateOpenStatement(pool, params.accountId, params.householdId, closing, due);

      // 6. Insert the transaction
      const idempKey = `card-${params.accountId}-${params.date}-${params.description}-${params.amountCents}-${Date.now()}`;
      const result = await pool.query<{ rows: Array<{ id: string }> }>(
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
          params.amountCents,
          params.date,
          categoryId,
          stmt.id,
          params.installmentsTotal || null,
          params.installmentNumber || null,
          params.sourceMessageId || null,
          idempKey,
        ]
      );

      // 7. Recalculate statement total
      const newTotal = await recalculateStatementTotal(pool, stmt.id);
      await refreshStatementStatus(pool, stmt.id, new Date().toISOString().slice(0, 10));

      const response: any = {
        success: true,
        id: result.rows[0].id,
        description: params.description,
        amountCents: params.amountCents,
        statement: {
          id: stmt.id,
          cycle: stmt.cycleYearMonth,
          closingDate: closing,
          dueDate: due,
          total: newTotal,
        },
        message: `💳 Compra registrada: ${params.description} — R$ ${(params.amountCents / 100).toFixed(2)}`,
      };
      if (categoryInfo) {
        response.category = categoryInfo.fullName;
        response.confidence = Math.round(categoryInfo.confidence * 100);
      }
      if (params.installmentsTotal) {
        response.installment = `${params.installmentNumber}/${params.installmentsTotal}`;
      }

      // 8. Check limit usage
      const limitStatus = await getLimitStatus(pool, params.accountId, new Date().toISOString().slice(0, 10));
      if (limitStatus && limitStatus.status !== "ok") {
        response.limitWarning = {
          status: limitStatus.status,
          usagePercent: limitStatus.usagePercent,
          availableCents: limitStatus.availableCents,
          message:
            limitStatus.status === "over_limit"
              ? `🚨 Limite estourado! Você usou ${limitStatus.usagePercent}% do limite (R$ ${(limitStatus.usedCents / 100).toFixed(2)} de R$ ${(limitStatus.creditLimitCents / 100).toFixed(2)})`
              : limitStatus.status === "warning"
                ? `🔴 Cuidado: ${limitStatus.usagePercent}% do limite usado. Disponível: R$ ${(limitStatus.availableCents / 100).toFixed(2)}`
                : `⚠️ Atenção: ${limitStatus.usagePercent}% do limite usado`,
        };
      }

      return response;
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
