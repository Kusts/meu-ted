/**
 * accounts_payable — Pi tools facade for accounts payable
 * Delegates to generated authenticated HTTP adapters (OpenAPI → API).
 */
import {
  createAccountPayableTool as generatedCreate,
  listAccountsPayableTool as generatedList,
  markAccountPaidTool as generatedPay,
  cancelAccountPayableTool as generatedCancel,
  checkPayableRemindersTool as generatedReminders,
  refreshPayableStatusTool as generatedRefresh,
} from "../generated/http-tools.js";

export const createAccountPayable = Object.assign(generatedCreate, { name: "create_account_payable" });
export const listAccountsPayable = Object.assign(generatedList, { name: "list_accounts_payable" });
export const markAccountPaid = Object.assign(generatedPay, { name: "mark_account_paid" });
export const cancelAccountPayable = Object.assign(generatedCancel, { name: "cancel_account_payable" });
export const checkPayableReminders = Object.assign(generatedReminders, { name: "check_payable_reminders" });
export const refreshPayableStatus = Object.assign(generatedRefresh, { name: "refresh_payable_status" });

export const createAccountPayableTool = createAccountPayable;
export const listAccountsPayableTool = listAccountsPayable;
export const markAccountPaidTool = markAccountPaid;
export const cancelAccountPayableTool = cancelAccountPayable;
export const checkPayableRemindersTool = checkPayableReminders;
export const refreshPayableStatusTool = refreshPayableStatus;
