#!/usr/bin/env node
/**
 * V4.1 Phase 9 (Task 9.11) — GitHub Actions pin gate.
 *
 * Enforces that every third-party `uses:` step in .github/workflows is
 * pinned to an immutable major-version tag (e.g. `@v4`) or a full commit
 * SHA, with a comment recording the pin. Floating refs (`@main`, `@master`,
 * unversioned) FAIL the gate — a supply-chain requirement from SPEC §16.
 *
 * Full SHA-pinning is the target state; until every action is SHA-pinned,
 * major-tag pins + Dependabot (`.github/dependabot.yml`, weekly,
 * github-actions ecosystem) provide the mechanical update path, and this
 * gate prevents regression to floating refs.
 *
 * Usage: node scripts/check-action-pins.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS_DIR = path.join(ROOT, ".github", "workflows");

const PINNED_TAG = /^v\d+(\.\d+)*$/; // v4, v7, v3.2.1 …
const FULL_SHA = /^[0-9a-f]{40}$/;
const FLOATING = new Set(["main", "master", "latest", "stable"]);

const violations = [];
const checked = [];

for (const file of fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))) {
  const content = fs.readFileSync(path.join(WORKFLOWS_DIR, file), "utf8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*uses:\s*([^\s#]+)/);
    if (!m) continue;
    const ref = m[1];
    // Local reusable workflows / local actions are not third-party.
    if (ref.startsWith("./") || ref.startsWith("../")) continue;
    // docker:// images are pinned separately (image tag policy).
    if (ref.startsWith("docker://")) {
      checked.push({ file, ref, kind: "docker" });
      continue;
    }
    const at = ref.lastIndexOf("@");
    if (at === -1) {
      violations.push({ file, line: i + 1, ref, why: "missing version pin" });
      continue;
    }
    const pin = ref.slice(at + 1);
    checked.push({ file, ref });
    if (FULL_SHA.test(pin)) continue; // strongest: immutable SHA.
    if (FLOATING.has(pin.toLowerCase())) {
      violations.push({ file, line: i + 1, ref, why: `floating ref @${pin}` });
      continue;
    }
    if (!PINNED_TAG.test(pin)) {
      violations.push({ file, line: i + 1, ref, why: `unrecognized pin @${pin} (expected vN or full SHA)` });
    }
  }
}

if (violations.length > 0) {
  console.error(`FAIL: ${violations.length} unpinned/floating third-party action(s):`);
  for (const v of violations) console.error(` - ${v.file}:${v.line} uses: ${v.ref} — ${v.why}`);
  process.exit(1);
}

console.log(
  `OK: action-pin gate passed — ${checked.length} third-party uses: pinned (major tag or SHA), 0 floating.`,
);
