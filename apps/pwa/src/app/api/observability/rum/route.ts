// Sanitized RUM ingest endpoint (POST /api/observability/rum).
//
// Defensive, server-side mirror of the client sanitizer in lib/observability/web-vitals.ts:
// the client already sanitizes, but this route re-validates every field so a malicious
// or buggy client can never push sensitive data. Responses are no-store (never cached,
// never CDN-cached). Logging is aggregate-only — metric + coarse route, NEVER the raw
// value or payload — so no sensitive data can leak through logs.

import { NextRequest, NextResponse } from "next/server";

const ALLOWED_KEYS = new Set(["metric", "value", "route", "buildId"]);
const KNOWN_METRICS = new Set(["LCP", "INP", "CLS", "FCP", "TTFB", "TBT", "FID"]);
const KNOWN_ROUTES = new Set([
  "/", "/registros", "/contas", "/categorias", "/a-pagar", "/orcamentos",
  "/metas", "/cartoes", "/assinaturas", "/patrimonio", "/relatorios", "/perfil",
  "/_not-found", "/manifest.webmanifest",
]);

/** P2-10: payload cap — real RUM events are well under 1 KB. */
export const RUM_MAX_BODY_BYTES = 1024;

/** P2-10: local proportional rate limit (per client IP, sliding window). */
export const RUM_RATE_LIMIT = { limit: 30, windowMs: 60_000 } as const;

const rateBuckets = new Map<string, number[]>();

function isRateLimited(key: string, now: number): boolean {
  const cutoff = now - RUM_RATE_LIMIT.windowMs;
  const hits = (rateBuckets.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= RUM_RATE_LIMIT.limit) {
    rateBuckets.set(key, hits);
    return true;
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  return false;
}

/**
 * P2-10: verifiable same-origin. `Sec-Fetch-Site` is browser-controlled and
 * cannot be forged by page JS; when absent (non-browser clients) fall back to
 * a strict Origin-vs-Host comparison. No Origin and no Sec-Fetch-Site → 403.
 */
function isSameOrigin(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site === "same-origin") return true;
  if (site && site !== "same-origin") return false;

  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

// Any dimension matching these patterns is rejected (defense in depth).
const SENSITIVE_RE =
  /token|household|session[_-]|amount[Cc]ents|balance[Cc]ents|total[Cc]ents|value[Cc]ents|bearer|api[_-]?key|secret|auth|password|credit[Cc]ard|query|_rsc|txn[_-]|account|cpf|email|phone|name/i;

interface SanitizedRUM {
  metric: string;
  value: number;
  route: string;
  buildId?: string;
}

function sanitizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0) return null;
  if (SENSITIVE_RE.test(value)) return null;
  return value;
}

function validate(event: Record<string, unknown>): SanitizedRUM | null {
  // Reject any disallowed key defensively — only metric/value/route/buildId may exist.
  for (const key of Object.keys(event)) {
    if (!ALLOWED_KEYS.has(key)) return null;
  }

  const metric = sanitizeText(event.metric);
  if (!metric || !KNOWN_METRICS.has(metric)) return null;

  const rawValue = event.value;
  const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
  if (!Number.isFinite(value)) return null;

  const route = sanitizeText(event.route);
  if (!route || !KNOWN_ROUTES.has(route)) return null;

  const buildId = event.buildId === undefined ? undefined : sanitizeText(event.buildId);
  return { metric, value, route, buildId: buildId ?? undefined };
}

// Aggregate logging only: non-sensitive dimensions, never the raw value or payload.
function logAggregate(event: SanitizedRUM | null): void {
  if (!event) {
    console.log("[rum] rejected invalid/sensitive payload");
    return;
  }
  console.log("[rum] aggregated", { metric: event.metric, route: event.route });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");

  // P2-10: local proportional rate limit keyed by client IP (fail-open-free:
  // unknown clients share the "local" bucket).
  const clientKey =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (isRateLimited(clientKey, Date.now())) {
    console.log("[rum] rate limited");
    return new NextResponse(null, { status: 429, headers });
  }

  // P2-10: same-origin must be verifiable; everything else is rejected blind.
  if (!isSameOrigin(request)) {
    console.log("[rum] rejected cross-origin request");
    return new NextResponse(null, { status: 403, headers });
  }

  // P2-10: reject oversized payloads before parsing; never log their contents.
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > RUM_MAX_BODY_BYTES) {
    console.log("[rum] rejected oversized payload");
    return new NextResponse(null, { status: 413, headers });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new NextResponse(null, { status: 400, headers });
  }
  if (rawBody.length > RUM_MAX_BODY_BYTES) {
    console.log("[rum] rejected oversized payload");
    return new NextResponse(null, { status: 413, headers });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse(null, { status: 400, headers });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return new NextResponse(null, { status: 400, headers });
  }

  const sanitized = validate(body as Record<string, unknown>);
  if (!sanitized) {
    logAggregate(null);
    return new NextResponse(null, { status: 400, headers });
  }

  logAggregate(sanitized);
  return new NextResponse(null, { status: 204, headers });
}
