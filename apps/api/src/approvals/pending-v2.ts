import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { withTransaction } from '../db/pool.js';
import {
  computePendingOperationV2Hash,
  pendingOperationV2Schema,
  verifyPendingOperationV2Hash,
  type PendingOperationV2,
} from '@pi-finance/llm-contracts';
import { validateApprovalToolArgs } from './tool-registry.js';

export type PendingOperationV2Status = 'proposed' | 'confirmed' | 'executing' | 'succeeded' | 'failed' | 'cancelled' | 'expired';
export type PendingIdentity = Pick<PendingOperationV2, 'workspaceId' | 'actorId' | 'deviceId'>;
export type PendingOperationV2Record = PendingOperationV2 & {
  id: string;
  status: PendingOperationV2Status;
  attestation?: string;
  execution?: unknown;
  /**
   * V052 execution-recovery surface (SPEC §12). Fresh records carry
   * executionAttemptCount 0 with the remaining fields absent; claim/lease
   * writers (T2.3/T2.4) populate them later. Read-only mapping here —
   * no protocol behavior changes.
   */
  attestationIssuedAt?: string;
  executionClaimedAt?: string;
  executionLeaseExpiresAt?: string;
  executionAttemptCount?: number;
  failureCode?: string;
  mutationId?: string;
  /**
   * Set only on propose() results: true when the call deduplicated onto an
   * already-persisted operation (same idempotency key + same proposal hash),
   * false when a new row was created. Never persisted; absent on get/confirm.
   */
  existing?: boolean;
};
export type PendingAuditEvent = { operationId: string; event: 'propose' | 'confirm' | 'execute' | 'cancel' | 'expire' | 'fail'; actorId: string; at: string };
export type PendingExecutor = (operation: PendingOperationV2) => Promise<unknown>;

export class PendingOperationV2Error extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 409, readonly details?: unknown) { super(message); this.name = 'PendingOperationV2Error'; }
}

const identityMatches = (a: PendingIdentity, b: PendingIdentity): boolean =>
  a.workspaceId === b.workspaceId && a.actorId === b.actorId && a.deviceId === b.deviceId;
const attestation = (): string => randomBytes(32).toString('base64url');

/**
 * SPEC §7.4: no pending operation the executor would reject may reach the DB.
 * Validates normalizedArgs against the registry inputSchema for the requested
 * tool BEFORE persisting. Defense-in-depth alongside the propose route, which
 * rejects earlier with the same codes for a richer HTTP shape.
 */
const assertCanonicalArgs = (fail: (code: string, message: string, statusCode?: number, details?: unknown) => never, operation: PendingOperationV2): void => {
  const checked = validateApprovalToolArgs(operation.tool, operation.normalizedArgs);
  if (checked.success) return;
  if (checked.code === 'tool.not_allowed') fail('tool.not_allowed', 'Ferramenta não permitida no protocolo de aprovação.', 403);
  fail('approval.invalid_args', 'Argumentos inválidos para a ferramenta de aprovação.', 422, checked.issues);
};
const nowIso = (): string => new Date().toISOString();

/**
 * SPEC §10 / ADR-013: execution lease written at claim (TX1). The reconciler
 * (T2.4) reaps `executing` rows past this deadline; the value stays a single
 * exported constant so the reconciler and the claim share it by construction.
 */
export const PENDING_V2_EXECUTION_LEASE_MS = 60_000;

/**
 * SPEC §11 (T2.4): lease duration is configurable — explicit override wins,
 * then `PENDING_V2_EXECUTION_LEASE_MS` env, then the 60s default constant
 * (which stays the default source). Claim (TX1) and the reconciler renew
 * both resolve through here so they share the window by construction.
 */
export type PendingOperationV2StoreOptions = {
  /** Execution-lease window in milliseconds. Must be > 0 to take effect. */
  leaseMs?: number;
};

export const resolvePendingV2LeaseMs = (override?: number): number => {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) return Math.floor(override);
  const fromEnv = Number(process.env.PENDING_V2_EXECUTION_LEASE_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
  return PENDING_V2_EXECUTION_LEASE_MS;
};

/**
 * SPEC §10: TX2 failure persists a SANITIZED code only — never the error
 * message, stack, prompt, or executor payload content. Protocol errors keep
 * their code; foreign string codes are allow-listed by shape; everything
 * else collapses to `executor.failed`.
 */
export const sanitizePendingV2FailureCode = (error: unknown): string => {
  if (error instanceof PendingOperationV2Error) return error.code;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(code)) return code;
  return 'executor.failed';
};

export type PendingOperationV2Store = {
  propose(operation: PendingOperationV2): Promise<PendingOperationV2Record>;
  get(id: string, identity: PendingIdentity): Promise<PendingOperationV2Record>;
  /**
   * T1.5 (SPEC §8.3): authoritative listing of non-terminal operations for
   * the AUTHENTICATED identity (workspace + actor + device). Never takes
   * client-declared ids. Read-only: no state transitions, no attestation.
   */
  listActive(identity: PendingIdentity): Promise<readonly PendingOperationV2Record[]>;
  confirm(id: string, identity: PendingIdentity): Promise<PendingOperationV2Record>;
  execute(token: string, identity: PendingIdentity, executor: PendingExecutor): Promise<PendingOperationV2Record>;
  retry(id: string, identity: PendingIdentity): Promise<PendingOperationV2Record>;
  cancel(id: string, identity: PendingIdentity): Promise<PendingOperationV2Record>;
  expire(id: string, identity: PendingIdentity): Promise<PendingOperationV2Record>;
  /**
   * SPEC §11.3 (T2.4): reconcile an abandoned `executing` operation whose
   * lease expired — crash recovery, NOT a new approval. Renews the lease,
   * bumps the attempt, and re-runs the SAME executor with the SAME persisted
   * idempotencyKey, persisting TX2 succeeded/failed exactly like execute().
   * Valid lease → `approval.execution_in_progress`; any non-`executing`
   * state (including `confirmed`, whose recovery is attestation re-emission
   * per §9/T2.2) → `approval.reconcile_not_allowed`. Terminal states never
   * re-enter execution.
   *
   * HTTP attach point (NOT wired here — routes/pending-operations.ts is
   * owned by a sibling task): e.g.
   * `POST /pending-operations/v2/:id/reconcile` →
   * `v2Store.reconcileExpiredExecuting(id, identity, v2Executor)`.
   */
  reconcileExpiredExecuting(
    id: string,
    identity: PendingIdentity,
    executor: PendingExecutor,
    opts?: { leaseMs?: number },
  ): Promise<PendingOperationV2Record>;
  readonly audit: readonly PendingAuditEvent[];
};

type PendingV2Row = Record<string, unknown>;
const hashAttestation = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');
const isoOrUndefined = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};
const textOrUndefined = (value: unknown): string | undefined =>
  value === null || value === undefined ? undefined : String(value);
const mapV2 = (row: PendingV2Row, token?: string): PendingOperationV2Record => {
  const attestationIssuedAt = isoOrUndefined(row.attestation_issued_at);
  const executionClaimedAt = isoOrUndefined(row.execution_claimed_at);
  const executionLeaseExpiresAt = isoOrUndefined(row.execution_lease_expires_at);
  const failureCode = textOrUndefined(row.failure_code);
  const mutationId = textOrUndefined(row.mutation_id);
  return {
    version: 2,
    id: String(row.id), workspaceId: String(row.workspace_id), actorId: String(row.actor_id), deviceId: String(row.device_id),
    tool: String(row.tool), normalizedArgs: (row.normalized_args ?? {}) as PendingOperationV2['normalizedArgs'],
    proposalHash: String(row.proposal_hash), idempotencyKey: String(row.idempotency_key),
    createdAt: new Date(row.created_at as string).toISOString(), expiresAt: new Date(row.expires_at as string).toISOString(),
    bindings: { workspaceId: String(row.workspace_id), actorId: String(row.actor_id), deviceId: String(row.device_id) },
    status: (row.execution_status ?? 'proposed') as PendingOperationV2Status,
    executionAttemptCount: typeof row.execution_attempt_count === 'number' ? row.execution_attempt_count : Number(row.execution_attempt_count ?? 0),
    ...(token ? { attestation: token } : {}),
    ...(row.execution_result !== null && row.execution_result !== undefined ? { execution: row.execution_result } : {}),
    ...(attestationIssuedAt !== undefined ? { attestationIssuedAt } : {}),
    ...(executionClaimedAt !== undefined ? { executionClaimedAt } : {}),
    ...(executionLeaseExpiresAt !== undefined ? { executionLeaseExpiresAt } : {}),
    ...(failureCode !== undefined ? { failureCode } : {}),
    ...(mutationId !== undefined ? { mutationId } : {}),
  };
};

export const createPostgresPendingOperationV2Store = (
  pool: Pool,
  options?: PendingOperationV2StoreOptions,
): PendingOperationV2Store => {
  const events: PendingAuditEvent[] = [];
  const fail = (code: string, message: string, statusCode = 409): never => { throw new PendingOperationV2Error(code, message, statusCode); };
  const read = async (client: PoolClient, id: string, identity: PendingIdentity, forUpdate = false): Promise<PendingV2Row> => {
    const result = await client.query<PendingV2Row>(`SELECT * FROM pending_operations WHERE id = $1 AND workspace_id = $2 AND protocol_version = 2${forUpdate ? ' FOR UPDATE' : ''}`, [id, identity.workspaceId]);
    const row = result.rows[0];
    if (!row) return fail('approval.not_found', 'Operação pendente não encontrada.', 404);
    if (String(row.actor_id) !== identity.actorId || String(row.device_id) !== identity.deviceId) return fail('approval.binding_mismatch', 'A operação não pertence ao contexto autenticado.', 403);
    return row;
  };
  const issue = (row: PendingV2Row): { row: PendingV2Row; token: string } => ({ row, token: attestation() });
  return {
    get audit() { return events; },
    async propose(operation) {
      if (!pendingOperationV2Schema.safeParse(operation).success || !(await verifyPendingOperationV2Hash(operation))) fail('approval.invalid_hash', 'Proposta V2 inválida ou hash divergente.', 400);
      assertCanonicalArgs(fail, operation);
      const result = await pool.query<PendingV2Row>(`INSERT INTO pending_operations (workspace_id, requester_id, operation, payload, reason, idempotency_key, status, expires_at, protocol_version, actor_id, device_id, tool, normalized_args, proposal_hash, execution_status) VALUES ($1,$2,$3,$4::jsonb,'high_value',$5,'pending',$6,$7,$8,$9,$10,$11::jsonb,$12,'proposed') ON CONFLICT (workspace_id,idempotency_key) WHERE protocol_version = 2 AND workspace_id IS NOT NULL AND idempotency_key IS NOT NULL DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key RETURNING *, (xmax = 0) AS is_insert`, [operation.workspaceId, operation.actorId, operation.tool, JSON.stringify(operation.normalizedArgs), operation.idempotencyKey, operation.expiresAt, 2, operation.actorId, operation.deviceId, operation.tool, JSON.stringify(operation.normalizedArgs), operation.proposalHash]);
      const row = result.rows[0]!;
      if (String(row.proposal_hash) !== operation.proposalHash) fail('idempotency.conflict', 'Chave de idempotência já utilizada com proposta diferente.');
      const existing = row.is_insert === false;
      events.push({ operationId: String(row.id), event: 'propose', actorId: operation.actorId, at: nowIso() });
      return { ...mapV2(row), existing };
    },
    async get(id, identity) { return mapV2(await read({ query: pool.query.bind(pool) } as unknown as PoolClient, id, identity)); },
    /**
     * T1.5 (SPEC §8.3) — appended after the terminal transitions so the
     * execute/claim/lease surface above stays untouched (T2.4 owns it).
     * Read-only scan scoped by the authenticated identity; terminal states
     * (succeeded/cancelled/expired) are excluded, actionable
     * (proposed/confirmed) and recovery-relevant (executing/failed) states
     * are included as listing metadata. No covering index is added here:
     * the table holds only live pending operations and the existing
     * V051/V052 partial indexes already narrow the sibling paths — a
     * dedicated (workspace, actor, device, status) index is a V053
     * follow-up if the scan ever shows up in query stats.
     */
    async listActive(identity) {
      const result = await pool.query<PendingV2Row>(
        `SELECT * FROM pending_operations WHERE workspace_id = $1 AND actor_id = $2 AND device_id = $3 AND protocol_version = 2 AND execution_status IN ('proposed','confirmed','executing','failed') ORDER BY created_at DESC`,
        [identity.workspaceId, identity.actorId, identity.deviceId],
      );
      return result.rows.map((row) => mapV2(row));
    },
    async confirm(id, identity) { return withTransaction(pool, async (client) => { const row = await read(client, id, identity, true); const status = String(row.execution_status); if (Date.parse(String(row.expires_at)) <= Date.now()) { await client.query("UPDATE pending_operations SET execution_status='expired' WHERE id=$1", [id]); events.push({ operationId: id, event: 'expire', actorId: identity.actorId, at: nowIso() }); return fail('approval.expired', 'A proposta expirou.'); } if (status === 'confirmed') {
      // SPEC §9 (H-03) recoverable confirm: lost confirm responses re-emit.
      // Unconsumed attestation rotates atomically in this same transaction:
      // new hash replaces the old (old token invalid), only the new token
      // is returned. An already-consumed attestation never re-emits.
      if (row.attestation_consumed_at !== null && row.attestation_consumed_at !== undefined) return mapV2(row);
      const reissued = attestation();
      const reemitted = await client.query<PendingV2Row>("UPDATE pending_operations SET attestation_hash=$2, attestation_issued_at=NOW() WHERE id=$1 RETURNING *", [id, hashAttestation(reissued)]);
      events.push({ operationId: id, event: 'confirm', actorId: identity.actorId, at: nowIso() });
      return mapV2(reemitted.rows[0]!, reissued);
    } if (status !== 'proposed') return fail('approval.not_pending', 'A operação não está pendente.'); const token = attestation(); const updated = await client.query<PendingV2Row>("UPDATE pending_operations SET execution_status='confirmed', attestation_hash=$2, attestation_issued_at=NOW() WHERE id=$1 RETURNING *", [id, hashAttestation(token)]); events.push({ operationId: id, event: 'confirm', actorId: identity.actorId, at: nowIso() }); return mapV2(updated.rows[0]!, token); }); },
    async execute(token, identity, executor) {
      // TX1 — claim. Consumes the attestation, marks `executing`, writes the
      // lease columns, and COMMITS before the executor runs: a failure after
      // this point can never roll the claim back (H-04).
      const claimed = await withTransaction(pool, async (client) => {
        const claim = await client.query<PendingV2Row>("UPDATE pending_operations SET attestation_consumed_at=NOW(), execution_status='executing', execution_claimed_at=NOW(), execution_lease_expires_at=$5, execution_attempt_count=execution_attempt_count+1 WHERE workspace_id=$1 AND actor_id=$2 AND device_id=$3 AND protocol_version=2 AND attestation_hash=$4 AND attestation_consumed_at IS NULL AND execution_status='confirmed' AND expires_at>NOW() RETURNING *", [identity.workspaceId, identity.actorId, identity.deviceId, hashAttestation(token), new Date(Date.now() + resolvePendingV2LeaseMs(options?.leaseMs)).toISOString()]);
        const row = claim.rows[0];
        if (!row) {
          // Claim miss: distinguish an in-flight execution (valid OR expired
          // lease — recovery belongs to the reconciler, never to a second
          // executor run) from a genuinely invalid/replayed attestation.
          const probe = await pool.query<PendingV2Row>("SELECT execution_status FROM pending_operations WHERE workspace_id=$1 AND protocol_version=2 AND attestation_hash=$2 LIMIT 1", [identity.workspaceId, hashAttestation(token)]);
          if (probe.rows[0] && String(probe.rows[0].execution_status) === 'executing') {
            return fail('approval.execution_in_progress', 'Execução já em andamento.', 409);
          }
          return fail('approval.attestation_replayed', 'Attestation inválida ou já consumida.', 403);
        }
        events.push({ operationId: String(row.id), event: 'execute', actorId: identity.actorId, at: nowIso() });
        return row;
      });
      // The executor runs OUTSIDE any transaction with the SAME persisted
      // idempotencyKey (WriteStore dedup unchanged).
      let result: unknown;
      try {
        result = await executor(mapV2(claimed));
      } catch (error) {
        // TX2 (failure). The terminal persist COMMITS before the error
        // propagates: the consumed attestation is never resurrected.
        await withTransaction(pool, async (client) => {
          await read(client, String(claimed.id), identity, true);
          await client.query("UPDATE pending_operations SET execution_status='failed', failed_at=NOW(), failure_code=$2 WHERE id=$1", [String(claimed.id), sanitizePendingV2FailureCode(error)]);
        });
        events.push({ operationId: String(claimed.id), event: 'fail', actorId: identity.actorId, at: nowIso() });
        throw error;
      }
      if (!result || typeof result !== 'object' || (result as { status?: unknown }).status !== 'succeeded' || typeof (result as { operationId?: unknown }).operationId !== 'string') {
        await withTransaction(pool, async (client) => {
          await read(client, String(claimed.id), identity, true);
          await client.query("UPDATE pending_operations SET execution_status='failed', failed_at=NOW(), failure_code=$2 WHERE id=$1", [String(claimed.id), 'approval.incomplete_result']);
        });
        events.push({ operationId: String(claimed.id), event: 'fail', actorId: identity.actorId, at: nowIso() });
        return fail('approval.incomplete_result', 'Executor retornou resultado incompleto.');
      }
      // TX2 (success).
      const updated = await withTransaction(pool, async (client) => {
        await read(client, String(claimed.id), identity, true);
        const terminal = await client.query<PendingV2Row>("UPDATE pending_operations SET execution_status='succeeded', execution_result=$2::jsonb, mutation_id=$3 WHERE id=$1 RETURNING *", [String(claimed.id), JSON.stringify(result), (result as { operationId: string }).operationId]);
        return terminal.rows[0]!;
      });
      return mapV2(updated);
    },
    async reconcileExpiredExecuting(id, identity, executor, opts) {
      // TX-R — renew. Row lock serializes concurrent reconciles: the loser
      // observes the renewed (valid) lease or the terminal state and aborts
      // WITHOUT running the executor a second time.
      const renewed = await withTransaction(pool, async (client) => {
        const row = await read(client, id, identity, true);
        const status = String(row.execution_status);
        // `confirmed` recovery is attestation re-emission (§9, T2.2) — the
        // lease path must never touch it. Asserted explicitly, not folded
        // into the generic guard below.
        if (status === 'confirmed') return fail('approval.reconcile_not_allowed', 'Operação confirmed recupera-se por reemissão de attestation, nunca por lease.');
        if (status !== 'executing') return fail('approval.reconcile_not_allowed', 'Reconciliação disponível somente para executing com lease expirada.');
        const leaseExpiresAt = Date.parse(String(row.execution_lease_expires_at));
        if (!Number.isNaN(leaseExpiresAt) && leaseExpiresAt > Date.now()) return fail('approval.execution_in_progress', 'Execução já em andamento.');
        const next = await client.query<PendingV2Row>("UPDATE pending_operations SET execution_lease_expires_at=$2, execution_attempt_count=execution_attempt_count+1 WHERE id=$1 RETURNING *", [id, new Date(Date.now() + resolvePendingV2LeaseMs(opts?.leaseMs ?? options?.leaseMs)).toISOString()]);
        events.push({ operationId: id, event: 'execute', actorId: identity.actorId, at: nowIso() });
        return next.rows[0]!;
      });
      // The SAME executor runs OUTSIDE any transaction with the SAME
      // persisted idempotencyKey (recovery, not a new approval).
      let result: unknown;
      try {
        result = await executor(mapV2(renewed));
      } catch (error) {
        // TX2 (failure). Same shape as execute(): sanitized code only.
        await withTransaction(pool, async (client) => {
          await read(client, id, identity, true);
          await client.query("UPDATE pending_operations SET execution_status='failed', failed_at=NOW(), failure_code=$2 WHERE id=$1", [id, sanitizePendingV2FailureCode(error)]);
        });
        events.push({ operationId: id, event: 'fail', actorId: identity.actorId, at: nowIso() });
        throw error;
      }
      if (!result || typeof result !== 'object' || (result as { status?: unknown }).status !== 'succeeded' || typeof (result as { operationId?: unknown }).operationId !== 'string') {
        await withTransaction(pool, async (client) => {
          await read(client, id, identity, true);
          await client.query("UPDATE pending_operations SET execution_status='failed', failed_at=NOW(), failure_code=$2 WHERE id=$1", [id, 'approval.incomplete_result']);
        });
        events.push({ operationId: id, event: 'fail', actorId: identity.actorId, at: nowIso() });
        return fail('approval.incomplete_result', 'Executor retornou resultado incompleto.');
      }
      // TX2 (success).
      const updated = await withTransaction(pool, async (client) => {
        await read(client, id, identity, true);
        const terminal = await client.query<PendingV2Row>("UPDATE pending_operations SET execution_status='succeeded', execution_result=$2::jsonb, mutation_id=$3 WHERE id=$1 RETURNING *", [id, JSON.stringify(result), (result as { operationId: string }).operationId]);
        return terminal.rows[0]!;
      });
      return mapV2(updated);
    },
    async retry(id, identity) { return withTransaction(pool, async (client) => { const row = await read(client, id, identity, true); if (String(row.execution_status) !== 'failed') return fail('approval.retry_not_allowed', 'Retry disponível somente após falha.'); const token = attestation(); const updated = await client.query<PendingV2Row>("UPDATE pending_operations SET execution_status='confirmed', attestation_hash=$2, attestation_consumed_at=NULL, attestation_issued_at=NOW() WHERE id=$1 RETURNING *", [id, hashAttestation(token)]); events.push({ operationId: id, event: 'confirm', actorId: identity.actorId, at: nowIso() }); return mapV2(updated.rows[0]!, token); }); },
    async cancel(id, identity) { return withTransaction(pool, async (client) => { const row = await read(client, id, identity, true); if (!['proposed','confirmed'].includes(String(row.execution_status))) return fail('approval.not_pending', 'A operação não está pendente.'); const updated = await client.query<PendingV2Row>("UPDATE pending_operations SET execution_status='cancelled' WHERE id=$1 RETURNING *", [id]); events.push({ operationId: id, event: 'cancel', actorId: identity.actorId, at: nowIso() }); return mapV2(updated.rows[0]!); }); },
    async expire(id, identity) { return withTransaction(pool, async (client) => { const row = await read(client, id, identity, true); if (!['proposed','confirmed'].includes(String(row.execution_status))) return fail('approval.not_pending', 'A operação não está pendente.'); const updated = await client.query<PendingV2Row>("UPDATE pending_operations SET execution_status='expired' WHERE id=$1 RETURNING *", [id]); events.push({ operationId: id, event: 'expire', actorId: identity.actorId, at: nowIso() }); return mapV2(updated.rows[0]!); }); },
  };
};

export const createInMemoryPendingOperationV2Store = (
  options?: PendingOperationV2StoreOptions,
): PendingOperationV2Store => {
  const records = new Map<string, PendingOperationV2Record>();
  const tokens = new Map<string, { id: string; consumed: boolean }>();
  const events: PendingAuditEvent[] = [];
  const fail = (code: string, message: string, statusCode = 409): never => { throw new PendingOperationV2Error(code, message, statusCode); };
  const resolve = (id: string, identity: PendingIdentity): PendingOperationV2Record => {
    const record = records.get(id);
    if (!record) return fail('approval.not_found', 'Operação pendente não encontrada.', 404);
    if (!identityMatches(record, identity)) return fail('approval.binding_mismatch', 'A operação não pertence ao contexto autenticado.', 403);
    if (record.status === 'proposed' || record.status === 'confirmed') {
      if (Date.parse(record.expiresAt) <= Date.now()) { record.status = 'expired'; events.push({ operationId: id, event: 'expire', actorId: record.actorId, at: nowIso() }); }
    }
    return record;
  };
  const issue = (record: PendingOperationV2Record): PendingOperationV2Record => {
    const token = attestation();
    record.attestation = token;
    tokens.set(token, { id: record.id, consumed: false });
    return record;
  };

  return {
    get audit() { return events; },
    async propose(operation) {
      if (!pendingOperationV2Schema.safeParse(operation).success || !(await verifyPendingOperationV2Hash(operation))) fail('approval.invalid_hash', 'Proposta V2 inválida ou hash divergente.', 400);
      assertCanonicalArgs(fail, operation);
      const existing = [...records.values()].find((r) => r.workspaceId === operation.workspaceId && r.idempotencyKey === operation.idempotencyKey);
      if (existing) {
        if (existing.proposalHash !== operation.proposalHash) fail('idempotency.conflict', 'Chave de idempotência já utilizada com proposta diferente.');
        return { ...existing, existing: true };
      }
      const record: PendingOperationV2Record = { ...operation, id: randomUUID(), status: 'proposed', executionAttemptCount: 0 };
      records.set(record.id, record);
      events.push({ operationId: record.id, event: 'propose', actorId: record.actorId, at: nowIso() });
      return { ...record, existing: false };
    },
    async get(id, identity) {
      // Plaintext attestations never leave the store via reads: only the
      // confirm/retry responses carry the newly issued token.
      const { attestation: _omitted, ...exposed } = resolve(id, identity);
      return exposed;
    },
    async confirm(id, identity) {
      const record = resolve(id, identity);
      if (record.status === 'expired') fail('approval.expired', 'A proposta expirou.');
      if (record.status === 'confirmed') {
        // SPEC §9 (H-03) recoverable confirm: mirror of the Postgres
        // rotation — a new token replaces the old one, the old entry is
        // marked consumed so exactly one attestation stays valid. An
        // already-consumed attestation never re-emits (replay path).
        const current = record.attestation ? tokens.get(record.attestation) : undefined;
        if (!current || current.consumed || current.id !== record.id) {
          const { attestation: _omitted, ...exposed } = record;
          return exposed;
        }
        current.consumed = true;
        record.attestationIssuedAt = nowIso();
        issue(record);
        events.push({ operationId: id, event: 'confirm', actorId: record.actorId, at: nowIso() });
        return record;
      }
      if (record.status !== 'proposed') fail('approval.not_pending', 'A proposta não está pendente.');
      record.status = 'confirmed';
      record.attestationIssuedAt = nowIso();
      issue(record);
      events.push({ operationId: id, event: 'confirm', actorId: record.actorId, at: nowIso() });
      return record;
    },
    async execute(token, identity, executor) {
      const found = tokens.get(token);
      if (!found) throw new PendingOperationV2Error('approval.attestation_replayed', 'Attestation inválida ou já consumida.', 403);
      if (found.consumed) {
        // Consumed attestation on an in-flight execution (valid OR expired
        // lease) → in-progress, never a duplicate run. Recovery of an
        // expired lease belongs to reconcileExpiredExecuting. Plain object
        // lookup (no resolve()) so this error path has no expiry side
        // effects on proposed/confirmed rows.
        const inFlight = records.get(found.id);
        if (inFlight && identityMatches(inFlight, identity) && inFlight.status === 'executing') {
          fail('approval.execution_in_progress', 'Execução já em andamento.');
        }
        fail('approval.attestation_replayed', 'Attestation inválida ou já consumida.', 403);
      }
      // TX1 — claim commits before the executor runs: consumption is never
      // rolled back, so any non-eligible state below is a replay (parity
      // with the Postgres claim, which burns nothing on mismatch but also
      // never resurrects a consumed attestation).
      const claim = found;
      claim.consumed = true;
      const record = resolve(claim.id, identity);
      if (record.status !== 'confirmed' || record.attestation !== token) fail('approval.attestation_replayed', 'Attestation inválida ou já consumida.', 403);
      record.status = 'executing';
      record.executionClaimedAt = nowIso();
      record.executionLeaseExpiresAt = new Date(Date.now() + resolvePendingV2LeaseMs(options?.leaseMs)).toISOString();
      record.executionAttemptCount = (record.executionAttemptCount ?? 0) + 1;
      events.push({ operationId: record.id, event: 'execute', actorId: record.actorId, at: nowIso() });
      let result: unknown;
      try {
        result = await executor(record);
      } catch (error) {
        // TX2 (failure): terminal persist lands before the error propagates.
        record.status = 'failed';
        record.failureCode = sanitizePendingV2FailureCode(error);
        events.push({ operationId: record.id, event: 'fail', actorId: record.actorId, at: nowIso() });
        throw error;
      }
      if (!result || typeof result !== 'object' || (result as { status?: unknown }).status !== 'succeeded' || typeof (result as { operationId?: unknown }).operationId !== 'string') {
        record.status = 'failed';
        record.failureCode = 'approval.incomplete_result';
        events.push({ operationId: record.id, event: 'fail', actorId: record.actorId, at: nowIso() });
        fail('approval.incomplete_result', 'Executor retornou resultado incompleto.');
      }
      // TX2 (success).
      record.execution = result;
      record.mutationId = (result as { operationId: string }).operationId;
      record.status = 'succeeded';
      return record;
    },
    async reconcileExpiredExecuting(id, identity, executor, opts) {
      // Renew section is synchronous (no await): atomic under the JS event
      // loop, so concurrent reconciles serialize like the Postgres row lock
      // — the loser observes the renewed lease or terminal state and aborts
      // WITHOUT running the executor a second time.
      const record = records.get(id);
      if (!record) return fail('approval.not_found', 'Operação pendente não encontrada.', 404);
      if (!identityMatches(record, identity)) return fail('approval.binding_mismatch', 'A operação não pertence ao contexto autenticado.', 403);
      // `confirmed` recovery is attestation re-emission (§9, T2.2) — the
      // lease path must never touch it. Asserted explicitly.
      if (record.status === 'confirmed') return fail('approval.reconcile_not_allowed', 'Operação confirmed recupera-se por reemissão de attestation, nunca por lease.');
      if (record.status !== 'executing') return fail('approval.reconcile_not_allowed', 'Reconciliação disponível somente para executing com lease expirada.');
      const leaseExpiresAt = record.executionLeaseExpiresAt ? Date.parse(record.executionLeaseExpiresAt) : NaN;
      if (!Number.isNaN(leaseExpiresAt) && leaseExpiresAt > Date.now()) return fail('approval.execution_in_progress', 'Execução já em andamento.');
      record.executionLeaseExpiresAt = new Date(Date.now() + resolvePendingV2LeaseMs(opts?.leaseMs ?? options?.leaseMs)).toISOString();
      record.executionAttemptCount = (record.executionAttemptCount ?? 0) + 1;
      events.push({ operationId: id, event: 'execute', actorId: record.actorId, at: nowIso() });
      // The SAME executor runs with the SAME persisted idempotencyKey.
      let result: unknown;
      try {
        result = await executor(record);
      } catch (error) {
        record.status = 'failed';
        record.failureCode = sanitizePendingV2FailureCode(error);
        events.push({ operationId: id, event: 'fail', actorId: record.actorId, at: nowIso() });
        throw error;
      }
      if (!result || typeof result !== 'object' || (result as { status?: unknown }).status !== 'succeeded' || typeof (result as { operationId?: unknown }).operationId !== 'string') {
        record.status = 'failed';
        record.failureCode = 'approval.incomplete_result';
        events.push({ operationId: id, event: 'fail', actorId: record.actorId, at: nowIso() });
        return fail('approval.incomplete_result', 'Executor retornou resultado incompleto.');
      }
      record.execution = result;
      record.mutationId = (result as { operationId: string }).operationId;
      record.status = 'succeeded';
      return record;
    },
    async retry(id, identity) {
      const record = resolve(id, identity);
      if (record.status !== 'failed') fail('approval.retry_not_allowed', 'Retry disponível somente após falha.');
      record.status = 'confirmed';
      record.attestationIssuedAt = nowIso();
      issue(record);
      events.push({ operationId: id, event: 'confirm', actorId: record.actorId, at: nowIso() });
      return record;
    },
    async cancel(id, identity) {
      const record = resolve(id, identity);
      if (!['proposed', 'confirmed'].includes(record.status)) fail('approval.not_pending', 'A operação não está pendente.');
      record.status = 'cancelled';
      events.push({ operationId: id, event: 'cancel', actorId: record.actorId, at: nowIso() });
      return record;
    },
    async expire(id, identity) {
      const record = resolve(id, identity);
      if (!['proposed', 'confirmed'].includes(record.status)) throw new PendingOperationV2Error('approval.not_pending', 'A operação não está pendente.');
      record.status = 'expired';
      events.push({ operationId: id, event: 'expire', actorId: record.actorId, at: nowIso() });
      return record;
    },
    /**
     * T1.5 (SPEC §8.3) — appended after the terminal transitions so the
     * execute/claim/lease surface above stays untouched (T2.4 owns it).
     * In-memory mirror of the Postgres scan: same identity scope, same
     * non-terminal status set, same newest-first order. Plaintext
     * attestations never leave via listing (same omission as get).
     */
    async listActive(identity) {
      return [...records.values()]
        .filter((record) => identityMatches(record, identity))
        .filter((record) => ['proposed', 'confirmed', 'executing', 'failed'].includes(record.status))
        .map(({ attestation: _omitted, ...exposed }) => exposed)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    },
  };
};

export { computePendingOperationV2Hash };
