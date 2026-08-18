-- V029: Sanitized shadow divergence metrics
CREATE TABLE IF NOT EXISTS shadow_divergence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('match', 'divergence', 'legacy_error', 'api_error', 'skipped')),
  request_hash VARCHAR(64) NOT NULL,
  api_hash VARCHAR(64),
  legacy_hash VARCHAR(64),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shadow_divergence_workspace_cap_created_idx
  ON shadow_divergence_events (workspace_id, capability, created_at DESC);
