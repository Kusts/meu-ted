#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const evaluateSnapshotPolicy = ({ env, stagedFiles }) => {
  const authorized = env.SNAPSHOT_AUTHORIZED === 'true';
  const gatesGreen = env.GATES_GREEN === 'true';
  const diffReviewed = env.DIFF_REVIEWED === 'true';
  const goalFiles = new Set((env.GOAL_FILES || '').split(',').map((file) => file.trim()).filter(Boolean));
  const outOfScope = stagedFiles.filter((file) => !goalFiles.has(file));
  return {
    ok: authorized && gatesGreen && diffReviewed && stagedFiles.length > 0 && goalFiles.size > 0 && outOfScope.length === 0,
    outOfScope,
    reason: !authorized ? 'SNAPSHOT_AUTHORIZED=true is required'
      : !gatesGreen ? 'GATES_GREEN=true is required'
      : !diffReviewed ? 'DIFF_REVIEWED=true is required'
      : stagedFiles.length === 0 ? 'staged snapshot is empty'
      : goalFiles.size === 0 ? 'GOAL_FILES must list the allowed files'
      : outOfScope.length > 0 ? `staged files outside goal: ${outOfScope.join(', ')}`
      : 'snapshot policy passed',
  };
};

const main = () => {
  const stagedFiles = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean);
  const result = evaluateSnapshotPolicy({ env: process.env, stagedFiles });
  if (!result.ok) {
    console.error(`Snapshot policy failed: ${result.reason}.`);
    process.exitCode = 1;
    return;
  }
  console.log('Snapshot policy passed.');
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
