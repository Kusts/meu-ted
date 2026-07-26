import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/pwa-ci.yml"), "utf8");

describe("PWA CI audit trigger", () => {
  it("watches the scoped audit script it executes", () => {
    expect(workflow).toContain('"scripts/pwa-audit.mjs"');
    expect(workflow).not.toContain('"scripts/check-pwa-audit.mjs"');
  });
});
