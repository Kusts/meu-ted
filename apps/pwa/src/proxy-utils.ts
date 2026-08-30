/**
 * Security proxy utilities (shared between proxy and tests).
 *
 * Does NOT contain secrets or hardcoded tokens.
 */

/** Production API origin used in CSP connect-src */
export const PRODUCTION_API_ORIGIN = "https://api.synkroo.com.br";

/** Production Agent (TED chat) origin used in CSP connect-src */
export const PRODUCTION_AGENT_ORIGIN = "https://pi-finance-agent.walissonead.workers.dev";

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
 * - script-src: same-origin Next chunks + nonce-based inline scripts (no unsafe-inline)
 *   and optional unsafe-eval for the webpack development runtime
 * - style-src: same-origin stylesheets + unsafe-inline for Tailwind-generated styles
 * - worker-src: same-origin service worker
 * - connect-src: self + production API (canonical), plus local API origins in development
 * - frame-ancestors: none (equivalent to X-Frame-Options DENY)
 * - base-uri: self
 */
export function buildCspValue(nonce: string, allowUnsafeEval = false): string {
  const scriptSource = [
    `script-src 'self' 'nonce-${nonce}'`,
    ...(allowUnsafeEval ? ["'unsafe-eval'"] : []),
  ].join(" ");
  const connectSources = [
    "connect-src 'self'",
    PRODUCTION_API_ORIGIN,
    PRODUCTION_AGENT_ORIGIN,
    ...(allowUnsafeEval
      ? ["http://localhost:3001", "http://127.0.0.1:3001"]
      : []),
  ].join(" ");

  return [
    scriptSource,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self'",
    connectSources,
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join("; ");
}
