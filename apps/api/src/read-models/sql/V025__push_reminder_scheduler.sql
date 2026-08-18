-- V025 — server-side Web Push reminder scheduling state.
ALTER TABLE notification_configs
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE notification_configs
  ADD COLUMN IF NOT EXISTS schedule_window_minutes INTEGER NOT NULL DEFAULT 60;
ALTER TABLE notification_configs
  ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;
ALTER TABLE notification_configs
  ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ;
ALTER TABLE notification_configs
  ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMPTZ;
ALTER TABLE notification_configs
  ADD COLUMN IF NOT EXISTS last_run_status TEXT;
ALTER TABLE notification_configs
  ADD COLUMN IF NOT EXISTS last_sent_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_configs
  ADD COLUMN IF NOT EXISTS last_removed_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notification_configs
  ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE notification_configs
  ALTER COLUMN timezone SET DEFAULT 'UTC';

CREATE TABLE IF NOT EXISTS push_reminder_deliveries (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id      UUID NOT NULL,
    notification_id   UUID NOT NULL,
    local_date        DATE NOT NULL,
    notification_type TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'sent', 'failed', 'deduplicated', 'quarantined')),
    sent_count        INTEGER NOT NULL DEFAULT 0,
    removed_count     INTEGER NOT NULL DEFAULT 0,
    error_message     TEXT,
    claimed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at           TIMESTAMPTZ,
    UNIQUE (household_id, notification_id, local_date, notification_type)
 );
 
CREATE TABLE IF NOT EXISTS push_delivery_attempts (
    workspace_id UUID NOT NULL,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    delivery_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'delivered')),
    delivered_at TIMESTAMPTZ,
    PRIMARY KEY (workspace_id, user_id, endpoint, delivery_key)
 );
 
CREATE INDEX IF NOT EXISTS push_reminder_deliveries_household_date_idx
  ON push_reminder_deliveries (household_id, local_date);
