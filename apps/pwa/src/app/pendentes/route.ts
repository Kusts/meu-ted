import { NextResponse } from "next/server";

/**
 * Item 13: /pendentes now points at the canonical /compromissos pendencias
 * tab (previously /pending, itself redirected). Kept as a permanent 308
 * redirect (method and query preserving) so legacy deep links keep working
 * without duplicating the page render.
 */
export function GET(request: Request): NextResponse {
  const url = new URL(request.url);
  const target = new URL("/compromissos", url);
  const merged = new URLSearchParams([["aba", "pendencias"]]);
  for (const [key, value] of new URLSearchParams(url.search)) {
    if (key !== "aba") merged.append(key, value);
  }
  target.search = merged.toString();
  return NextResponse.redirect(target, 308);
}