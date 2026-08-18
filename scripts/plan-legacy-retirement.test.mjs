import { test } from "node:test";
import assert from "node:assert/strict";
import { RETIREMENT_STAGES, generateChangeSetDocument } from "./plan-legacy-retirement.mjs";

test("legacy retirement planner", async (t) => {
  await t.test("defines exactly 7 sequenced stages with all required fields", () => {
    assert.equal(RETIREMENT_STAGES.length, 7);
    for (const stage of RETIREMENT_STAGES) {
      assert.ok(stage.stageNumber >= 1 && stage.stageNumber <= 7);
      assert.ok(stage.name, "Stage name required");
      assert.ok(stage.target, "Target required");
      assert.ok(stage.action, "Action required");
      assert.ok(stage.proof, "Proof command required");
      assert.ok(stage.rollback, "Rollback step required");
    }
  });

  await t.test("generates valid change-set document", () => {
    const doc = generateChangeSetDocument();
    assert.ok(doc.includes("G6 Legacy Retirement Staged Change-Set"));
    assert.ok(doc.includes("apps/whatsapp-bridge/"));
    assert.ok(doc.includes(".pi/extensions/financial-tools/"));
  });
});
