import assert from "node:assert/strict";
import test from "node:test";
import fixture from "./__fixtures__/pwa-audit-current.json" with { type: "json" };

test("current fixture contains vulnerability records", () => {
  assert.ok(Object.keys(fixture.vulnerabilities).length > 0);
});
