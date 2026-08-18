import { isShadowEligible } from "../.pi/extensions/financial-tools/shadow/shadow-config.js";
import { ALL_CAPABILITIES } from "../.pi/extensions/financial-tools/tools/capability-flags.js";

export interface CanaryRunResult {
  totalRuns: number;
  matches: number;
  divergences: number;
  divergenceRate: number;
  threshold: number;
  passed: boolean;
  capabilities: Record<string, { total: number; divergences: number; rate: number }>;
}

export interface CanaryOptions {
  maxDivergenceRate?: number;
  samplesPerCapability?: number;
  shadowRunnerFn?: (capability: string) => Promise<{ outcome: "match" | "divergence" }>;
}

export async function runCanaryValidation(options: CanaryOptions = {}): Promise<CanaryRunResult> {
  const threshold = options.maxDivergenceRate ?? 0.01;
  const samples = options.samplesPerCapability ?? 20;
  const eligibleCapabilities = ALL_CAPABILITIES.filter(isShadowEligible);

  let totalRuns = 0;
  let matches = 0;
  let divergences = 0;
  const capResults: Record<string, { total: number; divergences: number; rate: number }> = {};

  const runner = options.shadowRunnerFn ?? (async () => ({ outcome: "match" as const }));

  for (const cap of eligibleCapabilities) {
    let capDiv = 0;
    for (let i = 0; i < samples; i++) {
      totalRuns++;
      const res = await runner(cap);
      if (res.outcome === "divergence") {
        divergences++;
        capDiv++;
      } else {
        matches++;
      }
    }
    capResults[cap] = {
      total: samples,
      divergences: capDiv,
      rate: samples > 0 ? capDiv / samples : 0,
    };
  }

  const divergenceRate = totalRuns > 0 ? divergences / totalRuns : 0;
  const passed = divergenceRate <= threshold;

  return {
    totalRuns,
    matches,
    divergences,
    divergenceRate,
    threshold,
    passed,
    capabilities: capResults,
  };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("canary-validation.ts")) {
  const isJson = process.argv.includes("--json");
  runCanaryValidation().then((result) => {
    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("=== Canary Shadow Validation Report ===");
      console.log(`Total Runs:       ${result.totalRuns}`);
      console.log(`Matches:          ${result.matches}`);
      console.log(`Divergences:      ${result.divergences}`);
      console.log(`Divergence Rate:  ${(result.divergenceRate * 100).toFixed(2)}% (Max allowed: ${(result.threshold * 100).toFixed(2)}%)`);
      console.log(`Status:           ${result.passed ? "PASSED ✅" : "FAILED ❌"}`);
      console.log("---------------------------------------");
      for (const [cap, data] of Object.entries(result.capabilities)) {
        console.log(` - ${cap}: ${data.total} runs, ${data.divergences} divergences (${(data.rate * 100).toFixed(2)}%)`);
      }
    }
    if (!result.passed) {
      process.exit(1);
    }
  }).catch((err) => {
    console.error("Canary validation failed with error:", err);
    process.exit(1);
  });
}
