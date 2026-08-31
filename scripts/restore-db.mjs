#!/usr/bin/env node
/**
 * Database restore with SHA256 checksum validation.
 *
 * Usage: node scripts/restore-db.mjs <backup-id>
 * Env: DATABASE_URL (required), BACKUP_PATH (default ./data/backups).
 * Safety: restore is destructive and requires DB_TEST_MARKER=true.
 */

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

export const databaseParts = (databaseUrl) => {
  const url = new URL(databaseUrl);
  return {
    username: decodeURIComponent(url.username || 'postgres'),
    password: decodeURIComponent(url.password || ''),
    host: url.hostname || 'localhost',
    dockerHost: ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
      ? 'host.docker.internal'
      : url.hostname,
    port: url.port || '5432',
    database: url.pathname || '/postgres',
    search: url.search || '?sslmode=disable',
  };
};

export const sanitizedDatabaseUrl = (parts, useDockerHost = false) => {
  const host = useDockerHost ? parts.dockerHost : parts.host;
  return `postgresql://${encodeURIComponent(parts.username)}@${host}:${parts.port}${parts.database}${parts.search}`;
};

/** Build the local pg_restore command without putting the database password in argv. */
export const buildLocalPgRestoreArgs = (databaseUrl, dumpFile) => {
  const parts = databaseParts(databaseUrl);
  return {
    command: `pg_restore --clean --if-exists --no-owner --verbose --dbname="${sanitizedDatabaseUrl(parts, false)}" "${dumpFile}"`,
    env: parts.password ? { PGPASSWORD: parts.password } : {},
  };
};

/** Build the Docker fallback without putting the database password in argv. */
export const buildDockerPgRestoreArgs = (databaseUrl, dumpFile) => {
  const parts = databaseParts(databaseUrl);
  const backupDir = dirname(dumpFile);
  const dumpBasename = basename(dumpFile);
  return {
    command: [
      'docker run --rm --add-host=host.docker.internal:host-gateway -e PGPASSWORD',
      `-v "${backupDir}:/backups"`,
      'postgres:17-alpine',
      'pg_restore --clean --if-exists --no-owner --verbose',
      `--dbname="${sanitizedDatabaseUrl(parts, true)}"`,
      `"/backups/${dumpBasename}"`,
    ].join(' '),
    env: parts.password ? { PGPASSWORD: parts.password } : {},
  };
};

const hasCommand = (command) => {
  try {
    execSync(`${command} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const restore = (backupId) => {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  if (process.env.DB_TEST_MARKER !== 'true') {
    throw new Error('DB_TEST_MARKER=true is required before destructive restore.');
  }

  const backupPath = resolve(ROOT, process.env.BACKUP_PATH?.trim() || './data/backups');
  const dumpFile = resolve(backupPath, `${backupId}.dump`);
  const checksumFile = resolve(backupPath, `${backupId}.dump.sha256`);
  console.log(`Backup ID:  ${backupId}`);
  console.log(`Dump:       ${dumpFile}`);
  console.log(`Checksum:   ${checksumFile}`);

  if (!existsSync(dumpFile)) throw new Error(`dump file not found: ${dumpFile}`);
  if (!existsSync(checksumFile)) throw new Error(`checksum file not found: ${checksumFile}`);

  const expectedChecksumLine = readFileSync(checksumFile, 'utf8').trim();
  const expectedHash = expectedChecksumLine.split(/\s+/)[0];
  if (!expectedHash || !/^[a-f0-9]{64}$/i.test(expectedHash)) {
    throw new Error(`invalid checksum file format: ${expectedChecksumLine}`);
  }
  const actualHash = createHash('sha256').update(readFileSync(dumpFile)).digest('hex');
  console.log(`Expected SHA256: ${expectedHash}`);
  console.log(`Actual SHA256:   ${actualHash}`);
  if (actualHash !== expectedHash) throw new Error('checksum MISMATCH. Dump is corrupted or tampered.');
  console.log('✓ Checksum OK.');

  const pgRestore = hasCommand('pg_restore');
  const restoreCommand = pgRestore
    ? buildLocalPgRestoreArgs(databaseUrl, dumpFile)
    : buildDockerPgRestoreArgs(databaseUrl, dumpFile);
  console.log('\nRestoring...');
  execSync(restoreCommand.command, {
    stdio: 'inherit',
    timeout: 300_000,
    env: { ...process.env, ...(restoreCommand.env ?? {}) },
  });
  console.log('\n✓ Restore complete. All data verified.');
};

export const main = () => {
  const backupId = process.argv[2]?.trim();
  if (!backupId) {
    console.error('Usage: node scripts/restore-db.mjs <backup-id>');
    process.exitCode = 1;
  }
  try {
    restore(backupId);
  } catch (error) {
    console.error(`FATAL: ${error.message}`);
    process.exitCode = 1;
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
