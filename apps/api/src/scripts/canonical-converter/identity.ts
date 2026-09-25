import type { DbPool } from '../../db/pool.js';
import { applyMigrationTimeouts } from '../../db/pool.js';
import { requireTestDatabase } from '../../db/db-guard.js';
import { withMigrationAdvisoryLock } from '../migration-job-policy.js';
import { ARCHIVE_SCHEMA } from './archive-and-bootstrap.js';

/**
 * M4 canonical converter: identity materialization.
 *
 * How legacy binds user<->household today (evidence, not assumption):
 * - Better Auth owns human identity (`"user"`/`session`/`account`/
 *   `verification`, V017, mounted in BOTH the legacy and canonical server
 *   branches via `createBetterAuth` in `server/index.ts`).
 * - `memberships(user_id TEXT -> "user"(id), household_id UUID, role)`
 *   (V017) is the user<->household link; `users(id UUID, auth_user_id ->
 *   "user"(id))` (V020) bridges it to the application id. The request
 *   `authenticatedContext.householdId` resolves through
 *   `auth/workspace-access.ts` (users JOIN memberships JOIN households).
 * - V017 memberships carry NO households FK and V020 (which materializes
 *   households from financial data) is canonical-only, so a legacy snapshot
 *   may hold financial `household_id`s with NO households row at all — the
 *   scenario this module derives (same UNION semantics as
 *   `V020__identity_workspaces.sql`, same UUIDs, nothing invented).
 *
 * Two phases, called by the M4 orchestrator in order:
 * 1. `restoreAuthIdentity` (BEFORE the M2 import): copies the Better Auth
 *    tables from `legacy_archive` into the fresh canonical `public` by
 *    column intersection, parent-first (`"user"` -> session/account ->
 *    verification). Without this the M2 `users` import fails its
 *    `auth_user_id -> "user"(id)` FK on any snapshot that actually used
 *    Better Auth (the M2 suite seeds that row by hand for the same reason).
 * 2. `materializeIdentity` (AFTER the M2 import): for every financial
 *    `household_id` with no canonical `households` row, inserts a derived
 *    `shared` household (`'Migrated household'`, V020 wording) owned by the
 *    evidenced creator. The live V021/V022 creator triggers synthesize the
 *    owner membership on that INSERT (same as production); the step then
 *    asserts an active owner membership exists — the canonical model
 *    REQUIRES it (`households_shared_owner_chk` + the deferred
 *    `memberships_shared_owner_check`).
 *
 * Fail-closed: ambiguous or unresolvable owners throw BEFORE any write
 * (single transaction); a derivation is never an arbitrary pick — every
 * derived row is counted in `derived` and every decision is traceable to
 * archive evidence (`resolveDerivedOwner` is pure and unit-tested).
 */

export class IdentityError extends Error {
  constructor(detail: string) {
    super(`cannot materialize converter identity: ${detail}`);
    this.name = 'IdentityError';
  }
}

export type IdentityOptions = {
  schema?: string | undefined;
  archiveSchema?: string | undefined;
  env?: Record<string, string | undefined> | undefined;
};

export type IdentityArchiveEvidence = {
  /** Application users.id values already in UUID form. */
  userIds: ReadonlySet<string>;
  /** Better-Auth id -> application users.id. */
  userIdByAuthId: ReadonlyMap<string, string>;
  /** Every archived application user id (single-creator fallback census). */
  allUserIds: readonly string[];
  /** Archived membership rows already scoped to the household. */
  memberships: Array<{ rawUserId: unknown; role: unknown }>;
  /**
   * Non-membership user refs evidencing a bind to the household
   * (`device_tokens.user_id`, `operation_records.actor_id`).
   */
  linkedUserRefs: unknown[];
};

const resolveAppUser = (
  raw: unknown,
  users: Pick<IdentityArchiveEvidence, 'userIds' | 'userIdByAuthId'>,
): string | null => {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  if (users.userIds.has(raw)) return raw;
  return users.userIdByAuthId.get(raw) ?? null;
};

/**
 * Picks the evidenced owner for a household with no `households` row.
 * Priority (first single-candidate level wins): archived owner membership
 * -> archived membership of any role (the creator trigger promotes it) ->
 * device/operation evidence link -> the single archived user when NO link
 * exists at all. Anything else (two distinct candidates at the winning
 * level, links that resolve to nobody, no user at all) throws
 * `IdentityError`: synthesizing an arbitrary owner would forge workspace
 * access.
 */
export const resolveDerivedOwner = (householdId: string, evidence: IdentityArchiveEvidence): string => {
  const distinct = (ids: Array<string | null>): string[] => [...new Set(ids.filter((id): id is string => id !== null))];
  const owners = distinct(evidence.memberships.filter((m) => m.role === 'owner').map((m) => resolveAppUser(m.rawUserId, evidence)));
  if (owners.length === 1) return owners[0]!;
  if (owners.length > 1) {
    throw new IdentityError(
      `household '${householdId}' has ${owners.length} distinct archived owners: refusing to pick one`,
    );
  }
  const members = distinct(evidence.memberships.map((m) => resolveAppUser(m.rawUserId, evidence)));
  if (members.length === 1) return members[0]!;
  if (members.length > 1) {
    throw new IdentityError(
      `household '${householdId}' has ${members.length} distinct archived members and no owner: refusing to pick one`,
    );
  }
  const linked = distinct(evidence.linkedUserRefs.map((ref) => resolveAppUser(ref, evidence)));
  if (linked.length === 1) return linked[0]!;
  if (linked.length > 1) {
    throw new IdentityError(
      `household '${householdId}' has ${linked.length} distinct evidenced users and no membership: refusing to pick one`,
    );
  }
  const linkCount =
    evidence.memberships.filter((m) => m.rawUserId !== null && m.rawUserId !== undefined).length +
    evidence.linkedUserRefs.filter((ref) => ref !== null && ref !== undefined).length;
  if (linkCount > 0) {
    throw new IdentityError(
      `household '${householdId}' links ${linkCount} archived user ref(s) but none resolve to a known user: refusing to invent the owner`,
    );
  }
  if (evidence.allUserIds.length === 1 && evidence.allUserIds[0] !== undefined) return evidence.allUserIds[0];
  throw new IdentityError(
    `household '${householdId}' has no evidenced user bind and ${evidence.allUserIds.length} archived users: refusing to invent the owner`,
  );
};

export type AuthRestoreTable = {
  name: string;
  archived: number;
  restored: number;
  status: 'restored' | 'skipped-empty' | 'absent';
};

export type AuthRestoreResult = {
  tables: AuthRestoreTable[];
};

/** Parent-first: session/account REFERENCES "user"(id). */
const AUTH_TABLES = ['user', 'session', 'account', 'verification'] as const;

type Row = Record<string, unknown>;

const quoteIdent = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const tableExists = async (
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }> },
  schema: string,
  table: string,
): Promise<boolean> => {
  const res = await db.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) AS ok`,
    [schema, table],
  );
  return res.rows[0]?.ok === true;
};

const columnNames = async (
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }> },
  schema: string,
  table: string,
): Promise<string[]> => {
  const res = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [schema, table],
  );
  return res.rows.map((row) => String(row.column_name));
};

const tableCount = async (
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }> },
  schema: string,
  table: string,
): Promise<number> => {
  const res = await db.query(`SELECT COUNT(*)::int AS n FROM ${quoteIdent(schema)}.${quoteIdent(table)}`);
  return Number(res.rows[0]?.n ?? 0);
};

/**
 * Copies the Better Auth identity tables from the archive into the fresh
 * canonical schema by target-ordered column intersection (additive
 * migrations like V031/V043 keep both sides shape-compatible; a genuinely
 * divergent legacy shape copies what overlaps and the target NOT NULL
 * columns fail closed naturally instead of silently dropping data).
 * Refuses when a canonical target is not empty: a conflict on a fresh
 * table proves a duplicate batch or a re-execution.
 */
export const restoreAuthIdentity = async (
  pool: DbPool,
  opts: IdentityOptions = {},
): Promise<AuthRestoreResult> => {
  const schema = opts.schema ?? 'public';
  const archiveSchema = opts.archiveSchema ?? ARCHIVE_SCHEMA;
  const env = opts.env ?? process.env;
  if (env.NODE_ENV !== 'production') {
    await requireTestDatabase(pool, 'canonical-converter-identity-auth');
  }
  return withMigrationAdvisoryLock(pool, async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await applyMigrationTimeouts(client);
      const tables: AuthRestoreTable[] = [];
      for (const table of AUTH_TABLES) {
        if (!(await tableExists(client, archiveSchema, table))) {
          tables.push({ name: table, archived: 0, restored: 0, status: 'absent' });
          continue;
        }
        const archived = await tableCount(client, archiveSchema, table);
        if (archived === 0) {
          tables.push({ name: table, archived: 0, restored: 0, status: 'skipped-empty' });
          continue;
        }
        if (!(await tableExists(client, schema, table))) {
          throw new IdentityError(
            `archive holds ${archived} "${table}" row(s) but canonical "${schema}"."${table}" is missing: refusing to drop identities`,
          );
        }
        const targetCount = await tableCount(client, schema, table);
        if (targetCount !== 0) {
          throw new IdentityError(
            `refusing to restore "${table}": canonical target is not empty (${targetCount} rows)`,
          );
        }
        const targetCols = await columnNames(client, schema, table);
        const archiveCols = new Set(await columnNames(client, archiveSchema, table));
        const shared = targetCols.filter((col) => archiveCols.has(col));
        if (shared.length === 0) {
          throw new IdentityError(`archive "${table}" shares no column with its canonical target: refusing to guess the shape`);
        }
        const res = await client.query(
          `INSERT INTO ${quoteIdent(schema)}.${quoteIdent(table)} (${shared.map(quoteIdent).join(', ')}) ` +
            `SELECT ${shared.map(quoteIdent).join(', ')} FROM ${quoteIdent(archiveSchema)}.${quoteIdent(table)}`,
        );
        if ((res.rowCount ?? 0) !== archived) {
          throw new IdentityError(`auth restore count mismatch for "${table}": archived ${archived} but restored ${res.rowCount ?? 0}`);
        }
        tables.push({ name: table, archived, restored: res.rowCount ?? 0, status: 'restored' });
      }
      await client.query('COMMIT');
      return { tables };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback failure; surface the original error
      }
      throw error;
    } finally {
      client.release();
    }
  });
};

/** Financial tables whose `household_id` evidences a workspace (V020 UNION semantics). */
export const IDENTITY_SCOPE_TABLES = [
  'accounts',
  'categories',
  'transactions',
  'statements',
  'card_purchases',
  'accounts_payable',
  'budgets',
  'goals',
  'payable_templates',
  'subscriptions',
  'idempotency_keys',
] as const;

export type IdentityMaterialization = {
  /** Canonical households present after the step. */
  households: number;
  /** Canonical memberships present after the step. */
  memberships: number;
  /** Rows this step derived (never copied 1:1 from the archive). */
  derived: { households: number; memberships: number };
  /** Sorted household ids in scope. */
  householdIds: string[];
  /** Fingerprint of the GO plan that authorized the conversion. */
  authorizedBy: string;
};

const readScopeHouseholds = async (
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }> },
  schema: string,
): Promise<string[]> => {
  const ids = new Set<string>();
  for (const table of IDENTITY_SCOPE_TABLES) {
    if (!(await tableExists(db, schema, table))) continue;
    const cols = await columnNames(db, schema, table);
    if (!cols.includes('household_id')) continue;
    const res = await db.query(
      `SELECT DISTINCT household_id AS id FROM ${quoteIdent(schema)}.${quoteIdent(table)} WHERE household_id IS NOT NULL`,
    );
    for (const row of res.rows) {
      if (typeof row.id === 'string' && row.id.trim() !== '') ids.add(row.id);
    }
  }
  return [...ids].sort();
};

type ArchiveRow = Record<string, unknown>;

/**
 * Derives canonical `households` + owner `memberships` for financial
 * workspaces the archive never materialized. Archived `households` (when
 * present) travel through the M2 import untouched — this step only fills
 * the gaps, one transaction, fail-closed on orphans and ambiguity.
 */
export const materializeIdentity = async (
  pool: DbPool,
  plan: { fingerprint: string },
  opts: IdentityOptions = {},
): Promise<IdentityMaterialization> => {
  const schema = opts.schema ?? 'public';
  const archiveSchema = opts.archiveSchema ?? ARCHIVE_SCHEMA;
  const env = opts.env ?? process.env;
  if (!plan.fingerprint) {
    throw new IdentityError('identity materialization requires the authorizing plan fingerprint');
  }
  if (env.NODE_ENV !== 'production') {
    await requireTestDatabase(pool, 'canonical-converter-identity');
  }
  return withMigrationAdvisoryLock(pool, async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await applyMigrationTimeouts(client);

      const scopeIds = await readScopeHouseholds(client, schema);
      const existingRes = await client.query(`SELECT id FROM ${quoteIdent(schema)}.households`);
      const existing = new Set(existingRes.rows.map((row) => String(row.id)));
      const missing = scopeIds.filter((id) => !existing.has(id));

      // Archive identity evidence (every table optional: a minimal legacy
      // snapshot may hold none of them).
      const readArchive = async (table: string): Promise<ArchiveRow[]> => {
        if (!(await tableExists(client, archiveSchema, table))) return [];
        const res = await client.query(`SELECT * FROM ${quoteIdent(archiveSchema)}.${quoteIdent(table)}`);
        return res.rows as ArchiveRow[];
      };
      const archivedUsers = await readArchive('users');
      const userIds = new Set<string>();
      const userIdByAuthId = new Map<string, string>();
      const allUserIds: string[] = [];
      for (const row of archivedUsers) {
        if (typeof row.id === 'string' && row.id.trim() !== '') {
          userIds.add(row.id);
          allUserIds.push(row.id);
          if (typeof row.auth_user_id === 'string' && row.auth_user_id.trim() !== '') {
            userIdByAuthId.set(row.auth_user_id, row.id);
          }
        }
      }
      const archivedMemberships = await readArchive('memberships');
      const archivedDeviceTokens = await readArchive('device_tokens');
      const archivedOperations = await readArchive('operation_records');

      let derivedHouseholds = 0;
      let derivedMemberships = 0;
      for (const householdId of missing) {
        const memberships = archivedMemberships
          .filter((row) => String(row.household_id ?? '') === householdId)
          .map((row) => ({ rawUserId: row.user_id, role: row.role }));
        const linkedUserRefs: unknown[] = [
          ...archivedDeviceTokens
            .filter((row) => String(row.household_id ?? '') === householdId)
            .map((row) => row.user_id),
          ...archivedOperations
            .filter((row) => String(row.workspace_id ?? '') === householdId)
            .map((row) => row.actor_id),
        ];
        const owner = resolveDerivedOwner(householdId, {
          userIds,
          userIdByAuthId,
          allUserIds,
          memberships,
          linkedUserRefs,
        });
        const ownerPresent = await client.query(
          `SELECT 1 FROM ${quoteIdent(schema)}.users WHERE id = $1`,
          [owner],
        );
        if ((ownerPresent.rowCount ?? 0) !== 1) {
          throw new IdentityError(
            `household '${householdId}' derives owner '${owner}' but canonical users holds no such row: refusing a dangling owner`,
          );
        }
        const beforeRes = await client.query(
          `SELECT COUNT(*)::int AS n FROM ${quoteIdent(schema)}.memberships WHERE household_id = $1`,
          [householdId],
        );
        const before = Number(beforeRes.rows[0]?.n ?? 0);
        await client.query(
          `INSERT INTO ${quoteIdent(schema)}.households (id, name, kind, owner_user_id) VALUES ($1, 'Migrated household', 'shared', $2)`,
          [householdId, owner],
        );
        const afterRes = await client.query(
          `SELECT COUNT(*)::int AS n FROM ${quoteIdent(schema)}.memberships WHERE household_id = $1`,
          [householdId],
        );
        derivedMemberships += Number(afterRes.rows[0]?.n ?? 0) - before;
        derivedHouseholds += 1;
        // The canonical model requires an active owner per shared workspace
        // (deferred `memberships_shared_owner_check`); assert it now with a
        // readable error instead of a commit-time trigger surprise.
        const ownerCheck = await client.query(
          `SELECT 1 FROM ${quoteIdent(schema)}.memberships WHERE household_id = $1 AND role = 'owner' AND status = 'active'`,
          [householdId],
        );
        if ((ownerCheck.rowCount ?? 0) < 1) {
          throw new IdentityError(
            `household '${householdId}' has no active owner membership after derivation: refusing an ownerless workspace`,
          );
        }
      }

      const households = await tableCount(client, schema, 'households');
      const memberships = await tableCount(client, schema, 'memberships');
      await client.query('COMMIT');
      return {
        households,
        memberships,
        derived: { households: derivedHouseholds, memberships: derivedMemberships },
        householdIds: scopeIds,
        authorizedBy: plan.fingerprint,
      };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback failure; surface the original error
      }
      throw error;
    } finally {
      client.release();
    }
  });
};
