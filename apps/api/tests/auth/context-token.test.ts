import { describe, expect, it, vi } from 'vitest';
import {
  createContextToken,
  validateContextToken,
  validateAndClaimContextToken,
  type ContextTokenClaims,
} from '../../src/auth/context-token.js';

const claims: ContextTokenClaims = {
  channelActorId: 'actor-1',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  chatId: '120363045678901234@g.us',
  providerMessageId: 'provider-message-1',
  requestId: 'request-1',
};

const secret = 'context-secret-for-tests';

describe('context token', () => {
  it('round-trips signed claims', async () => {
    const token = await createContextToken(claims, secret, 1_700_000_000_000);
    await expect(validateContextToken(token, secret, {
      requestId: claims.requestId,
      providerMessageId: claims.providerMessageId,
      nowMs: 1_700_000_001_000,
    })).resolves.toMatchObject({ ...claims, version: 1 });
  });

  it('rejects a changed signature, audience, binding or expiry', async () => {
    const token = await createContextToken(claims, secret, 1_700_000_000_000);
    await expect(validateContextToken(`${token}x`, secret)).rejects.toThrow();
    await expect(validateContextToken(token, 'wrong-secret')).rejects.toThrow();
    await expect(validateContextToken(token, secret, { requestId: 'other' })).rejects.toThrow();
    await expect(validateContextToken(token, secret, { nowMs: 1_700_000_400_000 })).rejects.toThrow();
  });
  it('fails closed when the secret is missing', async () => {
    await expect(createContextToken(claims, '')).rejects.toThrow('secret is required');
    await expect(validateContextToken('invalid', '')).rejects.toThrow('secret is required');
  });
  it('claims replay only after cryptographic validation', async () => {
    const token = await createContextToken(claims, secret, 1_700_000_000_000);
    const claim = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const replayGuard = { claim };

    await expect(validateAndClaimContextToken(token, secret, replayGuard, { nowMs: 1_700_000_001_000 })).resolves.toMatchObject({ jti: expect.any(String) });
    await expect(validateAndClaimContextToken(token, secret, replayGuard, { nowMs: 1_700_000_001_000 })).rejects.toThrow('replay detected');
    expect(claim).toHaveBeenCalledTimes(2);
  });
});
