-- V035: Agent connection token replay prevention
CREATE TABLE IF NOT EXISTS agent_connection_token_replay (
  jti_hash TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  connection_id TEXT,
  actor_id TEXT NOT NULL,
  intention_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS agent_connection_token_replay_exp_idx ON agent_connection_token_replay(expires_at);
-- Cleanup expired rows older than 1 hour can be done by job; retention 10 min for TTL 120s
