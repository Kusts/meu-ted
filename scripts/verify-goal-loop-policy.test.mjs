import test from 'node:test';
import assert from 'node:assert/strict';
import { GOAL_LOOP_POLICY, simulateGoalLoop } from './verify-goal-loop-policy.mjs';

test('stops after the continuation cap', () => {
  const result = simulateGoalLoop(Array.from({ length: 7 }, () => ({ ok: true })));
  assert.deepEqual(result, { stopped: true, reason: 'continuation-cap', continuations: 6 });
  assert.equal(GOAL_LOOP_POLICY.maxMinutes, 45);
});

test('stops after the same failure repeats twice', () => {
  const result = simulateGoalLoop([{ failure: 'typecheck' }, { failure: 'typecheck' }]);
  assert.deepEqual(result, { stopped: true, reason: 'repeated-failure', continuations: 2 });
});
