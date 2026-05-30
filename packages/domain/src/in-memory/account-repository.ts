import type { Account, AccountUpdate } from '../core/entities/account.js';
import type { IAccountRepository } from '../core/repositories/account-repository.js';

export class InMemoryAccountRepository implements IAccountRepository {
  private accounts: Map<string, Account> = new Map();

  async create(account: Account): Promise<Account> {
    this.accounts.set(account.id, { ...account });
    return { ...account };
  }

  async findById(id: string): Promise<Account | null> {
    return this.accounts.get(id) ?? null;
  }

  async findByHouseholdId(householdId: string): Promise<Account[]> {
    return Array.from(this.accounts.values()).filter(
      a => a.householdId === householdId
    );
  }

  async findActive(householdId: string): Promise<Account[]> {
    return Array.from(this.accounts.values()).filter(
      a => a.householdId === householdId && a.active
    );
  }

  async update(id: string, update: AccountUpdate): Promise<Account | null> {
    const existing = this.accounts.get(id);
    if (!existing) return null;

    const updated: Account = {
      ...existing,
      ...update,
      updatedAt: new Date().toISOString(),
    };
    this.accounts.set(id, updated);
    return { ...updated };
  }
}