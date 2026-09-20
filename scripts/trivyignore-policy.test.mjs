import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  parseTrivyignore,
  validateTrivyignore,
  validateTrivyignoreFile,
} from './trivyignore-policy.mjs';

const TODAY = '2026-09-19';
const FUTURE = '2026-12-31';
const PAST = '2026-01-01';

test('accepts the repository .trivyignore before its expiry', () => {
  const result = validateTrivyignoreFile(process.cwd(), { today: TODAY });
  assert.equal(result.ok, true, `expected .trivyignore to validate: ${result.errors.join('; ')}`);
  assert.ok(result.entries.length >= 10, `expected >=10 entries, got ${result.entries.length}`);
  for (const entry of result.entries) {
    assert.match(entry.cve, /^CVE-\d{4}-\d+$/);
    assert.ok(entry.expiry >= TODAY, `${entry.cve} expired at ${entry.expiry}`);
  }
});

test('rejects an expired entry', () => {
  const text = `# test. Expiry: ${PAST}.\nCVE-2026-00001\n`;
  const result = validateTrivyignore(text, { today: TODAY });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('expired')), JSON.stringify(result.errors));
});

test('rejects an entry with missing expiry', () => {
  const text = `# no expiry declared here\nCVE-2026-00002\n`;
  const result = validateTrivyignore(text, { today: TODAY });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('missing expiry')), JSON.stringify(result.errors));
});

test('rejects malformed expiry declarations (fail-closed)', () => {
  for (const bad of [
    '# Expiry: soon\nCVE-2026-00003\n',
    '# Expiry: 31-12-2026\nCVE-2026-00003\n',
    '# Expiry: 2026/12/31\nCVE-2026-00003\n',
    '# expiry split across lines with no date\nCVE-2026-00003\n',
    '# Expires at end of year\nCVE-2026-00003\n',
  ]) {
    const result = validateTrivyignore(bad, { today: TODAY });
    assert.equal(result.ok, false, `expected rejection for: ${JSON.stringify(bad)}`);
  }
});

test('rejects non-CVE garbage lines', () => {
  const text = `# test. Expiry: ${FUTURE}.\nNOT-A-CVE\n`;
  const result = validateTrivyignore(text, { today: TODAY });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('unrecognized')), JSON.stringify(result.errors));
});

test('rejects invalid calendar dates', () => {
  for (const badDate of ['2026-13-01', '2026-02-30', '2026-00-10']) {
    const text = `# test. Expiry: ${badDate}.\nCVE-2026-00004\n`;
    const result = validateTrivyignore(text, { today: TODAY });
    assert.equal(result.ok, false, `expected rejection for date ${badDate}`);
  }
});

test('accepts inline expiry and enforces its date', () => {
  const good = parseTrivyignore(`CVE-2026-00005 # Expiry: ${FUTURE}.\n`, { today: TODAY });
  assert.equal(good.errors.length, 0, JSON.stringify(good.errors));
  assert.equal(good.entries[0].expiry, FUTURE);

  const expiredInline = validateTrivyignore(`CVE-2026-00005 # Expiry: ${PAST}.\n`, { today: TODAY });
  assert.equal(expiredInline.ok, false);

  const malformedInline = validateTrivyignore('CVE-2026-00005 # Expiry: soon\n', { today: TODAY });
  assert.equal(malformedInline.ok, false);
});

test('expiry day is inclusive: same-day passes, yesterday fails', () => {
  const sameDay = validateTrivyignore(`# x. Expiry: ${TODAY}.\nCVE-2026-00006\n`, { today: TODAY });
  assert.equal(sameDay.ok, true, JSON.stringify(sameDay.errors));

  const yesterday = validateTrivyignore('# x. Expiry: 2026-09-18.\nCVE-2026-00006\n', { today: TODAY });
  assert.equal(yesterday.ok, false);
});

test('container gate validates the ignore file before any scan and gates the --ignorefile flag', () => {
  const script = fs.readFileSync('scripts/security-containers.mjs', 'utf8');
  assert.match(script, /trivyignore-policy\.mjs/);
  assert.match(script, /validateTrivyignoreFile/);
  const validateAt = script.indexOf('validateTrivyignoreFile');
  const dockerAt = script.indexOf("spawnSync('docker'");
  assert.ok(validateAt !== -1 && dockerAt !== -1 && validateAt < dockerAt, 'validation must run before any docker invocation');
  assert.match(script, /process\.exit\(1\)/);
  assert.match(script, /--ignorefile/);
});
