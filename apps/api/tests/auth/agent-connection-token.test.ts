import { describe, expect, it } from 'vitest';
import {
  createAgentConnectionToken,
  verifyAgentConnectionToken,
} from '../../src/auth/agent-connection-token.js';

describe('Agent Connection Token (Task 3)', () => {
  const SECRET = 'test-secret-at-least-32-characters-long!';
  const WRONG_SECRET = 'wrong-secret-also-32-characters-long!';

  const SAMPLE_INPUT = {
    sub: 'user-uuid-1',
    workspace: 'household-uuid-1',
    role: 'owner' as const,
  };

  it('creates a token with canonical claims and 120s TTL', async () => {
    const now = 1_700_000_000_000;
    const token = await createAgentConnectionToken(SAMPLE_INPUT, SECRET, now);
    expect(token).toBeTypeOf('string');
    expect(token.split('.')).toHaveLength(3);

    const verified = await verifyAgentConnectionToken(token, SECRET, undefined, now);
    expect(verified).toMatchObject({
      iss: 'pi-finance-api',
      aud: 'pi-finance-agent',
      sub: 'user-uuid-1',
      workspace: 'household-uuid-1',
      role: 'owner',
      capabilities: ['financial.read'],
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + 120,
    });
    expect(verified.jti).toBeTypeOf('string');
    expect(verified.jti.length).toBeGreaterThan(10);
  });

  it('verifies token matching expected workspace', async () => {
    const now = 1_700_000_000_000;
    const token = await createAgentConnectionToken(SAMPLE_INPUT, SECRET, now);

    // Matching workspace succeeds
    const verified = await verifyAgentConnectionToken(token, SECRET, 'household-uuid-1', now);
    expect(verified.sub).toBe('user-uuid-1');

    // Mismatched workspace throws
    await expect(
      verifyAgentConnectionToken(token, SECRET, 'other-household-uuid', now),
    ).rejects.toThrow(/workspace mismatch/);
  });

  it('rejects expired token', async () => {
    const issuedAt = 1_700_000_000_000;
    const token = await createAgentConnectionToken(SAMPLE_INPUT, SECRET, issuedAt);

    // Verify 121 seconds later -> expired
    const expiredTime = issuedAt + 121_000;
    await expect(
      verifyAgentConnectionToken(token, SECRET, undefined, expiredTime),
    ).rejects.toThrow(/expired agent token/);
  });

  it('rejects future iat exceeding clock skew tolerance (>30s)', async () => {
    const now = 1_700_000_000_000;
    const futureTime = now + 40_000; // 40s in future
    const token = await createAgentConnectionToken(SAMPLE_INPUT, SECRET, futureTime);

    await expect(
      verifyAgentConnectionToken(token, SECRET, undefined, now),
    ).rejects.toThrow(/future iat/);
  });

  it('rejects tampered signature or invalid secret', async () => {
    const token = await createAgentConnectionToken(SAMPLE_INPUT, SECRET);

    // Wrong secret
    await expect(
      verifyAgentConnectionToken(token, WRONG_SECRET),
    ).rejects.toThrow(/invalid signature/);

    // Tampered payload
    const [h, p, s] = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), role: 'owner', sub: 'hacker' })).toString('base64url');
    const tamperedToken = `${h}.${tamperedPayload}.${s}`;

    await expect(
      verifyAgentConnectionToken(tamperedToken, SECRET),
    ).rejects.toThrow(/invalid signature/);
  });

  it('rejects malformed or empty token formats', async () => {
    await expect(verifyAgentConnectionToken('', SECRET)).rejects.toThrow(/missing token/);
    await expect(verifyAgentConnectionToken('invalid.jwt', SECRET)).rejects.toThrow(/malformed/);
    await expect(verifyAgentConnectionToken('a.b.c', SECRET)).rejects.toThrow();
  });
});
