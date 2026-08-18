import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DUMP_SOURCE = resolve(ROOT, 'scripts/anonymized-dump.sql');
const run = (file, args, options = {}) => execFileSync(file, args, { encoding: 'utf8', cwd: ROOT, ...options });
const docker = (args, options = {}) => run('docker', args, options);
const sql = (container, database, query) => docker(['exec', container, 'psql', '-U', 'postgres', '-d', database, '-Atc', query]).trim();

const waitForPostgres = (container) => {
  let readyStreak = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const result = docker(['exec', container, 'psql', '-U', 'postgres', '-d', 'source', '-Atqc', 'SELECT 1']);
      readyStreak = result.trim() === '1' ? readyStreak + 1 : 0;
      if (readyStreak >= 2) return;
    } catch {
      readyStreak = 0;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  throw new Error('Postgres did not become ready within 60 seconds.');
};

const isDockerAvailable = () => {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

test('rehearses backup, checksum validation, clean restore, and tamper rejection', { timeout: 240_000 }, (t) => {
  if (!isDockerAvailable()) {
    t.skip('Docker daemon not running');
    return;
  }
  const container = `pi-g2-215-rehearsal-${process.pid}`;
  const backupPath = mkdtempSync(join(tmpdir(), 'pi-g2-215-backup-'));
  try {
    docker(['run', '-d', '-P', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', '-e', 'POSTGRES_DB=source', 'postgres:17-alpine']);
    waitForPostgres(container);
    // Use the container IP so Dockerized pg_dump/pg_restore stay on the
    // Docker bridge and do not depend on the flaky Windows host-port proxy.
    const containerIp = docker(['inspect', '-f', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', container]).trim();
    assert.match(containerIp, /^\d{1,3}(?:\.\d{1,3}){3}$/, 'Docker must expose a bridge IP');

    const urlFor = (database) => `postgresql://postgres:postgres@${containerIp}:5432/${database}`;
    docker(['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', 'CREATE DATABASE target;']);
    docker(['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'source'], {
      input: readFileSync(DUMP_SOURCE),
    });

    const sourceCounts = sql(container, 'source', "SELECT 'accounts='||count(*) FROM accounts UNION ALL SELECT 'categories='||count(*) FROM categories UNION ALL SELECT 'transactions='||count(*) FROM transactions");
    assert.equal(sourceCounts, 'accounts=3\ncategories=13\ntransactions=16');

    const backupId = 'g2-215-rehearsal';
    const backupOutput = run(process.execPath, ['scripts/backup-db.mjs'], {
      env: { ...process.env, DATABASE_URL: urlFor('source'), BACKUP_PATH: backupPath, BACKUP_ID: backupId },
    });
    assert.match(backupOutput, new RegExp(`BACKUP_ID=${backupId}`));

    const dumpFile = join(backupPath, `${backupId}.dump`);
    const checksumFile = join(backupPath, `${backupId}.dump.sha256`);
    const expectedHash = readFileSync(checksumFile, 'utf8').trim().split(/\s+/)[0];
    const actualHash = createHash('sha256').update(readFileSync(dumpFile)).digest('hex');
    assert.equal(actualHash, expectedHash);

    const restoreOutput = run(process.execPath, ['scripts/restore-db.mjs', backupId], {
      env: { ...process.env, DATABASE_URL: urlFor('target'), BACKUP_PATH: backupPath, DB_TEST_MARKER: 'true' },
    });
    assert.match(restoreOutput, /Checksum OK/);
    assert.match(restoreOutput, /Restore complete/);
    assert.equal(sql(container, 'target', "SELECT 'accounts='||count(*) FROM accounts UNION ALL SELECT 'categories='||count(*) FROM categories UNION ALL SELECT 'transactions='||count(*) FROM transactions"), sourceCounts);
    assert.equal(sql(container, 'target', 'SELECT marker_value FROM _test_marker'), 'pi-finance-migration-rehearsal-2026-07-30');

    const tamperedId = 'g2-215-tampered';
    const tamperedDump = join(backupPath, `${tamperedId}.dump`);
    const tamperedChecksum = join(backupPath, `${tamperedId}.dump.sha256`);
    writeFileSync(tamperedDump, readFileSync(dumpFile));
    writeFileSync(tamperedChecksum, readFileSync(checksumFile));
    appendFileSync(tamperedDump, '\nTAMPERED\n');
    assert.throws(() => run(process.execPath, ['scripts/restore-db.mjs', tamperedId], {
      env: { ...process.env, DATABASE_URL: urlFor('target'), BACKUP_PATH: backupPath, DB_TEST_MARKER: 'true' },
    }), /checksum MISMATCH/);
  } finally {
    try { docker(['rm', '-f', container], { stdio: 'ignore' }); } catch {}
    rmSync(backupPath, { recursive: true, force: true });
  }
});
