import { describe, expect, it, vi } from 'vitest';
import {
  verifyAgentConnectionToken,
  consumeAgentToken,
  hashJti,
} from '../src/auth/connection-token.js';
import { createAgentConnectionToken } from '../../api/src/auth/agent-connection-token.js';

describe('Worker Connection Token Verification & Anti-Replay (Task 3)', () => {
  const SECRET = 'test-secret-at-least-32-characters-long!';
  const SERVICE_TOKEN = 'test-service-token-at-least-32-chars!';

  const SAMPLE_INPUT = {
    sub: 'user-uuid-1',
    workspace: 'workspace-uuid-1',
    role: 'owner' as const,
  };

  it('computes sha256 hex hash of JTI', async () => {
    const hash = await hashJti('test-jti-123');
    expect(hash).toBeTypeOf('string');
    expect(hash).toHaveLength(64);
  });

  it('verifies signed token and validates matching workspace', async () => {
    const now = 1_700_000_000_000;
    const token = await createAgentConnectionToken(SAMPLE_INPUT, SECRET, now);

    const claims = await verifyAgentConnectionToken(token, SECRET, 'workspace-uuid-1', now);
    expect(claims.sub).toBe('user-uuid-1');
    expect(claims.workspace).toBe('workspace-uuid-1');
    expect(claims.role).toBe('owner');
    expect(claims.iss).toBe('pi-finance-api');
    expect(claims.aud).toBe('pi-finance-agent');

    // Mismatched workspace throws
    await expect(
      verifyAgentConnectionToken(token, SECRET, 'mismatched-workspace', now),
    ).rejects.toThrow(/workspace mismatch/);
  });

  it('consumeAgentToken calls internal API with service token header and handles success & 409 replay', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    // 1. Success case (200 OK)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, consumed: true }), { status: 200 }),
    );

    const res1 = await consumeAgentToken('https://api.example.test', SERVICE_TOKEN, {
      jti: 'jti-abc-123',
      workspaceId: 'workspace-uuid-1',
      actorId: 'user-uuid-1',
    });
    expect(res1).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/internal/agent/consume-token');
    expect((init as RequestInit).headers).toMatchObject({
      'content-type': 'application/json',
      'x-agent-service-token': SERVICE_TOKEN,
    });

    // 2. Replay case (409 Conflict)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, code: 'agent.token_replayed' }), { status: 409 }),
    );

    const res2 = await consumeAgentToken('https://api.example.test', SERVICE_TOKEN, {
      jti: 'jti-abc-123',
      workspaceId: 'workspace-uuid-1',
      actorId: 'user-uuid-1',
    });
    expect(res2).toBe(false);
  });
});
