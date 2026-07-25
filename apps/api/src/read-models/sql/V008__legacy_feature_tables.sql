-- V008 — feature tables missing from the legacy pi_financeiro schema.
-- The legacy DB (DB_SCHEMA=legacy) already has accounts_payable, budgets,
-- goals and goal_contributions (via Agent Pi migrations), but never got
-- payable_templates / notification_configs because V005 is skipped in
-- legacy mode. These are purely additive (CREATE TABLE IF NOT EXISTS) and
-- created WITHOUT the updated_at trigger, since the legacy schema does not
-- define the set_updated_at() function (it lives in V001, skipped in legacy).
-- Safe to run on clean databases too: V005 already created them, so the
-- IF NOT EXISTS guards make this a no-op there.

CREATE TABLE IF NOT EXISTS payable_templates (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id          UUID NOT NULL,
    account_id            UUID NOT NULL REFERENCES accounts(id),
    name                  TEXT NOT NULL,
    description           TEXT NOT NULL,
    amount_cents          BIGINT NOT NULL CHECK (amount_cents > 0),
    frequency             TEXT NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'yearly')),
    day_of_month          INTEGER NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 31),
    reminder_days_before  INTEGER DEFAULT 0,
    notes                 TEXT,
    active                BOOLEAN NOT NULL DEFAULT true,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS templates_household_active_idx ON payable_templates (household_id) WHERE active = true;

CREATE TABLE IF NOT EXISTS notification_configs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id        UUID NOT NULL,
    chat_id             TEXT NOT NULL,
    notification_type   TEXT NOT NULL CHECK (notification_type IN ('overdue_reminder', 'due_today_reminder', 'upcoming_reminder', 'daily_summary', 'weekly_summary')),
    enabled             BOOLEAN NOT NULL DEFAULT true,
    schedule_hour       INTEGER DEFAULT 9,
    schedule_minute     INTEGER DEFAULT 0,
    days_of_week        INTEGER[] DEFAULT '{1,2,3,4,5}',
    threshold_days      INTEGER DEFAULT 1,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (household_id, chat_id, notification_type)
);

CREATE INDEX IF NOT EXISTS notification_household_chat_idx ON notification_configs (household_id, chat_id);
