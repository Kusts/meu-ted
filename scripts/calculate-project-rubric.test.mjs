import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateProjectRubric, RUBRIC_DIMENSIONS, generateRubricMarkdown } from "./calculate-project-rubric.mjs";

test("project rubric calculator", async (t) => {
  await t.test("verifies dimension weights sum to exactly 100", () => {
    const sum = RUBRIC_DIMENSIONS.reduce((acc, dim) => acc + dim.weight, 0);
    assert.equal(sum, 100);
  });

  await t.test("approves program when score is >= 90 and zero vetoes", () => {
    const perfectScores = {
      "DIM.1": 15,
      "DIM.2": 15,
      "DIM.3": 15,
      "DIM.4": 15,
      "DIM.5": 15,
      "DIM.6": 10,
      "DIM.7": 10,
      "DIM.8": 5,
    };
    const rubric = evaluateProjectRubric(perfectScores, []);
    assert.equal(rubric.totalScore, 100);
    assert.equal(rubric.isApproved, true);
    assert.equal(rubric.hasVeto, false);
  });

  await t.test("rejects program if any veto is triggered even with 100 score", () => {
    const perfectScores = {
      "DIM.1": 15,
      "DIM.2": 15,
      "DIM.3": 15,
      "DIM.4": 15,
      "DIM.5": 15,
      "DIM.6": 10,
      "DIM.7": 10,
      "DIM.8": 5,
    };
    const rubric = evaluateProjectRubric(perfectScores, ["Direct SQL query detected"]);
    assert.equal(rubric.totalScore, 100);
    assert.equal(rubric.isApproved, false);
    assert.equal(rubric.hasVeto, true);
  });

  await t.test("generates markdown document with required sections", () => {
    const rubric = evaluateProjectRubric(
      {
        "DIM.1": 15,
        "DIM.2": 15,
        "DIM.3": 15,
        "DIM.4": 15,
        "DIM.5": 15,
        "DIM.6": 10,
        "DIM.7": 10,
        "DIM.8": 5,
      },
      []
    );
    const md = generateRubricMarkdown(rubric);
    assert.ok(md.includes("Project Final Assessment Rubric"));
    assert.ok(md.includes("100 / 100"));
    assert.ok(md.includes("APROVADO"));
  });
});
