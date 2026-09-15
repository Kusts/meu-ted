import { describe, expect, it, vi } from 'vitest';
import {
  ConversationOrchestrator,
  normalizeRestTurn,
  type AuthenticatedIdentity,
} from '../../src/orchestration/conversation-orchestrator.js';
import { MutationApiClient } from '../../src/mutations/mutation-api-client.js';
import { deriveIdempotencyKey } from '../../src/tools/intention-ledger.js';
import type { EntityReader } from '../../src/mutations/entity-resolver.js';

const identity: AuthenticatedIdentity = {
  actorId: 'actor-authenticated',
  workspaceId: 'workspace-authenticated',
  role: 'member',
  deviceId: 'device-authenticated',
};

const ACCOUNT = { id: '00000000-0000-4000-8000-000000000001', name: 'Nubank' };
const CATEGORY = { id: '00000000-0000-4000-8000-000000000011', name: 'Mercado' };

const mutationPlan = () => ({
  version: '2' as const,
  mode: 'mutation-proposal' as const,
  domain: 'transactions' as const,
  skillNames: ['transactions'],
  requestedOperations: [{ name: 'transactions.expense.create', kind: 'mutation' as const }],
  missingFields: [] as readonly string[],
  ambiguity: null,
  confidence: 1,
});

const reader: EntityReader = {
  listAccounts: async () => [ACCOUNT],
  listCategories: async () => [CATEGORY],
};

const mockClient = () => {
  const request = vi.fn();
  return { api: new MutationApiClient({ request }), request };
};

describe('SPEC §7.7/§7.7.1: stable per-turn idempotency (Agent)', () => {
  it('RED: repeated delivery of the same messageId normalizes to the same intentionId', () => {
    const first = normalizeRestTurn({ text: 'Gastei R$ 50 no mercado', intentionId: 'msg-stable-1' }, identity);
    const second = normalizeRestTurn({ text: 'Gastei R$ 50 no mercado', intentionId: 'msg-stable-1' }, identity);
    expect(second.intentionId).toBe(first.intentionId);
  });

  it('RED: messageId alias derives the intentionId deterministically', () => {
    const input = normalizeRestTurn({ text: 'Gastei R$ 50 no mercado', messageId: 'msg-alias-9' }, identity);
    expect(input.intentionId).toBe('msg-alias-9');
  });

  it('RED: missing intentionId/messageId fails closed (no Date.now/random fallback)', () => {
    expect(() => normalizeRestTurn({ text: 'Gastei R$ 50 no mercado' }, identity)).toThrow('agent.invalid_message');
  });

  it('RED: same intentionId derives the same proposalIdempotencyKey via deriveIdempotencyKey', async () => {
    const { api, request } = mockClient();
    request.mockImplementation(async (_method: string, path: string, opts?: { idempotencyKey?: string }) => {
      if (path === '/pending-operations/v2/propose') {
        const prior = request.mock.calls.length;
        return { id: 'pending-1', existing: prior > 1 };
      }
      throw new Error(`unexpected ${path}`);
    });
    const orchestrator = new ConversationOrchestrator({
      mutationApiClient: api,
      plan: mutationPlan,
      entityReader: reader,
    });
    const expected = deriveIdempotencyKey(
      identity.workspaceId,
      'msg-stable-7',
      'transactions.expense.create',
    );

    const first = await orchestrator.runTurn(
      normalizeRestTurn({ text: 'Gastei R$ 50 no mercado', intentionId: 'msg-stable-7' }, identity),
    );
    const second = await orchestrator.runTurn(
      normalizeRestTurn({ text: 'Gastei R$ 50 no mercado', intentionId: 'msg-stable-7' }, identity),
    );

    // A repeated delivery is exactly one logical proposal: the API dedup
    // returns the existing operation — treated as success, never an error.
    expect(first.mutation?.operationId).toBe('pending-1');
    expect(second.mutation?.operationId).toBe('pending-1');
    expect(request).toHaveBeenCalledTimes(2);
    const seenKeys = request.mock.calls.map((call) => (call[2] as { idempotencyKey?: string } | undefined)?.idempotencyKey);
    expect(seenKeys[0]).toBe(expected);
    expect(seenKeys[1]).toBe(expected);
  });

  it('RED: idempotency.conflict surfaces only on genuine payload collision', async () => {
    const { api, request } = mockClient();
    request.mockRejectedValue(
      Object.assign(new Error('Chave de idempotência já utilizada com proposta diferente.'), {
        code: 'idempotency.conflict',
      }),
    );
    const orchestrator = new ConversationOrchestrator({
      mutationApiClient: api,
      plan: mutationPlan,
      entityReader: reader,
    });
    await expect(
      orchestrator.runTurn(normalizeRestTurn({ text: 'Gastei R$ 50 no mercado', intentionId: 'msg-conflict-1' }, identity)),
    ).rejects.toMatchObject({ code: 'idempotency.conflict' });
  });
});
