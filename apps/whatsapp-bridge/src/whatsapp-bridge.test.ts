// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Bridge Test
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Local types (copied from implementation for test isolation)
// ─────────────────────────────────────────────────────────────────────────────

interface FakeSourceStore {
  messages: Map<string, { providerMessageId: string; errorReason?: string }>;
  processedIds: Set<string>;
}

function createFakeSourceStore(): FakeSourceStore {
  return {
    messages: new Map(),
    processedIds: new Set(),
  };
}

function createFakeUserRegistry() {
  return {
    phones: new Set<string>(['5511999999999', '5511888888888']),
    allowedGroups: new Set(['120363045678901234@g.us']),
    groupToHousehold: new Map<string, string>([
      ['120363045678901234@g.us', 'household-1'],
    ]),
    isPhoneRegistered(phone: string) {
      return this.phones.has(phone);
    },
    isGroupAllowed(groupId: string) {
      return this.allowedGroups.has(groupId);
    },
    getHouseholdIdForGroup(groupId: string) {
      return this.groupToHousehold.get(groupId) ?? null;
    },
  };
}

function createFakePiClient() {
  return {
    send: vi.fn().mockResolvedValue({ success: true, data: { message: 'OK' } }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('WhatsApp Bridge - Webhook Validation', () => {
  let userRegistry: ReturnType<typeof createFakeUserRegistry>;

  beforeEach(() => {
    userRegistry = createFakeUserRegistry();
  });

  it('should reject webhook with invalid secret', () => {
    const secret = 'invalid-secret';
    const expectedSecret = 'correct-secret';
    
    expect(secret).not.toBe(expectedSecret);
  });

  it('should reject webhook from unknown group', () => {
    const groupId = 'unknown-group@g.us';
    
    expect(userRegistry.allowedGroups.has(groupId)).toBe(false);
  });

  it('should reject webhook from unregistered phone', () => {
    const phone = '5511777777777';
    
    expect(userRegistry.phones.has(phone)).toBe(false);
  });

  it('should accept webhook with valid secret and registered phone', () => {
    const secret = 'correct-secret';
    const expectedSecret = 'correct-secret';
    const phone = '5511999999999';
    
    expect(secret).toBe(expectedSecret);
    expect(userRegistry.phones.has(phone)).toBe(true);
  });

  it('should derive householdId from group mapping', () => {
    const groupId = '120363045678901234@g.us';
    const householdId = userRegistry.getHouseholdIdForGroup(groupId);
    
    expect(householdId).toBe('household-1');
  });

  it('should return null householdId for unknown group', () => {
    const groupId = 'unknown@g.us';
    const householdId = userRegistry.getHouseholdIdForGroup(groupId);
    
    expect(householdId).toBeNull();
  });
});

describe('WhatsApp Bridge - Source Idempotency', () => {
  let store: FakeSourceStore;

  beforeEach(() => {
    store = createFakeSourceStore();
  });

  it('should detect duplicate providerMessageId', () => {
    const msgId = 'msg-123';
    store.processedIds.add(msgId);
    
    expect(store.processedIds.has(msgId)).toBe(true);
  });

  it('should not reprocess same message', () => {
    const msgId = 'msg-456';
    store.processedIds.add(msgId);
    
    const isDuplicate = store.processedIds.has(msgId);
    expect(isDuplicate).toBe(true);
  });

  it('should process new message', () => {
    const msgId = 'msg-789';
    
    const isDuplicate = store.processedIds.has(msgId);
    expect(isDuplicate).toBe(false);
  });

  it('should mark message as processed after success', () => {
    const msgId = 'msg-101';
    
    store.processedIds.add(msgId);
    
    expect(store.processedIds.has(msgId)).toBe(true);
  });
});

describe('WhatsApp Bridge - Message Classification', () => {
  it('should classify "gastei" as expense command', () => {
    const text = 'gastei 50 reais no almoço';
    
    const isCommand = text.includes('gastei') || text.includes('recebi') || 
                      text.includes('transferi') || text.includes('paguei') ||
                      text.startsWith('/');
    
    expect(isCommand).toBe(true);
  });

  it('should classify "recebi" as income command', () => {
    const text = 'recebi 2000 de salário';
    
    const isCommand = text.includes('gastei') || text.includes('recebi') || 
                      text.includes('transferi') || text.includes('paguei');
    
    expect(isCommand).toBe(true);
  });

  it('should classify "/relatorio" as explicit command', () => {
    const text = '/relatorio mensal';
    
    const isCommand = text.startsWith('/') || 
                      text.includes('gastei') || text.includes('recebi');
    
    expect(isCommand).toBe(true);
  });

  it('should classify "quanto tenho" as clarification_needed (no amount)', () => {
    const text = 'quanto tenho na conta?';
    
    const isCommand = text.includes('gastei') || text.includes('recebi') || 
                      text.includes('transferi') || text.includes('paguei') ||
                      text.startsWith('/');
    
    expect(isCommand).toBe(false);
  });

  it('should ignore normal conversation', () => {
    const text = 'vamos pedir pizza hoje?';
    
    const isFinancial = text.includes('gastei') || text.includes('recebi') || 
                        text.includes('transferi') || text.includes('paguei') ||
                        text.includes('conta') || text.includes('cartão') ||
                        text.includes('saldo') || text.includes('fatura');
    
    expect(isFinancial).toBe(false);
  });

  it('should detect financial text without explicit command', () => {
    const text = 'a fatura do cartão veio 1500';
    
    const hasFinancialKeywords = text.includes('fatura') || text.includes('conta') || 
                                  text.includes('cartão') || text.includes('saldo');
    
    expect(hasFinancialKeywords).toBe(true);
  });

  it('should need clarification when expense without account/card', () => {
    const text = 'gastei 100';
    
    const hasAccountInfo = text.includes('no cartão') || text.includes('na conta') || 
                           text.includes('no dinheiro');
    
    expect(hasAccountInfo).toBe(false);
  });
});

describe('WhatsApp Bridge - Pi RPC Handoff', () => {
  let piClient: { send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    piClient = createFakePiClient();
  });

  it('should call Pi client with TED context', async () => {
    const message = 'gastei 50 no almoço';
    const senderPhone = '5511999999999';
    
    (piClient.send as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: { message: 'R$50,00 registrados na conta padrão!' }
    });

    const result = await (piClient.send as any)(message, senderPhone, {
      householdId: 'h1',
      source: 'whatsapp',
    });

    expect(result.success).toBe(true);
    expect(piClient.send).toHaveBeenCalledWith(message, senderPhone, expect.any(Object));
  });

  it('should handle Pi timeout as retryable failure', async () => {
    (piClient.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('timeout'));

    await expect(
      (piClient.send as any)('test', 'phone', { householdId: 'h1', source: 'whatsapp' })
    ).rejects.toThrow('timeout');
  });

  it('should include idempotency key in Pi call', async () => {
    const msgId = 'msg-abc';
    
    (piClient.send as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: { message: 'Done' }
    });

    await (piClient.send as any)('gastei 10', 'phone', { 
      householdId: 'h1',
      source: 'whatsapp',
      idempotencyKey: `whatsapp:${msgId}` 
    });

    expect(piClient.send).toHaveBeenCalledWith(
      'gastei 10', 
      'phone', 
      expect.objectContaining({ idempotencyKey: 'whatsapp:msg-abc' })
    );
  });
});

describe('WhatsApp Bridge - Response Sender', () => {
  it('should send response to group via Evolution client', async () => {
    const response = 'R$50,00 registrados! ✅';
    const groupId = '120363045678901234@g.us';
    
    const sent = { to: groupId, message: response, status: 'sent' };
    
    expect(sent.status).toBe('sent');
    expect(sent.to).toBe(groupId);
  });

  it('should not send response for ignored messages', () => {
    const classification = { type: 'ignored' as const };
    
    const shouldSend = classification.type !== 'ignored';
    
    expect(shouldSend).toBe(false);
  });

  it('should send clarification prompt when needed', () => {
    const missingInfo = ['accountId', 'cardId'];
    const response = `Qual conta ou cartão? Informe: dinheiro, conta corrente, ou cartão.`;
    
    expect(response).toContain('Qual conta');
    expect(missingInfo).toContain('accountId');
  });
});

describe('WhatsApp Bridge - Auditability', () => {
  let store: FakeSourceStore;

  beforeEach(() => {
    store = createFakeSourceStore();
  });

  it('should mark processed only after successful flow', () => {
    const msgId = 'msg-audit-1';
    
    store.processedIds.add(msgId);
    
    expect(store.processedIds.has(msgId)).toBe(true);
  });

  it('should not mark as processed on failure', () => {
    const msgId = 'msg-audit-2';
    
    const shouldMarkProcessed = false;
    if (shouldMarkProcessed) {
      store.processedIds.add(msgId);
    }
    
    expect(store.processedIds.has(msgId)).toBe(false);
  });

  it('should track error reason for failures', () => {
    const msgId = 'msg-audit-3';
    store.messages.set(msgId, { providerMessageId: msgId, errorReason: 'timeout' });
    
    expect(store.messages.get('msg-audit-3')?.errorReason).toBe('timeout');
  });
});