import { describe, expect, it } from 'vitest';
import { routeIntent } from '../../src/orchestration/intent-router.js';

describe('T2.2 intent router', () => {
  it('routes Brazilian Portuguese negation without turning it into a mutation', () => {
    const plan = routeIntent('não registre uma despesa de 20 reais');
    expect(plan.mode).toBe('cancel');
    expect(plan.requestedOperations).toEqual([]);
  });

  it('tolerates common Portuguese typos', () => {
    const plan = routeIntent('me mostre meu sald');
    expect(plan.mode).toBe('read');
    expect(plan.domain).toBe('accounts');
    expect(plan.requestedOperations[0]?.name).toBe('get_balance');
  });

  it('keeps a compound utterance bounded to four operations and eight tools', () => {
    const plan = routeIntent('mostre meu saldo e minhas contas e meu extrato e minhas faturas');
    expect(plan.mode).toBe('read');
    expect(plan.requestedOperations.length).toBeLessThanOrEqual(4);
    expect(plan.requestedTools?.length ?? 0).toBeLessThanOrEqual(8);
  });
});
