import assert from "node:assert/strict";
import test from "node:test";
import fixture from "./__fixtures__/pwa-audit-current.json" with { type: "json" };
import { formatBlockedFinding } from "./pwa-audit.mjs";

test("formats a blocked finding with its canonical audit record", () => {
  const record = fixture.vulnerabilities.sharp;

  assert.equal(
    formatBlockedFinding({ name: "sharp", reason: "no matching allowlist entry" }, fixture),
    `check-pwa-audit: BLOCKED sharp — no matching allowlist entry\n${JSON.stringify(record)}`,
  );
});
