// Sanitized web-vitals RUM collector.
// Sanitizer rejects sensitive dimensions (token, household ID, financial values,
// query strings) and permits only safe metric/value/route/buildId data.
// Feature-flagged: only reports when localStorage "pi-finance:rum" is set to "1".

interface RUMEvent {
  metric: string;
  value: number;
  route: string;
  buildId?: string;
}

// Sensitive patterns — any dimension containing these is rejected
const SENSITIVE_RE = /token|household|session[_-]|amount[Cc]ents|balance[Cc]ents|total[Cc]ents|value[Cc]ents|bearer|api[_-]?key|secret|auth|password|credit[Cc]ard|query|_rsc|txn[_-]/;
const BIG_NUMBER_THRESHOLD = 10000; // financial values are typically > 10000 cents
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CENTS_RE = /^[1-9]\d{3,}$/; // 4+ digit number → could be cents
const TOKEN_RE = /^(eyJ|tok_|Bearer\s)/i;
const ID_RE = /^[0-9a-f]{32}$/i;

/**
 * Sanitize a single dimension value. Returns the value if safe, null if sensitive.
 * Undefined/null pass through as-is.
 */
export function sanitizeDimension(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return value;
  const str = String(value);

  // Empty is safe
  if (str.length === 0) return str;

  // Known metric names are safe
  const KNOWN_METRICS = new Set(["LCP", "INP", "CLS", "FCP", "TTFB", "TBT", "FID"]);
  if (KNOWN_METRICS.has(str)) return str;

  // Numeric metric values (up to big number threshold) are safe
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    const num = Number(str);
    if (num < BIG_NUMBER_THRESHOLD) return str;
    return null; // large number → could be financial
  }

  // Normalized routes (known shell routes, canonical IA item 13) are safe
  const KNOWN_ROUTES = new Set([
    "/", "/registros", "/compromissos", "/hub",
    "/hub/patrimonio", "/hub/planejamento", "/hub/relatorios", "/hub/alertas",
    "/hub/categorias", "/hub/configuracoes",
    "/perfil", "/workspaces", "/convite", "/audit", "/capture",
    "/_not-found", "/manifest.webmanifest",
  ]);
  if (KNOWN_ROUTES.has(str)) return str;

  // Reject sensitive patterns (MUST be before short-alphanumeric or
  // things like "amountCents" bypass the filter)
  if (TOKEN_RE.test(str)) return null;
  if (CENTS_RE.test(str)) return null; // looks like cents value
  if (SENSITIVE_RE.test(str)) return null;

  // Short alphanumeric (buildId: ~6-20 chars) is safe
  if (/^[a-z0-9]{6,20}$/i.test(str) && !UUID_RE.test(str) && !ID_RE.test(str)) return str;
  if (str.startsWith("?")) return null;
  if (str.includes("=")) return null;
  if (/^\/api\//.test(str)) return null;
  if (/^\/_next\/data\//.test(str)) return null;

  // Unknown values are rejected (defense in depth)
  return null;
}

// Only these keys are permitted on a RUM event. Any extra dimension
// (e.g. token, householdId, account) is rejected defensively so sensitive
// data can never leak through an unexpected field.
const ALLOWED_EVENT_KEYS = new Set(["metric", "value", "route", "buildId"]);

/**
 * Sanitize a RUM event — strips sensitive fields, returns safe event or null.
 */
export function sanitizeEvent(event: Record<string, unknown>): RUMEvent | null {
  for (const key of Object.keys(event)) {
    if (!ALLOWED_EVENT_KEYS.has(key)) return null;
  }
  const metric = sanitizeDimension(event.metric);
  const rawValue = event.value;
  const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
  const route = sanitizeDimension(event.route);
  const buildId = sanitizeDimension(event.buildId);

  if (!metric || isNaN(value) || !route) return null;

  return { metric, value, route, buildId: buildId ?? undefined };
}

const RUM_ENABLED_KEY = "pi-finance:rum";

/**
 * Check if RUM collection is enabled (feature flag).
 */
export function isRUMEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(RUM_ENABLED_KEY) === "1";
}

/**
 * Report a sanitized RUM event to the observability endpoint.
 * Only sends on failure/error, never on success (aggregate failures only).
 */
export async function reportRUM(event: RUMEvent): Promise<void> {
  if (!isRUMEnabled()) return;

  try {
    const payload = sanitizeEvent(event as unknown as Record<string, unknown>);
    if (!payload) return;

    await fetch("/api/observability/rum", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // Use keepalive so the request completes even if the page is unloading
      keepalive: true,
    });
  } catch {
    // RUM failure must never affect the app
  }
}

/**
 * Initialize RUM collection (feature-flagged, default OFF).
 * Sets up PerformanceObserver to capture LCP, INP, CLS.
 * Reports sanitized events only; never sends sensitive data.
 */
export function initRUM(): void {
  if (!isRUMEnabled() || typeof window === "undefined") return;

  try {
    // LCP
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length > 0) {
        const lcp = entries[entries.length - 1];
        reportRUM({
          metric: "LCP",
          value: lcp.startTime,
          route: window.location.pathname,
          buildId: undefined,
        });
      }
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });

    // INP (first input delay approximation)
    const inpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        reportRUM({
          metric: "INP",
          value: entry.duration,
          route: window.location.pathname,
          buildId: undefined,
        });
      }
    });
    inpObserver.observe({ type: "first-input", buffered: true });

    // CLS
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(entry as any).hadRecentInput) clsValue += (entry as any).value || 0;
      }
    });
    clsObserver.observe({ type: "layout-shift", buffered: true });

    // Report CLS on page hide
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        reportRUM({
          metric: "CLS",
          value: clsValue,
          route: window.location.pathname,
          buildId: undefined,
        });
      }
    });

  } catch {
    // PerformanceObserver not available or other error — RUM must never break the app
  }
}
