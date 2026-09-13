// Web Vitals sanitizer tests — characterizes what RUM data is safe to send.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sanitizeDimension,
  sanitizeEvent,
  isRUMEnabled,
  reportRUM,
  initRUM,
} from "./web-vitals";

describe("sanitizeDimension", () => {
  // ── Permitted ────────────────────────────────────────────────
  it("permits known metric names", () => {
    expect(sanitizeDimension("LCP")).toBe("LCP");
    expect(sanitizeDimension("INP")).toBe("INP");
    expect(sanitizeDimension("CLS")).toBe("CLS");
    expect(sanitizeDimension("FCP")).toBe("FCP");
    expect(sanitizeDimension("TTFB")).toBe("TTFB");
    expect(sanitizeDimension("TBT")).toBe("TBT");
    expect(sanitizeDimension("FID")).toBe("FID");
  });

  it("permits numeric values (as strings)", () => {
    expect(sanitizeDimension("100")).toBe("100");
    expect(sanitizeDimension("2.5")).toBe("2.5");
    expect(sanitizeDimension("0.05")).toBe("0.05");
  });

  it("permits normalized routes (canonical IA, item 13)", () => {
    expect(sanitizeDimension("/")).toBe("/");
    expect(sanitizeDimension("/registros")).toBe("/registros");
    expect(sanitizeDimension("/compromissos")).toBe("/compromissos");
    expect(sanitizeDimension("/hub/patrimonio")).toBe("/hub/patrimonio");
    expect(sanitizeDimension("/perfil")).toBe("/perfil");
    expect(sanitizeDimension("/contas")).toBeNull();
    expect(sanitizeDimension("/a-pagar")).toBeNull();
  });

  it("permits short build IDs", () => {
    expect(sanitizeDimension("abc123")).toBe("abc123");
    expect(sanitizeDimension("d4e5f6")).toBe("d4e5f6");
  });

  it("permits empty/undefined/null", () => {
    expect(sanitizeDimension("")).toBe("");
    expect(sanitizeDimension(undefined)).toBe(undefined);
    expect(sanitizeDimension(null)).toBe(null);
  });

  // ── Rejected ─────────────────────────────────────────────────
  it("rejects token patterns", () => {
    expect(sanitizeDimension("eyJhbGciOiJIUzI1NiJ9.eyJ...")).toBeNull();
    expect(sanitizeDimension("tok_abc123")).toBeNull();
    expect(sanitizeDimension("Bearer xyz")).toBeNull();
  });

  it("rejects household/session IDs", () => {
    expect(sanitizeDimension("hh_abc123")).toBeNull();
    expect(sanitizeDimension("household-xyz")).toBeNull();
    expect(sanitizeDimension("session-abc")).toBeNull();
  });

  it("rejects financial values", () => {
    expect(sanitizeDimension("amountCents")).toBeNull();
    expect(sanitizeDimension("balanceCents")).toBeNull();
    expect(sanitizeDimension("totalCents")).toBeNull();
    expect(sanitizeDimension("valueCents")).toBeNull();
    expect(sanitizeDimension("50000")).toBeNull(); // large number → looks like cents
  });

  it("rejects query strings", () => {
    expect(sanitizeDimension("token=abc")).toBeNull();
    expect(sanitizeDimension("?page=2")).toBeNull();
    expect(sanitizeDimension("_rsc=abc123")).toBeNull();
  });

  it("rejects raw IDs (uuid-like)", () => {
    expect(sanitizeDimension("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBeNull();
    expect(sanitizeDimension("txn_abc123")).toBeNull();
  });

  it("rejects paths containing api or _next/data", () => {
    expect(sanitizeDimension("/api/accounts")).toBeNull();
    expect(sanitizeDimension("/_next/data/build-id")).toBeNull();
  });
});

describe("sanitizeEvent", () => {
  it("rejects events with sensitive dimensions", () => {
    const ev = sanitizeEvent({ metric: "LCP", value: 100, route: "/", buildId: "abc", token: "xyz" });
    expect(ev).toBeNull();
  });

  it("allows events with safe dimensions", () => {
    const ev = sanitizeEvent({ metric: "LCP", value: 100, route: "/" });
    expect(ev).not.toBeNull();
    expect(ev!.metric).toBe("LCP");
    expect(ev!.value).toBe(100);
    expect(ev!.route).toBe("/");
  });

  it("rejects when metric is missing", () => {
    expect(sanitizeEvent({ value: 100, route: "/" })).toBeNull();
  });

  it("rejects when route contains api path", () => {
    expect(sanitizeEvent({ metric: "LCP", value: 100, route: "/api/x" })).toBeNull();
  });
});

describe("isRUMEnabled", () => {
  beforeEach(() => localStorage.clear());

  it("returns false when localStorage key is not set", () => {
    expect(isRUMEnabled()).toBe(false);
  });

  it("returns true when localStorage key is '1'", () => {
    localStorage.setItem("pi-finance:rum", "1");
    expect(isRUMEnabled()).toBe(true);
  });

  it("returns false when localStorage key is '0'", () => {
    localStorage.setItem("pi-finance:rum", "0");
    expect(isRUMEnabled()).toBe(false);
  });
});

describe("reportRUM", () => {
  beforeEach(() => {
    localStorage.clear();
    // RUM only emits when the feature flag is on; enable it so the send
    // path is actually exercised (mirrors production: initRUM attaches
    // observers only when isRUMEnabled()).
    localStorage.setItem("pi-finance:rum", "1");
  });

  it("does not throw when fetch fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network")) as never;
    await expect(
      reportRUM({ metric: "LCP", value: 100, route: "/" }),
    ).resolves.toBeUndefined();
  });

  it("sends a beacon-style POST", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);
    await reportRUM({ metric: "CLS", value: 0.05, route: "/" });
    expect(global.fetch).toHaveBeenCalledOnce();
  });
});

describe("initRUM", () => {
  let observeSpy: ReturnType<typeof vi.fn>;
  let fakeCbs: Array<(list: { getEntries: () => Array<Record<string, unknown>> }) => void>;
  let visibilityListeners: Array<() => void>;

  beforeEach(() => {
    localStorage.setItem("pi-finance:rum", "1");
    observeSpy = vi.fn();
    fakeCbs = [];
    visibilityListeners = [];

    class FakeObserver {
      cb: (list: { getEntries: () => Array<Record<string, unknown>> }) => void;
      constructor(cb: (list: { getEntries: () => Array<Record<string, unknown>> }) => void) {
        this.cb = cb;
        fakeCbs.push(cb);
      }
      observe = observeSpy;
      disconnect = vi.fn();
    }
    // Test stub for the global PerformanceObserver
    (globalThis as unknown as { PerformanceObserver: unknown }).PerformanceObserver =
      FakeObserver as unknown as PerformanceObserver;

    const origAdd = window.addEventListener.bind(window);
    window.addEventListener = ((type: string, fn: () => void) => {
      if (type === "visibilitychange") visibilityListeners.push(fn);
      return origAdd(type as keyof WindowEventMap, fn as never);
    }) as typeof window.addEventListener;

    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);
  });

  it("creates LCP, INP and CLS observers when enabled", () => {
    initRUM();
    expect(observeSpy).toHaveBeenCalledTimes(3);
    const types = observeSpy.mock.calls.map((c) => (c[0] as { type: string }).type).sort();
    expect(types).toEqual(["first-input", "largest-contentful-paint", "layout-shift"]);
  });

  it("reports LCP through the observer callback", () => {
    initRUM();
    const lcpCb = fakeCbs[0];
    lcpCb({ getEntries: () => [{ startTime: 1234 }] });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/observability/rum",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((global.fetch as unknown as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[0][1].body);
    expect(body.metric).toBe("LCP");
    expect(body.value).toBe(1234);
  });

  it("accumulates CLS and reports it on visibilitychange hidden", () => {
    initRUM();
    const clsCb = fakeCbs[2];
    clsCb({
      getEntries: () => [
        { hadRecentInput: false, value: 0.1 },
        { hadRecentInput: false, value: 0.05 },
      ],
    });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    visibilityListeners.forEach((fn) => fn());
    const body = JSON.parse((global.fetch as unknown as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[0][1].body);
    expect(body.metric).toBe("CLS");
    expect(body.value).toBeCloseTo(0.15);
  });

  it("creates no observers when RUM is disabled", () => {
    localStorage.clear();
    initRUM();
    expect(observeSpy).not.toHaveBeenCalled();
  });
});
