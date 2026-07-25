-- V006 — budgets (spending limits per category/period).
CREATE TABLE IF NOT EXISTS budgets (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id     UUID NOT NULL,
    category_id      UUID NOT NULL REFERENCES categories(id),
    name             TEXT NOT NULL,
    amount_cents     BIGINT NOT NULL CHECK (amount_cents > 0),
    period           TEXT NOT NULL CHECK (period IN ('monthly', 'quarterly', 'yearly')),
    start_date       DATE NOT NULL,
    end_date         DATE,
    alert_threshold  INTEGER NOT NULL DEFAULT 80 CHECK (alert_threshold >= 1 AND alert_threshold <= 100),
    rollover         BOOLEAN NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS budgets_household_idx ON budgets (household_id);
DROP TRIGGER IF EXISTS budgets_set_updated_at ON budgets;
CREATE TRIGGER budgets_set_updated_at BEFORE UPDATE ON budgets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
