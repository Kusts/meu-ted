// ─────────────────────────────────────────────────────────────────────────────
// Attachment Service (REQ-027/040)
// ─────────────────────────────────────────────────────────────────────────────

import type { IAttachmentRepository } from '../repositories/attachment-repository.js';
import type { IAuditLogRepository } from '../repositories/audit-log-repository.js';
import type { Attachment, AttachmentEntityType } from '../entities/attachment.js';

export interface SaveAttachmentInput {
  householdId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  filePath: string;
  mimeType: string;
  fileSizeBytes?: number;
  originalName?: string;
  uploadedByUserId?: string;
}

export interface SaveAttachmentResult {
  success: boolean;
  attachment?: Attachment;
  reason?: string;
}

export interface ListAttachmentsResult {
  success: boolean;
  attachments: Attachment[];
}

export interface DeleteAttachmentResult {
  success: boolean;
  reason?: string;
}

export class AttachmentService {
  constructor(private deps: {
    attachmentRepository: IAttachmentRepository;
    auditLogRepository: IAuditLogRepository;
  }) {}

  /**
   * Save file attachment metadata
   */
  async saveAttachment(input: SaveAttachmentInput): Promise<SaveAttachmentResult> {
    const attachment: Attachment = {
      id: crypto.randomUUID(),
      householdId: input.householdId,
      entityType: input.entityType,
      entityId: input.entityId,
      filePath: input.filePath,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes ?? null,
      originalName: input.originalName ?? null,
      uploadedByUserId: input.uploadedByUserId ?? null,
      createdAt: new Date().toISOString(),
    };

    const created = await this.deps.attachmentRepository.create(attachment);

    return { success: true, attachment: created };
  }

  /**
   * List attachments for an entity
   */
  async listByEntity(
    householdId: string,
    entityType: AttachmentEntityType,
    entityId: string
  ): Promise<ListAttachmentsResult> {
    const attachments = await this.deps.attachmentRepository.findByEntity(
      householdId,
      entityType,
      entityId
    );
    return { success: true, attachments };
  }

  /**
   * Delete attachment by id
   */
  async deleteAttachment(id: string, householdId: string): Promise<DeleteAttachmentResult> {
    const attachment = await this.deps.attachmentRepository.findById(id);
    if (!attachment) {
      return { success: false, reason: 'Anexo não encontrado' };
    }
    if (attachment.householdId !== householdId) {
      return { success: false, reason: 'Anexo pertence a household diferente' };
    }

    await this.deps.attachmentRepository.delete(id);
    return { success: true };
  }
}
