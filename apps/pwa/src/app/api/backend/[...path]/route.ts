import { NextResponse } from "next/server";
import {
  isBrowserOriginAllowed,
  resolveForwardOrigin,
} from "@/proxy-utils";

/** Overridable for local development (e.g. PWA_BACKEND_PROXY_ORIGIN=http://127.0.0.1:3001). */
const API_ORIGIN = process.env.PWA_BACKEND_PROXY_ORIGIN?.trim() || "https://api.synkroo.com.br";
/** Upstream budget: slightly above the PWA client's 15s apiFetch timeout. */
const UPSTREAM_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 1_048_576;
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "host",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "content-encoding",
]);

type RouteContext = { params: Promise<{ path: string[] }> };

function upstreamUrl(path: string[], search: string): string {
  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/");
  return `${API_ORIGIN}/${encodedPath}${search}`;
}

function forwardHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const name of [
    "accept", "content-type", "cookie", "authorization",
    "x-device-token",
    "cache-control", "x-workspace-id", "idempotency-key",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // V4 T2.7 G3: the spoof to the production host (upstream Better-Auth
  // trustedOrigins escape hatch for local testing via the same-origin
  // proxy) happens ONLY when the localhost bypass is enabled
  // (non-production + explicit ALLOW_LOCAL_ORIGIN=1). In production the
  // origin is forwarded unchanged so the upstream allowlist decides
  // (fail-closed); the proxy itself is same-origin, so browser CORS is
  // not involved.
  const origin = request.headers.get("origin");
  const forwarded = resolveForwardOrigin(origin, process.env);
  if (forwarded) {
    headers.set("origin", forwarded);
  }
  return headers;
}

function upstreamErrorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code, message } },
    { status, headers: { "content-type": "application/json" } },
  );
}

function hasValidBrowserOrigin(request: Request): boolean {
  return isBrowserOriginAllowed(request.headers.get("origin"), request.url, process.env);
}

function isTimeoutError(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { name?: unknown }).name === "TimeoutError"
  );
}

async function proxy(request: Request, context: RouteContext): Promise<NextResponse> {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !hasValidBrowserOrigin(request)) {
    return upstreamErrorResponse(403, "csrf.origin_mismatch", "Origem da requisição não autorizada.");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return upstreamErrorResponse(413, "request.body_too_large", "O corpo da requisição excede o limite permitido.");
  }
  const { path } = await context.params;
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  if (body && body.byteLength > MAX_BODY_BYTES) {
    return upstreamErrorResponse(413, "request.body_too_large", "O corpo da requisição excede o limite permitido.");
  }
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl(path, new URL(request.url).search), {
      method: request.method,
      headers: forwardHeaders(request),
      ...(body ? { body } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (cause) {
    if (isTimeoutError(cause)) {
      return upstreamErrorResponse(
        504,
        "upstream_timeout",
        "A API não respondeu dentro do tempo limite. Tente novamente.",
      );
    }
    return upstreamErrorResponse(
      502,
      "upstream_unavailable",
      "A API está indisponível no momento. Tente novamente mais tarde.",
    );
  }

  const headers = new Headers();
  upstream.headers.forEach((value, name) => {
    if (name !== "set-cookie" && !HOP_BY_HOP_HEADERS.has(name.toLowerCase())) headers.append(name, value);
  });
  for (const cookie of upstream.headers.getSetCookie?.() ?? []) headers.append("set-cookie", cookie);
  headers.set("cache-control", "no-store");
  headers.set("cdn-cache-control", "no-store");

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
