import type { LlmFailoverEvent } from './provider-registry.js';
import { emitSanitizedEvent } from '../observability/events.js';

export type FailoverAttempt<T> = () => Promise<T>;

export type FailoverOutcome<T> = {
  result: T;
  usedFallback: boolean;
  failoverReason: string | null;
};

/**
 * Retryable LLM failure classification (refactor item 5): timeout/abort,
 * HTTP 429/5xx and auth failures (401/403) trigger the fallback attempt
 * within the SAME request. 4xx other than auth/429 (ex. 400 validation,
 * 404 unknown model) fail closed without fallback — retrying would not help.
 * The check is status-code based so both direct SDK errors and relay HTTP
 * errors funnel through one rule. Never inspects or logs secrets.
 */
export const isRetryableLlmError = (err: unknown): boolean => {
  const e = err as {
    name?: string;
    status?: number;
    statusCode?: number;
    code?: string;
    message?: string;
  } | null;
  if (!e) return false;
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return true;
  const status = typeof e.status === 'number' ? e.status : typeof e.statusCode === 'number' ? e.statusCode : null;
  if (status !== null) {
    if (status === 429) return true;
    if (status >= 500 && status <= 599) return true;
    if (status === 401 || status === 403) return true;
    return false;
  }
  const code = typeof e.code === 'string' ? e.code : '';
  if (/^(agent\.rate_limited|agent\.provider_timeout|agent\.provider_error|agent\.provider_auth|agent\.invalid_provider_output|ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch_failed|network_error|timeout)$/i.test(code)) {
    return true;
  }
  const message = typeof e.message === 'string' ? e.message : '';
  if (/timed out|timeout|abort|429|too many requests|5\d\d|rate limit|overloaded|temporarily unavailable/i.test(message)) {
    return true;
  }
  return false;
};

export const failoverReasonOf = (err: unknown): string => {
  const e = err as { name?: string; status?: number; statusCode?: number; code?: string } | null;
  if (!e) return 'unknown_error';
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return 'timeout';
  const status = typeof e.status === 'number' ? e.status : typeof e.statusCode === 'number' ? e.statusCode : null;
  if (status !== null) {
    if (status === 429) return 'http_429';
    if (status >= 500 && status <= 599) return `http_${status}`;
    if (status === 401 || status === 403) return `http_${status}`;
    return `http_${status}`;
  }
  if (typeof e.code === 'string' && e.code.length > 0) return e.code;
  return 'unknown_error';
};

/**
 * Executes the primary attempt; on a retryable failure and when a fallback
 * is configured, executes the fallback within the same call. Resolves with
 * which leg won so callers can persist `fallback: usedFallback` metadata.
 * When both legs fail, the FALLBACK error propagates (it is the most recent
 * signal); callers map it to `agent.inference_error` as before.
 */
export const executeWithFallback = async <T>(
  primary: FailoverAttempt<T>,
  fallback: FailoverAttempt<T> | null,
): Promise<FailoverOutcome<T>> => {
  try {
    const result = await primary();
    return { result, usedFallback: false, failoverReason: null };
  } catch (primaryErr) {
    if (!fallback || !isRetryableLlmError(primaryErr)) throw primaryErr;
    const failoverReason = failoverReasonOf(primaryErr);
    const result = await fallback();
    return { result, usedFallback: true, failoverReason };
  }
};

export type FailoverLogFields = {
  intentionId: string;
  primaryProviderId: string;
  primaryModelId: string;
  fallbackProviderId?: string | null;
  fallbackModelId?: string | null;
};

/**
 * Structured failover log/metric (item 5). Carries routing metadata ONLY —
 * provider/model ids, correlation, reason. Never secrets, keys, prompts,
 * transcripts, caller-supplied ids, messages or bodies.
 *
 * FIX-AGENT-LOG-CORRELATION-AND-ABORT-STATUS (W2): the caller-supplied
 * `intentionId` is untrusted (may contain newline/control/injection and is
 * predictable, so deterministic FNV is NOT sufficient). It never enters the
 * log line verbatim and never propagates into the returned event — every
 * call mints an independent random `corr-<hex>` value used both in the line
 * (`corr=`) and as the returned `intentionId` (opaque per-event correlation,
 * keeping the `LlmFailoverEvent` shape without echoing caller input).
 */
export const newFailoverCorrelation = (): string => {
  try {
    const uuid = (globalThis.crypto as unknown as { randomUUID?: () => string })?.randomUUID?.();
    if (typeof uuid === 'string' && uuid.length > 0) {
      return `corr-${uuid.replace(/-/g, '').slice(0, 16)}`;
    }
  } catch {
    // Fall through to Math.random fallback below.
  }
  const rand = `${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  return `corr-${rand.replace(/[^0-9a-f]/gi, '').slice(0, 16).padStart(16, '0')}`;
};

const SAFE_FAILOVER_REASON = /^(agent\.[a-z_]+|http_\d{3}|timeout|unknown_error|unresolvable_model)$/;

const sanitizeFailoverReason = (reason: string | null): string | null => {
  if (reason === null) return null;
  const clean = String(reason ?? '')
    .replace(/[\r\n\t\x00-\x1f\x7f]+/g, '')
    .slice(0, 64);
  return SAFE_FAILOVER_REASON.test(clean) ? clean : 'unknown_error';
};

export const logFailoverEvent = (
  fields: FailoverLogFields,
  outcome: { usedFallback: boolean; failoverReason: string | null },
  log = console.info,
): LlmFailoverEvent => {
  // W2: ignore the raw caller id entirely — opaque per-event correlation only.
  void fields.intentionId;
  const correlation = newFailoverCorrelation();
  const safeReason = sanitizeFailoverReason(outcome.failoverReason);
  const event: LlmFailoverEvent = {
    intentionId: correlation,
    primaryProviderId: fields.primaryProviderId,
    primaryModelId: fields.primaryModelId,
    fallbackProviderId: fields.fallbackProviderId ?? null,
    fallbackModelId: fields.fallbackModelId ?? null,
    usedFallback: outcome.usedFallback,
    failoverReason: safeReason,
  };
  // FIX-AGENT-FAILOVER-LOGGER-BEST-EFFORT: telemetry is best-effort — a
  // throwing logger must never break a valid relay/direct response.
  try {
    log(`llm.failover corr=${correlation} primary=${event.primaryProviderId}/${event.primaryModelId} fallback=${event.fallbackProviderId ?? '-'}/${event.fallbackModelId ?? '-'} used=${event.usedFallback ? '1' : '0'} reason=${event.failoverReason ?? '-'}`);
  } catch {
    // Observability must never break the turn.
  }
  // AGENT-010: sanitized provider.fallback lifecycle event — routing
  // metadata only (provider/model ids, fallback flag, sanitized reason).
  // Never prompts, transcripts, or financial payloads.
  try {
    emitSanitizedEvent('provider.fallback', {
      provider: event.primaryProviderId,
      model: event.primaryModelId,
      fallback: event.usedFallback,
      status: event.usedFallback ? 'fallback_used' : 'primary',
      ...(event.failoverReason ? { reason: event.failoverReason } : { reason: 'none' }),
    }, log);
  } catch {
    // Observability must never break the turn.
  }
  return event;
};
