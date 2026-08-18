import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";

vi.mock("@serwist/sw", () => ({ installSerwist: vi.fn() }));
vi.mock("serwist", () => ({
  NetworkFirst: class {},
  CacheFirst: class {},
}));

import { installSerwist } from "@serwist/sw";

const handlers: Record<string, (e: unknown) => void> = {};

beforeAll(async () => {
  vi.stubGlobal("addEventListener", (type: string, cb: (e: unknown) => void) => {
    handlers[type] = cb;
  });
  await import("./sw");
});

beforeEach(() => {
  (globalThis as unknown as { skipWaiting: () => void }).skipWaiting = vi.fn();
  (globalThis as unknown as { clients: { claim: () => Promise<void> } }).clients = {
    claim: vi.fn().mockResolvedValue(undefined),
  };
  const names = ["pi-finance-shell", "pi-finance-static", "other-cache"];
  (globalThis as unknown as { caches: unknown }).caches = {
    keys: vi.fn().mockResolvedValue(names),
    delete: vi.fn().mockResolvedValue(true),
    match: vi.fn().mockResolvedValue(undefined),
    open: vi.fn(),
  };
});

afterEach(() => vi.unstubAllGlobals());

describe("service worker runtime", () => {
  it("installs Serwist without shell NetworkFirst HTML caching", () => {
    expect(installSerwist).toHaveBeenCalled();
    const cfg = (installSerwist as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0] as {
      runtimeCaching?: Array<{ matcher: unknown }>;
      precacheEntries?: Array<{ url: string }>;
    };
    expect(cfg.precacheEntries?.map((e) => e.url)).toEqual(
      expect.arrayContaining(["/offline-shell.html", "/offline-shell.js"]),
    );
    // No pi-finance-shell NetworkFirst entry
    const stringified = JSON.stringify(cfg.runtimeCaching ?? []);
    expect(stringified).not.toContain("pi-finance-shell");
  });

  it("CLEAN_UPDATE via type triggers skipWaiting", () => {
    handlers["message"]({ data: { type: "CLEAN_UPDATE" } });
    expect(
      (globalThis as unknown as { skipWaiting: () => void }).skipWaiting,
    ).toHaveBeenCalled();
  });

  it("CLEAN_UPDATE via action triggers skipWaiting", () => {
    handlers["message"]({ data: { action: "CLEAN_UPDATE" } });
    expect(
      (globalThis as unknown as { skipWaiting: () => void }).skipWaiting,
    ).toHaveBeenCalled();
  });

  it("KILL_SWITCH deletes only pi-finance caches", async () => {
    handlers["message"]({ data: { action: "KILL_SWITCH" } });
    await new Promise((r) => setTimeout(r, 10));
    const caches = (globalThis as unknown as {
      caches: { delete: (n: string) => void };
    }).caches;
    expect(caches.delete).toHaveBeenCalledWith("pi-finance-shell");
    expect(caches.delete).not.toHaveBeenCalledWith("other-cache");
  });

  it("activate deletes legacy pi-finance-shell", async () => {
    const waitUntil = vi.fn(async (p: Promise<unknown>) => p);
    handlers["activate"]({ waitUntil });
    await waitUntil.mock.calls[0][0];
    const caches = (globalThis as unknown as {
      caches: { delete: (n: string) => void };
    }).caches;
    expect(caches.delete).toHaveBeenCalledWith("pi-finance-shell");
  });

  it("navigation fetch falls back to offline shell on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    (globalThis as unknown as { caches: { match: ReturnType<typeof vi.fn> } }).caches.match =
      vi.fn().mockResolvedValue(new Response("OFFLINE_SHELL", { status: 200 }));

    const respondWith = vi.fn();
    handlers["fetch"]({
      request: {
        url: "http://localhost/registros",
        method: "GET",
        mode: "navigate",
        headers: { get: () => "text/html" },
      },
      respondWith,
    });
    await respondWith.mock.calls[0][0];
    const res: Response = await respondWith.mock.calls[0][0];
    expect(await res.text()).toBe("OFFLINE_SHELL");
  });

  it("does not intercept _rsc requests", () => {
    const respondWith = vi.fn();
    handlers["fetch"]({
      request: {
        url: "http://localhost/registros?_rsc=1",
        method: "GET",
        mode: "cors",
        headers: { get: () => "*/*" },
      },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
  });

  it("fetch handler disables SW when /pwa-control reports disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      clone: () => ({ json: () => Promise.resolve({ enabled: false }) }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const respondWith = vi.fn();
    handlers["fetch"]({
      request: { url: "http://localhost/pwa-control", method: "GET" },
      respondWith,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(respondWith).toHaveBeenCalled();
  });
  it("shows a safe notification from a push payload", async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("registration", { showNotification });
    const waitUntil = vi.fn(async (promise: Promise<unknown>) => promise);
    handlers["push"]({ data: { json: () => ({ title: "Conta vence", body: "Amanhã", url: "/a-pagar" }) }, waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(showNotification).toHaveBeenCalledWith("Conta vence", expect.objectContaining({ body: "Amanhã", data: { url: "/a-pagar" } }));
  });

  it("opens a safe notification URL when the user clicks", async () => {
    const openWindow = vi.fn().mockResolvedValue(undefined);
    const focus = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("clients", { matchAll: vi.fn().mockResolvedValue([{ focus, navigate }]), openWindow });
    const notification = { close: vi.fn(), data: { url: "/a-pagar" } };
    const waitUntil = vi.fn(async (promise: Promise<unknown>) => promise);
    handlers["notificationclick"]({ notification, waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(notification.close).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/a-pagar");
    expect(openWindow).not.toHaveBeenCalled();
  });
});
