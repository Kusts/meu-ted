-- V007 — goals (financial goals with manual contributions).
CREATE TABLE IF NOT EXISTS goals (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id          UUID NOT NULL,
    name                  TEXT NOT NULL,
    description           TEXT,
    goal_type             TEXT NOT NULL CHECK (goal_type IN ('savings','purchase','debt_payoff','emergency_fund')),
    target_amount_cents   BIGINT NOT NULL CHECK (target_amount_cents > 0),
    current_amount_cents  BIGINT NOT NULL DEFAULT 0,
    start_date            DATE NOT NULL,
    target_date           DATE,
    category_id           UUID REFERENCES categories(id),
    account_id            UUID REFERENCES accounts(id),
    status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','achieved','cancelled','failed')),
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS goals_household_status_idx ON goals (household_id, status);

CREATE TABLE IF NOT EXISTS goal_contributions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id             UUID NOT NULL REFERENCES goals(id),
    amount_cents        BIGINT NOT NULL CHECK (amount_cents > 0),
    contribution_date   DATE NOT NULL,
    source              TEXT,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS goal_contributions_goal_idx ON goal_contributions (goal_id);

DROP TRIGGER IF EXISTS goals_set_updated_at ON goals;
CREATE TRIGGER goals_set_updated_at BEFORE UPDATE ON goals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
