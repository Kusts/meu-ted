/**
 * Pi Finance SW — network-only navigation + offline shell fallback.
 *
 * Rules (design / Task 8):
 * - Never cache route HTML or `_rsc` responses
 * - Precache only offline-shell.html/js
 * - On navigation network failure → offline shell
 * - On activate → delete legacy `pi-finance-shell` (+ outdated caches)
 * - CLEAN_UPDATE (type or action) → skipWaiting
 */

import { installSerwist } from "@serwist/sw";
import { CacheFirst } from "serwist";

// Service worker global (Serwist build injects into worker scope)
interface SWGlobal {
  skipWaiting: () => void;
  clients: { claim: () => Promise<void> };
  addEventListener: (type: string, listener: (event: SWEvent) => void) => void;
  __SW_MANIFEST?: Array<{ url: string; revision: string | null }>;
}
interface SWEvent extends Event {
  request?: Request;
  respondWith?: (p: Promise<Response>) => void;
  waitUntil?: (p: Promise<unknown>) => void;
  data?: { type?: string; action?: string } | null;
}
declare const self: SWGlobal;

// Serwist injects the build manifest at compile time (kept referenced).
void self.__SW_MANIFEST;

const CACHE_PREFIX = "pi-finance";
const LEGACY_SHELL = "pi-finance-shell";
const STATIC_CACHE = "pi-finance-static";
const OFFLINE_HTML = "/offline-shell.html";
const OFFLINE_JS = "/offline-shell.js";

installSerwist({
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  cleanupOutdatedCaches: true,
  // Only offline shell is precached — never route HTML.
  precacheEntries: [
    { url: OFFLINE_HTML, revision: null },
    { url: OFFLINE_JS, revision: null },
  ],
  runtimeCaching: [
    // Hashed static assets only (never HTML / RSC).
    {
      matcher: ({ url, request }: { url: URL; request: Request }) => {
        if (request.mode === "navigate") return false;
        if (url.searchParams.has("_rsc")) return false;
        return /^\/_next\/static\/.+\.(js|css|woff2?|png|jpg|svg|ico|webp)$/i.test(
          url.pathname,
        );
      },
      handler: new CacheFirst({ cacheName: STATIC_CACHE }),
    },
  ],
});

/** True when this is a document navigation (or HTML accept). */
function isNavigationRequest(request: Request): boolean {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

function isRscRequest(url: URL): boolean {
  return url.searchParams.has("_rsc");
}

async function offlineShellResponse(): Promise<Response> {
  const cached = await caches.match(OFFLINE_HTML);
  if (cached) return cached;
  return new Response("Offline", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// Activate: drop legacy shell cache + claim clients
self.addEventListener("activate", (event: SWEvent) => {
  event.waitUntil?.(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (n: string) =>
              n === LEGACY_SHELL ||
              n.startsWith(`${LEGACY_SHELL}-`) ||
              (n.startsWith(CACHE_PREFIX) &&
                n.includes("shell") &&
                !n.includes("static") &&
                !n.includes("precache")),
          )
          .map((n: string) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

// Messages from page coordinator
self.addEventListener("message", (event: SWEvent) => {
  const data = event.data || {};
  const kind = data.type || data.action;
  if (kind === "CLEAN_UPDATE" || kind === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (kind === "KILL_SWITCH") {
    caches.keys().then((names: string[]) => {
      names
        .filter((n: string) => n.startsWith(CACHE_PREFIX))
        .forEach((n: string) => caches.delete(n));
    });
  }
});

// Fetch: network-only navigations with offline-shell fallback; never cache HTML/RSC
self.addEventListener("fetch", (event: SWEvent) => {
  const request = event.request!;
  const url = new URL(request.url);

  // Kill-switch probe
  if (url.pathname === "/pwa-control" && request.method === "GET") {
    event.respondWith?.(
      fetch(request).then((res: Response) => {
        if (res.ok) {
          res
            .clone()
            .json()
            .then((body: { enabled?: boolean }) => {
              if (body?.enabled === false) {
                caches.keys().then((names: string[]) => {
                  names
                    .filter((n: string) => n.startsWith(CACHE_PREFIX))
                    .forEach((n: string) => caches.delete(n));
                });
              }
            })
            .catch(() => {});
        }
        return res;
      }),
    );
    return;
  }

  // Never intercept/cache RSC
  if (isRscRequest(url)) {
    return; // default network
  }

  // Navigation / HTML: network-only; offline shell only after failure
  if (request.method === "GET" && isNavigationRequest(request)) {
    event.respondWith?.(
      fetch(request)
        .then((res: Response) => {
          // Do not put HTML into any cache
          return res;
        })
        .catch(() => offlineShellResponse()),
    );
  }
});
