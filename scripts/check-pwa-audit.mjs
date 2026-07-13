#!/usr/bin/env node

/**
 * PWA audit classifier.
 *
 * Reads `pnpm audit --json` from stdin, classifies each advisory by its
 * dependency paths. Exits 1 if any advisory affects apps/pwa (path prefix
 * "apps__pwa"), exits 0 if all advisories are sibling-only or root deps.
 * Fails closed on unrecognized JSON shape or unknown path prefix.
 *
 * Usage:
 *   pnpm audit --json | node scripts/check-pwa-audit.mjs
 *
 * Export:
 *   checkPwaAudit(jsonString) => { blocked, advisories }
 */

const PWA_PREFIX = 'apps__pwa';
const SIBLING_PREFIXES = ['apps__whatsapp-bridge', '.'];

/**
 * Parse and classify a pnpm audit JSON string.
 * Returns { blocked, advisories }.
 * @param {string} auditJson
 * @returns {{ blocked: boolean, advisories: Array<{id: number, title: string, module_name: string, paths: string[]}> }}
 */
export function checkPwaAudit(auditJson) {
  let parsed;
  try {
    parsed = JSON.parse(auditJson);
  } catch {
    throw new Error('check-pwa-audit: input is not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || !('advisories' in parsed)) {
    throw new Error('check-pwa-audit: unrecognized audit shape — missing "advisories" key');
  }

  const advisories = parsed.advisories;
  if (typeof advisories !== 'object' || advisories === null) {
    throw new Error('check-pwa-audit: "advisories" is not an object');
  }

  /** @type {Array<{id: number, title: string, module_name: string, paths: string[]}>} */
  const results = [];

  for (const [idStr, advisory] of Object.entries(advisories)) {
    if (!advisory || typeof advisory !== 'object') {
      throw new Error(`check-pwa-audit: advisory ${idStr} is not an object`);
    }

    const findings = advisory.findings;
    if (!Array.isArray(findings)) {
      throw new Error(`check-pwa-audit: advisory ${idStr} has no "findings" array`);
    }

    /** @type {string[]} */
    const allPaths = [];
    for (let fi = 0; fi < findings.length; fi++) {
      const finding = findings[fi];
      if (!finding || typeof finding !== 'object') {
        throw new Error(`check-pwa-audit: advisory ${idStr} finding ${fi} is not an object`);
      }
      if (!Array.isArray(finding.paths)) {
        throw new Error(`check-pwa-audit: advisory ${idStr} finding ${fi} has no "paths" array`);
      }
      for (const p of finding.paths) {
        if (typeof p !== 'string') {
          throw new Error(`check-pwa-audit: advisory ${idStr} finding ${fi} path is not a string`);
        }
        allPaths.push(p);
      }
    }

    results.push({
      id: parseInt(idStr, 10),
      title: advisory.title || '',
      module_name: advisory.module_name || '',
      paths: allPaths,
    });
  }

  const blocked = results.some((r) => r.paths.some((p) => isPwaPath(p)));
  return { blocked, advisories: results };
}

/**
 * Check if a dependency path affects the PWA workspace.
 * @param {string} path
 * @returns {boolean}
 */
function isPwaPath(path) {
  // Direct or transitive PWA dependency
  if (path.startsWith(PWA_PREFIX)) {
    return true;
  }
  // Sibling or root workspace dependency — not PWA
  if (SIBLING_PREFIXES.some((p) => path.startsWith(p))) {
    return false;
  }
  // Unknown prefix — fail closed
  throw new Error(
    `check-pwa-audit: unrecognized path prefix in "${path}". ` +
    `Expected paths starting with "${PWA_PREFIX}", ` +
    `"${SIBLING_PREFIXES.join('", "')}", or sibling workspace names.`
  );
}

// CLI mode
if (process.argv[1] && (process.argv[1].endsWith('check-pwa-audit.mjs') || process.argv[1].endsWith('check-pwa-audit'))) {
  let input = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const result = checkPwaAudit(input);
      if (result.blocked) {
        const names = result.advisories
          .filter((a) => a.paths.some((p) => isPwaPath(p)))
          .map((a) => `${a.module_name} (${a.title})`);
        console.error(`check-pwa-audit: BLOCKED — ${names.length} PWA advisory(ies):`);
        for (const n of names) {
          console.error(`  ${n}`);
        }
        process.exit(1);
      } else {
        if (result.advisories.length > 0) {
          console.error(`check-pwa-audit: PASS — ${result.advisories.length} sibling-only advisory(ies) ignored`);
        } else {
          console.error('check-pwa-audit: PASS — no advisories');
        }
        process.exit(0);
      }
    } catch (err) {
      console.error(`check-pwa-audit: ERROR — ${err.message}`);
      process.exit(1);
    }
  });
}
