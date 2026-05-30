import type { Account, AccountUpdate } from '../entities/account.js';

/**
 * Account Repository Port
 * Abstracts storage for accounts - can be in-memory for tests or Drizzle for production
 */
export interface IAccountRepository {
  create(account: Account): Promise<Account>;
  findById(id: string): Promise<Account | null>;
  findByHouseholdId(householdId: string): Promise<Account[]>;
  findActive(householdId: string): Promise<Account[]>;
  update(id: string, update: AccountUpdate): Promise<Account | null>;
}