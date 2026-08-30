import { NextResponse } from "next/server";

const AGENT_ORIGIN = "https://pi-finance-agent.walissonead.workers.dev";
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
  return `${AGENT_ORIGIN}/${encodedPath}${search}`;
}

function forwardHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const name of [
    "accept",
    "content-type",
    "cookie",
    "authorization",
    "x-workspace-id",
    "x-agent-connection-token",
    "cache-control",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Spoof origin to production PWA host for local testing via proxy
  const origin = request.headers.get("origin");
  if (origin && origin.includes("127.0.0.1")) {
    headers.set("origin", "https://pi-finance-pwa.walissonead.workers.dev");
  } else if (origin) {
    headers.set("origin", origin);
  }
  return headers;
}

async function proxy(request: Request, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params;
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  const upstream = await fetch(upstreamUrl(path, new URL(request.url).search), {
    method: request.method,
    headers: forwardHeaders(request),
    ...(body ? { body } : {}),
    redirect: "manual",
  });

  const headers = new Headers();
  upstream.headers.forEach((value, name) => {
    if (name !== "set-cookie" && !HOP_BY_HOP_HEADERS.has(name.toLowerCase())) headers.append(name, value);
  });
  for (const cookie of upstream.headers.getSetCookie?.() ?? []) headers.append("set-cookie", cookie);

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
