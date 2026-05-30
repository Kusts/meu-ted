// ─────────────────────────────────────────────────────────────────────────────
// Login Code Repository Interface
// ─────────────────────────────────────────────────────────────────────────────

import type { LoginCode, LoginCodeCreate, LoginCodeUpdate } from '../entities/login-code.js';

export interface ILoginCodeRepository {
  create(code: LoginCodeCreate): Promise<LoginCode>;
  findByPhone(phone: string): Promise<LoginCode | null>;
  update(id: string, update: LoginCodeUpdate): Promise<LoginCode | null>;
  delete(id: string): Promise<void>;
  deleteExpired(): Promise<number>;
}