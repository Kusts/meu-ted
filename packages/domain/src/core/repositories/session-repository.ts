// ─────────────────────────────────────────────────────────────────────────────
// Session Repository Interface
// ─────────────────────────────────────────────────────────────────────────────

import type { Session, SessionCreate, SessionRevoke } from '../entities/session.js';

export interface ISessionRepository {
  create(session: SessionCreate): Promise<Session>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  findByUserIdAndHousehold(userId: string, householdId: string): Promise<Session | null>;
  revoke(id: string, revoke: SessionRevoke): Promise<Session | null>;
  findActiveByHousehold(householdId: string): Promise<Session[]>;
}