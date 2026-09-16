import { describe, expect, it, vi } from 'vitest';
import {
  computeHistoryHash,
  migrateLegacyHistory,
  type LegacyFullExport,
  type LegacyMessage,
} from '../src/migration/legacy-history.js';

const messages: LegacyMessage[] = [
  { id: 'msg-1', actor_id: 'user-a', role: 'user', content_json: JSON.stringify('hello'), created_at: '2026-08-20' },
  { id: 'msg-1:assistant', actor_id: 'agent', role: 'assistant', content_json: JSON.stringify('hi'), created_at: '2026-08-20' },
];

const exportFor = (workspaceId: string): LegacyFullExport => ({
  version: 5,
  workspaceId,
  turns: [],
  messages,
  hasInFlightTurns: false,
});

const createMockSql = () => {
  const memory = new Map<string, Array<Record<string, unknown>>>();
  return {
    memory,
    exec: <T = Record<string, unknown>>(query: string, ...params: unknown[]): Iterable<T> => {
      if (query.includes('CREATE TABLE')) return [] as Iterable<T>;
      if (query.includes('SELECT migration_hash')) {
        const ws = params[0];
        const rows = (memory.get('_history_migration_marker') ?? []).filter((r) => r['workspace_id'] === ws);
        return rows as unknown as Iterable<T>;
      }
      if (query.includes('INSERT INTO _history_migration_marker')) {
        const [workspace_id, migration_hash, imported_count] = params as [string, string, number];
        const rows = memory.get('_history_migration_marker') ?? [];
        const idx = rows.findIndex((r) => r['workspace_id'] === workspace_id);
        const row = { workspace_id, migration_hash, imported_count };
        if (idx >= 0) rows[idx] = row;
        else rows.push(row);
        memory.set('_history_migration_marker', rows);
        return [] as Iterable<T>;
      }
      return [] as Iterable<T>;
    },
  };
};

describe('M-07: hash de migração inclui o workspace', () => {
  it('mesmo transcript em workspaces distintos gera hashes distintos', () => {
    expect(computeHistoryHash(messages, 'ws-a')).not.toBe(computeHistoryHash(messages, 'ws-b'));
    expect(computeHistoryHash(messages, 'ws-a')).toBe(computeHistoryHash(messages, 'ws-a'));
  });

  it('mesmo transcript migra nos dois workspaces sem falso already_migrated', async () => {
    const sqlA = createMockSql();
    const sqlB = createMockSql();
    const persistA = vi.fn(async () => {});
    const persistB = vi.fn(async () => {});

    const resA = await migrateLegacyHistory(exportFor('ws-a'), sqlA, persistA);
    expect(resA.success).toBe(true);
    expect(resA.skipped).toBe(false);
    expect(persistA).toHaveBeenCalledTimes(1);

    const resB = await migrateLegacyHistory(exportFor('ws-b'), sqlB, persistB);
    expect(resB.success).toBe(true);
    expect(resB.skipped).toBe(false);
    expect(persistB).toHaveBeenCalledTimes(1);
  });

  it('segunda migração do mesmo workspace é skipped (sem reimportar)', async () => {
    const sql = createMockSql();
    const persist = vi.fn(async () => {});
    await migrateLegacyHistory(exportFor('ws-a'), sql, persist);
    const again = await migrateLegacyHistory(exportFor('ws-a'), sql, persist);
    expect(again).toMatchObject({ success: true, skipped: true, reason: 'already_migrated' });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('T4.2 (E2): re-import idempotente não duplica mensagens — importedCount estável, persist chamado uma vez', async () => {
    // Idempotency key = migration_hash (sha256 do transcript + workspace, M-07)
    // gravada em _history_migration_marker: o segundo import com o mesmo
    // export retorna skipped sem re-persistir, então nenhuma mensagem duplica.
    const sql = createMockSql();
    const persisted: Array<{ id: string }> = [];
    const persist = vi.fn(async (msgs: Array<{ id: string }>) => {
      persisted.push(...msgs);
    });

    const first = await migrateLegacyHistory(exportFor('ws-a'), sql, persist);
    expect(first).toMatchObject({ success: true, skipped: false });
    expect(first.importedCount).toBe(messages.length);
    expect(persisted.map((m) => m.id)).toEqual(messages.map((m) => m.id));

    const second = await migrateLegacyHistory(exportFor('ws-a'), sql, persist);
    expect(second).toMatchObject({ success: true, skipped: true, reason: 'already_migrated' });
    expect(second.importedCount).toBe(first.importedCount);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persisted).toHaveLength(messages.length);

    const third = await migrateLegacyHistory(exportFor('ws-a'), sql, persist);
    expect(third.skipped).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persisted).toHaveLength(messages.length);
  });

  it('marcador legado (hash sem workspace) não reimporta — reconhece e atualiza', async () => {
    const sql = createMockSql();
    const persist = vi.fn(async () => {});
    const legacyHash = computeHistoryHash(messages);
    sql.memory.set('_history_migration_marker', [
      { workspace_id: 'ws-a', migration_hash: legacyHash, imported_count: 2 },
    ]);

    const res = await migrateLegacyHistory(exportFor('ws-a'), sql, persist);
    expect(res).toMatchObject({ success: true, skipped: true, reason: 'already_migrated' });
    expect(persist).not.toHaveBeenCalled();

    const stored = sql.memory.get('_history_migration_marker')?.[0]?.['migration_hash'];
    expect(stored).toBe(computeHistoryHash(messages, 'ws-a'));
  });
});
