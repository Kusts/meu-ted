import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/build-info/route";
import { getBuildInfo } from "@/lib/build-info";

describe("PWA release identity (V4.1 Task 9.9)", () => {
  it("falls back to dev markers when no build env is set", () => {
    expect(getBuildInfo({})).toEqual({ gitSha: "dev", buildId: "dev", builtAt: "dev" });
  });

  it("reflects injected build env when present", () => {
    expect(
      getBuildInfo({
        NEXT_PUBLIC_BUILD_SHA: "abc123",
        NEXT_PUBLIC_BUILD_ID: "99",
        NEXT_PUBLIC_BUILD_TIME: "2026-09-17T00:00:00Z",
      }),
    ).toEqual({ gitSha: "abc123", buildId: "99", builtAt: "2026-09-17T00:00:00Z" });
  });

  it("GET /api/build-info returns the three identity fields as non-empty strings", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const field of ["gitSha", "buildId", "builtAt"] as const) {
      expect(typeof body[field]).toBe("string");
      expect(body[field].length).toBeGreaterThan(0);
    }
  });
});
