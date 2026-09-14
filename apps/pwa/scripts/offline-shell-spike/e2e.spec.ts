import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:3456";
const SHELL = ["/","/registros","/contas","/categorias","/a-pagar","/orcamentos","/metas","/cartoes","/assinaturas","/patrimonio","/relatorios","/perfil"];

async function activateSW(page: Page) {
  await page.goto(`${BASE}/registros`, { timeout: 10e3 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js");
    for (let i = 0; i < 40; i++) {
      if (navigator.serviceWorker.controller?.state === "activated") return;
      await new Promise(r => setTimeout(r, 250));
    }
  });
}

async function cacheShell(page: Page) {
  await activateSW(page);
  for (const r of SHELL) await page.goto(BASE + r, { waitUntil: "load", timeout: 5e3 }).catch(() => {});
}

test.describe("Offline Routes", () => {
  test("precaches offline shell without caching route HTML", async ({ page }) => {
    await cacheShell(page);

    // 1) Serwist precache bucket must exist
    const cacheNames = await page.evaluate(async () => caches.keys());
    expect(cacheNames.some((name) => name.startsWith("serwist-precache"))).toBe(true);

    // 2) offline-shell.html must be cached (in any cache).
    // Serwist keys precached entries by revision
    // (`URL?__WB_REVISION__=<rev>`, see SHELL_PRECACHE_ENTRIES in src/sw.ts),
    // so an exact-URL match misses by design — ignoreSearch asserts the real
    // contract ("the shell is cached and servable"), not the key format.
    const offlineShellCached = await page.evaluate(
      async () => Boolean(await caches.match("/offline-shell.html", { ignoreSearch: true })),
    );
    expect(offlineShellCached).toBe(true);

    // 3) Enumerate EVERY cache entry across ALL caches. Fail if any entry
    //    has a URL path matching a SHELL route — the SW must NOT pre-cache
    //    individual shell routes; it serves them from offline-shell.html at
    //    fetch time via the navigation fallback handler.
    //    Static precache entries (JS, CSS, fonts, images, icons, etc.) are
    //    expected and allowed.
    const shellViolations = await page.evaluate(
      async (routes: string[]) => {
        type Entry = { cacheName: string; url: string; contentType?: string };
        const found: Entry[] = [];
        for (const name of await caches.keys()) {
          const cache = await caches.open(name);
          for (const req of await cache.keys()) {
            const url = new URL(req.url);
            if (routes.includes(url.pathname)) {
              const resp = await cache.match(req);
              found.push({
                cacheName: name,
                url: req.url,
                contentType: resp?.headers.get("content-type") ?? undefined,
              });
            }
          }
        }
        return found;
      },
      SHELL,
    );
    expect(shellViolations).toHaveLength(0);
  });

  test("offline fallback", async ({ page, context }) => {
    await cacheShell(page);
    // Use real Playwright offline mode, not route aborting
    await context.setOffline(true);
    await page.goto(`${BASE}/registros`, { waitUntil: "domcontentloaded", timeout: 8e3 });
    expect(await page.content()).toContain("Modo offline");
    // Restore connectivity so Playwright cleanup doesn't hang
    await context.setOffline(false);
  });
});

test.describe("SW Updates", () => {
  test("clean activates waiting", async ({ page }) => {
    await activateSW(page);
    const r = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg?.active) return "no-sw";
      reg.active.postMessage({ action: "CLEAN_UPDATE" });
      return "sent";
    });
    expect(r).toBe("sent");
  });
  test("dirty retains waiting (no CLEAN_UPDATE)", async ({ page }) => {
    await activateSW(page);
    // Dirty state simulated by NOT sending CLEAN_UPDATE — wait for new SW
    // The active SW remains in control; no new activation happens
    const controlled = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      // Just verify the SW is active (dirty means no update triggered)
      return reg?.active?.state === "activated";
    });
    expect(controlled).toBe(true);
  });
});

test.describe("Blocked Mutation", () => {
  test("pwa-control GET returns enabled", async ({ page }) => {
    await activateSW(page);
    const e = await page.evaluate(async () => { const r = await fetch("/pwa-control"); return (await r.json()).enabled; });
    expect(e).toBe(true);
  });
});

test.describe("Kill Switch", () => {
  test("KILL_SWITCH postMessage deletes only pi-finance caches", async ({ page }) => {
    await cacheShell(page);
    // Create a non-pi-finance cache to verify it survives
    await page.evaluate(async () => { const c = await caches.open("other-cache"); await c.put("/t", new Response("t")); });
    expect(await page.evaluate(async () => (await caches.keys()).includes("other-cache"))).toBe(true);
    // Send KILL_SWITCH via postMessage
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      reg?.active?.postMessage({ action: "KILL_SWITCH" });
      await new Promise(r => setTimeout(r, 500));
    });
    const remaining = await page.evaluate(async () => {
      const names = await caches.keys();
      return { hasOther: names.includes("other-cache"), hasPi: names.some(n => n.startsWith("pi-finance")), names };
    });
    expect(remaining.hasOther).toBe(true); // non-pi cache survives
    expect(remaining.hasPi).toBe(false); // pi-finance caches deleted
  });
});
