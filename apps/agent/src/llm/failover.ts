import type { LlmFailoverEvent } from './provider-registry.js';

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
 * provider/model ids, intention, reason. Never secrets, keys, prompts or
 * transcripts. Emitted on the fallback leg (success or failure) and as a
 * single line when the primary wins without fallback.
 */
export const logFailoverEvent = (
  fields: FailoverLogFields,
  outcome: { usedFallback: boolean; failoverReason: string | null },
  log = console.info,
): LlmFailoverEvent => {
  const event: LlmFailoverEvent = {
    intentionId: fields.intentionId,
    primaryProviderId: fields.primaryProviderId,
    primaryModelId: fields.primaryModelId,
    fallbackProviderId: fields.fallbackProviderId ?? null,
    fallbackModelId: fields.fallbackModelId ?? null,
    usedFallback: outcome.usedFallback,
    failoverReason: outcome.failoverReason,
  };
  log(`llm.failover intention=${event.intentionId} primary=${event.primaryProviderId}/${event.primaryModelId} fallback=${event.fallbackProviderId ?? '-'}/${event.fallbackModelId ?? '-'} used=${event.usedFallback ? '1' : '0'} reason=${event.failoverReason ?? '-'}`);
  return event;
};
