import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("documentation facts contract", async (t) => {
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  const agents = fs.readFileSync(path.join(ROOT, "AGENTS.md"), "utf8");

  await t.test("README rejects stale historical falsehoods", () => {
    assert.doesNotMatch(readme, /Monorepo com 2 frentes ativas/i);
    assert.doesNotMatch(readme, /pnpm workspaces \(2 apps\)/i);
    assert.doesNotMatch(readme, /Toda a parte de domínio.*removidos/i);
  });

  await t.test("README accurately describes the current active apps and stack", () => {
    assert.ok(readme.includes("apps/api"));
    assert.ok(readme.includes("apps/pwa"));
    assert.ok(readme.includes("apps/agent"));
    assert.ok(readme.includes("Hostinger VPS"));
    assert.ok(readme.includes("Cloudflare"));
  });

  await t.test("AGENTS.md accurately declares canonical pointers and rules", () => {
    assert.ok(agents.includes("apps/pwa/"));
    assert.ok(agents.includes("Hostinger VPS"));
    assert.ok(agents.includes("../pi-finance-web"));
  });
});
