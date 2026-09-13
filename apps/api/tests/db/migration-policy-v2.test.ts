import { describe, expect, it, vi } from 'vitest';
import { withMigrationAdvisoryLock } from '../../src/scripts/migration-job-policy.js';

describe('T4.1 migration job concurrency policy', () => {
  it('runs one holder and rejects a concurrent holder without applying migrations', async () => {
    const release = vi.fn();
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({ rows: [{ unlocked: true }] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release }) } as never;

    await expect(withMigrationAdvisoryLock(pool, async () => 'applied')).resolves.toBe('applied');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_try_advisory_lock'));
    expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_unlock'));
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('fails closed when another migration job owns the lock', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ locked: false }] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as never;
    await expect(withMigrationAdvisoryLock(pool, async () => 'must-not-run')).rejects.toThrow(/in progress/i);
  });
});
