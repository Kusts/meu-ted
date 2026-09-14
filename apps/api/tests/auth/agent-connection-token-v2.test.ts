import { describe, expect, it } from 'vitest';
import { createAgentConnectionToken, verifyAgentConnectionToken } from '../../src/auth/agent-connection-token.js';

describe('Agent connection token V2 capability defaults', () => {
  it('delegated/default connection tokens are read-only', async () => {
    const now = 1_700_000_000_000;
    const token = await createAgentConnectionToken(
      { sub: 'actor-1', workspace: 'workspace-1', role: 'owner' },
      'test-secret-at-least-32-characters-long!',
      now,
    );

    const claims = await verifyAgentConnectionToken(
      token,
      'test-secret-at-least-32-characters-long!',
      undefined,
      now,
    );
    expect(claims.capabilities).toEqual(['financial.read']);
    expect(claims.capabilities).not.toContain(['financial', 'write'].join('.'));
  });
});
