// ─────────────────────────────────────────────────────────────────────────────
// Drizzle Auth Repositories (User, Session, LoginCode)
// ─────────────────────────────────────────────────────────────────────────────

import { eq, and, isNull } from 'drizzle-orm';
import type { User, Session, LoginCode, UserCreate, UserUpdate, SessionCreate, SessionRevoke, LoginCodeCreate, LoginCodeUpdate } from '@pi-financeiro/domain';
import type { IUserRepository, ISessionRepository, ILoginCodeRepository } from '@pi-financeiro/domain';
import type { DbClient } from '../client.js';
import { users, sessions, loginCodes } from '../schema/index.js';
import { fromDbUser, fromDbSession, fromDbLoginCode } from '../mappers/auth.js';

// ─── User Repository ─────────────────────────────────────────────────────────

export class DrizzleUserRepository implements IUserRepository {
  constructor(private dbClient: DbClient) {}

  async create(user: UserCreate): Promise<User> {
    const now = new Date();
    const dbRow = {
      id: user.id,
      householdId: user.householdId,
      name: user.name,
      phone: user.phone,
      role: user.role as 'owner' | 'member',
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    const [inserted] = await this.dbClient.db.insert(users).values(dbRow).returning();
    return fromDbUser(inserted);
  }

  async findById(id: string): Promise<User | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row ? fromDbUser(row) : null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    return row ? fromDbUser(row) : null;
  }

  async findByHouseholdId(householdId: string): Promise<User[]> {
    const rows = await this.dbClient.db
      .select()
      .from(users)
      .where(eq(users.householdId, householdId));
    return rows.map(fromDbUser);
  }

  async update(id: string, update: UserUpdate): Promise<User | null> {
    const updateData: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (update.name !== undefined) updateData.name = update.name;
    if (update.phone !== undefined) updateData.phone = update.phone;
    if (update.role !== undefined) updateData.role = update.role as 'owner' | 'member';
    if (update.active !== undefined) updateData.active = update.active;

    const [updated] = await this.dbClient.db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    
    return updated ? fromDbUser(updated) : null;
  }
}

// ─── Session Repository ──────────────────────────────────────────────────────

export class DrizzleSessionRepository implements ISessionRepository {
  constructor(private dbClient: DbClient) {}

  async create(session: SessionCreate): Promise<Session> {
    const dbRow = {
      id: session.id,
      householdId: session.householdId,
      userId: session.userId,
      tokenHash: session.tokenHash,
      createdAt: new Date(),
    };
    const [inserted] = await this.dbClient.db.insert(sessions).values(dbRow).returning();
    return fromDbSession(inserted);
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
      .limit(1);
    return row ? fromDbSession(row) : null;
  }

  async findByUserIdAndHousehold(userId: string, householdId: string): Promise<Session | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.householdId, householdId), isNull(sessions.revokedAt)))
      .limit(1);
    return row ? fromDbSession(row) : null;
  }

  async revoke(id: string, revoke: SessionRevoke): Promise<Session | null> {
    const [updated] = await this.dbClient.db
      .update(sessions)
      .set({ revokedAt: new Date(revoke.revokedAt) })
      .where(eq(sessions.id, id))
      .returning();
    
    return updated ? fromDbSession(updated) : null;
  }

  async findActiveByHousehold(householdId: string): Promise<Session[]> {
    const rows = await this.dbClient.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.householdId, householdId), isNull(sessions.revokedAt)));
    return rows.map(fromDbSession);
  }
}

// ─── LoginCode Repository ────────────────────────────────────────────────────

export class DrizzleLoginCodeRepository implements ILoginCodeRepository {
  constructor(private dbClient: DbClient) {}

  async create(code: LoginCodeCreate): Promise<LoginCode> {
    const now = new Date();
    const dbRow = {
      id: code.id,
      householdId: code.householdId,
      phone: code.phone,
      codeHash: code.codeHash,
      attempts: 0,
      expiresAt: new Date(code.expiresAt),
      createdAt: now,
    };
    const [inserted] = await this.dbClient.db.insert(loginCodes).values(dbRow).returning();
    return fromDbLoginCode(inserted);
  }

  async findByPhone(phone: string): Promise<LoginCode | null> {
    // Get most recent non-expired code for this phone
    const [row] = await this.dbClient.db
      .select()
      .from(loginCodes)
      .where(eq(loginCodes.phone, phone))
      .orderBy(desc(loginCodes.createdAt))
      .limit(1);
    
    if (!row) return null;
    // Check if expired
    if (new Date(row.expiresAt) < new Date()) return null;
    return fromDbLoginCode(row);
  }

  async update(id: string, update: LoginCodeUpdate): Promise<LoginCode | null> {
    const updateData: Partial<typeof loginCodes.$inferInsert> = {};
    if (update.codeHash !== undefined) updateData.codeHash = update.codeHash;
    if (update.attempts !== undefined) updateData.attempts = update.attempts;

    const [updated] = await this.dbClient.db
      .update(loginCodes)
      .set(updateData)
      .where(eq(loginCodes.id, id))
      .returning();
    
    return updated ? fromDbLoginCode(updated) : null;
  }

  async delete(id: string): Promise<void> {
    await this.dbClient.db.delete(loginCodes).where(eq(loginCodes.id, id));
  }

  async deleteExpired(): Promise<number> {
    const now = new Date();
    await this.dbClient.db.delete(loginCodes).where(
      and(
        eq(loginCodes.attempts, 5),
        lte(loginCodes.expiresAt, now)
      )
    );
    return 0; // Drizzle doesn't return count directly
  }
}

import { desc, lte } from 'drizzle-orm';
