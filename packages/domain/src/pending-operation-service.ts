// ─────────────────────────────────────────────────────────────────────────────
// PendingOperationService
// Manages multi-step financial operations pending user confirmation
// ─────────────────────────────────────────────────────────────────────────────

import type {
  PendingOperation,
  OperationType,
  DraftPayload,
  CreatePendingOperationInput,
  IPendingOperationRepository,
} from './pending-operation.js';

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

const HIGH_VALUE_THRESHOLD_CENTS = 50000; // R$500

export class PendingOperationService {
  constructor(private repo: IPendingOperationRepository) {}

  /**
   * Create a new pending operation
   */
  async create(input: CreatePendingOperationInput): Promise<PendingOperation> {
    // Check idempotency first
    if (input.idempotencyKey) {
      const existing = await this.repo.findByIdempotencyKey(input.householdId, input.idempotencyKey);
      if (existing && existing.status === 'pending') {
        return existing;
      }
    }

    // Determine missing fields from draft payload
    const missingFields = this.detectMissingFields(input.operationType, input.draftPayload);

    // Calculate confirmation level
    const confirmationLevel = this.calculateConfirmationLevel(input.draftPayload);

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    const operation: PendingOperation = {
      id: crypto.randomUUID(),
      householdId: input.householdId,
      chatId: input.chatId,
      userPhone: input.userPhone,
      operationType: input.operationType,
      draftPayload: input.draftPayload,
      missingFields,
      confirmationLevel,
      idempotencyKey: input.idempotencyKey ?? null,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };

    return this.repo.create(operation);
  }

  /**
   * Append a field value to existing operation
   */
  async appendField(id: string, field: string, value: unknown): Promise<PendingOperation> {
    const operation = await this.repo.findById(id);
    if (!operation) {
      throw new Error('Operação não encontrada');
    }
    if (operation.status !== 'pending') {
      throw new Error(`Operação está ${operation.status}, não pode ser modificada`);
    }

    // Update draft payload
    const draftPayload = { ...operation.draftPayload, [field]: value };

    // Recalculate missing fields
    const missingFields = this.detectMissingFields(operation.operationType, draftPayload);

    // Recalculate confirmation level if amount changed
    let confirmationLevel = operation.confirmationLevel;
    if (field === 'amountCents') {
      confirmationLevel = this.calculateConfirmationLevel(draftPayload);
    }

    const updated = await this.repo.update(id, {
      draftPayload,
      missingFields,
      confirmationLevel,
      updatedAt: new Date().toISOString(),
    });

    return updated!;
  }

  /**
   * Set confirmation level directly
   */
  async setConfirmationLevel(id: string, level: number): Promise<PendingOperation> {
    const operation = await this.repo.findById(id);
    if (!operation) {
      throw new Error('Operação não encontrada');
    }

    const updated = await this.repo.update(id, {
      confirmationLevel: level,
      updatedAt: new Date().toISOString(),
    });

    return updated!;
  }

  /**
   * Confirm operation - mark as confirmed
   */
  async confirm(id: string): Promise<PendingOperation> {
    const operation = await this.repo.findById(id);
    if (!operation) {
      throw new Error('Operação não encontrada');
    }
    if (operation.status !== 'pending') {
      throw new Error(`Operação está ${operation.status}, não pode ser confirmada`);
    }

    const updated = await this.repo.update(id, {
      status: 'confirmed',
      updatedAt: new Date().toISOString(),
    });

    return updated!;
  }

  /**
   * Cancel operation
   */
  async cancel(id: string): Promise<PendingOperation> {
    const operation = await this.repo.findById(id);
    if (!operation) {
      throw new Error('Operação não encontrada');
    }
    if (operation.status !== 'pending') {
      throw new Error(`Operação está ${operation.status}, não pode ser cancelada`);
    }

    const updated = await this.repo.update(id, {
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    });

    return updated!;
  }

  /**
   * Find pending operation by chat
   */
  async findPendingByChat(householdId: string, chatId: string): Promise<PendingOperation | null> {
    return this.repo.findByChat(householdId, chatId);
  }

  /**
   * Expire old operations (> 1 hour)
   */
  async expireOld(): Promise<number> {
    const now = new Date().toISOString();
    const expired = await this.repo.findExpiredBefore(now);

    let count = 0;
    for (const op of expired) {
      if (op.status === 'pending') {
        await this.repo.update(op.id, {
          status: 'expired',
          updatedAt: now,
        });
        count++;
      }
    }

    return count;
  }

  /**
   * Check if operation is ready to execute (no missing fields)
   */
  isReady(operation: PendingOperation): boolean {
    return operation.missingFields.length === 0;
  }

  /**
   * Get missing field prompts for user
   */
  getMissingFieldPrompts(operation: PendingOperation): string[] {
    return operation.missingFields.map(field => this.getFieldPrompt(field));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private detectMissingFields(operationType: OperationType, payload: DraftPayload): string[] {
    const missing: string[] = [];

    switch (operationType) {
      case 'expense':
      case 'income':
        if (!payload.amountCents) missing.push('amountCents');
        if (!payload.description) missing.push('description');
        if (!payload.date) missing.push('date');
        if (!payload.accountId) missing.push('accountId');
        break;

      case 'transfer':
        if (!payload.amountCents) missing.push('amountCents');
        if (!payload.date) missing.push('date');
        if (!payload.fromAccountId) missing.push('fromAccountId');
        if (!payload.toAccountId) missing.push('toAccountId');
        break;

      case 'card_purchase':
        if (!payload.amountCents) missing.push('amountCents');
        if (!payload.description) missing.push('description');
        if (!payload.firstDate) missing.push('firstDate');
        if (!payload.cardId) missing.push('cardId');
        if (!payload.installmentsCount) missing.push('installmentsCount');
        break;
    }

    return missing;
  }

  private calculateConfirmationLevel(payload: DraftPayload): number {
    if (!payload.amountCents) return 0;

    if (payload.amountCents > HIGH_VALUE_THRESHOLD_CENTS) {
      return 2; // High value - needs extra confirmation
    }

    return 1; // Simple confirmation
  }

  private getFieldPrompt(field: string): string {
    switch (field) {
      case 'amountCents':
        return 'qual o valor?';
      case 'description':
        return 'qual a descrição?';
      case 'date':
        return 'qual a data?';
      case 'accountId':
        return 'qual a conta?';
      case 'fromAccountId':
        return 'qual a conta de origem?';
      case 'toAccountId':
        return 'qual a conta de destino?';
      case 'cardId':
        return 'qual o cartão?';
      case 'firstDate':
        return 'qual a data da primeira parcela?';
      case 'installmentsCount':
        return 'em quantas parcelas?';
      case 'categoryId':
        return 'qual a categoria?';
      default:
        return `informe o campo: ${field}`;
    }
  }
}