import { describe, expect, it } from 'vitest';
import { createDelegatedTokenForTest, verifyDelegatedTurnToken } from '../../src/auth/delegated-token.js';
import { buildTestApp } from '../test-app.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';

describe('G5.2.2 API delegated token validation', () => {
  it('validates every identity, scope and lifetime claim', async () => {
    const token = await createDelegatedTokenForTest({
      actorId: 'user-1', workspaceId: 'workspace-1', role: 'owner',
      capabilities: ['financial.read'], requestId: 'turn-1',
    }, 'test-secret', 1_700_000_000_000);
    await expect(verifyDelegatedTurnToken(token, 'test-secret', 1_700_000_000_000)).resolves.toMatchObject({
      iss: 'pi-agent', aud: 'pi-finance-api', sub: 'user-1', workspace: 'workspace-1', role: 'owner',
      capabilities: ['financial.read'], jti: expect.any(String), request: 'turn-1', exp: 1_700_000_300,
    });
  });

  it('authenticates API routes from the delegated workspace scope', async () => {
    const token = await createDelegatedTokenForTest({ actorId: 'user-1', workspaceId: HOUSEHOLD_A, role: 'member', capabilities: ['financial.read'], requestId: 'turn-1' }, 'test-secret', Date.now());
    const { app } = buildTestApp({}, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'test-secret');
    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/accounts', headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
    expect(response.json().items.every((item: { householdId: string }) => item.householdId === HOUSEHOLD_A)).toBe(true);
  });

  it('rejects wrong audience, missing route scope and expired tokens', async () => {
    const now = Date.now();
    const token = await createDelegatedTokenForTest({ actorId: 'u', workspaceId: HOUSEHOLD_A, role: 'member', capabilities: ['financial.write'], requestId: 'r' }, 'test-secret', now);
    await expect(verifyDelegatedTurnToken(token, 'wrong-secret', now)).rejects.toThrow('invalid delegated token');
    const expired = await createDelegatedTokenForTest({ actorId: 'u', workspaceId: HOUSEHOLD_A, role: 'member', capabilities: ['financial.write'], requestId: 'expired' }, 'test-secret', now - 301_000);
    await expect(verifyDelegatedTurnToken(expired, 'test-secret', now)).rejects.toThrow('expired delegated token');
    const { app } = buildTestApp({}, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'test-secret');
    await app.ready();
    const scopeResponse = await app.inject({ method: 'GET', url: '/accounts', headers: { authorization: `Bearer ${token}` } });
    expect(scopeResponse.statusCode).toBe(403);
    expect(scopeResponse.json().code).toBe('auth.delegation_scope_forbidden');
  });
});
