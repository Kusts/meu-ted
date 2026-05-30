// ─────────────────────────────────────────────────────────────────────────────
// Session Entity
// No expiration - only revocation
// ─────────────────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  householdId: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  revokedAt: string | null;
  userAgent?: string;
  ipAddress?: string;
}

export interface SessionCreate {
  id: string;
  householdId: string;
  userId: string;
  tokenHash: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface SessionRevoke {
  revokedAt: string;
}