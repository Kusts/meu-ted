import { describe, expect, it } from 'vitest';

describe('workspaces module import smoke test', () => {
  it('imports workspaces-store, workspaces-postgres and workspaces-http cleanly without circular dependency degradation', async () => {
    const storeModule = await import('../../src/auth/workspaces-store.js');
    expect(storeModule.WorkspaceError).toBeDefined();
    expect(typeof storeModule.createInMemoryWorkspaceStore).toBe('function');

    const postgresModule = await import('../../src/auth/workspaces-postgres.js');
    expect(typeof postgresModule.createPostgresWorkspaceStore).toBe('function');

    const httpModule = await import('../../src/auth/workspaces-http.js');
    expect(typeof httpModule.registerWorkspaceRoutes).toBe('function');
    expect(httpModule.WorkspaceError).toBe(storeModule.WorkspaceError);
    expect(httpModule.createPostgresWorkspaceStore).toBe(postgresModule.createPostgresWorkspaceStore);
  });
});
