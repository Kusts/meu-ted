CREATE TABLE IF NOT EXISTS context_token_replays (
  jti UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  request_id TEXT NOT NULL,
  provider_message_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS context_token_replays_expires_idx
  ON context_token_replays (expires_at);

CREATE INDEX IF NOT EXISTS context_token_replays_workspace_request_idx
  ON context_token_replays (workspace_id, request_id);
