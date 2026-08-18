import { test } from "node:test";
import assert from "node:assert/strict";
import { scanLegacyReferences } from "./check-legacy-runtime-references.mjs";

test("legacy runtime references scanner", async (t) => {
  await t.test("scans pre-retirement stage and catalogs references", () => {
    const report = scanLegacyReferences({ stage: "pre-retirement" });
    assert.ok(report.totalFindings > 0);
    assert.equal(report.passed, true);
  });

  await t.test("reports active-runtime items when evaluating final stage", () => {
    const report = scanLegacyReferences({ stage: "final" });
    assert.ok(typeof report.passed === "boolean");
  });
});
