export type UsagePolicy = {
  maxInputTokens: number;
  maxOutputTokens: number;
  maxRequestsPerWindow: number;
  windowSeconds: number;
  dailyBudget: number;
  actorDailyBudget: number;
};

export const DEFAULT_POLICY: UsagePolicy = {
  maxInputTokens: 2000,
  maxOutputTokens: 2000,
  maxRequestsPerWindow: 20,
  windowSeconds: 60,
  dailyBudget: 20000,
  actorDailyBudget: 10000,
};

export const estimateTokens = (text: string): number => {
  if (!text || text.length === 0) return 0;
  return Math.ceil(text.length / 4);
};

export const initializeUsageSchema = (sql: { exec(query: string): unknown }): void => {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS usage_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id TEXT NOT NULL,
      intention_id TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cost_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_usage_ledger_actor ON usage_ledger(actor_id);
    CREATE INDEX IF NOT EXISTS idx_usage_ledger_created ON usage_ledger(created_at);
  `);
};

export const checkUsageLimit = (
  sql: { exec<T = Record<string, unknown>>(query: string, ...params: unknown[]): Iterable<T> },
  actorId: string,
  estimatedInputTokens: number,
  policy: UsagePolicy = DEFAULT_POLICY,
): { allowed: boolean; reason?: string } => {
  if (estimatedInputTokens > policy.maxInputTokens) {
    return {
      allowed: false,
      reason: `Message exceeds maximum allowed input token limit of ${policy.maxInputTokens} (estimated: ${estimatedInputTokens})`,
    };
  }

  // 1. Rate limit check: requests within the sliding window
  const windowSecs = policy.windowSeconds ?? 60;
  const rateRows = [...sql.exec<{ req_count: number }>(`
    SELECT COUNT(*) AS req_count
    FROM usage_ledger
    WHERE datetime(created_at) >= datetime('now', '-${windowSecs} seconds')
  `)];
  const currentRequests = Number(rateRows[0]?.req_count ?? 0);
  if (currentRequests >= policy.maxRequestsPerWindow) {
    return {
      allowed: false,
      reason: `Rate limit exceeded: ${currentRequests}/${policy.maxRequestsPerWindow} requests in the last ${windowSecs}s`,
    };
  }

  // 2. Aggregate workspace daily budget check (past 24h)
  const workspaceRows = [...sql.exec<{ total_tokens: number }>(`
    SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total_tokens
    FROM usage_ledger
    WHERE datetime(created_at) >= datetime('now', '-1 day')
  `)];
  const totalWorkspaceUsed = Number(workspaceRows[0]?.total_tokens ?? 0);
  if (totalWorkspaceUsed + estimatedInputTokens > policy.dailyBudget) {
    return {
      allowed: false,
      reason: `Daily token budget of ${policy.dailyBudget} exceeded (used: ${totalWorkspaceUsed}, attempted: ${estimatedInputTokens})`,
    };
  }

  // 3. Actor sub-limit check (past 24h)
  const actorRows = [...sql.exec<{ actor_tokens: number }>(`
    SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS actor_tokens
    FROM usage_ledger
    WHERE actor_id = ? AND datetime(created_at) >= datetime('now', '-1 day')
  `, actorId)];
  const totalActorUsed = Number(actorRows[0]?.actor_tokens ?? 0);
  if (totalActorUsed + estimatedInputTokens > policy.actorDailyBudget) {
    return {
      allowed: false,
      reason: `Actor daily token budget of ${policy.actorDailyBudget} exceeded (used: ${totalActorUsed}, attempted: ${estimatedInputTokens})`,
    };
  }

  return { allowed: true };
};

export const recordUsage = (
  sql: { exec(query: string, ...params: unknown[]): unknown },
  actorId: string,
  intentionId: string,
  inputTokens: number,
  outputTokens: number,
  costCents = 0,
): void => {
  sql.exec(
    `INSERT INTO usage_ledger (actor_id, intention_id, input_tokens, output_tokens, cost_cents, created_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    actorId,
    intentionId,
    inputTokens,
    outputTokens,
    costCents,
  );
};
