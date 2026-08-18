-- v3: durable per-actor token budgets and request rate limits.
CREATE TABLE IF NOT EXISTS daily_token_usage (
    actor_id TEXT NOT NULL,
    usage_day TEXT NOT NULL,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (actor_id, usage_day)
);

CREATE TABLE IF NOT EXISTS agent_rate_limits (
    actor_id TEXT PRIMARY KEY NOT NULL,
    window_started_at INTEGER NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0
);
