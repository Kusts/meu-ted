import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetch, isApiConfigured } from "./client";

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

  it("falls back to production API for the deployed worker hostname", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", undefined as unknown as string);
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      hostname: "pi-finance-pwa.walissonead.workers.dev",
    } as Location);

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await apiFetch("/auth/devices/register", { method: "POST" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.synkroo.com.br/auth/devices/register",
      expect.objectContaining({ method: "POST" }),
    );
    expect(isApiConfigured()).toBe(true);
  });
});
