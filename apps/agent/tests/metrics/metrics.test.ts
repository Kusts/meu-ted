import { describe, expect, it } from 'vitest';
import { MetricsRecorder, summarizeMetrics } from '../../src/observability/metrics.js';

describe('T3.2 latency and call metrics', () => {
  it('calculates P50/P95 per stage and total', () => {
    const summary = summarizeMetrics([
      { stage: 'routing', latencyMs: 10, apiCalls: 0, llmCalls: 0 },
      { stage: 'routing', latencyMs: 20, apiCalls: 0, llmCalls: 0 },
      { stage: 'routing', latencyMs: 100, apiCalls: 0, llmCalls: 0 },
      { stage: 'turn', latencyMs: 30, apiCalls: 1, llmCalls: 0 },
      { stage: 'turn', latencyMs: 300, apiCalls: 2, llmCalls: 1 },
    ]);
    expect(summary.stages.routing.p50).toBe(20);
    expect(summary.stages.routing.p95).toBe(100);
    expect(summary.stages.turn.p50).toBe(30);
    expect(summary.stages.turn.p95).toBe(300);
    expect(summary.callBudgets.api.max).toBe(2);
    expect(summary.callBudgets.llm.max).toBe(1);
  });

  it('fails closed when a stage or turn budget is exceeded', () => {
    const recorder = new MetricsRecorder({ stageCalls: 1, turnCalls: 2 });
    expect(recorder.canCall('routing')).toBe(true);
    recorder.recordCall('routing');
    expect(recorder.canCall('routing')).toBe(false);
    recorder.recordCall('turn');
    recorder.recordCall('turn');
    expect(recorder.canCall('turn')).toBe(false);
    expect(recorder.budgetStatus().allowed).toBe(false);
  });
});
