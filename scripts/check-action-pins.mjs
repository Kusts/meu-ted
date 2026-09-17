#!/usr/bin/env node
/**
 * V4.1 Phase 9 (Task 9.11) — GitHub Actions pin gate, strict SHA policy
 * (DEBT-CODER-INFRA).
 *
 * EVERY third-party `uses:` step in .github/workflows must be pinned to a
 * FULL 40-char commit SHA, with the human-readable version kept as a
 * trailing comment, e.g.:
 *
 *   uses: actions/checkout@11bd71929ab941e0c495a1937a63873e77a4289ac # v4
 *
 * Rationale: major tags move — a SHA is the only immutable reference, so a
 * compromised or re-pointed tag cannot change what CI executes. Dependabot
 * (`.github/dependabot.yml`, weekly, github-actions ecosystem) proposes the
 * SHA bumps; the `# vX.Y.Z` comment keeps the version readable in review.
 *
 * Escape hatch: a line that cannot be SHA-pinned (tag unresolvable at
 * pin time) must carry an inline `# unpinned: <reason>` comment. The gate
 * accepts it but reports it — every exception stays visible until fixed.
 *
 * Not third-party (skipped): local paths (`./`, `../`) and `docker://`
 * images (pinned separately under the image-tag policy).
 *
 * Usage: node scripts/check-action-pins.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS_DIR = path.join(ROOT, ".github", "workflows");

const FULL_SHA = /^[0-9a-f]{40}$/i;
const VERSION_COMMENT = /#\s*v\d+(\.\d+)*/i;
const UNPINNED_EXCEPTION = /#\s*unpinned:\s*(.+)/i;

const violations = [];
const exceptions = [];
const checked = [];

for (const file of fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))) {
  const content = fs.readFileSync(path.join(WORKFLOWS_DIR, file), "utf8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/);
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
    if (FULL_SHA.test(pin)) {
      // Immutable SHA — the version must stay readable as a comment.
      if (!VERSION_COMMENT.test(lines[i])) {
        violations.push({ file, line: i + 1, ref, why: "SHA pin without a version comment (expected e.g. `# v4`)" });
        continue;
      }
      checked.push({ file, ref, kind: "sha" });
      continue;
    }
    // Anything that is not a full SHA fails — unless it carries an
    // explicit, reasoned exception comment.
    const exc = lines[i].match(UNPINNED_EXCEPTION);
    if (exc) {
      exceptions.push({ file, line: i + 1, ref, reason: exc[1].trim() });
      continue;
    }
    violations.push({ file, line: i + 1, ref, why: `not a full 40-char SHA (@${pin}); pin to the commit SHA with a \`# vX\` comment, or add \`# unpinned: <reason>\`` });
  }
}

if (violations.length > 0) {
  console.error(`FAIL: ${violations.length} non-SHA-pinned third-party action(s):`);
  for (const v of violations) console.error(` - ${v.file}:${v.line} uses: ${v.ref} — ${v.why}`);
  process.exit(1);
}

console.log(
  `OK: action-pin gate passed — ${checked.length} third-party uses: SHA-pinned with version comment, ${exceptions.length} documented exception(s).`,
);
for (const e of exceptions) console.log(` - exception: ${e.file}:${e.line} uses: ${e.ref} — unpinned: ${e.reason}`);
