// SW matcher tests — pure unit tests, no browser needed.
import { describe, it, expect } from "vitest";
import { matchRequest, type RequestInfo } from "./sw-matcher";

const ORIGIN = "http://localhost:3000";

function nav(url: string, overrides: Partial<RequestInfo> = {}): RequestInfo {
  return { url, method: "GET", mode: "same-origin", ...overrides };
}
function asset(url: string): RequestInfo {
  return { url, method: "GET", mode: "same-origin" };
}

describe("sw request matcher", () => {
  // ── Permitted: navigation to shell routes ─────────────────
  it.each(["/","/registros","/compromissos","/hub","/hub/patrimonio","/hub/planejamento","/hub/relatorios","/hub/alertas","/hub/categorias","/hub/configuracoes","/perfil","/workspaces","/convite","/audit","/capture"])("permits shell navigation to %s (network-first)", (route) => {
    const r = nav(`${ORIGIN}${route}`);
    expect(matchRequest(r).permit).toBe(true);
    expect(matchRequest(r).strategy).toBe("network-first");
  });

  // ── Permitted: hashed static assets ───────────────────────
  it.each(["/_next/static/chunks/app/layout-abc123.js","/_next/static/chunks/171-69f.css","/_next/static/css/app/layout.css","/_next/static/chunks/polyfills.js","/_next/static/media/logo.abc123.woff2","/_next/static/image/bg.png","/_next/static/chunks/framework.js"])("permits hashed static asset: %s (cache-first)", (u) => {
    expect(matchRequest(asset(`${ORIGIN}${u}`)).permit).toBe(true);
    expect(matchRequest(asset(`${ORIGIN}${u}`)).strategy).toBe("cache-first");
  });

  // ── Rejected: API paths ──────────────────────────────────
  it.each(["/api/accounts","/api/auth/devices/me","/api/transactions?limit=10"])("rejects API path: %s", (p) => {
    expect(matchRequest(asset(`${ORIGIN}${p}`)).permit).toBe(false);
  });

  // ── Rejected: cross-origin ────────────────────────────────
  it("rejects cross-origin", () => { expect(matchRequest({url:"https://other.com/data",method:"GET",mode:"cors"}).permit).toBe(false); });

  // ── Rejected: auth header on request ─────────────────────
  it("rejects request with Authorization header", () => {
    expect(matchRequest(nav(`${ORIGIN}/registros`,{headers:{Authorization:"Bearer x"}})).permit).toBe(false);
  });

  // ── Rejected: /pwa-control path ──────────────────────────
  it("rejects /pwa-control", () => { expect(matchRequest(nav(`${ORIGIN}/pwa-control/sync`)).permit).toBe(false); });

  // ── Rejected: ?_rsc= query param ─────────────────────────
  it("rejects _rsc query", () => { expect(matchRequest(nav(`${ORIGIN}/registros?_rsc=1q2w3e`)).permit).toBe(false); });

  // ── Rejected: non-GET methods ────────────────────────────
  it.each(["POST","PUT","DELETE","PATCH","OPTIONS"])("rejects %s", (m) => { expect(matchRequest({url:`${ORIGIN}/registros`,method:m,mode:"same-origin"}).permit).toBe(false); });

  // ── Rejected: _next/data ─────────────────────────────────
  it("rejects _next/data", () => { expect(matchRequest(nav(`${ORIGIN}/_next/data/build-id/r.json`)).permit).toBe(false); });

  // ── Rejected: unknown same-origin routes ─────────────────
  it("rejects unknown routes", () => { expect(matchRequest(nav(`${ORIGIN}/random-page`)).permit).toBe(false); });

  // ── Rejected: invalid URLs ───────────────────────────────
  it("rejects invalid URL", () => { expect(matchRequest({url:"not-a-url",method:"GET"}).permit).toBe(false); });

  // ── Rejected: route HTML pages (nonce in CSP response) ───
  it("rejects nonce-bearing HTML via responseHeaders", () => {
    expect(matchRequest({url:`${ORIGIN}/registros.html`,method:"GET",mode:"same-origin",responseHeaders:{"content-security-policy":"script-src 'nonce-abc123'"}}).permit).toBe(false);
  });

  // ── Rejected: private cache-control ──────────────────────
  it("rejects private Cache-Control", () => {
    expect(matchRequest({url:`${ORIGIN}/data`,method:"GET",mode:"same-origin",responseHeaders:{"cache-control":"private, max-age=0"}}).permit).toBe(false);
  });

  // ── Rejected: no-store cache-control ─────────────────────
  it("rejects no-store Cache-Control", () => {
    expect(matchRequest({url:`${ORIGIN}/data`,method:"GET",mode:"same-origin",responseHeaders:{"cache-control":"no-store"}}).permit).toBe(false);
  });

  // ── Rejected: auth in response headers ───────────────────
  it("rejects auth response header", () => {
    expect(matchRequest({url:`${ORIGIN}/data`,method:"GET",mode:"same-origin",responseHeaders:{"authorization":"Bearer x"}}).permit).toBe(false);
  });
});
