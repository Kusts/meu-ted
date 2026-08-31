import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDockerPgDumpArgs, buildLocalPgDumpArgs } from './backup-db.mjs';
import { buildDockerPgRestoreArgs, buildLocalPgRestoreArgs } from './restore-db.mjs';

test('Local pg_dump preserves password in env without putting it in argv', () => {
  const args = buildLocalPgDumpArgs(
    'postgresql://postgres:secret@localhost:55433/source?sslmode=disable',
    'D:\\backups\\cycle.dump',
  );

  assert.deepEqual(args.env, { PGPASSWORD: 'secret' });
  assert.ok(args.command.startsWith('pg_dump '));
  assert.ok(args.command.includes('localhost:55433/source'));
  assert.ok(!args.command.includes('secret'));
  assert.ok(!args.command.includes('postgres:secret@'));
});

test('Docker pg_dump fallback preserves password in env without putting it in argv', () => {
  const args = buildDockerPgDumpArgs(
    'postgresql://postgres:secret@localhost:55433/source?sslmode=disable',
    'D:\\backups\\cycle.dump',
  );

  assert.deepEqual(args.env, { PGPASSWORD: 'secret' });
  assert.ok(args.command.includes('-e PGPASSWORD'));
  assert.ok(args.command.includes('host.docker.internal:55433/source'));
  assert.ok(!args.command.includes('secret'));
  assert.ok(!args.command.includes('postgres:secret@'));
  assert.ok(args.command.includes('D:\\backups:/backups'));
});

test('Local pg_restore preserves password in env without putting it in argv', () => {
  const args = buildLocalPgRestoreArgs(
    'postgresql://postgres:secret@localhost:55433/target?sslmode=disable',
    'D:\\backups\\cycle.dump',
  );

  assert.deepEqual(args.env, { PGPASSWORD: 'secret' });
  assert.ok(args.command.startsWith('pg_restore '));
  assert.ok(args.command.includes('localhost:55433/target'));
  assert.ok(!args.command.includes('secret'));
  assert.ok(!args.command.includes('postgres:secret@'));
});

test('Docker pg_restore fallback preserves password in env without putting it in argv', () => {
  const args = buildDockerPgRestoreArgs(
    'postgresql://postgres:secret@localhost:55433/target?sslmode=disable',
    'D:\\backups\\cycle.dump',
  );

  assert.deepEqual(args.env, { PGPASSWORD: 'secret' });
  assert.ok(args.command.includes('host.docker.internal:55433/target'));
  assert.ok(!args.command.includes('secret'));
  assert.ok(!args.command.includes('postgres:secret@'));
  assert.ok(args.command.includes('D:\\backups:/backups'));
});
