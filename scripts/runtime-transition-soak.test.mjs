import { test } from "node:test";
import assert from "node:assert/strict";
import { runSoakAssessment, generateSampleSoakCorpus } from "./runtime-transition-soak.mjs";

test("runtime transition soak and rollback assessment", async (t) => {
  await t.test("evaluates sample corpus and passes all invariants", () => {
    const corpus = generateSampleSoakCorpus();
    const report = runSoakAssessment(corpus);

    assert.equal(report.allInvariantsPassed, true);
    assert.equal(report.duplicateResponseCount, 0);
    assert.equal(report.crossWorkspaceLeakCount, 0);
    assert.equal(report.unknownCapabilityCount, 0);
    assert.equal(report.rollbackExercised, true);
    assert.ok(report.stagesExercised.includes("pi_owner"));
    assert.ok(report.stagesExercised.includes("agent_owner_pi_read_fallback"));
  });

  await t.test("fails assessment when duplicate response is detected", () => {
    const corruptedCorpus = [
      {
        turnId: "t-dup",
        stage: "agent_owner",
        owner: "agent",
        workspaceId: "ws-1",
        capability: "list_accounts",
        status: "success",
        responseCount: 2, // duplicate response violation
        isRollback: true,
      },
    ];

    const report = runSoakAssessment(corruptedCorpus);
    assert.equal(report.allInvariantsPassed, false);
    assert.equal(report.duplicateResponseCount, 1);
  });

  await t.test("fails assessment when rollback is not exercised", () => {
    const noRollbackCorpus = [
      {
        turnId: "t-1",
        stage: "agent_owner",
        owner: "agent",
        workspaceId: "ws-1",
        capability: "list_accounts",
        status: "success",
        responseCount: 1,
        isRollback: false,
      },
    ];

    const report = runSoakAssessment(noRollbackCorpus);
    assert.equal(report.allInvariantsPassed, false);
    assert.equal(report.rollbackExercised, false);
  });
});
