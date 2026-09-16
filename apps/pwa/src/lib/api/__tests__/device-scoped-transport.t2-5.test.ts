import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../client";
import { registerDeviceToken, verifyDeviceToken } from "../auth";

/**
 * T2.5-client — Device token scoped transport (ADR-015 Opção C, session-first).
 *
 * Contract: normal calls (financial data, RPC, chat) MUST NOT carry
 * `x-device-token`, even when a device token sits in localStorage. The device
 * header is attached ONLY on explicitly scoped device flows
 * (POST /auth/devices/register, GET /auth/devices/me, rotation) via the
 * explicit `token` option — never via an implicit store fallback.
 */

function mockFetchJson(payload: unknown, status = 200): ReturnType<typeof vi.spyOn> {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(payload), { status }));
}

function lastHeaders(fetchMock: ReturnType<typeof vi.spyOn>): Record<string, string> {
  return fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("T2.5 normal calls never carry the device token", () => {
  it("omits x-device-token on a normal data call even with a device token stored", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    localStorage.setItem("pi-finance:token", "dev-stored");
    const fetchMock = mockFetchJson({ ok: true });

    await apiFetch("/transactions");

    expect(lastHeaders(fetchMock)["x-device-token"]).toBeUndefined();
  });

  it("operates session-first without a device token (session bearer only, no device header)", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    localStorage.setItem("pi-finance:session-token", "sess-abc");
    const fetchMock = mockFetchJson({ ok: true });

    await apiFetch("/transactions");

    const headers = lastHeaders(fetchMock);
    expect(headers["x-device-token"]).toBeUndefined();
    expect(headers["Authorization"]).toBe("Bearer sess-abc");
  });
});

describe("T2.5 scoped device flows keep the explicit device header", () => {
  it("verifyDeviceToken attaches x-device-token explicitly (GET /auth/devices/me)", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    const fetchMock = mockFetchJson({ deviceId: "d1", householdId: "h1" });

    await verifyDeviceToken("dev-456");

    expect(lastHeaders(fetchMock)["x-device-token"]).toBe("dev-456");
  });

  it("registerDeviceToken authenticates via session and never leaks a stale device token", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    localStorage.setItem("pi-finance:token", "dev-stale");
    const fetchMock = mockFetchJson({ token: "dev-new", deviceId: "d1", householdId: "h1" }, 201);

    await registerDeviceToken("sess-123");

    const headers = lastHeaders(fetchMock);
    expect(headers["Authorization"]).toBe("Bearer sess-123");
    expect(headers["x-device-token"]).toBeUndefined();
  });

  it("explicit token option still attaches x-device-token (opt-in for scoped flows)", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    localStorage.clear();
    const fetchMock = mockFetchJson({ ok: true });

    await apiFetch("/auth/devices/me", { token: "dev-explicit" });

    expect(lastHeaders(fetchMock)["x-device-token"]).toBe("dev-explicit");
  });
});
