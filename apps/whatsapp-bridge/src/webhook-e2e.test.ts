// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Bridge E2E Test - Financial messages via Evolution GO API
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  processWebhook,
  validateEventType,
  validateInstanceToken,
  extractPhone,
  extractMessageText,
  buildSourceMessage,
  type WebhookPayload,
  type SourceMessage,
} from './webhook-handler.js';
import { FakeEvolutionClient } from './evolution-client.js';
import { FakePiClient } from './pi-rpc-client.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — Evolution GO payload format
// ─────────────────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<{
  event: string;
  instanceToken: string;
  fromMe: boolean;
  chat: string;
  sender: string;
  isGroup: boolean;
  messageText: string;
  pushName: string;
  messageId: string;
}> = {}): WebhookPayload {
  return {
    event: overrides.event ?? 'Message',
    instanceId: 'd602c031-0177-419e-8520-8f42e69f7201',
    instanceToken: overrides.instanceToken ?? 'test-instance-token',
    data: {
      Info: {
        Chat: overrides.chat ?? '5511999999999@s.whatsapp.net',
        Sender: overrides.sender ?? '5511999999999:19@s.whatsapp.net',
        IsFromMe: overrides.fromMe ?? false,
        IsGroup: overrides.isGroup ?? false,
        ID: overrides.messageId ?? `3EB0${Date.now()}-${Math.random().toString(36).slice(2)}`,
        Type: 'text',
        PushName: overrides.pushName ?? 'Test User',
        Timestamp: new Date().toISOString(),
      },
      Message: {
        conversation: overrides.messageText,
      },
    },
  };
}

// Mock registry
const mockRegistry = {
  isPhoneRegistered: (phone: string) => {
    return phone === '5511999999999' || phone.startsWith('12036304894');
  },
  isGroupAllowed: (groupId: string) => groupId === '12036304894@g.us',
  getHouseholdIdForGroup: (groupId: string) =>
    groupId === '12036304894@g.us' ? 'household-123' : null,
};

// Mock source store
const mockSourceStore = {
  processed: new Set<string>(),
  isProcessed(msgId: string): boolean {
    return this.processed.has(msgId);
  },
  markProcessed(msg: SourceMessage): void {
    this.processed.add(msg.providerMessageId);
  },
  saveError(msgId: string, _error: string): void {
    this.processed.add(msgId);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Webhook Handler - E2E', () => {
  let evolutionClient: FakeEvolutionClient;
  let piClient: FakePiClient;

  beforeEach(() => {
    evolutionClient = new FakeEvolutionClient();
    piClient = new FakePiClient({ success: true, data: { message: '✅ Registro criado!' } });
    mockSourceStore.processed.clear();
  });

  describe('processWebhook - general conversation (TED as personal assistant)', () => {
    it('classifies "Olá" as general and forwards to Pi + Evolution', async () => {
      const payload = makePayload({
        chat: '5511999999999@s.whatsapp.net',
        isGroup: false,
        sender: '5511999999999:19@s.whatsapp.net',
        messageText: 'Olá',
      });

      const result = await processWebhook(
        payload,
        'test-instance-token',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      // Must NOT be ignored — TED must respond as personal assistant
      expect(result.success).toBe(true);
      expect(result.classification.type).toBe('general');
      // Pi must be invoked with raw text
      expect(piClient.callLog).toHaveLength(1);
      expect(piClient.callLog[0].message).toBe('Olá');
      // Evolution must send the Pi response back to the user
      expect(evolutionClient.sentMessages).toHaveLength(1);
      expect(evolutionClient.sentMessages[0].message).toBe('✅ Registro criado!');
      expect(evolutionClient.sentMessages[0].groupId).toBe('5511999999999@s.whatsapp.net');
    });

    it('classifies casual greeting in group as general and forwards to Pi', async () => {
      const payload = makePayload({
        chat: '12036304894@g.us',
        isGroup: true,
        sender: '5511999999999:19@s.whatsapp.net',
        messageText: 'Oi pessoal, tudo bem?',
      });

      const result = await processWebhook(
        payload,
        'test-instance-token',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      expect(result.success).toBe(true);
      expect(result.classification.type).toBe('general');
      expect(piClient.callLog).toHaveLength(1);
      expect(piClient.callLog[0].message).toBe('Oi pessoal, tudo bem?');
      expect(evolutionClient.sentMessages).toHaveLength(1);
    });

    it('sends friendly fallback for general messages when Pi RPC is disabled', async () => {
      piClient = new FakePiClient({
        success: false,
        reason: 'Pi RPC desabilitado em modo desenvolvimento',
      });
      const payload = makePayload({
        chat: '5511999999999@s.whatsapp.net',
        isGroup: false,
        sender: '5511999999999:19@s.whatsapp.net',
        messageText: 'Ola',
      });

      const result = await processWebhook(
        payload,
        'test-instance-token',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      expect(result.success).toBe(true);
      expect(result.classification.type).toBe('general');
      expect(evolutionClient.sentMessages).toHaveLength(1);
      expect(evolutionClient.sentMessages[0].message).toBe(
        'Oi! Sou o TED, seu assistente pessoal de finanças. Pode me mandar gastos, dúvidas, metas ou qualquer pergunta.'
      );
    });

    it('keeps raw error for financial commands when Pi RPC is disabled', async () => {
      piClient = new FakePiClient({
        success: false,
        reason: 'Pi RPC desabilitado em modo desenvolvimento',
      });
      const payload = makePayload({
        chat: '12036304894@g.us',
        isGroup: true,
        sender: '5511999999999:19@s.whatsapp.net',
        messageText: 'Gastei 50 reais no mercado',
      });

      const result = await processWebhook(
        payload,
        'test-instance-token',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      expect(result.success).toBe(true);
      expect(result.classification.type).toBe('command');
      expect(evolutionClient.sentMessages).toHaveLength(1);
      expect(evolutionClient.sentMessages[0].message).toBe('❌ Pi RPC desabilitado em modo desenvolvimento');
    });
  });

  describe('processWebhook - financial message', () => {
    it('processes financial message, calls Pi RPC, sends response via Evolution', async () => {
      const payload = makePayload({
        chat: '12036304894@g.us',
        isGroup: true,
        sender: '5511999999999:19@s.whatsapp.net',
        messageText: 'Gastei 50 reais no mercado',
      });

      const result = await processWebhook(
        payload,
        'test-instance-token',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      expect(result.success).toBe(true);
      expect(['command', 'financial_detected']).toContain(result.classification.type);
      expect(piClient.callLog).toHaveLength(1);
      expect(piClient.callLog[0].message).toBe('Gastei 50 reais no mercado');
      expect(evolutionClient.sentMessages).toHaveLength(1);
      expect(evolutionClient.sentMessages[0].message).toBe('✅ Registro criado!');
      expect(evolutionClient.sentMessages[0].groupId).toBe('12036304894@g.us');
    });

    it('message ignored if IsFromMe is true', async () => {
      const payload = makePayload({
        fromMe: true,
        messageText: 'Any message',
      });

      const result = await processWebhook(
        payload,
        'test-instance-token',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      expect(result.success).toBe(true);
      expect(result.classification.type).toBe('ignored');
      expect(result.reason).toBe('mensagem própria ignorada');
      expect(piClient.callLog).toHaveLength(0);
      expect(evolutionClient.sentMessages).toHaveLength(0);
    });

    it('duplicate message ignored via source store', async () => {
      const msgId = `3EB0-duplicate-msg-id`;
      const payload1 = makePayload({
        chat: '12036304894@g.us',
        isGroup: true,
        messageText: 'gastei 50 no mercado',
        messageId: msgId,
      });

      const result1 = await processWebhook(
        payload1,
        'test-instance-token',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );
      expect(result1.success).toBe(true);

      const payload2 = makePayload({
        chat: '12036304894@g.us',
        isGroup: true,
        messageText: 'gastei 50 no mercado',
        messageId: msgId,
      });

      const result2 = await processWebhook(
        payload2,
        'test-instance-token',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      expect(result2.success).toBe(true);
      expect(result2.reason).toBe('mensagem duplicada');
      expect(piClient.callLog).toHaveLength(1);
    });

    it('group not allowed rejected', async () => {
      const payload = makePayload({
        chat: 'unknown-group@g.us',
        isGroup: true,
        messageText: 'Any message',
      });

      const result = await processWebhook(
        payload,
        'test-instance-token',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      expect(result.success).toBe(false);
      expect(result.classification.type).toBe('ignored');
      expect(result.reason).toBe('grupo não permitido');
      expect(piClient.callLog).toHaveLength(0);
    });

    it('unregistered phone rejected', async () => {
      const payload = makePayload({
        chat: '5511888888888@s.whatsapp.net',
        sender: '5511888888888:19@s.whatsapp.net',
        isGroup: false,
        messageText: 'Any message',
      });

      const result = await processWebhook(
        payload,
        'test-instance-token',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      expect(result.success).toBe(false);
      expect(result.classification.type).toBe('ignored');
      expect(result.reason).toBe('telefone não cadastrado');
      expect(piClient.callLog).toHaveLength(0);
    });

    it('API failure does not crash - returns error response', async () => {
      piClient.setTimeout();

      const payload = makePayload({
        chat: '12036304894@g.us',
        isGroup: true,
        messageText: 'Create expense 100',
      });

      const result = await processWebhook(
        payload,
        'test-instance-token',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      expect(result).toBeDefined();
      expect(result.classification).toBeDefined();
    });

    it('non-Message events are ignored', async () => {
      const payload = makePayload({
        event: 'Connected',
      });

      const result = await processWebhook(
        payload,
        'test-instance-token',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      expect(result.success).toBe(true);
      expect(result.classification.type).toBe('ignored');
      expect(result.reason).toContain('evento ignorado');
    });

    it('wrong instance token rejected', async () => {
      const payload = makePayload({
        instanceToken: 'wrong-token',
        chat: '12036304894@g.us',
        isGroup: true,
        messageText: 'gastei 10',
      });

      const result = await processWebhook(
        payload,
        'test-instance-token',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      expect(result.success).toBe(false);
      expect(result.reason).toBe('instanceToken inválido');
    });
  });

  describe('validation helpers', () => {
    it('validateEventType rejects non-Message events', () => {
      const payload = makePayload({ event: 'Receipt' });
      const result = validateEventType(payload);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('evento ignorado');
    });

    it('validateEventType accepts Message events', () => {
      const payload = makePayload({ event: 'Message' });
      const result = validateEventType(payload);
      expect(result.valid).toBe(true);
    });

    it('validateInstanceToken rejects wrong token', () => {
      const payload = makePayload({ instanceToken: 'wrong-token' });
      const result = validateInstanceToken(payload, 'test-instance-token');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('instanceToken inválido');
    });

    it('validateInstanceToken accepts correct token', () => {
      const payload = makePayload({ instanceToken: 'test-instance-token' });
      const result = validateInstanceToken(payload, 'test-instance-token');
      expect(result.valid).toBe(true);
    });

    it('validateInstanceToken skips validation when no token configured', () => {
      const payload = makePayload({ instanceToken: 'any-token' });
      const result = validateInstanceToken(payload, '');
      expect(result.valid).toBe(true);
    });

    it('extractPhone works for personal and group JIDs', () => {
      // Personal JIDs: strip @s.whatsapp.net
      expect(extractPhone('5511999999999@s.whatsapp.net')).toBe('5511999999999');
      // Personal JIDs with device suffix: strip @s.whatsapp.net and :19
      expect(extractPhone('5511999999999:19@s.whatsapp.net')).toBe('5511999999999');
      // Group JIDs: strip @g.us
      expect(extractPhone('12036304894@g.us')).toBe('12036304894');
    });

    it('extractMessageText handles conversation and extendedTextMessage', () => {
      const payload1 = makePayload({ messageText: 'Hello' });
      expect(extractMessageText(payload1)).toBe('Hello');

      const payload2: WebhookPayload = {
        event: 'Message',
        instanceId: 'x',
        instanceToken: 'x',
        data: {
          Info: {
            Chat: 'x',
            Sender: 'x',
            IsFromMe: false,
            IsGroup: false,
            ID: 'x',
            Type: 'text',
            PushName: '',
            Timestamp: new Date().toISOString(),
          },
          Message: {
            extendedTextMessage: { text: 'World' },
          },
        },
      };
      expect(extractMessageText(payload2)).toBe('World');
    });

    it('buildSourceMessage creates correct structure', () => {
      const payload = makePayload({
        chat: '12036304894@g.us',
        sender: '5511999999999:19@s.whatsapp.net',
        isGroup: true,
        messageText: 'Test message',
        pushName: 'John',
      });

      const sourceMsg = buildSourceMessage(payload);
      expect(sourceMsg.text).toBe('Test message');
      expect(sourceMsg.senderPhone).toBe('5511999999999');
      expect(sourceMsg.pushName).toBe('John');
      expect(sourceMsg.processed).toBe(false);
    });
  });

  describe('processWebhook - hybrid progress (presence + timed text)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('sends composing/paused presence for fast general messages, no progress text', async () => {
      const payload = makePayload({
        chat: '5511999999999@s.whatsapp.net',
        isGroup: false,
        sender: '5511999999999:19@s.whatsapp.net',
        messageText: 'Olá',
      });

      const result = await processWebhook(
        payload,
        'test-instance-token',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      expect(result.success).toBe(true);
      expect(result.classification.type).toBe('general');
      // Presence called with composing and paused
      expect(evolutionClient.presenceCalls).toContainEqual({ chatId: '5511999999999@s.whatsapp.net', state: 'composing' });
      expect(evolutionClient.presenceCalls).toContainEqual({ chatId: '5511999999999@s.whatsapp.net', state: 'paused' });
      // No progress text messages (🔎 or 🧮)
      expect(evolutionClient.sentMessages.some(m => m.message.includes('🔎'))).toBe(false);
      expect(evolutionClient.sentMessages.some(m => m.message.includes('🧮'))).toBe(false);
      // Final response still sent
      expect(evolutionClient.sentMessages.some(m => m.message === '✅ Registro criado!')).toBe(true);
    });

    it('does not send presence for ignored messages (own message)', async () => {
      const payload = makePayload({ fromMe: true });
      const result = await processWebhook(
        payload,
        'test-instance-token',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );
      expect(result.classification.type).toBe('ignored');
      expect(evolutionClient.presenceCalls).toHaveLength(0);
      expect(evolutionClient.sentMessages).toHaveLength(0);
    });

    it('sends 3s and 8s progress text messages when processing is slow, then paused', async () => {
      vi.useFakeTimers();

      // Controlled Pi promise that resolves after 12s
      let resolvePi: (value: any) => void;
      const piPromise = new Promise<any>((resolve) => { resolvePi = resolve; });
      (piClient.send as any) = vi.fn().mockReturnValue(piPromise);

      const payload = makePayload({
        chat: '5511999999999@s.whatsapp.net',
        isGroup: false,
        sender: '5511999999999:19@s.whatsapp.net',
        messageText: 'Olá',
      });

      const webhookPromise = processWebhook(
        payload,
        'test-instance-token',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      // Step 1: composing presence should be sent immediately (after microtasks)
      await vi.advanceTimersByTimeAsync(0);
      expect(evolutionClient.presenceCalls.some(p => p.state === 'composing')).toBe(true);
      expect(evolutionClient.sentMessages.some(m => m.message.includes('🔎'))).toBe(false);

      // Step 2: advance past 3s — 3s progress text should fire
      await vi.advanceTimersByTimeAsync(3100);
      expect(evolutionClient.sentMessages.some(m => m.message.includes('🔎'))).toBe(true);
      expect(evolutionClient.sentMessages.some(m => m.message.includes('🧮'))).toBe(false);

      // Step 3: advance past 8s — 8s progress text should fire
      await vi.advanceTimersByTimeAsync(5000);
      expect(evolutionClient.sentMessages.some(m => m.message.includes('🧮'))).toBe(true);

      // Step 4: resolve Pi and wait for completion
      resolvePi!({ success: true, data: { message: 'Resposta final' } });
      await vi.advanceTimersByTimeAsync(0);

      const result = await webhookPromise;
      expect(result.success).toBe(true);
      expect(result.classification.type).toBe('general');

      // Final response sent and paused presence at end
      expect(evolutionClient.sentMessages.some(m => m.message === 'Resposta final')).toBe(true);
      expect(evolutionClient.presenceCalls[evolutionClient.presenceCalls.length - 1]).toEqual({ chatId: '5511999999999@s.whatsapp.net', state: 'paused' });
    });
  });
});
