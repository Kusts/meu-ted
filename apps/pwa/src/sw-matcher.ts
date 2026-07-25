// SW URL matcher — pure functions, testable without browser or Serwist.
export interface RequestInfo {
  url: string;
  method: string;
  headers?: Record<string, string>;
  mode?: string;
  responseHeaders?: Record<string, string>;
}

export interface MatchResult {
  permit: boolean;
  reason?: string;
  strategy?: "precache" | "network-first" | "cache-first" | "reject";
}

const SHELL = new Set(["/","/registros","/contas","/categorias","/a-pagar","/orcamentos","/metas","/cartoes","/assinaturas","/patrimonio","/relatorios","/perfil"]);

export function matchRequest(req: RequestInfo): MatchResult {
  if (req.method !== "GET") return { permit: false, reason: "non-GET method", strategy: "reject" };
  let url: URL;
  try { url = new URL(req.url); } catch { return { permit: false, reason: "invalid URL", strategy: "reject" }; }

  // Response-header checks at cache time
  const rh = req.responseHeaders;
  if (rh) {
    // Nonce in CSP header → HTML page, never cache
    if ((rh["content-security-policy"] || "").includes("nonce-"))
      return { permit: false, reason: "nonce in CSP", strategy: "reject" };
    // Private / no-store → sensitive, never cache
    const cc = (rh["cache-control"] || "").toLowerCase();
    if (cc.includes("private") || cc.includes("no-store"))
      return { permit: false, reason: "private/no-store", strategy: "reject" };
    // Authorization in request → never cache
    if (rh["authorization"] || rh["Authorization"])
      return { permit: false, reason: "auth header", strategy: "reject" };
  }

  // Cross-origin
  if (req.mode === "cors" || (typeof location !== "undefined" && url.origin !== location.origin))
    return { permit: false, reason: "cross-origin", strategy: "reject" };

  // Auth header on request
  if (req.headers?.["authorization"] || req.headers?.["Authorization"])
    return { permit: false, reason: "auth request header", strategy: "reject" };

  // /pwa-control path
  if (url.pathname.startsWith("/pwa-control"))
    return { permit: false, reason: "pwa-control path", strategy: "reject" };

  // _rsc query param
  if (url.searchParams.has("_rsc"))
    return { permit: false, reason: "_rsc query param", strategy: "reject" };

  // API paths
  if (url.pathname.startsWith("/api/"))
    return { permit: false, reason: "api path", strategy: "reject" };

  // Next.js internal data
  if (url.pathname.startsWith("/_next/data"))
    return { permit: false, reason: "next data", strategy: "reject" };

  // List route via URL path → not shell, not _next/static → reject
  if (url.pathname.endsWith(".html") && !url.pathname.includes("offline-shell"))
    return { permit: false, reason: "route html page", strategy: "reject" };

  // Shell navigation (network-first)
  if (SHELL.has(url.pathname))
    return { permit: true, reason: "shell navigation", strategy: "network-first" };

  // Hashed static assets (cache-first)
  if (url.pathname.startsWith("/_next/static") && /\.(js|css|json|woff2?|png|jpg|svg|ico|webp|wasm)$/i.test(url.pathname))
    return { permit: true, reason: "hashed static asset", strategy: "cache-first" };

  return { permit: false, reason: "unsupported same-origin", strategy: "reject" };
}

export function isShellRoute(pathname: string): boolean {
  return SHELL.has(pathname);
}

export { SHELL };
