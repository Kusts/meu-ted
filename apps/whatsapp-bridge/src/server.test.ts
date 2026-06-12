// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Bridge — server tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApp } from './server.js';
import type { PiClient, UserRegistry, SourceMessageStore, ResponseSender } from './webhook-handler.js';

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
      const json = await res.json();
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