#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

export const GOAL_LOOP_POLICY = Object.freeze({
  maxContinuations: 6,
  maxMinutes: 45,
  repeatedFailureLimit: 2,
});

export const simulateGoalLoop = (steps, policy = GOAL_LOOP_POLICY) => {
  let repeatedFailures = 0;
  let previousFailure = null;
  for (let index = 0; index < steps.length && index < policy.maxContinuations; index += 1) {
    const step = steps[index];
    if (step.failure && step.failure === previousFailure) repeatedFailures += 1;
    else repeatedFailures = step.failure ? 1 : 0;
    previousFailure = step.failure ?? null;
    if (repeatedFailures >= policy.repeatedFailureLimit) {
      return { stopped: true, reason: 'repeated-failure', continuations: index + 1 };
    }
  }
  if (steps.length >= policy.maxContinuations) {
    return { stopped: true, reason: 'continuation-cap', continuations: policy.maxContinuations };
  }
  return { stopped: false, reason: 'unfinished', continuations: steps.length };
};

const main = () => {
  const cap = simulateGoalLoop(Array.from({ length: 7 }, () => ({ ok: true })));
  const stagnation = simulateGoalLoop([{ failure: 'same' }, { failure: 'same' }]);
  if (cap.reason !== 'continuation-cap' || stagnation.reason !== 'repeated-failure') {
    console.error('Goal loop policy verification failed.');
    process.exitCode = 1;
    return;
  }
  console.log('Goal loop policy passed: cap=6, repeated-failure=2.');
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
