// ─────────────────────────────────────────────────────────────────────────────
// User Repository Interface
// ─────────────────────────────────────────────────────────────────────────────

import type { User, UserCreate, UserUpdate } from '../entities/user.js';

export interface IUserRepository {
  create(user: UserCreate): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  findByHouseholdId(householdId: string): Promise<User[]>;
  update(id: string, update: UserUpdate): Promise<User | null>;
}