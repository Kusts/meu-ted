/**
 * Next.js 16 middleware — security proxy.
 *
 * Applies security headers and CSP nonce to all routes.
 * Uses experimental-edge runtime for Cloudflare compatibility via OpenNext.
 *
 * NOTE: Next.js 16 recommends src/proxy.ts as the proxy/middleware file.
 * However, proxy.ts runs on Node.js runtime and OpenNext throws:
 *   "ERROR Node.js middleware is not currently supported."
 *
 * Until OpenNext supports Node.js proxy, we use the deprecated middleware.ts
 * convention with `runtime = "experimental-edge"` which builds and bundles
 * correctly with OpenNext.
 *
 * Migrate to src/proxy.ts when OpenNext supports Node.js middleware.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  generateNonce,
  SECURITY_HEADERS,
  buildCspValue,
} from "./proxy-utils";

// experimental-edge required for OpenNext/Cloudflare deployment.
// Proxy.ts (Next.js 16 native) is Node.js-only and rejected by OpenNext.
export const runtime = "experimental-edge";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function middleware(request: NextRequest) {
  const nonce = generateNonce();

  const response = NextResponse.next();

  // Set CSP with nonce
  response.headers.set("Content-Security-Policy", buildCspValue(nonce));

  // Expose nonce to client (React uses it for <script> nonce injection)
  response.headers.set("x-nonce", nonce);

  // Apply all static security headers
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  // Strip X-Powered-By as safety net
  const rawHeaders = response.headers as unknown as Headers;
  if (rawHeaders.get("X-Powered-By")) {
    rawHeaders.delete("X-Powered-By");
  }

  return response;
}

// Match all routes except static assets and Next.js internals
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|\\.well-known|\\.open-next).*)",
  ],
};
