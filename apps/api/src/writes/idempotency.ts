/**
 * Idempotency store and validation contract.
 *
 * Implements G2.2.4 (HTTP boundary validation) and G0.4.2 (composed SHA-256 identity).
 *
 * Lifecycle:
 * - Replay window: 7 days. Same key + same payload replays recorded response.
 * - Conflict window: 7 to 90 days. Same key raises idempotency.conflict.
 * - Eviction / Retention: > 90 days. Key expires and is removed.
 */

import { createHash } from 'node:crypto';
import { domainErrors } from './errors.js';

export const IDEMPOTENCY_RETRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const IDEMPOTENCY_RETENTION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export type IdempotencyRequest = {
  workspaceId: string;
  actorType: 'device' | 'user';
  actorId: string;
  operation: string;
  key: string;
};

/**
 * FIX-UNDO (F3, SPEC §12 F3 opção 1): producers MAY accept the claim
 * transaction client. Postgres-backed stores pass their open `PoolClient`
 * so the financial effect joins the claim transaction (single atomic
 * commit); stores without a transaction (in-memory) pass nothing.
 * The parameter is optional, so every existing `() => Promise<T>`
 * producer keeps compiling and behaving exactly as before.
 */
export type IdempotencyProducer<T> = (tx?: unknown) => Promise<T>;

/**
 * T3.2 (SPEC §12 F1 Opção A): claim lifecycle in parity with the Postgres
 * claim→complete lifecycle (writes/postgres.ts `processing` INSERT … upgrade
 * to `completed`). The claim is written SYNCHRONOUSLY as `processing` BEFORE
 * the producer runs; success upgrades it to `completed`, a producer throw
 * retains it as `failed`. A same-key/same-payload retry over a
 * `processing` (orphan — the synchronous producer already settled) or
 * `failed` claim TAKES OVER and re-executes the producer; a divergent
 * payload raises `idempotency.conflict` (same rule as the Postgres
 * payload_hash check). Torn intra-producer state is NOT representable in
 * heap — a real process crash loses heap effect + heap claim together, and
 * the in-memory producer is one synchronous atomic step — so there is no
 * mid-point to roll back to; the store guarantees observable replay
 * semantics, and the production atomicity proof stays on Postgres.
 */
export type IdempotencyClaimStatus = 'processing' | 'completed' | 'failed';

export type IdempotencyEntry<T> = {
  payloadHash: string;
  response: T;
  createdAt: number;
  status: IdempotencyClaimStatus;
};

export type IdempotencyStore = {
  lookupOrRecord<T>(
    householdId: string,
    key: string,
    payload: unknown,
    producer: IdempotencyProducer<T>,
  ): Promise<{ response: T; replayed: boolean }>;
  lookupOrRecord<T>(
    request: IdempotencyRequest,
    payload: unknown,
    producer: IdempotencyProducer<T>,
  ): Promise<{ response: T; replayed: boolean }>;
  clear(): void;
};

export const buildIdempotencyKey = (req: IdempotencyRequest): string => {
  const canonical = `${req.workspaceId}:${req.actorId}:${req.operation}:${req.key}`;
  return createHash('sha256').update(canonical).digest('hex');
};

export const hashIdempotencyPayload = (payload: unknown, version = 1): string => {
  const json = typeof payload === 'object' && payload !== null
    ? JSON.stringify(payload, Object.keys(payload as object).sort())
    : JSON.stringify(payload);
  const raw = `v${version}:${json}`;
  return createHash('sha256').update(raw).digest('hex');
};

export const createIdempotencyRequest = (
  identity: { householdId: string; deviceId?: string },
  operation: string,
  key: string,
): IdempotencyRequest => ({
  workspaceId: identity.householdId,
  actorType: 'device',
  actorId: identity.deviceId ?? 'device',
  operation,
  key,
});

export const createInMemoryIdempotencyStore = (): IdempotencyStore => {
  const store = new Map<string, IdempotencyEntry<unknown>>();
  const inFlight = new Map<string, { payloadHash: string; promise: Promise<unknown> }>();

  const evictExpired = (now: number): void => {
    for (const [k, v] of store.entries()) {
      if (now - v.createdAt > IDEMPOTENCY_RETENTION_WINDOW_MS) {
        store.delete(k);
      }
    }
  };

  return {
    async lookupOrRecord(scopeOrHouseholdId: any, keyOrPayload: any, payloadOrProducer: any, maybeProducer?: any) {
      let composite: string;
      let payload: unknown;
      // In-memory has no transaction: the producer always runs with no tx.
      let producer: IdempotencyProducer<any>;

      if (typeof scopeOrHouseholdId === 'object' && scopeOrHouseholdId !== null) {
        composite = buildIdempotencyKey(scopeOrHouseholdId);
        payload = keyOrPayload;
        producer = payloadOrProducer;
      } else {
        composite = `${scopeOrHouseholdId}::${keyOrPayload}`;
        payload = payloadOrProducer;
        producer = maybeProducer;
      }

      const now = Date.now();
      evictExpired(now);
      const existing = store.get(composite);
      const payloadHash = hashIdempotencyPayload(payload);
      // Takeover target: a retained non-completed claim reuses its original
      // creation time (retention still applies from the first claim).
      let claimedAt = now;

      if (existing) {
        const age = now - existing.createdAt;
        if (age > IDEMPOTENCY_RETENTION_WINDOW_MS) {
          store.delete(composite);
        } else if (existing.status === 'completed') {
          if (age > IDEMPOTENCY_RETRY_WINDOW_MS) {
            throw domainErrors.idempotencyConflict();
          } else {
            if (existing.payloadHash !== payloadHash) {
              throw domainErrors.idempotencyConflict();
            }
            return { response: existing.response as never, replayed: true };
          }
        } else {
          // Retained processing (orphan — no in-flight execution owns it
          // anymore) or failed claim: same payload takes over below and
          // re-executes the producer; divergent payload conflicts, mirroring
          // the Postgres payload_hash rule.
          if (existing.payloadHash !== payloadHash) {
            throw domainErrors.idempotencyConflict();
          }
          claimedAt = existing.createdAt;
        }
      }

      const flight = inFlight.get(composite);
      if (flight) {
        if (flight.payloadHash !== payloadHash) {
          throw domainErrors.idempotencyConflict();
        }
        const response = await flight.promise;
        return { response: response as never, replayed: true };
      }

      let resolveFlight!: (val: unknown) => void;
      let rejectFlight!: (err: unknown) => void;
      const flightPromise = new Promise<unknown>((res, rej) => {
        resolveFlight = res;
        rejectFlight = rej;
      });
      flightPromise.catch(() => undefined);

      inFlight.set(composite, { payloadHash, promise: flightPromise });
      // Claim BEFORE the producer (synchronous, mirrors the Postgres
      // `processing` INSERT): a throw anywhere below leaves the claim
      // retained as processing/failed for a same-payload takeover.
      store.set(composite, {
        payloadHash,
        response: undefined as never,
        createdAt: claimedAt,
        status: 'processing',
      });

      try {
        const response = await producer();
        store.set(composite, { payloadHash, response, createdAt: claimedAt, status: 'completed' });
        resolveFlight(response);
        return { response, replayed: false };
      } catch (err) {
        const claim = store.get(composite);
        if (claim && claim.payloadHash === payloadHash && claim.status === 'processing') {
          store.set(composite, { ...claim, status: 'failed' });
        }
        rejectFlight(err);
        throw err;
      } finally {
        inFlight.delete(composite);
      }
    },
    clear() {
      store.clear();
      inFlight.clear();
    },
  };
};

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/**
 * Validates the Idempotency-Key header.
 * Throws validation.required when missing/blank.
 * Throws validation.invalid when array/ambiguous or oversized (>255 chars).
 */
export const requireIdempotencyKey = (headers: Record<string, unknown>): string => {
  const raw = headers[IDEMPOTENCY_KEY_HEADER] ?? headers['Idempotency-Key'];
  if (raw === undefined || raw === null) {
    throw domainErrors.required('Idempotency-Key');
  }
  if (Array.isArray(raw)) {
    throw domainErrors.invalid('Idempotency-Key', 'Multiple Idempotency-Key headers are ambiguous');
  }
  const key = String(raw).trim();
  if (!key) {
    throw domainErrors.invalid('Idempotency-Key', 'Idempotency-Key cannot be empty');
  }
  if (key.length > 255) {
    throw domainErrors.invalid('Idempotency-Key', 'Idempotency-Key is too long (max 255 chars)');
  }
  return key;
};
