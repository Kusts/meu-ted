// ─────────────────────────────────────────────────────────────────────────────
// Drizzle Account Repository
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq } from 'drizzle-orm';
import type { Account, AccountUpdate } from '@pi-financeiro/domain';
import type { IAccountRepository } from '@pi-financeiro/domain';
import type { DbClient } from '../client.js';
import { accounts } from '../schema/index.js';
import { toDbAccount, fromDbAccount } from '../mappers/account.js';

export class DrizzleAccountRepository implements IAccountRepository {
  constructor(private dbClient: DbClient) {}

  async create(account: Account): Promise<Account> {
    const dbRow = toDbAccount(account);
    const [inserted] = await this.dbClient.db.insert(accounts).values(dbRow).returning();
    return fromDbAccount(inserted);
  }

  async findById(id: string): Promise<Account | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, id))
      .limit(1);
    return row ? fromDbAccount(row) : null;
  }

  async findByHouseholdId(householdId: string): Promise<Account[]> {
    const rows = await this.dbClient.db
      .select()
      .from(accounts)
      .where(eq(accounts.householdId, householdId));
    return rows.map(fromDbAccount);
  }

  async findActive(householdId: string): Promise<Account[]> {
    const rows = await this.dbClient.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.householdId, householdId), eq(accounts.active, true)));
    return rows.map(fromDbAccount);
  }

  async update(id: string, update: AccountUpdate): Promise<Account | null> {
    const updateData: Partial<typeof accounts.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (update.name !== undefined) updateData.name = update.name;
    if (update.initialBalanceCents !== undefined) updateData.initialBalanceCents = update.initialBalanceCents;
    if (update.active !== undefined) updateData.active = update.active;

    const [updated] = await this.dbClient.db
      .update(accounts)
      .set(updateData)
      .where(eq(accounts.id, id))
      .returning();
    
    return updated ? fromDbAccount(updated) : null;
  }
}
