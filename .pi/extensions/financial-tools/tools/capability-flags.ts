export type CapabilityName = string;
export type CapabilityMode = "api" | "disabled";

type Env = Record<string, string | undefined>;

const flagName = (capability: CapabilityName): string =>
  `PI_CAPABILITY_${capability.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;

export const migratedApiCapabilities = new Set([
  "get_pending_operation", "confirm_pending_operation", "cancel_pending_operation", "audit_logs", "undo_last_action",
  "list_accounts", "create_account", "list_categories", "create_category", "get_balance", "get_month_summary", "list_recent_transactions",
  "create_expense", "create_income", "create_transfer", "update_account", "deactivate_account", "update_category", "deactivate_category", "update_transaction", "delete_transaction",
  "create_account_payable", "list_accounts_payable", "mark_account_paid", "cancel_account_payable", "check_payable_reminders",
  "create_payable_template", "create_payable_from_template", "list_payable_templates", "refresh_payable_status", "auto_create_from_templates",
  "create_recurring_purchase", "list_recurring_purchases",
  "create_credit_card_account", "create_card_purchase", "create_card_installments", "pay_statement", "list_statements", "get_statement_details",
  "create_goal", "list_goals", "contribute_to_goal", "cancel_goal", "create_budget", "list_budgets", "check_budgets", "budget_trends", "update_budget",
  "configure_notification", "list_notifications",
]);

export const ALL_CAPABILITIES: readonly CapabilityName[] = Array.from(migratedApiCapabilities);

export const getCapabilityMode = (
  capability: CapabilityName,
  env: Env = process.env,
): CapabilityMode => {
  const raw = env[flagName(capability)]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return migratedApiCapabilities.has(capability) ? "api" : "disabled";
  if (["api", "on", "true", "1"].includes(raw)) return "api";
  if (["off", "disabled", "false", "0"].includes(raw)) return "disabled";
  throw new Error(`Invalid feature flag ${flagName(capability)}=${raw}; use api or off`);
};
