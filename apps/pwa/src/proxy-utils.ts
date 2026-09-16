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
 * Build the Permissions-Policy value from the microphone capability
 * (V4 T1.1, INV-08 bidirectional).
 *
 * - mic enabled → `microphone=(self)`: live capture works in a real browser.
 * - mic disabled (default) → `microphone=()`: denied, matching the absent UI.
 *
 * Camera and geolocation stay blocked in every configuration, and no
 * cross-origin value is ever emitted for the microphone directive.
 */
export function buildPermissionsPolicy(micEnabled: boolean): string {
  const microphone = micEnabled ? "microphone=(self)" : "microphone=()";
  return `camera=(), ${microphone}, geolocation=()`;
}

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
 * Production header emission shared by src/middleware.ts and XLT-00.
 *
 * This is the SAME function the middleware calls (not a reimplementation):
 * per-response CSP with a fresh nonce + the static security headers, with
 * Permissions-Policy built from the microphone capability (V4 T1.1).
 * Kept pure (no Next.js imports) so both the edge middleware and a plain
 * node:http server in tests can execute it.
 */
export interface ProductionEmissionInput {
  nonce: string;
  isDevelopment: boolean;
  micEnabled: boolean;
}

export function buildProductionEmissionHeaders(
  input: ProductionEmissionInput,
): Record<string, string> {
  const headers: Record<string, string> = {};
  headers["Content-Security-Policy"] = buildCspValue(input.nonce, input.isDevelopment);
  headers["x-nonce"] = input.nonce;
  const permissionsPolicy = buildPermissionsPolicy(input.micEnabled);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers[key] = key === "Permissions-Policy" ? permissionsPolicy : value;
  }
  return headers;
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
