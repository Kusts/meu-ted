export type ShadowReadMode = "on" | "off";
export type ShadowSkipReason = "shadow_off" | "unsupported_capability" | "unsupported_filter" | "write_adapter";

type Env = Record<string, string | undefined>;

export const getShadowReadMode = (env: Env = process.env): ShadowReadMode => {
  const raw = env.PI_SHADOW_READS?.trim().toLowerCase();
  if (raw === undefined || raw === "" || ["off", "0", "false", "disabled"].includes(raw)) return "off";
  if (["on", "1", "true", "enabled"].includes(raw)) return "on";
  throw new Error(`Invalid PI_SHADOW_READS=${raw}; use on or off`);
};

/**
 * The canonical allowlist for shadow-eligible capabilities.
 * Only read-only (kind=read), API-migrated capabilities with explicit approval
 * may execute shadow comparison. Writes MUST NOT appear here.
 */
export const shadowEligibleCapabilities = new Set([
  "audit_logs",
  "list_accounts",
  "list_categories",
  "get_balance",
  "get_month_summary",
  "list_recent_transactions",
]);

export const isShadowEligible = (capability: string): boolean =>
  shadowEligibleCapabilities.has(capability);
