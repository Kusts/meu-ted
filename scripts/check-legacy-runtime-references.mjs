#!/usr/bin/env node
/*
 * Legacy runtime references guard — Meu TED V4 hardening (T4.1).
 *
 * ARCHITECTURE CHECKS (ARCH-V4-06a / ARCH-V4-06b), NOT XLT (SPEC section 18,
 * note REV-V4-2): XLT tests cross >= 2 real runtime layers; these checks are
 * static source scans integrated into the validation gate (VAL-V4.9).
 *
 * - ARCH-V4-06a (PRE-condition for removal): external consumers = 0. No file
 *   OUTSIDE apps/agent/ may reference legacy WorkspaceAgent routes/symbols in
 *   production code. RED in T4.1 by design (PWA agent-client.ts still builds
 *   /agents/workspace/* URLs); turns GREEN in T4.2 when the PWA callers are
 *   migrated to the canonical /rpc/history routes. Test doubles (e2e, *.spec,
 *   *.test, __tests__) are NOT consumers: they are reported separately as
 *   informational and never make 06a pass/fail.
 * - ARCH-V4-06b (POST-condition of removal): forbidden static references = 0
 *   in the WHOLE repo, evaluated with an EMPTY allowlist. RED until T4.3
 *   removes the WorkspaceAgent runtime, its tests and scaffolding; any
 *   reappearance afterwards fails the gate.
 *
 * Temporary migration allowlist (scripts/legacy-runtime-allowlist.json):
 * versioned entries {path, pattern, reason, owner, expiresAt ISO}. The gate
 * FAILS when any entry is expired (date checked at run time), so the
 * allowlist can never become permanent silently. The allowlist documents
 * approved migration exceptions and powers the anti-regression rule (no NEW
 * uncovered external reference); it does NOT turn 06a green — only consumer
 * count 0 (T4.2) does that.
 *
 * Scan scope: static references in code/config files repo-wide, excluding
 * node_modules, .git, build outputs (.open-next, .next, dist, build,
 * coverage), docs/** (historical SPEC/V4 docs legitimately name the retired
 * runtime; doc contradictions belong to the I5 check, T4.4), this script
 * itself, the guard's own tests, and the allowlist file.
 *
 * Usage:
 *   node scripts/check-legacy-runtime-references.mjs [--check=06a|06b|all]
 *     [--allowlist=<path>] [--now=<ISO instant>] [--json] [--stage=<stage>]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF_RELATIVE = "scripts/check-legacy-runtime-references.mjs";
const DEFAULT_ALLOWLIST_RELATIVE = "scripts/legacy-runtime-allowlist.json";

export const LEGACY_PATTERNS = [
  { name: "Evolution Webhook", pattern: /\/webhooks\/evolution/g, category: "rollback-only" },
  { name: "Bridge Subprocess", pattern: /AgentRunner|ProcessManager/g, category: "rollback-only" },
  { name: "Pi RPC Extension", pattern: /\.pi\/extensions\/financial-tools/g, category: "rollback-only" },
  { name: "Evolution Env Vars", pattern: /EVOLUTION_API_URL|EVOLUTION_API_KEY|EVOLUTION_INSTANCE/g, category: "secret-name" },
  { name: "Legacy Pi Web App", pattern: /\.\.\/pi-finance-web/g, category: "historical-doc" },
];

/** WorkspaceAgent decommission patterns (T4.1, SPEC section 11 E3). */
export const WORKSPACE_AGENT_PATTERNS = [
  { name: "WorkspaceAgent", pattern: /\bWorkspaceAgent\b/ },
  { name: "/agents/workspace/", pattern: /\/agents\/workspace\// },
  { name: "env.AGENT", pattern: /\benv\.AGENT\b/ },
  { name: "syncLegacyHistory", pattern: /\bsyncLegacyHistory\b/ },
  { name: "LegacyAgentStub", pattern: /\bLegacyAgentStub\b/ },
];

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json", ".jsonc"]);
const EXCLUDED_DIRS = new Set(["node_modules", ".git", ".open-next", ".next", "dist", "build", "coverage", "docs"]);
const EXCLUDED_FILES = new Set([
  SELF_RELATIVE,
  "scripts/check-legacy-runtime-references.test.mjs",
  "scripts/check-workspace-agent-guard.test.mjs",
  DEFAULT_ALLOWLIST_RELATIVE,
]);
const AGENT_DIR_PREFIX = "apps/agent/";
const TEST_DOUBLE_RE = /(^|\/)(e2e|__tests__)(?:\/|$)|\.(spec|test)\.[^.]+$/;

export function scanLegacyReferences(options = {}) {
  const stage = options.stage ?? "pre-retirement";
  const findings = [];

  const checkFiles = [
    "apps/whatsapp-bridge/src/server.ts",
    "apps/whatsapp-bridge/src/agent-runner.ts",
    "apps/whatsapp-bridge/src/process-manager.ts",
    ".pi/extensions/financial-tools/index.ts",
    "docs/ops/vps-access.md",
    "docs/architecture/runtime-ownership-matrix.md",
  ];

  for (const relativePath of checkFiles) {
    const fullPath = path.join(ROOT, relativePath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, "utf8");

    for (const item of LEGACY_PATTERNS) {
      if (item.pattern.test(content)) {
        findings.push({
          item: item.name,
          category: item.category,
          path: relativePath,
          stage,
          blocksGate: stage === "final" && item.category === "active-runtime",
        });
      }
    }
  }

  const activeRuntimeCount = findings.filter((f) => f.category === "active-runtime").length;
  const secretNameCount = findings.filter((f) => f.category === "secret-name").length;
  const rollbackOnlyCount = findings.filter((f) => f.category === "rollback-only").length;

  return {
    stage,
    totalFindings: findings.length,
    activeRuntimeCount,
    secretNameCount,
    rollbackOnlyCount,
    findings,
    passed: stage === "final" ? activeRuntimeCount === 0 && secretNameCount === 0 : true,
  };
}

function toRepoRelative(fullPath, root = ROOT) {
  return path.relative(root, fullPath).split(path.sep).join("/");
}

function isScannableFile(relativePath) {
  if (EXCLUDED_FILES.has(relativePath)) return false;
  const segments = relativePath.split("/");
  if (segments.some((segment) => EXCLUDED_DIRS.has(segment))) return false;
  return SCAN_EXTENSIONS.has(path.extname(relativePath));
}

function walkFiles(dir, root, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const rel = toRepoRelative(full, root);
      if (rel.split("/").some((segment) => EXCLUDED_DIRS.has(segment))) continue;
      walkFiles(full, root, out);
    } else if (entry.isFile()) {
      const rel = toRepoRelative(full, root);
      if (isScannableFile(rel)) out.push({ full, rel });
    }
  }
  return out;
}

function parseInstant(value, fallback) {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Load the temporary migration allowlist. Never throws: a missing file means
 * "no exceptions approved"; a malformed file is reported and fails the gate.
 */
export function loadAllowlist(allowlistPath = path.join(ROOT, DEFAULT_ALLOWLIST_RELATIVE), now = new Date()) {
  const nowMs = parseInstant(now, Date.now());
  if (!fs.existsSync(allowlistPath)) {
    return { path: toRepoRelative(allowlistPath), entries: [], expiredEntries: [], missing: true, malformed: null, now: new Date(nowMs).toISOString() };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
    const entries = Array.isArray(raw.entries) ? raw.entries : [];
    const expiredEntries = entries.filter((entry) => parseInstant(entry.expiresAt, Number.POSITIVE_INFINITY) <= nowMs);
    return { path: toRepoRelative(allowlistPath), entries, expiredEntries, missing: false, malformed: null, now: new Date(nowMs).toISOString() };
  } catch (err) {
    return { path: toRepoRelative(allowlistPath), entries: [], expiredEntries: [], missing: false, malformed: String(err?.message ?? err), now: new Date(nowMs).toISOString() };
  }
}

/** True when a valid (unexpired) allowlist entry covers this exact finding. */
export function isCoveredByAllowlist(finding, entries, now = new Date()) {
  const nowMs = parseInstant(now, Date.now());
  return (entries ?? []).some(
    (entry) =>
      entry.path === finding.path &&
      (entry.pattern === finding.pattern || entry.pattern === "*") &&
      parseInstant(entry.expiresAt, Number.NEGATIVE_INFINITY) > nowMs,
  );
}

/**
 * Anti-regression gate over external findings: passes only when every finding
 * is covered by a valid allowlist entry AND no allowlist entry is expired.
 * An expired entry fails the gate even if it lists the finding.
 */
export function evaluateAllowlistGate(findings, allowlist, now = new Date()) {
  const entries = allowlist?.entries ?? [];
  const expiredEntries = allowlist?.expiredEntries ?? [];
  const uncovered = (findings ?? []).filter((finding) => !isCoveredByAllowlist(finding, entries, now));
  const malformed = allowlist?.malformed ?? null;
  return {
    passed: malformed === null && expiredEntries.length === 0 && uncovered.length === 0,
    malformed,
    expiredEntries,
    uncovered,
  };
}

/**
 * Scan the repo for WorkspaceAgent legacy references and evaluate
 * ARCH-V4-06a (external consumers, pre-removal) and ARCH-V4-06b (whole repo,
 * post-removal, empty allowlist).
 */
export function scanWorkspaceAgentReferences(options = {}) {
  const root = options.root ?? ROOT;
  const nowMs = parseInstant(options.now ?? new Date(), Date.now());
  const now = new Date(nowMs);
  const allowlist =
    options.allowlist ?? loadAllowlist(options.allowlistPath ?? path.join(root, DEFAULT_ALLOWLIST_RELATIVE), now);

  const files = walkFiles(root, root, []);
  const findings = [];
  for (const { full, rel } of files) {
    let content;
    try {
      content = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    lines.forEach((line, index) => {
      for (const item of WORKSPACE_AGENT_PATTERNS) {
        if (item.pattern.test(line)) {
          findings.push({ path: rel, line: index + 1, pattern: item.name, text: line.trim().slice(0, 160) });
        }
      }
    });
  }
  findings.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line));

  const externalFindings = findings.filter(
    (finding) => !finding.path.startsWith(AGENT_DIR_PREFIX) && !TEST_DOUBLE_RE.test(finding.path),
  );
  const testDoubles = findings.filter(
    (finding) => !finding.path.startsWith(AGENT_DIR_PREFIX) && TEST_DOUBLE_RE.test(finding.path),
  );
  const internalFindings = findings.filter((finding) => finding.path.startsWith(AGENT_DIR_PREFIX));

  const allowlistGate = evaluateAllowlistGate(externalFindings, allowlist, now);

  const check06a = {
    id: "ARCH-V4-06a",
    description: "External consumers of legacy WorkspaceAgent routes/symbols = 0 (pre-condition for removal; green in T4.2)",
    passed: externalFindings.length === 0,
    totalExternal: externalFindings.length,
    coveredByAllowlist: externalFindings.length - allowlistGate.uncovered.length,
    uncovered: allowlistGate.uncovered,
    findings: externalFindings,
  };
  const check06b = {
    id: "ARCH-V4-06b",
    description: "Forbidden WorkspaceAgent static references = 0 repo-wide with empty allowlist (post-condition; green in T4.3)",
    passed: findings.length === 0,
    total: findings.length,
    internal: internalFindings.length,
    external: externalFindings.length,
    testDoubles: testDoubles.length,
    findings,
  };

  return {
    evaluatedAt: now.toISOString(),
    allowlist: { path: allowlist.path, entries: allowlist.entries.length, expired: allowlist.expiredEntries, missing: allowlist.missing, malformed: allowlist.malformed },
    allowlistGate: { passed: allowlistGate.passed, uncovered: allowlistGate.uncovered.length },
    check06a,
    check06b,
    testDoubles,
    passed: check06a.passed && check06b.passed,
  };
}

function printWorkspaceReport(report) {
  console.log("=== WorkspaceAgent Decommission Guards (ARCH-V4-06a/b) ===");
  console.log(`Evaluated at: ${report.evaluatedAt}`);
  console.log(`Allowlist: ${report.allowlist.path} (entries: ${report.allowlist.entries})`);
  if (report.allowlist.missing) console.log("Allowlist file MISSING: no migration exceptions approved.");
  if (report.allowlist.malformed) console.log(`Allowlist MALFORMED: ${report.allowlist.malformed}`);
  if (report.allowlist.expired.length > 0) {
    console.log(`Expired allowlist entries (${report.allowlist.expired.length}):`);
    for (const entry of report.allowlist.expired) console.log(`  - ${entry.path} :: ${entry.pattern} (expired ${entry.expiresAt})`);
  }
  console.log("");
  console.log(`[${report.check06a.id}] ${report.check06a.description}`);
  console.log(`  External consumer references: ${report.check06a.totalExternal} (covered by valid allowlist: ${report.check06a.coveredByAllowlist})`);
  for (const finding of report.check06a.findings) {
    const covered = report.check06a.uncovered.includes(finding) ? "UNCOVERED" : "allowlisted";
    console.log(`  - ${finding.path}:${finding.line} [${finding.pattern}] (${covered}) :: ${finding.text}`);
  }
  console.log(`  Result: ${report.check06a.passed ? "PASSED ✅" : "FAILED ❌"}`);
  console.log("");
  console.log(`[${report.check06b.id}] ${report.check06b.description}`);
  console.log(`  Total references repo-wide: ${report.check06b.total} (internal apps/agent: ${report.check06b.internal}, external: ${report.check06b.external}, test doubles: ${report.check06b.testDoubles})`);
  console.log(`  Result: ${report.check06b.passed ? "PASSED ✅" : "FAILED ❌"}`);
  if (report.testDoubles.length > 0) {
    console.log("  External test doubles (informational, not consumers):");
    for (const finding of report.testDoubles) console.log(`  - ${finding.path}:${finding.line} [${finding.pattern}]`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const arg = (prefix) => process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
  const asJson = process.argv.includes("--json");
  const checkFilter = arg("--check=") ?? "all";
  const allowlistPath = arg("--allowlist=") ?? path.join(ROOT, DEFAULT_ALLOWLIST_RELATIVE);
  const now = arg("--now=") ?? new Date();
  const stageArg = arg("--stage=") ?? "pre-retirement";

  const legacy = scanLegacyReferences({ stage: stageArg });
  const workspace = scanWorkspaceAgentReferences({ allowlistPath, now });

  const selected =
    checkFilter === "06a"
      ? workspace.check06a.passed
      : checkFilter === "06b"
        ? workspace.check06b.passed
        : workspace.passed;

  if (asJson) {
    console.log(JSON.stringify({ legacy, workspace }, null, 2));
  } else {
    console.log(`=== Legacy Runtime References Scan (${legacy.stage}) ===`);
    console.log(`Total References Found: ${legacy.totalFindings}`);
    console.log(`Active Runtime:         ${legacy.activeRuntimeCount}`);
    console.log(`Rollback-Only:          ${legacy.rollbackOnlyCount}`);
    console.log(`Secret Names:           ${legacy.secretNameCount}`);
    console.log(`Gate Evaluation:        ${legacy.passed ? "PASSED ✅" : "FAILED ❌"}`);
    console.log("");
    printWorkspaceReport(workspace);
  }
  if (!selected) {
    process.exit(1);
  }
}
