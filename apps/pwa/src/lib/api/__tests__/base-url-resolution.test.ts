import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, isApiConfigured, resolveApiBaseUrl } from "../client";

/**
 * V4.1 Phase 5 (Tasks 5.7–5.8, SPEC §12.6): the browser default is the
 * same-origin proxy /api/backend. Resolution order:
 * explicit override > NEXT_PUBLIC static > same-origin default.
 * No production hostname is an architectural dependency.
 */
describe("base-url resolution order (SPEC §12.6)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("prefers an explicit override over everything", () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://env.example.com");
    expect(resolveApiBaseUrl("https://explicit.example.com")).toBe("https://explicit.example.com");
  });

  it("uses the static NEXT_PUBLIC env when no explicit override is given", () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://env.example.com");
    expect(resolveApiBaseUrl()).toBe("https://env.example.com");
  });

  it("defaults to the same-origin proxy in the browser without env", () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "");
    expect(resolveApiBaseUrl()).toBe("/api/backend");
    expect(isApiConfigured()).toBe(true);
  });

  it("fetches through the same-origin proxy by default in the browser", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await apiFetch("/workspaces");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/workspaces",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("reports an SSR (no-window) context without env as unconfigured", () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "");
    const realWindow = globalThis.window;
    vi.stubGlobal("window", undefined);
    try {
      expect(resolveApiBaseUrl()).toBeUndefined();
      expect(isApiConfigured()).toBe(false);
    } finally {
      vi.stubGlobal("window", realWindow);
    }
  });
});
