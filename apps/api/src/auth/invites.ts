import { createHash, randomBytes, randomUUID } from 'node:crypto';

export type InviteRole = 'owner' | 'member';

export type InviteUser = {
  id: string;
  email: string;
};

export type InviteRecord = {
  id: string;
  householdId: string;
  email: string;
  role: InviteRole;
  tokenHash: string;
  expiresAt: Date;
  acceptedAt?: Date;
  revokedAt?: Date;
  invitedByUserId: string;
  createdAt?: Date;
};

export type PendingInviteSummary = {
  id: string;
  householdId: string;
  email: string;
  role: InviteRole;
  expiresAt: Date;
  createdAt?: Date;
};

export type InviteDeliveryMessage = {
  inviteId: string;
  householdId: string;
  email: string;
  token: string;
  expiresAt: Date;
};

export type InviteDelivery = (message: InviteDeliveryMessage) => Promise<void>;

export type InviteMembership = {
  userId: string;
  householdId: string;
  role: InviteRole;
};

export type InviteStore = {
  insertInvite(record: InviteRecord): Promise<void>;
  acceptInvite(input: {
    tokenHash: string;
    userId: string;
    userEmail: string;
    now: Date;
  }): Promise<{ invite: InviteRecord; membership: InviteMembership }>;
  listPendingInvites(householdId: string, now?: Date | undefined): Promise<PendingInviteSummary[]>;
  revokeInvite(input: { householdId: string; inviteId: string; now?: Date | undefined }): Promise<{ id: string; householdId: string; revokedAt: Date }>;
  getPendingInvite(householdId: string, inviteId: string): Promise<InviteRecord>;
  activateResentInvite(input: {
    householdId: string;
    inviteId: string;
    expectedTokenHash: string;
    newTokenHash: string;
    newExpiresAt: Date;
    now: Date;
  }): Promise<InviteRecord>;
  verifyInvite(input: { tokenHash: string; now: Date }): Promise<Pick<InviteRecord, 'id' | 'householdId' | 'email' | 'role' | 'expiresAt'>>;
};

export type CreateInviteInput = {
  householdId: string;
  email: string;
  role: InviteRole;
  invitedByUserId: string;
  expiresAt: Date;
};

export class InviteError extends Error {
  constructor(
    message: string,
    readonly code: 'invite.invalid_email' | 'invite.not_found' | 'invite.expired' | 'invite.already_used' | 'invite.revoked' | 'invite.user_not_found' | 'invite.email_mismatch' | 'invite.delivery_unavailable',
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = 'InviteError';
  }
}

export const normalizeInviteEmail = (email: string): string => email.trim().normalize('NFC').toLowerCase();

export const hashInviteToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export const createInviteService = (deps: {
  store: InviteStore;
  deliver: InviteDelivery;
}) => ({
  async createInvite(input: CreateInviteInput): Promise<Pick<InviteRecord, 'id' | 'householdId' | 'email' | 'role' | 'expiresAt'>> {
    const email = normalizeInviteEmail(input.email);
    if (!email || !email.includes('@')) throw new InviteError('invite email is invalid', 'invite.invalid_email');
    if (input.expiresAt.getTime() <= Date.now()) throw new InviteError('invite expiry must be in the future', 'invite.expired');

    const token = randomBytes(32).toString('hex');
    const record: InviteRecord = {
      id: randomUUID(),
      householdId: input.householdId,
      email,
      role: input.role,
      tokenHash: hashInviteToken(token),
      expiresAt: new Date(input.expiresAt),
      invitedByUserId: input.invitedByUserId,
    };

    // Deliver before commit: if delivery fails, nothing is persisted in the store.
    await deps.deliver({
      inviteId: record.id,
      householdId: record.householdId,
      email: record.email,
      token,
      expiresAt: record.expiresAt,
    });

    await deps.store.insertInvite(record);

    return {
      id: record.id,
      householdId: record.householdId,
      email: record.email,
      role: record.role,
      expiresAt: record.expiresAt,
    };
  },

  async acceptInvite(input: { token: string; userId: string; userEmail: string; now?: Date }): Promise<{ inviteId: string; membership: InviteMembership }> {
    const result = await deps.store.acceptInvite({
      tokenHash: hashInviteToken(input.token),
      userId: input.userId,
      userEmail: input.userEmail,
      now: input.now ?? new Date(),
    });
    return { inviteId: result.invite.id, membership: result.membership };
  },

  async listPendingInvites(input: { householdId: string; now?: Date }): Promise<PendingInviteSummary[]> {
    return deps.store.listPendingInvites(input.householdId, input.now);
  },

  async revokeInvite(input: { householdId: string; inviteId: string; now?: Date }): Promise<{ id: string; householdId: string; revokedAt: Date }> {
    return deps.store.revokeInvite(input);
  },

  async resendInvite(input: { householdId: string; inviteId: string; newExpiresAt?: Date; now?: Date }): Promise<Pick<InviteRecord, 'id' | 'householdId' | 'email' | 'role' | 'expiresAt'>> {
    const now = input.now ?? new Date();
    // 1. Fetch current pending invite state
    const pending = await deps.store.getPendingInvite(input.householdId, input.inviteId);
    const token = randomBytes(32).toString('hex');
    const newTokenHash = hashInviteToken(token);
    const expiresAt = input.newExpiresAt ?? (pending.expiresAt.getTime() > now.getTime() ? pending.expiresAt : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));

    // 2. Deliver new token: if delivery fails, store is never mutated and previous token remains active.
    await deps.deliver({
      inviteId: pending.id,
      householdId: pending.householdId,
      email: pending.email,
      token,
      expiresAt,
    });

    // 3. Atomic CAS Activation: only updates if expectedTokenHash matches current state and invite is still pending.
    const updated = await deps.store.activateResentInvite({
      householdId: input.householdId,
      inviteId: input.inviteId,
      expectedTokenHash: pending.tokenHash,
      newTokenHash,
      newExpiresAt: expiresAt,
      now,
    });

    return {
      id: updated.id,
      householdId: updated.householdId,
      email: updated.email,
      role: updated.role,
      expiresAt: updated.expiresAt,
    };
  },

  async verifyInvite(input: { token: string; now?: Date }): Promise<Pick<InviteRecord, 'id' | 'householdId' | 'email' | 'role' | 'expiresAt'>> {
    const result = await deps.store.verifyInvite({
      tokenHash: hashInviteToken(input.token),
      now: input.now ?? new Date(),
    });
    return result;
  },
});

export type InviteService = ReturnType<typeof createInviteService>;

type InMemoryInviteStore = InviteStore & {
  getRawInvite(id: string): InviteRecord | undefined;
  listMemberships(): InviteMembership[];
  addUser(user: InviteUser): void;
};

export const createInMemoryInviteStore = (input: { users: InviteUser[] }): InMemoryInviteStore => {
  const usersById = new Map(input.users.map((user) => [user.id, user]));
  const invites = new Map<string, InviteRecord>();
  const memberships = new Map<string, InviteMembership>();

  return {
    async insertInvite(record) {
      invites.set(record.id, { ...record });
    },

    async acceptInvite({ tokenHash, userId, userEmail, now }) {
      const invite = [...invites.values()].find((candidate) => candidate.tokenHash === tokenHash);
      if (!invite) throw new InviteError('invite was not found', 'invite.not_found', 404);
      if (invite.revokedAt) throw new InviteError('invite was revoked', 'invite.revoked', 410);
      if (invite.acceptedAt) throw new InviteError('invite was already used', 'invite.already_used', 409);
      if (invite.expiresAt.getTime() <= now.getTime()) throw new InviteError('invite expired', 'invite.expired', 410);

      const user = usersById.get(userId);
      if (!user) throw new InviteError('invite requires an existing user', 'invite.user_not_found', 404);
      if (normalizeInviteEmail(userEmail) !== invite.email || normalizeInviteEmail(user.email) !== invite.email) {
        throw new InviteError('authenticated email does not match invite', 'invite.email_mismatch', 403);
      }

      const membershipKey = `${userId}:${invite.householdId}`;
      const membership = memberships.get(membershipKey) ?? {
        userId,
        householdId: invite.householdId,
        role: invite.role,
      };
      memberships.set(membershipKey, membership);
      invite.acceptedAt = new Date(now);
      return { invite: { ...invite }, membership };
    },

    async listPendingInvites(householdId, now = new Date()) {
      return [...invites.values()]
        .filter((candidate) => candidate.householdId === householdId && !candidate.acceptedAt && !candidate.revokedAt && candidate.expiresAt.getTime() > now.getTime())
        .map((candidate) => ({
          id: candidate.id,
          householdId: candidate.householdId,
          email: candidate.email,
          role: candidate.role,
          expiresAt: candidate.expiresAt,
          ...(candidate.createdAt ? { createdAt: candidate.createdAt } : {}),
        }));
    },

    async revokeInvite({ householdId, inviteId, now = new Date() }) {
      const invite = invites.get(inviteId);
      if (!invite || invite.householdId !== householdId) {
        throw new InviteError('invite was not found', 'invite.not_found', 404);
      }
      if (invite.acceptedAt) {
        throw new InviteError('invite was already used', 'invite.already_used', 409);
      }
      if (!invite.revokedAt) {
        invite.revokedAt = new Date(now);
      }
      return {
        id: invite.id,
        householdId: invite.householdId,
        revokedAt: invite.revokedAt,
      };
    },

    async getPendingInvite(householdId, inviteId) {
      const invite = invites.get(inviteId);
      if (!invite || invite.householdId !== householdId) {
        throw new InviteError('invite was not found', 'invite.not_found', 404);
      }
      if (invite.acceptedAt) {
        throw new InviteError('invite was already used', 'invite.already_used', 409);
      }
      if (invite.revokedAt) {
        throw new InviteError('invite was revoked', 'invite.revoked', 410);
      }
      return { ...invite };
    },

    async activateResentInvite({ householdId, inviteId, expectedTokenHash, newTokenHash, newExpiresAt, now }) {
      const invite = invites.get(inviteId);
      if (!invite || invite.householdId !== householdId) {
        throw new InviteError('invite was not found', 'invite.not_found', 404);
      }
      if (invite.acceptedAt) {
        throw new InviteError('invite was already used', 'invite.already_used', 409);
      }
      if (invite.revokedAt) {
        throw new InviteError('invite was revoked', 'invite.revoked', 410);
      }
      if (invite.tokenHash !== expectedTokenHash) {
        throw new InviteError('invite was modified concurrently', 'invite.already_used', 409);
      }
      invite.tokenHash = newTokenHash;
      invite.expiresAt = new Date(newExpiresAt);
      return { ...invite };
    },

    async verifyInvite({ tokenHash, now }) {
      const invite = [...invites.values()].find((candidate) => candidate.tokenHash === tokenHash);
      if (!invite) throw new InviteError('invite was not found', 'invite.not_found', 404);
      if (invite.revokedAt) throw new InviteError('invite was revoked', 'invite.revoked', 410);
      if (invite.acceptedAt) throw new InviteError('invite was already used', 'invite.already_used', 409);
      if (invite.expiresAt.getTime() <= now.getTime()) throw new InviteError('invite expired', 'invite.expired', 410);
      return {
        id: invite.id,
        householdId: invite.householdId,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
      };
    },

    getRawInvite(id) {
      const invite = invites.get(id);
      return invite ? { ...invite } : undefined;
    },

    listMemberships() {
      return [...memberships.values()].map((membership) => ({ ...membership }));
    },

    addUser(user) {
      usersById.set(user.id, user);
    },
  };
};
