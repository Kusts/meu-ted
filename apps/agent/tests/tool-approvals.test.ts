import { describe, expect, it } from 'vitest';
import {
  requiresApproval,
  getApprovalRequirement,
  validateActorIntentForMutation,
} from '../src/safety/tool-approvals.js';

describe('Tool Approvals and Mutation Intent Safety (Task 7)', () => {
  it('correctly identifies tools requiring explicit approval', () => {
    expect(requiresApproval('pay_payable')).toBe(true);
    expect(requiresApproval('pay_statement')).toBe(true);
    expect(requiresApproval('deactivate_account')).toBe(true);
    expect(requiresApproval('list_accounts')).toBe(false);
    expect(requiresApproval('get_dashboard_summary')).toBe(false);
  });

  it('provides requirement metadata for approval-required tools', () => {
    const req = getApprovalRequirement('pay_payable');
    expect(req).toMatchObject({
      toolName: 'pay_payable',
      category: 'payment',
      requiresFreshApproval: true,
    });
  });

  it('blocks mutating tool calls when user asked for read-only summary (anti-prompt-injection)', () => {
    const check1 = validateActorIntentForMutation('Resuma meus gastos de ontem', 'pay_payable', true);
    expect(check1.allowed).toBe(false);
    expect(check1.reason).toContain('read-only summary');

    const check2 = validateActorIntentForMutation('Quais são minhas contas a pagar?', 'deactivate_account', true);
    expect(check2.allowed).toBe(false);

    const checkValid = validateActorIntentForMutation('Pagar a conta de luz agora', 'pay_payable', true);
    expect(checkValid.allowed).toBe(true);
  });
});
