#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INVENTORY_PATH = path.join(ROOT, "docs", "architecture", "tool-capability-inventory.md");

export function parseCapabilityInventory(markdown) {
  const lines = markdown.split("\n");
  const rows = [];

  for (const line of lines) {
    if (line.includes("| CAP-")) {
      const cells = line.split("|").map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
      if (cells.length >= 10) {
        rows.push({
          id: cells[0],
          tool: cells[1].replace(/`/g, ""),
          semantic: cells[2],
          persona: cells[3],
          frequency: cells[4],
          risk: cells[5],
          api: cells[6],
          ui: cells[7],
          destination: cells[8],
          coverage: cells[9],
          kind: cells[10] || "query",
          method: cells[11] || "GET",
          path: cells[12] || "",
          status: cells[17] || "planned",
        });
      }
    }
  }

  return rows;
}

export function evaluateCapabilityAcceptance(inventoryMarkdown = fs.readFileSync(INVENTORY_PATH, "utf8")) {
  const rows = parseCapabilityInventory(inventoryMarkdown);
  const results = [];

  for (const row of rows) {
    const isApiMode = row.status === "api";
    const isWrite = row.kind === "command" || row.method !== "GET";

    const hasApiRoute = row.api !== "—" && !row.api.startsWith("No ");
    const hasToolFacade = Boolean(row.tool && row.tool !== "—");
    const hasIdempotencyIfWrite = !isWrite || (row.kind === "command" && hasApiRoute);

    const reasons = [];
    if (isApiMode && !hasApiRoute) reasons.push("Missing API route definition");
    if (isApiMode && !hasToolFacade) reasons.push("Missing registered tool facade");

    const passed = reasons.length === 0;
    const decision = isApiMode
      ? (passed ? "ready-for-human" : "missing-evidence")
      : "approved";

    results.push({
      id: row.id,
      tool: row.tool,
      kind: row.kind || "query",
      status: row.status || "planned",
      passed,
      decision,
      evidence: {
        hasApiRoute,
        hasToolFacade,
        hasIdempotencyIfWrite,
      },
      reasons,
    });
  }

  const apiModeCount = results.filter((r) => r.status === "api").length;
  const readyCount = results.filter((r) => r.decision === "ready-for-human").length;
  const approvedCount = results.filter((r) => r.decision === "approved").length;
  const allValid = results.every((r) => r.passed);

  return {
    total: results.length,
    apiModeCount,
    readyCount,
    approvedCount,
    results,
    allValid,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const assessment = evaluateCapabilityAcceptance();
  console.log("=== Capability Acceptance Assessment ===");
  console.log(`Total Capabilities:  ${assessment.total}`);
  console.log(`API Mode Rows:       ${assessment.apiModeCount}`);
  console.log(`Ready for Human:     ${assessment.readyCount}`);
  console.log(`All Valid:           ${assessment.allValid ? "YES ✅" : "NO ❌"}`);
  if (!assessment.allValid) {
    console.error("Missing evidence in capabilities:");
    for (const r of assessment.results.filter((res) => !res.passed)) {
      console.error(` - ${r.id} (${r.tool}): ${r.reasons.join(", ")}`);
    }
    process.exit(1);
  }
}
