import { test } from "node:test";
import assert from "node:assert/strict";
import { lintAllDocumentation, lintMarkdownDocument } from "./lint-docs.mjs";

test("documentation linter", async (t) => {
  await t.test("passes on all canonical project documentation without broken links or placeholders", () => {
    const result = lintAllDocumentation();
    assert.equal(result.passed, true, `Doc lint failed with issues: ${result.issues.join(", ")}`);
    assert.equal(result.issues.length, 0);
  });
});
