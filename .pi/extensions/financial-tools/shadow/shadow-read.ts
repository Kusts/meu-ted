import { createHash } from "node:crypto";

export type ShadowEventKind = "divergence" | "legacy_error";

export type ShadowEvent = {
  kind: ShadowEventKind;
  capability: string;
  requestHash: string;
  apiHash?: string;
  legacyHash?: string;
  error?: string;
};

// The canonical API/Agent response is compared with the legacy Pi read projection.
// Only SELECT-based legacy readers are allowed here; the canonical response is never replaced.
type ShadowReadOptions = {
  enabled: boolean;
  capability: string;
  request: unknown;
  apiValue: unknown;
  legacyRead: () => Promise<unknown>;
  log: (event: ShadowEvent) => void;
};

const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
};

const transportFields = new Set(["success", "items", "total", "limit", "offset"]);

const comparable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !transportFields.has(key))
      .map(([key, item]) => [key, comparable(item)]));
  }
  return value;
};

const normalizeCapability = (capability: string, value: unknown): unknown => {
  const normalized = comparable(value);
  if (capability === "get_balance" && normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
    const record = normalized as Record<string, unknown>;
    return { id: record.id ?? record.accountId, balanceCents: record.balanceCents };
  }
  if (capability === "audit_logs" && normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
    const record = normalized as Record<string, unknown>;
    const logs = Array.isArray(record.logs) ? record.logs.map((item) => {
      const log = item as Record<string, unknown>;
      return {
        id: log.id,
        action: log.action ?? log.operation,
        event_type: log.event_type ?? log.eventType,
        actor_id: log.actor_id ?? log.actorId,
        created_at: log.created_at ?? log.createdAt,
      };
    }) : record.logs;
    return { ...record, logs };
  }
  return normalized;
};

const hashValue = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(canonicalize(comparable(value)))).digest("hex");

const hash = (capability: string, value: unknown): string =>
  createHash("sha256").update(JSON.stringify(canonicalize(normalizeCapability(capability, value)))).digest("hex");

const errorMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error))
    .replace(/(password|token|secret|authorization|bearer|context[_-]?token|device[_-]?token)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/\b\d{10,13}\b/g, "[REDACTED_PHONE]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[REDACTED_CPF]")
    .slice(0, 200);

export const compareShadowRead = async (options: ShadowReadOptions): Promise<ShadowEvent | null> => {
  if (!options.enabled) return null;

  const requestHash = hashValue(options.request);
  try {
    const legacyValue = await options.legacyRead();
    const apiHash = hash(options.capability, options.apiValue);
    const legacyHash = hash(options.capability, legacyValue);
    if (apiHash === legacyHash) return null;

    const event: ShadowEvent = {
      kind: "divergence",
      capability: options.capability,
      requestHash,
      apiHash,
      legacyHash,
    };
    options.log(event);
    return event;
  } catch (error) {
    const event: ShadowEvent = {
      kind: "legacy_error",
      capability: options.capability,
      requestHash,
      error: errorMessage(error),
    };
    options.log(event);
    return event;
  }
};
