import { describe, expect, it } from 'vitest';
import { createDelegatedTurnToken, decodeDelegatedTurnToken } from '../src/delegated-token';

const input = {
  actorId: 'user-1',
  workspaceId: 'workspace-1',
  role: 'member' as const,
  capabilities: ['list_accounts', 'create_expense'],
  requestId: 'turn-1',
};

describe('G5.2.2 delegated turn token', () => {
  it('emits a signed JWT with the complete five-minute turn scope', async () => {
    const token = await createDelegatedTurnToken(input, 'test-secret', 1_700_000_000_000);
    const claims = await decodeDelegatedTurnToken(token, 'test-secret', 1_700_000_000_000);
    expect(claims).toMatchObject({
      iss: 'pi-agent', aud: 'pi-finance-api', sub: 'user-1', workspace: 'workspace-1',
      role: 'member', capabilities: input.capabilities, jti: expect.any(String), request: 'turn-1',
      iat: 1_700_000_000, exp: 1_700_000_300,
    });
  });

  it('rejects tampering and a token older than five minutes', async () => {
    const token = await createDelegatedTurnToken(input, 'test-secret', 1_700_000_000_000);
    const tampered = `${token.slice(0, -2)}${token.at(-2) === 'x' ? 'y' : 'x'}${token.at(-1)}`;
    await expect(decodeDelegatedTurnToken(tampered, 'test-secret', 1_700_000_000_000)).rejects.toThrow('invalid delegated token');
    await expect(decodeDelegatedTurnToken(token, 'test-secret', 1_700_000_301_000)).rejects.toThrow('expired delegated token');
  });
});
