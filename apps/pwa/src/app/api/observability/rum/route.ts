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

  let body: unknown;
  try {
    body = await request.json();
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
