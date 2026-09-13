export type MetricSample = Readonly<{
  stage: string;
  latencyMs: number;
  apiCalls: number;
  llmCalls: number;
  cacheHit?: boolean;
}>;

export type StageLatency = Readonly<{ p50: number; p95: number; count: number }>;
export type MetricsSummary = Readonly<{
  stages: Readonly<Record<string, StageLatency>>;
  callBudgets: Readonly<{ api: { max: number; total: number }; llm: { max: number; total: number } }>;
}>;

const percentile = (values: readonly number[], fraction: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
};

export const summarizeMetrics = (samples: readonly MetricSample[]): MetricsSummary => {
  const grouped = new Map<string, number[]>();
  let apiTotal = 0; let llmTotal = 0; let apiMax = 0; let llmMax = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample.latencyMs) || sample.latencyMs < 0) continue;
    const values = grouped.get(sample.stage) ?? [];
    values.push(sample.latencyMs);
    grouped.set(sample.stage, values);
    apiTotal += Math.max(0, sample.apiCalls); llmTotal += Math.max(0, sample.llmCalls);
    apiMax = Math.max(apiMax, sample.apiCalls); llmMax = Math.max(llmMax, sample.llmCalls);
  }
  const stages: Record<string, StageLatency> = {};
  for (const [stage, values] of grouped) stages[stage] = { p50: percentile(values, 0.5), p95: percentile(values, 0.95), count: values.length };
  return { stages, callBudgets: { api: { max: apiMax, total: apiTotal }, llm: { max: llmMax, total: llmTotal } } };
};

export type CallBudget = Readonly<{ stageCalls: number; turnCalls: number }>;
export class MetricsRecorder {
  private readonly calls = new Map<string, number>();
  private turnCallCount = 0;
  private exceeded = false;
  constructor(private readonly budget: CallBudget = { stageCalls: 2, turnCalls: 2 }) {}
  canCall(stage: string): boolean { return (this.calls.get(stage) ?? 0) < this.budget.stageCalls && this.turnCallCount < this.budget.turnCalls; }
  recordCall(stage: string): boolean {
    if (!this.canCall(stage)) { this.exceeded = true; return false; }
    this.calls.set(stage, (this.calls.get(stage) ?? 0) + 1); this.turnCallCount += 1; return true;
  }
  budgetStatus(): Readonly<{ allowed: boolean; stageCalls: Readonly<Record<string, number>>; turnCalls: number }> {
    const stageCalls = Object.fromEntries(this.calls);
    return { allowed: !this.exceeded && this.turnCallCount <= this.budget.turnCalls && [...this.calls.values()].every((count) => count <= this.budget.stageCalls), stageCalls, turnCalls: this.turnCallCount };
  }
}
