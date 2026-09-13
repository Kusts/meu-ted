import { describe, expect, it } from 'vitest';
import { validateTurnPlan } from '../../src/orchestration/turn-plan.js';

const base = {
  version: '2' as const,
  mode: 'read' as const,
  domain: 'accounts' as const,
  skillNames: ['financial-analysis'],
  requestedOperations: [{ name: 'get_balance', kind: 'read' as const }],
  requestedTools: ['financial.read'],
  missingFields: [],
  ambiguity: null,
  confidence: 1,
};

describe('T2.2 validated TurnPlan', () => {
  it('rejects an invalid plan atomically', () => {
    const result = validateTurnPlan({ ...base, version: '1' });
    expect(result.success).toBe(false);
    expect(result.clarification).toMatch(/esclarecer/i);
  });

  it('rejects more than two skills, four operations, or eight tools', () => {
    expect(validateTurnPlan({ ...base, skillNames: ['a', 'b', 'c'] }).success).toBe(false);
    expect(validateTurnPlan({ ...base, requestedOperations: Array.from({ length: 5 }, (_, i) => ({ name: `read_${i}`, kind: 'read' as const })) }).success).toBe(false);
    expect(validateTurnPlan({ ...base, requestedTools: Array.from({ length: 9 }, (_, i) => `tool_${i}`) }).success).toBe(false);
  });

  it('rejects a write operation in a read turn', () => {
    const result = validateTurnPlan({ ...base, requestedOperations: [{ name: 'create_transaction', kind: 'mutation' }] });
    expect(result.success).toBe(false);
  });

  it('allows at most one structured planner correction', () => {
    expect(validateTurnPlan({ ...base, correctionCount: 1 }).success).toBe(true);
    expect(validateTurnPlan({ ...base, correctionCount: 2 }).success).toBe(false);
  });
});
