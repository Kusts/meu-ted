import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSnapshotPolicy } from './check-snapshot-policy.mjs';

const env = {
  SNAPSHOT_AUTHORIZED: 'true',
  GATES_GREEN: 'true',
  DIFF_REVIEWED: 'true',
  GOAL_FILES: 'apps/api/src/example.ts,apps/api/tests/example.test.ts',
};

test('rejects an empty staged snapshot', () => {
  const result = evaluateSnapshotPolicy({ env, stagedFiles: [] });
  assert.equal(result.ok, false);
});

test('rejects snapshot without explicit authorization', () => {
  const result = evaluateSnapshotPolicy({ env: { ...env, SNAPSHOT_AUTHORIZED: 'false' }, stagedFiles: ['apps/api/src/example.ts'] });
  assert.equal(result.ok, false);
});

test('rejects staged files outside the goal scope', () => {
  const result = evaluateSnapshotPolicy({ env, stagedFiles: ['apps/api/src/example.ts', 'README.md'] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.outOfScope, ['README.md']);
});

test('accepts authorized reviewed green goal-scoped snapshot', () => {
  const result = evaluateSnapshotPolicy({ env, stagedFiles: ['apps/api/src/example.ts'] });
  assert.equal(result.ok, true);
});
