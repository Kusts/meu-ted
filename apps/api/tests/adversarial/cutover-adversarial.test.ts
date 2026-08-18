import { describe, it, expect } from "vitest";
import { evaluateCutoverReadiness } from "../../../../scripts/cutover-check.js";
import { runCanaryValidation } from "../../../../scripts/canary-validation.js";

describe("Cutover Adversarial Blocking", () => {
  it("blocks cutover when shadow divergence rate exceeds threshold (> 1%)", async () => {
    const report = await evaluateCutoverReadiness({
      divergenceRateOverride: 0.05, // 5% divergence
      maxDivergenceRate: 0.01,
    });

    expect(report.allPassed).toBe(false);
    const divCheck = report.checks.find((c) => c.id === "shadow-divergence-rate")!;
    expect(divCheck.passed).toBe(false);
  });

  it("blocks cutover when a capability is not targeting API mode", async () => {
    const report = await evaluateCutoverReadiness({
      mockCapModeOverride: {
        list_accounts: "disabled",
      },
    });

    expect(report.allPassed).toBe(false);
    const capCheck = report.checks.find((c) => c.id === "capabilities-api-mode")!;
    expect(capCheck.passed).toBe(false);
    expect(capCheck.details).toContain("list_accounts");
  });

  it("canary validation fails when divergence rate exceeds threshold", async () => {
    let callCount = 0;
    const result = await runCanaryValidation({
      maxDivergenceRate: 0.01,
      samplesPerCapability: 10,
      shadowRunnerFn: async () => {
        callCount++;
        // Produce 2 divergences out of every 10 calls (20% divergence)
        return { outcome: callCount % 5 === 0 ? "divergence" : "match" };
      },
    });

    expect(result.passed).toBe(false);
    expect(result.divergenceRate).toBeGreaterThan(0.01);
    expect(result.divergences).toBeGreaterThan(0);
  });
});
