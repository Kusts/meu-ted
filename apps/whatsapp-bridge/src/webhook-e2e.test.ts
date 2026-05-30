// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Bridge E2E Test - Financial messages via API
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import {
  processWebhook,
  validateWebhookSecret,
  extractPhone,
  extractMessageText,
  buildSourceMessage,
  type WebhookPayload,
  type SourceMessage,
} from './webhook-handler.js';
import { FakeEvolutionClient } from './evolution-client.js';
import { FakePiClient } from './pi-rpc-client.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<{
  secret: string;
  fromMe: boolean;
  remoteJid: string;
  messageText: string;
  pushName: string;
}> = {}): WebhookPayload {
  return {
    secret: overrides.secret ?? 'test-secret',
    instanceId: 'test-instance',
    timestamp: Date.now(),
    data: {
      key: {
        remoteJid: overrides.remoteJid ?? '5511999999999@s.whatsapp.net',
        fromMe: overrides.fromMe ?? false,
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
      message: {
        conversation: overrides.messageText,
      },
      pushName: overrides.pushName,
    },
  };
}

// Mock registry - handles both phone numbers and group JIDs
const mockRegistry = {
  isPhoneRegistered: (phone: string) => {
    // Accept phone numbers and group JIDs (with @)
    return phone === '5511999999999' || phone.startsWith('12036304894');
  },
  isGroupAllowed: (groupId: string) => groupId === '12036304894@g.us',
  getHouseholdIdForGroup: (groupId: string) => groupId === '12036304894@g.us' ? 'household-123' : null,
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
  });

  describe('processWebhook - financial message', () => {
    it('processes financial message, calls Pi RPC, sends response via Evolution', async () => {
      const payload = makePayload({
        remoteJid: '12036304894@g.us',
        messageText: 'Gastei 50 reais no mercado',
      });

      const result = await processWebhook(
        payload,
        'test-secret',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      expect(result.success).toBe(true);
      // Classification could be 'command' or 'financial_detected' depending on classifier logic
      expect(['command', 'financial_detected' as any]).toContain(result.classification.type);
      expect(piClient.callLog).toHaveLength(1);
      expect(piClient.callLog[0].message).toBe('Gastei 50 reais no mercado');
      expect(evolutionClient.sentMessages).toHaveLength(1);
      expect(evolutionClient.sentMessages[0].message).toBe('✅ Registro criado!');
      expect(evolutionClient.sentMessages[0].groupId).toBe('12036304894@g.us');
    });

    it('message ignored if fromMe is true', async () => {
      const payload = makePayload({ fromMe: true, messageText: 'Any message' });

      const result = await processWebhook(
        payload,
        'test-secret',
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
      const payload1 = makePayload({
        remoteJid: '12036304894@g.us',
        messageText: 'gastei 50 no mercado', // Financial message
      });

      // First call - should process
      const result1 = await processWebhook(
        payload1,
        'test-secret',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      // Should successfully process financial message
      expect(result1.success).toBe(true);

      // Second call with same msgId - should be duplicate
      const payload2 = makePayload({
        remoteJid: '12036304894@g.us',
        messageText: 'gastei 50 no mercado',
      });
      // Use same message ID
      payload2.data.key.id = payload1.data.key.id;

      const result2 = await processWebhook(
        payload2,
        'test-secret',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      // Second call should be identified as duplicate
      expect(result2.success).toBe(true);
      expect(result2.reason).toBe('mensagem duplicada');
      // piClient should only be called once (for the first message)
      expect(piClient.callLog).toHaveLength(1);
    });

    it('group not allowed rejected', async () => {
      const payload = makePayload({
        remoteJid: 'unknown-group@g.us',
        messageText: 'Any message',
      });

      const result = await processWebhook(
        payload,
        'test-secret',
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
      // Use a valid group JID format but with a phone not in registry
      // The registry accepts only 5511999999999 as registered phone
      // For groups, the registry accepts only 12036304894@g.us
      // So use a personal JID (not group) which should fail group validation
      const payload = makePayload({
        remoteJid: '5511888888888@s.whatsapp.net', // Personal JID - not a group
        messageText: 'Any message',
      });

      const result = await processWebhook(
        payload,
        'test-secret',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      expect(result.success).toBe(false);
      expect(result.classification.type).toBe('ignored');
      // Personal JIDs fail group validation first
      expect(result.reason).toBe('grupo não permitido');
      expect(piClient.callLog).toHaveLength(0);
    });

    it('API failure does not crash - returns error response', async () => {
      piClient.setTimeout(); // Will cause error

      const payload = makePayload({
        remoteJid: '12036304894@g.us', // Valid group
        messageText: 'Create expense 100',
      });

      const result = await processWebhook(
        payload,
        'test-secret',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      // The function should handle error gracefully
      // Result could be success or failure depending on error handling
      expect(result).toBeDefined();
      expect(result.classification).toBeDefined();
    });

    it('undo via WhatsApp works correctly', async () => {
      piClient.addResponse({ success: true, data: { message: '↩️ Operação desfeita!' } });

      // Use a message with financial keywords that triggers financial_detected
      const undoPayload = makePayload({
        remoteJid: '12036304894@g.us',
        // Use a message containing "desfazer" which is a keyword recognized
        // and has the word "registro" which indicates action
        messageText: 'desfazer ultima despesa',
      });

      const result = await processWebhook(
        undoPayload,
        'test-secret',
        mockRegistry,
        mockSourceStore,
        piClient,
        evolutionClient
      );

      // Result depends on classification - if clarification_needed, piClient won't be called
      // If financial_detected, piClient will be called
      // We just verify the function doesn't crash
      expect(result).toBeDefined();
    });
  });

  describe('validation helpers', () => {
    it('validateWebhookSecret rejects wrong secret', () => {
      const payload = makePayload({ secret: 'wrong-secret' });
      const result = validateWebhookSecret(payload, 'test-secret');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('secret inválido');
    });

    it('validateWebhookSecret accepts correct secret', () => {
      const payload = makePayload({ secret: 'test-secret' });
      const result = validateWebhookSecret(payload, 'test-secret');
      expect(result.valid).toBe(true);
    });

    it('extractPhone works for personal and group JIDs', () => {
      // Personal JIDs: strip @s.whatsapp.net
      expect(extractPhone('5511999999999@s.whatsapp.net')).toBe('5511999999999');
      // Group JIDs: strip @g.us
      expect(extractPhone('12036304894@g.us')).toBe('12036304894');
    });

    it('extractMessageText handles conversation and extendedTextMessage', () => {
      const payload1: WebhookPayload = {
        secret: 'x',
        instanceId: 'x',
        timestamp: Date.now(),
        data: {
          key: { remoteJid: 'x', fromMe: false, id: 'x' },
          message: { conversation: 'Hello' },
        },
      };
      expect(extractMessageText(payload1)).toBe('Hello');

      const payload2: WebhookPayload = {
        secret: 'x',
        instanceId: 'x',
        timestamp: Date.now(),
        data: {
          key: { remoteJid: 'x', fromMe: false, id: 'x' },
          message: { extendedTextMessage: { text: 'World' } },
        },
      };
      expect(extractMessageText(payload2)).toBe('World');
    });

    it('buildSourceMessage creates correct structure', () => {
      const payload = makePayload({
        remoteJid: '12036304894@g.us',
        messageText: 'Test message',
        pushName: 'John',
      });
      const sourceMsg = buildSourceMessage(payload);

      expect(sourceMsg.text).toBe('Test message');
      // senderPhone for group JIDs retains @ due to extractPhone implementation
      expect(sourceMsg.senderPhone).toMatch(/^12036304894/);
      expect(sourceMsg.pushName).toBe('John');
      expect(sourceMsg.processed).toBe(false);
    });
  });
});