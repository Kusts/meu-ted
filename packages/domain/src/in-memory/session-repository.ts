// ─────────────────────────────────────────────────────────────────────────────
// In-Memory Session Repository
// ─────────────────────────────────────────────────────────────────────────────

import type { Session, SessionCreate, SessionRevoke } from '../core/entities/session.js';
import type { ISessionRepository } from '../core/repositories/session-repository.js';

export class InMemorySessionRepository implements ISessionRepository {
  private sessions = new Map<string, Session>();

  async create(session: SessionCreate): Promise<Session> {
    const now = new Date().toISOString();
    const record: Session = {
      ...session,
      createdAt: now,
      revokedAt: null,
    };
    this.sessions.set(record.id, record);
    return { ...record };
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    for (const session of this.sessions.values()) {
      if (session.tokenHash === tokenHash && session.revokedAt === null) {
        return { ...session };
      }
    }
    return null;
  }

  async findByUserIdAndHousehold(userId: string, householdId: string): Promise<Session | null> {
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.householdId === householdId && session.revokedAt === null) {
        return { ...session };
      }
    }
    return null;
  }

  async revoke(id: string, revoke: SessionRevoke): Promise<Session | null> {
    const session = this.sessions.get(id);
    if (!session) return null;

    const updated: Session = {
      ...session,
      revokedAt: revoke.revokedAt,
    };
    this.sessions.set(id, updated);
    return { ...updated };
  }

  async findActiveByHousehold(householdId: string): Promise<Session[]> {
    return Array.from(this.sessions.values()).filter(
      s => s.householdId === householdId && s.revokedAt === null
    );
  }
}