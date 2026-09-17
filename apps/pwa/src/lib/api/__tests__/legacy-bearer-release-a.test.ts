import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../client";
import { isLegacyBearerCompatEnabled } from "@/lib/auth/token-store";
import {
  clearLegacyAuthUsage,
  getLegacyAuthUsage,
} from "@/lib/auth/legacy-usage";

/**
 * V4.1 Phase 5 (§9.4 Release A — telemetry-gated shutdown, D11):
 * env correction + telemetry, bearer compatibility stays ON.
 * No behavior change: this file pins Release A (compat ON by default and
 * the local diagnostic counter works through apiFetch).
 */
describe("legacy bearer Release A pin (compat ON + local telemetry)", () => {
  beforeEach(() => {
    localStorage.clear();
    clearLegacyAuthUsage();
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("keeps bearer compatibility ON by default (Release A, Release B gated on D11)", () => {
    vi.stubEnv("NEXT_PUBLIC_LEGACY_BEARER_COMPAT", undefined as unknown as string);
    expect(isLegacyBearerCompatEnabled()).toBe(true);
  });

  it("counts the session fallback attach in the local diagnostic counter", async () => {
    localStorage.setItem("pi-finance:session-token", "sess-release-a");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await apiFetch("/workspaces");
    expect(getLegacyAuthUsage()).toEqual({ session: 1, device: 0 });
  });

  it("counts explicit scoped device attaches separately (never credential values)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await apiFetch("/auth/devices/me", { token: "dev-release-a" });
    const usage = getLegacyAuthUsage();
    expect(usage).toEqual({ session: 0, device: 1 });
    expect(localStorage.getItem("pi-finance:legacy-usage")).not.toContain("dev-release-a");
  });
});
