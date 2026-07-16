/**
 * Security proxy utilities (shared between proxy and tests).
 *
 * Does NOT contain secrets or hardcoded tokens.
 */

/** Production API origin used in CSP connect-src */
export const PRODUCTION_API_ORIGIN = "https://api.synkroo.com.br";

/** Canonical security headers applied to every response. */
export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-Frame-Options": "DENY",
};

/**
 * Generate a CSP nonce — 32 random hex characters.
 * Unique per request.
 */
export function generateNonce(): string {
  // Use Web Crypto API (Edge-compatible).
  // crypto.getRandomValues fills with cryptographically strong random values.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Build the Content-Security-Policy value for a given nonce.
 *
 * - script-src: nonce-based (no unsafe-inline)
 * - style-src: unsafe-inline allowed temporarily (Tailwind generates inline styles)
 * - connect-src: self + production API (canonical)
 * - frame-ancestors: none (equivalent to X-Frame-Options DENY)
 * - base-uri: self
 */
export function buildCspValue(nonce: string): string {
  return [
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    `connect-src 'self' ${PRODUCTION_API_ORIGIN}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join("; ");
}
