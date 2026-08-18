import type { LegacyReadRequest } from "./legacy-readers.js";

const supportedFilters: Record<string, ReadonlySet<keyof LegacyReadRequest>> = {
  audit_logs: new Set(["limit", "operation", "actorType", "entityType", "entityId"]),
  list_accounts: new Set(),
  list_categories: new Set(["kind"]),
  get_balance: new Set(["accountId"]),
  get_month_summary: new Set(["yearMonth"]),
  list_recent_transactions: new Set(["limit", "offset", "accountId", "startDate", "endDate", "categoryId", "kind", "minAmountCents", "maxAmountCents", "query"]),
};

export const getUnsupportedShadowFilters = (capability: string, request: LegacyReadRequest): string[] => {
  const supported = supportedFilters[capability];
  if (!supported) return Object.keys(request).filter((key) => key !== "householdId" && request[key as keyof LegacyReadRequest] !== undefined);
  return Object.keys(request).filter((key) => key !== "householdId" && request[key as keyof LegacyReadRequest] !== undefined && !supported.has(key as keyof LegacyReadRequest));
};
