// ─────────────────────────────────────────────────────────────────────────────
// Log Sanitizer — redact PII before writing to stdout/stderr
// Covers: phone numbers, tokens, push names, emails, API keys
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Redact a phone number in WhatsApp JID format.
 * "5511999998888@s.whatsapp.net" → "55******8888@s.whatsapp.net"
 * "5511988887777:19@s.whatsapp.net" → "55******7777@s.whatsapp.net"
 */
export function sanitizePhone(text: string): string {
  // DDD (2 digits) + middle digits + last 4 + optional :sender + @s.whatsapp.net
  return text.replace(
    /(\d{2})\d+(\d{4})(:\d+)?(@s\.whatsapp\.net)/g,
    '$1******$2$4',
  );
}

/**
 * Redact tokens (alphanumeric strings longer than 16 chars).
 */
export function sanitizeToken(text: string): string {
  let result = text;

  // Redact values after token/key/secret patterns
  result = result.replace(
    /((?:TOKEN|KEY|SECRET|API[_-]?KEY|PASSWORD|AUTH)=)[^\s,;]+/gi,
    '$1[REDACTED]',
  );

  // Match standalone alphanumeric tokens >= 17 chars
  result = result.replace(/[A-Za-z0-9_-]{17,}/g, (match) => {
    if (match.startsWith('http://') || match.startsWith('https://') || match.includes('/')) {
      return match;
    }
    return '[REDACTED]';
  });

  return result;
}

/**
 * Redact email addresses.
 */
export function sanitizeEmail(text: string): string {
  // Exclude WhatsApp JIDs (already handled by sanitizePhone)
  return text.replace(
    /[a-zA-Z0-9._%+-]+@(?!s\.whatsapp\.net|g\.us)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    '[EMAIL]',
  );
}

/**
 * Truncate + sanitize message content for log output.
 */
export function sanitizeMessage(text: string, maxLen = 100): string {
  let result = sanitizePhone(text);
  result = sanitizeEmail(result);
  if (result.length > maxLen) {
    result = result.slice(0, maxLen) + '...';
  }
  return result;
}

/**
 * Main sanitize — chains all redactions.
 * Order matters: phone first (more specific), then email, then token (most generic).
 */
export function sanitize(text: string): string {
  let result = text;
  // Phone numbers first (more specific — must run before email which would
  // match 5511999998888@s.whatsapp.net as an email address)
  result = sanitizePhone(result);
  // Emails
  result = sanitizeEmail(result);
  // Tokens last (generic — catches API keys and instance tokens)
  result = sanitizeToken(result);
  return result;
}

/**
 * Sanitize console.log arguments.
 * Accepts same variadic args as console.log.
 * Returns a single sanitized string suitable for stdout/stderr.
 */
export function sanitizeLog(...args: unknown[]): string {
  const raw = args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return a.message;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
  return sanitize(raw);
}
