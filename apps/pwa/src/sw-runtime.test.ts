import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";

vi.mock("@serwist/sw", () => ({ installSerwist: vi.fn() }));
vi.mock("serwist", () => ({ NetworkFirst: class {}, CacheFirst: class {} }));

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
  const names = ["pi-finance-shell", "other-cache"];
  (globalThis as unknown as { caches: unknown }).caches = {
    keys: vi.fn().mockResolvedValue(names),
    delete: vi.fn().mockResolvedValue(true),
  };
});

afterEach(() => vi.unstubAllGlobals());

describe("service worker runtime", () => {
  it("installs Serwist with shell/static strategies", () => {
    expect(installSerwist).toHaveBeenCalled();
  });

  it("CLEAN_UPDATE triggers skipWaiting", () => {
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

  it("ignores unknown message actions", () => {
    handlers["message"]({ data: { action: "FOO" } });
    expect(
      (globalThis as unknown as { skipWaiting: () => void }).skipWaiting,
    ).not.toHaveBeenCalled();
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
    const caches = (globalThis as unknown as {
      caches: { delete: (n: string) => void };
    }).caches;
    expect(caches.delete).toHaveBeenCalledWith("pi-finance-shell");
  });

  it("fetch handler keeps caches when /pwa-control reports enabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      clone: () => ({ json: () => Promise.resolve({ enabled: true }) }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const respondWith = vi.fn();
    handlers["fetch"]({
      request: { url: "http://localhost/pwa-control", method: "GET" },
      respondWith,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(respondWith).toHaveBeenCalled();
    const caches = (globalThis as unknown as {
      caches: { delete: (n: string) => void };
    }).caches;
    expect(caches.delete).not.toHaveBeenCalled();
  });

  it("fetch handler ignores non-ok /pwa-control response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
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
    const caches = (globalThis as unknown as {
      caches: { delete: (n: string) => void };
    }).caches;
    expect(caches.delete).not.toHaveBeenCalled();
  });

  it("fetch handler ignores when body has no enabled flag", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      clone: () => ({ json: () => Promise.resolve({}) }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const respondWith = vi.fn();
    handlers["fetch"]({
      request: { url: "http://localhost/pwa-control", method: "GET" },
      respondWith,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(respondWith).toHaveBeenCalled();
    const caches = (globalThis as unknown as {
      caches: { delete: (n: string) => void };
    }).caches;
    expect(caches.delete).not.toHaveBeenCalled();
  });

  it("message handler tolerates missing event data", () => {
    handlers["message"]({});
    expect(
      (globalThis as unknown as { skipWaiting: () => void }).skipWaiting,
    ).not.toHaveBeenCalled();
  });

  it("fetch handler ignores non-pwa-control requests", () => {
    const respondWith = vi.fn();
    handlers["fetch"]({
      request: { url: "http://localhost/registros", method: "GET" },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
  });

  it("fetch handler swallows malformed JSON from /pwa-control", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      clone: () => ({ json: () => Promise.reject(new Error("bad json")) }),
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

  it("invokes runtimeCaching matchers for shell and static routes", () => {
    const cfg = vi.mocked(installSerwist).mock.calls[0][0] as {
      runtimeCaching: Array<{ matcher: (a: { url: URL }) => boolean }>;
    };
    const [shell, static_] = cfg.runtimeCaching;
    expect(shell.matcher({ url: new URL("http://localhost/registros") })).toBe(true);
    expect(shell.matcher({ url: new URL("http://localhost/registros?_rsc=1") })).toBe(false);
    expect(static_.matcher({ url: new URL("http://localhost/_next/static/a.js") })).toBe(true);
    expect(static_.matcher({ url: new URL("http://localhost/foo.png") })).toBe(false);
  });
});
