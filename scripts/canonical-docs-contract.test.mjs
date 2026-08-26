import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CANONICAL_DOCS = [
  "docs/PRODUCT.md",
  "docs/ARCHITECTURE-CURRENT.md",
  "docs/ARCHITECTURE-TARGET.md",
  "docs/ROADMAP.md",
];

test("canonical documentation contract", async (t) => {
  for (const docRelPath of CANONICAL_DOCS) {
    await t.test(`validates canonical document: ${docRelPath}`, () => {
      const fullPath = path.join(ROOT, docRelPath);
      assert.ok(fs.existsSync(fullPath), `${docRelPath} must exist`);

      const content = fs.readFileSync(fullPath, "utf8");
      assert.ok(content.length > 200, `${docRelPath} must not be empty`);
      assert.match(content, /Last verified/i, `${docRelPath} must declare verification date`);
      assert.match(content, /runtime-facts\.json/i, `${docRelPath} must link to runtime facts`);
      assert.doesNotMatch(content, /\[INSERT\s+|TODO:|FIXME:|<placeholder>/i, `${docRelPath} must not contain placeholders`);
    });
  }
});
