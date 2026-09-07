import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FinanceChatAgent } from '../src/finance-chat-agent.js';

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    streamText: vi.fn(async () => ({ text: 'resposta-mockada' })),
  };
});

const { streamText } = await import('ai');
const mockedStreamText = streamText as unknown as ReturnType<typeof vi.fn>;

const snapshotBody = {
  runtime: {
    singleton: 'active',
    version: 3,
    securityEpoch: 2,
    activeProviderId: 'opencode-zen',
    activeModelId: 'opencode-zen:zen-1',
    activeProtocol: 'chat-completions',
    activeRolloutPercentage: 100,
    activeRolloutMode: 'all',
    fallbackProviderId: null,
    fallbackModelId: null,
    updatedBy: null,
  },
  activeProvider: null,
  activeModel: null,
  fallbackProvider: null,
  fallbackModel: null,
  activeDisabled: false,
  fallbackDisabled: false,
};

describe('onChatMessage cognitive wiring (Part A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(snapshotBody), { status: 200 }));
  });

  it('passes tools, stopWhen and the assembled system prompt to streamText', async () => {
    const agent = Object.create(FinanceChatAgent.prototype) as FinanceChatAgent;
    (agent as unknown as { env: unknown }).env = {
      API_ORIGIN: 'https://api.example.test',
      AGENT_CONFIG_TOKEN: 'config-token-test',
      OPENCODE_ZEN_API_KEY: 'zen-key-test',
    };
    const result = (await agent.onChatMessage({
      text: 'Qual o meu saldo?',
      intentionId: 'intent-wiring-1',
      actorId: 'actor-1',
    })) as { text?: string };

    expect(result).toEqual({ text: 'resposta-mockada' });
    expect(mockedStreamText).toHaveBeenCalledTimes(1);
    const args = mockedStreamText.mock.calls[0]![0] as {
      system: string;
      messages: Array<{ role: string; content: string }>;
      tools: Record<string, unknown>;
      stopWhen: unknown;
    };
    // Persona + golden rule + skills + playbook travel in system.
    expect(args.system).toContain('Meu Ted');
    expect(args.system).toContain('REGRA DE OURO');
    expect(args.system).toContain('saldo-extrato:');
    expect(args.system).toContain('PLAYBOOK FINANCEIRO');
    expect(args.system).toContain('get_balance');
    // Tools are actually exposed to the model (not just mentioned).
    // A balance question curates reads; mutations stay out of a read turn.
    expect(Object.keys(args.tools)).toContain('get_balance');
    expect(Object.keys(args.tools)).toContain('list_recent_transactions');
    expect(Object.keys(args.tools)).not.toContain('create_expense');
    // Compacted context travels as messages (last turn ends the array).
    expect(args.messages[args.messages.length - 1]).toMatchObject({ role: 'user', content: 'Qual o meu saldo?' });
    expect(args.stopWhen).toBeDefined();
  });

  it('curates mutation tools for a mutation turn', async () => {
    const agent = Object.create(FinanceChatAgent.prototype) as FinanceChatAgent;
    (agent as unknown as { env: unknown }).env = {
      API_ORIGIN: 'https://api.example.test',
      AGENT_CONFIG_TOKEN: 'config-token-test',
      OPENCODE_ZEN_API_KEY: 'zen-key-test',
    };
    await agent.onChatMessage({
      text: 'Lança um gasto de 50 reais no mercado hoje',
      intentionId: 'intent-wiring-2',
      actorId: 'actor-1',
    });
    expect(mockedStreamText).toHaveBeenCalledTimes(1);
    const args = mockedStreamText.mock.calls[0]![0] as {
      system: string;
      tools: Record<string, unknown>;
    };
    expect(Object.keys(args.tools)).toContain('create_expense');
    expect(args.system).toContain('registros:');
  });
});
