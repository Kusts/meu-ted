#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLANS_DIR = path.join(ROOT, "docs", "superpowers", "plans");

export function checkActivePlans(dir = PLANS_DIR) {
  if (!fs.existsSync(dir)) return { valid: true, plans: [] };

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  const plans = [];

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const content = fs.readFileSync(fullPath, "utf8");
    const isMasterOrPhase = file.startsWith("2026-08-16-");
    plans.push({
      file,
      valid: isMasterOrPhase,
      hasGoal: content.includes("**Goal:**") || content.includes("# "),
    });
  }

  const allValid = plans.every((p) => p.valid && p.hasGoal);
  return {
    valid: allValid,
    total: plans.length,
    plans,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = checkActivePlans();
  console.log("=== Active Plan Status Check ===");
  console.log(`Total Active Plans: ${result.total}`);
  console.log(`All Valid:          ${result.valid ? "YES ✅" : "NO ❌"}`);
  if (!result.valid) {
    process.exit(1);
  }
}
