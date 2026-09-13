import { describe, expect, it } from 'vitest';
import { learnFromTurn } from '../../src/agent-config/memory/learn.js';
import { rememberFact, recallMemories, initializeMemorySchema } from '../../src/agent-config/memory/store.js';

type Row = Record<string, unknown>;
const sql = () => {
  const tables = new Map<string, Row[]>();
  return {
    tables,
    exec<T = Row>(query: string, ...args: unknown[]): Iterable<T> {
      const q = query.replace(/\s+/g, ' ').trim();
      if (q.startsWith('CREATE TABLE')) { const n = q.match(/IF NOT EXISTS (\w+)/)?.[1]; if (n) tables.set(n, []); return []; }
      if (q.startsWith('CREATE INDEX')) return [];
      if (q.startsWith('SELECT memory_enabled')) return [];
      if (q.startsWith('INSERT INTO agent_memory')) { const [id, ws, actor, kind, content, salience, created, seen, expires, source, confidence] = args; tables.get('agent_memory')!.push({ id, workspace_id: ws, actor, kind, content, salience, created_at: created, last_seen_at: seen, expires_at: expires, source, confidence }); return []; }
      if (q.startsWith('SELECT * FROM agent_memory')) return (tables.get('agent_memory') ?? []) as T[];
      if (q.startsWith('UPDATE agent_memory')) return [];
      throw new Error(`unhandled ${q}`);
    },
  };
};

describe('TED V2 T3.1 RED', () => {
  it('does not recall stale/current financial state as authority and carries provenance', () => {
    const db = sql(); initializeMemorySchema(db);
    const saved = rememberFact(db, { workspaceId: 'w', actor: 'a', content: 'saldo atual é R$ 100', source: 'api', confidence: 0.99 });
    expect(saved.stored && saved.item.source).toBe('api');
    expect(recallMemories(db, { workspaceId: 'w', actor: 'a', query: 'saldo' })).toHaveLength(0);
  });

  it('ignores learning when no actual assistant response exists', async () => {
    const db = sql(); initializeMemorySchema(db);
    const learned = await learnFromTurn(db, { workspaceId: 'w', actorId: 'a', userText: 'Prefiro resumos curtos', assistantText: '', turnCount: 1 });
    expect(learned).toHaveLength(0);
  });
});
