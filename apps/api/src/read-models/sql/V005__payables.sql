-- V005 — accounts payable, templates, and notification configs.
-- Safe to run on both clean and legacy databases.

-- Accounts payable --------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts_payable (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id          UUID NOT NULL,
    account_id            UUID NOT NULL REFERENCES accounts(id),
    description           TEXT NOT NULL,
    amount_cents          BIGINT NOT NULL CHECK (amount_cents > 0),
    due_date              DATE NOT NULL,
    type                  TEXT NOT NULL DEFAULT 'one_time' CHECK (type IN ('one_time', 'recurring')),
    frequency             TEXT CHECK (frequency IN ('monthly', 'quarterly', 'yearly')),
    end_date              DATE,
    status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
    paid_date             DATE,
    paid_amount_cents     BIGINT,
    reminder_days_before  INTEGER DEFAULT 0,
    notes                 TEXT,
    category_id           UUID REFERENCES categories(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS payables_household_status_idx ON accounts_payable (household_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS payables_due_idx ON accounts_payable (household_id, due_date) WHERE status = 'pending' AND deleted_at IS NULL;

-- Payable templates -------------------------------------------------
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

-- Notification configs ----------------------------------------------
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

-- Triggers ----------------------------------------------------------
DROP TRIGGER IF EXISTS payables_set_updated_at ON accounts_payable;
CREATE TRIGGER payables_set_updated_at BEFORE UPDATE ON accounts_payable FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS templates_set_updated_at ON payable_templates;
CREATE TRIGGER templates_set_updated_at BEFORE UPDATE ON payable_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS notif_configs_set_updated_at ON notification_configs;
CREATE TRIGGER notif_configs_set_updated_at BEFORE UPDATE ON notification_configs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
