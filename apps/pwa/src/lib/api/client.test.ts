import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetch, apiGet, apiPost, getAuthToken, isApiConfigured, UNAUTHORIZED_EVENT, ApiError } from "./client";

describe("apiFetch JSON content-type", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("adds application/json content-type when body is present", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await apiFetch("/transactions/expense", {
      method: "POST",
      body: JSON.stringify({ description: "Mercado" }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });
});

describe("api client base URL resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses explicit NEXT_PUBLIC_PI_FINANCE_API_BASE_URL when configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await apiFetch("/auth/devices/register", { method: "POST" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/auth/devices/register",
      expect.objectContaining({ method: "POST" }),
    );
    expect(isApiConfigured()).toBe(true);
  });

  it("does NOT send x-device-token from NEXT_PUBLIC_PI_FINANCE_API_DEVICE_TOKEN", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_PI_FINANCE_API_BASE_URL",
      "https://api.example.com",
    );
    vi.stubEnv(
      "NEXT_PUBLIC_PI_FINANCE_API_DEVICE_TOKEN",
      "should-not-appear",
    );
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    await apiFetch("/ping", { method: "GET" });

    const callHeaders = fetchMock.mock.calls[0][1]?.headers as Record<
      string,
      string
    >;
    expect(callHeaders["x-device-token"]).toBeUndefined();
  });
});

describe("apiFetch error, timeout and edge handling", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("throws ApiError on 401 with body code/message", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "auth.expired", message: "Sessão expirada" }), { status: 401 }),
    );
    await expect(apiFetch("/me")).rejects.toMatchObject({
      status: 401,
      code: "auth.expired",
      message: "Sessão expirada",
    });
  });

  it("returns undefined on 204", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const r = await apiFetch("/void");
    expect(r).toBeUndefined();
  });

  it("throws ApiError on non-401 error status", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "server", message: "fail" }), { status: 500 }),
    );
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 500, code: "server", message: "fail" });
  });

  it("uses default message when error body is not JSON", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("plain text", { status: 503, headers: { "Content-Type": "text/plain" } }),
    );
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 503, code: "error", message: "HTTP 503" });
  });

  it("times out and throws 408 ApiError when fetch hangs beyond timeoutMs", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) => new Promise((_resolve, reject) => {
        if (init?.signal) {
          init.signal.addEventListener("abort", () => {
            const err = new DOMException("The operation was aborted.", "AbortError");
            reject(err);
          });
        }
      }),
    );

    await expect(apiFetch("/hanging-endpoint", { timeoutMs: 50 })).rejects.toThrow(ApiError);
    await expect(apiFetch("/hanging-endpoint", { timeoutMs: 50 })).rejects.toMatchObject({
      status: 408,
      code: "network.timeout",
    });
  });

  it("times out when the response body never resolves", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    const response = {
      status: 200,
      ok: true,
      json: vi.fn(() => new Promise<never>(() => {})),
    } as unknown as Response;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    const pending = apiFetch("/hanging-body", { timeoutMs: 50 });
    const testTimeout = Symbol("test-timeout");
    const observed = Promise.race([
      pending.then(() => "resolved").catch((error) => error),
      new Promise<typeof testTimeout>((resolve) => {
        setTimeout(() => resolve(testTimeout), 100);
      }),
    ]);

    await vi.advanceTimersByTimeAsync(100);
    const result = await observed;
    expect(result).not.toBe(testTimeout);
    expect(result).toMatchObject({ status: 408, code: "network.timeout" });
  });

  it("sets idempotency-key header when provided", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await apiFetch("/pay", { method: "POST", idempotencyKey: "key-1" });
    const h = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(h["idempotency-key"]).toBe("key-1");
  });

  it("sets x-device-token from explicit token option", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await apiFetch("/me", { token: "tok-9" });
    const h = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(h["x-device-token"]).toBe("tok-9");
  });

  it("omits Content-Type when no body", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await apiFetch("/ping", { method: "GET" });
    const h = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(h["Content-Type"]).toBeUndefined();
  });

  it("apiGet sends token and returns parsed body", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ hello: "world" }), { status: 200 }));
    const r = await apiGet<{ hello: string }>("/thing", "tok");
    expect(r).toEqual({ hello: "world" });
    const h = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(h["x-device-token"]).toBe("tok");
  });

  it("apiPost sends JSON body, token and idempotency key", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 200 }));
    const r = await apiPost<{ id: number }>("/create", "tok", { a: 1 }, "idem-1");
    expect(r).toEqual({ id: 1 });
    const opt = fetchMock.mock.calls[0][1] as RequestInit;
    expect(opt.method).toBe("POST");
    const h = opt.headers as Record<string, string>;
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["x-device-token"]).toBe("tok");
    expect(h["idempotency-key"]).toBe("idem-1");
  });

  it("apiPost without body omits Content-Type", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await apiPost("/create", null);
    const h = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(h["Content-Type"]).toBeUndefined();
  });

  it("getAuthToken reads from localStorage", async () => {
    localStorage.setItem("pi-finance:token", "stored");
    expect(getAuthToken()).toBe("stored");
    localStorage.removeItem("pi-finance:token");
  });

  it("apiFetch automatically forwards pi-finance:session-token as Bearer header", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    localStorage.setItem("pi-finance:session-token", "sess-test-token-xyz");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await apiFetch("/transactions");
    const h = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(h["Authorization"]).toBe("Bearer sess-test-token-xyz");
    localStorage.removeItem("pi-finance:session-token");
  });
});

describe("central 401 handling (UNAUTHORIZED_EVENT)", () => {

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("dispatches the unauthorized event when a 401 response arrives", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "auth.expired", message: "Sessão expirada" }), { status: 401 }),
    );
    const handler = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, handler);

    await expect(apiFetch("/me")).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledOnce();
    window.removeEventListener(UNAUTHORIZED_EVENT, handler);
  });

  it("does not dispatch the unauthorized event on non-401 errors", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "server.error" }), { status: 500 }),
    );
    const handler = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, handler);

    await expect(apiFetch("/me")).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener(UNAUTHORIZED_EVENT, handler);
  });
});

describe("canonical same-origin base (ADR-011)", () => {
  const PRODUCTION_HOST = "pi-finance-pwa.walissonead.workers.dev";
  const originalLocation = window.location;

  function stubHostname(hostname: string) {
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, hostname, origin: `https://${hostname}` },
      writable: true,
      configurable: true,
    });
  }

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses the same-origin /api/backend proxy on the production host without explicit env", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "");
    stubHostname(PRODUCTION_HOST);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await apiFetch("/workspaces");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/workspaces",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(isApiConfigured()).toBe(true);
  });

  it("never defaults to the direct cross-origin API URL in production", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "");
    stubHostname(PRODUCTION_HOST);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await apiFetch("/workspaces");

    const calledUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).not.toContain("api.synkroo.com.br");
    expect(calledUrl.startsWith("/api/backend/")).toBe(true);
  });

  it("keeps the explicitly configured URL as transient test-env override", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    stubHostname(PRODUCTION_HOST);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await apiFetch("/workspaces");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/workspaces",
      expect.anything(),
    );
  });

  it("stays fail-closed off the production host without explicit env", () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "");
    stubHostname("localhost");
    expect(isApiConfigured()).toBe(false);
  });

  it("sends cookie-only same-origin requests without requiring localStorage tokens", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "");
    stubHostname(PRODUCTION_HOST);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await apiFetch("/workspaces");

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
    expect(headers["x-device-token"]).toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });
});
