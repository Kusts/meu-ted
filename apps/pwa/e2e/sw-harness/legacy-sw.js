/* Legacy SW artifact — caches shell routes into pi-finance-shell */
const CACHE = "pi-finance-shell";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["/"]).then(() => self.skipWaiting())),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  const kind = data.type || data.action;
  if (kind === "CLEAN_UPDATE" || kind === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
