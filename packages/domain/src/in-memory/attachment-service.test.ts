// ─────────────────────────────────────────────────────────────────────────────
// Attachment Service Tests (REQ-027/040)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { AttachmentService } from '../core/services/attachment-service.js';
import { InMemoryAttachmentRepository } from './attachment-repository.js';
import { InMemoryAuditLogRepository } from './audit-log-repository.js';

describe('AttachmentService', () => {
  const makeService = () => {
    const attachmentRepo = new InMemoryAttachmentRepository();
    const auditRepo = new InMemoryAuditLogRepository();
    const service = new AttachmentService({ attachmentRepository: attachmentRepo, auditLogRepository: auditRepo });
    return { service, attachmentRepo };
  };

  it('RED: saveAttachment creates attachment record', async () => {
    const { service } = makeService();

    const result = await service.saveAttachment({
      householdId: 'house-1',
      entityType: 'financial_record',
      entityId: 'record-1',
      filePath: '/data/attachments/house-1/financial_record/record-1/receipt.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 1024,
      originalName: 'receipt.pdf',
      uploadedByUserId: 'user-1',
    });

    expect(result.success).toBe(true);
    expect(result.attachment).toBeDefined();
    expect(result.attachment!.mimeType).toBe('application/pdf');
    expect(result.attachment!.fileSizeBytes).toBe(1024);
    expect(result.attachment!.originalName).toBe('receipt.pdf');
  });

  it('saveAttachment generates correct filePath', async () => {
    const { service } = makeService();

    const result = await service.saveAttachment({
      householdId: 'house-1',
      entityType: 'financial_record',
      entityId: 'record-1',
      filePath: '/data/attachments/house-1/financial_record/record-1/doc.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.attachment!.filePath).toContain('house-1');
    expect(result.attachment!.filePath).toContain('financial_record');
  });

  it('listByEntity returns attachments for entity', async () => {
    const { service, attachmentRepo } = makeService();

    await attachmentRepo.create({
      id: 'att-1',
      householdId: 'house-1',
      entityType: 'financial_record',
      entityId: 'record-1',
      filePath: '/data/attachments/house-1/financial_record/record-1/doc.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: null,
      originalName: null,
      uploadedByUserId: null,
      createdAt: new Date().toISOString(),
    });

    await attachmentRepo.create({
      id: 'att-2',
      householdId: 'house-1',
      entityType: 'financial_record',
      entityId: 'record-2', // different entity
      filePath: '/data/attachments/house-1/financial_record/record-2/doc2.pdf',
      mimeType: 'image/png',
      fileSizeBytes: null,
      originalName: null,
      uploadedByUserId: null,
      createdAt: new Date().toISOString(),
    });

    const result = await service.listByEntity('house-1', 'financial_record', 'record-1');

    expect(result.success).toBe(true);
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].id).toBe('att-1');
  });

  it('deleteAttachment removes attachment', async () => {
    const { service, attachmentRepo } = makeService();

    await attachmentRepo.create({
      id: 'att-1',
      householdId: 'house-1',
      entityType: 'financial_record',
      entityId: 'record-1',
      filePath: '/data/attachments/house-1/financial_record/record-1/doc.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: null,
      originalName: null,
      uploadedByUserId: null,
      createdAt: new Date().toISOString(),
    });

    const result = await service.deleteAttachment('att-1', 'house-1');

    expect(result.success).toBe(true);
    const deleted = await attachmentRepo.findById('att-1');
    expect(deleted).toBeNull();
  });

  it('deleteAttachment returns failure for wrong household', async () => {
    const { service, attachmentRepo } = makeService();

    await attachmentRepo.create({
      id: 'att-1',
      householdId: 'house-1',
      entityType: 'financial_record',
      entityId: 'record-1',
      filePath: '/data/attachments/house-1/financial_record/record-1/doc.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: null,
      originalName: null,
      uploadedByUserId: null,
      createdAt: new Date().toISOString(),
    });

    const result = await service.deleteAttachment('att-1', 'house-2');

    expect(result.success).toBe(false);
    expect(result.reason).toBe('Anexo pertence a household diferente');
  });
});
