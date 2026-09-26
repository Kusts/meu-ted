import type { DbPool } from '../../db/pool.js';
import { requireTestDatabase } from '../../db/db-guard.js';
import { validateMigrations } from '../../read-models/sql/migrate.js';
import { isBackupGateSatisfied } from '../migration-job-policy.js';
import {
  ARCHIVE_SCHEMA,
  CONVERSION_MARKER_TABLE,
  CONVERSION_STATE_COMPLETED,
  CONVERSION_STATE_CONVERTED,
  isCompletedState,
  runArchiveAndBootstrap,
} from './archive-and-bootstrap.js';
import {
  runBalancesStep,
  verifyBalances,
  type AppliedBalance,
  type BackfillResult,
  type BalancesVerification,
} from './balances.js';
import { IMPORT_ORDER, runCanonicalImport, type EntityImportResult } from './import.js';
import {
  materializeIdentity,
  restoreAuthIdentity,
  type IdentityMaterialization,
} from './identity.js';
import {
  collectConversionPlan,
  type ConversionBlocker,
  type ConversionInformational,
  type ConversionPlan,
} from './plan.js';

/**
 * M4 canonical converter: end-to-end orchestrator + completion report.
 *
 * Pipeline (fail-closed between phases: any throw records the marker as
 * `failed` with phase + error and aborts — there is NO resume; a rerun
 * over a `failed`/partial state refuses with a restore-oriented message,
 * see FINDING-4 above):
 *
 *   plan (dry-capable, read-only) -> [real runs only] archive-and-bootstrap
 *   -> restoreAuthIdentity -> import -> materializeIdentity -> runBalancesStep
 *   -> verify + completion marker (`state='completed'`, same backup_id).
 *
 * `--dry-run` executes ONLY the plan and returns the report: no writes, no
 * backup gate (read-only by construction — asserted in the M4 suite by
 * pre/post public snapshots).
 *
 * Rerun with the same backup_id re-executes VERIFICATIONS (full canonical
 * ledger, per-entity archive==canonical counts with audit_logs pinned at 0,
 * stored balances == anchor+ledger via `verifyBalances`) and returns a
 * no-op WITHOUT rewriting anything (the marker `finished_at` is untouched).
 *
 * Stale-plan guard: the orchestrator collects the authorizing plan itself —
 * over `public` pre-bootstrap, over `legacy_archive` once the legacy lives
 * there (a dedicated connection with `search_path` pinned, because the
 * preflight queries are unqualified by design) — and the collected
 * fingerprint must equal the marker's `plan_fingerprint` before any write
 * phase runs. Anything that changed the source between planning and writing
 * fails closed instead of converting under a stale proof.
 *
 * Report determinism: every phase proof carries counts/hashes only — no
 * timestamps, no durations inside the proofs (`durationMs` lives on the
 * report top level alone).
 */

export class ConversionError extends Error {
  constructor(detail: string) {
    super(`canonical conversion failed: ${detail}`);
    this.name = 'ConversionError';
  }
}

/**
 * FINDING-4: there is no resume. A failure in any post-bootstrap phase
 * records the marker as `failed` (with phase + error) and every rerun
 * over a `failed`/partial state refuses with a restore-oriented message:
 * RESTORE the backup and restart from zero. Retrying over partial
 * canonical writes would double-apply entities (per-entity transactions
 * commit independently) and the import gates would refuse with a
 * confusing "target not empty" error instead.
 */
export const buildFailedResumeMessage = (phase: string, cause: string, backupId: string): string =>
  `conversion failed in phase '${phase}' (backup_id '${backupId}'): ${cause}. ` +
  `Partial canonical writes may be present and MUST NOT be resumed: RESTAURE o backup '${backupId}' e reinicie do zero com o mesmo BACKUP_ID.`;

export type ConversionOptions = {
  dryRun?: boolean | undefined;
  schema?: string | undefined;
  archiveSchema?: string | undefined;
  env?: Record<string, string | undefined> | undefined;
};

export type ConversionPlanProof = {
  fingerprint: string;
  ready: boolean;
  blockers: ConversionBlocker[];
  informational: ConversionInformational[];
  counts: Record<string, number>;
};

export type RerunVerification = {
  planFingerprintMatch: boolean;
  ledger: { pending: number };
  entityCounts: EntityCount[];
  balances: BalancesVerification;
};

export type ConversionReport = {
  backupId: string;
  status: 'completed' | 'noop' | 'dry-run';
  plan: ConversionPlanProof;
  import?: { entities: EntityImportResult[] } | undefined;
  identity?: IdentityMaterialization | undefined;
  balances?:
    | {
        households: string[];
        backfilled: BackfillResult;
        applied: AppliedBalance[];
        verified: BalancesVerification;
      }
    | undefined;
  verification?: RerunVerification | undefined;
  durationMs: number;
};

export type ConversionSummary = {
  planFingerprint: string;
  entities: EntityCount[];
  identity: {
    households: number;
    memberships: number;
    derived: { households: number; memberships: number };
  };
  balances: {
    backfilled: BackfillResult;
    applied: number;
    verified: BalancesVerification;
  };
};

type MarkerState = {
  backupId: string;
  state: string;
  planFingerprint: string;
  phase: string | null;
  failure: string | null;
  summary: ConversionSummary | null;
};

const quoteIdent = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const readMarker = async (pool: DbPool, schema: string): Promise<MarkerState | null> => {
  const select = (withSummary: boolean, withFailure: boolean): string => {
    const extras = `${withSummary ? ', summary' : ''}${withFailure ? `, phase, ${quoteIdent('error')} AS failure` : ''}`;
    return `SELECT backup_id, state, plan_fingerprint${extras} FROM ${quoteIdent(schema)}.${quoteIdent(CONVERSION_MARKER_TABLE)} ORDER BY id DESC LIMIT 1`;
  };
  const parse = (row: Record<string, unknown> | undefined, withSummary: boolean, withFailure: boolean): MarkerState | null => {
    if (!row) return null;
    let summary: ConversionSummary | null = null;
    if (withSummary && row.summary !== null && row.summary !== undefined) {
      summary = (typeof row.summary === 'string' ? JSON.parse(row.summary) : row.summary) as ConversionSummary;
    }
    return {
      backupId: String(row.backup_id),
      state: String(row.state),
      planFingerprint: String(row.plan_fingerprint ?? ''),
      phase: withFailure && row.phase !== null && row.phase !== undefined ? String(row.phase) : null,
      failure: withFailure && row.failure !== null && row.failure !== undefined ? String(row.failure) : null,
      summary,
    };
  };
  try {
    const res = await pool.query(select(true, true));
    return parse(res.rows[0] as Record<string, unknown> | undefined, true, true);
  } catch (error) {
    const code = (error as { code?: string }).code;
    // Markers written by M1 predate the summary column, and markers
    // written before the failed-state hardening lack phase/error: retry
    // without them.
    if (code === '42703') {
      try {
        const res = await pool.query(select(true, false));
        return parse(res.rows[0] as Record<string, unknown> | undefined, true, false);
      } catch (nested) {
        if ((nested as { code?: string }).code === '42703') {
          const res = await pool.query(select(false, false));
          return parse(res.rows[0] as Record<string, unknown> | undefined, false, false);
        }
        throw nested;
      }
    }
    if (code === '42P01') return null;
    throw error;
  }
};

/**
 * Collects the conversion plan over the schema that currently holds the
 * legacy snapshot. Past bootstrap that is the archive, whose preflight
 * queries need it on the `search_path` — hence a dedicated connection
 * (released with the path reset) instead of the shared pool.
 */
const collectPlanForSchema = async (pool: DbPool, targetSchema: string): Promise<ConversionPlan> => {
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO ${quoteIdent(targetSchema)}`);
    // The plan fans queries out via Promise.all; a single pg client cannot
    // run them concurrently, so the adapter serializes them through a chain.
    let tail: Promise<unknown> = Promise.resolve();
    const adapter = {
      query: (sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }> => {
        const next = tail.then(() => client.query(sql, params));
        tail = next.catch(() => undefined);
        return next as Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
      },
    };
    return await collectConversionPlan(adapter, { schema: targetSchema });
  } finally {
    try {
      await client.query(`RESET search_path`);
    } catch {
      // ignore reset failure; the release below still returns the connection
    }
    client.release();
  }
};

const planProof = (plan: ConversionPlan): ConversionPlanProof => ({
  fingerprint: plan.fingerprint,
  ready: plan.ready,
  blockers: plan.blockers,
  informational: plan.informational,
  counts: plan.inventory.counts,
});

const tableCount = async (pool: DbPool, schema: string, table: string): Promise<number> => {
  const res = await pool.query(`SELECT COUNT(*)::int AS n FROM ${quoteIdent(schema)}.${quoteIdent(table)}`);
  return Number(res.rows[0]?.n ?? 0);
};

const archiveCount = async (pool: DbPool, archiveSchema: string, table: string): Promise<number> => {
  const exists = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) AS ok`,
    [archiveSchema, table],
  );
  if ((exists.rows[0] as Record<string, unknown> | undefined)?.ok !== true) return 0;
  return tableCount(pool, archiveSchema, table);
};

const ENTITY_NAMES = [...IMPORT_ORDER.map((spec) => spec.name), 'audit_logs'];

export type EntityCount = { entity: string; archive: number; canonical: number; note?: string };

const countEntities = async (
  pool: DbPool,
  schema: string,
  archiveSchema: string,
): Promise<EntityCount[]> => {
  const out: EntityCount[] = [];
  for (const entity of ENTITY_NAMES) {
    if (entity === 'audit_logs') {
      const canonical = await auditCanonicalCount(pool, schema);
      // FINDING-5: a catalog-proven absent canonical audit_logs is
      // recorded in the report instead of silently passing as "empty".
      const probe = await pool.query(`SELECT to_regclass($1) IS NULL AS missing`, [`${schema}.audit_logs`]);
      const missing = (probe.rows[0] as Record<string, unknown> | undefined)?.missing === true;
      out.push({
        entity,
        archive: await archiveCount(pool, archiveSchema, entity),
        canonical,
        ...(missing ? { note: 'canonical audit_logs is absent (catalog-proven): counted as 0' } : {}),
      });
      continue;
    }
    out.push({
      entity,
      archive: await archiveCount(pool, archiveSchema, entity),
      canonical: await tableCount(pool, schema, entity),
    });
  }
  return out;
};

/**
 * FINDING-5: strict audit count. Query errors (permissions, broken
 * table) propagate instead of being swallowed as 0. Zero is returned
 * ONLY when the catalog proves the table is absent
 * (`to_regclass('schema.audit_logs') IS NULL`).
 */
export const auditCanonicalCount = async (pool: DbPool, schema: string): Promise<number> => {
  const probe = await pool.query(`SELECT to_regclass($1) IS NULL AS missing`, [`${schema}.audit_logs`]);
  if ((probe.rows[0] as Record<string, unknown> | undefined)?.missing === true) return 0;
  return tableCount(pool, schema, 'audit_logs');
};

const assertEntityCounts = (
  counts: Array<{ entity: string; archive: number; canonical: number }>,
  derived: { households: number; memberships: number },
): void => {
  for (const { entity, archive, canonical } of counts) {
    if (entity === 'audit_logs') {
      if (canonical !== 0) {
        throw new ConversionError(
          `canonical audit_logs holds ${canonical} rows: audit history must stay in the archive`,
        );
      }
      continue;
    }
    // Identity derivation (M4) legitimately exceeds the archive: derived
    // households/memberships are new canonical rows evidenced by financial
    // data, explicitly counted in the identity proof.
    const expected = archive + (derived[entity as keyof typeof derived] ?? 0);
    if (expected !== canonical) {
      throw new ConversionError(
        `count mismatch for ${entity}: archive holds ${archive} plus ${expected - archive} derived but canonical holds ${canonical}`,
      );
    }
  }
};

/**
 * The `_test_marker` guard lives in `public` and is archived away by the
 * bootstrap with everything else. The orchestrator preserves it across the
 * bootstrap so the downstream phase guards (which run outside production)
 * keep seeing the same test database. Production has no marker table, so
 * this is a no-op there by construction.
 */
const readTestGuardValue = async (pool: DbPool, env: Record<string, string | undefined>): Promise<string | null> => {
  if (env.NODE_ENV === 'production') return null;
  try {
    const res = await pool.query(`SELECT marker_value FROM public._test_marker LIMIT 1`);
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? String(row.marker_value) : null;
  } catch {
    return null;
  }
};

const restoreTestGuardValue = async (
  pool: DbPool,
  env: Record<string, string | undefined>,
  value: string | null,
): Promise<void> => {
  if (env.NODE_ENV === 'production' || value === null) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS public._test_marker (marker_value TEXT NOT NULL)`);
  const res = await pool.query(`SELECT marker_value FROM public._test_marker LIMIT 1`);
  const row = res.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    await pool.query(`INSERT INTO public._test_marker (marker_value) VALUES ($1)`, [value]);
  } else if (String(row.marker_value) !== value) {
    throw new ConversionError('test guard changed across the bootstrap: manual triage required');
  }
};

const verifyConversion = async (
  pool: DbPool,
  opts: {
    schema: string;
    archiveSchema: string;
    env: Record<string, string | undefined>;
    derived: { households: number; memberships: number };
  },
): Promise<RerunVerification> => {
  const ledgerPlan = await validateMigrations(pool, false);
  if (ledgerPlan.pending.length > 0) {
    throw new ConversionError(
      `canonical ledger incomplete on rerun: missing ${ledgerPlan.pending.map((m) => m.name).join(', ')}`,
    );
  }
  const entityCounts = await countEntities(pool, opts.schema, opts.archiveSchema);
  assertEntityCounts(entityCounts, opts.derived);
  const balances = await verifyBalances(pool, { schema: opts.schema, env: opts.env });
  if (balances.mismatched.length > 0) {
    const first = balances.mismatched[0]!;
    throw new ConversionError(
      `stored balance drift on rerun: account '${first.accountId}' holds ${first.stored} but anchor+ledger derives ${first.expected}`,
    );
  }
  return { planFingerprintMatch: true, ledger: { pending: 0 }, entityCounts, balances };
};

const writeCompletionMarker = async (
  pool: DbPool,
  schema: string,
  backupId: string,
  summary: ConversionSummary,
): Promise<void> => {
  await pool.query(
    `ALTER TABLE ${quoteIdent(schema)}.${quoteIdent(CONVERSION_MARKER_TABLE)} ADD COLUMN IF NOT EXISTS summary JSONB`,
  );
  const res = await pool.query(
    `UPDATE ${quoteIdent(schema)}.${quoteIdent(CONVERSION_MARKER_TABLE)}
        SET state = $2, finished_at = NOW(), summary = $3
      WHERE backup_id = $1 AND state = $4`,
    [backupId, CONVERSION_STATE_CONVERTED, JSON.stringify(summary), CONVERSION_STATE_COMPLETED],
  );
  if ((res.rowCount ?? 0) !== 1) {
    throw new ConversionError(
      `completion marker update affected ${res.rowCount ?? 0} rows (backup '${backupId}'): manual triage required`,
    );
  }
};

/**
 * FINDING-4: records the explicit `failed` state (phase + error) after a
 * post-bootstrap phase throws. Best-effort: the original error is what
 * the caller sees, so marker-write failures are swallowed here. Never
 * touches a `completed` row.
 */
const writeFailedMarker = async (
  pool: DbPool,
  schema: string,
  backupId: string,
  phase: string,
  cause: string,
): Promise<void> => {
  try {
    await pool.query(
      `ALTER TABLE ${quoteIdent(schema)}.${quoteIdent(CONVERSION_MARKER_TABLE)} ADD COLUMN IF NOT EXISTS phase TEXT`,
    );
    await pool.query(
      `ALTER TABLE ${quoteIdent(schema)}.${quoteIdent(CONVERSION_MARKER_TABLE)} ADD COLUMN IF NOT EXISTS ${quoteIdent('error')} TEXT`,
    );
    await pool.query(
      `UPDATE ${quoteIdent(schema)}.${quoteIdent(CONVERSION_MARKER_TABLE)}
          SET state = 'failed', finished_at = NOW(), phase = $2, ${quoteIdent('error')} = $3
        WHERE backup_id = $1 AND state = $4`,
      [backupId, phase, cause, CONVERSION_STATE_COMPLETED],
    );
  } catch {
    // ignore: the conversion error below carries the failure
  }
};

export const runCanonicalConversion = async (
  pool: DbPool,
  opts: ConversionOptions = {},
): Promise<ConversionReport> => {
  const startedAt = Date.now();
  const env = opts.env ?? process.env;
  const schema = opts.schema ?? 'public';
  const archiveSchema = opts.archiveSchema ?? ARCHIVE_SCHEMA;
  const dryRun = opts.dryRun ?? false;
  if (env.NODE_ENV !== 'production') {
    await requireTestDatabase(pool, 'canonical-converter');
  }

  const marker = await readMarker(pool, schema);
  const backupId = env.BACKUP_ID?.trim() ?? '';

  if (dryRun) {
    const plan = await collectPlanForSchema(pool, schema);
    return { backupId, status: 'dry-run', plan: planProof(plan), durationMs: Date.now() - startedAt };
  }

  if (!isBackupGateSatisfied(env)) {
    throw new ConversionError('backup gate not satisfied: BACKUP_CONFIRMED=true and BACKUP_ID are required');
  }
  if (marker !== null && marker.backupId !== backupId) {
    throw new ConversionError(
      `conversion marker records backup_id '${marker.backupId}' but BACKUP_ID is '${backupId}': refusing to overwrite`,
    );
  }
  if (marker !== null && !isCompletedState(marker.state)) {
    // FINDING-4: no resume over partial writes — restore and restart.
    const context = marker.state === 'failed' && marker.phase
      ? `failed in phase '${marker.phase}'${marker.failure ? `: ${marker.failure}` : ''}`
      : `state '${marker.state}'`;
    throw new ConversionError(
      `partial conversion state recorded (backup_id '${marker.backupId}', ${context}): ` +
      `RESTAURE o backup '${marker.backupId}' e reinicie do zero com o mesmo BACKUP_ID; refusing to continue over partial writes`,
    );
  }

  const legacySchema = marker === null ? schema : archiveSchema;
  const plan = await collectPlanForSchema(pool, legacySchema);
  if (!plan.ready) {
    const details = plan.blockers.map((b) => `${b.code}(${b.count})`).join('; ');
    throw new ConversionError(`conversion plan is NO-GO: ${details}`);
  }

  if (marker !== null && marker.state === CONVERSION_STATE_CONVERTED) {
    if (plan.fingerprint !== marker.planFingerprint) {
      throw new ConversionError('plan fingerprint mismatch on rerun: the archived source changed since the conversion');
    }
    // Derived identity rows legitimately exceed the archive: the expected
    // derivation comes from the completion summary recorded on the marker.
    const derived = marker.summary?.identity.derived;
    if (!derived) {
      throw new ConversionError('rerun verification needs the completion summary: marker predates it, manual triage required');
    }
    const verification = await verifyConversion(pool, { schema, archiveSchema, env, derived });
    return { backupId, status: 'noop', plan: planProof(plan), verification, durationMs: Date.now() - startedAt };
  }

  if (marker === null) {
    const guard = await readTestGuardValue(pool, env);
    const bootstrap = await runArchiveAndBootstrap(pool, { schema, archiveSchema, env });
    await restoreTestGuardValue(pool, env, guard);
    if (bootstrap.status !== 'bootstrapped') {
      throw new ConversionError(`unexpected bootstrap status '${bootstrap.status}': manual triage required`);
    }
    const recorded = await readMarker(pool, schema);
    if (recorded?.planFingerprint !== plan.fingerprint) {
      throw new ConversionError('stale authorizing plan: the source changed between planning and bootstrap');
    }
  } else if (plan.fingerprint !== marker.planFingerprint) {
    throw new ConversionError('plan fingerprint mismatch: the archive changed since the bootstrap');
  }

  // FINDING-4: any post-bootstrap phase failure records the explicit
  // `failed` state (phase + error) before the error propagates, so the
  // next rerun refuses with the restore orientation above.
  let phase = 'restore-auth';
  try {
    await restoreAuthIdentity(pool, { schema, archiveSchema, env });
    phase = 'import';
    const imported = await runCanonicalImport(pool, { planFingerprint: plan.fingerprint, schema, archiveSchema, env });
    phase = 'identity';
    const identity = await materializeIdentity(pool, { fingerprint: plan.fingerprint }, { schema, archiveSchema, env });
    phase = 'balances';
    const balancesStep = await runBalancesStep(pool, { schema, archiveSchema, env });
    phase = 'verify';
    const verified = await verifyBalances(pool, { schema, env });
    if (verified.mismatched.length > 0) {
      const first = verified.mismatched[0]!;
      throw new ConversionError(
        `balances verification failed after apply: account '${first.accountId}' holds ${first.stored.toString()} but anchor+ledger derives ${first.expected.toString()}`,
      );
    }
    phase = 'finalize';
    const entityCounts = await countEntities(pool, schema, archiveSchema);
    assertEntityCounts(entityCounts, identity.derived);

    const summary: ConversionSummary = {
      planFingerprint: plan.fingerprint,
      entities: entityCounts,
      identity: {
        households: identity.households,
        memberships: identity.memberships,
        derived: identity.derived,
      },
      balances: {
        backfilled: balancesStep.backfilled,
        applied: balancesStep.applied.length,
        verified,
      },
    };
    await writeCompletionMarker(pool, schema, backupId, summary);

    return {
      backupId,
      status: 'completed',
      plan: planProof(plan),
      import: { entities: imported.entities },
      identity,
      balances: {
        households: balancesStep.households,
        backfilled: balancesStep.backfilled,
        applied: balancesStep.applied,
        verified,
      },
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    await writeFailedMarker(pool, schema, backupId, phase, cause);
    if (error instanceof ConversionError) throw error;
    throw new ConversionError(buildFailedResumeMessage(phase, cause, backupId));
  }
};
