import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { requireWorkspaceRole, type WorkspaceAccess } from '../../src/auth/workspace-access.js';

const migration = readFileSync(new URL('../../src/read-models/sql/V020__identity_workspaces.sql', import.meta.url), 'utf8');
const invite = readFileSync(new URL('../../src/auth/invites-http.ts', import.meta.url), 'utf8');

describe('workspace roles', () => {
  it('allows owner/member only and rejects viewer authorization', () => {
    const member: WorkspaceAccess = { userId: 'user-1', householdId: 'workspace-1', role: 'member', kind: 'shared' };
    expect(requireWorkspaceRole({ workspaceAccess: member }, ['member'])).toEqual(member);
    expect(() => requireWorkspaceRole({ workspaceAccess: member }, ['owner'])).toThrowError(/not authorized/);
    expect(migration).toMatch(/CHECK \(role IN \('owner', 'member'\)\)/);
    expect(invite).toContain("z.enum(['owner', 'member'])");
  });
});
