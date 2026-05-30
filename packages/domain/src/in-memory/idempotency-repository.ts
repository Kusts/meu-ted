import type { IdempotencyKey } from '../core/entities/idempotency-key.js';
import type { IIdempotencyRepository } from '../core/repositories/idempotency-repository.js';

export class InMemoryIdempotencyRepository implements IIdempotencyRepository {
  private keys: Map<string, IdempotencyKey> = new Map();

  // Key format: householdId:key:scope
  private key(key: string, scope: string): string {
    return `${key}:${scope}`;
  }

  async create(entry: IdempotencyKey): Promise<IdempotencyKey> {
    this.keys.set(this.key(entry.key, entry.scope), { ...entry });
    return { ...entry };
  }

  async findByKey(_householdId: string, key: string, scope?: string): Promise<IdempotencyKey | null> {
    if (!scope) return null;
    return this.keys.get(this.key(key, scope)) ?? null;
  }
}