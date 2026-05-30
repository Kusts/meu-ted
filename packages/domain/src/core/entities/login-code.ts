// ─────────────────────────────────────────────────────────────────────────────
// Login Code Entity
// 6-digit code with expiration and rate limiting
// ─────────────────────────────────────────────────────────────────────────────

export interface LoginCode {
  id: string;
  householdId: string;
  phone: string;
  codeHash: string;
  attempts: number;
  createdAt: string;
  expiresAt: string;
}

export interface LoginCodeCreate {
  id: string;
  householdId: string;
  phone: string;
  codeHash: string;
  expiresAt: string;
}

export interface LoginCodeUpdate {
  codeHash?: string;
  attempts?: number;
}

export const LOGIN_CODE_EXPIRY_MINUTES = 10;
export const MAX_LOGIN_ATTEMPTS = 5;
export const CODE_LENGTH = 6;