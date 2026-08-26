/**
 * Phase 0.1.6 — Log sanitizer.
 *
 * Prevents sensitive tokens from being logged in plaintext.
 * Redacts x-device-token and authorization headers.
 */

const SENSITIVE_HEADERS = new Set([
  'x-device-token',
  'authorization',
  'cookie',
  'set-cookie',
]);

export const sanitizeHeaders = (headers: Record<string, string | string[] | undefined>): Record<string, unknown> => {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      safe[key] = '[REDACTED]';
    } else {
      safe[key] = value;
    }
  }
  return safe;
};

export const sanitizeLogData = (data: unknown): unknown => {
  if (typeof data !== 'object' || data === null) return data;
  if (Array.isArray(data)) return data.map(sanitizeLogData);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (key === 'headers' && typeof value === 'object' && value !== null) {
      result[key] = sanitizeHeaders(value as Record<string, string | string[] | undefined>);
    } else if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizeLogData(value);
    }
  }
  return result;
};
