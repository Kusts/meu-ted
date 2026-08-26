#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RETIREMENT_STAGES = [
  {
    stageNumber: 1,
    name: "Disable Evolution Webhook Ingress",
    target: "Evolution API webhook routing",
    action: "Remove webhook subscription to POST /webhooks/evolution",
    proof: "curl -X POST https://api.../webhooks/evolution returns 404 or inactive",
    rollback: "Re-enable webhook subscription pointing to bridge URL",
  },
  {
    stageNumber: 2,
    name: "Observe Agent Owner",
    target: "Runtime ownership router & Cloudflare Agent Worker",
    action: "Verify 100% of user traffic routes through PWA / Agent Worker with zero bridge traffic",
    proof: "npx tsx scripts/canary-validation.ts && npx tsx scripts/cutover-check.ts",
    rollback: "Set FINANCE_RUNTIME_STAGE=pi_owner",
  },
  {
    stageNumber: 3,
    name: "Stop and Remove Bridge Service",
    target: "whatsapp-bridge process / container",
    action: "docker compose stop whatsapp-bridge && docker compose rm -f whatsapp-bridge",
    proof: "docker ps | grep -v whatsapp-bridge",
    rollback: "docker compose up -d whatsapp-bridge",
  },
  {
    stageNumber: 4,
    name: "Remove Bridge Source Code",
    target: "apps/whatsapp-bridge/",
    action: "git rm -r apps/whatsapp-bridge",
    proof: "test ! -d apps/whatsapp-bridge",
    rollback: "git checkout HEAD~1 -- apps/whatsapp-bridge",
  },
  {
    stageNumber: 5,
    name: "Archive Financial Tools Extension",
    target: ".pi/extensions/financial-tools/",
    action: "Archive to git tag pre-g6-legacy-retirement and remove active workspace folder",
    proof: "node scripts/check-legacy-runtime-references.mjs --stage=final",
    rollback: "git checkout pre-g6-legacy-retirement -- .pi/extensions/financial-tools",
  },
  {
    stageNumber: 6,
    name: "Remove Residual Configs & Dependencies",
    target: "pnpm-workspace.yaml, package.json scripts",
    action: "Remove bridge workspace reference and obsolete build scripts",
    proof: "pnpm install && pnpm build",
    rollback: "git checkout HEAD~1 -- pnpm-workspace.yaml package.json",
  },
  {
    stageNumber: 7,
    name: "Rotate / Retire External API Secrets",
    target: "Evolution API keys in external secret stores",
    action: "Revoke EVOLUTION_API_KEY from Evolution instance; delete from VPS environment",
    proof: "pnpm security:secrets",
    rollback: "Generate new API key in Evolution instance if needed",
  },
];

export function generateChangeSetDocument() {
  return `# G6 Legacy Retirement Staged Change-Set

This document specifies the exact dry-run change-set for decommissioning the legacy WhatsApp runtime across 7 sequenced stages.

## Staged Execution Plan

| Stage | Name | Target | Action | Proof Command | Rollback Step |
|---|---|---|---|---|---|
${RETIREMENT_STAGES.map((s) => `| ${s.stageNumber} | ${s.name} | \`${s.target}\` | ${s.action} | \`${s.proof}\` | ${s.rollback} |`).join("\n")}

## Preconditions & Safety Guards

1. **Annotated Git Tag:** Created before first deletion: \`git tag -a pre-g6-legacy-retirement -m "Pre-cutover snapshot"\`
2. **Verified Database Dump:** SHA256 validated database dump preserved.
3. **Fail-Closed Execution:** Any failed verification halts the progression immediately.
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const doc = generateChangeSetDocument();
  const outPath = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "docs", "ops", "g6-legacy-retirement-change-set.md");
  fs.writeFileSync(outPath, doc, "utf8");
  console.log(`Generated change-set document at ${outPath}`);
}
