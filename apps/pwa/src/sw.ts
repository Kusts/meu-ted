import { installSerwist } from "@serwist/sw";
import { NetworkFirst, CacheFirst } from "serwist";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const self: any;
declare class FetchEvent extends Event { request: Request; respondWith(p: Promise<Response>): void; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare class MessageEvent extends Event { data: any; }

// Reference the Serwist-injected manifest so Serwist can replace it at build
// time. The value is intentionally unused.
const __SW_MANIFEST: Array<{ url: string; revision: string | null }> | undefined = self.__SW_MANIFEST;
void __SW_MANIFEST;

const CACHE_PREFIX = "pi-finance";
const shellRoutes = ["/","/registros","/contas","/categorias","/a-pagar","/orcamentos","/metas","/cartoes","/assinaturas","/patrimonio","/relatorios","/perfil"];

installSerwist({
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  cleanupOutdatedCaches: true,
  precacheEntries: [
    { url: "/offline-shell.html", revision: null },
    { url: "/offline-shell.js", revision: null },
  ],
  runtimeCaching: [
    {
      matcher: ({ url }: { url: URL }) => !url.searchParams.has("_rsc") && shellRoutes.includes(url.pathname),
      handler: new NetworkFirst({ cacheName: "pi-finance-shell", networkTimeoutSeconds: 2 }),
    },
    {
      matcher: ({ url }: { url: URL }) => /^\/_next\/static\/.+\.(js|css|woff2?|png|jpg|svg|ico|webp)$/.test(url.pathname),
      handler: new CacheFirst({ cacheName: "pi-finance-static" }),
    },
  ],
});

// Message handler: clean/dirty update and kill switch
self.addEventListener("message", (event: MessageEvent) => {
  const data = event.data || {};
  if (data.action === "CLEAN_UPDATE") {
    self.skipWaiting();
  }
  if (data.action === "KILL_SWITCH") {
    // Delete only pi-finance-* caches, never other caches
    caches.keys().then((names) => {
      names.filter((n: string) => n.startsWith(CACHE_PREFIX)).forEach((n: string) => caches.delete(n));
    });
  }
});

// Fetch handler: check pwa-control for kill-switch or disable
self.addEventListener("fetch", (event: FetchEvent) => {
  const url = new URL(event.request.url);
  // Detect kill switch via boot fetch to /pwa-control
  if (url.pathname === "/pwa-control" && event.request.method === "GET") {
    event.respondWith(
      fetch(event.request).then((res) => {
        if (res.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          res.clone().json().then((body: any) => {
            if (body?.enabled === false) {
              // Disable SW: delete all pi-finance caches
              caches.keys().then((names) => {
                names.filter((n: string) => n.startsWith(CACHE_PREFIX)).forEach((n: string) => caches.delete(n));
              });
            }
          }).catch(() => {});
        }
        return res;
      })
    );
  }
});
