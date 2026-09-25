// Web Vitals sanitizer tests — characterizes what RUM data is safe to send.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sanitizeDimension,
  sanitizeEvent,
  isRUMEnabled,
  reportRUM,
  initRUM,
} from "./web-vitals";

// ── Module-level baseline: exact original descriptors/values ─────────────
// Captured at import time, before any vi.stubGlobal/vi.spyOn/defineProperty
// in this file installs a stub. Never re-capture after stubbing: every
// afterEach below restores first, then compares against THESE snapshots.
function lookupProtoDescriptor(target: object, prop: string): {
  holder: object | null;
  descriptor: PropertyDescriptor | undefined;
} {
  let proto: object | null = Object.getPrototypeOf(target);
  while (proto !== null) {
    const found = Object.getOwnPropertyDescriptor(proto, prop);
    if (found) return { holder: proto, descriptor: found };
    proto = Object.getPrototypeOf(proto);
  }
  return { holder: null, descriptor: undefined };
}

function descriptorsEqual(
  actual: PropertyDescriptor | undefined,
  expected: PropertyDescriptor | undefined,
): boolean {
  if (actual === undefined || expected === undefined) return actual === expected;
  if (actual.configurable !== expected.configurable) return false;
  if (actual.enumerable !== expected.enumerable) return false;
  const actualIsData = "value" in actual || "writable" in actual;
  const expectedIsData = "value" in expected || "writable" in expected;
  if (actualIsData || expectedIsData) {
    if (!actualIsData || !expectedIsData) return false;
    if (!Object.is(actual.value, expected.value)) return false;
    if (actual.writable !== expected.writable) return false;
    return true;
  }
  return actual.get === expected.get && actual.set === expected.set;
}

type GlobalPropBaseline = {
  hasOwn: boolean;
  ownDescriptor: PropertyDescriptor | undefined;
  protoHolder: object | null;
  protoDescriptor: PropertyDescriptor | undefined;
  value: unknown;
};

function snapshotGlobalProp(target: object, prop: string): GlobalPropBaseline {
  const { holder, descriptor } = lookupProtoDescriptor(target, prop);
  return {
    hasOwn: Object.prototype.hasOwnProperty.call(target, prop),
    ownDescriptor: Object.getOwnPropertyDescriptor(target, prop),
    protoHolder: holder,
    protoDescriptor: descriptor,
    value: (target as Record<string, unknown>)[prop],
  };
}

const baselineFetch = snapshotGlobalProp(globalThis, "fetch");
const baselinePerformanceObserver = snapshotGlobalProp(globalThis, "PerformanceObserver");
const baselineWindowAddEventListener = snapshotGlobalProp(window, "addEventListener");
const baselineWindowRemoveEventListener = snapshotGlobalProp(window, "removeEventListener");
const baselineDocumentVisibilityState = snapshotGlobalProp(document, "visibilityState");

function assertPropRestored(
  target: object,
  prop: string,
  baseline: GlobalPropBaseline,
  label: string,
): void {
  const current = snapshotGlobalProp(target, prop);
  expect(
    current.hasOwn,
    `${label}: own-property presence changed (expected hasOwn=${baseline.hasOwn})`,
  ).toBe(baseline.hasOwn);
  expect(
    descriptorsEqual(current.ownDescriptor, baseline.ownDescriptor),
    `${label}: own descriptor differs from module-level baseline`,
  ).toBe(true);
  expect(
    current.protoHolder,
    `${label}: prototype holder changed`,
  ).toBe(baseline.protoHolder);
  expect(
    descriptorsEqual(current.protoDescriptor, baseline.protoDescriptor),
    `${label}: prototype descriptor differs from module-level baseline`,
  ).toBe(true);
  expect(
    current.value,
    `${label}: effective value is not the original reference`,
  ).toBe(baseline.value);
}

// Final verification: after the central teardown restored everything, every
// global is back to its exact original descriptor/value. Called once per
// test at the END of the single file-level afterEach below (after all
// restoration), so it executes after every test independent of order —
// including failing tests (vitest always runs afterEach).
function assertGlobalsRestored(): void {
  assertPropRestored(globalThis, "fetch", baselineFetch, "globalThis.fetch");
  assertPropRestored(
    globalThis,
    "PerformanceObserver",
    baselinePerformanceObserver,
    "globalThis.PerformanceObserver",
  );
  assertPropRestored(
    window,
    "addEventListener",
    baselineWindowAddEventListener,
    "window.addEventListener",
  );
  assertPropRestored(
    window,
    "removeEventListener",
    baselineWindowRemoveEventListener,
    "window.removeEventListener",
  );
  assertPropRestored(
    document,
    "visibilityState",
    baselineDocumentVisibilityState,
    "document.visibilityState",
  );
  // Intent of the former terminal test, now proven per-test instead of once
  // at the end (order-dependent): no mock/stub survivors.
  expect(vi.isMockFunction(globalThis.fetch)).toBe(false);
  expect(vi.isMockFunction(window.addEventListener)).toBe(false);
  expect(vi.isMockFunction(window.removeEventListener)).toBe(false);
}

// ── File-level teardown registry (initialized at module load, before any
// test setup may throw) ──────────────────────────────────────────────────
// Every successful initRUM() in this file registers its returned cleanup
// here IMMEDIATELY via initRUMTracked(). The single file-level afterEach
// below is the ONLY hook that restores globals: it drains this registry
// best-effort (LIFO, every entry even if one throws), reverts
// document.visibilityState to the module baseline, unstubs/restores mocks,
// clears localStorage, and only then asserts exact-descriptor restoration.
// No nested describe may add its own restore/assert afterEach: a nested
// afterEach cannot be relied on for ordering or for running when its own
// describe's beforeEach threw, so all of it lives here.
const pendingCleanups: Array<() => void> = [];

function runCleanupsBestEffort(queue: Array<() => void>): void {
  for (let i = queue.length - 1; i >= 0; i--) {
    try {
      queue[i]();
    } catch {
      // Best-effort: one throwing cleanup must not skip the rest.
    }
  }
}

function restoreDocumentVisibilityBaseline(): void {
  if (
    baselineDocumentVisibilityState.hasOwn &&
    baselineDocumentVisibilityState.ownDescriptor
  ) {
    Object.defineProperty(
      document,
      "visibilityState",
      baselineDocumentVisibilityState.ownDescriptor,
    );
  } else {
    delete (document as unknown as Record<string, unknown>).visibilityState;
  }
}

// Call initRUM and register the returned cleanup immediately so the central
// teardown always runs it — even if the test body throws right after.
function initRUMTracked(): () => void {
  const cleanup = initRUM();
  pendingCleanups.push(cleanup);
  return cleanup;
}

// Defensive reset: runs before any nested beforeEach (outer→inner), so a
// previous teardown that failed at its final assertion can never leak a
// cleanup into the next test.
beforeEach(() => {
  pendingCleanups.length = 0;
});

// THE single teardown function for this file. Deterministic order:
// 1) drain + run RUM cleanups best-effort (LIFO) while spies are live,
// 2) revert document.visibilityState to the module baseline,
// 3) unstub globals + restore mocks + clear localStorage (each best-effort),
// 4) assert exact-descriptor restoration against module baselines.
// Idempotent: a second consecutive call drains an empty queue and re-asserts
// the already-restored baselines, so the file-level afterEach re-invoking it
// after a test that called it directly is a safe no-op.
function restoreTestGlobals(): void {
  const queue = pendingCleanups.splice(0, pendingCleanups.length);
  runCleanupsBestEffort(queue);
  try {
    restoreDocumentVisibilityBaseline();
  } catch {
    // Fall through: the final assertion below will report the drift.
  }
  try {
    vi.unstubAllGlobals();
  } catch {
    // Fall through to the final assertion.
  }
  try {
    vi.restoreAllMocks();
  } catch {
    // Fall through to the final assertion.
  }
  try {
    localStorage.clear();
  } catch {
    // Storage may be inaccessible in fail-closed tests; assertion covers it.
  }
  pendingCleanups.length = 0;
  assertGlobalsRestored();
}

// The single file-level teardown hook invokes exactly restoreTestGlobals.
afterEach(() => {
  restoreTestGlobals();
});

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

describe("isRUMEnabled — inaccessible storage (fail-closed, default OFF)", () => {
  it("returns false (never throws) when localStorage.getItem throws", () => {
    const spy = vi
      .spyOn(window.localStorage, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    try {
      expect(() => isRUMEnabled()).not.toThrow();
      expect(isRUMEnabled()).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("returns false (never throws) when the localStorage getter itself throws", () => {
    const holder = globalThis as unknown as Record<string, unknown>;
    const descriptor = Object.getOwnPropertyDescriptor(holder, "localStorage");
    Object.defineProperty(holder, "localStorage", {
      get() {
        throw new Error("inaccessible");
      },
      configurable: true,
    });
    try {
      expect(() => isRUMEnabled()).not.toThrow();
      expect(isRUMEnabled()).toBe(false);
    } finally {
      if (descriptor) {
        Object.defineProperty(holder, "localStorage", descriptor);
      } else {
        delete holder.localStorage;
      }
    }
  });

  it("initRUM never throws when localStorage.getItem throws (boot fail-closed)", () => {
    const spy = vi
      .spyOn(window.localStorage, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    try {
      let cleanup: (() => void) | undefined;
      expect(() => {
        cleanup = initRUMTracked();
      }).not.toThrow();
      try {
        cleanup?.();
      } catch {
        // Cleanup is best-effort; never fail the test.
      }
    } finally {
      spy.mockRestore();
    }
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

  // NOTE: no nested afterEach here — the single file-level teardown hook
  // restores fetch/mocks/storage and asserts exact-descriptor restoration.

  it("does not throw when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(
      reportRUM({ metric: "LCP", value: 100, route: "/" }),
    ).resolves.toBeUndefined();
  });

  it("sends a beacon-style POST", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await reportRUM({ metric: "CLS", value: 0.05, route: "/" });
    expect(global.fetch).toHaveBeenCalledOnce();
  });
});

describe("initRUM", () => {
  // Observation state only (never teardown registries): module-level
  // pendingCleanups owns every RUM cleanup. Initialized at declaration so a
  // throwing beforeEach can never leave them undefined for the central hook
  // (which does not read them anyway).
  let observeSpy: ReturnType<typeof vi.fn> = vi.fn();
  let fakeCbs: Array<(list: { getEntries: () => Array<Record<string, unknown>> }) => void> = [];
  let visibilityListeners: Array<() => void> = [];

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
    // Scoped stub — the central file-level afterEach calls
    // vi.unstubAllGlobals() to restore the real PerformanceObserver even
    // when an assertion throws.
    vi.stubGlobal("PerformanceObserver", FakeObserver);

    // Spy (not manual assignment): the central file-level afterEach calls
    // vi.restoreAllMocks() to restore the original descriptor, so no bound
    // copy ever persists.
    // Capture the true original first so the wrapper can still call through.
    const originalAdd = window.addEventListener;
    vi.spyOn(window, "addEventListener").mockImplementation(
      ((type: string, fn: () => void, options?: unknown) => {
        if (type === "visibilitychange") visibilityListeners.push(fn);
        return originalAdd.call(window, type as never, fn as never, options as never);
      }) as typeof window.addEventListener,
    );

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    // NOTE: no visibilityState snapshot here and no nested afterEach — the
    // central file-level hook reverts to the module baseline and restores
    // globals even when setup or assertions throw.
  });

  it("creates LCP, INP and CLS observers when enabled", () => {
    initRUMTracked();
    expect(observeSpy).toHaveBeenCalledTimes(3);
    const types = observeSpy.mock.calls.map((c) => (c[0] as { type: string }).type).sort();
    expect(types).toEqual(["first-input", "largest-contentful-paint", "layout-shift"]);
  });

  it("reports LCP through the observer callback", () => {
    initRUMTracked();
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
    initRUMTracked();
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
    initRUMTracked();
    expect(observeSpy).not.toHaveBeenCalled();
  });
});

describe("initRUM — cleanup (StrictMode-safe, fail-closed)", () => {
  let instances: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
  let observeSpy: ReturnType<typeof vi.fn> = vi.fn();
  let added: Array<{ type: string; fn: EventListener }> = [];
  let removed: Array<{ type: string; fn: EventListener }> = [];

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("pi-finance:rum", "1");
    instances = [];
    added = [];
    removed = [];
    observeSpy = vi.fn();

    class FakeObserver {
      disconnect = vi.fn();
      observe = observeSpy;
      constructor() {
        instances.push(this as unknown as { disconnect: ReturnType<typeof vi.fn> });
      }
    }
    vi.stubGlobal("PerformanceObserver", FakeObserver);

    // Spies restore the original descriptors via the central file-level
    // afterEach (vi.restoreAllMocks) — never leave a `.bind(window)` copy
    // installed on the window object.
    const originalAdd = window.addEventListener;
    const originalRemove = window.removeEventListener;
    vi.spyOn(window, "addEventListener").mockImplementation(
      ((type: string, fn: EventListener, options?: unknown) => {
        if (type === "visibilitychange") added.push({ type, fn });
        return originalAdd.call(window, type as never, fn as never, options as never);
      }) as typeof window.addEventListener,
    );
    vi.spyOn(window, "removeEventListener").mockImplementation(
      ((type: string, fn: EventListener, options?: unknown) => {
        if (type === "visibilitychange") removed.push({ type, fn });
        return originalRemove.call(window, type as never, fn as never, options as never);
      }) as typeof window.removeEventListener,
    );

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    // NOTE: no nested afterEach — cleanups registered via trackRUMCleanup()
    // below run in the central file-level hook, best-effort and in order.
  });

  // Register an already-obtained cleanup for central best-effort teardown.
  function trackRUMCleanup(cleanup: () => void): () => void {
    pendingCleanups.push(cleanup);
    return cleanup;
  }

  it("returns a cleanup that disconnects every created observer exactly once", () => {
    const cleanup = trackRUMCleanup(initRUM());
    expect(typeof cleanup).toBe("function");
    expect(instances).toHaveLength(3);
    cleanup();
    for (const inst of instances) {
      expect(inst.disconnect).toHaveBeenCalledTimes(1);
    }
  });

  it("removes the exact visibilitychange listener it added (same function)", () => {
    const cleanup = trackRUMCleanup(initRUM());
    expect(added).toHaveLength(1);
    cleanup();
    expect(removed).toHaveLength(1);
    expect(removed[0].fn).toBe(added[0].fn);
  });

  it("cleanup is safe when PerformanceObserver is unavailable", () => {
    vi.stubGlobal("PerformanceObserver", undefined);
    const cleanup = trackRUMCleanup(initRUM());
    expect(typeof cleanup).toBe("function");
    expect(() => cleanup()).not.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("disconnects partial observers immediately when a later observe throws (before returned cleanup)", () => {
    observeSpy.mockImplementationOnce(() => {}).mockImplementationOnce(() => {
      throw new Error("observe failed");
    });
    const cleanup = trackRUMCleanup(initRUM());
    expect(typeof cleanup).toBe("function");
    // Partial observers must already be disconnected at return — without
    // invoking the returned cleanup (W2: catch must best-effort cleanup).
    for (const inst of instances) {
      expect(inst.disconnect).toHaveBeenCalledTimes(1);
    }
    // Returned cleanup remains idempotent when RootProviders later calls it.
    expect(() => cleanup()).not.toThrow();
    for (const inst of instances) {
      expect(inst.disconnect).toHaveBeenCalledTimes(1);
    }
  });
});

describe("file-level teardown semantics (order-independent proof)", () => {
  it("restoreTestGlobals runs every pending cleanup LIFO even when one throws, then restores baselines (idempotent for the file-level afterEach)", () => {
    // Arrange through the SAME central hook the file-level afterEach uses:
    // stub a global, override visibility, and register cleanups so the
    // thrower executes FIRST in LIFO order with the flag cleanup after it —
    // proving one throwing cleanup cannot skip the rest.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    localStorage.setItem("pi-finance:rum", "1");
    let laterCleanupRan = false;
    pendingCleanups.push(() => {
      laterCleanupRan = true;
    });
    pendingCleanups.push(() => {
      throw new Error("boom");
    });

    // Act: invoke the exact central restoration callback.
    expect(() => restoreTestGlobals()).not.toThrow();

    // Assert: the cleanup after the thrower still ran, and every baseline
    // descriptor/value (including visibility) is restored. The file-level
    // afterEach then re-invokes restoreTestGlobals() post-test — safe
    // because the registry is drained and restoration is idempotent.
    expect(laterCleanupRan).toBe(true);
    expect(pendingCleanups).toHaveLength(0);
    expect(localStorage.getItem("pi-finance:rum")).toBeNull();
    assertGlobalsRestored();
  });

  it("restoreDocumentVisibilityBaseline reverts an own-property override", () => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    try {
      expect(document.visibilityState).toBe("hidden");
    } finally {
      restoreDocumentVisibilityBaseline();
    }
    assertPropRestored(
      document,
      "visibilityState",
      baselineDocumentVisibilityState,
      "document.visibilityState",
    );
  });

  it("central registry starts empty so partial setup cannot leak cleanups", () => {
    // The file-level beforeEach clears the registry before every test; if a
    // previous test had leaked, this assertion would fail independent of any
    // nested hook ordering.
    expect(pendingCleanups).toHaveLength(0);
  });
});
