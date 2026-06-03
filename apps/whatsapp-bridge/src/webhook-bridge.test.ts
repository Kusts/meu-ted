// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Bridge — Webhook handler tests
// Covers spec from bridge-simplification-inventory.md (item B, sub-bridge).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processWebhook,
  validateEventType,
  validateInstanceToken,
  validateGroup,
  validateSender,
  extractPhone,
  extractMessageText,
  type WebhookPayload,
  type UserRegistry,
  type SourceMessageStore,
  type PiClient,
  type ResponseSender,
} from './webhook-handler.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeRegistry(overrides: Partial<{
  phones: string[];
  groups: string[];
  groupToHousehold: Map<string, string>;
}> = {}): UserRegistry {
  const phones = new Set(overrides.phones ?? ['5511999999999']);
  const groups = new Set(overrides.groups ?? ['120363045678901234@g.us']);
  const map = overrides.groupToHousehold ?? new Map([
    ['120363045678901234@g.us', 'household-1'],
  ]);
  return {
    isPhoneRegistered: (p) => phones.has(p),
    isGroupAllowed: (g) => groups.has(g),
    getHouseholdIdForGroup: (g) => map.get(g) ?? null,
  };
}

function makeStore(): SourceMessageStore & {
  processed: string[];
  errors: Array<{ id: string; reason: string }>;
} {
  const processed: string[] = [];
  const errors: Array<{ id: string; reason: string }> = [];
  const seen = new Set<string>();
  return {
    processed,
    errors,
    isProcessed: (id) => seen.has(id),
    markProcessed: (msg) => {
      seen.add(msg.providerMessageId);
      processed.push(msg.providerMessageId);
    },
    saveError: (id, reason) => {
      errors.push({ id, reason });
    },
  };
}

function makePi(overrides: Partial<{
  response: string;
  success: boolean;
  reason: string;
}> = {}): PiClient & { calls: Array<{ message: string; phone: string; context: any }> } {
  const calls: Array<{ message: string; phone: string; context: any }> = [];
  return {
    calls,
    send: vi.fn(async (message, phone, context) => {
      calls.push({ message, phone, context });
      if (overrides.success === false) {
        return { success: false, reason: overrides.reason ?? 'pi-error' };
      }
      return { success: true, data: { message: overrides.response ?? 'ok' } };
    }),
  };
}

function makeSender(): ResponseSender & {
  sent: Array<{ chatId: string; text: string }>;
  presence: Array<{ chatId: string; state: 'composing' | 'paused' }>;
} {
  const sent: Array<{ chatId: string; text: string }> = [];
  const presence: Array<{ chatId: string; state: 'composing' | 'paused' }> = [];
  return {
    sent,
    presence,
    send: vi.fn(async (chatId: string, text: string) => {
      sent.push({ chatId, text });
    }),
    sendPresence: vi.fn(async (chatId: string, state: 'composing' | 'paused') => {
      presence.push({ chatId, state });
    }),
  };
}

function payload(overrides: Partial<WebhookPayload['data']['Info'] & { text: string; isGroup?: boolean }> = {}): WebhookPayload {
  return {
    event: 'Message',
    instanceId: 'instance-1',
    instanceToken: 'good-token',
    data: {
      Info: {
        Chat: '5511999999999@s.whatsapp.net',
        Sender: '5511999999999:19@s.whatsapp.net',
        IsFromMe: false,
        IsGroup: false,
        ID: overrides.ID ?? '3EB0_ABC',
        Type: 'text',
        PushName: overrides.PushName ?? 'João',
        Timestamp: '2024-10-10T17:17:44-03:00',
        ...overrides,
      } as any,
      Message: { conversation: overrides.text ?? 'oi' } as any,
    },
  };
}

// ─── validation unit tests ──────────────────────────────────────────────────

describe('validateEventType', () => {
  it('accepts Message event', () => {
    expect(validateEventType(payload()).valid).toBe(true);
  });

  it('rejects Connection event', () => {
    const p = payload();
    p.event = 'Connection';
    expect(validateEventType(p).valid).toBe(false);
  });

  it('rejects Receipt event', () => {
    const p = payload();
    p.event = 'Receipt';
    expect(validateEventType(p).valid).toBe(false);
  });
});

describe('validateInstanceToken', () => {
  it('rejects mismatched token', () => {
    const p = payload();
    p.instanceToken = 'bad';
    expect(validateInstanceToken(p, 'good-token').valid).toBe(false);
  });

  it('accepts matching token', () => {
    expect(validateInstanceToken(payload(), 'good-token').valid).toBe(true);
  });

  it('skips validation when no expected token configured (dev mode)', () => {
    const p = payload();
    p.instanceToken = 'whatever';
    expect(validateInstanceToken(p, '').valid).toBe(true);
  });
});

describe('validateGroup', () => {
  it('blocks group not in registry', () => {
    const reg = makeRegistry({ groups: [] });
    const p = payload();
    p.data.Info.IsGroup = true;
    p.data.Info.Chat = '999999@g.us';
    expect(validateGroup(p, reg).valid).toBe(false);
  });

  it('allows group in registry', () => {
    const reg = makeRegistry();
    const p = payload();
    p.data.Info.IsGroup = true;
    p.data.Info.Chat = '120363045678901234@g.us';
    expect(validateGroup(p, reg).valid).toBe(true);
  });
});

describe('validateSender', () => {
  it('blocks unregistered phone', () => {
    const reg = makeRegistry({ phones: [] });
    expect(validateSender(payload(), reg).valid).toBe(false);
  });

  it('accepts registered phone', () => {
    expect(validateSender(payload(), makeRegistry()).valid).toBe(true);
  });
});

describe('extractPhone', () => {
  it('strips @s.whatsapp.net and device suffix', () => {
    expect(extractPhone('5511999999999:19@s.whatsapp.net')).toBe('5511999999999');
  });
  it('strips @g.us', () => {
    expect(extractPhone('120363045678901234@g.us')).toBe('120363045678901234');
  });
});

describe('extractMessageText', () => {
  it('reads conversation', () => {
    const p = payload({ text: 'oi' });
    expect(extractMessageText(p)).toBe('oi');
  });
  it('reads extendedTextMessage.text', () => {
    const p = payload();
    p.data.Message = { extendedTextMessage: { text: 'alo' } };
    expect(extractMessageText(p)).toBe('alo');
  });
  it('reads imageMessage.caption', () => {
    const p = payload();
    p.data.Message = { imageMessage: { caption: 'foto do recibo' } };
    expect(extractMessageText(p)).toBe('foto do recibo');
  });
  it('reads videoMessage.caption', () => {
    const p = payload();
    p.data.Message = { videoMessage: { caption: 'video da nota' } };
    expect(extractMessageText(p)).toBe('video da nota');
  });
  it('returns empty when no text', () => {
    const p = payload();
    p.data.Message = {};
    expect(extractMessageText(p)).toBe('');
  });
});

// ─── processWebhook integration ─────────────────────────────────────────────

describe('processWebhook', () => {
  let store: ReturnType<typeof makeStore>;
  let pi: ReturnType<typeof makePi>;
  let sender: ReturnType<typeof makeSender>;
  let reg: UserRegistry;

  beforeEach(() => {
    store = makeStore();
    pi = makePi();
    sender = makeSender();
    reg = makeRegistry();
  });

  it('ignores event that is not Message (status=ignored)', async () => {
    const p = payload();
    p.event = 'Connection';
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(res.status).toBe('ignored');
    expect(pi.send).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('rejects invalid instance token (status=failed)', async () => {
    const p = payload();
    p.instanceToken = 'bad';
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(res.status).toBe('failed');
    expect(res.reason).toMatch(/token/i);
  });

  it('ignores own messages (status=ignored)', async () => {
    const p = payload();
    p.data.Info.IsFromMe = true;
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(res.status).toBe('ignored');
    expect(pi.send).not.toHaveBeenCalled();
  });

  it('blocks group not in registry (status=failed)', async () => {
    const p = payload();
    p.data.Info.IsGroup = true;
    p.data.Info.Chat = '999999@g.us';
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(res.status).toBe('failed');
    expect(res.reason).toMatch(/grupo/i);
  });

  it('blocks unregistered phone (status=failed)', async () => {
    const p = payload();
    p.data.Info.Sender = '5511777777777:19@s.whatsapp.net';
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(res.status).toBe('failed');
    expect(res.reason).toMatch(/telefone/i);
  });

  it('ignores empty text without calling Pi (status=ignored)', async () => {
    const p = payload({ text: '' });
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(res.status).toBe('ignored');
    expect(pi.send).not.toHaveBeenCalled();
  });

  it('forwards common message to Pi with the documented prompt', async () => {
    const p = payload({ text: 'oi tudo bem?' });
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(res.status).toBe('forwarded');
    expect(pi.send).toHaveBeenCalledTimes(1);
    const call = pi.calls[0];
    expect(call.phone).toBe('5511999999999');
    expect(call.context).toMatchObject({
      source: 'whatsapp',
      chatId: '5511999999999@s.whatsapp.net',
      providerMessageId: '3EB0_ABC',
    });
    expect(call.context.idempotencyKey).toBe('whatsapp:3EB0_ABC');
    // documented prompt format
    expect(call.message).toMatch(/^\[WhatsApp Message\]/);
    expect(call.message).toContain('chatId: 5511999999999@s.whatsapp.net');
    expect(call.message).toContain('senderPhone: 5511999999999');
    expect(call.message).toContain('providerMessageId: 3EB0_ABC');
    expect(call.message).toContain('source: whatsapp');
    expect(call.message).toMatch(/timestamp: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    expect(call.message).toMatch(/User message:\n\n?oi tudo bem\?\s*$/);
  });

  it('forwards financial message to Pi WITHOUT classifying it', async () => {
    const p = payload({ text: 'gastei 50 no mercado' });
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(res.status).toBe('forwarded');
    // prompt includes original text — no classification in result
    expect(pi.calls[0].message).toContain('gastei 50 no mercado');
    expect(res).not.toHaveProperty('classification');
  });

  it('emits timestamp in ISO 8601 in the prompt (2024-10-10T17:17:44-03:00 → 2024-10-10T20:17:44.000Z)', async () => {
    const p = payload({ text: 'oi' });
    await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(pi.calls[0].message).toContain('timestamp: 2024-10-10T20:17:44.000Z');
  });

  it('sends Pi response back to chat', async () => {
    pi = makePi({ response: 'Registrado! ✅' });
    const p = payload({ text: 'qual o saldo?' });
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(res.status).toBe('forwarded');
    expect(sender.sent).toEqual([
      { chatId: '5511999999999@s.whatsapp.net', text: 'Registrado! ✅' },
    ]);
  });

  it('sends composing then paused presence around the call', async () => {
    const p = payload({ text: 'oi' });
    await processWebhook(p, 'good-token', reg, store, pi, sender);
    const states = sender.presence.map((p) => p.state);
    expect(states[0]).toBe('composing');
    expect(states[states.length - 1]).toBe('paused');
  });

  it('dedupes by providerMessageId (status=ignored on second)', async () => {
    const p = payload({ text: 'oi' });
    const a = await processWebhook(p, 'good-token', reg, store, pi, sender);
    const b = await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(a.status).toBe('forwarded');
    expect(b.status).toBe('ignored');
    expect(pi.send).toHaveBeenCalledTimes(1);
  });

  it('returns status=failed when Pi returns failure', async () => {
    pi = makePi({ success: false, reason: 'pi offline' });
    const p = payload({ text: 'oi' });
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(res.status).toBe('failed');
    expect(res.reason).toMatch(/pi offline/);
  });

  it('sends error message to chat when Pi fails', async () => {
    pi = makePi({ success: false, reason: 'pi offline' });
    const p = payload({ text: 'oi' });
    await processWebhook(p, 'good-token', reg, store, pi, sender);
    const last = sender.sent[sender.sent.length - 1];
    expect(last.chatId).toBe('5511999999999@s.whatsapp.net');
    expect(last.text).toMatch(/pi offline/);
  });
});
