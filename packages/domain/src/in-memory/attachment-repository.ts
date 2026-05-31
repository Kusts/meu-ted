// ─────────────────────────────────────────────────────────────────────────────
// In-Memory Attachment Repository
// ─────────────────────────────────────────────────────────────────────────────

import type { Attachment, AttachmentEntityType } from '../core/entities/attachment.js';
import type { IAttachmentRepository } from '../core/repositories/attachment-repository.js';

export class InMemoryAttachmentRepository implements IAttachmentRepository {
  private attachments: Map<string, Attachment> = new Map();

  async create(attachment: Attachment): Promise<Attachment> {
    this.attachments.set(attachment.id, { ...attachment });
    return { ...attachment };
  }

  async findById(id: string): Promise<Attachment | null> {
    return this.attachments.get(id) ?? null;
  }

  async findByEntity(
    householdId: string,
    entityType: AttachmentEntityType,
    entityId: string
  ): Promise<Attachment[]> {
    return Array.from(this.attachments.values()).filter(
      a => a.householdId === householdId && a.entityType === entityType && a.entityId === entityId
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.attachments.delete(id);
  }
}
