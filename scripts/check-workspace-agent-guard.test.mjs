import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scanWorkspaceAgentReferences,
  evaluateAllowlistGate,
  isCoveredByAllowlist,
  WORKSPACE_AGENT_PATTERNS,
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

  await t.test("(d) 06a reports zero external consumers after the T4.2 migration (contract change)", () => {
    // T4.2 (SPEC §11 E2): the PWA callers were migrated to the canonical
    // FinanceChatAgent /rpc/history routes and the legacy helpers
    // (agentRequestUrl/agentHistoryUrl) were REMOVED from agent-client.ts.
    // Consumers external = 0, so 06a PASSES with an empty allowlist.
    // Previous golden list (T4.1, 2 hits at :336/:341, passed=false) is
    // superseded — kept in git history, not renewed.
    const report = scanWorkspaceAgentReferences({ now: NOW });
    assert.deepEqual(report.check06a.findings, []);
    assert.equal(report.check06a.totalExternal, 0);
    assert.equal(report.check06a.passed, true);
  });

  await t.test("(e) 06b with empty allowlist passes in the post-removal state (contract change)", () => {
    // T4.3 (SPEC §11 E3/E5, ADR-016): the WorkspaceAgent runtime, its tests
    // and scaffolding were removed. The single remaining historical DO
    // migration tag (apps/agent/wrangler.jsonc v1 new_sqlite_classes) is
    // preserved per Cloudflare rules and covered by the narrow
    // isDoMigrationTagLine exemption; the I5 contract literals are assembled
    // at runtime (xlt-06 pattern) so the guard finds zero static references.
    // Previous golden (pre-removal total > 0, passed=false) is superseded —
    // kept in git history, not renewed.
    // FIX-FINAL-3: this is a REAL pass, not the T4.3 false-PASS — the
    // patterns below (f) now also match camelCase-interior and SNAKE_CASE
    // residue, and the schema.ts residue that escaped them was removed.
    const report = scanWorkspaceAgentReferences({
      now: NOW,
      allowlist: allowlistOf([]),
    });
    assert.deepEqual(report.check06b.findings, []);
    assert.equal(report.check06b.total, 0);
    assert.equal(report.check06b.passed, true);
  });

  await t.test("(f) 06b patterns catch camelCase-interior and SNAKE_CASE residue (FIX-FINAL-3, no false-PASS)", () => {
    // Regression: /\bWorkspaceAgent\b/ never matched
    // "initializeWorkspaceAgentSchema" (no word boundary inside camelCase)
    // nor "WORKSPACE_AGENT_SCHEMA_V1" (underscores, different case), so 06b
    // reported PASS with residue still in apps/agent/src/schema.ts.
    const matches = (line) => WORKSPACE_AGENT_PATTERNS.filter((item) => item.pattern.test(line)).map((item) => item.name);
    assert.ok(matches("export function initializeWorkspaceAgentSchema(sql: SqlExecutor): void {").includes("WorkspaceAgent"));
    assert.ok(matches("export const WORKSPACE_AGENT_SCHEMA_V1 = [").includes("WORKSPACE_AGENT"));
    assert.ok(matches("for (const statement of WORKSPACE_AGENT_SCHEMA_V1) sql.exec(statement);").includes("WORKSPACE_AGENT"));
    assert.ok(matches("class WorkspaceAgent extends Agent {}").includes("WorkspaceAgent"));
    assert.deepEqual(matches("export function backfillTranscript(sql: SqlExecutor): void {"), []);
    assert.deepEqual(matches("export function initializeMemorySchema(sql: MemorySql): void {"), []);
  });
});
