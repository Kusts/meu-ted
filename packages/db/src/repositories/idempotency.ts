// ─────────────────────────────────────────────────────────────────────────────
// Drizzle Idempotency Repository
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq } from 'drizzle-orm';
import type { IdempotencyKey } from '@pi-financeiro/domain';
import type { IIdempotencyRepository } from '@pi-financeiro/domain';
import type { DbClient } from '../client.js';
import { idempotencyKeys } from '../schema/index.js';
import { toDbIdempotencyKey, fromDbIdempotencyKey } from '../mappers/idempotency.js';

export class DrizzleIdempotencyRepository implements IIdempotencyRepository {
  constructor(private dbClient: DbClient) {}

  async create(key: IdempotencyKey): Promise<IdempotencyKey> {
    const dbRow = toDbIdempotencyKey(key);
    const [inserted] = await this.dbClient.db.insert(idempotencyKeys).values(dbRow).returning();
    return fromDbIdempotencyKey(inserted);
  }

  async findByKey(householdId: string, key: string, scope?: string): Promise<IdempotencyKey | null> {
    let condition = and(
      eq(idempotencyKeys.householdId, householdId),
      eq(idempotencyKeys.key, key)
    );
    
    if (scope) {
      condition = and(condition, eq(idempotencyKeys.scope, scope));
    }
    
    const [row] = await this.dbClient.db
      .select()
      .from(idempotencyKeys)
      .where(condition)
      .limit(1);
    
    return row ? fromDbIdempotencyKey(row) : null;
  }
}
