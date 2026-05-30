// ─────────────────────────────────────────────────────────────────────────────
// In-Memory User Repository
// ─────────────────────────────────────────────────────────────────────────────

import type { User, UserCreate, UserUpdate } from '../core/entities/user.js';
import type { IUserRepository } from '../core/repositories/user-repository.js';

export class InMemoryUserRepository implements IUserRepository {
  private users = new Map<string, User>();
  private phoneIndex = new Map<string, string>();

  async create(userCreate: UserCreate): Promise<User> {
    const now = new Date().toISOString();
    const user: User = {
      id: userCreate.id,
      householdId: userCreate.householdId,
      name: userCreate.name,
      phone: userCreate.phone,
      role: userCreate.role,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    this.phoneIndex.set(user.phone, user.id);
    return { ...user };
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    const userId = this.phoneIndex.get(phone);
    if (!userId) return null;
    return this.users.get(userId) ?? null;
  }

  async findByHouseholdId(householdId: string): Promise<User[]> {
    return Array.from(this.users.values()).filter(
      u => u.householdId === householdId && u.active
    );
  }

  async update(id: string, update: UserUpdate): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;

    const updated: User = {
      ...user,
      ...update,
      updatedAt: new Date().toISOString(),
    };
    this.users.set(id, updated);
    
    // Update phone index if phone changed
    if (update.phone && update.phone !== user.phone) {
      this.phoneIndex.delete(user.phone);
      this.phoneIndex.set(update.phone, id);
    }
    
    return { ...updated };
  }
}