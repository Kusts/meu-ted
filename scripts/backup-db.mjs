#!/usr/bin/env node
/**
 * Database backup with SHA256 checksum.
 *
 * Usage:
 *   node scripts/backup-db.mjs
 *   BACKUP_ID=my-custom-id node scripts/backup-db.mjs
 *
 * Env: DATABASE_URL (required), BACKUP_PATH (default ./data/backups),
 * BACKUP_ID (optional).
 */

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from 'node:fs';
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

/** Build the local pg_dump command without putting the database password in argv. */
export const buildLocalPgDumpArgs = (databaseUrl, dumpFile) => {
  const parts = databaseParts(databaseUrl);
  return {
    command: `pg_dump "${sanitizedDatabaseUrl(parts, false)}" --format=custom --compress=9 --file="${dumpFile}" --no-owner --verbose`,
    env: parts.password ? { PGPASSWORD: parts.password } : {},
  };
};

/** Build the Docker fallback without putting the database password in argv. */
export const buildDockerPgDumpArgs = (databaseUrl, dumpFile) => {
  const parts = databaseParts(databaseUrl);
  const backupDir = dirname(dumpFile);
  const dumpBasename = basename(dumpFile);
  return {
    command: [
      'docker run --rm --add-host=host.docker.internal:host-gateway -e PGPASSWORD',
      `-v "${backupDir}:/backups"`,
      'postgres:17-alpine',
      'pg_dump',
      `"${sanitizedDatabaseUrl(parts, true)}"`,
      '--format=custom --compress=9 --file="/backups/' + dumpBasename + '" --no-owner --verbose',
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

const backup = () => {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const backupPath = resolve(ROOT, process.env.BACKUP_PATH?.trim() || './data/backups');
  mkdirSync(backupPath, { recursive: true });
  const backupId = process.env.BACKUP_ID?.trim() || `backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dumpFile = resolve(backupPath, `${backupId}.dump`);
  const checksumFile = resolve(backupPath, `${backupId}.dump.sha256`);

  console.log(`Backup ID: ${backupId}`);
  console.log(`Target:    ${dumpFile}`);

  const pgDump = hasCommand('pg_dump');
  const dump = pgDump
    ? buildLocalPgDumpArgs(databaseUrl, dumpFile)
    : buildDockerPgDumpArgs(databaseUrl, dumpFile);

  try {
    execSync(dump.command, { stdio: 'inherit', timeout: 300_000, env: { ...process.env, ...dump.env } });
  } catch (error) {
    console.error(`FATAL: pg_dump failed: ${error.message}`);
    try { rmSync(dumpFile, { force: true }); } catch {}
    throw error;
  }

  if (!existsSync(dumpFile) || statSync(dumpFile).size === 0) {
    throw new Error('pg_dump produced empty or missing file.');
  }
  const dumpContent = readFileSync(dumpFile);
  const hash = createHash('sha256').update(dumpContent).digest('hex');
  writeFileSync(checksumFile, `${hash}  ${basename(dumpFile)}\n`);

  console.log(`Dump size: ${(statSync(dumpFile).size / 1024).toFixed(1)} KB`);
  console.log(`SHA256:    ${hash}`);
  console.log(`Checksum:  ${checksumFile}`);
  console.log(`\nBACKUP_ID=${backupId}`);
  return { backupId, dumpFile, checksumFile, hash };
};

export const main = () => {
  try {
    backup();
  } catch (error) {
    console.error(`FATAL: ${error.message}`);
    process.exitCode = 1;
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
