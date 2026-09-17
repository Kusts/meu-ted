import { describe, expect, it, afterEach } from 'vitest';
import {
  DEFAULT_LOCK_TIMEOUT_MILLIS,
  DEFAULT_MIGRATION_LOCK_TIMEOUT_MILLIS,
  DEFAULT_MIGRATION_STATEMENT_TIMEOUT_MILLIS,
  DEFAULT_STATEMENT_TIMEOUT_MILLIS,
  applyMigrationTimeouts,
  createMigrationPool,
  migrationTimeoutStatements,
  resolveMigrationTimeouts,
  resolvePoolTimeouts,
} from '../../src/db/pool.js';
import {
  expectedMigrationManifest as manifest,
  runMigrations,
} from '../../src/read-models/sql/migrate.js';
import type { DbPool } from '../../src/db/pool.js';

const MIGRATION_ENVS = [
  'PI_DB_MIGRATION_STATEMENT_TIMEOUT_MS',
  'PI_DB_MIGRATION_LOCK_TIMEOUT_MS',
  'PI_DB_STATEMENT_TIMEOUT_MS',
  'PI_DB_LOCK_TIMEOUT_MS',
];

const savedEnv = { ...process.env };
afterEach(() => {
  for (const key of MIGRATION_ENVS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('migration statement_timeout override (DEBT-CODER-INFRA)', () => {
  it('keeps the API runtime default at 30s statement / 10s lock', () => {
    expect(DEFAULT_STATEMENT_TIMEOUT_MILLIS).toBe(30_000);
    expect(DEFAULT_LOCK_TIMEOUT_MILLIS).toBe(10_000);
    const t = resolvePoolTimeouts({ connectionString: 'postgres://localhost/x' }, {});
    expect(t.statementTimeoutMillis).toBe(30_000);
    expect(t.lockTimeoutMillis).toBe(10_000);
  });

  it('resolves generous migration defaults, env-overridable, decoupled from the API default', () => {
    expect(DEFAULT_MIGRATION_STATEMENT_TIMEOUT_MILLIS).toBe(600_000);
    expect(DEFAULT_MIGRATION_LOCK_TIMEOUT_MILLIS).toBe(60_000);
    // A tight API-wide default must NOT leak into migrations.
    const decoupled = resolveMigrationTimeouts({}, { PI_DB_STATEMENT_TIMEOUT_MS: '5000' });
    expect(decoupled.statementTimeoutMillis).toBe(600_000);
    const fromEnv = resolveMigrationTimeouts(
      {},
      {
        PI_DB_MIGRATION_STATEMENT_TIMEOUT_MS: '120000',
        PI_DB_MIGRATION_LOCK_TIMEOUT_MS: '20000',
      },
    );
    expect(fromEnv).toEqual({ statementTimeoutMillis: 120_000, lockTimeoutMillis: 20_000 });
    const explicit = resolveMigrationTimeouts(
      { statementTimeoutMillis: 42_000 },
      { PI_DB_MIGRATION_STATEMENT_TIMEOUT_MS: '120000' },
    );
    expect(explicit.statementTimeoutMillis).toBe(42_000);
  });

  it('emits transaction-scoped SET LOCAL statements for migrations', () => {
    const statements = migrationTimeoutStatements({
      statementTimeoutMillis: 600_000,
      lockTimeoutMillis: 60_000,
    });
    expect(statements).toEqual([
      'SET LOCAL statement_timeout = 600000',
      'SET LOCAL lock_timeout = 60000',
    ]);
  });

  it('createMigrationPool wires the migration timeouts into session SETs', async () => {
    const pool = createMigrationPool({ connectionString: 'postgres://localhost/x' }, {});
    try {
      const queries: string[] = [];
      (pool as unknown as { emit: (event: string, client: unknown) => void }).emit('connect', {
        query: async (sql: string) => {
          queries.push(sql);
          return { rows: [] };
        },
      });
      await new Promise((resolve) => setImmediate(resolve));
      const joined = queries.join(';');
      expect(joined).toContain('statement_timeout = 600000');
      expect(joined).toContain('lock_timeout = 60000');
    } finally {
      await pool.end().catch(() => undefined);
    }
  });

  it('applyMigrationTimeouts issues SET LOCAL on a migration client (fake client capture)', async () => {
    const queries: string[] = [];
    const fakeClient = { query: async (sql: string) => { queries.push(sql); return { rows: [] }; } };
    await applyMigrationTimeouts(fakeClient, {}, {});
    expect(queries).toEqual([
      'SET LOCAL statement_timeout = 600000',
      'SET LOCAL lock_timeout = 60000',
    ]);
  });

  it('runMigrations applies the override inside each migration transaction (fake pool capture)', async () => {
    const fullManifest = manifest(false);
    expect(fullManifest.length).toBeGreaterThan(1);
    const appliedRows = fullManifest.slice(0, -1).map((m) => ({ ...m }));
    const last = fullManifest[fullManifest.length - 1];

    const poolQueries: string[] = [];
    const clientQueries: string[] = [];
    const fakeClient = {
      query: async (sql: string) => { clientQueries.push(sql); return { rows: [] }; },
      release: () => undefined,
    };
    const fakePool = {
      query: async (sql: string) => {
        poolQueries.push(sql);
        if (/FROM _migrations/.test(sql)) return { rows: appliedRows };
        return { rows: [] };
      },
      connect: async () => fakeClient,
    } as unknown as DbPool;

    const result = await runMigrations(fakePool, false, { withLock: false });
    expect(result).toEqual({ applied: [last.version] });
    expect(clientQueries[0]).toBe('BEGIN');
    expect(clientQueries).toContain('SET LOCAL statement_timeout = 600000');
    expect(clientQueries).toContain('SET LOCAL lock_timeout = 60000');
    // Override lands before the migration body, inside the same transaction.
    const setIdx = clientQueries.indexOf('SET LOCAL statement_timeout = 600000');
    const beginIdx = clientQueries.indexOf('BEGIN');
    const commitIdx = clientQueries.indexOf('COMMIT');
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(setIdx).toBeGreaterThan(beginIdx);
    expect(commitIdx).toBeGreaterThan(setIdx);
  });
});
