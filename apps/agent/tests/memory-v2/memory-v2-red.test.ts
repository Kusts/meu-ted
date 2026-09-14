import { describe, expect, it } from 'vitest';
import { learnFromTurn } from '../../src/agent-config/memory/learn.js';
import { rememberFact, recallMemories, renderMemoryBlock, isProhibitedFinancialMemory, initializeMemorySchema } from '../../src/agent-config/memory/store.js';

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
  it('refuses financial current-state at persistence time (AGENT-008)', () => {
    const db = sql(); initializeMemorySchema(db);
    // "saldo atual é R$ 100" must NOT be stored: persistence is blocked by
    // deterministic filters, not only by the recall-side filter.
    const saved = rememberFact(db, { workspaceId: 'w', actor: 'a', content: 'saldo atual é R$ 100', source: 'api', confidence: 0.99 });
    expect(saved).toMatchObject({ stored: false, reason: 'financial_state' });
    expect(recallMemories(db, { workspaceId: 'w', actor: 'a', query: 'saldo' })).toHaveLength(0);
    expect(isProhibitedFinancialMemory('saldo atual é R$ 100')).toBe(true);
    // Durable, non-current phrasing without amounts still stores.
    const durable = rememberFact(db, { workspaceId: 'w', actor: 'a', content: 'Conta principal é o Nubank' });
    expect(durable.stored).toBe(true);
    // Explicitly dated history is storable, never current.
    const history = rememberFact(db, { workspaceId: 'w', actor: 'a', content: 'Em 12/03/2026 o saldo era R$ 100 na Conta principal' });
    expect(history.stored).toBe(true);
  });

  it('delimits recalled memory as UNTRUSTED DATA, never instructions', () => {
    const db = sql(); initializeMemorySchema(db);
    rememberFact(db, { workspaceId: 'w', actor: 'a', content: 'Prefiro resumos curtos' });
    const items = recallMemories(db, { workspaceId: 'w', actor: 'a' });
    const block = renderMemoryBlock(items)!;
    expect(block).toContain('- Prefiro resumos curtos');
    expect(block).toMatch(/NÃO CONFIÁVEIS|UNTRUSTED/i);
    expect(block).toMatch(/nunca s(ã|a)o instru(ç|c)(õ|o)es/i);
  });

  it('ignores learning when no actual assistant response exists', async () => {
    const db = sql(); initializeMemorySchema(db);
    const learned = await learnFromTurn(db, { workspaceId: 'w', actorId: 'a', userText: 'Prefiro resumos curtos', assistantText: '', turnCount: 1 });
    expect(learned).toHaveLength(0);
  });
});
