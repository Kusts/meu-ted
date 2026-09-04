import { NextResponse } from "next/server";

/**
 * P2-6: /pendentes was consolidated into the canonical /pending route.
 * Kept as a permanent 308 redirect (method and query preserving) so legacy
 * deep links keep working without duplicating the page render.
 */
export function GET(request: Request): NextResponse {
  const url = new URL(request.url);
  const target = new URL("/pending", url);
  target.search = url.search;
  return NextResponse.redirect(target, 308);
}