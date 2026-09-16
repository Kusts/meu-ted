/**
 * Security proxy utilities (shared between proxy and tests).
 *
 * Does NOT contain secrets or hardcoded tokens.
 */

/** Production API origin (retired from the production CSP — see below). */
export const PRODUCTION_API_ORIGIN = "https://api.synkroo.com.br";

/** Production Agent (TED chat) origin (retired from the production CSP — see below). */
export const PRODUCTION_AGENT_ORIGIN = "https://pi-finance-agent.walissonead.workers.dev";

/**
 * V4 T2.7 G1 — remaining external origins allowed by the production CSP.
 *
 * EMPTY by design: T2.1 converged browser traffic to the same-origin
 * proxies (/api/backend, /api/agent), so production connect-src is 'self'
 * only. PRODUCTION_API_ORIGIN / PRODUCTION_AGENT_ORIGIN above are kept as
 * documented reference (upstream targets the proxies forward to), never as
 * browser connect targets. Any future external origin needs a per-origin
 * capability entry here before it may enter connect-src.
 */
export const REMAINING_EXTERNAL_ORIGINS: readonly string[] = [];

/** Production PWA host — the only trusted browser origin for the proxies. */
export const PRODUCTION_PWA_ORIGIN = "https://pi-finance-pwa.walissonead.workers.dev";

type EnvLike = { NODE_ENV?: string; ALLOW_LOCAL_ORIGIN?: string };

function readEnv(env: EnvLike | undefined): EnvLike {
  if (env) return env;
  try {
    return {
      NODE_ENV: process.env.NODE_ENV,
      ALLOW_LOCAL_ORIGIN: process.env.ALLOW_LOCAL_ORIGIN,
    };
  } catch {
    return {};
  }
}

/** True for http(s) localhost / 127.0.0.1 origins (pure, no env). */
export function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

/**
 * V4 T2.7 G3 — localhost bypass gate (shared by both Next proxies).
 *
 * Fail-closed: production NEVER enables the bypass, even with the flag set.
 * Outside production the bypass additionally requires the explicit
 * ALLOW_LOCAL_ORIGIN=1 flag (dev/test escape hatch). Reads env at
 * call-time so tests can pass an explicit object or vi.stubEnv.
 */
export function isLocalBypassEnabled(env?: EnvLike): boolean {
  const { NODE_ENV, ALLOW_LOCAL_ORIGIN } = readEnv(env);
  if (NODE_ENV === "production") return false;
  return ALLOW_LOCAL_ORIGIN === "1";
}

/**
 * V4 T2.7 G3 — shared browser-origin decision used by both Next proxies.
 * Missing origin (non-browser / same-document navigation) and exact
 * same-origin pass; localhost passes only when the bypass is enabled;
 * everything else is rejected.
 */
export function isBrowserOriginAllowed(
  origin: string | null,
  requestUrl: string,
  env?: EnvLike,
): boolean {
  if (!origin) return true;
  try {
    if (new URL(origin).origin === new URL(requestUrl).origin) return true;
  } catch {
    return false;
  }
  return isLocalOrigin(origin) && isLocalBypassEnabled(env);
}

/**
 * V4 T2.7 G3 — shared upstream-Origin decision used by both Next proxies.
 * The spoof to the production host (upstream trustedOrigins escape hatch)
 * happens ONLY when the bypass is enabled; otherwise the origin is
 * forwarded unchanged so the upstream allowlist decides (fail-closed).
 */
export function resolveForwardOrigin(
  origin: string | null,
  env?: EnvLike,
): string | null {
  if (origin && isLocalOrigin(origin) && isLocalBypassEnabled(env)) {
    return PRODUCTION_PWA_ORIGIN;
  }
  return origin;
}

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
 * - worker-src: same-origin service worker (Serwist)
 * - connect-src: 'self' ONLY in production (V4 T2.7 G1 — browser traffic
 *   flows through the same-origin proxies since T2.1; no external origin
 *   remains — see REMAINING_EXTERNAL_ORIGINS), plus local API origins in
 *   development when gated
 * - default-src/object-src/form-action: hardened in production (V4 T2.7 G2);
 *   img-src/media-src keep blob:/data: so attachment previews
 *   (URL.createObjectURL) and audio playback keep working under
 *   default-src 'self' — PWA/Serwist compatibility guard
 * - frame-ancestors: none (equivalent to X-Frame-Options DENY)
 * - base-uri: self
 * - report-uri: same-origin violation endpoint (V4 T2.7/T0.4.8, SPEC §24.8)
 */
export function buildCspValue(nonce: string, allowUnsafeEval = false): string {
  const scriptSource = [
    `script-src 'self' 'nonce-${nonce}'`,
    ...(allowUnsafeEval ? ["'unsafe-eval'"] : []),
  ].join(" ");
  const connectSources = [
    "connect-src 'self'",
    ...REMAINING_EXTERNAL_ORIGINS,
    ...(allowUnsafeEval
      ? ["http://localhost:3001", "http://127.0.0.1:3001"]
      : []),
  ].join(" ");

  return [
    scriptSource,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self'",
    connectSources,
    "default-src 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "report-uri /api/csp-report",
  ].join("; ");
}
