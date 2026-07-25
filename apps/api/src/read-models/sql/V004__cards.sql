-- V004 — credit card infrastructure.
-- Adds statement tracking, installment support, and credit card
-- metadata columns (limit, closing_day, due_day) to accounts.
-- Safe to run on both clean and legacy databases.

-- Credit card metadata on accounts (nullable, only for kind='credit_card')
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS credit_limit_cents BIGINT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS closing_day INTEGER CHECK (closing_day IS NULL OR (closing_day >= 1 AND closing_day <= 31));
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS due_day INTEGER CHECK (due_day IS NULL OR (due_day >= 1 AND due_day <= 31));

-- Installment fields on transactions (nullable, only for card purchases)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS installments_total INTEGER CHECK (installments_total IS NULL OR (installments_total >= 1 AND installments_total <= 48));
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS installment_number INTEGER CHECK (installment_number IS NULL OR (installment_number >= 1 AND installment_number <= 48));

-- Statements — one per credit card per billing cycle
CREATE TABLE IF NOT EXISTS statements (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id     UUID NOT NULL,
    account_id       UUID NOT NULL REFERENCES accounts(id),
    cycle_year_month TEXT NOT NULL,
    closing_date     DATE NOT NULL,
    due_date         DATE NOT NULL,
    total_cents      BIGINT NOT NULL DEFAULT 0,
    paid_cents       BIGINT NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'paid', 'partial', 'overdue', 'cancelled')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link transactions to statements
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS statement_id UUID REFERENCES statements(id);

-- Recurring purchases (credit-card only in V1)
CREATE TABLE IF NOT EXISTS recurring_purchases (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id     UUID NOT NULL,
    account_id       UUID NOT NULL REFERENCES accounts(id),
    description      TEXT NOT NULL,
    amount_cents     BIGINT NOT NULL CHECK (amount_cents > 0),
    frequency        TEXT NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'yearly')),
    start_date       DATE NOT NULL,
    end_date         DATE,
    category_id      UUID REFERENCES categories(id),
    status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS statements_account_cycle_idx ON statements (account_id, cycle_year_month);
CREATE INDEX IF NOT EXISTS statements_household_status_idx ON statements (household_id, status);
CREATE INDEX IF NOT EXISTS transactions_statement_idx ON transactions (statement_id) WHERE statement_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS recurring_account_idx ON recurring_purchases (account_id) WHERE status = 'active';

-- Trigger for statements updated_at
DROP TRIGGER IF EXISTS statements_set_updated_at ON statements;
CREATE TRIGGER statements_set_updated_at
    BEFORE UPDATE ON statements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS recurring_purchases_set_updated_at ON recurring_purchases;
CREATE TRIGGER recurring_purchases_set_updated_at
    BEFORE UPDATE ON recurring_purchases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
