import { describe, expect, it, vi, afterEach } from 'vitest';
import { createDelegatedTurnToken, decodeDelegatedTurnToken } from '../src/delegated-token.js';
import { createAgentConnectionToken } from '../../api/src/auth/agent-connection-token.js';
import { FinanceChatAgent } from '../src/finance-chat-agent.js';
import type { FinanceChatAgent as FinanceChatAgentType } from '../src/finance-chat-agent.js';

const SECRET = 'h07-delegation-secret-32-chars-minimum!';
const CONN_SECRET = 'h07-connection-secret-32-chars-minimum!';

describe('H-07: device binding no token delegado', () => {
  it('round-trip com deviceId vinculado', async () => {
    const token = await createDelegatedTurnToken(
      {
        actorId: 'user-1',
        workspaceId: 'ws-1',
        role: 'member',
        capabilities: ['financial.read'],
        requestId: 'turn-1',
        deviceId: 'device-abc-123',
      },
      SECRET,
      1_700_000_000_000,
    );
    const claims = await decodeDelegatedTurnToken(token, SECRET, 1_700_000_000_000);
    expect(claims.deviceId).toBe('device-abc-123');
  });

  it('token sem deviceId continua válido (compatibilidade)', async () => {
    const token = await createDelegatedTurnToken(
      { actorId: 'user-1', workspaceId: 'ws-1', role: 'member', capabilities: ['financial.read'], requestId: 'turn-1' },
      SECRET,
      1_700_000_000_000,
    );
    const claims = await decodeDelegatedTurnToken(token, SECRET, 1_700_000_000_000);
    expect(claims.deviceId).toBeUndefined();
  });

  it('deviceId adulterado invalida a assinatura', async () => {
    const token = await createDelegatedTurnToken(
      {
        actorId: 'user-1', workspaceId: 'ws-1', role: 'member',
        capabilities: ['financial.read'], requestId: 'turn-1', deviceId: 'device-a',
      },
      SECRET,
      1_700_000_000_000,
    );
    const [h, p, s] = token.split('.');
    const payload = JSON.parse(Buffer.from(p!, 'base64url').toString('utf8')) as Record<string, unknown>;
    payload.deviceId = 'device-b';
    const forged = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`;
    await expect(decodeDelegatedTurnToken(forged, SECRET, 1_700_000_000_000)).rejects.toThrow(
      'invalid delegated token',
    );
  });

  it('deviceId malformado é rejeitado na emissão', async () => {
    await expect(
      createDelegatedTurnToken(
        {
          actorId: 'user-1', workspaceId: 'ws-1', role: 'member',
          capabilities: ['financial.read'], requestId: 'turn-1', deviceId: '   ',
        },
        SECRET,
      ),
    ).rejects.toThrow('delegation claims are invalid');
  });
});

describe('H-07: DO amarra identidade ao token (spoof de headers falha)', () => {
  afterEach(() => vi.restoreAllMocks());

  const setupAgent = async () => {
    const agent = Object.create(FinanceChatAgent.prototype) as FinanceChatAgentType & {
      messages: unknown[];
      persistMessages: (msgs: unknown[]) => Promise<void>;
    };
    agent.messages = [];
    agent.persistMessages = vi.fn(async () => {});
    Object.defineProperty(agent, 'state', { value: { storage: {} }, writable: true, configurable: true });
    Object.defineProperty(agent, 'env', {
      value: { API_ORIGIN: 'https://api.test.local', AGENT_CONNECTION_TOKEN_SECRET: CONN_SECRET },
      writable: true,
      configurable: true,
    });
    return agent;
  };

  it('history com token válido mas headers forjados → 403 (não confia em header livre)', async () => {
    const agent = await setupAgent();
    const token = await createAgentConnectionToken(
      { sub: 'user-real', workspace: 'ws-real', role: 'owner' },
      CONN_SECRET,
    );
    const res = await agent.fetch(
      new Request('https://agent.test.local/rpc/history', {
        headers: {
          'x-agent-connection-token': token,
          'x-agent-actor': 'attacker-spoofed',
          'x-agent-workspace': 'ws-real',
        },
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('agent.identity_mismatch');
  });

  it('history cross-workspace (token ws-A + headers ws-B) → 403', async () => {
    const agent = await setupAgent();
    const token = await createAgentConnectionToken(
      { sub: 'user-real', workspace: 'ws-a', role: 'owner' },
      CONN_SECRET,
    );
    const res = await agent.fetch(
      new Request('https://agent.test.local/rpc/history', {
        headers: {
          'x-agent-connection-token': token,
          'x-agent-actor': 'user-real',
          'x-agent-workspace': 'ws-b',
        },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('history com token + headers consistentes passa pelo binding', async () => {
    const agent = await setupAgent();
    const token = await createAgentConnectionToken(
      { sub: 'user-real', workspace: 'ws-real', role: 'owner' },
      CONN_SECRET,
    );
    const res = await agent.fetch(
      new Request('https://agent.test.local/rpc/history', {
        headers: {
          'x-agent-connection-token': token,
          'x-agent-actor': 'user-real',
          'x-agent-workspace': 'ws-real',
        },
      }),
    );
    expect(res.status).toBe(200);
  });
});
