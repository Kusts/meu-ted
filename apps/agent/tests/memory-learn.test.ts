import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  extractLearningsHeuristic,
  isDuplicateLearning,
  learnFromTurn,
  LEARN_EVERY_TURNS,
} from '../src/agent-config/memory/learn.js';
import { initializeMemorySchema, isMemoryEnabled, recallMemories, setMemoryEnabled } from '../src/agent-config/memory/store.js';
import type { MemoryItem } from '../src/agent-config/memory/store.js';

type Row = Record<string, unknown>;

const createSql = () => {
  const tables = new Map<string, Row[]>();
  const sql = {
    tables,
    exec<T = Row>(query: string, ...bindings: unknown[]): Iterable<T> {
      const q = query.trim().replace(/\s+/g, ' ');
      if (q.startsWith('CREATE TABLE') || q.startsWith('CREATE INDEX')) {
        const name = q.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
        if (name && !tables.has(name)) tables.set(name, []);
        return [] as T[];
      }
      if (q.startsWith('INSERT INTO agent_memory')) {
        const [id, workspaceId, actor, kind, content, salience, createdAt, lastSeenAt, expiresAt] = bindings;
        tables.get('agent_memory')!.push({
          id, workspace_id: workspaceId, actor, kind, content, salience,
          created_at: createdAt, last_seen_at: lastSeenAt, expires_at: expiresAt,
        });
        return [] as T[];
      }
      if (q.startsWith('INSERT INTO agent_prefs')) {
        const [workspaceId, enabled, updatedAt] = bindings;
        const rows = tables.get('agent_prefs')!;
        const existing = rows.find((r) => r['workspace_id'] === workspaceId);
        if (existing) {
          existing['memory_enabled'] = enabled;
          existing['updated_at'] = updatedAt;
        } else rows.push({ workspace_id: workspaceId, memory_enabled: enabled, updated_at: updatedAt });
        return [] as T[];
      }
      if (q.startsWith('SELECT memory_enabled')) {
        return tables.get('agent_prefs')!.filter((r) => r['workspace_id'] === bindings[0]) as T[];
      }
      if (q.startsWith('SELECT * FROM agent_memory')) {
        return tables.get('agent_memory')!.filter((r) => r['workspace_id'] === bindings[0]) as T[];
      }
      if (q.startsWith('UPDATE agent_memory SET salience')) {
        const [salience, lastSeenAt, id] = bindings;
        const row = tables.get('agent_memory')!.find((r) => r['id'] === id);
        if (row) {
          row['salience'] = salience;
          row['last_seen_at'] = lastSeenAt;
        }
        return [] as T[];
      }
      if (q.startsWith('UPDATE agent_memory SET last_seen_at')) return [] as T[];
      throw new Error(`unhandled query in mock: ${q.slice(0, 80)}`);
    },
  };
  initializeMemorySchema(sql);
  return sql;
};

describe('post-turn learning (Part B)', () => {
  let sql: ReturnType<typeof createSql>;
  beforeEach(() => {
    sql = createSql();
  });

  it('extracts explicit preferences from the user turn', async () => {
    expect(extractLearningsHeuristic('Lembre-se que prefiro resumos curtos', '')).toHaveLength(2);
    expect(extractLearningsHeuristic('qual o meu saldo?', '')).toHaveLength(0);
    const learned = await learnFromTurn(sql, {
      workspaceId: 'ws-1',
      actorId: 'u-1',
      userText: 'Prefiro pagar a fatura no dia 10',
      assistantText: 'ok',
      turnCount: 1,
    });
    expect(learned).toHaveLength(1);
    expect(learned[0]!.kind).toBe('preference');
  });

  it('dedups repetitions instead of piling rows', async () => {
    await learnFromTurn(sql, { workspaceId: 'ws-1', actorId: 'u-1', userText: 'Prefiro resumos curtos', assistantText: '', turnCount: 1 });
    const second = await learnFromTurn(sql, { workspaceId: 'ws-1', actorId: 'u-1', userText: 'Prefiro resumos curtos sempre', assistantText: '', turnCount: 2 });
    expect(second).toHaveLength(0);
    expect(sql.tables.get('agent_memory')).toHaveLength(1);
  });

  it('runs the LLM extractor only on due turns and caps at 2', async () => {
    const llmExtract = vi.fn(async () => ['a', 'b', 'c']);
    const early = await learnFromTurn(sql, {
      workspaceId: 'ws-1', actorId: 'u-1', userText: 'oi', assistantText: 'olá', turnCount: 1, llmExtract,
    });
    expect(llmExtract).not.toHaveBeenCalled();
    expect(early).toHaveLength(0);
    const due = await learnFromTurn(sql, {
      workspaceId: 'ws-1', actorId: 'u-1', userText: 'oi', assistantText: 'olá', turnCount: LEARN_EVERY_TURNS, llmExtract,
    });
    expect(llmExtract).toHaveBeenCalledTimes(1);
    expect(due).toHaveLength(2);
  });

  it('respects opt-out and never stores card numbers', async () => {
    setMemoryEnabled(sql, 'ws-1', false);
    expect(isMemoryEnabled(sql, 'ws-1')).toBe(false);
    const learned = await learnFromTurn(sql, {
      workspaceId: 'ws-1', actorId: 'u-1', userText: 'Prefiro pagar dia 10', assistantText: '', turnCount: 1,
    });
    expect(learned).toHaveLength(0);
    setMemoryEnabled(sql, 'ws-1', true);
    const card = await learnFromTurn(sql, {
      workspaceId: 'ws-1', actorId: 'u-1', userText: 'Lembre que meu cartão é 5500 0000 0000 0004', assistantText: '', turnCount: 1,
    });
    expect(card).toHaveLength(0);
    expect(recallMemories(sql, { workspaceId: 'ws-1', actor: 'u-1' })).toHaveLength(0);
  });

  it('detects duplicates by similarity', () => {
    const existing = [{ content: 'Conta principal é o Nubank' } as MemoryItem];
    expect(isDuplicateLearning('conta principal: nubank', existing)).toBe(true);
    expect(isDuplicateLearning('gosto de pizza', existing)).toBe(false);
  });
});
