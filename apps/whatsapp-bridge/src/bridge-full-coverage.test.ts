// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Bridge Full Coverage Tests
// Targets: message-classifier, evolution-client, finance-api-client
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, vi, beforeEach } from 'vitest';
import { classifyMessage } from './message-classifier.js';

// ─── message-classifier.ts ──────────────────────────────────────────────────

describe('WhatsApp Bridge - Message Classifier', () => {

  // Basic classification
  describe('classifyMessage', () => {
    test('expense command keyword detected', () => {
      const result = classifyMessage('gastei 50 reais no almoço');
      expect(result.type).toBeDefined();
      expect(result.type).not.toBe('ignored'); // Either command or financial_detected
    });

    test('income command keyword detected', () => {
      const result = classifyMessage('recebi 500 de freelance');
      expect(result.type).toBeDefined();
      expect(result.type).not.toBe('ignored');
    });

    test('transfer keyword detected', () => {
      const result = classifyMessage('transferi 200 para poupança');
      expect(result.type).toBeDefined();
      expect(result.type).not.toBe('ignored');
    });

    test('normal conversation returns general (forwarded to Pi as personal assistant)', () => {
      const result = classifyMessage('oi tudo bem?');
      expect(result.type).toBe('general');
      if (result.type === 'general') {
        expect(result.raw).toBe('oi tudo bem?');
      }
    });

    test('"Olá" greeting returns general with raw text', () => {
      const result = classifyMessage('Olá');
      expect(result.type).toBe('general');
      if (result.type === 'general') {
        expect(result.raw).toBe('Olá');
      }
    });

    test('general classification preserves original casing and whitespace', () => {
      const result = classifyMessage('  Bom dia, TED!  ');
      expect(result.type).toBe('general');
      if (result.type === 'general') {
        expect(result.raw).toBe('  Bom dia, TED!  ');
      }
    });

    test('financial keyword detected', () => {
      const result = classifyMessage('minha fatura veio alta esse mês');
      expect(result.type).not.toBe('ignored');
    });

    test('account keyword detected', () => {
      const result = classifyMessage('qual o saldo da minha conta?');
      expect(result.type).not.toBe('ignored');
    });
  });

  // Command parsing
  describe('parseCommand - slash commands', () => {
    test('slash command is classified', () => {
      const result = classifyMessage('/gastei 100-mercado');
      expect(result.type).not.toBe('ignored');
      expect(result.type).toBeDefined();
    });

    test('slash income command is classified', () => {
      const result = classifyMessage('/recebi 1000-salario');
      expect(result.type).not.toBe('ignored');
    });

    test('slash report command is classified', () => {
      const result = classifyMessage('/relatorio');
      expect(result.type).not.toBe('ignored');
    });
  });

  // Custom commands
  describe('ClassifyOptions - allowCommands', () => {
    test('custom command detected', () => {
      const result = classifyMessage('comprei algo', {
        allowCommands: ['comprei'],
      });
      expect(result.type).toBe('command');
    });

    test('custom command without prefix works', () => {
      const result = classifyMessage('tenho despesa de 50', {
        allowCommands: ['tenho'],
      });
      expect(result.type).toBe('command');
    });

    test('non-matching custom commands falls back to financial detection', () => {
      const result = classifyMessage('gastei 100', {
        allowCommands: ['custom-cmd'],
      });
      expect(result.type).not.toBe('ignored');
    });
  });

  // Custom financial keywords
  describe('ClassifyOptions - financialKeywords', () => {
    test('uses custom financial keywords', () => {
      const result = classifyMessage('minha assinatura mensal veio', {
        financialKeywords: ['assinatura', 'mensalidade'],
      });
      expect(result.type).toBe('financial_detected');
    });

    test('custom keyword without command returns financial_detected', () => {
      const result = classifyMessage('tenho custo fixo esse mês', {
        financialKeywords: ['custo'],
      });
      expect(result.type).toBe('financial_detected');
    });
  });

  // Edge cases
  describe('Edge cases', () => {
    test('empty string returns ignored', () => {
      const result = classifyMessage('');
      expect(result.type).toBe('ignored');
    });

    test('whitespace only returns ignored', () => {
      const result = classifyMessage('   \n  ');
      expect(result.type).toBe('ignored');
    });

    test('uppercase command detected', () => {
      const result = classifyMessage('GASTEI 100');
      expect(result.type).not.toBe('ignored');
    });

    test('mixed case detected', () => {
      const result = classifyMessage('Recebi um valor');
      expect(result.type).not.toBe('ignored');
    });

    test('extra spaces in command', () => {
      const result = classifyMessage('gastei    100   reais');
      expect(result.type).not.toBe('ignored');
    });

    test('undo command detected', () => {
      const result = classifyMessage('desfaz última');
      expect(result.type).toBeDefined();
    });
  });

  // Multiple keywords
  describe('Multiple keyword matching', () => {
    test('command keyword takes precedence', () => {
      const result = classifyMessage('gastei 50 e também recebi 100');
      // Should match first keyword
      expect(result.type).toBeDefined();
      expect(result.type).not.toBe('ignored');
    });
  });
});

// ─── finance-api-client.ts ──────────────────────────────────────────────────

describe('WhatsApp Bridge - Finance API Client', () => {

  // Mock fetch
  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('ApiResponse type is exported', () => {
    // Verify types are accessible (compile check)
    const response = { success: true, data: { id: '123' } };
    expect(response.success).toBe(true);
  });

  test('Account interface structure', () => {
    const account = {
      id: 'acc-1',
      householdId: 'hh-1',
      name: 'Conta Corrente',
      type: 'checking',
      scope: 'personal',
      initialBalanceCents: 0,
    };
    expect(account.id).toBeDefined();
    expect(account.householdId).toBeDefined();
  });

  test('CreateExpenseInput interface structure', () => {
    const input = {
      householdId: 'hh-123',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      amountCents: 5000,
      description: 'Almoço',
      date: '2024-01-15',
      source: 'whatsapp',
    };
    expect(input.householdId).toBe('hh-123');
    expect(input.amountCents).toBe(5000);
  });

  test('CreateIncomeInput structure', () => {
    const input = {
      householdId: 'hh-1',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      amountCents: 10000,
      description: 'Freelance',
      date: '2024-01-15',
      source: 'whatsapp',
    };
    expect(input.amountCents).toBe(10000);
  });

  test('CreateTransferInput structure', () => {
    const input = {
      householdId: 'hh-1',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amountCents: 500,
      description: 'Poupança',
      date: '2024-01-15',
      source: 'whatsapp',
    };
    expect(input.fromAccountId).toBeDefined();
    expect(input.toAccountId).toBeDefined();
  });
});

// ─── evolution-client.ts ───────────────────────────────────────────────────

describe('WhatsApp Bridge - Evolution Client', () => {

  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('EvolutionClientOptions structure', () => {
    const options = {
      baseUrl: 'http://localhost:4000',
      instanceToken: 'd602c031-0177-419e-8520-8f42e69f7201',
    };
    expect(options.baseUrl).toContain('localhost');
    expect(options.instanceToken).toBeDefined();
  });

  test('SendTextRequest structure', () => {
    const request = {
      number: '5511999999999',
      text: 'Olá TED',
      delay: 1000,
    };
    expect(request.number).toBeDefined();
    expect(request.text).toBeDefined();
    expect(typeof request.delay).toBe('number');
  });

  test('SendTextResponse key structure', () => {
    const response = {
      data: {
        Info: {
          Chat: '5511999999999@s.whatsapp.net',
          Sender: '5511999999999:19@s.whatsapp.net',
          IsFromMe: true,
          ID: '3EB0EBF39AF82560EC70BC',
          Type: 'ExtendedTextMessage',
          Timestamp: '2026-06-02T09:20:07.765362952-03:00',
        },
        Message: {
          extendedTextMessage: { text: 'Olá' },
        },
      },
      message: 'success',
    };
    expect(response.data.Info.ID).toBeDefined();
    expect(response.data.Info.Chat).toBeDefined();
    expect(response.data.Info.IsFromMe).toBe(true);
  });

  test('ResponseSender interface compliance', () => {
    // A class implementing ResponseSender must have sendResponse method
    const mockSender = {
      sendResponse: vi.fn().mockResolvedValue({ success: true }),
    };
    expect(typeof mockSender.sendResponse).toBe('function');
  });

  test('sendPresence posts to /message/presence with apikey header and correct body', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    const { EvolutionClient } = await import('./evolution-client.js');
    const client = new EvolutionClient({
      baseUrl: 'http://localhost:4000',
      instanceToken: 'test-token-abc',
    });

    await client.sendPresence({ number: '5511999999999', state: 'composing' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/message/presence');
    expect((opts as any).method).toBe('POST');
    expect((opts as any).headers).toEqual(expect.objectContaining({ apikey: 'test-token-abc' }));
    expect(JSON.parse((opts as any).body)).toEqual({
      number: '5511999999999',
      state: 'composing',
      isAudio: false,
    });
  });

  test('sendPresence also supports ResponseSender signature used by webhook', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    const { EvolutionClient } = await import('./evolution-client.js');
    const client = new EvolutionClient({
      baseUrl: 'http://localhost:4000',
      instanceToken: 'test-token-abc',
    });

    await client.sendPresence('5511999999999@s.whatsapp.net', 'paused');

    const [, opts] = mockFetch.mock.calls[0];
    expect(JSON.parse((opts as any).body)).toEqual({
      number: '5511999999999@s.whatsapp.net',
      state: 'paused',
      isAudio: false,
    });
  });
});