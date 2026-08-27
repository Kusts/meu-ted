import { describe, expect, it, beforeEach } from 'vitest';
import {
  deriveIdempotencyKey,
  remember,
  recall,
  clearMemoryLedger,
  initializeIntentionLedgerSchema,
} from '../src/tools/intention-ledger.js';

describe('Intention Tool Ledger (Task 6)', () => {
  beforeEach(() => {
    clearMemoryLedger();
  });

  it('derives deterministic idempotency key from composite tuple', () => {
    const key1 = deriveIdempotencyKey('ws-1', 'intent-1', 'call-1');
    const key2 = deriveIdempotencyKey('ws-1', 'intent-1', 'call-1');
    const keyDifferent = deriveIdempotencyKey('ws-1', 'intent-1', 'call-2');

    expect(key1).toBe(key2);
    expect(key1).toHaveLength(64);
    expect(key1).not.toBe(keyDifferent);
  });

  it('remembers and recalls tool idempotency keys in memory', () => {
    const key = deriveIdempotencyKey('ws-1', 'intent-1', 'call-1');
    remember('ws-1', 'intent-1', 'call-1', key, { success: true });

    const recalled = recall('ws-1', 'intent-1', 'call-1');
    expect(recalled).toEqual({
      key,
      outcome: { success: true },
    });

    expect(recall('ws-1', 'intent-1', 'call-other')).toBeUndefined();
  });

  it('supports SQLite schema and operations', () => {
    const executed: string[] = [];
    const mockSql = {
      exec: (query: string) => {
        executed.push(query);
        return [];
      },
    };

    initializeIntentionLedgerSchema(mockSql);
    expect(executed[0]).toContain('CREATE TABLE IF NOT EXISTS intention_tool_ledger');

    remember('ws-1', 'intent-1', 'call-1', 'idem-key', { id: 'acc-1' }, mockSql);
    expect(executed.some((q) => q.includes('INSERT INTO intention_tool_ledger'))).toBe(true);
  });
});
