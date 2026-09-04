/**
 * RED → GREEN: live mutation must fail on any 4xx/5xx, not mask 401/403/429.
 * This is the gate required before hardening.
 * Covers helper at e2e/helpers/live-assert.ts via strict 2xx contract.
 */
import { describe, it, expect } from "vitest";
import {
  assertLiveSuccess,
  isLegacyBlocked,
  legacyAssertMasked,
} from "@/lib/live-assert";

describe("live-assert RED → GREEN", () => {
  it("strict assertLiveSuccess rejects all non-2xx (401,403,429,400,422,500)", () => {
    for (const status of [400, 401, 403, 409, 422, 429, 500, 502]) {
      expect(
        () => assertLiveSuccess({ status, ok: false, body: { code: "error" } }, "mutation"),
        `status ${status} should throw`
      ).toThrow(/expected 2xx but got/);
    }
  });

  it("strict assertLiveSuccess accepts 200 and 201", () => {
    expect(() => assertLiveSuccess({ status: 200, ok: true }, "ok")).not.toThrow();
    expect(() => assertLiveSuccess({ status: 201, ok: true }, "created")).not.toThrow();
  });

  it("legacy masking incorrectly swallows 403 as blocked (RED proof)", () => {
    expect(() => legacyAssertMasked({ status: 403, ok: false }, "legacy")).not.toThrow();
    expect(() => assertLiveSuccess({ status: 403, ok: false }, "strict")).toThrow();
  });

  it("legacy masking does not swallow 429, but strict still must", () => {
    expect(isLegacyBlocked(429)).toBe(false);
    expect(isLegacyBlocked(401)).toBe(false);
    expect(isLegacyBlocked(403)).toBe(true);
  });

  it("legacy vs strict diff for 400 (validation) — still must be strict", () => {
    expect(() => legacyAssertMasked({ status: 400, ok: false }, "legacy")).not.toThrow();
    expect(() => assertLiveSuccess({ status: 400, ok: false }, "strict")).toThrow();
  });
});
