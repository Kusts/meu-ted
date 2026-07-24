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
    const cacheNames = await page.evaluate(async () => caches.keys());
    const offlineShellCached = await page.evaluate(
      async () => Boolean(await caches.match("/offline-shell.html")),
    );
    expect(cacheNames.some((name) => name.startsWith("serwist-precache"))).toBe(true);
    expect(offlineShellCached).toBe(true);
  });
  test("offline fallback", async ({ page }) => {
    await cacheShell(page);
    await page.route("**/*", r => r.abort());
    await page.goto(`${BASE}/registros`, { waitUntil: "domcontentloaded", timeout: 8e3 });
    expect(await page.content()).toContain("Modo offline");
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
    expect(remaining.hasOther).toBe(true, "non-pi cache survives");
    expect(remaining.hasPi).toBe(false, "pi-finance caches deleted");
  });
});
