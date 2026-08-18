import { test } from "node:test";
import assert from "node:assert/strict";
import { runFinalValidation, executeValidationGate, generateFinalValidationMarkdown } from "./run-final-validation.mjs";

test("final validation runner", async (t) => {
  await t.test("executes mock gates and passes when all exit 0", () => {
    const mockGates = [
      { id: "VAL.1", name: "Mock 1", command: "echo 1" },
      { id: "VAL.2", name: "Mock 2", command: "echo 2" },
    ];
    const mockExecutor = () => "ok";

    const report = runFinalValidation(mockGates, mockExecutor);
    assert.equal(report.allPassed, true);
    assert.equal(report.passedGates, 2);
    assert.equal(report.failedGates, 0);
  });

  await t.test("fails closed immediately on first failing gate", () => {
    const mockGates = [
      { id: "VAL.1", name: "Mock 1", command: "echo 1" },
      { id: "VAL.2", name: "Mock 2", command: "fail" },
      { id: "VAL.3", name: "Mock 3", command: "echo 3" },
    ];
    const mockExecutor = (_shell, args) => {
      if (args[1] === "fail") {
        const err = new Error("Command failed");
        err.status = 1;
        throw err;
      }
      return "ok";
    };

    const report = runFinalValidation(mockGates, mockExecutor);
    assert.equal(report.allPassed, false);
    assert.equal(report.executedGates, 2); // stopped at VAL.2
    assert.equal(report.failedGates, 1);
  });

  await t.test("generates markdown document from report", () => {
    const md = generateFinalValidationMarkdown({
      evaluatedAt: "2026-08-18T00:00:00.000Z",
      allPassed: true,
      totalGates: 1,
      passedGates: 1,
      failedGates: 0,
      results: [
        {
          id: "VAL.1",
          name: "Mock",
          command: "echo",
          startedAt: "2026-08-18T00:00:00.000Z",
          endedAt: "2026-08-18T00:00:01.000Z",
          exitCode: 0,
          status: "PASSED",
          summary: "success",
        },
      ],
    });
    assert.ok(md.includes("Final Project Validation Report"));
    assert.ok(md.includes("VAL.1"));
  });
});
