import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { createBetterAuth } from '../../src/auth/better-auth.js';
import { registerWorkspaceRoutes, WorkspaceError, type WorkspaceStore } from '../../src/auth/workspaces-http.js';

const auth = {
  api: {
    getSession: async () => ({
      user: { id: 'auth-user-1', email: 'owner@example.com' },
      session: { id: 'session-1' },
    }),
  },
} as unknown as ReturnType<typeof createBetterAuth>;

const makeStore = (): WorkspaceStore => ({
  list: vi.fn<WorkspaceStore['list']>(async () => [{ id: 'workspace-1', name: 'Casa', kind: 'shared', role: 'owner' }]),
  create: vi.fn<WorkspaceStore['create']>(async () => ({ id: 'workspace-2', name: 'Equipe', kind: 'shared', role: 'owner' })),
  listMembers: vi.fn<WorkspaceStore['listMembers']>(async () => [{ userId: 'user-2', name: 'Ana', email: 'ana@example.com', role: 'member' }]),
  removeMember: vi.fn<WorkspaceStore['removeMember']>(async () => undefined),
  leave: vi.fn<WorkspaceStore['leave']>(async () => undefined),
});

describe('workspace management HTTP', () => {
  it('lists and creates workspaces from the Better Auth session', async () => {
    const app = Fastify({ logger: false });
    const store = makeStore();
    registerWorkspaceRoutes(app, { auth, store });
    await app.ready();

    const list = await app.inject({ method: 'GET', url: '/workspaces' });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({ items: [{ id: 'workspace-1', name: 'Casa', kind: 'shared', role: 'owner' }], total: 1 });
    expect(store.list).toHaveBeenCalledWith('auth-user-1');

    const created = await app.inject({
      method: 'POST',
      url: '/workspaces',
      payload: { name: 'Equipe', kind: 'shared' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ id: 'workspace-2', kind: 'shared' });
    expect(store.create).toHaveBeenCalledWith({ authUserId: 'auth-user-1', name: 'Equipe', kind: 'shared' });
    await app.close();
  });

  it('lists members and allows owners to remove a member or leave', async () => {
    const app = Fastify({ logger: false });
    const store = makeStore();
    registerWorkspaceRoutes(app, { auth, store });
    await app.ready();

    const members = await app.inject({ method: 'GET', url: '/workspaces/00000000-0000-4000-8000-000000000001/members' });
    expect(members.statusCode).toBe(200);
    expect(members.json().items[0]).toMatchObject({ userId: 'user-2', role: 'member' });
    expect(store.listMembers).toHaveBeenCalledWith({ authUserId: 'auth-user-1', householdId: '00000000-0000-4000-8000-000000000001' });

    const removed = await app.inject({ method: 'DELETE', url: '/workspaces/00000000-0000-4000-8000-000000000001/members/00000000-0000-4000-8000-000000000002' });
    expect(removed.statusCode).toBe(204);
    expect(store.removeMember).toHaveBeenCalledWith({ authUserId: 'auth-user-1', householdId: '00000000-0000-4000-8000-000000000001', memberUserId: '00000000-0000-4000-8000-000000000002' });

    const left = await app.inject({ method: 'POST', url: '/workspaces/00000000-0000-4000-8000-000000000001/leave' });
    expect(left.statusCode).toBe(204);
    expect(store.leave).toHaveBeenCalledWith({ authUserId: 'auth-user-1', householdId: '00000000-0000-4000-8000-000000000001' });
    await app.close();
  });

  it('returns 403 for an authenticated non-member on every targeted workspace metadata mutation/read', async () => {
    const app = Fastify({ logger: false });
    const store = makeStore();
    const forbidden = new WorkspaceError('workspace.forbidden', 403, 'active workspace membership required');
    vi.mocked(store.listMembers).mockRejectedValue(forbidden);
    vi.mocked(store.removeMember).mockRejectedValue(forbidden);
    vi.mocked(store.leave).mockRejectedValue(forbidden);
    registerWorkspaceRoutes(app, { auth, store });
    await app.ready();
    const workspace = '00000000-0000-4000-8000-000000000001';

    const members = await app.inject({ method: 'GET', url: `/workspaces/${workspace}/members` });
    const remove = await app.inject({ method: 'DELETE', url: `/workspaces/${workspace}/members/user-2` });
    const leave = await app.inject({ method: 'POST', url: `/workspaces/${workspace}/leave` });
    expect(members.statusCode).toBe(403);
    expect(remove.statusCode).toBe(403);
    expect(leave.statusCode).toBe(403);
    expect(store.listMembers).toHaveBeenCalled();
    expect(store.removeMember).toHaveBeenCalled();
    expect(store.leave).toHaveBeenCalled();
    await app.close();
  });

  it('requires a session before exposing workspace metadata', async () => {
    const app = Fastify({ logger: false });
    const store = makeStore();
    const noSession = { api: { getSession: async () => null } } as unknown as ReturnType<typeof createBetterAuth>;
    registerWorkspaceRoutes(app, { auth: noSession, store });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/workspaces' });
    expect(response.statusCode).toBe(401);
    expect(store.list).not.toHaveBeenCalled();
    await app.close();
  });
});
