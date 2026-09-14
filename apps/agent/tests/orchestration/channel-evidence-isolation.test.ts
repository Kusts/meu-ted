import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChannelGrounding } from '../../src/orchestration/channel-evidence.js';
import type { TurnInput, TurnPlan } from '../../src/orchestration/conversation-orchestrator.js';
import * as apiClient from '../../src/tools/api-client.js';

const plan: TurnPlan = {
  version: '2',
  mode: 'read',
  domain: 'accounts',
  skillNames: ['s'],
  requestedOperations: [{ name: 'get_balance', kind: 'read' }],
  missingFields: [],
  ambiguity: null,
  confidence: 1,
};

const inputFor = (workspaceId: string, intentionId: string): TurnInput => ({
  intentionId,
  traceId: intentionId,
  text: 'qual meu saldo?',
  actorId: `actor-${workspaceId}`,
  workspaceId,
  role: 'member',
  deviceId: null,
  attachments: [],
  channel: 'pwa-rest',
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('FINDING 1 (CRITICAL): per-turn delegated tokens are isolated across concurrent workspaces', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('two interleaved turns use their own workspace token — never each other\'s', async () => {
    const seen: Array<{ delegatedToken?: string; apiOrigin?: string }> = [];
    const requestSpy = vi.spyOn(apiClient, 'requestPiApiJson').mockImplementation(async (_method, _path, opts) => {
      seen.push({ delegatedToken: opts?.delegatedToken, apiOrigin: opts?.apiOrigin });
      // Force a real interleave window: both turns are in flight together.
      await delay(30);
      const token = opts?.delegatedToken;
      const tag = token === 'token-A' ? 'Conta A' : token === 'token-B' ? 'Conta B' : 'Conta ESTRANHA';
      return { items: [{ id: 'acc-1', name: tag, balanceCents: 100, status: 'active' }] } as unknown as Record<string, unknown>;
    });

    const grounding = createChannelGrounding({
      respond: async () => 'unused',
      apiOrigin: 'https://api.test.local',
      readToken: async (input) => (input.workspaceId === 'ws-A' ? 'token-A' : 'token-B'),
    });

    const [envelopeA, envelopeB] = await Promise.all([
      grounding.evidenceProvider(inputFor('ws-A', 'intent-A'), plan),
      grounding.evidenceProvider(inputFor('ws-B', 'intent-B'), plan),
    ]);

    const textA = JSON.stringify(envelopeA);
    const textB = JSON.stringify(envelopeB);
    // Each envelope carries only its own workspace data.
    expect(textA).toContain('Conta A');
    expect(textA).not.toContain('Conta B');
    expect(textB).toContain('Conta B');
    expect(textB).not.toContain('Conta A');

    // Every underlying request carried an explicit per-turn token — no
    // cross-usage and no unauthenticated fallback.
    expect(seen.length).toBeGreaterThanOrEqual(2);
    const tokens = seen.map((s) => s.delegatedToken);
    expect(tokens).toContain('token-A');
    expect(tokens).toContain('token-B');
    expect(tokens).not.toContain(undefined);
    expect(new Set(tokens).size).toBe(2);
    for (const s of seen) {
      expect(s.apiOrigin).toBe('https://api.test.local');
    }
    requestSpy.mockRestore();
  });

  it('the evidence path never mutates the shared global token slot', async () => {
    apiClient.clearGlobalApiContext();
    const requestSpy = vi.spyOn(apiClient, 'requestPiApiJson').mockImplementation(async () =>
      ({ items: [{ id: 'acc-1', name: 'Conta', balanceCents: 100, status: 'active' }] }) as unknown as Record<string, unknown>,
    );
    const grounding = createChannelGrounding({
      respond: async () => 'unused',
      readToken: async () => 'token-turn',
    });
    await grounding.evidenceProvider(inputFor('ws-A', 'intent-global-check'), plan);
    // A concurrent turn from another workspace must not observe this token
    // through the module-global fallback.
    expect(apiClient.getGlobalApiContext().delegatedToken).toBeUndefined();
    requestSpy.mockRestore();
  });

  it('mint failure leaves no stale token behind: the next read goes out with NO token', async () => {
    // Simulate a previous turn's token lingering in the legacy global slot:
    // the evidence path must not pick it up when minting fails.
    apiClient.setGlobalApiContext({ delegatedToken: 'stale-token-from-previous-turn' });
    const seen: Array<{ delegatedToken?: string }> = [];
    const requestSpy = vi.spyOn(apiClient, 'requestPiApiJson').mockImplementation(async (_method, _path, opts) => {
      seen.push({ delegatedToken: opts?.delegatedToken });
      throw Object.assign(new Error('HTTP 401'), { statusCode: 401, code: 'api.request_failed' });
    });
    try {
      const grounding = createChannelGrounding({
        respond: async () => 'unused',
        readToken: async () => {
          throw new Error('mint failed');
        },
      });
      const envelope = await grounding.evidenceProvider(inputFor('ws-victim', 'intent-mint-fail'), plan);
      // Fail-closed evidence, and every request went out tokenless rather
      // than with the previous turn's token.
      expect(seen.length).toBeGreaterThanOrEqual(1);
      for (const s of seen) {
        expect(s.delegatedToken).toBeUndefined();
      }
      const statuses = (envelope?.items ?? []).map((item) => item.status);
      expect(statuses.length).toBeGreaterThan(0);
      expect(statuses.every((s) => s === 'error')).toBe(true);
    } finally {
      requestSpy.mockRestore();
      apiClient.clearGlobalApiContext();
    }
  });
});
