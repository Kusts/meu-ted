// ─────────────────────────────────────────────────────────────────────────────
// Auth Mappers - Domain Entity <-> Drizzle Row (User, Session, LoginCode)
// ─────────────────────────────────────────────────────────────────────────────

import type { User, Session, LoginCode } from '@pi-financeiro/domain';
import type { users, sessions, loginCodes } from '../schema/index.js';

type DbUserRow = typeof users.$inferInsert;
type DbSessionRow = typeof sessions.$inferInsert;
type DbLoginCodeRow = typeof loginCodes.$inferInsert;

// ─── User ───────────────────────────────────────────────────────────────────

/**
 * Map domain User entity to DB row format
 */
export function toDbUser(user: User): DbUserRow {
  return {
    id: user.id,
    householdId: user.householdId,
    name: user.name,
    phone: user.phone,
    role: user.role,
    active: user.active,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  };
}

/**
 * Map DB row to domain User entity
 */
export function fromDbUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    phone: row.phone,
    role: row.role,
    active: row.active,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

// ─── Session ─────────────────────────────────────────────────────────────────

/**
 * Map domain Session entity to DB row format
 */
export function toDbSession(session: Session): DbSessionRow {
  return {
    id: session.id,
    householdId: session.householdId,
    userId: session.userId,
    tokenHash: session.tokenHash,
    revokedAt: session.revokedAt ? new Date(session.revokedAt) : null,
    createdAt: new Date(session.createdAt),
  };
}

/**
 * Map DB row to domain Session entity
 */
export function fromDbSession(row: typeof sessions.$inferSelect): Session {
  return {
    id: row.id,
    householdId: row.householdId,
    userId: row.userId,
    tokenHash: row.tokenHash,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    revokedAt: row.revokedAt ? (row.revokedAt instanceof Date ? row.revokedAt.toISOString() : String(row.revokedAt)) : null,
  };
}

// ─── LoginCode ───────────────────────────────────────────────────────────────

/**
 * Map domain LoginCode entity to DB row format
 */
export function toDbLoginCode(code: LoginCode): DbLoginCodeRow {
  return {
    id: code.id,
    householdId: code.householdId,
    phone: code.phone,
    codeHash: code.codeHash,
    attempts: code.attempts,
    expiresAt: new Date(code.expiresAt),
    createdAt: new Date(code.createdAt),
  };
}

/**
 * Map DB row to domain LoginCode entity
 */
export function fromDbLoginCode(row: typeof loginCodes.$inferSelect): LoginCode {
  return {
    id: row.id,
    householdId: row.householdId,
    phone: row.phone,
    codeHash: row.codeHash,
    attempts: row.attempts,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : String(row.expiresAt),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}
