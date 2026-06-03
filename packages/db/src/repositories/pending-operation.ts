// ─────────────────────────────────────────────────────────────────────────────
// Drizzle Pending Operation Repository
// Implements IPendingOperationRepository for production (Drizzle/pg)
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, lt, gt } from 'drizzle-orm';
import type { PendingOperation, IPendingOperationRepository } from '@pi-financeiro/domain';
import type { DbClient } from '../client.js';
import { pendingOperations } from '../schema/index.js';
import { fromDbPendingOperation, toDbPendingOperation } from '../mappers/pending-operation.js';

export class DrizzlePendingOperationRepository implements IPendingOperationRepository {
  constructor(private dbClient: DbClient) {}

  async create(operation: PendingOperation): Promise<PendingOperation> {
    const dbRow = toDbPendingOperation(operation);
    const [inserted] = await this.dbClient.db
      .insert(pendingOperations)
      .values(dbRow)
      .returning();
    return fromDbPendingOperation(inserted) as PendingOperation;
  }

  async findById(id: string): Promise<PendingOperation | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(pendingOperations)
      .where(eq(pendingOperations.id, id))
      .limit(1);
    return row ? fromDbPendingOperation(row) as PendingOperation : null;
  }

  async update(id: string, updates: Partial<PendingOperation>): Promise<PendingOperation | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.draftPayload !== undefined) updateData.draftPayload = updates.draftPayload;
    if (updates.missingFields !== undefined) updateData.missingFields = updates.missingFields;
    if (updates.confirmationLevel !== undefined) updateData.confirmationLevel = updates.confirmationLevel;

    const [updated] = await this.dbClient.db
      .update(pendingOperations)
      .set(updateData)
      .where(eq(pendingOperations.id, id))
      .returning();

    return updated ? fromDbPendingOperation(updated) as PendingOperation : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.dbClient.db
      .delete(pendingOperations)
      .where(eq(pendingOperations.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async findByChat(householdId: string, chatId: string): Promise<PendingOperation | null> {
    const now = new Date().toISOString();
    const [row] = await this.dbClient.db
      .select()
      .from(pendingOperations)
      .where(
        and(
          eq(pendingOperations.householdId, householdId),
          eq(pendingOperations.chatId, chatId),
          eq(pendingOperations.status, 'pending'),
          gt(pendingOperations.expiresAt, now)
        )
      )
      .limit(1);
    return row ? fromDbPendingOperation(row) as PendingOperation : null;
  }

  async findExpiredBefore(before: string): Promise<PendingOperation[]> {
    const rows = await this.dbClient.db
      .select()
      .from(pendingOperations)
      .where(
        and(
          eq(pendingOperations.status, 'pending'),
          lt(pendingOperations.expiresAt, before)
        )
      );
    return rows.map(r => fromDbPendingOperation(r) as PendingOperation);
  }

  async findByIdempotencyKey(householdId: string, key: string): Promise<PendingOperation | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(pendingOperations)
      .where(
        and(
          eq(pendingOperations.householdId, householdId),
          eq(pendingOperations.idempotencyKey, key)
        )
      )
      .limit(1);
    return row ? fromDbPendingOperation(row) as PendingOperation : null;
  }
}