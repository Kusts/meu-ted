// ─────────────────────────────────────────────────────────────────────────────
// In-Memory PendingOperation Repository
// ─────────────────────────────────────────────────────────────────────────────

import type { PendingOperation, IPendingOperationRepository } from '../pending-operation.js';

export class InMemoryPendingOperationRepository implements IPendingOperationRepository {
  private operations = new Map<string, PendingOperation>();

  async create(operation: PendingOperation): Promise<PendingOperation> {
    this.operations.set(operation.id, operation);
    return operation;
  }

  async findById(id: string): Promise<PendingOperation | null> {
    return this.operations.get(id) ?? null;
  }

  async update(id: string, updates: Partial<PendingOperation>): Promise<PendingOperation | null> {
    const existing = this.operations.get(id);
    if (!existing) return null;

    const updated: PendingOperation = {
      ...existing,
      ...updates,
      id: existing.id, // Don't allow ID change
      createdAt: existing.createdAt, // Don't allow createdAt change
    };

    this.operations.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.operations.delete(id);
  }

  async findByChat(householdId: string, chatId: string): Promise<PendingOperation | null> {
    for (const op of this.operations.values()) {
      if (op.householdId === householdId && op.chatId === chatId && op.status === 'pending') {
        return op;
      }
    }
    return null;
  }

  async findExpiredBefore(before: string): Promise<PendingOperation[]> {
    const expired: PendingOperation[] = [];
    for (const op of this.operations.values()) {
      if (op.expiresAt < before) {
        expired.push(op);
      }
    }
    return expired;
  }

  async findByIdempotencyKey(householdId: string, key: string): Promise<PendingOperation | null> {
    for (const op of this.operations.values()) {
      if (op.householdId === householdId && op.idempotencyKey === key) {
        return op;
      }
    }
    return null;
  }

  // Helper for testing
  clear(): void {
    this.operations.clear();
  }

  // Helper for testing
  getAll(): PendingOperation[] {
    return Array.from(this.operations.values());
  }
}