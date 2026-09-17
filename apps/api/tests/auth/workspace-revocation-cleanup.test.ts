import { describe, expect, it, vi } from 'vitest';
import { createInMemoryDeviceTokenStore } from '../../src/auth/device-token.js';
import { createInMemoryWorkspaceStore } from '../../src/auth/workspaces-store.js';
import { resolveAuthorizedDevice } from '../../src/auth/device-access.js';
import type { WorkspaceAccessStore } from '../../src/auth/workspace-access.js';

const stubWorkspaceAccess = (memberships: Set<string>): WorkspaceAccessStore => ({
  resolve: async (authUserId: string, householdId: string) => {
    if (!memberships.has(`${authUserId}:${householdId}`)) return undefined;
    return { userId: authUserId, householdId, role: 'member', kind: 'shared' };
  },
});

describe('workspace membership revocation cleanup (V4.1 tasks 1.6/1.9)', () => {
  it('leave revokes the departing user device tokens and denies subsequent device requests', async () => {
    const tokens = createInMemoryDeviceTokenStore();
    const memberships = new Set<string>();
    const access = stubWorkspaceAccess(memberships);
    const revoked: Array<{ userId: string; householdId: string }> = [];
    const workspaces = createInMemoryWorkspaceStore({
      onMemberRevoked: async (input) => {
        revoked.push(input);
        await tokens.revokeAllForUserWorkspace(input.userId, input.householdId);
      },
    });

    const createdWs = await workspaces.create({ authUserId: 'leaver', name: 'Casa', kind: 'shared' });
    memberships.add(`leaver:${createdWs.id}`);
    const created = await tokens.register('phone', createdWs.id, { userId: 'leaver' });

    await workspaces.leave({ authUserId: 'leaver', householdId: createdWs.id });
    memberships.delete(`leaver:${createdWs.id}`);

    expect(revoked).toEqual([{ userId: 'leaver', householdId: createdWs.id }]);
    await expect(tokens.resolve(created.token, createdWs.id)).rejects.toMatchObject({ code: 'auth.invalid_token' });
    await expect(resolveAuthorizedDevice({ tokenStore: tokens, workspaceAccess: access }, created.token, createdWs.id)).rejects.toMatchObject({
      statusCode: 401,
    });
    const lingering = await tokens.register('phone', createdWs.id, { userId: 'leaver' });
    await expect(resolveAuthorizedDevice({ tokenStore: tokens, workspaceAccess: access }, lingering.token, createdWs.id)).rejects.toMatchObject({
      code: 'auth.workspace_forbidden',
    });
  });

  it('removeMember of a non-member performs no revocation cleanup', async () => {
    const onMemberRevoked = vi.fn();
    const workspaces = createInMemoryWorkspaceStore({ onMemberRevoked });
    const created = await workspaces.create({ authUserId: 'owner', name: 'Casa', kind: 'shared' });

    await workspaces.removeMember({ authUserId: 'owner', householdId: created.id, memberUserId: 'ghost' });

    expect(onMemberRevoked).not.toHaveBeenCalled();
  });
});
