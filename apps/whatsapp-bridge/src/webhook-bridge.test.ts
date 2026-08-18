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
  isLikelyPromotionalNoise,
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

type PiSendContext = Parameters<PiClient['send']>[2];

type PiCall = { message: string; phone: string; context: PiSendContext };

function makePi(overrides: Partial<{
  response: string;
  success: boolean;
  reason: string;
}> = {}): PiClient & { calls: PiCall[] } {
  const calls: PiCall[] = [];
  return {
    calls,
    send: vi.fn(async (message: string, phone: string, context: PiSendContext) => {
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

// ─── isLikelyPromotionalNoise unit tests ─────────────────────────────────────

describe('isLikelyPromotionalNoise', () => {
  it('returns true for cupom/desconto promotional text with emojis', () => {
    expect(isLikelyPromotionalNoise('🚨 NOVO CUPOM AMAZON 🚨')).toBe(true);
    expect(isLikelyPromotionalNoise('🎟️ SUPERTV Cupom')).toBe(true);
    expect(isLikelyPromotionalNoise('✅ Madesa Kit')).toBe(true);
    expect(isLikelyPromotionalNoise('🔥 CUPOM DE DESCONTO 30%')).toBe(true);
    expect(isLikelyPromotionalNoise('🎁 CUPOM EXCLUSIVO CLIQUE AQUI')).toBe(true);
  });

  it('returns true for promotional links (bit.ly, amzn.to, etc)', () => {
    expect(isLikelyPromotionalNoise('confira aqui https://bit.ly/3xXxXxXx')).toBe(true);
    expect(isLikelyPromotionalNoise('compre agora https://amzn.to/abc123')).toBe(true);
  });

  it('returns true for offer/spam keywords in group context', () => {
    expect(isLikelyPromotionalNoise('🎯 OFERTA IMPERDÍVEL!')).toBe(true);
    expect(isLikelyPromotionalNoise('🚀 PROMOÇÃO RELÂMPAGO')).toBe(true);
    expect(isLikelyPromotionalNoise('📢 GANHE DINHEIRO COMPRANDO')).toBe(true);
  });

  it('returns false for normal financial messages', () => {
    expect(isLikelyPromotionalNoise('gastei 50 no mercado')).toBe(false);
    expect(isLikelyPromotionalNoise('paguei a conta de luz')).toBe(false);
    expect(isLikelyPromotionalNoise('recebi 200 de salario')).toBe(false);
  });

  it('returns false for casual greetings', () => {
    expect(isLikelyPromotionalNoise('oi')).toBe(false);
    expect(isLikelyPromotionalNoise('olá ted')).toBe(false);
    expect(isLikelyPromotionalNoise('bom dia')).toBe(false);
  });

  it('returns false for short non-spam messages', () => {
    expect(isLikelyPromotionalNoise('sim')).toBe(false);
    expect(isLikelyPromotionalNoise('não')).toBe(false);
    expect(isLikelyPromotionalNoise('ok')).toBe(false);
  });

  it('returns false for messages with links but no promo keywords', () => {
    expect(isLikelyPromotionalNoise('aqui está o link do comprovante')).toBe(false);
    expect(isLikelyPromotionalNoise('veja a foto da nota fiscal')).toBe(false);
  });

  it('returns false for financial messages with promo emoji but real text', () => {
    expect(isLikelyPromotionalNoise('✅ gastei 50 mercado')).toBe(false);
    expect(isLikelyPromotionalNoise('✅ paguei luz 120')).toBe(false);
    expect(isLikelyPromotionalNoise('🔥 gastei 30 no café')).toBe(false);
  });

  it('returns false for financial action messages with promo keywords (allow-list overrides promo block)', () => {
    expect(isLikelyPromotionalNoise('🔥 transferi 500 pro mano')).toBe(false);
    expect(isLikelyPromotionalNoise('✅ boleto pago')).toBe(false);
    expect(isLikelyPromotionalNoise('paguei a conta com desconto')).toBe(false);
    expect(isLikelyPromotionalNoise('ganhei um desconto na farmácia')).toBe(false);
    expect(isLikelyPromotionalNoise('🎯 meta: juntar 5 mil')).toBe(false);
    // Additional financial keywords: pix, received, account, invoice, salary
    expect(isLikelyPromotionalNoise('🔥 pix 50')).toBe(false);
    expect(isLikelyPromotionalNoise('✅ recebi 200')).toBe(false);
    expect(isLikelyPromotionalNoise('✅ conta luz 120')).toBe(false);
    expect(isLikelyPromotionalNoise('🔥 fatura 300')).toBe(false);
    expect(isLikelyPromotionalNoise('recebi salário hoje')).toBe(false);
    expect(isLikelyPromotionalNoise('despesa do mês tá alta')).toBe(false);
    // Savings/spending-saving keywords
    expect(isLikelyPromotionalNoise('🎯 economizar 200 este mês')).toBe(false);
    expect(isLikelyPromotionalNoise('✅ poupei 100')).toBe(false);
  });

  it('returns true for promo-only text that only has promo keyword without financial action', () => {
    expect(isLikelyPromotionalNoise('DESCONTO imperdível de 30%')).toBe(true);
    expect(isLikelyPromotionalNoise('OFERTA do dia')).toBe(true);
    expect(isLikelyPromotionalNoise('CLIQUE AQUI para ganhar')).toBe(true);
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
    process.env.PI_CONTEXT_TOKEN_SECRET = 'test-context-secret';
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

  it('fails closed without a context token secret', async () => {
    const previous = process.env.PI_CONTEXT_TOKEN_SECRET;
    delete process.env.PI_CONTEXT_TOKEN_SECRET;
    try {
      const res = await processWebhook(payload(), 'good-token', reg, store, pi, sender);
      expect(res.status).toBe('failed');
      expect(res.reason).toMatch(/secret/i);
      expect(pi.send).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.PI_CONTEXT_TOKEN_SECRET;
      else process.env.PI_CONTEXT_TOKEN_SECRET = previous;
    }
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

  it('ignores promotional noise (cupom/desconto/spam) without calling Pi (status=ignored)', async () => {
    const spamTexts = [
      '🚨 NOVO CUPOM AMAZON 🚨',
      '🎟️ SUPERTV Cupom',
      '✅ Madesa Kit',
      '🔥 CUPOM DE DESCONTO 30%',
      '🎁 CUPOM EXCLUSIVO CLIQUE AQUI',
      '🎯 OFERTA IMPERDÍVEL!',
      '🚀 PROMOÇÃO RELÂMPAGO',
    ];
    for (let i = 0; i < spamTexts.length; i++) {
      const p = payload({ text: spamTexts[i], ID: `SPAM${i}` });
      const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
      expect(res.status).toBe('ignored'), `failed for: ${spamTexts[i]}`;
      expect(res.reason).toMatch(/promocional|spam|cupom|oferta/i), `no reason for: ${spamTexts[i]}`;
      expect(pi.send).not.toHaveBeenCalled(), `Pi called for: ${spamTexts[i]}`;
      expect(sender.send).not.toHaveBeenCalled(), `sender called for: ${spamTexts[i]}`;
    }
  });

  it('ignores promotional noise in group chat without calling Pi (status=ignored)', async () => {
    const p = payload({ text: '📢 GANHE DINHEIRO COMPRANDO AGORA', isGroup: true, ID: 'SPAMGRP1' });
    p.data.Info.Chat = '120363045678901234@g.us';
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(res.status).toBe('ignored');
    expect(res.reason).toMatch(/promocional|spam|cupom|oferta/i);
    expect(pi.send).not.toHaveBeenCalled();
  });

  it('forwards normal financial message even with emoji (not spam)', async () => {
    const p = payload({ text: 'gastei 50 no mercado 🍎' });
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(res.status).toBe('forwarded');
    expect(pi.send).toHaveBeenCalledTimes(1);
  });

  it('forwards "olá ted" greeting without being filtered as spam', async () => {
    const p = payload({ text: 'olá ted' });
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(res.status).toBe('forwarded');
    expect(pi.send).toHaveBeenCalledTimes(1);
  });

  it('forwards financial messages with promo emoji + real text (not spam)', async () => {
    const cases = [
      '✅ gastei 50 mercado',
      '✅ paguei luz 120',
      '🔥 gastei 30 no café',
    ];
    for (let i = 0; i < cases.length; i++) {
      const p = payload({ text: cases[i], ID: `FIN${i}` });
      const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
      expect(res.status).toBe('forwarded'), `failed for: ${cases[i]}`;
      expect(pi.send).toHaveBeenCalled(), `Pi not called for: ${cases[i]}`;
    }
  });

  it('forwards financial action messages with promo keywords (allow-list overrides promo block)', async () => {
    const cases = [
      '🔥 transferi 500 pro mano',
      '✅ boleto pago',
      'paguei a conta com desconto',
      'ganhei um desconto na farmácia',
      '🎯 meta: juntar 5 mil',
    ];
    for (let i = 0; i < cases.length; i++) {
      const p = payload({ text: cases[i], ID: `FINA${i}` });
      const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
      expect(res.status).toBe('forwarded'), `failed for: ${cases[i]}`;
      expect(pi.send).toHaveBeenCalled(), `Pi not called for: ${cases[i]}`;
    }
  });

  it('forwards financial messages with additional keywords (pix, recebi, conta, fatura, salário)', async () => {
    const cases = [
      '🔥 pix 50',
      '✅ recebi 200',
      '✅ conta luz 120',
      '🔥 fatura 300',
      'recebi salário hoje',
      'despesa do mês tá alta',
    ];
    for (let i = 0; i < cases.length; i++) {
      const p = payload({ text: cases[i], ID: `FKW${i}` });
      const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
      expect(res.status).toBe('forwarded'), `failed for: ${cases[i]}`;
      expect(pi.send).toHaveBeenCalled(), `Pi not called for: ${cases[i]}`;
    }
  });

  it('forwards savings messages (economizar, poupar)', async () => {
    const cases = [
      '🎯 economizar 200 este mês',
      '✅ poupei 100',
    ];
    for (let i = 0; i < cases.length; i++) {
      const p = payload({ text: cases[i], ID: `SAV${i}` });
      const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
      expect(res.status).toBe('forwarded'), `failed for: ${cases[i]}`;
      expect(pi.send).toHaveBeenCalled(), `Pi not called for: ${cases[i]}`;
    }
  });

  it('forwards common message to Pi with the documented prompt and bound context token', async () => {
    process.env.PI_CONTEXT_TOKEN_SECRET = 'webhook-test-secret';
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
    const tokenPayload = JSON.parse(Buffer.from(call.context.contextToken!.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;
    expect(tokenPayload).toMatchObject({
      sub: '5511999999999',
      workspace: process.env.DEFAULT_HOUSEHOLD_ID ?? 'default',
      chatId: '5511999999999@s.whatsapp.net',
      providerMessageId: '3EB0_ABC',
      requestId: 'whatsapp:3EB0_ABC',
    });
    expect(Number(tokenPayload.exp)).toBeGreaterThan(Number(tokenPayload.iat));
    delete process.env.PI_CONTEXT_TOKEN_SECRET;
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

  it('returns status=forwarded when responseSender.send() fails (non-critical — Evolution GO may reject unregistered numbers)', async () => {
    pi = makePi({ response: 'Registrado!' });
    // Simulate Evolution GO rejecting the number (fake/unregistered)
    (sender.send as any).mockRejectedValue(new Error('Evolution GO API error: 400 — Number not found'));
    const p = payload({ text: 'gastei 30 no cafe' });
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
    // Pi succeeded → webhook is forwarded even though WhatsApp delivery failed
    expect(res.status).toBe('forwarded');
    expect(res.reason).toBeUndefined();
    // message was still marked processed (no double-processing on retry)
    expect(store.processed).toContain('3EB0_ABC');
    // error is NOT saved since Pi succeeded (Evolution GO delivery is non-critical)
    expect(store.errors).toEqual([]);
  });

  it('normalizes leading whitespace/newlines from Pi response before sending', async () => {
    pi = makePi({ response: '\n\n  ok' });
    const p = payload({ text: 'qual o saldo?' });
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(res.status).toBe('forwarded');
    // responseSender.send receives trimmed text
    expect(sender.sent).toEqual([
      { chatId: '5511999999999@s.whatsapp.net', text: 'ok' },
    ]);
    // processWebhook returns normalized response
    expect(res.response).toBe('ok');
  });

  it('normalizes leading whitespace/newlines from Pi response — only newline', async () => {
    pi = makePi({ response: '\n\nok' });
    const p = payload({ text: 'oi' });
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(res.status).toBe('forwarded');
    expect(sender.sent).toEqual([
      { chatId: '5511999999999@s.whatsapp.net', text: 'ok' },
    ]);
    expect(res.response).toBe('ok');
  });

  it('does not alter message without leading whitespace', async () => {
    pi = makePi({ response: 'Registrado! ✅' });
    const p = payload({ text: 'gastei 50' });
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(res.status).toBe('forwarded');
    expect(sender.sent).toEqual([
      { chatId: '5511999999999@s.whatsapp.net', text: 'Registrado! ✅' },
    ]);
    expect(res.response).toBe('Registrado! ✅');
  });

  // ─── ALLOW_DIRECT_MESSAGES gate ──────────────────────────────────────────

  it('blocks direct chat when allowDirectMessages is false (ignored, reason claro)', async () => {
    const p = payload({ text: 'oi' });
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender, false);
    expect(res.status).toBe('ignored');
    expect(res.reason).toBe('mensagem direta ignorada');
    expect(pi.send).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('allows group message when allowDirectMessages is false', async () => {
    const p = payload({ text: 'oi' });
    p.data.Info.IsGroup = true;
    p.data.Info.Chat = '120363045678901234@g.us';
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender, false);
    expect(res.status).toBe('forwarded');
    expect(pi.send).toHaveBeenCalledTimes(1);
  });

  it('allows direct chat when allowDirectMessages is true (default)', async () => {
    const p = payload({ text: 'oi' });
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender, true);
    expect(res.status).toBe('forwarded');
    expect(pi.send).toHaveBeenCalledTimes(1);
  });

  it('allows direct chat when allowDirectMessages is omitted (default true)', async () => {
    const p = payload({ text: 'oi' });
    const res = await processWebhook(p, 'good-token', reg, store, pi, sender);
    expect(res.status).toBe('forwarded');
    expect(pi.send).toHaveBeenCalledTimes(1);
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

  it('sends friendly fallback when Pi fails (does not leak technical reason to user)', async () => {
    pi = makePi({ success: false, reason: 'Pi RPC returned empty response' });
    const p = payload({ text: 'oi' });
    await processWebhook(p, 'good-token', reg, store, pi, sender);
    const last = sender.sent[sender.sent.length - 1];
    expect(last.chatId).toBe('5511999999999@s.whatsapp.net');
    expect(last.text).toBe('⚠️ Tive um problema aqui. Pode tentar de novo em instantes?');
    // internal error is still saved for diagnostics
    expect(store.errors).toEqual([{ id: '3EB0_ABC', reason: 'Pi RPC returned empty response' }]);
  });

  it('composing presence does NOT block piClient.send — proven by deferred resolve', async () => {
    let resolveComposing: () => void;
    const composingPending = new Promise<void>((res) => { resolveComposing = res; });

    (sender.sendPresence as any).mockImplementation(async (chatId: string, state: 'composing' | 'paused') => {
      sender.presence.push({ chatId, state });
      if (state === 'composing') {
        await composingPending;
      }
    });

    (pi.send as any).mockResolvedValue({ success: true, data: { message: 'ok' } });

    const p = payload({ text: 'oi' });
    const webhookPromise = processWebhook(p, 'good-token', reg, store, pi, sender);

    // Give microtasks a chance to run
    await new Promise(res => setTimeout(res, 10));

    // piClient.send was called BEFORE composing resolved
    expect(pi.send).toHaveBeenCalled();

    // Now resolve composing and let webhook finish
    resolveComposing!();
    await webhookPromise;

    // Paused was called (finally executed)
    expect(sender.presence.map(p => p.state)).toContain('paused');
  });

  it('paused presence fires from finally on success path', async () => {
    (pi.send as any).mockResolvedValue({ success: true, data: { message: 'ok' } });
    (sender.sendPresence as any).mockResolvedValue(undefined);

    const p = payload({ text: 'oi' });
    await processWebhook(p, 'good-token', reg, store, pi, sender);

    const calls = (sender.sendPresence as any).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[1]).toBe('paused');
  });

  it('paused presence fires from finally even when Pi returns failure', async () => {
    (pi.send as any).mockResolvedValue({ success: false, reason: 'timeout' });
    (sender.sendPresence as any).mockResolvedValue(undefined);

    const p = payload({ text: 'oi' });
    await processWebhook(p, 'good-token', reg, store, pi, sender);

    const calls = (sender.sendPresence as any).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[1]).toBe('paused');
    expect(sender.sent[sender.sent.length - 1].text).toBe('⚠️ Tive um problema aqui. Pode tentar de novo em instantes?');
  });

  it('paused presence fires from finally even when piClient.send throws', async () => {
    (pi.send as any).mockRejectedValue(new Error('crash'));
    (sender.sendPresence as any).mockResolvedValue(undefined);

    const p = payload({ text: 'oi' });
    await processWebhook(p, 'good-token', reg, store, pi, sender);

    const calls = (sender.sendPresence as any).mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[1]).toBe('paused');
  });
});
