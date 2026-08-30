import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { loadConfig } from '../../src/env.js';
import { createPostgresInviteRuntime } from '../../src/server/production-routes.js';
import type { WorkspaceAccessStore } from '../../src/auth/workspace-access.js';

describe('production invite runtime', () => {
  it('reads the explicit delivery endpoint and bearer token from environment', () => {
    const previousUrl = process.env.INVITE_DELIVERY_URL;
    const previousToken = process.env.INVITE_DELIVERY_TOKEN;
    process.env.INVITE_DELIVERY_URL = 'https://mailer.example.test/invites';
    process.env.INVITE_DELIVERY_TOKEN = 'test-token-not-a-secret';

    try {
      expect(loadConfig()).toMatchObject({
        inviteDeliveryUrl: 'https://mailer.example.test/invites',
        inviteDeliveryToken: 'test-token-not-a-secret',
      });
    } finally {
      if (previousUrl === undefined) delete process.env.INVITE_DELIVERY_URL;
      else process.env.INVITE_DELIVERY_URL = previousUrl;
      if (previousToken === undefined) delete process.env.INVITE_DELIVERY_TOKEN;
      else process.env.INVITE_DELIVERY_TOKEN = previousToken;
    }
  });

  it('builds the invite service only with explicit delivery and authorizes shared owners', async () => {
    const workspaceAccess: WorkspaceAccessStore = {
      async resolve(userId, householdId) {
        return {
          userId,
          householdId,
          kind: 'shared',
          role: userId === 'owner-user' ? 'owner' : 'member',
        };
      },
    };
    const pool = {} as Pool;
    const delivery = async () => undefined;

    expect(createPostgresInviteRuntime({ pool, workspaceAccess })).toEqual({});

    const runtime = createPostgresInviteRuntime({ pool, workspaceAccess, delivery });
    expect(runtime.inviteService).toBeDefined();
    await expect(runtime.authorizeInviteCreate?.({ userId: 'owner-user', householdId: 'shared-id' })).resolves.toBe(true);
    await expect(runtime.authorizeInviteCreate?.({ userId: 'member-user', householdId: 'shared-id' })).resolves.toBe(false);
  });
});
