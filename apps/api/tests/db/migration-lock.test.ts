import { describe, expect, it, vi } from 'vitest';
import { expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';
import { runMigrations } from '../../src/read-models/sql/migrate.js';

/** Fake pool: serves the migrations bookkeeping in-memory, records SQL order. */
const fakePool = (appliedVersions: number[]) => {
  const log: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      log.push(sql);
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
      if (sql.includes('pg_advisory_unlock')) return { rows: [{ unlocked: true }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = {
    query: vi.fn(async (sql: string) => {
      log.push(sql);
      if (sql.includes('FROM _migrations')) {
        return { rows: appliedVersions.map((version) => ({ version, name: `V${version}__x.sql`, checksum: '' })) };
      }
      return { rows: [] };
    }),
    connect: vi.fn(async () => client),
  };
  return { pool, log, client };
};

describe('runMigrations global advisory lock (V4.1 Phase 8, task 8.6)', () => {
  it('acquires the lock before the first migration step and releases it after', async () => {
    // Mark every manifest version applied (empty checksum → backfill path,
    // no real SQL executed) so the fake pool never runs migration bodies.
    const manifest = expectedMigrationManifest(false);
    const { pool, log, client } = fakePool(manifest.map((m) => m.version));

    const result = await runMigrations(pool as never, false);
    expect(result).toEqual({ applied: [] });

    const lockIdx = log.findIndex((sql) => sql.includes('pg_try_advisory_lock'));
    const firstBookkeepingIdx = log.findIndex((sql) => sql.includes('_migrations'));
    const unlockIdx = log.findIndex((sql) => sql.includes('pg_advisory_unlock'));
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(firstBookkeepingIdx).toBeGreaterThan(lockIdx);
    expect(unlockIdx).toBeGreaterThan(firstBookkeepingIdx);
    expect(unlockIdx).toBe(log.length - 1);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('fails closed when another migrator owns the lock (nothing runs)', async () => {
    const { pool, log } = fakePool([]);
    // Force lock contention: first connect claims locked=false.
    (pool.connect as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      query: vi.fn(async (sql: string) => {
        log.push(sql);
        return { rows: [{ locked: false }] };
      }),
      release: vi.fn(),
    });
    await expect(runMigrations(pool as never, false)).rejects.toThrow(/in progress/i);
    expect(log.some((sql) => sql.includes('_migrations'))).toBe(false);
  });
});
