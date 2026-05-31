// ─────────────────────────────────────────────────────────────────────────────
// Attachment Repository Port
// ─────────────────────────────────────────────────────────────────────────────

import type { Attachment, AttachmentEntityType } from '../entities/attachment.js';

export interface IAttachmentRepository {
  create(attachment: Attachment): Promise<Attachment>;
  findById(id: string): Promise<Attachment | null>;
  findByEntity(householdId: string, entityType: AttachmentEntityType, entityId: string): Promise<Attachment[]>;
  delete(id: string): Promise<boolean>;
}
