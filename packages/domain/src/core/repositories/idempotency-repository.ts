import type { IdempotencyKey } from '../entities/idempotency-key.js';

/**
 * Idempotency Key Repository Port (REQ-032)
 */
export interface IIdempotencyRepository {
  create(key: IdempotencyKey): Promise<IdempotencyKey>;
  findByKey(householdId: string, key: string, scope?: string): Promise<IdempotencyKey | null>;
}