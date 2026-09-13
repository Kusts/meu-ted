import { describe, expect, it, vi } from 'vitest';
import {
  ConversationOrchestrator,
  normalizeBrokerTurn,
  normalizeRestTurn,
  normalizeSdkTurn,
  type TurnInput,
} from '../src/orchestration/conversation-orchestrator.js';

const fixture = {
  text: 'Qual é o meu saldo?',
  intentionId: 'intent-t2-1',
  traceId: 'trace-t2-1',
  actorId: 'actor-authenticated',
  workspaceId: 'workspace-authenticated',
  role: 'member' as const,
  deviceId: null,
  attachments: [],
};

describe('T2.1 ConversationOrchestrator', () => {
  it('normalizes REST, SDK and Broker into the same immutable input and ignores body identity', () => {
    const rest = normalizeRestTurn({ ...fixture, actorId: 'forged', workspaceId: 'forged-ws' }, fixture);
    const sdk = normalizeSdkTurn({ ...fixture, actorId: 'forged', workspaceId: 'forged-ws' }, fixture);
    const broker = normalizeBrokerTurn({ ...fixture, actorId: 'forged', workspaceId: 'forged-ws' }, fixture);

    expect({ ...rest, channel: undefined }).toEqual({ ...sdk, channel: undefined });
    expect({ ...sdk, channel: undefined }).toEqual({ ...broker, channel: undefined });
    expect(Object.isFrozen(rest)).toBe(true);
    expect(rest.actorId).toBe(fixture.actorId);
    expect(rest.workspaceId).toBe(fixture.workspaceId);
  });

  it('produces one deterministic plan and fail-closed policy regardless of channel', async () => {
    const orchestrator = new ConversationOrchestrator({
      plan: () => ({
        version: '2', mode: 'read', domain: 'accounts', skillNames: ['financial-analysis'],
        requestedOperations: [{ name: 'list_accounts', kind: 'read' }], missingFields: [], ambiguity: null, confidence: 1,
      }),
    });
    const inputs: TurnInput[] = [
      normalizeRestTurn(fixture, fixture),
      normalizeSdkTurn(fixture, fixture),
      normalizeBrokerTurn(fixture, fixture),
    ];
    const results = await Promise.all(inputs.map((input) => orchestrator.runTurn(input)));
    expect(results.map((result) => result.plan)).toEqual([results[0]!.plan, results[0]!.plan, results[0]!.plan]);
    expect(results.every((result) => result.policy.capability === 'financial.read')).toBe(true);
    expect(results.every((result) => result.policy.writeAuthorized === false)).toBe(true);
  });

  it('consumes the single provider response inside runTurn', async () => {
    const responseProvider = vi.fn(async () => 'resposta grounded');
    const orchestrator = new ConversationOrchestrator({ responseProvider });
    const result = await orchestrator.runTurn(normalizeRestTurn(fixture, fixture));

    expect(responseProvider).toHaveBeenCalledTimes(1);
    expect(result.response).toEqual({ text: 'resposta grounded' });
  });

  it('propagates provider failures instead of fabricating a successful deterministic response', async () => {
    const providerFailure = Object.assign(new Error('agent.provider_not_configured'), {
      code: 'agent.provider_not_configured',
      status: 503,
    });
    const orchestrator = new ConversationOrchestrator({
      responseProvider: async () => { throw providerFailure; },
    });

    await expect(orchestrator.runTurn(normalizeRestTurn(fixture, fixture))).rejects.toMatchObject({
      code: 'agent.provider_not_configured',
      status: 503,
    });
  });
});
