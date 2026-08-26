import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDecisionGovernance } from './check-decision-governance.mjs';

const spec = 'docs/superpowers/specs/2026-07-28-project-recovery-product-architecture.md';
const roadmap = 'docs/superpowers/plans/2026-07-28-project-recovery-roadmap.html';

test('rejects a D01-D19 change without ADR and paired docs', () => {
  const result = evaluateDecisionGovernance({
    changedFiles: [spec],
    decisionDiff: '+| D01 | changed decision |',
  });
  assert.equal(result.ok, false);
});

test('accepts a D01-D19 change with ADR, spec and roadmap', () => {
  const result = evaluateDecisionGovernance({
    changedFiles: ['docs/adr/002-change.md', spec, roadmap],
    decisionDiff: '+| D01 | changed decision |',
  });
  assert.equal(result.ok, true);
});
