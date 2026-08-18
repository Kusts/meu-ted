/**
 * financial-tools — Pi Extension
 *
 * Registers all financial assistant tools as Pi tools.
 * The Pi agent calls these tools to manage household finances via WhatsApp.
 *
 * Tools call authenticated API adapters; no financial SQL runs in the Pi extension.
 * Bridge remains text-only: WhatsApp → prompt → Pi → tool → response → WhatsApp.
 *
 * Boundary: zero financial logic in Node. All decisions made by Pi agent via tools.
 */

import type { AgentToolResult, ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";

// Read tools
import { listAccountsTool } from "./tools/list_accounts.js";
import { listCategoriesTool } from "./tools/list_categories.js";
import { listRecentTransactionsTool } from "./tools/list_recent_transactions.js";
import { getPendingOperationTool } from "./generated/http-tools.js";
import { auditLogsTool } from "./tools/audit_logs.js";

// Write tools
import { createAccountTool } from "./tools/create_account.js";
import { createCategoryTool } from "./tools/create_category.js";
import { createExpenseTool } from "./tools/create_expense.js";
import { createIncomeTool } from "./tools/create_income.js";
import { createTransferTool } from "./tools/create_transfer.js";
import { updateAccountTool } from "./tools/update_account.js";
import { deactivateAccountTool } from "./tools/deactivate_account.js";
import { updateCategoryTool } from "./tools/update_category.js";
import { deactivateCategoryTool } from "./tools/deactivate_category.js";
import { updateTransactionTool } from "./tools/update_transaction.js";
import { deleteTransactionTool } from "./tools/delete_transaction.js";
import { autoCreateFromTemplatesTool, confirmPendingOperationTool, cancelPendingOperationTool, getBalanceTool, getMonthSummaryTool, listRecurringPurchasesTool, refreshPayableStatusTool } from "./generated/http-tools.js";
import { undoLastActionTool } from "./tools/undo_last_action.js";

// Credit card tools
import { createCreditCardAccount } from "./tools/create_credit_card_account.js";
import { createCardPurchase } from "./tools/create_card_purchase.js";
import { createCardInstallments } from "./tools/create_card_installments.js";
import { payStatement } from "./tools/pay_statement.js";
import { listStatements } from "./tools/list_statements.js";
import { getStatementDetails } from "./tools/get_statement_details.js";
import { cardInsights } from "./tools/card_insights.js";
import { checkCardLimits } from "./tools/check_card_limits.js";
import { refreshStatements } from "./tools/refresh_statements.js";

// Recurring purchases
import { createRecurringPurchase, postDueRecurring } from "./tools/create_recurring_purchase.js";

// Spending analysis
import { spendingInsights } from "./tools/spending_insights.js";

// Installment plans
import { createInstallmentPlan, listInstallmentPlans } from "./tools/create_installment_plan.js";
import { payInstallment, listDueInstallments, checkDueSoon } from "./tools/pay_installment.js";
import { prepayInstallments, simulatePrepayment } from "./tools/prepay_installments.js";
import { installmentScore } from "./tools/installment_score.js";

// Accounts Payable
import {
  createAccountPayable,
  listAccountsPayable,
  markAccountPaid,
  cancelAccountPayable,
  checkPayableReminders,
} from "./tools/accounts_payable.js";
import {
  createPayableTemplate,
  createPayableFromTemplate,
  listPayableTemplates,
} from "./tools/payable_templates.js";
import { paymentScore } from "./tools/payment_score.js";
import { monthlyProjection } from "./tools/monthly_projection.js";
import { checkPriceAlerts } from "./tools/price-alerts.js";

// Notifications
import {
  configureNotification,
  listNotifications,
  deleteNotification,
  processNotifications,
  getNotificationLog,
  testNotification,
} from "./tools/notification_tools.js";

// Goals & Budgets
import {
  createGoal,
  listGoals,
  contributeToGoal,
  cancelGoal,
  createBudget,
  listBudgets,
  checkBudgets,
  refreshGoalsTool,
  budgetTrendsTool,
  suggestBudgetAdjustmentTool,
  updateBudgetTool,
} from "./tools/goals_budgets.js";

type TextBlock = { type: "text"; text: string };

type MaybeToolResult = Partial<AgentToolResult> & Record<string, unknown>;

function resultText(result: MaybeToolResult): string {
  const message = typeof result.message === "string" ? result.message : undefined;
  const error = typeof result.error === "string" ? result.error : undefined;
  return message ?? error ?? JSON.stringify(result, null, 2);
}

function normalizeToolResult(result: unknown): AgentToolResult {
  if (result && typeof result === "object" && Array.isArray((result as MaybeToolResult).content)) {
    return result as AgentToolResult;
  }

  const objectResult = result && typeof result === "object" ? (result as MaybeToolResult) : { value: result };
  return {
    ...objectResult,
    content: [{ type: "text", text: resultText(objectResult) } satisfies TextBlock],
  } as AgentToolResult;
}

function registerTool(pi: ExtensionAPI, tool: ToolDefinition): void {
  const execute = tool.execute.bind(tool);
  pi.registerTool({
    ...tool,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = execute.length <= 1
        ? await (execute as (params: unknown) => Promise<unknown>)(params)
        : await execute(toolCallId, params, signal, onUpdate, ctx);
      return normalizeToolResult(result);
    },
  });
}

export default function (pi: ExtensionAPI) {
  // Read tools
  registerTool(pi, listAccountsTool);
  registerTool(pi, listCategoriesTool);
  registerTool(pi, getBalanceTool);
  registerTool(pi, getMonthSummaryTool);
  registerTool(pi, listRecentTransactionsTool);
  registerTool(pi, getPendingOperationTool);
  registerTool(pi, auditLogsTool);

  // Write tools
  registerTool(pi, createAccountTool);
  registerTool(pi, createCategoryTool);
  registerTool(pi, createExpenseTool);
  registerTool(pi, createIncomeTool);
  registerTool(pi, createTransferTool);
  registerTool(pi, updateAccountTool);
  registerTool(pi, deactivateAccountTool);
  registerTool(pi, updateCategoryTool);
  registerTool(pi, deactivateCategoryTool);
  registerTool(pi, updateTransactionTool);
  registerTool(pi, deleteTransactionTool);
  registerTool(pi, confirmPendingOperationTool);
  registerTool(pi, cancelPendingOperationTool);
  registerTool(pi, undoLastActionTool);

  // Credit card tools
  registerTool(pi, createCreditCardAccount);
  registerTool(pi, createCardPurchase);
  registerTool(pi, createCardInstallments);
  registerTool(pi, payStatement);
  registerTool(pi, listStatements);
  registerTool(pi, getStatementDetails);
  registerTool(pi, cardInsights);
  registerTool(pi, checkCardLimits);
  registerTool(pi, refreshStatements);

  // Recurring purchases
  registerTool(pi, createRecurringPurchase);
  registerTool(pi, postDueRecurring);
  registerTool(pi, listRecurringPurchasesTool);

  // Spending analysis
  registerTool(pi, spendingInsights);

  // Installment plans
  registerTool(pi, createInstallmentPlan);
  registerTool(pi, listInstallmentPlans);
  registerTool(pi, payInstallment);
  registerTool(pi, listDueInstallments);
  registerTool(pi, checkDueSoon);
  registerTool(pi, prepayInstallments);
  registerTool(pi, simulatePrepayment);
  registerTool(pi, installmentScore);

  // Accounts Payable
  registerTool(pi, createAccountPayable);
  registerTool(pi, listAccountsPayable);
  registerTool(pi, markAccountPaid);
  registerTool(pi, cancelAccountPayable);
  registerTool(pi, checkPayableReminders);
  registerTool(pi, refreshPayableStatusTool);

  // Accounts Payable Templates
  registerTool(pi, createPayableTemplate);
  registerTool(pi, createPayableFromTemplate);
  registerTool(pi, listPayableTemplates);
  registerTool(pi, autoCreateFromTemplatesTool);

  // Score & Analytics
  registerTool(pi, paymentScore);
  registerTool(pi, monthlyProjection);
  registerTool(pi, checkPriceAlerts);

  // Notifications
  registerTool(pi, configureNotification);
  registerTool(pi, listNotifications);
  registerTool(pi, deleteNotification);
  registerTool(pi, processNotifications);
  registerTool(pi, getNotificationLog);
  registerTool(pi, testNotification);

  // Goals & Budgets
  registerTool(pi, createGoal);
  registerTool(pi, listGoals);
  registerTool(pi, contributeToGoal);
  registerTool(pi, cancelGoal);
  registerTool(pi, createBudget);
  registerTool(pi, listBudgets);
  registerTool(pi, checkBudgets);
  registerTool(pi, refreshGoalsTool);
  registerTool(pi, budgetTrendsTool);
  registerTool(pi, suggestBudgetAdjustmentTool);
  registerTool(pi, updateBudgetTool);
}
