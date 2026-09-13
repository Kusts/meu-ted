import { describe, expect, it, vi } from 'vitest';
import {
  requiresApproval,
  APPROVAL_REQUIRED_TOOLS,
} from '../src/safety/tool-approvals.js';
import { checkToolExecutionPolicy } from '../src/tools/api-tool-helpers.js';
import { buildExposedTools } from '../src/agent-config/tools.js';

describe('C-03: mutation gate fail-closed', () => {
  it('todas as tools destrutivas exigem approval fresco', () => {
    for (const name of [
      'pay_statement',
      'pay_payable',
      'unpay_payable',
      'cancel_payable',
      'cancel_account_payable',
      'deactivate_account',
      'deactivate_category',
      'cancel_card_purchase',
      'delete_transaction',
      'cancel_goal',
      'mark_account_paid',
    ]) {
      expect(requiresApproval(name), name).toBe(true);
      expect(APPROVAL_REQUIRED_TOOLS.get(name)?.requiresFreshApproval, name).toBe(true);
    }
    expect(requiresApproval('list_accounts')).toBe(false);
    expect(requiresApproval('get_balance')).toBe(false);
  });

  it('checkToolExecutionPolicy nega writes sem gate explícito (fail-closed)', () => {
    expect(checkToolExecutionPolicy('create_expense', 'write')).toMatchObject({ blocked: true });
    expect(checkToolExecutionPolicy('delete_transaction', 'write')).toMatchObject({ blocked: true });
    // Reads continuam livres.
    expect(checkToolExecutionPolicy('get_balance', 'read')).toBeNull();
    expect(checkToolExecutionPolicy('list_accounts', 'read')).toBeNull();
  });

  it('checkToolExecutionPolicy permanece fechado mesmo com objeto de aprovação legado', () => {
    const gate = { mutationApproved: true as const, approvedTool: 'create_expense' };
    expect(checkToolExecutionPolicy('create_expense', 'write', gate)).toMatchObject({ blocked: true });
    // Gate de outra tool não autoriza (sem reuso cruzado).
    expect(checkToolExecutionPolicy('delete_transaction', 'write', gate)).toMatchObject({ blocked: true });
    // Gate malformado não autoriza.
    expect(checkToolExecutionPolicy('create_expense', 'write', { mutationApproved: true })).toMatchObject({
      blocked: true,
    });
  });

  it('wrapper exposto bloqueia deactivate_category até MutationExecutor V2', async () => {
    const realFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const base = {
        delegatedToken: 'delegated-test-token',
        apiOrigin: 'https://api.example.test',
        workspaceId: 'ws-1',
        actorId: 'actor-1',
        intentionId: 'intent-1',
      };
      const pending = buildExposedTools(['deactivate_category'], {
        ...base,
        lastUserMessage: 'quero desativar a categoria lazer',
      });
      const asked = (await (
        pending['deactivate_category'] as { execute: (p: unknown) => Promise<unknown> }
      ).execute({ categoryId: '00000000-0000-4000-8000-000000000001' })) as { blocked?: boolean };
      expect(asked.blocked).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();

      const confirmed = buildExposedTools(['deactivate_category'], {
        ...base,
        lastUserMessage: 'sim, pode desativar a categoria lazer',
      });
      const result = await (
        confirmed['deactivate_category'] as { execute: (p: unknown) => Promise<unknown> }
      ).execute({ categoryId: '00000000-0000-4000-8000-000000000001' });
      expect(result).toMatchObject({ blocked: true });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
