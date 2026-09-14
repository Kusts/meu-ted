/**
 * P1 (audit item 7): key-idempotent execution for V2 pending operations.
 *
 * The V2 executor runs every financial mutation with the pending
 * operation's persisted `idempotencyKey`. A retry of the same operation
 * (same key + same payload) must return the first attempt's outcome and
 * never re-execute the write — even when the first attempt's mutation
 * committed but the pending-operation finalization was lost.
 *
 * Persistence reuses the existing `idempotency_keys` table (V002, also
 * created on legacy deployments via V003) — no migration needed. Keys
 * are namespaced with `pending-v2:` so V2 execution records never
 * collide with HTTP-layer `Idempotency-Key` records sharing the table.
 *
 * Concurrency: the record INSERT uses `ON CONFLICT DO NOTHING` inside
 * the SAME transaction as the mutation. A loser of the claim race throws
 * an internal replay signal (rolling its own uncommitted mutation back)
 * and then reads the winner's committed record. In-memory stores dedupe
 * concurrent calls through a shared in-flight promise instead.
 */

import type { Pool, PoolClient } from 'pg';
import type { Transaction } from '../types/domain.js';
import { withTransaction } from '../db/pool.js';
import { domainErrors } from './errors.js';
import { hashIdempotencyPayload } from './idempotency.js';

/** Namespace isolating V2 execution records inside `idempotency_keys`. */
export const PENDING_V2_IDEMPOTENCY_PREFIX = 'pending-v2:';

export const namespacedPendingV2Key = (idempotencyKey: string): string =>
  `${PENDING_V2_IDEMPOTENCY_PREFIX}${idempotencyKey}`;

const SELECT_KEY =
  'SELECT payload_hash, response FROM idempotency_keys WHERE household_id = $1 AND key = $2';
const INSERT_KEY =
  'INSERT INTO idempotency_keys (household_id, key, payload_hash, response) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING';

/** Internal: unwinds the loser's tx so its duplicate mutation rolls back. */
class KeyReplaySignal extends Error {
  constructor() {
    super('idempotency.replay');
    this.name = 'KeyReplaySignal';
  }
}

type KeyRow = { payload_hash: string; response: unknown };

const parseResponse = (response: unknown): { transaction: Transaction } => {
  const envelope = typeof response === 'string' ? (JSON.parse(response) as unknown) : response;
  if (!envelope || typeof envelope !== 'object' || !('transaction' in envelope)) {
    throw domainErrors.idempotencyConflict();
  }
  return envelope as { transaction: Transaction };
};

/**
 * Runs a Postgres-backed mutation at most once per (household, key).
 * The record is written transactionally with the mutation; a claim-race
 * loser rolls back and replays the winner's recorded transaction.
 */
export const runKeyedMutation = async (opts: {
  pool: Pool;
  householdId: string;
  idempotencyKey: string;
  payload: unknown;
  mutate: (client: PoolClient) => Promise<Transaction>;
}): Promise<Transaction> => {
  const { pool, householdId, payload } = opts;
  const key = namespacedPendingV2Key(opts.idempotencyKey);
  const payloadHash = hashIdempotencyPayload(payload);
  try {
    return await withTransaction(pool, async (client) => {
      const existing = await client.query<KeyRow>(SELECT_KEY, [householdId, key]);
      if ((existing.rowCount ?? 0) > 0) {
        const row = existing.rows[0]!;
        if (row.payload_hash !== payloadHash) throw domainErrors.idempotencyConflict();
        return parseResponse(row.response).transaction;
      }
      const result = await opts.mutate(client);
      const claimed = await client.query(INSERT_KEY, [
        householdId,
        key,
        payloadHash,
        JSON.stringify({ transaction: result }),
      ]);
      if ((claimed.rowCount ?? 0) === 0) throw new KeyReplaySignal();
      return result;
    });
  } catch (err) {
    if (!(err instanceof KeyReplaySignal)) throw err;
    const settled = await pool.query<KeyRow>(SELECT_KEY, [householdId, key]);
    const row = settled.rows[0];
    if (!row) throw domainErrors.idempotencyConflict();
    if (row.payload_hash !== payloadHash) throw domainErrors.idempotencyConflict();
    return parseResponse(row.response).transaction;
  }
};
