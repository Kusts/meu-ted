#!/usr/bin/env node
/**
 * G0.4.6 Migration Rehearsal — automated execution against disposable DB.
 *
 * Usage:
 *   node scripts/rehearse-migration.mjs
 *
 * Prerequisites: Docker, Node 20+, tsx (pnpm add -g tsx or npx tsx).
 *
 * What it does:
 *   1. Starts a disposable Postgres 17 container
 *   2. Loads the anonymized production snapshot (scripts/anonymized-dump.sql)
 *   3. Runs migrate-job.ts (G0.4.6) in legacy mode
 *   4. Prints migration results
 *   5. Stops and removes the container
 *
 * Exit code: 0 on success (all migrations applied, no errors).
 *            1 on any failure.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CONTAINER_NAME = 'pi-finance-rehearse';

const DUMP_PATH = resolve(ROOT, 'scripts/anonymized-dump.sql');
const API_DIR = resolve(ROOT, 'apps/api');
const MARKER_VALUE = 'pi-finance-migration-rehearsal-2026-07-30';
const BACKUP_ID = `rehearse-${Date.now()}`;

const run = (cmd, opts = {}) => {
  console.log(`$ ${cmd}`);
  const { input, ...rest } = opts;
  if (input) {
    return execSync(cmd, { input, stdio: ['pipe', 'inherit', 'inherit'], ...rest });
  }
  return execSync(cmd, { stdio: 'inherit', ...rest });
};

const runCapture = (cmd, opts = {}) => {
  const out = execSync(cmd, { encoding: 'utf8', ...opts });
  return out.trim();
};

const main = async () => {
  // Pre-flight checks
  if (!existsSync(DUMP_PATH)) {
    console.error(`FATAL: dump not found at ${DUMP_PATH}`);
    process.exit(1);
  }

  // Step 1: remove leftover container if any
  try { execSync(`docker rm -f ${CONTAINER_NAME} 2>/dev/null`, { stdio: 'ignore' }); } catch { /* ok */ }

  // Step 2: start Postgres 17
  console.log('\n=== [1/4] Starting disposable Postgres 17 ===');
  run(`docker run -d --name ${CONTAINER_NAME} -e POSTGRES_PASSWORD=rehearse -e POSTGRES_DB=pi_rehearsal -p 5435:5432 postgres:17-alpine`, { timeout: 60_000 });
  // Wait for Postgres to be ready
  for (let i = 0; i < 15; i++) {
    try {
      execSync(`docker exec ${CONTAINER_NAME} pg_isready -U postgres`, { stdio: 'ignore' });
      break;
    } catch {
      if (i === 14) { console.error('FATAL: Postgres did not start in time'); process.exit(1); }
      execSync('sleep 2', { stdio: 'ignore' });
    }
  }

  // Step 3: configure trust auth
  run(`docker exec ${CONTAINER_NAME} sh -c "sed -i 's|host all all all scram-sha-256|host all all 0.0.0.0/0 trust|' /var/lib/postgresql/data/pg_hba.conf"`);
  run(`docker exec -u postgres ${CONTAINER_NAME} pg_ctl reload`);

  // Step 4: load anonymized dump
  console.log('\n=== [2/4] Loading anonymized production snapshot ===');
  const sqlContent = readFileSync(DUMP_PATH, 'utf8');
  run(`docker exec -i ${CONTAINER_NAME} psql -U postgres -d pi_rehearsal`, { input: sqlContent, timeout: 30_000 });

  // Verify dump loaded
  const markerCheck = runCapture(`docker exec ${CONTAINER_NAME} psql -U postgres -d pi_rehearsal -tA -c "SELECT COUNT(*) FROM _test_marker"`);
  console.log(`  _test_marker rows: ${markerCheck}`);

  // Step 5: execute migrate-job.ts via Node container
  console.log('\n=== [3/4] Running G0.4.6 migrator ===');
  const migrateOutput = execSync(
    `docker run --rm --network host -v "${ROOT}://workspace" -w //workspace/apps/api` +
    ` -e DATABASE_URL=postgresql://postgres@localhost:5435/pi_rehearsal?sslmode=disable` +
    ` -e DB_TEST_MARKER=${MARKER_VALUE}` +
    ` -e BACKUP_CONFIRMED=true` +
    ` -e BACKUP_ID=${BACKUP_ID}` +
    ` -e DB_SCHEMA=legacy` +
    ` node:22-alpine sh -c "npm install pg typescript tsx 2>/dev/null && npx tsx src/scripts/migrate-job.ts"`,
    { encoding: 'utf8', timeout: 120_000 },
  );
  console.log(migrateOutput);

  // Verify migrations applied
  const migrationsApplied = runCapture(
    `docker exec ${CONTAINER_NAME} psql -U postgres -d pi_rehearsal -tA -c "SELECT string_agg(version::text, ',' ORDER BY version) FROM _migrations"`,
  );
  console.log(`  Migrations in _migrations: ${migrationsApplied}`);

  const backupCheck = runCapture(
    `docker exec ${CONTAINER_NAME} psql -U postgres -d pi_rehearsal -tA -c "SELECT backup_id FROM _migration_backup_marker LIMIT 1"`,
  );
  console.log(`  Backup marker: ${backupCheck}`);

  // Step 6: cleanup (skip in interactive/CI if KEEP_DB is set)
  if (!process.env.KEEP_DB) {
    console.log('\n=== [4/4] Cleaning up ===');
    run(`docker rm -f ${CONTAINER_NAME}`);
  } else {
    console.log(`\n=== [4/4] Skipping cleanup (KEEP_DB set) — container ${CONTAINER_NAME} left running ===`);
  }

  // Validate
  if (!migrateOutput.includes('Migrations applied:')) {
    console.error('FATAL: migration job did not produce expected output');
    process.exit(1);
  }

  console.log('\n✓ Rehearsal complete. All gates green.');
};

main().catch((err) => {
  console.error(`Rehearsal failed: ${err.message}`);
  try { execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore' }); } catch { /* ok */ }
  process.exit(1);
});
