// V4 observability contract (SPEC section 24).
//
// This module is contract + validation ONLY. It defines the canonical
// event_type catalog for the 8 V4 questions and a fail-closed
// builder/serializer that rejects privacy-violating payloads. It creates
// NO new platform: persistence reuses the existing audit_logs table
// (workspace_id, event_type indexed by workspace_id + created_at;
// write in writes/postgres.ts, read in audit/store.ts, query via the
// existing GET /audit-logs route with an event_type filter), adoption_events
// (V026), the Agent Durable Object access-log (schema.ts), and the Fastify
// structured logger (server/index.ts).
//
// Point emitters are born alongside their own flows, not here:
//   - mic.error .................... T1.1 (PWA client event)
//   - auth.request.legacy_bearer_used  T2.2 (API central auth resolution;
//       emitted ONLY when cookie/session did not authenticate the request
//       AND the legacy bearer was the effective authenticator of the
//       fallback; header presence, attempts, and logins do not count)
//   - device.tokens.legacy_active .... T2.4 (API rotation/job, periodic log)
//   - offline.locked ................. T2.6 (PWA authenticated client report)
//   - audit-undo.replay + mutation.reconcile.enqueued .. T3.1 (API)
//   - csp.violation .................. T2.7 (same-origin POST /api/csp-report)
//   - agent.workspace.legacy_access .. T4.1 (derived from the DO access-log:
//       history_export / stream; consumed via GET /history/access-log)

export const OBSERVABILITY_EVENT_TYPES = [
  'auth.request.legacy_bearer_used',
  'device.tokens.legacy_active',
  'agent.workspace.legacy_access',
  'offline.locked',
  'audit-undo.replay',
  'mutation.reconcile.enqueued',
  'mic.error',
  'csp.violation',
] as const;

export type ObservabilityEventType = (typeof OBSERVABILITY_EVENT_TYPES)[number];

export type ObservabilityEvent = {
  eventType: ObservabilityEventType;
  payload: Record<string, unknown>;
};

export class ObservabilityPrivacyError extends Error {
  constructor(message: string) {
    super(`observability privacy violation: ${message}`);
    this.name = 'ObservabilityPrivacyError';
  }
}

const JWT_PATTERN = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;
const BEARER_SCHEME_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/=]{8,}/i;
const COOKIE_VALUE_PATTERN = /^[^=\s][^=]*=[^;]+;\s*(Path|Expires|Max-Age|Domain|Secure|HttpOnly)/i;

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const isForbiddenKey = (key: string): { forbidden: true; label: string } | { forbidden: false } => {
  const normalized = normalizeKey(key);
  if (normalized.includes('attestation')) return { forbidden: true, label: 'attestation' };
  if (normalized.includes('password') || normalized === 'passwd' || normalized === 'pwd') {
    return { forbidden: true, label: 'password' };
  }
  if (normalized === 'cookie' || normalized === 'cookies' || normalized === 'setcookie') {
    return { forbidden: true, label: 'cookie' };
  }
  if (normalized === 'authorization') return { forbidden: true, label: 'bearer/session credential' };
  if (
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized === 'bearer' ||
    normalized === 'sessionid' ||
    normalized === 'apikey' ||
    normalized === 'privatekey'
  ) {
    return { forbidden: true, label: 'bearer/session/device token' };
  }
  return { forbidden: false };
};

const FINANCIAL_AMOUNT_KEYS = new Set(['amount', 'amountcents', 'valuecents']);
const FINANCIAL_DESCRIPTION_KEYS = new Set(['description']);

const assertNoFinancialPayload = (value: Record<string, unknown>, path: string): void => {
  const keys = new Set(Object.keys(value).map(normalizeKey));
  const hasAmount = [...FINANCIAL_AMOUNT_KEYS].some((key) => keys.has(key));
  const hasDescription = [...FINANCIAL_DESCRIPTION_KEYS].some((key) => keys.has(key));
  if (hasAmount && hasDescription) {
    throw new ObservabilityPrivacyError(
      `complete financial payload (amount+description) is forbidden at '${path}'`,
    );
  }
};

const assertPrivacy = (value: unknown, path: string): void => {
  if (typeof value === 'string') {
    if (JWT_PATTERN.test(value.trim())) {
      throw new ObservabilityPrivacyError(`JWT-shaped bearer/session token string is forbidden at '${path}'`);
    }
    if (BEARER_SCHEME_PATTERN.test(value)) {
      throw new ObservabilityPrivacyError(`bearer credential string is forbidden at '${path}'`);
    }
    if (COOKIE_VALUE_PATTERN.test(value.trim())) {
      throw new ObservabilityPrivacyError(`raw cookie string is forbidden at '${path}'`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPrivacy(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    assertNoFinancialPayload(record, path);
    for (const [key, entry] of Object.entries(record)) {
      const verdict = isForbiddenKey(key);
      if (verdict.forbidden) {
        throw new ObservabilityPrivacyError(
          `${verdict.label} field '${key}' is forbidden at '${path}'`,
        );
      }
      assertPrivacy(entry, path === '$' ? `$.${key}` : `${path}.${key}`);
    }
  }
};

const requireNonEmptyString = (
  payload: Record<string, unknown>,
  field: string,
  eventType: ObservabilityEventType,
): string => {
  const value = payload[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ObservabilityPrivacyError(
      `event '${eventType}' requires dimension '${field}' (non-empty string)`,
    );
  }
  return value;
};

const MIC_REASONS = ['denied', 'notfound', 'busy'] as const;
const MIC_CAPABILITIES = ['on', 'off'] as const;

const sanitizeCspPayload = (
  payload: Record<string, unknown>,
  eventType: ObservabilityEventType,
): Record<string, unknown> => {
  const effectiveDirective = requireNonEmptyString(payload, 'effectiveDirective', eventType);
  const rawBlocked = payload['blockedURL'] ?? payload['blockedUrl'];
  let blockedHost = payload['blockedHost'];
  if (typeof rawBlocked === 'string' && rawBlocked.length > 0) {
    try {
      blockedHost = new URL(rawBlocked).hostname;
    } catch {
      throw new ObservabilityPrivacyError(
        `event '${eventType}' field 'blockedURL' is not a valid absolute URL`,
      );
    }
  }
  if (typeof blockedHost !== 'string' || blockedHost.trim().length === 0) {
    throw new ObservabilityPrivacyError(
      `event '${eventType}' requires dimension 'blockedHost' (or a 'blockedURL' to derive it from)`,
    );
  }
  const sanitized: Record<string, unknown> = {
    effectiveDirective,
    blockedHost,
  };
  if (payload['disposition'] !== undefined) sanitized['disposition'] = payload['disposition'];
  if (payload['statusCode'] !== undefined) sanitized['statusCode'] = payload['statusCode'];
  return sanitized;
};

const sanitizePayload = (
  eventType: ObservabilityEventType,
  payload: Record<string, unknown>,
): Record<string, unknown> => {
  assertPrivacy(payload, '$');
  switch (eventType) {
    case 'auth.request.legacy_bearer_used':
    case 'audit-undo.replay':
    case 'agent.workspace.legacy_access': {
      const workspaceId = requireNonEmptyString(payload, 'workspaceId', eventType);
      return { ...payload, workspaceId };
    }
    case 'device.tokens.legacy_active': {
      return { ...payload };
    }
    case 'offline.locked': {
      const offlineSubjectId = requireNonEmptyString(payload, 'offlineSubjectId', eventType);
      const ageBand = requireNonEmptyString(payload, 'ageBand', eventType);
      return { ...payload, offlineSubjectId, ageBand };
    }
    case 'mutation.reconcile.enqueued': {
      const workspaceId = requireNonEmptyString(payload, 'workspaceId', eventType);
      const operationId = requireNonEmptyString(payload, 'operationId', eventType);
      const reason = requireNonEmptyString(payload, 'reason', eventType);
      return { ...payload, workspaceId, operationId, reason };
    }
    case 'mic.error': {
      const reason = requireNonEmptyString(payload, 'reason', eventType);
      const capability = requireNonEmptyString(payload, 'capability', eventType);
      if (!(MIC_REASONS as readonly string[]).includes(reason)) {
        throw new ObservabilityPrivacyError(
          `event '${eventType}' field 'reason' must be one of ${MIC_REASONS.join('|')}`,
        );
      }
      if (!(MIC_CAPABILITIES as readonly string[]).includes(capability)) {
        throw new ObservabilityPrivacyError(
          `event '${eventType}' field 'capability' must be one of ${MIC_CAPABILITIES.join('|')}`,
        );
      }
      return { ...payload, reason, capability };
    }
    case 'csp.violation': {
      return sanitizeCspPayload(payload, eventType);
    }
  }
};

export const buildObservabilityEvent = (
  eventType: ObservabilityEventType,
  payload: Record<string, unknown> = {},
): ObservabilityEvent => ({
  eventType,
  payload: sanitizePayload(eventType, payload),
});
