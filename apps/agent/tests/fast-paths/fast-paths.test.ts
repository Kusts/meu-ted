import { describe, expect, it } from 'vitest';
import { classifyFastPath, routeIntent } from '../../src/orchestration/intent-router.js';

describe('T3.2 deterministic fast paths', () => {
  it.each([
    ['Qual meu saldo?', 'balance'],
    ['Mostre os últimos lançamentos', 'recent_transactions'],
    ['confirmar', 'confirm'],
    ['pode cancelar', 'cancel'],
  ])('%s avoids planner', (text, kind) => {
    const result = classifyFastPath(text);
    expect(result.kind).toBe(kind);
    expect(result.plannerRequired).toBe(false);
  });

  it('routes confirmation and cancellation as deterministic modes', () => {
    expect(routeIntent('confirmar').mode).toBe('confirmation');
    expect(routeIntent('pode cancelar').mode).toBe('cancel');
  });

  it('enforces stage and turn budgets with fail-closed decisions', () => {
    const result = classifyFastPath('qual meu saldo?', { stageCalls: 2, turnCalls: 2 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('call_budget_exceeded');
  });

  it('never treats cached balance as current authority', () => {
    const result = classifyFastPath('qual meu saldo?', { cacheHit: true });
    expect(result.cacheAuthoritative).toBe(false);
    expect(result.requiresFreshApi).toBe(true);
  });
});
