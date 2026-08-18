const CREDENTIAL_KEY = /(?:password|passcode|secret|token|api[_-]?key|authorization|cookie|private[_-]?key|credentials?|passphrase|access[_-]?key|pem)(?:[_-]?(?:key|id|value|secret|token))?/i;
const SENSITIVE_ASSIGNMENT = /((?:password|passcode|secret|token|api[_-]?key|authorization|cookie|private[_-]?key|credentials?|passphrase|access[_-]?key|pem)(?:[_-]?(?:key|id|value|secret|token))?\s*[:=]\s*)(?:(?:Bearer|Basic|Digest|Token)\s+[A-Za-z0-9._~+\/-]+=*|\[[^\]]*\]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:\\.|[^\s"'`,;}&\]])+)/gi;
const AUTH_SCHEME_VALUE = /\b(?:Bearer|Basic|Digest|Token)\s+[A-Za-z0-9+/=._~:-]+/gi;
const PEM_BLOCK = /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/g;
const JWT_VALUE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

const redactPlainText = (value: string): string => value
  .replace(PEM_BLOCK, "[REDACTED]")
  .replace(SENSITIVE_ASSIGNMENT, "$1[REDACTED]")
  .replace(AUTH_SCHEME_VALUE, "[REDACTED]")
  .replace(JWT_VALUE, "[REDACTED]");

const redactJsonValue = (value: unknown): unknown => {
  if (typeof value === "string") return redactPlainText(value);
  if (Array.isArray(value)) return value.map(redactJsonValue);
  if (value && typeof value === "object") {
    const entries = Object.entries(value).map(([key, child]) => [
      key,
      CREDENTIAL_KEY.test(key) ? "[REDACTED]" : redactJsonValue(child),
    ] as [string, unknown]);
    return Object.fromEntries(entries);
  }
  return value;
};

/** Redacts plain text and JSON-shaped content before it becomes durable. */
export const redactTranscript = (value: string): string => {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "string"
      ? JSON.stringify(redactPlainText(parsed))
      : JSON.stringify(redactJsonValue(parsed));
  } catch {
    return redactPlainText(value);
  }
};

/** Redacts JSON payloads while preserving valid JSON for SSE consumers. */
export const redactTranscriptJson = (value: string): string => {
  try {
    return JSON.stringify(redactJsonValue(JSON.parse(value)));
  } catch {
    return redactPlainText(value);
  }
};
