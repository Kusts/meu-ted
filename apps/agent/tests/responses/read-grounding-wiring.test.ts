import { describe, expect, it, vi } from 'vitest';
import {
  ConversationOrchestrator,
  normalizeRestTurn,
  type AuthenticatedIdentity,
} from '../../src/orchestration/conversation-orchestrator.js';
import type { EvidenceEnvelope } from '../../src/evidence/evidence-envelope.js';

const identity: AuthenticatedIdentity = {
  actorId: 'actor-authenticated',
  workspaceId: 'workspace-authenticated',
  role: 'member',
  deviceId: 'device-authenticated',
};

const readPlan = () => ({
  version: '2' as const,
  mode: 'read' as const,
  domain: 'accounts' as const,
  skillNames: ['saldo-extrato'],
  requestedOperations: [{ name: 'get_balance', kind: 'read' as const }],
  missingFields: [],
  ambiguity: null,
  confidence: 1,
});

const balanceEnvelope: EvidenceEnvelope = {
  version: '1',
  items: [{
    ref: 'account:acc-1',
    source: 'api.accounts',
    retrievedAt: new Date().toISOString(),
    status: 'ok',
    data: { balanceCents: 12345, accountName: 'Conta principal' },
  }],
};

describe('AGENT-005 read-path grounding wiring', () => {
  it('renders balance deterministically from evidence without calling the provider', async () => {
    const responseProvider = vi.fn(async () => 'should never be called');
    const events: string[] = [];
    const orchestrator = new ConversationOrchestrator({
      plan: readPlan,
      evidenceProvider: async () => balanceEnvelope,
      responseProvider,
      events: (type) => events.push(type),
    });
    const result = await orchestrator.runTurn(normalizeRestTurn({ text: 'qual meu saldo?', intentionId: 'intent-balance' }, identity));
    expect(responseProvider).not.toHaveBeenCalled();
    expect(result.response?.text).toContain('Conta principal');
    expect(result.response?.text).toContain('123,45');
    expect(events).toContain('turn.started');
    expect(events).toContain('plan.validated');
    expect(events).toContain('turn.completed');
  });

  it('routes non-deterministic provider text through createGroundedResponse with the envelope', async () => {
    const statementEnvelope: EvidenceEnvelope = {
      version: '1',
      items: [{
        ref: 'statement',
        source: 'api.transactions',
        retrievedAt: new Date().toISOString(),
        status: 'ok',
        data: { note: 'sem formato determinístico', hint: 'Conta principal' },
      }],
    };
    const orchestrator = new ConversationOrchestrator({
      plan: () => ({ ...readPlan(), domain: 'general' as const }),
      evidenceProvider: async () => statementEnvelope,
      responseProvider: async () => 'Resumo na Conta principal.',
      events: () => undefined,
    });
    const result = await orchestrator.runTurn(normalizeRestTurn({ text: 'resuma', intentionId: 'intent-grounded' }, identity));
    // 'Conta principal' is supported by the envelope → grounded text passes through.
    expect(result.response?.text).toBe('Resumo na Conta principal.');
  });

  it('retries once on unsupported claims, then falls back safe with a grounding.rejected event', async () => {
    const events: string[] = [];
    const unshapedEnvelope: EvidenceEnvelope = {
      version: '1',
      items: [{
        ref: 'note',
        source: 'api.notes',
        retrievedAt: new Date().toISOString(),
        status: 'ok',
        data: { note: 'sem formato determinístico', hint: 'Conta principal' },
      }],
    };
    const correctionProvider = vi.fn(async () => 'Seu saldo é R$ 777,77 na Conta principal.');
    const orchestrator = new ConversationOrchestrator({
      plan: () => ({ ...readPlan(), domain: 'general' as const }),
      evidenceProvider: async () => unshapedEnvelope,
      responseProvider: async () => 'Seu saldo é R$ 999,99 na Conta principal.',
      correctionProvider,
      events: (type) => events.push(type),
    });
    const result = await orchestrator.runTurn(normalizeRestTurn({ text: 'resuma', intentionId: 'intent-retry' }, identity));
    expect(correctionProvider).toHaveBeenCalledTimes(1);
    expect(result.response?.text).toMatch(/Não foi possível consultar/);
    expect(result.response?.text).not.toMatch(/999,99|777,77/);
    expect(events).toContain('agent.grounding.rejected');
    expect(events).toContain('turn.completed');
  });

  it('renders the statement list deterministically from evidence', async () => {
    const envelope: EvidenceEnvelope = {
      version: '1',
      items: [{
        ref: 'statement',
        source: 'api.transactions',
        retrievedAt: new Date().toISOString(),
        status: 'ok',
        data: [
          { description: 'Mercado', date: '2026-09-10', amountCents: -1234 },
          { description: 'Salário', date: '2026-09-05', amountCents: 500000 },
        ],
      }],
    };
    const orchestrator = new ConversationOrchestrator({
      plan: () => ({ ...readPlan(), domain: 'transactions' as const }),
      evidenceProvider: async () => envelope,
      responseProvider: async () => 'nunca usado',
      events: () => undefined,
    });
    const result = await orchestrator.runTurn(normalizeRestTurn({ text: 'extrato', intentionId: 'intent-stmt' }, identity));
    expect(result.response?.text).toContain('Mercado');
    expect(result.response?.text).toContain('Salário');
  });

  it('keeps legacy pass-through when no evidence provider is wired', async () => {
    const orchestrator = new ConversationOrchestrator({
      plan: readPlan,
      responseProvider: async () => 'resposta legada',
    });
    const result = await orchestrator.runTurn(normalizeRestTurn({ text: 'saldo?', intentionId: 'intent-legacy' }, identity));
    expect(result.response).toEqual({ text: 'resposta legada' });
  });
});
