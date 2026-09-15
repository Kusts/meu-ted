/**
 * TED V3 real-model behavioral evals (SPEC §26) — vitest entry.
 *
 * Gate: real provider calls happen ONLY when TED_REAL_MODEL_EVAL=1. Without
 * the flag this suite is SKIPPED (exit 0), so `pnpm test` and CI never hit
 * the network. With the flag, it resolves the first working provider
 * (1-call smoke), executes the 10 SPEC §26 scenarios against the REAL model
 * through the REAL ConversationOrchestrator, and writes the pt-BR report.
 */

import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveRealModelProvider,
  runTedV3RealModelEvals,
  writeRealModelReport,
} from "../evals/ted-v3-real-model-suite.js";

const enabled = process.env.TED_REAL_MODEL_EVAL === "1";

describe.skipIf(!enabled)("TED V3 real-model evals (SPEC §26)", () => {
  it(
    "executes the 10 SPEC scenarios against the real model and writes the pt-BR report",
    async () => {
      const selection = await resolveRealModelProvider(
        process.env as Record<string, string | undefined>,
      );
      const report = await runTedV3RealModelEvals(selection);
      const reportPath = resolve(
        import.meta.dirname,
        "../evals/reports",
        `ted-v3-real-model-evals-${report.executedAt.slice(0, 10)}.md`,
      );
      await writeRealModelReport(report, reportPath);
      console.log(
        `TED V3 real-model: ${report.passed}/${report.total} passed — provider=${selection.kind} model=${selection.modelId} tokens(in/out)=${report.usage.inputTokens}/${report.usage.outputTokens}\nReport: ${reportPath}`,
      );
      for (const result of report.results) {
        if (!result.passed) {
          console.log(
            `FAIL ${result.id}: ${result.error ?? result.checks.filter((check) => !check.passed).map((check) => `${check.name} (${check.detail})`).join("; ")}`,
          );
        }
      }
      expect(
        report.failures.map(
          (failure) => `${failure.id}: ${failure.error ?? "checks failed"}`,
        ),
      ).toEqual([]);
    },
    900_000,
  );
});
