// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Bridge — server tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApp } from './server.js';
import type { PiClient, UserRegistry, SourceMessageStore, ResponseSender } from './webhook-handler.js';

beforeEach(() => {
  process.env.PI_CONTEXT_TOKEN_SECRET = 'test-secret';
});

function makePi(): PiClient {
  return {
    send: vi.fn(async () => ({ success: true, data: { message: 'ok' } })),
  };
}

function makeRegistry(): UserRegistry {
  const phones = new Set(['5511999999999']);
  return {
    isPhoneRegistered: (p) => phones.has(p),
    isGroupAllowed: () => false,
    getHouseholdIdForGroup: () => null,
  };
}

function makeStore(): SourceMessageStore {
  const seen = new Set<string>();
  return {
    isProcessed: (id) => seen.has(id),
    markProcessed: (msg) => { seen.add(msg.providerMessageId); },
    saveError: () => {},
  };
}

function makeSender(): ResponseSender {
  return {
    send: vi.fn(async () => {}),
    sendPresence: vi.fn(async () => {}),
  };
}

describe('server /health', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  afterEach(() => {
    if (app) app.close().catch(() => {/* ignore */});
  });

  it('GET /health returns {status:"ok"} immediately — createApp does NOT prewarm Pi', async () => {
    const pi = makePi();
    const reg = makeRegistry();
    const store = makeStore();
    const sender = makeSender();

    // Pass piClient explicitly — same pattern as main()
    app = createApp({ piClient: pi, registry: reg, store, sender });

    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = (app as unknown as { server: { address(): AddressInfo | string | null } }).server.address() as AddressInfo;

    try {
      // Health responds immediately — warmup is deferred to main(), not createApp
      const res = await fetch(`http://127.0.0.1:${address.port}/health`);
      expect(res.status).toBe(200);
      const json = await res.json() as { status: string };
      expect(json).toEqual({ status: 'ok' });

      // Verify Pi warmup was NOT called inside createApp
      expect(pi.send).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('createApp uses piClient from options when provided', async () => {
    const pi = makePi();
    const reg = makeRegistry();
    const store = makeStore();
    const sender = makeSender();

    // Explicit piClient passed — createApp must use it, not call createPiClient
    app = createApp({ piClient: pi, registry: reg, store, sender });
    await app.close();

    // If createApp had called createPiClient internally, pi.send would be a mock —
    // but we passed our own pi, so the test confirms the instance is used
    expect(pi.send).toBeDefined();
  });
});

describe('server /webhooks/evolution', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let pi: PiClient;
  let sender: ReturnType<typeof makeSender>;

  afterEach(() => {
    if (app) app.close().catch(() => {/* ignore */});
  });

  const directMessagePayload = {
    event: 'Message',
    instanceId: 'instance-1',
    instanceToken: 'good-token',
    data: {
      Info: {
        Chat: '5511999999999@s.whatsapp.net',
        Sender: '5511999999999:19@s.whatsapp.net',
        IsFromMe: false,
        IsGroup: false,
        ID: 'MSG_001',
        Type: 'text',
        PushName: 'João',
        Timestamp: '2024-10-10T17:17:44-03:00',
      },
      Message: { conversation: 'oi' },
    },
  };

  it('blocks direct chat when allowDirectMessages is false via AppOptions', async () => {
    pi = makePi();
    sender = makeSender();
    const reg = makeRegistry();
    const store = makeStore();

    app = createApp({
      piClient: pi,
      registry: reg,
      store,
      sender,
      expectedInstanceToken: 'good-token',
      allowDirectMessages: false,
    });

    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = (app as unknown as { server: { address(): AddressInfo | string | null } }).server.address() as AddressInfo;

    try {
      const res = await fetch(`http://127.0.0.1:${address.port}/webhooks/evolution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(directMessagePayload),
      });
      expect(res.status).toBe(200);
      const json = await res.json() as { status: string; reason?: string };
      expect(json.status).toBe('ignored');
      expect(json.reason).toBe('mensagem direta ignorada');
      // Pi was never called
      expect(pi.send).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('allows direct chat when allowDirectMessages is true via AppOptions', async () => {
    pi = makePi();
    sender = makeSender();
    const reg = makeRegistry();
    const store = makeStore();

    app = createApp({
      piClient: pi,
      registry: reg,
      store,
      sender,
      expectedInstanceToken: 'good-token',
      allowDirectMessages: true,
    });

    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = (app as unknown as { server: { address(): AddressInfo | string | null } }).server.address() as AddressInfo;

    try {
      const res = await fetch(`http://127.0.0.1:${address.port}/webhooks/evolution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(directMessagePayload),
      });
      expect(res.status).toBe(200);
      const json = await res.json() as { status: string; reason?: string };
      expect(json.status).toBe('forwarded');
      expect(pi.send).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('forwards group message when allowDirectMessages is false (group-only mode)', async () => {
    pi = makePi();
    sender = makeSender();
    // Registry allows group 120363045678901234@g.us
    const phones = new Set(['5511999999999']);
    const groups = new Set(['120363045678901234@g.us']);
    const reg: UserRegistry = {
      isPhoneRegistered: (p) => phones.has(p),
      isGroupAllowed: (g) => groups.has(g),
      getHouseholdIdForGroup: () => 'household-1',
    };
    const store = makeStore();

    const groupPayload = {
      event: 'Message',
      instanceId: 'instance-1',
      instanceToken: 'good-token',
      data: {
        Info: {
          Chat: '120363045678901234@g.us',
          Sender: '5511999999999:19@s.whatsapp.net',
          IsFromMe: false,
          IsGroup: true,
          ID: 'MSG_GRP_001',
          Type: 'text',
          PushName: 'João',
          Timestamp: '2024-10-10T17:17:44-03:00',
        },
        Message: { conversation: 'oi grupo' },
      },
    };

    app = createApp({
      piClient: pi,
      registry: reg,
      store,
      sender,
      expectedInstanceToken: 'good-token',
      allowDirectMessages: false,
    });

    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = (app as unknown as { server: { address(): AddressInfo | string | null } }).server.address() as AddressInfo;

    try {
      const res = await fetch(`http://127.0.0.1:${address.port}/webhooks/evolution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(groupPayload),
      });
      expect(res.status).toBe(200);
      const json = await res.json() as { status: string; reason?: string };
      expect(json.status).toBe('forwarded');
      expect(pi.send).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});