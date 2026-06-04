/**
 * financial-tools — Pi Extension
 *
 * Registers all 17 financial assistant tools as Pi tools via pi.registerTool().
 * The Pi agent calls these tools to manage household finances via WhatsApp.
 *
 * Tools execute SQL directly against the Postgres database (DATABASE_URL).
 * Bridge remains text-only: WhatsApp → prompt → Pi → tool → response → WhatsApp.
 *
 * Boundary: zero financial logic in Node. All decisions made by Pi agent via tools.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Read tools
import { listAccountsTool } from "./tools/list_accounts.js";
import { listCategoriesTool } from "./tools/list_categories.js";
import { getBalanceTool } from "./tools/get_balance.js";
import { getMonthSummaryTool } from "./tools/get_month_summary.js";
import { listRecentTransactionsTool } from "./tools/list_recent_transactions.js";
import { getPendingOperationTool } from "./tools/get_pending_operation.js";
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
import { confirmPendingOperationTool } from "./tools/confirm_pending_operation.js";
import { cancelPendingOperationTool } from "./tools/cancel_pending_operation.js";
import { undoLastActionTool } from "./tools/undo_last_action.js";

export default function (pi: ExtensionAPI) {
  // Read tools
  pi.registerTool(listAccountsTool);
  pi.registerTool(listCategoriesTool);
  pi.registerTool(getBalanceTool);
  pi.registerTool(getMonthSummaryTool);
  pi.registerTool(listRecentTransactionsTool);
  pi.registerTool(getPendingOperationTool);
  pi.registerTool(auditLogsTool);

  // Write tools
  pi.registerTool(createAccountTool);
  pi.registerTool(createCategoryTool);
  pi.registerTool(createExpenseTool);
  pi.registerTool(createIncomeTool);
  pi.registerTool(createTransferTool);
  pi.registerTool(updateAccountTool);
  pi.registerTool(deactivateAccountTool);
  pi.registerTool(updateCategoryTool);
  pi.registerTool(deactivateCategoryTool);
  pi.registerTool(updateTransactionTool);
  pi.registerTool(deleteTransactionTool);
  pi.registerTool(confirmPendingOperationTool);
  pi.registerTool(cancelPendingOperationTool);
  pi.registerTool(undoLastActionTool);
}