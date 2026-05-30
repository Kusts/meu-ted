// ─────────────────────────────────────────────────────────────────────────────
// In-Memory Login Code Repository
// ─────────────────────────────────────────────────────────────────────────────

import type { LoginCode, LoginCodeCreate, LoginCodeUpdate } from '../core/entities/login-code.js';
import type { ILoginCodeRepository } from '../core/repositories/login-code-repository.js';

export class InMemoryLoginCodeRepository implements ILoginCodeRepository {
  private codes = new Map<string, LoginCode>();

  async create(code: LoginCodeCreate): Promise<LoginCode> {
    const record: LoginCode = {
      id: code.id,
      householdId: code.householdId,
      phone: code.phone,
      codeHash: code.codeHash,
      attempts: 0,
      createdAt: new Date().toISOString(),
      expiresAt: code.expiresAt,
    };
    this.codes.set(record.phone, record);
    return { ...record };
  }

  async findByPhone(phone: string): Promise<LoginCode | null> {
    const code = this.codes.get(phone);
    if (!code) return null;
    
    // Check if expired
    if (new Date(code.expiresAt) < new Date()) {
      this.codes.delete(phone);
      return null;
    }
    
    return { ...code };
  }

  async update(id: string, update: LoginCodeUpdate): Promise<LoginCode | null> {
    // Find by phone (id is phone for simplicity)
    const code = this.codes.get(id);
    if (!code) return null;

    const updated: LoginCode = {
      ...code,
      ...update,
    };
    this.codes.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<void> {
    this.codes.delete(id);
  }

  async deleteExpired(): Promise<number> {
    const now = new Date();
    let deleted = 0;
    
    for (const [phone, code] of this.codes.entries()) {
      if (new Date(code.expiresAt) < now) {
        this.codes.delete(phone);
        deleted++;
      }
    }
    
    return deleted;
  }
}