import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scanWorkspaceAgentReferences,
  evaluateAllowlistGate,
  isCoveredByAllowlist,
} from "./check-legacy-runtime-references.mjs";

const NOW = new Date("2026-09-16T12:00:00.000Z");
const FUTURE = "2026-09-23T23:59:59.000Z";
const PAST = "2026-09-01T00:00:00.000Z";

const finding = (overrides = {}) => ({
  path: "apps/pwa/src/lib/api/agent-client.ts",
  line: 336,
  pattern: "/agents/workspace/",
  text: "return `${baseUrl}/agents/workspace/...`;",
  ...overrides,
});

const allowlistOf = (entries) => ({
  path: "scripts/legacy-runtime-allowlist.json",
  entries,
  expiredEntries: entries.filter((entry) => Date.parse(entry.expiresAt) <= NOW.getTime()),
  missing: false,
  malformed: null,
  now: NOW.toISOString(),
});

test("workspace-agent decommission guard (ARCH-V4-06a/b)", async (t) => {
  await t.test("(a) new reference outside the allowlist fails the anti-regression gate", () => {
    const gate = evaluateAllowlistGate(
      [finding({ path: "apps/pwa/src/lib/api/new-consumer.ts", line: 10 })],
      allowlistOf([
        { path: "apps/pwa/src/lib/api/agent-client.ts", pattern: "/agents/workspace/", reason: "migration", owner: "planner", expiresAt: FUTURE },
      ]),
      NOW,
    );
    assert.equal(gate.passed, false);
    assert.equal(gate.uncovered.length, 1);
  });

  await t.test("(b) expired allowlist entry fails the gate even when listed", () => {
    const entries = [
      { path: "apps/pwa/src/lib/api/agent-client.ts", pattern: "/agents/workspace/", reason: "migration", owner: "planner", expiresAt: PAST },
    ];
    assert.equal(isCoveredByAllowlist(finding(), entries, NOW), false);
    const gate = evaluateAllowlistGate([finding()], allowlistOf(entries), NOW);
    assert.equal(gate.passed, false);
    assert.equal(gate.expiredEntries.length, 1);
  });

  await t.test("(c) valid allowlist entry covering the finding passes the anti-regression gate", () => {
    const entries = [
      { path: "apps/pwa/src/lib/api/agent-client.ts", pattern: "/agents/workspace/", reason: "migration", owner: "planner", expiresAt: FUTURE },
    ];
    assert.equal(isCoveredByAllowlist(finding(), entries, NOW), true);
    const gate = evaluateAllowlistGate([finding()], allowlistOf(entries), NOW);
    assert.equal(gate.passed, true);
  });

  await t.test("(d) 06a reports exactly the current external consumers (golden list)", () => {
    // Baseline mapping (plan T4.1): SPEC baseline agent-client.ts:330,335
    // (route literals) + :607 (transitive caller via agentHistoryUrl). Current
    // HEAD: literals at :336/:341; callers at :585/:593/:602 reference the
    // helper, not the route literal, so the static scan reports 2 hits.
    const report = scanWorkspaceAgentReferences({ now: NOW });
    const externalPaths = [...new Set(report.check06a.findings.map((f) => f.path))];
    assert.deepEqual(externalPaths, ["apps/pwa/src/lib/api/agent-client.ts"]);
    assert.deepEqual(
      report.check06a.findings.map((f) => f.line),
      [336, 341],
    );
    assert.ok(report.check06a.findings.every((f) => f.pattern === "/agents/workspace/"));
    assert.equal(report.check06a.totalExternal, 2);
    assert.equal(report.check06a.coveredByAllowlist, 2);
    assert.equal(report.check06a.passed, false);
  });

  await t.test("(e) 06b with empty allowlist fails in the pre-removal state", () => {
    const report = scanWorkspaceAgentReferences({
      now: NOW,
      allowlist: allowlistOf([]),
    });
    assert.ok(report.check06b.total > 0);
    assert.equal(report.check06b.passed, false);
  });
});
