/**
 * M2 canonical converter: per-entity import orchestrator (I/O layer).
 *
 * Reads rows from `legacy_archive.<table>` (populated by M1
 * archive-and-bootstrap), maps them with the pure mappers in
 * `./mapping.js`, and writes them into the fresh canonical `public`
 * tables. One transaction per entity with the migration timeout budget
 * (600s statement / 60s lock); any failure rolls that entity back and
 * aborts the whole import fail-closed.
 *
 * Fail-closed preconditions (checked before the first write):
 * - backup gate satisfied (`BACKUP_CONFIRMED=true` + `BACKUP_ID`);
 * - `public._conversion_marker` completed for the SAME backup id;
 * - `opts.planFingerprint` equals the marker's `plan_fingerprint` — the
 *   marker is only written when the plan was GO, so fingerprint equality
 *   is the proof that the authorizing plan had no blockers;
 * - every canonical target table is EMPTY (post-bootstrap fresh state):
 *   any row present means a re-run or a foreign write -> refuse.
 *
 * No `ON CONFLICT DO NOTHING`: a conflict on an empty table proves a
 * duplicate inside the import batch (or a re-execution) and must fail.
 * Balances are NOT computed here (`balance_cents` lands 0, M3 owns the
 * recomputation); `audit_logs` is NOT imported (stays in the archive).
 */

import { createHash } from 'node:crypto';
import type { DbPool } from '../../db/pool.js';
import { applyMigrationTimeouts } from '../../db/pool.js';
import { requireTestDatabase } from '../../db/db-guard.js';
import { isBackupGateSatisfied, withMigrationAdvisoryLock } from '../migration-job-policy.js';
import {
  ARCHIVE_SCHEMA,
  CONVERSION_MARKER_TABLE,
  isCompletedState,
} from './archive-and-bootstrap.js';
import {
  mapAccountRow,
  mapCardPurchaseRow,
  mapCategoryRow,
  mapCopyThroughRow,
  mapDeviceTokenRow,
  mapInviteRow,
  mapMembershipRow,
  mapTransactionRow,
  mapUserRow,
  MappingError,
  type IdentityResolution,
  type LegacyRow,
  type MappedRow,
} from './mapping.js';

export type EntityImportStatus = 'imported' | 'skipped';

export type EntityImportResult = {
  name: string;
  legacyCount: number;
  importedCount: number;
  equivalenceHash: string;
  /** unmapped legacy field -> number of rows carrying it. */
  unmappedFields: Record<string, number>;
  status: EntityImportStatus;
};

export type CanonicalImportResult = {
  entities: EntityImportResult[];
  durationMs: number;
};

export type CanonicalImportOptions = {
  schema?: string;
  archiveSchema?: string;
  env?: Record<string, string | undefined>;
  /**
   * Fingerprint of the GO plan that authorized the bootstrap. Must equal
   * the marker's stored fingerprint, otherwise the import refuses to run.
   */
  planFingerprint: string;
};

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
};

const quoteIdent = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`);
  return `{${entries.join(',')}}`;
};

export const hashMappedRows = (rows: Array<Record<string, unknown>>): string => {
  const ordered = rows.map(stableStringify).sort();
  return createHash('sha256').update(`[${ordered.join(',')}]`, 'utf8').digest('hex');
};

type EntityMapper = (rows: LegacyRow[], ctx: IdentityResolution) => MappedRow[];

type EntityCheck = {
  sql: string;
  params?: unknown[];
  code: string;
};

type EntitySpec = {
  name: string;
  mapper: EntityMapper;
  /** Canonical columns accepted; anything mapped outside this set fails. */
  targetColumns: readonly string[];
  scopeKeys?: readonly string[];
  checks?: EntityCheck[];
  /**
   * Triggers to DISABLE for the entity transaction (re-enabled before
   * COMMIT, so a rollback restores them too). Reserved for application
   * invariants that synthesize rows on live writes and would corrupt a
   * faithful copy — see the households spec below.
   */
  disableTriggers?: readonly string[];
};

const copyThrough = (
  entity: string,
  targetColumns: readonly string[],
  scopeKeys?: readonly string[],
): EntityMapper => (rows) => rows.map((row) => mapCopyThroughRow(row, { entity, targetColumns, scopeKeys }));

const HOUSEHOLDS_COLUMNS = ['id', 'name', 'kind', 'created_at', 'owner_user_id', 'status', 'archived_at'] as const;
const USERS_COLUMNS = ['id', 'auth_user_id', 'email', 'name', 'status', 'created_at', 'phone'] as const;
const ACCOUNTS_COLUMNS = [
  'id',
  'household_id',
  'name',
  'kind',
  'balance_cents',
  // M4: the legacy anchor travels with the row (V058 column); the stored
  // balance still lands 0 and M3 recomputes it from anchor + ledger.
  'initial_balance_cents',
  'status',
  'created_at',
  'updated_at',
  'deleted_at',
  'credit_limit_cents',
  'closing_day',
  'due_day',
] as const;
const CATEGORIES_COLUMNS = [
  'id',
  'household_id',
  'name',
  'kind',
  'status',
  'created_at',
  'updated_at',
  'deleted_at',
  'parent_id',
  'icon',
  'color',
  'sort_order',
  'is_default',
  'is_system',
] as const;
const STATEMENTS_COLUMNS = [
  'id',
  'household_id',
  'account_id',
  'cycle_year_month',
  'closing_date',
  'due_date',
  'total_cents',
  'paid_cents',
  'status',
  'created_at',
  'updated_at',
] as const;
const TRANSACTIONS_COLUMNS = [
  'id',
  'household_id',
  'kind',
  'description',
  'amount_cents',
  'date',
  'account_id',
  'category_id',
  'transfer_to_account_id',
  'created_at',
  'updated_at',
  'deleted_at',
  'installments_total',
  'installment_number',
  'statement_id',
  'subcategory_id',
  'notes',
] as const;
const CARD_PURCHASES_COLUMNS = [
  'id',
  'household_id',
  'account_id',
  'statement_id',
  'description',
  'amount_cents',
  'date',
  'category_id',
  'installments_total',
  'installment_number',
  'is_recurring',
  'created_at',
  'updated_at',
  'transaction_id',
  'deleted_at',
  'subcategory_id',
  'notes',
] as const;
const PAYABLES_COLUMNS = [
  'id',
  'household_id',
  'account_id',
  'description',
  'amount_cents',
  'due_date',
  'type',
  'frequency',
  'end_date',
  'status',
  'paid_date',
  'paid_amount_cents',
  'reminder_days_before',
  'notes',
  'category_id',
  'created_at',
  'updated_at',
  'deleted_at',
  'paid_transaction_id',
] as const;
const BUDGETS_COLUMNS = [
  'id',
  'household_id',
  'category_id',
  'name',
  'amount_cents',
  'period',
  'start_date',
  'end_date',
  'alert_threshold',
  'rollover',
  'created_at',
  'updated_at',
] as const;
const GOALS_COLUMNS = [
  'id',
  'household_id',
  'name',
  'description',
  'goal_type',
  'target_amount_cents',
  'current_amount_cents',
  'start_date',
  'target_date',
  'category_id',
  'account_id',
  'status',
  'notes',
  'created_at',
  'updated_at',
] as const;
const GOAL_CONTRIBUTIONS_COLUMNS = [
  'id',
  'goal_id',
  'amount_cents',
  'contribution_date',
  'source',
  'notes',
  'created_at',
] as const;
const PAYABLE_TEMPLATES_COLUMNS = [
  'id',
  'household_id',
  'account_id',
  'name',
  'description',
  'amount_cents',
  'frequency',
  'day_of_month',
  'reminder_days_before',
  'notes',
  'active',
  'created_at',
  'updated_at',
] as const;
const NOTIFICATION_CONFIGS_COLUMNS = [
  'id',
  'household_id',
  'chat_id',
  'notification_type',
  'enabled',
  'schedule_hour',
  'schedule_minute',
  'days_of_week',
  'threshold_days',
  'created_at',
  'updated_at',
  'timezone',
  'schedule_window_minutes',
  'last_run_at',
  'last_success_at',
  'last_failure_at',
  'last_run_status',
  'last_sent_count',
  'last_removed_count',
  'last_error',
] as const;
const SUBSCRIPTIONS_COLUMNS = [
  'id',
  'household_id',
  'name',
  'amount_cents',
  'cycle',
  'day',
  'payment_method',
  'status',
  'created_at',
  'updated_at',
  'cancelled_at',
  'deleted_at',
] as const;
const IDEMPOTENCY_KEYS_COLUMNS = ['household_id', 'key', 'payload_hash', 'response', 'created_at'] as const;
const DEVICE_TOKENS_COLUMNS = [
  'token',
  'device_id',
  'household_id',
  'created_at',
  'revoked_at',
  'token_hash',
  'user_id',
  'name',
  'last_used_at',
  'expires_at',
  'legacy',
] as const;
const OPERATION_RECORDS_COLUMNS = [
  'id',
  'workspace_id',
  'actor_id',
  'operation',
  'idempotency_key',
  'payload_hash',
  'status',
  'response',
  'effect_ref',
  'lease_until',
  'retry_until',
  'retention_until',
  'created_at',
  'completed_at',
  'actor_type',
] as const;
const MEMBERSHIPS_COLUMNS = ['user_id', 'household_id', 'role', 'status', 'kind', 'created_at'] as const;
const INVITES_COLUMNS = [
  'id',
  'household_id',
  'email',
  'email_normalized',
  'role',
  'token_hash',
  'expires_at',
  'consumed_at',
  'invited_by',
  'created_at',
  'revoked_at',
] as const;

const NULL_UUID = '00000000-0000-0000-0000-000000000000';

/** FK-safe import order: parents before children. */
export const IMPORT_ORDER: EntitySpec[] = [
  // users before households: households.owner_user_id REFERENCES users(id).
  { name: 'users', mapper: (rows) => rows.map(mapUserRow), targetColumns: USERS_COLUMNS },
  {
    name: 'households',
    mapper: copyThrough('households', HOUSEHOLDS_COLUMNS, []),
    targetColumns: HOUSEHOLDS_COLUMNS,
    // The canonical AFTER INSERT creator triggers synthesize an owner
    // membership on every live household write. During a faithful copy
    // that synthesis would plant a duplicate row that the memberships
    // step must then refuse (no ON CONFLICT by design), so both creators
    // stay disabled inside the households transaction only.
    disableTriggers: ['households_shared_membership_creator', 'households_personal_membership_creator'],
  },
  {
    name: 'memberships',
    mapper: (rows, ctx) => rows.map((row) => mapMembershipRow(row, ctx)),
    targetColumns: MEMBERSHIPS_COLUMNS,
    checks: [
      {
        code: 'duplicate_memberships',
        sql: `SELECT COUNT(*)::int AS n FROM (SELECT user_id, household_id FROM __ARCHIVE__.memberships GROUP BY user_id, household_id HAVING COUNT(*) > 1) dups`,
      },
    ],
  },
  {
    name: 'invites',
    mapper: (rows, ctx) => rows.map((row) => mapInviteRow(row, ctx)),
    targetColumns: INVITES_COLUMNS,
    checks: [
      {
        code: 'duplicate_invite_token',
        sql: `SELECT COUNT(*)::int AS n FROM (SELECT token_hash FROM __ARCHIVE__.invites GROUP BY token_hash HAVING COUNT(*) > 1) dups`,
      },
    ],
  },
  { name: 'accounts', mapper: (rows) => rows.map(mapAccountRow), targetColumns: ACCOUNTS_COLUMNS },
  {
    name: 'categories',
    mapper: (rows) => rows.map(mapCategoryRow),
    targetColumns: CATEGORIES_COLUMNS,
    checks: [
      {
        code: 'duplicate_categories',
        sql: `SELECT COUNT(*)::int AS n FROM (SELECT household_id, kind, COALESCE(parent_id, '${NULL_UUID}'::uuid), lower(name) FROM __ARCHIVE__.categories GROUP BY household_id, kind, COALESCE(parent_id, '${NULL_UUID}'::uuid), lower(name) HAVING COUNT(*) > 1) dups`,
      },
    ],
  },
  {
    name: 'statements',
    mapper: copyThrough('statements', STATEMENTS_COLUMNS),
    targetColumns: STATEMENTS_COLUMNS,
    checks: [
      {
        code: 'duplicate_statements',
        sql: `SELECT COUNT(*)::int AS n FROM (SELECT household_id, account_id, cycle_year_month FROM __ARCHIVE__.statements GROUP BY household_id, account_id, cycle_year_month HAVING COUNT(*) > 1) dups`,
        // V047 UNIQUE scope; duplicates would violate the canonical index.
      },
      {
        code: 'orphan_statement_accounts',
        sql: `SELECT COUNT(*)::int AS n FROM __ARCHIVE__.statements s LEFT JOIN __TARGET__.accounts a ON a.id = s.account_id AND a.household_id = s.household_id WHERE a.id IS NULL`,
      },
    ],
  },
  {
    name: 'transactions',
    mapper: (rows) => rows.map(mapTransactionRow),
    targetColumns: TRANSACTIONS_COLUMNS,
    checks: [
      {
        code: 'orphan_transaction_accounts',
        sql: `SELECT COUNT(*)::int AS n FROM __ARCHIVE__.transactions t WHERE (t.kind = 'expense' AND NOT EXISTS (SELECT 1 FROM __TARGET__.accounts a WHERE a.id = t.from_account_id AND a.household_id = t.household_id)) OR (t.kind = 'income' AND NOT EXISTS (SELECT 1 FROM __TARGET__.accounts a WHERE a.id = t.to_account_id AND a.household_id = t.household_id)) OR (t.kind = 'transfer' AND (NOT EXISTS (SELECT 1 FROM __TARGET__.accounts a WHERE a.id = t.from_account_id AND a.household_id = t.household_id) OR NOT EXISTS (SELECT 1 FROM __TARGET__.accounts a WHERE a.id = t.to_account_id AND a.household_id = t.household_id)))`,
      },
    ],
  },
  {
    name: 'card_purchases',
    mapper: (rows) => rows.map(mapCardPurchaseRow),
    targetColumns: CARD_PURCHASES_COLUMNS,
    checks: [
      {
        code: 'orphan_card_purchase_transactions',
        sql: `SELECT COUNT(*)::int AS n FROM __ARCHIVE__.card_purchases cp LEFT JOIN __TARGET__.transactions t ON t.id = cp.transaction_id AND t.household_id = cp.household_id WHERE cp.transaction_id IS NOT NULL AND t.id IS NULL`,
      },
      {
        code: 'orphan_card_purchase_statements',
        sql: `SELECT COUNT(*)::int AS n FROM __ARCHIVE__.card_purchases cp LEFT JOIN __TARGET__.statements s ON s.id = cp.statement_id AND s.household_id = cp.household_id WHERE s.id IS NULL`,
      },
    ],
  },
  {
    name: 'accounts_payable',
    mapper: copyThrough('accounts_payable', PAYABLES_COLUMNS),
    targetColumns: PAYABLES_COLUMNS,
    checks: [
      {
        code: 'orphan_payable_accounts',
        sql: `SELECT COUNT(*)::int AS n FROM __ARCHIVE__.accounts_payable p LEFT JOIN __TARGET__.accounts a ON a.id = p.account_id AND a.household_id = p.household_id WHERE a.id IS NULL`,
      },
    ],
  },
  {
    name: 'budgets',
    mapper: copyThrough('budgets', BUDGETS_COLUMNS),
    targetColumns: BUDGETS_COLUMNS,
    checks: [
      {
        code: 'orphan_budget_categories',
        sql: `SELECT COUNT(*)::int AS n FROM __ARCHIVE__.budgets b LEFT JOIN __TARGET__.categories c ON c.id = b.category_id AND c.household_id = b.household_id WHERE b.category_id IS NOT NULL AND c.id IS NULL`,
      },
    ],
  },
  {
    name: 'goals',
    mapper: copyThrough('goals', GOALS_COLUMNS),
    targetColumns: GOALS_COLUMNS,
  },
  {
    name: 'goal_contributions',
    mapper: copyThrough('goal_contributions', GOAL_CONTRIBUTIONS_COLUMNS, ['goal_id']),
    targetColumns: GOAL_CONTRIBUTIONS_COLUMNS,
    checks: [
      {
        code: 'orphan_goal_contributions',
        sql: `SELECT COUNT(*)::int AS n FROM __ARCHIVE__.goal_contributions gc LEFT JOIN __TARGET__.goals g ON g.id = gc.goal_id WHERE g.id IS NULL`,
      },
    ],
  },
  {
    name: 'payable_templates',
    mapper: copyThrough('payable_templates', PAYABLE_TEMPLATES_COLUMNS),
    targetColumns: PAYABLE_TEMPLATES_COLUMNS,
    checks: [
      {
        code: 'orphan_payable_template_accounts',
        sql: `SELECT COUNT(*)::int AS n FROM __ARCHIVE__.payable_templates p LEFT JOIN __TARGET__.accounts a ON a.id = p.account_id AND a.household_id = p.household_id WHERE p.account_id IS NOT NULL AND a.id IS NULL`,
      },
    ],
  },
  {
    name: 'notification_configs',
    mapper: copyThrough('notification_configs', NOTIFICATION_CONFIGS_COLUMNS),
    targetColumns: NOTIFICATION_CONFIGS_COLUMNS,
  },
  {
    name: 'subscriptions',
    mapper: copyThrough('subscriptions', SUBSCRIPTIONS_COLUMNS),
    targetColumns: SUBSCRIPTIONS_COLUMNS,
  },
  {
    name: 'idempotency_keys',
    mapper: copyThrough('idempotency_keys', IDEMPOTENCY_KEYS_COLUMNS),
    targetColumns: IDEMPOTENCY_KEYS_COLUMNS,
  },
  {
    name: 'device_tokens',
    mapper: (rows) => rows.map(mapDeviceTokenRow),
    targetColumns: DEVICE_TOKENS_COLUMNS,
  },
  {
    name: 'operation_records',
    mapper: copyThrough('operation_records', OPERATION_RECORDS_COLUMNS, ['workspace_id']),
    targetColumns: OPERATION_RECORDS_COLUMNS,
  },
];

type ColumnInfo = { nullable: boolean; hasDefault: boolean };

const readTargetColumns = async (db: Queryable, schema: string, table: string): Promise<Map<string, ColumnInfo>> => {
  const res = await db.query(
    `SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  );
  const map = new Map<string, ColumnInfo>();
  for (const row of res.rows) {
    map.set(String(row.column_name), {
      nullable: String(row.is_nullable) !== 'NO',
      hasDefault: row.column_default !== null && row.column_default !== undefined,
    });
  }
  return map;
};

const tableExistsIn = async (db: Queryable, schema: string, table: string): Promise<boolean> => {
  const res = await db.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) AS ok`,
    [schema, table],
  );
  return res.rows[0]?.ok === true;
};

const tableCount = async (db: Queryable, schema: string, table: string): Promise<number> => {
  const res = await db.query(`SELECT COUNT(*)::int AS n FROM ${quoteIdent(schema)}.${quoteIdent(table)}`);
  return Number(res.rows[0]?.n ?? 0);
};

/**
 * FINDING-5: audit-table counter. Query errors (permissions, broken
 * table) propagate instead of being swallowed as 0. Zero is returned
 * ONLY when the catalog proves the table is absent
 * (`to_regclass('schema.table') IS NULL`) — e.g. a minimal legacy
 * snapshot whose archive never had `audit_logs`.
 */
const countAuditTable = async (db: Queryable, schema: string, table: string): Promise<number> => {
  const probe = await db.query(`SELECT to_regclass($1) IS NULL AS missing`, [`${schema}.${table}`]);
  if ((probe.rows[0] as Record<string, unknown> | undefined)?.missing === true) return 0;
  return tableCount(db, schema, table);
};

const readArchiveRows = async (db: Queryable, archiveSchema: string, table: string): Promise<LegacyRow[]> => {
  const exists = await db.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) AS ok`,
    [archiveSchema, table],
  );
  if (exists.rows[0]?.ok !== true) return [];
  const res = await db.query(`SELECT * FROM ${quoteIdent(archiveSchema)}.${quoteIdent(table)}`);
  return res.rows as LegacyRow[];
};

const buildIdentityResolution = async (db: Queryable, archiveSchema: string): Promise<IdentityResolution> => {
  const users = await readArchiveRows(db, archiveSchema, 'users');
  const userIds = new Set<string>();
  const userIdByAuthId = new Map<string, string>();
  for (const row of users) {
    const id = row['id'];
    if (typeof id === 'string') userIds.add(id);
    const authId = row['auth_user_id'];
    if (typeof authId === 'string' && typeof id === 'string') userIdByAuthId.set(authId, id);
  }
  return { userIds, userIdByAuthId };
};

const importEntity = async (
  client: Queryable,
  spec: EntitySpec,
  ctx: IdentityResolution,
  schema: string,
  archiveSchema: string,
): Promise<EntityImportResult> => {
  const targetCols = await readTargetColumns(client, schema, spec.name);
  if (targetCols.size === 0) {
    throw new MappingError(spec.name, `canonical target table "${schema}.${spec.name}" is missing`);
  }
  const targetCount = await tableCount(client, schema, spec.name);
  if (targetCount !== 0) {
    throw new Error(
      `refusing to import ${spec.name}: target "${schema}.${spec.name}" is not empty (${targetCount} rows)`,
    );
  }
  // A minimal legacy snapshot may lack the entity table entirely (M4:
  // households never materialized, ancillary tables never created). Absent
  // entity == empty entity (readArchiveRows below agrees), so its checks
  // pass vacuously. The existence probe runs BEFORE the checks: probing
  // inside a catch would query on an aborted transaction.
  const archivePresent = await tableExistsIn(client, archiveSchema, spec.name);
  if (archivePresent) {
    for (const check of spec.checks ?? []) {
      const sql = check.sql
        .replaceAll('__ARCHIVE__', quoteIdent(archiveSchema))
        .replaceAll('__TARGET__', quoteIdent(schema));
      const res = await client.query(sql, check.params ?? []);
      if (Number(res.rows[0]?.n ?? 0) > 0) {
        throw new Error(
          `refusing to import ${spec.name}: pre-write check '${check.code}' found ${String(res.rows[0]?.n)} blocking rows`,
        );
      }
    }
  }
  const legacyRows = await readArchiveRows(client, archiveSchema, spec.name);
  for (const trigger of spec.disableTriggers ?? []) {
    await client.query(
      `ALTER TABLE ${quoteIdent(schema)}.${quoteIdent(spec.name)} DISABLE TRIGGER ${quoteIdent(trigger)}`,
    );
  }
  const mapped = spec.mapper(legacyRows, ctx);
  const allowed = new Set(spec.targetColumns);
  for (const row of mapped) {
    for (const key of Object.keys(row.values)) {
      if (!allowed.has(key) || !targetCols.has(key)) {
        throw new MappingError(spec.name, `mapped column '${key}' has no canonical destination`);
      }
    }
    for (const [column, info] of targetCols) {
      if (!(column in row.values) && !info.nullable && !info.hasDefault) {
        throw new MappingError(spec.name, `missing required canonical column '${column}'`);
      }
    }
  }
  for (const row of mapped) {
    const columns = Object.keys(row.values).sort();
    if (columns.length === 0) {
      throw new MappingError(spec.name, 'mapped row carries no canonical columns');
    }
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    await client.query(
      `INSERT INTO ${quoteIdent(schema)}.${quoteIdent(spec.name)} (${columns.map(quoteIdent).join(', ')}) VALUES (${placeholders.join(', ')})`,
      columns.map((c) => row.values[c]),
    );
  }
  const importedCount = await tableCount(client, schema, spec.name);
  if (importedCount !== mapped.length) {
    throw new Error(
      `import count mismatch for ${spec.name}: mapped ${mapped.length} but target holds ${importedCount}`,
    );
  }
  for (const trigger of spec.disableTriggers ?? []) {
    await client.query(
      `ALTER TABLE ${quoteIdent(schema)}.${quoteIdent(spec.name)} ENABLE TRIGGER ${quoteIdent(trigger)}`,
    );
  }
  const unmappedFields: Record<string, number> = {};
  for (const row of mapped) {
    for (const field of Object.keys(row.unmapped)) {
      unmappedFields[field] = (unmappedFields[field] ?? 0) + 1;
    }
  }
  return {
    name: spec.name,
    legacyCount: legacyRows.length,
    importedCount,
    equivalenceHash: hashMappedRows(mapped.map((row) => row.values)),
    unmappedFields,
    status: 'imported',
  };
};

const readMarkerState = async (
  db: Queryable,
  schema: string,
): Promise<{ backupId: string; state: string; planFingerprint: string } | null> => {
  try {
    const res = await db.query(
      `SELECT backup_id, state, plan_fingerprint FROM ${quoteIdent(schema)}.${quoteIdent(CONVERSION_MARKER_TABLE)} ORDER BY id DESC LIMIT 1`,
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      backupId: String(row.backup_id),
      state: String(row.state),
      planFingerprint: String(row.plan_fingerprint ?? ''),
    };
  } catch (error) {
    if ((error as { code?: string }).code === '42P01') return null;
    throw error;
  }
};

export const runCanonicalImport = async (
  pool: DbPool,
  opts: CanonicalImportOptions,
): Promise<CanonicalImportResult> => {
  const schema = opts.schema ?? 'public';
  const archiveSchema = opts.archiveSchema ?? ARCHIVE_SCHEMA;
  const env = opts.env ?? process.env;
  const startedAt = Date.now();
  if (!isBackupGateSatisfied(env)) {
    throw new Error('canonical import backup gate not satisfied: BACKUP_CONFIRMED=true and BACKUP_ID are required');
  }
  const backupId = env.BACKUP_ID?.trim() ?? '';
  if (!opts.planFingerprint) {
    throw new Error('canonical import requires the authorizing plan fingerprint (refusing to run without it)');
  }
  if (env.NODE_ENV !== 'production') {
    await requireTestDatabase(pool, 'canonical-converter-import');
  }

  return withMigrationAdvisoryLock(pool, async () => {
    const marker = await readMarkerState(pool, schema);
    if (!marker || !isCompletedState(marker.state)) {
      throw new Error(
        'canonical import requires a completed bootstrap marker (run archive-and-bootstrap first)',
      );
    }
    if (marker.backupId !== backupId) {
      throw new Error(
        `canonical import backup mismatch: marker records '${marker.backupId}' but BACKUP_ID is '${backupId}'`,
      );
    }
    if (marker.planFingerprint !== opts.planFingerprint) {
      throw new Error('canonical import plan fingerprint mismatch: refusing to import under a different plan');
    }

    const ctx = await buildIdentityResolution(pool, archiveSchema);
    const entities: EntityImportResult[] = [];
    for (const spec of IMPORT_ORDER) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await applyMigrationTimeouts(client);
        entities.push(await importEntity(client, spec, ctx, schema, archiveSchema));
        await client.query('COMMIT');
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
    }

    // audit_logs is intentionally never imported (retained in the archive).
    const archivedAudits = await countAuditTable(pool, archiveSchema, 'audit_logs');
    const canonicalAudits = await countAuditTable(pool, schema, 'audit_logs');
    if (canonicalAudits !== 0) {
      throw new Error(`refusing to finish import: canonical audit_logs holds ${canonicalAudits} rows`);
    }
    entities.push({
      name: 'audit_logs',
      legacyCount: archivedAudits,
      importedCount: 0,
      equivalenceHash: hashMappedRows([]),
      unmappedFields: {},
      status: 'skipped',
    });

    return { entities, durationMs: Date.now() - startedAt };
  });
};
