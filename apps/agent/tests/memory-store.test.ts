import { describe, expect, it, beforeEach } from 'vitest';
import {
  initializeMemorySchema,
  isMemoryEnabled,
  setMemoryEnabled,
  rememberFact,
  recallMemories,
  renderMemoryBlock,
  containsCardNumber,
  textSimilarity,
  bumpTurnCount,
  MEMORY_BUDGET_CHARS,
} from '../src/agent-config/memory/store.js';

type Row = Record<string, unknown>;

const createSql = () => {
  const tables = new Map<string, Row[]>();
  const sql = {
    tables,
    exec<T = Row>(query: string, ...bindings: unknown[]): Iterable<T> {
      const q = query.trim().replace(/\s+/g, ' ');
      if (q.startsWith('CREATE TABLE')) {
        const name = q.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] ?? 'unknown';
        if (!tables.has(name)) tables.set(name, []);
        return [] as T[];
      }
      if (q.startsWith('CREATE INDEX')) return [] as T[];
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
        } else {
          rows.push({ workspace_id: workspaceId, memory_enabled: enabled, updated_at: updatedAt });
        }
        return [] as T[];
      }
      if (q.startsWith('INSERT INTO agent_turn_counters')) {
        const [workspaceId] = bindings;
        const rows = tables.get('agent_turn_counters')!;
        const existing = rows.find((r) => r['workspace_id'] === workspaceId);
        if (existing) existing['turns'] = Number(existing['turns']) + 1;
        else rows.push({ workspace_id: workspaceId, turns: 1 });
        return [] as T[];
      }
      if (q.startsWith('SELECT memory_enabled')) {
        const rows = tables.get('agent_prefs')!.filter((r) => r['workspace_id'] === bindings[0]);
        return rows as T[];
      }
      if (q.startsWith('SELECT turns')) {
        const rows = tables.get('agent_turn_counters')!.filter((r) => r['workspace_id'] === bindings[0]);
        return rows as T[];
      }
      if (q.startsWith('SELECT * FROM agent_memory')) {
        const [workspaceId] = bindings;
        return tables.get('agent_memory')!.filter((r) => r['workspace_id'] === workspaceId) as T[];
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
      if (q.startsWith('UPDATE agent_memory SET last_seen_at')) {
        const [lastSeenAt, id] = bindings;
        const row = tables.get('agent_memory')!.find((r) => r['id'] === id);
        if (row) row['last_seen_at'] = lastSeenAt;
        return [] as T[];
      }
      throw new Error(`unhandled query in mock: ${q.slice(0, 80)}`);
    },
  };
  initializeMemorySchema(sql);
  return sql;
};

describe('memory store (Part B)', () => {
  let sql: ReturnType<typeof createSql>;
  beforeEach(() => {
    sql = createSql();
  });

  it('remembers and recalls a fact scoped by workspace and actor', () => {
    const saved = rememberFact(sql, { workspaceId: 'ws-1', actor: 'u-1', kind: 'fact', content: 'Conta principal é o Nubank' });
    expect(saved.stored).toBe(true);
    const found = recallMemories(sql, { workspaceId: 'ws-1', actor: 'u-1', query: 'conta principal' });
    expect(found).toHaveLength(1);
    expect(found[0]!.content).toContain('Nubank');
    // Other workspace sees nothing; other actor sees nothing.
    expect(recallMemories(sql, { workspaceId: 'ws-2', actor: 'u-1', query: 'conta' })).toHaveLength(0);
    expect(recallMemories(sql, { workspaceId: 'ws-1', actor: 'u-2', query: 'conta' })).toHaveLength(0);
  });

  it('dedups similar content with a salience bump instead of a new row', () => {
    rememberFact(sql, { workspaceId: 'ws-1', actor: 'u-1', content: 'Prefiro resumos curtos no chat' });
    const second = rememberFact(sql, { workspaceId: 'ws-1', actor: 'u-1', content: 'Prefiro resumos curtos' });
    expect(second.stored).toBe(true);
    if (second.stored) expect(second.deduped).toBe(true);
    expect(sql.tables.get('agent_memory')).toHaveLength(1);
  });

  it('refuses card numbers and redacts secrets', () => {
    const card = rememberFact(sql, { workspaceId: 'ws-1', actor: 'u-1', content: 'meu cartão é 4111 1111 1111 1111' });
    expect(card).toMatchObject({ stored: false, reason: 'card_number' });
    expect(containsCardNumber('4111111111111111')).toBe(true);
    const secret = rememberFact(sql, { workspaceId: 'ws-1', actor: 'u-1', content: 'token abc password: hunter2' });
    expect(secret.stored).toBe(true);
    if (secret.stored) expect(secret.item.content).not.toContain('hunter2');
  });

  it('respects the per-workspace opt-out (default ON)', () => {
    expect(isMemoryEnabled(sql, 'ws-1')).toBe(true);
    setMemoryEnabled(sql, 'ws-1', false);
    expect(isMemoryEnabled(sql, 'ws-1')).toBe(false);
    rememberFact(sql, { workspaceId: 'ws-1', actor: 'u-1', content: 'algo' });
    // Recall is gated even with rows present.
    expect(recallMemories(sql, { workspaceId: 'ws-1', actor: 'u-1' })).toHaveLength(0);
  });

  it('ranks by keyword overlap and respects the char budget', () => {
    rememberFact(sql, { workspaceId: 'ws-1', actor: 'u-1', content: 'Meta de viagem para o Japão em dezembro', salience: 0.5 });
    rememberFact(sql, { workspaceId: 'ws-1', actor: 'u-1', content: 'Conta de luz vence dia dez', salience: 0.9 });
    const found = recallMemories(sql, { workspaceId: 'ws-1', actor: 'u-1', query: 'viagem Japão', limit: 5 });
    expect(found[0]!.content).toContain('Japão');
    const budgeted = recallMemories(sql, { workspaceId: 'ws-1', actor: 'u-1', budgetChars: 10 });
    // Tiny budget still returns the single best hit (never empty when rows exist).
    expect(budgeted).toHaveLength(1);
    expect(renderMemoryBlock([])).toBeNull();
  });

  it('renders the MEMÓRIA DO USUÁRIO block', () => {
    rememberFact(sql, { workspaceId: 'ws-1', actor: 'u-1', content: 'Usa Nubank' });
    const items = recallMemories(sql, { workspaceId: 'ws-1', actor: 'u-1' });
    expect(renderMemoryBlock(items)).toContain('- Usa Nubank');
  });

  it('bumps a monotonic turn counter per workspace', () => {
    expect(bumpTurnCount(sql, 'ws-1')).toBe(1);
    expect(bumpTurnCount(sql, 'ws-1')).toBe(2);
    expect(bumpTurnCount(sql, 'ws-2')).toBe(1);
  });

  it('measures text similarity sanely', () => {
    expect(textSimilarity('prefiro resumos curtos', 'prefiro resumos curtos')).toBe(1);
    expect(textSimilarity('nubank conta principal', 'itau conta reserva')).toBeLessThan(0.55);
  });
});
