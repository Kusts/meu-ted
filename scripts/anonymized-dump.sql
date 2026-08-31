--
-- Anonymized production snapshot for G0.4.6 migration rehearsal.
-- Contains schema DDL (from V001–V014) + synthetic seed data.
-- No real personal or financial data — everything is fabricated.
--

-- ============================================================
-- Test marker (satisfies requireTestDatabase guard)
-- ============================================================
CREATE TABLE IF NOT EXISTS _test_marker (
    marker_value TEXT PRIMARY KEY
);
INSERT INTO _test_marker (marker_value)
VALUES ('pi-finance-migration-rehearsal-2026-07-30')
ON CONFLICT (marker_value) DO NOTHING;

-- ============================================================
-- Schema: accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID NOT NULL,
    name            TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    kind            TEXT NOT NULL CHECK (kind IN ('bank', 'cash', 'credit_card')),
    balance_cents   BIGINT NOT NULL CHECK (balance_cents >= 0),
    credit_limit_cents BIGINT,
    closing_day     INTEGER CHECK (closing_day IS NULL OR (closing_day >= 1 AND closing_day <= 31)),
    due_day         INTEGER CHECK (due_day IS NULL OR (due_day >= 1 AND due_day <= 31)),
    status          TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS accounts_household_status_idx
    ON accounts (household_id, status) WHERE deleted_at IS NULL;

-- ============================================================
-- Schema: categories
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID NOT NULL,
    name            TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    kind            TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
    parent_id       UUID REFERENCES categories(id),
    status          TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS categories_household_status_idx
    ON categories (household_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS categories_parent_id_idx
    ON categories (parent_id) WHERE parent_id IS NOT NULL;

-- ============================================================
-- Schema: transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id             UUID NOT NULL,
    kind                     TEXT NOT NULL CHECK (kind IN ('expense', 'income', 'transfer')),
    description              TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 240),
    amount_cents             BIGINT NOT NULL CHECK (amount_cents > 0),
    date                     DATE NOT NULL,
    account_id               UUID NOT NULL,
    category_id              UUID,
    transfer_to_account_id   UUID,
    statement_id             UUID,
    installments_total       INTEGER CHECK (installments_total IS NULL OR (installments_total >= 1 AND installments_total <= 48)),
    installment_number       INTEGER CHECK (installment_number IS NULL OR (installment_number >= 1 AND installment_number <= 48)),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at               TIMESTAMPTZ,
    CONSTRAINT transactions_category_consistency_chk
        CHECK ((kind = 'transfer' AND category_id IS NULL) OR (kind <> 'transfer')),
    CONSTRAINT transactions_transfer_to_account_chk
        CHECK ((kind = 'transfer' AND transfer_to_account_id IS NOT NULL AND transfer_to_account_id <> account_id) OR (kind <> 'transfer' AND transfer_to_account_id IS NULL))
);
CREATE INDEX IF NOT EXISTS transactions_household_date_idx
    ON transactions (household_id, date DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS transactions_household_account_idx
    ON transactions (household_id, account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS transactions_household_category_idx
    ON transactions (household_id, category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS transactions_household_kind_idx
    ON transactions (household_id, kind) WHERE deleted_at IS NULL;

-- ============================================================
-- Schema: device_tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS device_tokens (
    token          TEXT PRIMARY KEY,
    device_id      TEXT NOT NULL,
    household_id   UUID NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS device_tokens_household_idx
    ON device_tokens (household_id) WHERE revoked_at IS NULL;

-- ============================================================
-- Schema: idempotency_keys
-- ============================================================
CREATE TABLE IF NOT EXISTS idempotency_keys (
    household_id   UUID NOT NULL,
    key            TEXT NOT NULL,
    payload_hash   TEXT NOT NULL,
    response       JSONB NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (household_id, key)
);
CREATE INDEX IF NOT EXISTS idempotency_keys_created_at_idx
    ON idempotency_keys (created_at);

-- ============================================================
-- Schema: statements, recurring_purchases (V004)
-- ============================================================
CREATE TABLE IF NOT EXISTS statements (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id     UUID NOT NULL,
    account_id       UUID NOT NULL REFERENCES accounts(id),
    cycle_year_month TEXT NOT NULL,
    closing_date     DATE NOT NULL,
    due_date         DATE NOT NULL,
    total_cents      BIGINT NOT NULL DEFAULT 0,
    paid_cents       BIGINT NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','paid','partial','overdue','cancelled')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS statements_account_cycle_idx ON statements (account_id, cycle_year_month);
CREATE INDEX IF NOT EXISTS statements_household_status_idx ON statements (household_id, status);

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
CREATE INDEX IF NOT EXISTS recurring_account_idx ON recurring_purchases (account_id) WHERE status = 'active';

-- ============================================================
-- Schema: accounts_payable, payable_templates, notification_configs (V005)
-- ============================================================
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
    paid_transaction_id   UUID,
    reminder_days_before  INTEGER DEFAULT 0,
    notes                 TEXT,
    category_id           UUID REFERENCES categories(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS payables_household_status_idx ON accounts_payable (household_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS payables_due_idx ON accounts_payable (household_id, due_date) WHERE status = 'pending' AND deleted_at IS NULL;

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
    notification_type   TEXT NOT NULL CHECK (notification_type IN ('overdue_reminder','due_today_reminder','upcoming_reminder','daily_summary','weekly_summary','card_closing_soon','limit_alert')),
    enabled             BOOLEAN NOT NULL DEFAULT true,
    schedule_hour       INTEGER DEFAULT 9,
    schedule_minute     INTEGER DEFAULT 0,
    days_of_week        INTEGER[] DEFAULT '{1,2,3,4,5}',
    threshold_days      INTEGER DEFAULT 1,
    threshold_percent   INTEGER,
    grouping_enabled    BOOLEAN DEFAULT false,
    grouping_max_items  INTEGER DEFAULT 10,
    grouping_window_minutes INTEGER DEFAULT 60,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (household_id, chat_id, notification_type)
);
CREATE INDEX IF NOT EXISTS notification_household_chat_idx ON notification_configs (household_id, chat_id);

-- ============================================================
-- Schema: budgets (V006)
-- ============================================================
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

-- ============================================================
-- Schema: goals, goal_contributions (V007)
-- ============================================================
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

-- ============================================================
-- Schema: subscriptions (V009)
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID NOT NULL,
    name            TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    amount_cents    BIGINT NOT NULL CHECK (amount_cents > 0),
    cycle           TEXT NOT NULL CHECK (cycle IN ('monthly', 'yearly', 'weekly')),
    day             INTEGER NOT NULL CHECK (day >= 1 AND day <= 31),
    payment_method  TEXT NOT NULL CHECK (length(payment_method) BETWEEN 1 AND 60),
    status          TEXT NOT NULL CHECK (status IN ('active', 'cancelled')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at    TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS subscriptions_household_active_idx ON subscriptions (household_id) WHERE status = 'active' AND deleted_at IS NULL;

-- ============================================================
-- Schema: profiles (V010-V011)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
    household_id    UUID PRIMARY KEY,
    name            TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    email           TEXT NOT NULL DEFAULT '' CHECK (length(email) <= 120),
    phone           TEXT NOT NULL DEFAULT '' CHECK (length(phone) <= 40),
    avatar_color    TEXT NOT NULL CHECK (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
    greeting_style  TEXT NOT NULL CHECK (greeting_style IN ('auto', 'minimal', 'verbose')),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Schema: operation_records + audit_logs (V013-V014)
-- ============================================================
CREATE TABLE IF NOT EXISTS operation_records (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID NOT NULL,
    actor_id         TEXT NOT NULL,
    operation        TEXT NOT NULL,
    idempotency_key  TEXT NOT NULL,
    payload_hash     TEXT NOT NULL,
    status           TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
    response         JSONB,
    effect_ref       TEXT,
    lease_until      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes',
    retry_until      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    retention_until  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '90 days',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ,
    UNIQUE (workspace_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS operation_records_created_at_idx ON operation_records (created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_record_id UUID NOT NULL REFERENCES operation_records(id),
    workspace_id       UUID NOT NULL,
    actor_id           TEXT NOT NULL,
    operation          TEXT NOT NULL,
    event_type         TEXT NOT NULL,
    payload_hash       TEXT NOT NULL,
    effect_ref         TEXT,
    metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_operation_record_idx ON audit_logs (operation_record_id);
CREATE INDEX IF NOT EXISTS audit_logs_workspace_created_idx ON audit_logs (workspace_id, created_at);

-- ============================================================
-- Updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Synthetic anonymized seed data
-- ============================================================
DO $$
DECLARE
    hh_id UUID := '550e8400-e29b-41d4-a716-446655440000';
    acc_bank_id UUID;
    acc_cash_id UUID;
    acc_card_id UUID;
    cat_alimentacao UUID;
    cat_transporte UUID;
    cat_moradia UUID;
    cat_saude UUID;
    cat_lazer UUID;
    cat_salario UUID;
    cat_freela UUID;
BEGIN
    -- Accounts
    INSERT INTO accounts (id, household_id, name, kind, balance_cents, status)
    VALUES (gen_random_uuid(), hh_id, 'Conta Corrente',   'bank', 158000, 'active')
    RETURNING id INTO acc_bank_id;

    INSERT INTO accounts (id, household_id, name, kind, balance_cents, status)
    VALUES (gen_random_uuid(), hh_id, 'Carteira',         'cash', 32000, 'active')
    RETURNING id INTO acc_cash_id;

    INSERT INTO accounts (id, household_id, name, kind, balance_cents, credit_limit_cents, closing_day, due_day, status)
    VALUES (gen_random_uuid(), hh_id, 'Cartão Black',     'credit_card', 75000, 500000, 15, 22, 'active')
    RETURNING id INTO acc_card_id;

    -- Income categories
    INSERT INTO categories (id, household_id, name, kind, status)
    VALUES (gen_random_uuid(), hh_id, 'Salário', 'income', 'active')
    RETURNING id INTO cat_salario;

    INSERT INTO categories (id, household_id, name, kind, status)
    VALUES (gen_random_uuid(), hh_id, 'Freelance', 'income', 'active')
    RETURNING id INTO cat_freela;

    -- Expense categories
    INSERT INTO categories (id, household_id, name, kind, status)
    VALUES (gen_random_uuid(), hh_id, 'Alimentação', 'expense', 'active')
    RETURNING id INTO cat_alimentacao;

    INSERT INTO categories (id, household_id, name, kind, status)
    VALUES (gen_random_uuid(), hh_id, 'Transporte', 'expense', 'active')
    RETURNING id INTO cat_transporte;

    INSERT INTO categories (id, household_id, name, kind, status)
    VALUES (gen_random_uuid(), hh_id, 'Moradia', 'expense', 'active')
    RETURNING id INTO cat_moradia;

    INSERT INTO categories (id, household_id, name, kind, status)
    VALUES (gen_random_uuid(), hh_id, 'Saúde', 'expense', 'active')
    RETURNING id INTO cat_saude;

    INSERT INTO categories (id, household_id, name, kind, status)
    VALUES (gen_random_uuid(), hh_id, 'Lazer', 'expense', 'active')
    RETURNING id INTO cat_lazer;

    -- Subcategories
    INSERT INTO categories (id, household_id, name, kind, parent_id, status)
    VALUES (gen_random_uuid(), hh_id, 'Supermercado',  'expense', cat_alimentacao, 'active');
    INSERT INTO categories (id, household_id, name, kind, parent_id, status)
    VALUES (gen_random_uuid(), hh_id, 'Restaurante',   'expense', cat_alimentacao, 'active');
    INSERT INTO categories (id, household_id, name, kind, parent_id, status)
    VALUES (gen_random_uuid(), hh_id, 'Gasolina',      'expense', cat_transporte, 'active');
    INSERT INTO categories (id, household_id, name, kind, parent_id, status)
    VALUES (gen_random_uuid(), hh_id, 'Uber',           'expense', cat_transporte, 'active');
    INSERT INTO categories (id, household_id, name, kind, parent_id, status)
    VALUES (gen_random_uuid(), hh_id, 'Aluguel',       'expense', cat_moradia, 'active');
    INSERT INTO categories (id, household_id, name, kind, parent_id, status)
    VALUES (gen_random_uuid(), hh_id, 'Condomínio',    'expense', cat_moradia, 'active');

    -- Anonymized transactions (recent 3 months)
    INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, category_id)
    VALUES (hh_id, 'income',  'Salário jul/2026',    420000, '2026-07-05', acc_bank_id, cat_salario);
    INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, category_id)
    VALUES (hh_id, 'income',  'Projeto site',         150000, '2026-07-12', acc_bank_id, cat_freela);
    INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, category_id)
    VALUES (hh_id, 'expense', 'Supermercado Extra',    28750, '2026-07-06', acc_bank_id, cat_alimentacao);
    INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, category_id)
    VALUES (hh_id, 'expense', 'Aluguel jul/2026',      180000,'2026-07-01', acc_bank_id, cat_moradia);
    INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, category_id)
    VALUES (hh_id, 'expense', 'Condomínio jul/2026',    42500, '2026-07-05', acc_bank_id, cat_moradia);
    INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, category_id)
    VALUES (hh_id, 'expense', 'Gasolina posto BR',     18500, '2026-07-08', acc_cash_id, cat_transporte);
    INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, category_id)
    VALUES (hh_id, 'expense', 'Uber para consulta',     3240, '2026-07-10', acc_bank_id, cat_transporte);
    INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, category_id)
    VALUES (hh_id, 'expense', 'Farmácia',              12200, '2026-07-15', acc_bank_id, cat_saude);
    INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, category_id)
    VALUES (hh_id, 'expense', 'Cinema',                 4200, '2026-07-20', acc_cash_id, cat_lazer);
    INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, category_id)
    VALUES (hh_id, 'expense', 'Restaurante Japonês',   15800, '2026-07-22', acc_bank_id, cat_alimentacao);
    -- Transfer between own accounts
    INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, transfer_to_account_id)
    VALUES (hh_id, 'transfer', 'Poupança programada',   50000, '2026-07-15', acc_bank_id, acc_cash_id);

    -- Previous month
    INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, category_id)
    VALUES (hh_id, 'income',  'Salário jun/2026',      420000, '2026-06-05', acc_bank_id, cat_salario);
    INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, category_id)
    VALUES (hh_id, 'expense', 'Supermercado Assaí',    31200, '2026-06-08', acc_bank_id, cat_alimentacao);
    INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, category_id)
    VALUES (hh_id, 'expense', 'Aluguel jun/2026',      180000,'2026-06-01', acc_bank_id, cat_moradia);
    INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, category_id)
    VALUES (hh_id, 'expense', 'Condomínio jun/2026',    42500, '2026-06-05', acc_bank_id, cat_moradia);
    INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, category_id)
    VALUES (hh_id, 'expense', 'Gasolina Shell',         18200, '2026-06-12', acc_cash_id, cat_transporte);

    -- Accounts payable
    INSERT INTO accounts_payable (household_id, account_id, description, amount_cents, due_date, type, status)
    VALUES (hh_id, acc_bank_id, 'Internet fibra',      12990, '2026-08-10', 'one_time', 'pending');
    INSERT INTO accounts_payable (household_id, account_id, description, amount_cents, due_date, type, status)
    VALUES (hh_id, acc_bank_id, 'Plano saúde',         18900, '2026-08-15', 'one_time', 'pending');

    -- Payable templates
    INSERT INTO payable_templates (household_id, account_id, name, description, amount_cents, frequency, day_of_month)
    VALUES (hh_id, acc_bank_id, 'Aluguel', 'Aluguel apartamento', 180000, 'monthly', 1);
    INSERT INTO payable_templates (household_id, account_id, name, description, amount_cents, frequency, day_of_month)
    VALUES (hh_id, acc_bank_id, 'Condomínio', 'Condomínio edifício', 42500, 'monthly', 5);
    INSERT INTO payable_templates (household_id, account_id, name, description, amount_cents, frequency, day_of_month)
    VALUES (hh_id, acc_bank_id, 'Internet', 'Internet fibra ótica', 12990, 'monthly', 10);

    -- Device tokens
    INSERT INTO device_tokens (token, device_id, household_id)
    VALUES ('anon-device-token-001', 'anon-device-001', hh_id);

    -- Profile
    INSERT INTO profiles (household_id, name, email, phone, avatar_color, greeting_style)
    VALUES (hh_id, 'Usuário Teste', 'teste@exemplo.com', '+5511999999999', '#3498db', 'auto');

    -- Budgets
    INSERT INTO budgets (household_id, category_id, name, amount_cents, period, start_date, alert_threshold)
    VALUES (hh_id, cat_alimentacao, 'Compras mês', 120000, 'monthly', '2026-07-01', 80);
    INSERT INTO budgets (household_id, category_id, name, amount_cents, period, start_date, alert_threshold)
    VALUES (hh_id, cat_transporte, 'Transporte mês', 40000, 'monthly', '2026-07-01', 80);

    -- Goals
    INSERT INTO goals (household_id, name, goal_type, target_amount_cents, current_amount_cents, start_date, target_date, status)
    VALUES (hh_id, 'Reserva emergência', 'emergency_fund', 600000, 150000, '2026-01-01', '2026-12-31', 'active');
    INSERT INTO goals (household_id, name, goal_type, target_amount_cents, current_amount_cents, start_date, target_date, status)
    VALUES (hh_id, 'Viagem férias', 'savings', 300000, 80000, '2026-03-01', '2027-01-31', 'active');

    -- Subscriptions
    INSERT INTO subscriptions (household_id, name, amount_cents, cycle, day, payment_method, status)
    VALUES (hh_id, 'Netflix', 5590, 'monthly', 15, 'credit_card', 'active');
    INSERT INTO subscriptions (household_id, name, amount_cents, cycle, day, payment_method, status)
    VALUES (hh_id, 'Spotify', 2190, 'monthly', 10, 'credit_card', 'active');
    INSERT INTO subscriptions (household_id, name, amount_cents, cycle, day, payment_method, status)
    VALUES (hh_id, 'iCloud 200GB', 990, 'monthly', 25, 'credit_card', 'active');

    -- Notification configs
    INSERT INTO notification_configs (household_id, chat_id, notification_type, enabled, schedule_hour, schedule_minute)
    VALUES (hh_id, '556199999999@c.us', 'daily_summary', true, 8, 0);
    INSERT INTO notification_configs (household_id, chat_id, notification_type, enabled, schedule_hour, schedule_minute, days_of_week)
    VALUES (hh_id, '556199999999@c.us', 'overdue_reminder', true, 9, 0, '{1,2,3,4,5}');

END $$;
