import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, 'fixtures');

function loadFixture(name) {
  return readFileSync(resolve(fixturesDir, name), 'utf-8');
}

/**
 * checkPwaAudit reads a pnpm audit --json string and returns:
 *   { blocked: boolean, advisories: Array<{id, title, module_name, paths}> }
 *
 * blocked = true if ANY advisory has a finding path starting with "apps__pwa".
 * blocked = false if all advisories have paths only in "apps__whatsapp-bridge" or "." (root).
 *
 * Throws if JSON shape is unrecognized (missing "advisories" key, etc.).
 * Malformed path prefix throws.
 */
async function checkPwaAudit(auditJson) {
  const mod = await import('../check-pwa-audit.mjs');
  return mod.default ? mod.default(auditJson) : mod.checkPwaAudit(auditJson);
}

describe('PWA audit classifier', () => {
  it('blocks when advisory path starts with apps__pwa (direct dep)', async () => {
    const json = loadFixture('direct-pwa-advisory.json');
    const result = await checkPwaAudit(json);
    assert.equal(result.blocked, true, 'direct PWA dep should block');
    assert.ok(Array.isArray(result.advisories), 'result.advisories should be array');
    assert.ok(result.advisories.length > 0, 'should contain advisory');
    assert.equal(result.advisories[0].id, 9999001);
  });

  it('blocks when advisory path starts with apps__pwa (transitive dep)', async () => {
    const json = loadFixture('transitive-pwa-advisory.json');
    const result = await checkPwaAudit(json);
    assert.equal(result.blocked, true, 'transitive PWA dep should block');
    assert.ok(result.advisories.length > 0);
  });

  it('passes when all advisories are sibling-only or root', async () => {
    const json = loadFixture('sibling-only-advisory.json');
    const result = await checkPwaAudit(json);
    assert.equal(result.blocked, false, 'sibling-only should not block');
    assert.ok(result.advisories.length > 0, 'should still report advisories');
  });

  it('fails closed on unknown audit shape', async () => {
    const json = loadFixture('unknown-shape.json');
    await assert.rejects(
      () => checkPwaAudit(json),
      { name: 'Error' },
      'unknown shape should throw'
    );
  });
});
