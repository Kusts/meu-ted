import { describe, expect, it } from 'vitest';
import {
  checkUsageLimit,
  estimateTokens,
  initializeUsageSchema,
  recordUsage,
  type UsagePolicy,
} from '../src/safety/usage-policy.js';

describe('Usage Policy & Token Budget (Task 5 & 7)', () => {
  const createMockSql = () => {
    const rows: Array<{ actor_id: string; intention_id: string; input_tokens: number; output_tokens: number; cost_cents: number; created_at: string }> = [];
    return {
      exec: <T = Record<string, unknown>>(query: string, ...params: unknown[]): Iterable<T> => {
        if (query.includes('CREATE TABLE') || query.includes('CREATE INDEX')) {
          return [] as Iterable<T>;
        }
        if (query.includes('INSERT INTO usage_ledger')) {
          const [actor_id, intention_id, input_tokens, output_tokens, cost_cents] = params as [string, string, number, number, number];
          rows.push({
            actor_id,
            intention_id,
            input_tokens,
            output_tokens,
            cost_cents,
            created_at: new Date().toISOString(),
          });
          return [] as Iterable<T>;
        }
        if (query.includes('SELECT COUNT(*) AS req_count')) {
          return [{ req_count: rows.length }] as unknown as Iterable<T>;
        }
        if (query.includes('WHERE actor_id = ?')) {
          const actorId = params[0] as string;
          const sum = rows.filter((r) => r.actor_id === actorId).reduce((acc, r) => acc + r.input_tokens + r.output_tokens, 0);
          return [{ actor_tokens: sum }] as unknown as Iterable<T>;
        }
        if (query.includes('SELECT COALESCE(SUM')) {
          const sum = rows.reduce((acc, r) => acc + r.input_tokens + r.output_tokens, 0);
          return [{ total_tokens: sum }] as unknown as Iterable<T>;
        }
        return [] as Iterable<T>;
      },
    };
  };

  it('estimates tokens based on text length', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('enforces single turn input token limits', () => {
    const sql = createMockSql();
    const policy: UsagePolicy = {
      maxInputTokens: 500,
      maxOutputTokens: 500,
      maxRequestsPerWindow: 10,
      windowSeconds: 60,
      dailyBudget: 5000,
      actorDailyBudget: 2500,
    };

    // Within limit
    expect(checkUsageLimit(sql, 'user-1', 400, policy)).toEqual({ allowed: true });

    // Exceeds single turn limit
    const res = checkUsageLimit(sql, 'user-1', 600, policy);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('exceeds maximum allowed input token limit');
  });

  it('enforces aggregate daily token budget', () => {
    const sql = createMockSql();
    initializeUsageSchema(sql);

    const policy: UsagePolicy = {
      maxInputTokens: 1000,
      maxOutputTokens: 1000,
      maxRequestsPerWindow: 20,
      windowSeconds: 60,
      dailyBudget: 2000,
      actorDailyBudget: 1500,
    };

    // First request: 800 input + 800 output = 1600 tokens recorded
    recordUsage(sql, 'user-1', 'intent-1', 800, 800);

    // Attempt next request of 500 tokens: 1600 + 500 = 2100 > 2000 budget
    const check = checkUsageLimit(sql, 'user-1', 500, policy);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Daily token budget of 2000 exceeded');
  });

  it('enforces actor sub-budget within daily limit', () => {
    const sql = createMockSql();
    initializeUsageSchema(sql);

    const policy: UsagePolicy = {
      maxInputTokens: 1000,
      maxOutputTokens: 1000,
      maxRequestsPerWindow: 20,
      windowSeconds: 60,
      dailyBudget: 10000,
      actorDailyBudget: 1000,
    };

    // Actor 1 records 800 tokens
    recordUsage(sql, 'user-1', 'intent-1', 400, 400);

    // Actor 1 tries 300 tokens: 800 + 300 = 1100 > 1000 actor sub-budget
    const check = checkUsageLimit(sql, 'user-1', 300, policy);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Actor daily token budget of 1000 exceeded');
  });
});
