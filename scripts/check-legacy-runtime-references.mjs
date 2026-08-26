#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const LEGACY_PATTERNS = [
  { name: "Evolution Webhook", pattern: /\/webhooks\/evolution/g, category: "rollback-only" },
  { name: "Bridge Subprocess", pattern: /AgentRunner|ProcessManager/g, category: "rollback-only" },
  { name: "Pi RPC Extension", pattern: /\.pi\/extensions\/financial-tools/g, category: "rollback-only" },
  { name: "Evolution Env Vars", pattern: /EVOLUTION_API_URL|EVOLUTION_API_KEY|EVOLUTION_INSTANCE/g, category: "secret-name" },
  { name: "Legacy Pi Web App", pattern: /\.\.\/pi-finance-web/g, category: "historical-doc" },
];

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

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const stageArg = process.argv.find((a) => a.startsWith("--stage="))?.split("=")[1] || "pre-retirement";
  const report = scanLegacyReferences({ stage: stageArg });
  console.log(`=== Legacy Runtime References Scan (${report.stage}) ===`);
  console.log(`Total References Found: ${report.totalFindings}`);
  console.log(`Active Runtime:         ${report.activeRuntimeCount}`);
  console.log(`Rollback-Only:          ${report.rollbackOnlyCount}`);
  console.log(`Secret Names:           ${report.secretNameCount}`);
  console.log(`Gate Evaluation:        ${report.passed ? "PASSED ✅" : "FAILED ❌"}`);
  if (!report.passed) {
    process.exit(1);
  }
}
