// ─────────────────────────────────────────────────────────────────────────────
// Drizzle Source Message Repository
// Persistent webhook deduplication via source_messages table
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../client.js';
import { sourceMessages } from '../schema/index.js';
import { fromDbSourceMessage, toDbSourceMessage, type SourceMessage } from '../mappers/source-message.js';

export interface ISourceMessageRepository {
  findByProviderMessageId(provider: string, providerMessageId: string): Promise<SourceMessage | null>;
  markProcessed(msg: SourceMessage): Promise<void>;
  saveError(providerMessageId: string, error: string): Promise<void>;
}

export class DrizzleSourceMessageRepository implements ISourceMessageRepository {
  constructor(private dbClient: DbClient) {}

  async findByProviderMessageId(provider: string, providerMessageId: string): Promise<SourceMessage | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(sourceMessages)
      .where(
        and(
          eq(sourceMessages.provider, provider),
          eq(sourceMessages.providerMessageId, providerMessageId)
        )
      )
      .limit(1);
    return row ? fromDbSourceMessage(row) : null;
  }

  async markProcessed(msg: SourceMessage): Promise<void> {
    // Upsert: insert if not exists, update if exists
    const existing = await this.findByProviderMessageId(msg.provider, msg.providerMessageId);
    if (existing) {
      await this.dbClient.db
        .update(sourceMessages)
        .set({ processedAt: new Date() })
        .where(
          and(
            eq(sourceMessages.provider, msg.provider),
            eq(sourceMessages.providerMessageId, msg.providerMessageId)
          )
        );
    } else {
      const dbRow = toDbSourceMessage({ ...msg, processedAt: new Date().toISOString() });
      await this.dbClient.db.insert(sourceMessages).values(dbRow).returning();
    }
  }

  async saveError(providerMessageId: string, error: string): Promise<void> {
    // Try to find existing record
    const [existing] = await this.dbClient.db
      .select()
      .from(sourceMessages)
      .where(eq(sourceMessages.providerMessageId, providerMessageId))
      .limit(1);

    if (existing) {
      await this.dbClient.db
        .update(sourceMessages)
        .set({ errorReason: error })
        .where(eq(sourceMessages.providerMessageId, providerMessageId));
    }
  }
}