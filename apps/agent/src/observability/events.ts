import { sanitizeErrorMessage, sanitizeForEvent } from '../dlp/redaction.js';

export type ErrorClass = 'timeout' | 'network' | 'auth' | 'validation' | 'rate_limit' | 'unknown';
export type SanitizedEvent = { eventType: string; outcome: 'ok' | 'error'; errorClass?: ErrorClass; attributes: Record<string, unknown> };

export const classifyError = (error: unknown): ErrorClass => {
  const e = error as { code?: unknown; status?: unknown; statusCode?: unknown };
  const code = String(e?.code ?? '').toLowerCase();
  const status = Number(e?.status ?? e?.statusCode ?? 0);
  if (/timeout|etimedout|abort/.test(code)) return 'timeout';
  if (/network|econnreset|enotfound|fetch/.test(code)) return 'network';
  if (status === 401 || status === 403 || /auth|credential/.test(code)) return 'auth';
  if (status === 429 || /rate/.test(code)) return 'rate_limit';
  if (status >= 400 && status < 500) return 'validation';
  return 'unknown';
};

export const createSanitizedEvent = (eventType: string, input: Record<string, unknown> = {}): SanitizedEvent => {
  const error = input.error;
  const attributes = sanitizeForEvent(Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'error'))) as Record<string, unknown>;
  if (error !== undefined) attributes.error = sanitizeErrorMessage(error);
  return { eventType: eventType.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80), outcome: error ? 'error' : 'ok', ...(error ? { errorClass: classifyError(error) } : {}), attributes };
};

export const emitSanitizedEvent = (eventType: string, input: Record<string, unknown> = {}, log: (line: string) => void = console.info): SanitizedEvent => {
  const event = createSanitizedEvent(eventType, input);
  log(JSON.stringify(event));
  return event;
};
