import { describe, it, expect } from "vitest";
import { evaluateCutoverReadiness } from "../../../../scripts/cutover-check.js";
import { runCanaryValidation } from "../../../../scripts/canary-validation.js";

describe("Cutover Readiness Contract", () => {
  it("evaluates all cutover preconditions and passes under current codebase state", async () => {
    const report = await evaluateCutoverReadiness({
      divergenceRateOverride: 0.0,
    });

    expect(report.allPassed).toBe(true);
    expect(report.checks).toHaveLength(5);
    for (const check of report.checks) {
      expect(check.passed).toBe(true);
    }
  });

  it("canary validation passes when divergence rate is within threshold", async () => {
    const result = await runCanaryValidation({
      maxDivergenceRate: 0.01,
      samplesPerCapability: 5,
      shadowRunnerFn: async () => ({ outcome: "match" }),
    });

    expect(result.passed).toBe(true);
    expect(result.divergenceRate).toBe(0);
    expect(result.matches).toBe(result.totalRuns);
  });
});
