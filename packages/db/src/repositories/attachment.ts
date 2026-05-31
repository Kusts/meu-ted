// ─────────────────────────────────────────────────────────────────────────────
// Attachment Repository - DB Implementation
// ─────────────────────────────────────────────────────────────────────────────

import { eq, and } from 'drizzle-orm';
import { attachments } from '../schema/index.js';
import type { Attachment, AttachmentEntityType } from '@pi-financeiro/domain';
import type { IAttachmentRepository } from '@pi-financeiro/domain';

export function toDbAttachment(attachment: Attachment) {
  return {
    id: attachment.id,
    householdId: attachment.householdId,
    entityType: attachment.entityType,
    entityId: attachment.entityId,
    filePath: attachment.filePath,
    mimeType: attachment.mimeType,
    fileSizeBytes: attachment.fileSizeBytes,
    originalName: attachment.originalName,
    uploadedByUserId: attachment.uploadedByUserId,
    createdAt: new Date(attachment.createdAt),
  };
}

export function fromDbAttachment(row: typeof attachments.$inferSelect): Attachment {
  return {
    id: row.id,
    householdId: row.householdId,
    entityType: row.entityType as AttachmentEntityType,
    entityId: row.entityId,
    filePath: row.filePath,
    mimeType: row.mimeType,
    fileSizeBytes: row.fileSizeBytes ?? null,
    originalName: row.originalName ?? null,
    uploadedByUserId: row.uploadedByUserId ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export class AttachmentRepository implements IAttachmentRepository {
  constructor(private dbClient: { db: any }) {}

  async create(attachment: Attachment): Promise<Attachment> {
    const [inserted] = await this.dbClient.db.insert(attachments).values(toDbAttachment(attachment)).returning();
    return fromDbAttachment(inserted);
  }

  async findById(id: string): Promise<Attachment | null> {
    const [row] = await this.dbClient.db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
    return row ? fromDbAttachment(row) : null;
  }

  async findByEntity(
    householdId: string,
    entityType: AttachmentEntityType,
    entityId: string
  ): Promise<Attachment[]> {
    const rows = await this.dbClient.db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.householdId, householdId),
          eq(attachments.entityType, entityType),
          eq(attachments.entityId, entityId)
        )
      );
    return rows.map(fromDbAttachment);
  }

  async delete(id: string): Promise<boolean> {
    const [deleted] = await this.dbClient.db.delete(attachments).where(eq(attachments.id, id)).returning();
    return !!deleted;
  }
}
