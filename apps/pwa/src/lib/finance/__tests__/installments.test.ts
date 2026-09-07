import { describe, expect, it } from "vitest";
import { splitInstallmentAmounts } from "../installments";

describe("splitInstallmentAmounts (L-01 contract, PWA mirror)", () => {
  it("splits evenly divisible totals into equal parcels", () => {
    expect(splitInstallmentAmounts(1200, 3)).toEqual([400, 400, 400]);
  });

  it("absorbs the remainder in the LAST parcel so parts sum to the total", () => {
    expect(splitInstallmentAmounts(1000, 3)).toEqual([333, 333, 334]);
  });

  it("holds for values that do not divide evenly across many parcels", () => {
    for (const [total, n] of [[10000, 3], [9999, 7], [1, 3], [100, 6], [123456, 12]] as const) {
      const parts = splitInstallmentAmounts(total, n);
      expect(parts).toHaveLength(n);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(new Set(parts.slice(0, -1)).size).toBeLessThanOrEqual(1);
    }
  });

  it("single parcel returns the total unchanged", () => {
    expect(splitInstallmentAmounts(1999, 1)).toEqual([1999]);
  });

  it("rejects invalid inputs", () => {
    expect(() => splitInstallmentAmounts(100.5, 3)).toThrow();
    expect(() => splitInstallmentAmounts(100, 0)).toThrow();
    expect(() => splitInstallmentAmounts(100, 49)).toThrow();
  });
});
