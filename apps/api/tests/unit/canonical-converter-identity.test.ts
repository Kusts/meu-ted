import { describe, expect, it } from 'vitest';
import {
  IdentityError,
  resolveDerivedOwner,
  type IdentityArchiveEvidence,
} from '../../src/scripts/canonical-converter/identity.js';

const HOUSEHOLD = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const MEMBER = '33333333-3333-4333-8333-333333333333';

const evidence = (overrides: Partial<IdentityArchiveEvidence> = {}): IdentityArchiveEvidence => ({
  userIds: new Set([OWNER]),
  userIdByAuthId: new Map([['auth-owner', OWNER]]),
  allUserIds: [OWNER],
  memberships: [],
  linkedUserRefs: [],
  ...overrides,
});

describe('canonical converter identity derivation (M4)', () => {
  it('derives the owner from an archived V017 owner membership (auth id resolved)', () => {
    const owner = resolveDerivedOwner(
      HOUSEHOLD,
      evidence({ memberships: [{ rawUserId: 'auth-owner', role: 'owner' }] }),
    );
    expect(owner).toBe(OWNER);
  });

  it('derives the owner from a member membership when no owner row exists', () => {
    const owner = resolveDerivedOwner(
      HOUSEHOLD,
      evidence({ memberships: [{ rawUserId: OWNER, role: 'member' }] }),
    );
    expect(owner).toBe(OWNER);
  });

  it('prefers the owner membership over member links for distinct users', () => {
    const owner = resolveDerivedOwner(
      HOUSEHOLD,
      evidence({
        userIds: new Set([OWNER, MEMBER]),
        allUserIds: [OWNER, MEMBER],
        memberships: [
          { rawUserId: MEMBER, role: 'member' },
          { rawUserId: 'auth-owner', role: 'owner' },
        ],
      }),
    );
    expect(owner).toBe(OWNER);
  });

  it('derives the owner from device/operation evidence links when memberships are absent', () => {
    const owner = resolveDerivedOwner(
      HOUSEHOLD,
      evidence({ linkedUserRefs: ['auth-owner'] }),
    );
    expect(owner).toBe(OWNER);
  });

  it('falls back to the single archived user only when no link exists at all', () => {
    expect(resolveDerivedOwner(HOUSEHOLD, evidence())).toBe(OWNER);
  });

  it('fails closed on ambiguous candidates instead of picking one', () => {
    expect(() =>
      resolveDerivedOwner(
        HOUSEHOLD,
        evidence({
          userIds: new Set([OWNER, MEMBER]),
          allUserIds: [OWNER, MEMBER],
          linkedUserRefs: [OWNER, MEMBER],
        }),
      ),
    ).toThrow(IdentityError);
    expect(() =>
      resolveDerivedOwner(
        HOUSEHOLD,
        evidence({
          userIds: new Set([OWNER, MEMBER]),
          allUserIds: [OWNER, MEMBER],
          memberships: [
            { rawUserId: OWNER, role: 'owner' },
            { rawUserId: MEMBER, role: 'owner' },
          ],
        }),
      ),
    ).toThrow(IdentityError);
    // No link and no single creator: nothing evidenced, refuse.
    expect(() =>
      resolveDerivedOwner(HOUSEHOLD, evidence({ userIds: new Set(), allUserIds: [] })),
    ).toThrow(IdentityError);
  });

  it('fails closed when links exist but none resolve to a known user', () => {
    expect(() =>
      resolveDerivedOwner(
        HOUSEHOLD,
        evidence({ memberships: [{ rawUserId: 'auth-ghost', role: 'owner' }] }),
      ),
    ).toThrow(IdentityError);
  });

  it('ignores null/undefined linked refs and falls back to the single archived user', () => {
    expect(
      resolveDerivedOwner(
        HOUSEHOLD,
        evidence({ linkedUserRefs: [null, undefined] }),
      ),
    ).toBe(OWNER);
  });
});
