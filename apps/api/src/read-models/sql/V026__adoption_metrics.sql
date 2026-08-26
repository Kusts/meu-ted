CREATE TABLE IF NOT EXISTS adoption_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  actor_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'notification_delivered',
    'notification_opened',
    'chat_used',
    'capture_started',
    'capture_completed'
  )),
  occurred_at TIMESTAMPTZ NOT NULL,
  flow_id TEXT,
  dedupe_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE adoption_events ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS adoption_events_workspace_dedupe_idx
  ON adoption_events (workspace_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;


CREATE INDEX IF NOT EXISTS adoption_events_workspace_time_idx
  ON adoption_events (workspace_id, occurred_at);

CREATE INDEX IF NOT EXISTS adoption_events_workspace_flow_idx
  ON adoption_events (workspace_id, flow_id, occurred_at)
  WHERE flow_id IS NOT NULL;
