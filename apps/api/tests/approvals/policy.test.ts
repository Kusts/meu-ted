import { describe, expect, it } from 'vitest';
import { createApprovalPolicy } from '../../src/approvals/policy.js';

describe('approval policy', () => {
  it('requires approval at configurable threshold', () => {
    const policy = createApprovalPolicy({ highValueLimitCents: 50_000 });

    expect(policy.evaluate({ operation: 'transactions.expense.create', amountCents: 50_000, destructive: false }))
      .toEqual({ requiresApproval: true, reason: 'high_value' });
  });

  it('requires approval for destructive operations below threshold', () => {
    const policy = createApprovalPolicy({ highValueLimitCents: 50_000 });

    expect(policy.evaluate({ operation: 'transactions.delete', amountCents: 1, destructive: true }))
      .toEqual({ requiresApproval: true, reason: 'destructive' });
  });

  it('uses workspace-specific threshold when configured', () => {
    const policy = createApprovalPolicy({ highValueLimitCents: 50_000, limitsByWorkspace: { 'workspace-1': 1_000 } });

    expect(policy.evaluate({ workspaceId: 'workspace-1', operation: 'transactions.expense.create', amountCents: 1_000, destructive: false }))
      .toEqual({ requiresApproval: true, reason: 'high_value' });
  });

  it('does not require approval for ordinary low-value writes', () => {
    const policy = createApprovalPolicy({ highValueLimitCents: 50_000 });

    expect(policy.evaluate({ operation: 'transactions.expense.create', amountCents: 49_999, destructive: false }))
      .toEqual({ requiresApproval: false });
  });
});
