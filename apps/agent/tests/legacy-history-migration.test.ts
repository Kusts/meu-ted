import { describe, expect, it } from 'vitest';
import {
  transformLegacyMessages,
  computeHistoryHash,
  migrateLegacyHistory,
  type LegacyFullExport,
} from '../src/migration/legacy-history.js';

describe('Legacy History Migration (Task 8)', () => {
  const sampleExport: LegacyFullExport = {
    version: 1,
    workspaceId: 'ws-test-123',
    turns: [
      { id: 'turn-1', actor_id: 'user-a', status: 'completed', attempts: 1, tokens_used: 10 },
      { id: 'turn-2', actor_id: 'user-b', status: 'completed', attempts: 1, tokens_used: 15 },
    ],
    messages: [
      {
        id: 'msg-1',
        actor_id: 'user-a',
        role: 'user',
        content_json: JSON.stringify('Olá TED, qual meu saldo?'),
        created_at: '2026-08-20T10:00:00.000Z',
      },
      {
        id: 'msg-1:assistant',
        actor_id: 'agent',
        role: 'assistant',
        content_json: JSON.stringify('Seu saldo é R$ 1.500,00.'),
        created_at: '2026-08-20T10:00:01.000Z',
      },
      {
        id: 'msg-2',
        actor_id: 'user-b',
        role: 'user',
        content_json: JSON.stringify('E as contas de amanhã?'),
        created_at: '2026-08-20T10:05:00.000Z',
      },
    ],
    hasInFlightTurns: false,
  };

  const createMockSql = () => {
    const memory = new Map<string, Array<Record<string, unknown>>>();
    return {
      exec: <T = Record<string, unknown>>(query: string, ...params: unknown[]): Iterable<T> => {
        if (query.includes('CREATE TABLE')) return [] as Iterable<T>;
        if (query.includes('SELECT migration_hash')) {
          const rows = memory.get('_history_migration_marker') ?? [];
          return rows as unknown as Iterable<T>;
        }
        if (query.includes('INSERT INTO _history_migration_marker')) {
          const [workspace_id, migration_hash, imported_count] = params as [string, string, number];
          memory.set('_history_migration_marker', [{ workspace_id, migration_hash, imported_count }]);
          return [] as Iterable<T>;
        }
        if (query.includes('INSERT INTO migrated_messages')) {
          const list = memory.get('migrated_messages') ?? [];
          const [id, workspace_id, actor_id, role, content, created_at] = params as [string, string, string, string, string, string];
          list.push({ id, workspace_id, actor_id, role, content, created_at });
          memory.set('migrated_messages', list);
          return [] as Iterable<T>;
        }
        return [] as Iterable<T>;
      },
    };
  };

  it('transforms legacy messages preserving order, roles, and authorship', () => {
    const transformed = transformLegacyMessages(sampleExport.messages);
    expect(transformed).toHaveLength(3);
    expect(transformed[0]).toEqual({
      id: 'msg-1',
      role: 'user',
      content: 'Olá TED, qual meu saldo?',
      actorId: 'user-a',
      createdAt: '2026-08-20T10:00:00.000Z',
    });
    expect(transformed[1]).toEqual({
      id: 'msg-1:assistant',
      role: 'assistant',
      content: 'Seu saldo é R$ 1.500,00.',
      actorId: 'agent',
      createdAt: '2026-08-20T10:00:01.000Z',
    });
    expect(transformed[2]?.actorId).toBe('user-b');
  });

  it('computes deterministic history hash', () => {
    const hash1 = computeHistoryHash(sampleExport.messages);
    const hash2 = computeHistoryHash(sampleExport.messages);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('migrates history idempotently into sqlite', () => {
    const mockSql = createMockSql();

    // First migration
    const res1 = migrateLegacyHistory(sampleExport, mockSql);
    expect(res1.success).toBe(true);
    expect(res1.importedCount).toBe(3);
    expect(res1.skipped).toBe(false);

    // Second migration with same data -> skipped
    const res2 = migrateLegacyHistory(sampleExport, mockSql);
    expect(res2.success).toBe(true);
    expect(res2.importedCount).toBe(3);
    expect(res2.skipped).toBe(true);
    expect(res2.reason).toBe('already_migrated');
  });

  it('aborts migration if workspace has in-flight queued/running turns', () => {
    const mockSql = createMockSql();
    const blockedExport = { ...sampleExport, hasInFlightTurns: true };

    const res = migrateLegacyHistory(blockedExport, mockSql);
    expect(res.success).toBe(false);
    expect(res.reason).toContain('migration_blocked_turns_in_flight');
    expect(res.importedCount).toBe(0);
  });
});
