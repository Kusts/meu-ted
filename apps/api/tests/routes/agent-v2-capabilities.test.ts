import { describe, expect, it } from 'vitest';
import { createAgentConnectionToken, verifyAgentConnectionToken } from '../../src/auth/agent-connection-token.js';

describe('Agent V2 capability boundary', () => {
  it('connection token defaults never grant a write capability', async () => {
    const token = await createAgentConnectionToken(
      { sub: 'actor-1', workspace: 'workspace-1', role: 'member' },
      'test-secret-at-least-32-characters-long!',
    );
    const claims = await verifyAgentConnectionToken(token, 'test-secret-at-least-32-characters-long!');
    expect(claims.capabilities).toEqual(['financial.read']);
  });
});
