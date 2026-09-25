import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = resolve(ROOT, 'scripts/rehearse-canonical-conversion.mjs');

const isDockerAvailable = () => {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

test(
  'rehearses canonical conversion: dry-run GO, convert, preflight, 0-drift recon, noop rerun, dump checksum',
  { timeout: 600_000 },
  (t) => {
    if (!isDockerAvailable()) {
      t.skip('Docker daemon not running');
      return;
    }
    const container = `pi-canonical-rehearsal-test-${process.pid}`;
    let output;
    try {
      output = execFileSync(process.execPath, [SCRIPT], {
        encoding: 'utf8',
        cwd: ROOT,
        timeout: 540_000,
        env: {
          ...process.env,
          REHEARSE_CONTAINER: container,
          REHEARSE_PORT: '5437',
        },
      });
    } catch (err) {
      assert.fail(`rehearsal script exited ${err.status ?? '?'}:\n${err.stdout ?? ''}\n${err.stderr ?? err.message}`);
    }
    assert.match(output, /Canonical conversion rehearsal complete/);
    const begin = output.indexOf('EVIDENCE_JSON_BEGIN');
    const end = output.indexOf('EVIDENCE_JSON_END');
    assert.ok(begin >= 0 && end > begin, 'rehearsal must print the evidence JSON block');
    const evidence = JSON.parse(output.slice(begin + 'EVIDENCE_JSON_BEGIN'.length, end).trim());

    assert.equal(evidence.container, container);
    assert.equal(evidence.dryRun.ready, true);
    assert.deepEqual(evidence.dryRun.blockers, []);
    assert.match(evidence.dryRun.fingerprint, /^[0-9a-f]{64}$/);
    assert.equal(evidence.conversion.status, 'completed');
    assert.equal(evidence.conversion.fingerprint, evidence.dryRun.fingerprint);
    // Every converted entity round-trips archive==canonical with zero loss
    // ("goals:2=2" style; the converter's own verification asserts the same).
    for (const entry of evidence.conversion.entities) {
      const match = /^([\w]+):(\d+)=(\d+)$/.exec(entry);
      assert.ok(match, `entity count entry must parse: ${entry}`);
      assert.equal(match[2], match[3], `archive/canonical count mismatch for ${match[1]}`);
    }
    assert.equal(evidence.preflight.ready, true);
    assert.equal(evidence.reconciliation.schema, 'canonical');
    assert.equal(evidence.reconciliation.checked > 0, true, 'reconciliation must check at least one row');
    // Absolute zero-drift is unsatisfiable on the anonymized dump (its
    // household id hashes to the approved ADR-017 household, so the
    // allowlist count gates fire; its fabricated goal currents ship with
    // zero contributions). The rehearsal accepts exactly the documented
    // 5-finding baseline plus archive==canonical goal fidelity — anything
    // else is a converter regression and fails the script before this.
    assert.equal(evidence.reconciliationBaseline?.matched, true);
    assert.equal(Number(evidence.goalFidelity), 0);
    assert.equal(evidence.rerun.status, 'noop');
    assert.equal(evidence.rerun.finishedAtUnchanged, true);
    assert.match(evidence.postConversionDump.sha256, /^[0-9a-f]{64}$/);
    assert.ok(evidence.postConversionDump.bytes > 0);

    try {
      execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
    } catch {}
  },
);
