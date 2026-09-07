import { describe, expect, it, beforeEach } from 'vitest';
import {
  initializeSessionSchema,
  currentSession,
  endSession,
  listPastSessions,
  getSessionSummary,
} from '../src/agent-config/memory/sessions.js';

type Row = Record<string, unknown>;

const createSql = () => {
  const tables = new Map<string, Row[]>();
  const sql = {
    exec<T = Row>(query: string, ...bindings: unknown[]): Iterable<T> {
      const q = query.trim().replace(/\s+/g, ' ');
      if (q.startsWith('CREATE TABLE') || q.startsWith('CREATE INDEX')) {
        const name = q.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
        if (name && !tables.has(name)) tables.set(name, []);
        return [] as T[];
      }
      if (q.startsWith('INSERT INTO agent_sessions')) {
        const [id, workspaceId, actorId, startedAt] = bindings;
        tables.get('agent_sessions')!.push({
          id, workspace_id: workspaceId, actor_id: actorId, started_at: startedAt,
          ended_at: null, message_count: 0, summary: null,
        });
        return [] as T[];
      }
      if (q.startsWith('UPDATE agent_sessions')) {
        const [endedAt, messageCount, summary, id] = bindings;
        const row = tables.get('agent_sessions')!.find((r) => r['id'] === id);
        if (row) {
          row['ended_at'] = endedAt;
          row['message_count'] = messageCount;
          row['summary'] = summary;
        }
        return [] as T[];
      }
      if (q.startsWith('SELECT * FROM agent_sessions WHERE workspace_id = ? AND actor_id = ? AND ended_at IS NULL')) {
        const [workspaceId, actorId] = bindings;
        return tables.get('agent_sessions')!.filter(
          (r) => r['workspace_id'] === workspaceId && r['actor_id'] === actorId && r['ended_at'] == null,
        ) as T[];
      }
      if (q.startsWith('SELECT * FROM agent_sessions WHERE workspace_id = ? AND actor_id = ? AND ended_at IS NOT NULL')) {
        const [workspaceId, actorId, limit] = bindings;
        return tables.get('agent_sessions')!
          .filter((r) => r['workspace_id'] === workspaceId && r['actor_id'] === actorId && r['ended_at'] != null)
          .slice(0, Number(limit)) as T[];
      }
      if (q.startsWith('SELECT * FROM agent_sessions WHERE id = ?')) {
        const [id, workspaceId, actorId] = bindings;
        return tables.get('agent_sessions')!.filter(
          (r) => r['id'] === id && r['workspace_id'] === workspaceId && r['actor_id'] === actorId,
        ) as T[];
      }
      throw new Error(`unhandled query in mock: ${q.slice(0, 80)}`);
    },
  };
  initializeSessionSchema(sql);
  return sql;
};

describe('past sessions registry (Part B)', () => {
  let sql: ReturnType<typeof createSql>;
  beforeEach(() => {
    sql = createSql();
  });

  it('opens a current session, ends it, and lists it as past', () => {
    const first = currentSession(sql, 'ws-1', 'u-1');
    expect(first.endedAt).toBeNull();
    expect(currentSession(sql, 'ws-1', 'u-1').id).toBe(first.id);
    const closed = endSession(sql, 'ws-1', 'u-1', { summary: 'Falamos de saldo', messageCount: 6 });
    expect(closed?.summary).toBe('Falamos de saldo');
    const past = listPastSessions(sql, 'ws-1', 'u-1');
    expect(past).toHaveLength(1);
    expect(past[0]).toMatchObject({ id: first.id, messageCount: 6 });
    // A new current session starts after ending.
    expect(currentSession(sql, 'ws-1', 'u-1').id).not.toBe(first.id);
  });

  it('isolates sessions by workspace and actor', () => {
    const session = currentSession(sql, 'ws-1', 'u-1');
    endSession(sql, 'ws-1', 'u-1', { summary: 'x', messageCount: 2 });
    expect(listPastSessions(sql, 'ws-2', 'u-1')).toHaveLength(0);
    expect(listPastSessions(sql, 'ws-1', 'u-2')).toHaveLength(0);
    expect(getSessionSummary(sql, 'ws-1', 'u-2', session.id)).toBeNull();
    expect(getSessionSummary(sql, 'ws-1', 'u-1', session.id)?.summary).toBe('x');
    expect(getSessionSummary(sql, 'ws-1', 'u-1', 'missing')).toBeNull();
  });
});
